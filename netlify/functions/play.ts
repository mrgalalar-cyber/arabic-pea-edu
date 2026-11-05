// /api/play — لعب الأنشطة: التصحيح واحتساب النقاط يتمان هنا فقط (لا تصل الإجابات الصحيحة للمتصفح قبل الإجابة).
import { admin, getUser, HttpError, json, readBody, resolveMe, wrap } from "./_shared/util";
import { computePoints, correctAnswerText, DEFAULT_SETTINGS, gradeAnswer, sanitizeQuestion, seededShuffle, type ActivitySettings } from "../../src/lib/grading";

async function requireStudent(req: Request) {
  const u = await getUser(req);
  if (!u) throw new HttpError(401, "يلزم تسجيل الدخول");
  const me = await resolveMe(u);
  if (me.role !== "student" || !me.studentId) throw new HttpError(403, "هذه العملية للطلاب المعتمدين فقط");
  const { data: st } = await admin().from("students").select("id,class_id,status,blocked_until,archived_at").eq("id", me.studentId).single();
  if (!st || st.archived_at || st.status !== "active" || (st.blocked_until && new Date(st.blocked_until) > new Date()))
    throw new HttpError(403, "حسابك غير متاح حاليًا، تواصل مع معلمك");
  return st;
}

async function loadActivity(activityId: string, st: { id: string; class_id: string }) {
  const { data: a } = await admin().from("activities").select("*").eq("id", activityId).maybeSingle();
  if (!a || a.status !== "published" || a.archived_at || a.class_id !== st.class_id) throw new HttpError(404, "النشاط غير متاح");
  if (a.student_ids && !a.student_ids.includes(st.id)) throw new HttpError(403, "هذا النشاط غير موجّه لك");
  const now = Date.now();
  if (a.opens_at && new Date(a.opens_at).getTime() > now) throw new HttpError(403, "النشاط لم يُفتح بعد");
  if (a.closes_at && new Date(a.closes_at).getTime() < now) throw new HttpError(403, "انتهى وقت النشاط");
  return a;
}
const settingsOf = (a: any): ActivitySettings => ({ ...DEFAULT_SETTINGS, ...(a.settings ?? {}) });

