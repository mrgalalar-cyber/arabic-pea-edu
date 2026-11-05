import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import type { Attempt, Klass, Student } from "../../lib/types";
import { fmtDate, fmtDateTime, pct } from "../../lib/util";
import { ErrorBox, Loading, useAsync } from "../../lib/ui";
import { Avatar } from "../../components/bits";

export default function StudentMe() {
  const { signOut } = useAuth();
  const { data, loading, error } = useAsync(async () => {
    const [s, c, a] = await Promise.all([supabase.from("students").select("*").maybeSingle(), supabase.from("classes").select("*").maybeSingle(), supabase.from("attempts").select("*").eq("status", "finished").order("finished_at", { ascending: false })]);
    return { s: s.data as Student, c: c.data as Klass | null, a: (a.data ?? []) as Attempt[] };
  });
  if (loading) return <Loading />; if (error) return <ErrorBox msg={error} />;
  const { s, c, a } = data!;
  return (
    <>
      <div className="glass card row"><Avatar name={s.full_name} size={64} /><div className="grow"><h1 style={{ margin: 0 }}>{s.full_name}</h1><div className="muted small">{c?.name} · انضممت {fmtDate(s.joined_at)}</div></div></div>
      <div className="grid g3 g-keep2">
        <div className="glass stat tint1"><span className="v">{a.reduce((n, x) => n + x.score, 0)}</span><span className="l">نقاطي</span></div>
        <div className="glass stat tint2"><span className="v">{pct(a.reduce((n, x) => n + x.correct_count, 0), a.reduce((n, x) => n + x.total_questions, 0))}%</span><span className="l">دقتي</span></div>
        <div className="glass stat tint3"><span className="v">{a.length}</span><span className="l">مشاركاتي</span></div>
      </div>
      <div className="glass card col"><h3 style={{ margin: 0 }}>آخر مشاركاتي</h3>
        {a.slice(0, 8).map((x) => <div key={x.id} className="row small"><span className="grow">{fmtDateTime(x.finished_at)}</span><span>{x.correct_count}/{x.total_questions}</span><span className="chip good">{x.score}</span></div>)}
        {!a.length && <p className="muted">لم تلعب بعد.</p>}</div>
      <div className="glass card col"><h3 style={{ margin: 0 }}>حسابي</h3><p className="small muted">{s.login_kind === "code" ? "تدخل برمزك الثابت. إن فقدته اطلب من معلمك استعادته." : "تدخل بحساب Google."} طلبات تعديل الاسم أو الصورة تُضاف في مرحلة لاحقة وتتطلب موافقة المعلم.</p><button className="btn ghost" style={{ alignSelf: "flex-start" }} onClick={signOut}>تسجيل الخروج</button></div>
    </>
  );
}
