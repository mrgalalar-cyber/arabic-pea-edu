import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, BookOpenCheck, Flame, PauseCircle, Sparkles, Users } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { Activity, Attempt, Klass, Question, Student } from "../../lib/types";
import { daysAgo, fmtDateTime, pct } from "../../lib/util";
import { ErrorBox, Loading, useAsync } from "../../lib/ui";
import { Avatar, Bars, Donut, PageHead, Rank, Stat } from "../../components/bits";
import { useAuth } from "../../lib/auth";

export default function TeacherHome() {
  const { me } = useAuth();
  const { data, loading, error } = useAsync(async () => {
    const [c, s, a, at, jr, q] = await Promise.all([
      supabase.from("classes").select("*").is("archived_at", null).order("created_at"),
      supabase.from("students").select("*").is("archived_at", null),
      supabase.from("activities").select("*").is("archived_at", null).order("updated_at", { ascending: false }),
      supabase.from("attempts").select("*").eq("status", "finished").order("finished_at", { ascending: false }).limit(3000),
      supabase.from("join_requests").select("id,class_id").eq("status", "pending"),
      supabase.from("questions").select("id,prompt,updated_at,topic").is("archived_at", null).order("updated_at", { ascending: false }).limit(5),
    ]);
    if (c.error) throw new Error(c.error.message);
    return { classes: (c.data ?? []) as Klass[], students: (s.data ?? []) as Student[], activities: (a.data ?? []) as Activity[], attempts: (at.data ?? []) as Attempt[], pending: jr.data ?? [], questions: (q.data ?? []) as Pick<Question, "id" | "prompt" | "updated_at">[] };
  });
  const [sel, setSel] = useState<string>("");
  const top = useAsync(async () => {
    const id = sel || data?.classes[0]?.id; if (!id) return [];
    const r = await supabase.rpc("class_champions", { p_class: id }); return (r.data ?? []).slice(0, 3) as { student_id: string; full_name: string; total_score: number; accuracy: number; place: number }[];
  }, [sel, data?.classes.length]);

  if (loading) return <Loading />; if (error) return <ErrorBox msg={error} />;
  const { classes, students, activities, attempts, pending, questions } = data!;
  if (!classes.length) return (
    <div className="page"><div className="glass card center" style={{ padding: 40 }}>
      <Sparkles size={44} color="var(--accent)" /><h1>أهلًا بك{me?.name ? ` يا ${me.name.split(" ")[0]}` : ""}</h1>
      <p className="muted">ابدأ بثلاث خطوات: أنشئ فصلًا، أضف أسئلة إلى بنكك، ثم أنشئ نشاطًا وانشره لطلابك.</p>
      <div className="row" style={{ justifyContent: "center" }}><Link className="btn" to="/teacher/classes">إنشاء أول فصل</Link></div>
    </div></div>);

  const actClass = new Map(activities.map((a) => [a.id, a.class_id]));
  const perClass = classes.map((c) => {
    const at = attempts.filter((x) => actClass.get(x.activity_id) === c.id);
    const stu = students.filter((s) => s.class_id === c.id);
    return { c, n: stu.length, acc: pct(at.reduce((n, x) => n + x.correct_count, 0), at.reduce((n, x) => n + x.total_questions, 0)), part: pct(new Set(at.map((x) => x.student_id)).size, stu.length), pending: pending.filter((p) => p.class_id === c.id).length };
  });
  const weekly = Array.from({ length: 7 }, (_, i) => attempts.filter((a) => a.finished_at && daysAgo(a.finished_at) === 6 - i).length);
  const closing = activities.filter((a) => a.status === "published" && a.closes_at && new Date(a.closes_at) > new Date() && new Date(a.closes_at).getTime() - Date.now() < 3 * 86400000);
  // طلاب للمتابعة
  const byStudent = new Map<string, Attempt[]>(); attempts.forEach((a) => byStudent.set(a.student_id, [...(byStudent.get(a.student_id) ?? []), a]));
  const stopped = students.filter((s) => { const l = byStudent.get(s.id); return l && l.length > 0 && daysAgo(l[0].finished_at) >= 14; }).slice(0, 4);
  const shining = students.filter((s) => { const l = (byStudent.get(s.id) ?? []).filter((a) => daysAgo(a.finished_at) <= 7); return l.length >= 2 && pct(l.reduce((n, a) => n + a.correct_count, 0), l.reduce((n, a) => n + a.total_questions, 0)) >= 90; }).slice(0, 4);
  const recent = [...activities.slice(0, 4).map((a) => ({ t: a.updated_at, txt: `نشاط: ${a.title}` })), ...questions.slice(0, 3).map((q) => ({ t: q.updated_at, txt: `سؤال: ${q.prompt.slice(0, 40)}` }))].sort((a, b) => +new Date(b.t) - +new Date(a.t)).slice(0, 5);
  const cur = classes.find((c) => c.id === (sel || classes[0].id))!;

  return (
    <div className="page">
      <PageHead title={`مرحبًا${me?.name ? " " + me.name.split(" ")[0] : ""} 👋`} sub="نظرة سريعة على فصولك ونشاط طلابك." />
      <div className="grid g4 g-keep2">
        <Stat tint={1} icon={<Users size={20} />} value={students.length} label="طالب نشط" />
        <Stat tint={2} icon={<BookOpenCheck size={20} />} value={activities.filter((a) => a.status === "published").length} label="نشاط منشور" />
        <Stat tint={3} icon={<Flame size={20} />} value={attempts.filter((a) => daysAgo(a.finished_at) <= 7).length} label="مشاركة هذا الأسبوع" spark={weekly} />
        <Stat tint={4} icon={<AlertTriangle size={20} />} value={pending.length} label="طلب انضمام ينتظرك" />
      </div>

      <div className="auto-grid">
        {perClass.map(({ c, n, acc, part, pending: p }) => (
          <Link key={c.id} to={`/teacher/classes/${c.id}`} className="glass card hover col" style={{ textDecoration: "none", color: "var(--text)" }}>
            <div className="row"><h3 className="grow" style={{ margin: 0 }}>{c.name}</h3>{p > 0 && <span className="chip warn">{p} طلب</span>}</div>
            <div className="row" style={{ justifyContent: "space-between" }}><div><div className="muted small">{n} طالبًا</div><div className="muted small">المشاركة {part}%</div></div><Donut value={acc} size={84} /></div>
          </Link>))}
      </div>

      <div className="grid g2">
        <div className="glass card col"><h3 style={{ margin: 0 }}>دقة الإجابات حسب الفصل</h3><Bars items={perClass.map((x) => ({ label: x.c.name, value: x.acc }))} /></div>
        <div className="glass card col">
          <div className="row"><h3 className="grow" style={{ margin: 0 }}>أبطال الفصل</h3><select className="field" style={{ width: "auto", minHeight: 36 }} value={sel || classes[0].id} onChange={(e) => setSel(e.target.value)} aria-label="الفصل">{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          {top.data?.length ? top.data.map((t) => <div key={t.student_id} className="row"><Rank n={t.place} /><Avatar name={t.full_name} size={34} /><b className="grow">{t.full_name}</b><span className="chip good">{t.total_score} نقطة</span></div>) : <p className="muted">لا نتائج بعد في «{cur.name}».</p>}
        </div>
      </div>

      <div className="grid g3">
        <div className="glass card col"><h3 style={{ margin: 0 }}>تنبيهات مهمة</h3>
          {!pending.length && !closing.length && <p className="muted">لا توجد تنبيهات.</p>}
          {pending.length > 0 && <Link to="/teacher/classes" className="notice">{pending.length} طلب انضمام بانتظار موافقتك</Link>}
          {closing.map((a) => <div key={a.id} className="notice">ينتهي قريبًا: <b>{a.title}</b> ({fmtDateTime(a.closes_at)})</div>)}
        </div>
        <div className="glass card col"><h3 style={{ margin: 0 }}>طلاب للمتابعة</h3>
          {shining.map((s) => <div key={s.id} className="row"><Avatar name={s.full_name} size={30} /><span className="grow">{s.full_name}</span><span className="chip good"><Sparkles size={12} />متميز حديثًا</span></div>)}
          {stopped.map((s) => <div key={s.id} className="row"><Avatar name={s.full_name} size={30} /><span className="grow">{s.full_name}</span><span className="chip warn"><PauseCircle size={12} />توقفت مشاركاته</span></div>)}
          {!shining.length && !stopped.length && <p className="muted">لا توجد حالات بعد.</p>}
        </div>
        <div className="glass card col"><h3 style={{ margin: 0 }}>آخر التعديلات</h3>
          {recent.length ? recent.map((r, i) => <div key={i} className="small"><b>{r.txt}</b><div className="muted">{fmtDateTime(r.t)}</div></div>) : <p className="muted">—</p>}
          <Link to="/teacher/activities" className="btn ghost sm" style={{ alignSelf: "flex-start" }}>الأنشطة <ArrowLeft size={14} /></Link>
        </div>
      </div>
    </div>
  );
}
