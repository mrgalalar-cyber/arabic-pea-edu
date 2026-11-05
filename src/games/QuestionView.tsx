import { useEffect, useState } from "react";
import type { Feedback, PQuestion } from "./useGame";

interface Props { q: PQuestion; fb: Feedback | null; busy: boolean; onSubmit: (response: any) => void }

export function QuestionView({ q, fb, busy, onSubmit }: Props) {
  const locked = !!fb || busy;
  const [picked, setPicked] = useState<any>(null);
  useEffect(() => setPicked(null), [q.id]);

  const ok = (text: string) => (fb && fb.answer === text ? " ok" : "");
  const no = (text: string, val: any) => (fb && !fb.correct && picked === val && fb.answer !== text ? " no" : "");

  return (
    <div className="q-card glass">
      <div className="q-prompt" lang="ar">{q.prompt}</div>
      {q.image_url && <img src={q.image_url} alt="" style={{ maxWidth: "100%", borderRadius: 16 }} />}

      {(q.type === "mcq" || q.type === "quick") && (
        <div className="opts" role="group" aria-label="الخيارات">
          {q.body.options.map((o: { i: number; text: string }) => (
            <button key={o.i} className={"opt" + (picked === o.i ? " picked" : "") + ok(o.text) + no(o.text, o.i)} disabled={locked} onClick={() => { setPicked(o.i); onSubmit({ choice: o.i }); }}>{o.text}</button>
          ))}
        </div>)}

      {q.type === "true_false" && (
        <div className="opts" role="group">
          {[true, false].map((v) => (
            <button key={String(v)} className={"opt" + (picked === v ? " picked" : "") + (fb && fb.answer === (v ? "صح" : "خطأ") ? " ok" : "") + (fb && !fb.correct && picked === v ? " no" : "")} disabled={locked} onClick={() => { setPicked(v); onSubmit({ value: v }); }}>{v ? "✔ صح" : "✘ خطأ"}</button>
          ))}
        </div>)}

      {q.type === "ordering" && <Ordering q={q} locked={locked} onSubmit={onSubmit} />}
      {q.type === "matching" && <Matching q={q} locked={locked} onSubmit={onSubmit} />}
      {q.type === "fill_blank" && <Fill q={q} locked={locked} onSubmit={onSubmit} />}
    </div>
  );
}

function Ordering({ q, locked, onSubmit }: { q: PQuestion; locked: boolean; onSubmit: (r: any) => void }) {
  const items: string[] = q.body.items;
  const [placed, setPlaced] = useState<number[]>([]);
  useEffect(() => setPlaced([]), [q.id]);
  const pool = items.map((_, i) => i).filter((i) => !placed.includes(i));
  return (
    <>
      <div className="chips-row" aria-label="ترتيبك" lang="ar">{placed.length === 0 && <span className="muted">اضغط على الكلمات بالترتيب الصحيح</span>}
        {placed.map((i) => <button key={i} className="opt picked" style={{ minHeight: 48, padding: "8px 16px" }} disabled={locked} onClick={() => setPlaced(placed.filter((x) => x !== i))}>{items[i]}</button>)}</div>
      <div className="chips-row" style={{ borderStyle: "solid" }} lang="ar">{pool.map((i) => <button key={i} className="opt" style={{ minHeight: 48, padding: "8px 16px" }} disabled={locked} onClick={() => setPlaced([...placed, i])}>{items[i]}</button>)}</div>
      <button className="btn lg" disabled={locked || placed.length !== items.length} onClick={() => onSubmit({ order: placed.map((i) => items[i]) })}>تأكيد الترتيب</button>
    </>
  );
}

function Matching({ q, locked, onSubmit }: { q: PQuestion; locked: boolean; onSubmit: (r: any) => void }) {
  const lefts: string[] = q.body.lefts, rights: string[] = q.body.rights;
  const [sel, setSel] = useState<string | null>(null); const [m, setM] = useState<Record<string, string>>({});
  useEffect(() => { setM({}); setSel(null); }, [q.id]);
  const used = Object.values(m);
  const colors = ["#0b8794", "#6354e8", "#d9762b", "#2f9e5f", "#c2467a", "#3b73d9"];
  const colorOf = (l: string) => colors[lefts.indexOf(l) % colors.length];
  return (
    <>
      <div className="grid g2" lang="ar">
        <div className="col">{lefts.map((l) => <button key={l} disabled={locked} className={"opt" + (sel === l ? " picked" : "")} style={m[l] ? { borderColor: colorOf(l) } : undefined} onClick={() => { if (m[l]) { const n = { ...m }; delete n[l]; setM(n); setSel(l); } else setSel(l); }}>{l}</button>)}</div>
        <div className="col">{rights.map((r) => { const owner = Object.keys(m).find((k) => m[k] === r); return <button key={r} disabled={locked || (used.includes(r) && !owner)} className="opt" style={owner ? { borderColor: colorOf(owner), background: `color-mix(in srgb, ${colorOf(owner)} 16%, var(--glass-strong))` } : undefined} onClick={() => { if (owner) { const n = { ...m }; delete n[owner]; setM(n); } else if (sel) { setM({ ...m, [sel]: r }); setSel(null); } }}>{r}</button>; })}</div>
      </div>
      <span className="small muted">اختر كلمة من الجهة الأولى ثم ما يطابقها من الجهة الثانية. اضغط على المطابقة لإلغائها.</span>
      <button className="btn lg" disabled={locked || Object.keys(m).length !== lefts.length} onClick={() => onSubmit({ matches: m })}>تأكيد المطابقة</button>
    </>
  );
}

function Fill({ q, locked, onSubmit }: { q: PQuestion; locked: boolean; onSubmit: (r: any) => void }) {
  const [t, setT] = useState(""); useEffect(() => setT(""), [q.id]);
  const choices: string[] | null = q.body.choices;
  return (
    <>
      {choices && <div className="opts" role="group">{choices.map((c) => <button key={c} className={"opt" + (t === c ? " picked" : "")} disabled={locked} onClick={() => setT(c)}>{c}</button>)}</div>}
      {!choices && <input className="field tashkeel" style={{ fontSize: "1.5rem", minHeight: 60, textAlign: "center" }} lang="ar" dir="rtl" value={t} disabled={locked} autoFocus placeholder="اكتب إجابتك" onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === "Enter" && t.trim() && onSubmit({ text: t })} />}
      <button className="btn lg" disabled={locked || !t.trim()} onClick={() => onSubmit({ text: t })}>تأكيد</button>
    </>
  );
}
