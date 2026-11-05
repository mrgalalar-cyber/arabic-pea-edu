// /api/join — طلبات الانضمام (عامة بحدّ محاولات). لا تُرجع بيانات إلا ما يلزم لاختيار الملف.
import { admin, clientIp, getUser, HttpError, json, rateLimit, randomCode, readBody, resolveMe, sha256, wrap } from "./_shared/util";

async function classByCode(code: string) {
  const norm = String(code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (norm.length < 6) throw new HttpError(400, "رمز الفصل غير صحيح");
  const { data } = await admin().from("classes").select("id,name,grade").eq("join_code", norm).is("archived_at", null).maybeSingle();
  if (!data) throw new HttpError(404, "لم نجد فصلًا بهذا الرمز");
  return data;
}

export default wrap(async (req) => {
  const body = await readBody(req);
  const ip = clientIp(req);
  const db = admin();

  if (body.action === "classInfo") {
    await rateLimit(`classinfo:${ip}`, 30, 600);
    const cls = await classByCode(body.joinCode);
    const { data: students } = await db.from("students").select("id,full_name")
      .eq("class_id", cls.id).is("archived_at", null).is("auth_user_id", null).order("full_name");
    return json(200, { classId: cls.id, name: cls.name, grade: cls.grade, students: students ?? [] });
  }

  if (body.action === "submit") {
    await rateLimit(`joinsubmit:${ip}`, 10, 600);
    const cls = await classByCode(body.joinCode);
    const mode = body.mode === "google" ? "google" : "code";
    let authUserId: string | null = null, email: string | null = null;
    if (mode === "google") {
      const u = await getUser(req);
      if (!u) throw new HttpError(401, "سجّل الدخول بحساب Google أولًا");
      const me = await resolveMe(u);
      if (me.role !== "none") throw new HttpError(409, me.role === "student" ? "حسابك مرتبط بطالب بالفعل" : "هذا حساب معلم ولا يصلح كحساب طالب");
      authUserId = u.id; email = u.email ?? null;
      const { data: dup } = await db.from("join_requests").select("id").eq("auth_user_id", u.id).eq("status", "pending").maybeSingle();
      if (dup) throw new HttpError(409, "لديك طلب انضمام قيد الانتظار");
    }

    let studentId: string | null = null, name = String(body.name ?? "").trim().slice(0, 80);
    if (body.studentId) {
      const { data: st } = await db.from("students").select("id,full_name,auth_user_id,archived_at")
        .eq("id", body.studentId).eq("class_id", cls.id).maybeSingle();
      if (!st || st.archived_at || st.auth_user_id) throw new HttpError(400, "هذا الملف غير متاح للاختيار");
      studentId = st.id; name = st.full_name;
      const { data: dup } = await db.from("join_requests").select("id").eq("student_id", st.id).eq("status", "pending").maybeSingle();
      if (dup) throw new HttpError(409, "يوجد طلب قيد الانتظار لهذا الملف");
    }
    if (name.length < 2) throw new HttpError(400, "اكتب اسمك (حرفان على الأقل)");

    const track = randomCode(20);
    const { data, error } = await db.from("join_requests").insert({
      class_id: cls.id, student_id: studentId, requested_name: name,
      auth_user_id: authUserId, email, token_hash: sha256("track:" + track),
    }).select("id").single();
    if (error) throw new HttpError(500, "تعذر تسجيل الطلب");
    return json(200, { requestId: data.id, trackToken: track, className: cls.name });
  }

  if (body.action === "status") {
    await rateLimit(`joinstatus:${ip}`, 120, 600);
    let q = db.from("join_requests").select("id,status,issued_code,requested_name,auth_user_id").order("created_at", { ascending: false }).limit(1);
    if (body.trackToken) q = q.eq("token_hash", sha256("track:" + String(body.trackToken)));
    else {
      const u = await getUser(req);
      if (!u) throw new HttpError(401, "يلزم تسجيل الدخول");
      q = q.eq("auth_user_id", u.id);
    }
    const { data } = await q.maybeSingle();
    if (!data) return json(200, { status: "none" });
    let code: string | null = null;
    if (data.status === "approved" && data.issued_code) {
      code = data.issued_code;
      await db.from("join_requests").update({ issued_code: null }).eq("id", data.id); // يُسلَّم مرة واحدة
    }
    return json(200, { status: data.status, code, name: data.requested_name });
  }

  throw new HttpError(400, "إجراء غير معروف");
});
