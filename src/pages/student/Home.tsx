import { Link } from "react-router-dom";
import { CheckCircle2, Lock, Play, Sparkles, Trophy } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { gameLabel } from "../../lib/constants";
import type { Activity, Attempt, Student } from "../../lib/types";
import { fmtDateTime } from "../../lib/util";
import { Empty, ErrorBox, Loading, useAsync } from "../../lib/ui";
import { Stat } from "../../components/bits";

export default function StudentHome() {
  const { me } = useAuth();
  const { data, loading, error } = useAsync(async () => {
    const [s, a, at] = await Promise.all([
      supabase.from("students").select("*").maybeSingle(),
      supabase.from("activities").select("*").order("created_at", { ascending: false }),
      supabase.from("attempts").select("*"),
    ]);
    if (a.error) throw new Error(a.error.message);
    return { me: s.data as Student | null, acts: (a.data ?? []) as Activity[], attempts: (at.data ?? []) as Attempt[] };
  });
  if (loading) return <Loading />; if (error) return <ErrorBox msg={error} />;
  const { acts, attempts } = data!;
  const done = attempts.filter((a) => a.status === "finished");
  const state = (a: Activity) => {
    const mine = attempts.filter((x) => x.activity_id === a.id); const max = a.settings?.maxAttempts ?? 1;
    const now = Date.now();
    if (mine.some((x) => x.status === "in_progress")) return { k: "resume", label: "تابع اللعب", ok: true };
    if (a.opens_at && new Date(a.opens_at).getTime() > now) return { k: "soon", label: `يفتح ${fmtDateTime(a.opens_at)}`, ok: false };
    if (a.closes_at && new Date(a.closes_at).getTime() < now) return { k: "closed", label: "انتهى الوقت", ok: false };
    if (mine.length >= max) return { k: "done", label: "مكتمل", ok: false, best: Math.max(...mine.map((x) => x.score)) };
    return { k: "play", label: mine.length ? "حاول مجددًا" : "ابدأ", ok: true };
  };
  return (
    <>
      <div className="glass card row">
        <div className="grow"><h1 style={{ margin: 0 }}>أهلًا {me?.name?.split(" ")[0]} 👋</h1><p className="muted" style={{ margin: 0 }}>اختر نشاطًا والعب وتعلّم.</p></div>
        <Stat tint={1} icon={<Trophy size={20} />} value={done.reduce((n, a) => n + a.score, 0)} label="نقاطي" />
      </div>
      <h2 style={{ margin: "6px 0 0" }}>أنشطتي</h2>
      {!acts.length ? <div className="glass card"><Empty icon={<Sparkles size={40} />} text="لا توجد أنشطة منشورة لك الآن. سيظهر هنا ما ينشره معلمك." /></div> : (
        <div className="col">{acts.map((a) => { const st = state(a); return (
          <article key={a.id} className="glass card hover row">
            <div className="grow"><div className="row" style={{ gap: 6 }}><span className={"chip " + (a.required ? "bad" : "")}>{a.required ? "واجب" : "اختياري"}</span>{a.templates.map((t) => <span key={t} className="chip info">{gameLabel(t)}</span>)}</div>
              <h3 style={{ margin: "6px 0 0" }}>{a.title}</h3><div className="small muted">{a.question_ids.length} أسئلة{a.closes_at ? ` · يغلق ${fmtDateTime(a.closes_at)}` : ""}</div></div>
            {st.ok ? <Link to={`/play/${a.id}`} className="btn"><Play size={18} />{st.label}</Link>
              : st.k === "done" ? <span className="chip good"><CheckCircle2 size={14} />مكتمل · {st.best} نقطة</span> : <span className="chip warn"><Lock size={14} />{st.label}</span>}
          </article>); })}</div>)}
    </>
  );
}
