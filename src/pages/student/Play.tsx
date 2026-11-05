import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BookOpen, Home, Pause, Play as PlayIcon, Star, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { api } from "../../lib/api";
import { GAMES, gameLabel } from "../../lib/constants";
import type { Activity } from "../../lib/types";
import { fmtSecs } from "../../lib/util";
import { ErrorBox, Loading, useToast } from "../../lib/ui";
import { ThemeSwitch } from "../../lib/theme";
import { useGame, type StartData } from "../../games/useGame";
import { QuestionView } from "../../games/QuestionView";
import { GardenScene, RaceScene } from "../../games/Scenes";
import { Rank } from "../../components/bits";

export default function Play() {
  const { activityId = "" } = useParams(); const nav = useNavigate();
  const [act, setAct] = useState<Activity | null>(null); const [err, setErr] = useState("");
  const [tpl, setTpl] = useState(""); const [data, setData] = useState<StartData | null>(null); const [starting, setStarting] = useState(false);

  useEffect(() => {
    supabase.from("activities").select("*").eq("id", activityId).maybeSingle().then(({ data, error }) => {
      if (error || !data) setErr("النشاط غير متاح لك"); else { setAct(data as Activity); if ((data as Activity).templates.length === 1) setTpl((data as Activity).templates[0]); }
    });
  }, [activityId]);

  const start = async (t: string) => {
    setStarting(true); setErr("");
    try { setData(await api<StartData>("play", { action: "start", activityId, template: t })); }
    catch (e: any) { setErr(e.message); } finally { setStarting(false); }
  };

  if (err && !act) return <div className="hero"><div className="glass auth-card center col"><ErrorBox msg={err} /><Link className="btn" to="/student">العودة</Link></div></div>;
  if (!act) return <Loading />;
  if (data) return <Runner d={data} onExit={() => nav("/student")} activityId={activityId} />;

  const choices = GAMES.filter((g) => act.templates.includes(g.id));
  return (
    <div className="hero">
      <div style={{ position: "absolute", top: 16, insetInlineStart: 16, display: "flex", gap: 10 }}><Link to="/student" className="icon-btn" aria-label="رجوع"><Home size={19} /></Link><ThemeSwitch /></div>
      <div className="glass hero-card col" style={{ maxWidth: 720 }}>
        <h1 style={{ margin: 0 }}>{act.title}</h1>
        {act.description && <p className="muted">{act.description}</p>}
        <p className="small muted">{act.question_ids.length} أسئلة · {act.settings.secondsPerQuestion} ثانية لكل سؤال · {act.settings.maxAttempts > 1 ? `${act.settings.maxAttempts} محاولات` : "محاولة واحدة"}</p>
        {err && <ErrorBox msg={err} />}
        {choices.length > 1 && <><h3 style={{ margin: 0 }}>اختر لعبتك</h3>
          <div className="grid g2">{choices.map((g) => <button key={g.id} onClick={() => setTpl(g.id)} className="glass card hover col" style={{ font: "inherit", color: "var(--text)", cursor: "pointer", textAlign: "start", borderTop: `4px solid ${g.color}`, outline: tpl === g.id ? "3px solid var(--accent)" : "none" }} aria-pressed={tpl === g.id}><h3 style={{ margin: 0 }}>{g.label}</h3><span className="muted">{g.desc}</span></button>)}</div></>}
        {choices.length === 1 && <div className="notice info">اللعبة: <b>{choices[0].label}</b> — {choices[0].desc}</div>}
        <button className="btn lg" disabled={!tpl || starting} onClick={() => start(tpl)}><PlayIcon size={20} />{starting ? "جارٍ التحضير…" : "ابدأ"}</button>
      </div>
    </div>
  );
}

