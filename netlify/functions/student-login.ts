// /api/student-login — دخول الطالب برمزه الثابت. يُرجع جلسة Supabase عادية (RLS تحكم بعدها).
import { admin, anon, clientIp, codeHash, HttpError, json, normalizeCode, rateLimit, readBody, wrap } from "./_shared/util";

export default wrap(async (req) => {
  const body = await readBody(req);
  const ip = clientIp(req);
  await rateLimit(`slogin:${ip}`, 15, 600);          // حدّ لكل عنوان
  const code = normalizeCode(String(body.code ?? ""));
  if (code.length !== 12) throw new HttpError(400, "الرمز غير صحيح");
  await rateLimit(`slogin-code:${codeHash(code)}`, 8, 600);

  const { data: st } = await admin().from("students").select("id,auth_user_id,status,blocked_until,archived_at")
    .eq("code_hash", codeHash(code)).maybeSingle();
  if (!st || !st.auth_user_id || st.archived_at) throw new HttpError(401, "الرمز غير صحيح");
  if (st.status !== "active") throw new HttpError(403, "الحساب موقوف، تواصل مع معلمك");
  if (st.blocked_until && new Date(st.blocked_until) > new Date()) throw new HttpError(403, "الحساب محظور مؤقتًا، تواصل مع معلمك");

  const { data, error } = await anon().auth.signInWithPassword({ email: `student-${st.id}@students.invalid`, password: code });
  if (error || !data.session) throw new HttpError(401, "الرمز غير صحيح");
  await admin().from("students").update({ last_seen_at: new Date().toISOString() }).eq("id", st.id);
  return json(200, { access_token: data.session.access_token, refresh_token: data.session.refresh_token });
});
