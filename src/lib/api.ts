import { supabase } from "./supabase";

export class ApiError extends Error { constructor(public status: number, msg: string) { super(msg); } }

/** استدعاء وظيفة Netlify مع توكن الجلسة. الوظيفة تتحقق من الهوية والدور في الخادم. */
export async function api<T = any>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (data.session) headers.authorization = `Bearer ${data.session.access_token}`;
  let res: Response;
  try { res = await fetch(`/api/${fn}`, { method: "POST", headers, body: JSON.stringify(body) }); }
  catch { throw new ApiError(0, "تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى."); }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.error ?? "حدث خطأ غير متوقع");
  return json as T;
}