function Runner({ d, onExit, activityId }: { d: StartData; onExit: () => void; activityId: string }) {
  const g = useGame(d); const toast = useToast();
  const [showRef, setShowRef] = useState(false); const [rating, setRating] = useState(0);
  const timePct = g.totalElapsed / Math.max(1, g.total * g.limit);
  const left = Math.max(0, g.limit - g.elapsed);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Enter" && g.phase === "feedback") g.next(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [g.phase, g.next]);  // eslint-disable-line

  const rate = async (n: number) => { setRating(n); try { await api("play", { action: "rate", attemptId: d.attemptId, rating: n }); toast("شكرًا لتقييمك"); } catch { /* */ } };

  if (g.phase === "finished") return <Done d={d} g={g} rating={rating} rate={rate} onExit={onExit} activityId={activityId} />;
  if (!g.q) return <Loading />;

  return (
    <div className="play">
      <div className="glass play-top">
        <button className="icon-btn" onClick={onExit} aria-label="خروج"><X size={19} /></button>
        <div className="grow"><div className="row small" style={{ justifyContent: "space-between" }}><b>{d.title}</b><span>السؤال {Math.min(g.idx + 1, g.total)} من {g.total}</span></div><div className="progress"><i style={{ width: `${(g.idx / g.total) * 100}%` }} /></div></div>
        <span className="chip good" aria-live="polite">⭐ {g.score}</span>
        {d.settings.allowPause && <button className="icon-btn" onClick={g.pause} disabled={g.phase !== "question"} aria-label="إيقاف مؤقت"><Pause size={19} /></button>}
        <ThemeSwitch />
      </div>

      {d.template === "garden" ? <GardenScene correct={g.correct} total={g.total} answered={g.idx} /> : <RaceScene correct={g.correct} total={g.total} timePct={timePct} />}

      {d.settings.timer && g.phase === "question" && <div className="row"><div className="timer-bar" role="progressbar" aria-valuemin={0} aria-valuemax={d.settings.secondsPerQuestion} aria-valuenow={Math.ceil(left / 1000)}><i style={{ width: `${(left / g.limit) * 100}%`, backgroundPosition: `${(1 - left / g.limit) * 100}% 0` }} /></div><b style={{ minWidth: 36 }}>{Math.ceil(left / 1000)}</b></div>}
      {g.error && <ErrorBox msg={g.error} />}

      <QuestionView q={g.q} fb={g.fb} busy={g.busy} onSubmit={g.submit} />

      {g.fb && (
        <div className={"feedback " + (g.fb.correct ? "ok" : "no")} role="status">
          <div className="row"><b style={{ fontSize: "1.2rem" }}>{g.fb.correct ? "أحسنت! إجابة صحيحة 🎉" : "قريبٌ! لنتعلّم معًا 💡"}</b>{g.fb.correct && <span className="points-pop">+{g.fb.base}{g.fb.bonus > 0 && <> +{g.fb.bonus} طاقة</>}</span>}</div>
          {!g.fb.correct && <p className="tashkeel" style={{ margin: "6px 0" }}>الإجابة الصحيحة: <b>{g.fb.answer}</b></p>}
          {g.fb.explanation && <p className="tashkeel" style={{ margin: "6px 0" }}>{g.fb.explanation}</p>}
          <button className="btn" onClick={g.next} autoFocus>{g.idx >= g.total ? "إنهاء" : "التالي"}</button>
        </div>)}

      {g.paused && (
        <div className="pause-back" role="dialog" aria-modal="true" aria-label="إيقاف مؤقت">
          <div className="glass card col center" style={{ width: "min(520px,100%)", maxHeight: "90vh", overflow: "auto", background: "var(--glass-strong)" }}>
            {!showRef ? (<>
              <h2 style={{ margin: 0 }}>⏸ اللعبة متوقفة</h2><p className="muted">الوقت متوقف ولن يُحتسب عليك.</p>
              <button className="btn lg" onClick={g.resume}><PlayIcon size={20} />متابعة</button>
              {d.ref ? <button className="btn ghost" onClick={() => setShowRef(true)}><BookOpen size={18} />فتح المرجع</button> : <span className="small muted">لا يوجد مرجع لهذا النشاط.</span>}
            </>) : (<>
              <h3 style={{ margin: 0 }} className="tashkeel">{d.ref!.title}</h3>
              <p className="tashkeel" style={{ textAlign: "start" }}>{d.ref!.content}</p>
              <button className="btn" onClick={() => setShowRef(false)}>العودة إلى الإيقاف</button>
            </>)}
          </div>
        </div>)}
    </div>
  );
}

