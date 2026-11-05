// /api/auth — تحديد الدور وقبول دعوات المعلمين
import { admin, getUser, googleOnly, HttpError, json, rateLimit, readBody, resolveMe, sha256, clientIp, wrap } from "./_shared/util";

export default wrap(async (req) => {
  const body = await readBody(req);
  const user = await getUser(req);
  if (!user) throw new HttpError(401, "يلزم تسجيل الدخول");

  if (body.action === "me") {
    return json(200, await resolveMe(user));
  }

  if (body.action === "redeemInvite") {
    await rateLimit(`invite:${clientIp(req)}`, 10, 600);
    const token = String(body.token ?? "").trim();
    if (token.length < 20) throw new HttpError(400, "رابط الدعوة غير صالح");
    if (!googleOnly(user) || !user.email || !(user.user_metadata?.email_verified === true || user.email_confirmed_at))
      throw new HttpError(403, "قبول الدعوة يتطلب الدخول بحساب Google موثّق");

    const me = await resolveMe(user);
    if (me.role === "owner" || me.role === "teacher") return json(200, { ok: true, already: true, role: me.role });
    if (me.role === "student") throw new HttpError(409, "هذا الحساب مرتبط بملف طالب، استخدم حساب Google آخر للمعلم");

    const db = admin();
    const { data: inv } = await db.from("teacher_invites").select("*").eq("token_hash", sha256("invite:" + token)).maybeSingle();
    if (!inv || inv.revoked_at || inv.used_at || new Date(inv.expires_at) < new Date())
      throw new HttpError(410, "الدعوة منتهية أو مستخدمة أو ملغاة. اطلب رابطًا جديدًا من المالك");
    if (inv.email && inv.email.toLowerCase() !== user.email.toLowerCase())
      throw new HttpError(403, "هذه الدعوة مخصصة لبريد Google آخر");

    // استهلاك الدعوة ذريًا: ينجح تحديث واحد فقط حتى مع طلبين متزامنين
    const claim = await db.from("teacher_invites").update({ used_at: new Date().toISOString(), used_by: user.id })
      .eq("id", inv.id).is("used_at", null).is("revoked_at", null).select("id");
    if (claim.error || !claim.data?.length) throw new HttpError(410, "الدعوة لم تعد متاحة");

    const ins = await db.from("teachers").insert({
      auth_user_id: user.id, email: user.email, invited_by: inv.created_by,
      display_name: user.user_metadata?.full_name ?? null,
    });
    if (ins.error) {
      await db.from("teacher_invites").update({ used_at: null, used_by: null }).eq("id", inv.id);
      throw new HttpError(500, "تعذر إنشاء حساب المعلم");
    }
    await db.from("audit_log").insert({ action: "teacher.joined", entity: "teacher_invites", entity_id: inv.id, details: { email: user.email } });
    return json(200, { ok: true, role: "teacher" });
  }

  throw new HttpError(400, "إجراء غير معروف");
});
