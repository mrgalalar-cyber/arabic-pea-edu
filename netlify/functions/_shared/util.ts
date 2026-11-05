import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`متغير البيئة ${name} غير مضبوط`);
  return v;
}

let _admin: SupabaseClient | null = null;
/** عميل بصلاحية الخدمة — للخادم فقط، يتجاوز RLS. لا تُرجع منه بيانات إلا بعد التحقق من الهوية. */
export function admin(): SupabaseClient {
  if (!_admin) _admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  return _admin;
}

export function anon(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
}

export function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

export async function readBody(req: Request): Promise<any> {
  if (req.method !== "POST") throw new HttpError(405, "الطريقة غير مسموحة");
  try { return await req.json(); } catch { throw new HttpError(400, "طلب غير صالح"); }
}

export function clientIp(req: Request): string {
  return req.headers.get("x-nf-client-connection-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** التحقق من توكن Supabase في ترويسة Authorization (يُتحقق منه لدى Supabase لا محليًا) */
export async function getUser(req: Request): Promise<User | null> {
  const h = req.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;
  const { data, error } = await admin().auth.getUser(token);
  return error ? null : data.user;
}

/** هل المستخدم يملك هوية Google فقط (لا هوية بريد/كلمة مرور)؟ */
export function googleOnly(u: User): boolean {
  const ids = u.identities ?? [];
  return ids.some((i) => i.provider === "google") && !ids.some((i) => i.provider === "email");
}

export function isOwnerUser(u: User | null): boolean {
  if (!u) return false;
  const owner = env("OWNER_EMAIL").trim().toLowerCase();
  const verified = u.user_metadata?.email_verified === true || !!u.email_confirmed_at;
  return !!u.email && u.email.toLowerCase() === owner && verified && googleOnly(u);
}

export type Role = "owner" | "teacher" | "student" | "none";
export interface Me { role: Role; teacherId?: string; studentId?: string; classId?: string; email?: string | null; name?: string | null }

/** تحديد دور المستخدم من قاعدة البيانات (المصدر الموثوق). المالك يُنشأ له صف معلم عند أول دخول. */
export async function resolveMe(u: User): Promise<Me> {
  const db = admin();
  if (isOwnerUser(u)) {
    let { data: t } = await db.from("teachers").select("id").eq("auth_user_id", u.id).maybeSingle();
    if (!t) {
      const ins = await db.from("teachers").insert({
        auth_user_id: u.id, email: u.email, is_primary: true,
        display_name: u.user_metadata?.full_name ?? null,
      }).select("id").single();
      if (ins.error) throw new HttpError(500, "تعذر تهيئة حساب المالك");
      t = ins.data;
    }
    return { role: "owner", teacherId: t.id, email: u.email, name: u.user_metadata?.full_name ?? null };
  }
  const { data: t } = await db.from("teachers").select("id,status,archived_at,display_name").eq("auth_user_id", u.id).maybeSingle();
  if (t && t.status === "active" && !t.archived_at && googleOnly(u))
    return { role: "teacher", teacherId: t.id, email: u.email, name: t.display_name ?? u.user_metadata?.full_name ?? null };
  const { data: s } = await db.from("students").select("id,class_id,full_name,status,blocked_until,archived_at").eq("auth_user_id", u.id).maybeSingle();
  if (s && !s.archived_at) return { role: "student", studentId: s.id, classId: s.class_id, email: u.email, name: s.full_name };
  return { role: "none", email: u.email };
}

export async function requireStaff(req: Request): Promise<{ user: User; me: Me }> {
  const user = await getUser(req);
  if (!user) throw new HttpError(401, "يلزم تسجيل الدخول");
  const me = await resolveMe(user);
  if (me.role !== "owner" && me.role !== "teacher") throw new HttpError(403, "هذه العملية للمعلمين فقط");
  return { user, me };
}

export async function requireOwner(req: Request): Promise<User> {
  const u = await getUser(req);
  if (!u) throw new HttpError(401, "يلزم تسجيل الدخول");
  if (!isOwnerUser(u)) throw new HttpError(403, "هذه العملية للمالك فقط");
  return u;
}

/** عميل بهوية المستخدم نفسه: كل استعلام يمر عبر RLS، فيصلح للتحقق من ملكية فصل أو نشاط. */
export function userClient(req: Request): SupabaseClient {
  const token = (req.headers.get("authorization") ?? "").slice(7);
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/** يتأكد أن المستخدم (مالك أو معلم) يملك الفصل — عبر RLS لا عبر مقارنة يدوية. */
export async function assertOwnsClass(req: Request, classId: string) {
  if (!classId) throw new HttpError(400, "الفصل مطلوب");
  const { data } = await userClient(req).from("classes").select("id").eq("id", classId).maybeSingle();
  if (!data) throw new HttpError(403, "هذا الفصل ليس من فصولك");
}

export async function rateLimit(key: string, max: number, windowSec: number) {
  const { data, error } = await admin().rpc("rl_hit", { p_key: key, p_max: max, p_window: `${windowSec} seconds` });
  if (error) throw new HttpError(500, "تعذر فحص الحد");
  if (data === false) throw new HttpError(429, "محاولات كثيرة، حاول لاحقًا");
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // بلا حروف ملتبسة (O/0, I/1/L)
export function randomCode(len: number): string {
  const b = randomBytes(len);
  let s = ""; for (let i = 0; i < len; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return s;
}
/** رمز دخول الطالب: 12 رمزًا بصيغة XXXX-XXXX-XXXX (~59 بت) */
export function newStudentCode(): string { const c = randomCode(12); return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`; }
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const codeHash = (code: string) => sha256("student-code:" + normalizeCode(code));

export function wrap(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try { return await fn(req); }
    catch (e: any) {
      if (e instanceof HttpError) return json(e.status, { error: e.message });
      console.error(e);
      return json(500, { error: "حدث خطأ غير متوقع" });
    }
  };
}