function Done({ d, g, rating, rate, onExit, activityId }: { d: StartData; g: ReturnType<typeof useGame>; rating: number; rate: (n: number) => void; onExit: () => void; activityId: string }) {
  const s = g.summary; const [lb, setLb] = useState<any[] | null>(null);
  useEffect(() => { supabase.rpc("activity_leaderboard", { p_activity: activityId }).then((r) => setLb((r.data ?? []) as any[])); }, [activityId]);
  const total = s?.total ?? d.questions.length, ok = s?.correct ?? g.correct, pct = total ? Math.round((100 * ok) / total) : 0;
  const msg = pct >= 90 ? "أداء رائع! أنت بطل 🏆" : pct >= 60 ? "أحسنت! تتقدّم بثبات 🌟" : "محاولة جميلة، وكل مرة ستتحسّن أكثر 🌱";
  const confetti = useMemo(() => pct >= 70 ? Array.from({ length: 30 }, (_, i) => ({ i, l: Math.random() * 100, d: 2.5 + Math.random() * 2.5, c: ["#0b8794", "#6354e8", "#d9762b", "#2f9e5f", "#c2467a"][i % 5], delay: Math.random() * 1.2 })) : [], [pct]);
  return (
    <div className="play">
      <div className="confetti" aria-hidden>{confetti.map((c) => <i key={c.i} style={{ left: c.l + "%", background: c.c, animationDuration: c.d + "s", animationDelay: c.delay + "s" }} />)}</div>
      <div className="glass card col center" style={{ padding: 28 }}>
        <h1 style={{ margin: 0 }}>{msg}</h1>
        <div className="grid g3 g-keep2" style={{ width: "100%" }}>
          <div className="glass stat tint1"><span className="v">{s?.score ?? g.score}</span><span className="l">مجموع النقاط</span></div>
          <div className="glass stat tint2"><span className="v">{ok}/{total}</span><span className="l">إجابات صحيحة</span></div>
          <div className="glass stat tint3"><span className="v">{fmtSecs(s?.timeMs ?? 0)}</span><span className="l">الزمن</span></div>
        </div>
        {s?.base !== undefined && <p className="small muted">{s.base} نقطة أساسية + {s.bonus} نقطة طاقة — اللعبة: {gameLabel(d.template)}</p>}
        <div><div className="muted small">كيف وجدت اللعبة؟</div><div className="stars-row" role="radiogroup" aria-label="تقييم">{[1, 2, 3, 4, 5].map((n) => <button key={n} className="star-btn" role="radio" aria-checked={rating === n} aria-label={`${n} نجوم`} onClick={() => rate(n)}><Star size={32} fill={n <= rating ? "currentColor" : "none"} /></button>)}</div></div>
      </div>
      {lb && lb.length > 0 && <div className="glass card col"><h3 style={{ margin: 0 }}>لوحة النشاط</h3>{lb.slice(0, 5).map((r) => <div key={r.student_id} className={"row" + (r.is_me ? " me-row" : "")} style={r.is_me ? { background: "var(--t2)", borderRadius: 12, padding: 6 } : { padding: 6 }}><Rank n={r.place} /><b className="grow">{r.full_name}{r.is_me && " (أنت)"}</b><span className="chip good">{r.score}</span></div>)}</div>}
      <button className="btn lg" onClick={onExit}>العودة إلى أنشطتي</button>
    </div>
  );
}
