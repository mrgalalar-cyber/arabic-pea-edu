import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { DIFFICULTY, GAMES, QTYPES, TOPICS } from "../lib/constants";
import type { Question, Ref } from "../lib/types";
import { Confirm, Modal, useToast } from "../lib/ui";

const MARKS = [["َ", "فتحة"], ["ُ", "ضمة"], ["ِ", "كسرة"], ["ّ", "شدّة"], ["ْ", "سكون"], ["ً", "تنوين فتح"], ["ٌ", "تنوين ضم"], ["ٍ", "تنوين كسر"]];

/** شريط إدخال الحركات: يُدرج الحركة في آخر حقل نصي نشط داخل النافذة */
function TashkeelBar({ scope }: { scope: React.RefObject<HTMLElement | null> }) {
  const last = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = scope.current; if (!el) return;
    const h = (e: FocusEvent) => { const t = e.target as HTMLElement; if (t.matches("input[type=text], input:not([type]), textarea")) last.current = t as HTMLInputElement; };
    el.addEventListener("focusin", h); return () => el.removeEventListener("focusin", h);
  }, [scope]);
  const put = (ch: string) => {
    const el = last.current; if (!el) return;
    el.focus(); el.setRangeText(ch, el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  return (
    <div className="row" role="toolbar" aria-label="إدخال الحركات" style={{ gap: 6 }}>
      <span className="small muted">الحركات:</span>
      {MARKS.map(([m, n]) => <button key={n} type="button" className="btn ghost sm" style={{ minWidth: 40, fontFamily: "var(--font-text)", fontSize: "1.3rem", padding: "0 8px" }} title={n} aria-label={n} onMouseDown={(e) => e.preventDefault()} onClick={() => put(m)}>◌{m}</button>)}
    </div>
  );
}

export function validateBody(type: string, b: any): string | null {
  const nonEmpty = (a: string[]) => a.every((x) => x.trim());
  switch (type) {
    case "mcq": case "quick":
      if (b.options.length < 2) return "أضف خيارين على الأقل"; if (!nonEmpty(b.options)) return "لا تترك خيارًا فارغًا";
      if (new Set(b.options.map((x: string) => x.trim())).size !== b.options.length) return "الخيارات يجب ألا تتكرر";
      return b.correct >= 0 && b.correct < b.options.length ? null : "حدّد الإجابة الصحيحة";
    case "true_false": return typeof b.correct === "boolean" ? null : "حدّد الإجابة";
    case "ordering": return b.items.length >= 2 && nonEmpty(b.items) ? null : "أضف عنصرين على الأقل ولا تترك فراغًا";
    case "matching": return b.pairs.length >= 2 && b.pairs.every((p: any) => p.left.trim() && p.right.trim()) ? null : "أضف زوجين على الأقل واملأ الطرفين";
    case "fill_blank": return b.answer?.trim() ? null : "اكتب الإجابة الصحيحة";
  }
  return "نوع غير معروف";
}
const emptyBody = (type: string): any => ({
  mcq: { options: ["", "", "", ""], correct: 0 }, quick: { options: ["", "", ""], correct: 0 }, true_false: { correct: true },
  ordering: { items: ["", "", ""] }, matching: { pairs: [{ left: "", right: "" }, { left: "", right: "" }] },
  fill_blank: { answer: "", accepted: [], choices: [], strict: true },
}[type]);

export function QuestionEditor({ q, refs, defaults, onClose, onSaved }: { q?: Question | null; refs: Ref[]; defaults?: Partial<Question>; onClose: () => void; onSaved: () => void }) {
  const toast = useToast(); const box = useRef<HTMLDivElement>(null);
  const [f, setF] = useState(() => ({
    topic: q?.topic ?? defaults?.topic ?? "grammar", skill: q?.skill ?? "", subject: q?.subject ?? "", difficulty: q?.difficulty ?? 1,
    type: q?.type ?? "mcq", prompt: q?.prompt ?? "", explanation: q?.explanation ?? "", ref_id: q?.ref_id ?? "",
    game_templates: q?.game_templates ?? GAMES.map((g) => g.id) as string[], status: q?.status ?? "approved",
  }));
  const [body, setBody] = useState<any>(q?.body ?? emptyBody("mcq"));
  const [dirty, setDirty] = useState(false); const [saving, setSaving] = useState(false); const [confirmClose, setConfirmClose] = useState(false);
  const set = (p: Partial<typeof f>) => { setF((x) => ({ ...x, ...p })); setDirty(true); };
  const setB = (b: any) => { setBody(b); setDirty(true); };
  const changeType = (t: string) => { set({ type: t }); setBody(emptyBody(t)); };

  const save = async () => {
    if (!f.prompt.trim()) return toast("اكتب نص السؤال", true);
    const clean = structuredClone(body);
    if (f.type === "fill_blank") { clean.accepted = (clean.accepted ?? []).filter(Boolean); clean.choices = (clean.choices ?? []).filter(Boolean); if (clean.choices.length && !clean.choices.includes(clean.answer)) clean.choices.push(clean.answer); }
    const bad = validateBody(f.type, clean); if (bad) return toast(bad, true);
    if (!f.game_templates.length) return toast("اختر قالب لعبة واحدًا على الأقل", true);
    setSaving(true);
    const row = { ...f, body: clean, ref_id: f.ref_id || null, skill: f.skill || null, subject: f.subject || null, explanation: f.explanation || null, updated_at: new Date().toISOString() };
    const res = q ? await supabase.from("questions").update(row).eq("id", q.id) : await supabase.from("questions").insert(row);
    setSaving(false);
    if (res.error) return toast("تعذر الحفظ: " + res.error.message, true);
    toast("تم حفظ السؤال"); setDirty(false); onSaved();
  };

  const opts = body.options as string[] | undefined;
  const list = (key: "options" | "items") => (
    <div className="col">
      {(body[key] as string[]).map((v, i) => (
        <div className="row" key={i} style={{ flexWrap: "nowrap" }}>
          {key === "options" && <input type="radio" name="correct" checked={body.correct === i} onChange={() => setB({ ...body, correct: i })} aria-label={`الخيار ${i + 1} هو الصحيح`} />}
          {key === "items" && <span className="rank">{i + 1}</span>}
          <input className="field tashkeel" style={{ fontSize: "1.1rem" }} value={v} placeholder={key === "options" ? `الخيار ${i + 1}` : `العنصر ${i + 1}`} onChange={(e) => { const a = [...body[key]]; a[i] = e.target.value; setB({ ...body, [key]: a }); }} />
          <button type="button" className="icon-btn" aria-label="حذف" disabled={body[key].length <= 2} onClick={() => { const a = body[key].filter((_: any, j: number) => j !== i); setB({ ...body, [key]: a, correct: key === "options" ? Math.min(body.correct, a.length - 1) : undefined }); }}><Trash2 size={16} /></button>
        </div>
      ))}
      {body[key].length < (key === "options" ? 6 : 8) && <button type="button" className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => setB({ ...body, [key]: [...body[key], ""] })}><Plus size={16} />إضافة</button>}
      {key === "options" && <span className="small muted">حدّد الدائرة بجانب الإجابة الصحيحة.</span>}
      {key === "items" && <span className="small muted">اكتب العناصر بالترتيب الصحيح؛ سيخلطها الموقع للطالب.</span>}
    </div>
  );

  return (
    <>
      <Modal title={q ? "تعديل سؤال" : "سؤال جديد"} wide onClose={() => (dirty ? setConfirmClose(true) : onClose())}>
        <div ref={box} className="col" style={{ gap: 16 }}>
          <TashkeelBar scope={box} />
          <div className="grid g3">
            <label className="f">التناول<select className="field" value={f.topic} onChange={(e) => set({ topic: e.target.value })}>{TOPICS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
            <label className="f">نوع السؤال<select className="field" value={f.type} onChange={(e) => changeType(e.target.value)} disabled={!!q}>{QTYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
            <label className="f">الصعوبة<select className="field" value={f.difficulty} onChange={(e) => set({ difficulty: +e.target.value })}>{[1, 2, 3].map((d) => <option key={d} value={d}>{DIFFICULTY[d]}</option>)}</select></label>
          </div>
          <div className="grid g2">
            <label className="f">المهارة<input className="field" value={f.skill} onChange={(e) => set({ skill: e.target.value })} placeholder="مثال: الفاعل" /></label>
            <label className="f">الموضوع<input className="field" value={f.subject} onChange={(e) => set({ subject: e.target.value })} placeholder="مثال: الحيوانات" /></label>
          </div>
          <label className="f">نص السؤال (يدعم التشكيل)<textarea className="field tashkeel" rows={2} value={f.prompt} onChange={(e) => set({ prompt: e.target.value })} /></label>

          {(f.type === "mcq" || f.type === "quick") && opts && list("options")}
          {f.type === "true_false" && <div className="row"><label className="check"><input type="radio" checked={body.correct === true} onChange={() => setB({ correct: true })} />الإجابة الصحيحة: صح</label><label className="check"><input type="radio" checked={body.correct === false} onChange={() => setB({ correct: false })} />خطأ</label></div>}
          {f.type === "ordering" && list("items")}
          {f.type === "matching" && (
            <div className="col">
              {body.pairs.map((p: any, i: number) => (
                <div className="row" key={i} style={{ flexWrap: "nowrap" }}>
                  <input className="field tashkeel" value={p.left} placeholder="الطرف الأول" onChange={(e) => { const a = [...body.pairs]; a[i] = { ...p, left: e.target.value }; setB({ pairs: a }); }} />
                  <span>⟷</span>
                  <input className="field tashkeel" value={p.right} placeholder="ما يطابقه" onChange={(e) => { const a = [...body.pairs]; a[i] = { ...p, right: e.target.value }; setB({ pairs: a }); }} />
                  <button type="button" className="icon-btn" aria-label="حذف" disabled={body.pairs.length <= 2} onClick={() => setB({ pairs: body.pairs.filter((_: any, j: number) => j !== i) })}><Trash2 size={16} /></button>
                </div>
              ))}
              {body.pairs.length < 6 && <button type="button" className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => setB({ pairs: [...body.pairs, { left: "", right: "" }] })}><Plus size={16} />إضافة زوج</button>}
            </div>
          )}
          {f.type === "fill_blank" && (
            <div className="col">
              <label className="f">الإجابة الصحيحة<input className="field tashkeel" value={body.answer} onChange={(e) => setB({ ...body, answer: e.target.value })} /></label>
              <label className="f">إجابات أخرى مقبولة (افصل بينها بفاصلة «،»)<input className="field tashkeel" value={(body.accepted ?? []).join("، ")} onChange={(e) => setB({ ...body, accepted: e.target.value.split(/[،,]/).map((x) => x.trim()) })} /></label>
              <label className="f">خيارات للاختيار منها (اختياري — اتركه فارغًا ليكتب الطالب)<input className="field tashkeel" value={(body.choices ?? []).join("، ")} onChange={(e) => setB({ ...body, choices: e.target.value.split(/[،,]/).map((x) => x.trim()) })} /></label>
              <label className="check"><input type="checkbox" checked={body.strict !== false} onChange={(e) => setB({ ...body, strict: e.target.checked })} />تمييز الهمزات والتاء المربوطة والألف المقصورة (مناسب للإملاء). التشكيل لا يُحتسب في المقارنة.</label>
            </div>
          )}

          <label className="f">شرح الإجابة (يظهر للطالب بعد الإجابة)<textarea className="field tashkeel" rows={2} value={f.explanation} onChange={(e) => set({ explanation: e.target.value })} /></label>
          <div className="grid g2">
            <label className="f">المرجع المرتبط<select className="field" value={f.ref_id} onChange={(e) => set({ ref_id: e.target.value })}><option value="">— بلا مرجع —</option>{refs.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</select></label>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend style={{ fontWeight: 600, fontSize: ".94rem", marginBottom: 6 }}>قوالب الألعاب الصالحة لهذا السؤال</legend>
              <div className="col" style={{ gap: 6 }}>{GAMES.map((g) => <label key={g.id} className="check"><input type="checkbox" checked={f.game_templates.includes(g.id)} onChange={(e) => set({ game_templates: e.target.checked ? [...f.game_templates, g.id] : f.game_templates.filter((x) => x !== g.id) })} />{g.label}</label>)}</div></fieldset>
          </div>
        </div>
        <div className="savebar" style={{ marginTop: 16, position: "static" }}>
          <span className={"dot" + (dirty ? " dirty" : "")} /><span className="grow small">{dirty ? "توجد تعديلات غير محفوظة" : "لا تعديلات"}</span>
          <button className="btn ghost sm" onClick={() => (dirty ? setConfirmClose(true) : onClose())}>إلغاء</button>
          <button className="btn sm" disabled={saving || (!dirty && !!q)} onClick={save}>{saving ? "جارٍ الحفظ…" : "حفظ السؤال"}</button>
        </div>
      </Modal>
      {confirmClose && <Confirm text="لديك تعديلات غير محفوظة. هل تريد الإغلاق وتجاهلها؟" yes="تجاهل وإغلاق" danger onNo={() => setConfirmClose(false)} onYes={onClose} />}
    </>
  );
}
