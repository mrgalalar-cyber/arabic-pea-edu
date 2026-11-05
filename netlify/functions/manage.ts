// /api/manage — عمليات المعلم/المالك التي تحتاج صلاحية الخادم. كل عملية تتحقق من ملكية الفصل عبر RLS.
import { randomBytes } from "node:crypto";
import { admin, assertOwnsClass, codeHash, HttpError, json, newStudentCode, normalizeCode, readBody, requireOwner, requireStaff, resolveMe, sha256, userClient, wrap } from "./_shared/util";

export default wrap(async (req) => {
  const body = await readBody(req);
  const db = admin();

  // ---------- المالك فقط ----------
  if (body.action === "createInvite") {
    const owner = await requireOwner(req);
    const days = Math.min(Math.max(Number(body.days) || 7, 1), 30);
    const email = body.email ? String(body.email).trim().toLowerCase() : null;
    const token = randomBytes(32).toString("base64url");
    const { error } = await db.from("teacher_invites").insert({
      token_hash: sha256("invite:" + token), label: String(body.label ?? "").slice(0, 80) || null, email,
      created_by: (await db.from("teachers").select("id").eq("auth_user_id", owner.id).single()).data?.id,
      expires_at: new Date(Date.now() + days * 86400000).toISOString(),
    });
    if (error) throw new HttpError(500, "تعذر إنشاء الدعوة");
    await db.from("audit_log").insert({ action: "invite.created", entity: "teacher_invites", details: { email, days } });
    return json(200, { token });   // يُعرض مرة واحدة فقط؛ لا يمكن استرجاعه لاحقًا
  }

  const { user } = await requireStaff(req);

  // ---------- موافقة/رفض طلبات الانضمام ----------
  if (body.action === "approve" || body.action === "reject") {
    const { data: jr } = await db.from("join_requests").select("*").eq("id", body.requestId).maybeSingle();
    if (!jr) throw new HttpError(404, "الطلب غير موجود");
    await assertOwnsClass(req, jr.class_id);
    if (jr.status !== "pending") throw new HttpError(409, "تم البتّ في هذا الطلب مسبقًا");

    if (body.action === "reject") {
      await db.from("join_requests").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("id", jr.id);
      return json(200, { ok: true });
    }

    // الفصل الذي يُنضَمّ إليه قد يعدّله المعلم عند الموافقة (ضمن فصوله فقط)
    const classId: string = body.classId ?? jr.class_id;
    if (classId !== jr.class_id) await assertOwnsClass(req, classId);

    let studentId: string = jr.student_id;
    if (studentId) {
      const { data: st } = await db.from("students").select("id,auth_user_id").eq("id", studentId).single();
      if (st?.auth_user_id) throw new HttpError(409, "هذا الملف مرتبط بحساب بالفعل");
    } else {
      const ins = await db.from("students").insert({ class_id: classId, full_name: jr.requested_name, email: jr.email }).select("id").single();
      if (ins.error) throw new HttpError(500, "تعذر إنشاء ملف الطالب");
      studentId = ins.data.id;
    }

    let issued: string | null = null;
    if (jr.auth_user_id) {
      const { data: au } = await db.auth.admin.getUserById(jr.auth_user_id);
      if (!au?.user) throw new HttpError(409, "حساب الطالب لم يعد موجودًا");
      if ((await resolveMe(au.user)).role !== "none") throw new HttpError(409, "هذا الحساب لم يعد صالحًا للانضمام كطالب");
      await db.from("students").update({ auth_user_id: jr.auth_user_id, login_kind: "google", class_id: classId, email: jr.email }).eq("id", studentId);
    } else {
      issued = newStudentCode();
      const created = await db.auth.admin.createUser({
        email: `student-${studentId}@students.invalid`, password: normalizeCode(issued), email_confirm: true,
        app_metadata: { kind: "student" },
      });
      if (created.error || !created.data.user) throw new HttpError(500, "تعذر إنشاء هوية الدخول");
      await db.from("students").update({ auth_user_id: created.data.user.id, login_kind: "code", code_hash: codeHash(issued), class_id: classId }).eq("id", studentId);
    }
    await db.from("join_requests").update({ status: "approved", student_id: studentId, issued_code: issued, decided_at: new Date().toISOString() }).eq("id", jr.id);
    await db.from("audit_log").insert({ action: "student.approved", entity: "students", entity_id: studentId, details: { by: user.id } });
    // الرمز يُعرض للمعلم أيضًا ليسلّمه للطالب إن لزم؛ ويصل الطالب تلقائيًا عند فتح صفحة الحالة
    return json(200, { ok: true, studentId, code: issued });
  }

  // ---------- استعادة رمز طالب فقده أو غيّر جهازه ----------
  if (body.action === "reissueCode") {
    const { data: st } = await db.from("students").select("id,class_id,auth_user_id,login_kind").eq("id", body.studentId).maybeSingle();
    if (!st) throw new HttpError(404, "الطالب غير موجود");
    await assertOwnsClass(req, st.class_id);
    if (st.login_kind !== "code" || !st.auth_user_id) throw new HttpError(400, "هذا الطالب يدخل بحساب Google ولا رمز له");
    const code = newStudentCode();
    const upd = await db.auth.admin.updateUserById(st.auth_user_id, { password: normalizeCode(code) });
    if (upd.error) throw new HttpError(500, "تعذر تجديد الرمز");
    await db.from("students").update({ code_hash: codeHash(code) }).eq("id", st.id);
    await db.from("audit_log").insert({ action: "student.code_reissued", entity: "students", entity_id: st.id, details: { by: user.id } });
    return json(200, { code });
  }

  // ---------- حذف تسجيل صوتي فعليًا من التخزين (يدويًا) ----------
  if (body.action === "deleteRecording") {
    // قراءة عبر RLS تضمن أن التسجيل لطالب من فصول هذا المعلم
    const { data: rec } = await userClient(req).from("recordings").select("id,storage_path,deleted_at").eq("id", body.recordingId).maybeSingle();
    if (!rec) throw new HttpError(404, "التسجيل غير موجود");
    if (rec.storage_path) {
      const r = await db.storage.from("recordings").remove([rec.storage_path]);
      if (r.error) throw new HttpError(500, "تعذر حذف الملف من التخزين");
    }
    await db.from("recordings").update({ storage_path: null, deleted_at: new Date().toISOString(), delete_error: null }).eq("id", rec.id);
    await db.from("audit_log").insert({ action: "recording.deleted_manual", entity: "recordings", entity_id: rec.id, details: { by: user.id } });
    return json(200, { ok: true });
  }

  throw new HttpError(400, "إجراء غير معروف");
});
