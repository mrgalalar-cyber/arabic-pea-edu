import { Link, useParams } from "react-router-dom";
import { Download, Printer, Star, Users } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { Activity, Attempt, Klass, Question, Student } from "../../lib/types";
import { downloadFile, fmtSecs, pct, toCsv } from "../../lib/util";
import { gameLabel } from "../../lib/constants";
import { ErrorBox, Loading, useAsync } from "../../lib/ui";
import { Avatar, PageHead, Rank, Stat } from "../../components/bits";
import { Target, Trophy, UserX } from "lucide-react";

interface LB { student_id: string; full_name: string; score: number; correct_count: number; total_questions: number; total_time_ms: number; place: number }

export default function ActivityResults() {
  const { id = "" } = useParams();
  const { data, loading, error } = useAsync(async () => {
    const a = await supabase.from("activities").select("*").eq("id", id).maybeSingle();
    if (!a.data) throw new Error("النشاط غير موجود أو ليس من أنشطتك");
    const act = a.data as Activity;
    const [c, s, at, lb, qs] = await Promise.all([
      supabase.from("classes").select("*").eq("id", act.class_id).single(),
      supabase.from("students").select("id,full_name,class_id,archived_at").eq("class_id", act.class_id).is("archived_at", null),
      supabase.from("attempts").select("*").eq("activity_id", id),
      supabase.rpc("activity_leaderboard", { p_activity: id }),
      supabase.from("questions").select("id,prompt").in("id", act.question_ids),
    ]);
    const attempts = (at.data ?? []) as Attempt[];
    const ans = attempts.length ? await supabase.from("attempt_answers").select("question_id,correct").in("attempt_id", attempts.map((x) => x.id)) : { data: [] };
    return { act, cls: c.data as Klass, students: (s.data ?? []) as Student[], attempts, lb: (lb.data ?? []) as LB[], qs: (qs.data ?? []) as Pick<Question, "id" | "prompt">[], ans: (ans.data ?? []) as { question_id: string; correct: boolean }[] };
  }, [id]);
  if (loading) return <Loading />; if (error) return <ErrorBox msg={error} />;
  const { act, cls, students, attempts, lb, qs, ans } = data!;
  const targets = act.student_ids ? students.filter((s) => act.student_ids!.includes(s.id)) : students;
  const done = attempts.filter((a) => a.status === "finished");
  const played = new Set(done.map((a) => a.student_id));
  const absent = targets.filter((s) => !played.has(s.id));
  const ratings = done.filter((a) => a.rating).map((a) => a.rating!);
  const avgRating = ratings.length ? (ratings.reduce((n, r) => n + r, 0) / ratings.length).toFixed(1) : "—";
  const best = new Map<string, Attempt>(); done.forEach((a) => { const b = best.get(a.student_id); if (!b || a.score > b.score || (a.score === b.score && a.total_time_ms < b.total_time_ms)) best.set(a.student_id, a); });

  const csv = () => downloadFile(`نتائج-${act.title}.csv`, toCsv([
    ["الترتيب", "الطالب", "النقاط الأساسية", "نقاط الطاقة", "المجموع", "الصحيح", "عدد الأسئلة", "الزمن (ث)", "اللعبة", "التقييم"],
    ...lb.map((r) => { const b = best.get(r.student_id)!; return [r.place, r.full_name, b?.base_points, b?.bonus_points, r.score, r.correct_count, r.total_questions, Math.round(r.total_time_ms / 1000), gameLabel(b?.template), b?.rating ?? ""]; }),
    [], ["لم يشاركوا"], ...absent.map((s) => [s.full_name, act.required ? "واجب لم يُنجز" : "اختياري"]),
  ]));

  return (
    <div className="page">
      <PageHead title={act.title} sub={`${cls.name} · ${act.required ? "واجب" : "نشاط اختياري"}`}>
        <Link to="/teacher/activities" className="btn ghost sm no-print">الأنشطة</Link>
        <button className="btn ghost sm no-print" onClick={csv}><Download size={16} />CSV</button>
        <button className="btn sm no-print" onClick={() => window.print()}><Printer size={16} />طباعة / حفظ PDF</button>
      </PageHead>
      <div className="grid g4 g-keep2">
        <Stat tint={1} icon={<Users size={20} />} value={`${played.size}/${targets.length}`} label={`المشاركة ${pct(played.size, targets.length)}%`} />
        <Stat tint={2} icon={<Target size={20} />} value={`${pct(done.reduce((n, a) => n + a.correct_count, 0), done.reduce((n, a) => n + a.total_questions, 0))}%`} label="دقة الإجابات" />
        <Stat tint={3} icon={<Trophy size={20} />} value={done.length ? Math.max(...done.map((a) => a.score)) : "—"} label="أعلى نتيجة" />
        <Stat tint={4} icon={<Star size={20} />} value={avgRating} label={`متوسط تقييم الطلاب (${ratings.length})`} />
      </div>

      <div className="glass card col">
        <h3 style={{ margin: 0 }}>ترتيب النشاط</h3>
        {!lb.length ? <p className="muted">لا نتائج مكتملة بعد.</p> : (<div className="table-wrap"><table className="table"><thead><tr><th>#</th><th>الطالب</th><th>أساسية</th><th>طاقة</th><th>المجموع</th><th>الصحيح</th><th>الزمن</th><th>اللعبة</th></tr></thead><tbody>
          {lb.map((r) => { const b = best.get(r.student_id); return <tr key={r.student_id}><td><Rank n={r.place} /></td><td><div className="row" style={{ flexWrap: "nowrap" }}><Avatar name={r.full_name} size={30} />{r.full_name}</div></td><td>{b?.base_points}</td><td>+{b?.bonus_points}</td><td><b>{r.score}</b></td><td>{r.correct_count}/{r.total_questions}</td><td>{fmtSecs(r.total_time_ms)}</td><td>{gameLabel(b?.template ?? "")}</td></tr>; })}
        </tbody></table></div>)}
        <div className="notice info small"><b>طريقة الترتيب:</b> تُحسب أفضل محاولة لكل طالب. المجموع = النقاط الأساسية (صحة الإجابة كما هي) + نقاط الطاقة (للإجابات الصحيحة السريعة). عند التساوي يتقدّم الأسرع زمنًا إجماليًا.</div>
      </div>

      <div className="grid g2">
        <div className="glass card col"><h3 style={{ margin: 0 }}>دقة كل سؤال</h3>
          {qs.map((q) => { const r = ans.filter((x) => x.question_id === q.id); const p = pct(r.filter((x) => x.correct).length, r.length); return <div key={q.id}><div className="row small"><span className="grow tashkeel" style={{ fontSize: "1rem" }}>{q.prompt.slice(0, 60)}</span><b>{r.length ? p + "%" : "—"}</b></div><div className="progress"><i style={{ width: p + "%" }} /></div></div>; })}
        </div>
        <div className="glass card col"><h3 style={{ margin: 0 }}><UserX size={18} style={{ verticalAlign: "-3px" }} /> لم يشاركوا ({absent.length})</h3>
          {act.required && absent.length > 0 && <div className="notice small">هذا واجب: عدم المشاركة يُحتسب في تقريرك.</div>}
          {absent.length ? absent.map((s) => <div key={s.id} className="row"><Avatar name={s.full_name} size={30} />{s.full_name}</div>) : <p className="muted">شارك الجميع 🎉</p>}
        </div>
      </div>
    </div>
  );
}