export default wrap(async (req) => {
  const body = await readBody(req);
  const st = await requireStudent(req);
  const db = admin();

  if (body.action === "start") {
    const a = await loadActivity(body.activityId, st);
    const s = settingsOf(a);
    const template = String(body.template ?? a.templates[0]);
    if (!a.templates.includes(template)) throw new HttpError(400, "قالب اللعبة غير متاح لهذا النشاط");

    const { data: prior } = await db.from("attempts").select("*").eq("activity_id", a.id).eq("student_id", st.id).order("attempt_no");
    let attempt = (prior ?? []).find((x) => x.status === "in_progress");
    if (!attempt) {
      if ((prior ?? []).length >= s.maxAttempts) throw new HttpError(403, "استنفدتَ عدد المحاولات المسموحة");
      const seed = crypto.randomUUID();
      const order = seededShuffle<string>(a.question_ids, seed);
      if (!order.length) throw new HttpError(400, "لا توجد أسئلة في هذا النشاط");
      const ins = await db.from("attempts").insert({
        activity_id: a.id, student_id: st.id, attempt_no: (prior?.length ?? 0) + 1,
        template, question_order: order, total_questions: order.length,
      }).select("*").single();
      if (ins.error) throw new HttpError(409, "تعذر بدء المحاولة، حاول مرة أخرى");
      attempt = ins.data;
    }

    const { data: qs } = await db.from("questions").select("id,type,prompt,body,image_url,topic").in("id", attempt.question_order);
    const byId = new Map((qs ?? []).map((q) => [q.id, q]));
    const questions = attempt.question_order.map((id: string) => byId.get(id)).filter(Boolean)
      .map((q: any) => sanitizeQuestion(q, attempt!.id));
    const { data: done } = await db.from("attempt_answers").select("question_id,correct,base_points,bonus_points").eq("attempt_id", attempt.id);
    let ref = null;
    if (a.ref_id) {
      const r = await db.from("learning_refs").select("title,content,image_url").eq("id", a.ref_id).maybeSingle();
      ref = r.data ?? null;
    }
    await db.from("students").update({ last_seen_at: new Date().toISOString() }).eq("id", st.id);
    return json(200, {
      attemptId: attempt.id, template: attempt.template, settings: s, title: a.title, image_url: a.image_url,
      questions, answered: done ?? [], ref,
      score: (done ?? []).reduce((n, d) => n + d.base_points + d.bonus_points, 0),
    });
  }

  // بقية الإجراءات تتعلق بمحاولة قائمة
  const { data: attempt } = await db.from("attempts").select("*").eq("id", body.attemptId).eq("student_id", st.id).maybeSingle();
  if (!attempt) throw new HttpError(404, "المحاولة غير موجودة");

  if (body.action === "answer") {
    if (attempt.status !== "in_progress") throw new HttpError(409, "انتهت هذه المحاولة");
    const a = await loadActivity(attempt.activity_id, st);
    const s = settingsOf(a);
    if (!attempt.question_order.includes(body.questionId)) throw new HttpError(400, "سؤال غير تابع لمحاولتك");
    const { data: q } = await db.from("questions").select("id,type,body,explanation").eq("id", body.questionId).single();
    if (!q) throw new HttpError(404, "السؤال غير موجود");

    const { correct } = gradeAnswer(q.type, q.body, body.response);
    // زمن الإجابة: يُقيَّد بحدود منطقية ولا يتجاوز الزمن الفعلي منذ بدء المحاولة
    const elapsed = Date.now() - new Date(attempt.started_at).getTime();
    const timeMs = Math.min(Math.max(Math.round(Number(body.timeMs) || 0), 300), s.secondsPerQuestion * 1000, Math.max(elapsed, 300));
    const pts = computePoints(correct, timeMs, s);

    const ins = await db.from("attempt_answers").insert({
      attempt_id: attempt.id, question_id: q.id, response: body.response ?? null,
      correct, time_ms: timeMs, base_points: pts.base, bonus_points: pts.bonus,
    });
    if (ins.error) throw new HttpError(409, "سبقت الإجابة على هذا السؤال");
    const { data: all } = await db.from("attempt_answers").select("base_points,bonus_points").eq("attempt_id", attempt.id);
    const score = (all ?? []).reduce((n, d) => n + d.base_points + d.bonus_points, 0);
    return json(200, { correct, base: pts.base, bonus: pts.bonus, score, explanation: q.explanation, answer: correctAnswerText(q.type, q.body) });
  }

  if (body.action === "finish") {
    if (attempt.status === "finished") return json(200, { score: attempt.score, correct: attempt.correct_count, total: attempt.total_questions });
    const { data: ans } = await db.from("attempt_answers").select("correct,time_ms,base_points,bonus_points").eq("attempt_id", attempt.id);
    const rows = ans ?? [];
    const base = rows.reduce((n, r) => n + r.base_points, 0), bonus = rows.reduce((n, r) => n + r.bonus_points, 0);
    const upd = {
      status: "finished", finished_at: new Date().toISOString(),
      correct_count: rows.filter((r) => r.correct).length, base_points: base, bonus_points: bonus, score: base + bonus,
      total_time_ms: rows.reduce((n, r) => n + r.time_ms, 0),
    };
    await db.from("attempts").update(upd).eq("id", attempt.id).eq("status", "in_progress");
    return json(200, { score: upd.score, base, bonus, correct: upd.correct_count, total: attempt.total_questions, timeMs: upd.total_time_ms });
  }

  if (body.action === "rate") {
    const r = Math.round(Number(body.rating));
    if (!(r >= 1 && r <= 5)) throw new HttpError(400, "التقييم من 1 إلى 5");
    await db.from("attempts").update({ rating: r }).eq("id", attempt.id);
    return json(200, { ok: true });
  }

  throw new HttpError(400, "إجراء غير معروف");
});
