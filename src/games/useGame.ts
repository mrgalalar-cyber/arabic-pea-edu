import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

export interface PQuestion { id: string; type: string; prompt: string; topic: string; image_url: string | null; body: any }
export interface StartData {
  attemptId: string; template: string; title: string; image_url: string | null;
  settings: { pointsPerCorrect: number; speedBonusMax: number; secondsPerQuestion: number; maxAttempts: number; timer: boolean; allowPause: boolean };
  questions: PQuestion[]; answered: { question_id: string }[]; ref: { title: string; content: string; image_url: string | null } | null; score: number;
}
export interface Feedback { correct: boolean; base: number; bonus: number; explanation: string | null; answer: string; response: any }
export interface Summary { score: number; base?: number; bonus?: number; correct: number; total: number; timeMs?: number }

/** محرّك اللعب المشترك بين القوالب: المؤقت، الإيقاف المؤقت، الإرسال للخادم، التقدّم. */
export function useGame(d: StartData) {
  const answeredIds = new Set(d.answered.map((a) => a.question_id));
  const remaining = d.questions.filter((q) => !answeredIds.has(q.id));
  const total = d.questions.length;
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"question" | "feedback" | "finished">(remaining.length ? "question" : "finished");
  const [fb, setFb] = useState<Feedback | null>(null);
  const [score, setScore] = useState(d.score);
  const [correct, setCorrect] = useState(0);
  const [answered, setAnswered] = useState(d.answered.length);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const t0 = useRef(performance.now()); const pausedAt = useRef<number | null>(null); const pausedAcc = useRef(0); const sumPrev = useRef(0);
  const limit = d.settings.secondsPerQuestion * 1000;
  const now = () => (pausedAt.current ?? performance.now()) - t0.current - pausedAcc.current;

  const q = remaining[idx] ?? null;

  useEffect(() => {
    if (phase !== "question") return;
    const h = window.setInterval(() => { const e = now(); setElapsed(e); setTotalElapsed(sumPrev.current + e); }, 100);
    return () => clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, idx]);

  const finish = useCallback(async () => {
    try { setSummary(await api<Summary>("play", { action: "finish", attemptId: d.attemptId })); setPhase("finished"); }
    catch (e: any) { setError(e.message); }
  }, [d.attemptId]);

  const submit = useCallback(async (response: any) => {
    if (phase !== "question" || !q || busy) return;
    setBusy(true); setError("");
    const timeMs = Math.min(Math.round(now()), limit);
    try {
      const r = await api<Feedback & { score: number }>("play", { action: "answer", attemptId: d.attemptId, questionId: q.id, response, timeMs });
      sumPrev.current += timeMs; setScore(r.score); setAnswered((n) => n + 1); if (r.correct) setCorrect((n) => n + 1);
      setFb({ ...r, response }); setPhase("feedback");
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, q, busy, d.attemptId, limit]);

  const next = useCallback(async () => {
    if (idx + 1 >= remaining.length) { await finish(); return; }
    setIdx(idx + 1); setFb(null); t0.current = performance.now(); pausedAcc.current = 0; pausedAt.current = null; setElapsed(0); setPhase("question");
  }, [idx, remaining.length, finish]);

  // انتهاء الوقت = إجابة فارغة (تُحتسب خاطئة بلا إحراج)
  useEffect(() => { if (d.settings.timer && phase === "question" && !paused && elapsed >= limit && !busy) submit(null); }, [elapsed]); // eslint-disable-line

  const pause = () => { if (!d.settings.allowPause || phase !== "question" || paused) return; pausedAt.current = performance.now(); setPaused(true); };
  const resume = () => { if (pausedAt.current !== null) pausedAcc.current += performance.now() - pausedAt.current; pausedAt.current = null; setPaused(false); };

  return { q, idx: answered, total, phase, fb, score, correct, paused, elapsed, totalElapsed, limit, summary, error, busy, submit, next, pause, resume, finish };
}
