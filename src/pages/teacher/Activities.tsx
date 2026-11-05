import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, BarChart3, ClipboardList, Eye, EyeOff, Pencil, Plus } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { DEFAULT_SETTINGS } from "../../lib/grading";
import { GAMES, TOPICS, gameLabel, topicLabel } from "../../lib/constants";
import type { Activity, Klass, Question, Ref, Student } from "../../lib/types";
import { fmtDateTime, fromLocalInput, toLocalInput } from "../../lib/util";
import { Confirm, Empty, ErrorBox, Loading, Modal, useAsync, useToast } from "../../lib/ui";
import { PageHead } from "../../components/bits";

export default function Activities() {
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(async () => {
    const [a, c, s, q, r] = await Promise.all([
      supabase.from("activities").select("*").is("archived_at", null).order("created_at", { ascending: false }),
      supabase.from("classes").select("*").is("archived_at", null).order("name"),
      supabase.from("students").select("id,class_id,full_name").is("archived_at", null).order("full_name"),
      supabase.from("questions").select("*").is("archived_at", null).eq("status", "approved").order("created_at", { ascending: false }),
      supabase.from("learning_refs").select("*").is("archived_at", null),
    ]);
    if (a.error) throw new Error(a.error.message);
    return { acts: a.data as Activity[], classes: c.data as Klass[], students: s.data as Pick<Student, "id" | "class_id" | "full_name">[], questions: q.data as Question[], refs: r.data as Ref[] };
  });
  const [edit, setEdit] = useState<Activity | "new" | null>(null); const [arch, setArch] = useState<Activity | null>(null);

  const toggle = async (a: Activity) => {
    const next = a.status === "published" ? "draft" : "published";
    const { error } = await supabase.from("activities").update({ status: next }).eq("id", a.id);
    if (error) return toast(error.message, true); toast(next === "published" ? "نُشر النشاط للطلاب" : "أُعيد إلى المسودة"); reload();
  };
  if (loading) return <Loading />; if (error) return <ErrorBox msg={error} />;
  const { acts, classes, questions } = data!;
  const cname = (id: string) => classes.find((c) => c.id === id)?.name ?? "—";
  return (
    <div className="page">
      <PageHead title="الواجبات والأنشطة" sub="اختر أسئلة من بنكك، وحدّد الفصل والألعاب والمواعيد، ثم انشر.">
        <button className="btn" disabled={!classes.length || !questions.length} onClick={() => setEdit("new")}><Plus size={18} />نشاط جديد</button>
      </PageHead>
      {(!classes.length || !questions.length) && <div className="notice">لإنشاء نشاط تحتاج إلى {!classes.length ? "فصل واحد على الأقل" : "أسئلة معتمدة في بنكك"} {!classes.length ? <Link to="/teacher/classes">إنشاء فصل</Link> : <Link to="/teacher/questions">بنك الأسئلة</Link>}.</div>}
      {!acts.length ? <div className="glass card"><Empty icon={<ClipboardList size={44} />} text="لا توجد أنشطة بعد." /></div> : (
        <div className="col">{acts.map((a) => (
          <article key={a.id} className="glass card hover">
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div className="grow">
                <div className="row" style={{ gap: 6, marginBottom: 6 }}>
                  <span className={"chip " + (a.status === "published" ? "good" : "warn")}>{a.status === "published" ? "منشور" : "مسودة"}</span>
                  <span className="chip info">{cname(a.class_id)}</span><span className="chip">{a.required ? "واجب" : "اختياري"}</span>
                  {a.templates.map((t) => <span className="chip" key={t}>{gameLabel(t)}</span>)}
                </div>
                <h3 style={{ margin: 0 }}>{a.title}</h3>
                <div className="small muted">{a.question_ids.length} سؤالًا · {a.opens_at ? "يفتح " + fmtDateTime(a.opens_at) : "مفتوح"} · {a.closes_at ? "يغلق " + fmtDateTime(a.closes_at) : "بلا إغلاق"}</div>
              </div>
              <div className="row">
                <Link to={`/teacher/activities/${a.id}/results`} className="btn ghost sm"><BarChart3 size={16} />النتائج</Link>
                <button className="btn ghost sm" onClick={() => toggle(a)}>{a.status === "published" ? <><EyeOff size={16} />إلغاء النشر</> : <><Eye size={16} />نشر</>}</button>
                <button className="icon-btn" aria-label="تعديل" onClick={() => setEdit(a)}><Pencil size={17} /></button>
                <button className="icon-btn" aria-label="أرشفة" onClick={() => setArch(a)}><Archive size={17} /></button>
              </div>
            </div>
          </article>))}</div>)}
      {edit && <ActivityEditor act={edit === "new" ? null : edit} data={data!} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {arch && <Confirm text={`أرشفة «${arch.title}»؟ تبقى نتائجه محفوظة ويمكن استرجاعه.`} yes="أرشفة" onNo={() => setArch(null)} onYes={async () => { await supabase.from("activities").update({ archived_at: new Date().toISOString() }).eq("id", arch.id); setArch(null); toast("نُقل إلى الأرشيف"); reload(); }} />}
    </div>
  );
}

function ActivityEditor({ act, data, onClose, onSaved }: { act: Activity | null; data: { classes: Klass[]; students: Pick<Student, "id" | "class_id" | "full_name">[]; questions: Question[]; refs: Ref[] }; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState(() => ({
    title: act?.title ?? "", description: act?.description ?? "", class_id: act?.class_id ?? data.classes[0]?.id ?? "",
    target: act?.student_ids ? "some" : "all", student_ids: act?.student_ids ?? ([] as string[]), question_ids: act?.question_ids ?? ([] as string[]),
    required: act?.required ?? false, opens_at: toLocalInput(act?.opens_at), closes_at: toLocalInput(act?.closes_at),
    templates: act?.templates ?? ["race"], ref_id: act?.ref_id ?? "", status: act?.status ?? "draft",
    s: { ...DEFAULT_SETTINGS, ...(act?.settings ?? {}) },
  }));
  const [dirty, setDirty] = useState(false); const [saving, setSaving] = useState(false); const [tf, setTf] = useState({ topic: "", text: "" }); const [confirm, setConfirm] = useState(false);
  const set = (p: Partial<typeof f>) => { setF((x) => ({ ...x, ...p })); setDirty(true); };
  const cls = data.classes.find((c) => c.id === f.class_id);
  const pool = useMemo(() => data.questions.filter((q) => q.teacher_id === cls?.teacher_id && (!tf.topic || q.topic === tf.topic) && (!tf.text || q.prompt.includes(tf.text))), [data.questions, cls, tf]);
  const chosen = data.questions.filter((q) => f.question_ids.includes(q.id));
  const allowed = GAMES.filter((g) => chosen.every((q) => q.game_templates.includes(g.id)));
  const stu = data.students.filter((s) => s.class_id === f.class_id);
  const refs = data.refs.filter((r) => r.teacher_id === cls?.teacher_id);

  const save = async () => {
    if (!f.title.trim()) return toast("اكتب عنوان النشاط", true);
    if (!f.class_id) return toast("اختر الفصل", true);
    if (!f.question_ids.length) return toast("اختر سؤالًا واحدًا على الأقل", true);
    if (!f.templates.length) return toast("اختر قالب لعبة واحدًا على الأقل", true);
    const bad = f.templates.filter((t) => !allowed.some((g) => g.id === t));
    if (bad.length) return toast(`القالب «${gameLabel(bad[0])}» لا يصلح لبعض الأسئلة المختارة`, true);
    if (f.target === "some" && !f.student_ids.length) return toast("اختر الطلاب المستهدفين أو اجعله لكل الفصل", true);
    if (f.opens_at && f.closes_at && new Date(f.closes_at) <= new Date(f.opens_at)) return toast("وقت الإغلاق يجب أن يكون بعد وقت الفتح", true);
    setSaving(true);
    const row = {
      title: f.title.trim(), description: f.description.trim() || null, class_id: f.class_id, student_ids: f.target === "some" ? f.student_ids : null,
      question_ids: f.question_ids, required: f.required, opens_at: fromLocalInput(f.opens_at), closes_at: fromLocalInput(f.closes_at),
      templates: f.templates, ref_id: f.ref_id || null, status: f.status, settings: f.s,
    };
    const res = act ? await supabase.from("activities").update(row).eq("id", act.id) : await supabase.from("activities").insert(row);
    setSaving(false); if (res.error) return toast("تعذر الحفظ: " + res.error.message, true);
    toast(act ? "تم حفظ النشاط" : "تم إنشاء النشاط"); setDirty(false); onSaved();
  };
  const num = (k: keyof typeof f.s, label: string, min = 0, max = 999) => <label className="f">{label}<input className="field" type="number" min={min} max={max} value={f.s[k] as number} onChange={(e) => set({ s: { ...f.s, [k]: Math.min(max, Math.max(min, +e.target.value || 0)) } })} /></label>;

  return (
    <>
      <Modal wide title={act ? "تعديل نشاط" : "نشاط جديد"} onClose={() => (dirty ? setConfirm(true) : onClose())}>
        <div className="col" style={{ gap: 18 }}>
          <div className="grid g2">
            <label className="f">العنوان<input className="field" value={f.title} onChange={(e) => set({ title: e.target.value })} /></label>
            <label className="f">الفصل<select className="field" value={f.class_id} disabled={!!act} onChange={(e) => set({ class_id: e.target.value, question_ids: [], student_ids: [], ref_id: "" })}>{data.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          </div>
          <label className="f">وصف مختصر (اختياري)<input className="field" value={f.description} onChange={(e) => set({ description: e.target.value })} /></label>

          <fieldset className="glass card col" style={{ border: 0 }}><legend className="small muted">المستهدفون</legend>
            <div className="row"><label className="check"><input type="radio" checked={f.target === "all"} onChange={() => set({ target: "all" })} />كل طلاب الفصل</label><label className="check"><input type="radio" checked={f.target === "some"} onChange={() => set({ target: "some" })} />طلاب محددون</label></div>
            {f.target === "some" && <div className="auto-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 6 }}>{stu.map((s) => <label key={s.id} className="check"><input type="checkbox" checked={f.student_ids.includes(s.id)} onChange={(e) => set({ student_ids: e.target.checked ? [...f.student_ids, s.id] : f.student_ids.filter((x) => x !== s.id) })} />{s.full_name}</label>)}</div>}
          </fieldset>

          <fieldset className="glass card col" style={{ border: 0 }}><legend className="small muted">الأسئلة ({f.question_ids.length} مختارة)</legend>
            <div className="row"><input className="field" style={{ flex: "2 1 160px" }} placeholder="بحث" value={tf.text} onChange={(e) => setTf({ ...tf, text: e.target.value })} aria-label="بحث" />
              <select className="field" style={{ flex: "1 1 140px" }} value={tf.topic} onChange={(e) => setTf({ ...tf, topic: e.target.value })} aria-label="التناول"><option value="">كل التناولات</option>{TOPICS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
              <button type="button" className="btn ghost sm" onClick={() => set({ question_ids: [...new Set([...f.question_ids, ...pool.map((q) => q.id)])] })}>تحديد الظاهر</button>
              <button type="button" className="btn ghost sm" onClick={() => set({ question_ids: [] })}>مسح</button></div>
            <div className="col" style={{ maxHeight: 280, overflow: "auto", gap: 4 }}>
              {pool.map((q) => <label key={q.id} className="check glass" style={{ padding: "8px 12px", borderRadius: 12, alignItems: "flex-start" }}><input type="checkbox" style={{ marginTop: 6 }} checked={f.question_ids.includes(q.id)} onChange={(e) => set({ question_ids: e.target.checked ? [...f.question_ids, q.id] : f.question_ids.filter((x) => x !== q.id) })} /><span><span className="tashkeel">{q.prompt}</span> <span className="chip info">{topicLabel(q.topic)}</span></span></label>)}
              {!pool.length && <p className="muted">لا توجد أسئلة مطابقة في بنك معلم هذا الفصل.</p>}
            </div>
          </fieldset>

          <div className="grid g2">
            <fieldset className="glass card col" style={{ border: 0 }}><legend className="small muted">قوالب الألعاب</legend>
              {GAMES.map((g) => { const ok = allowed.some((x) => x.id === g.id); return <label key={g.id} className="check" style={{ opacity: ok ? 1 : .5 }}><input type="checkbox" disabled={!ok} checked={f.templates.includes(g.id)} onChange={(e) => set({ templates: e.target.checked ? [...f.templates, g.id] : f.templates.filter((x) => x !== g.id) })} />{g.label}{!ok && <span className="small muted">(لا يصلح لبعض الأسئلة)</span>}</label>; })}
              <span className="small muted">عند اختيار أكثر من قالب يختار الطالب منها قبل البدء.</span></fieldset>
            <fieldset className="glass card col" style={{ border: 0 }}><legend className="small muted">الوقت والنوع</legend>
              <label className="f">يفتح (اختياري)<input className="field" type="datetime-local" value={f.opens_at} onChange={(e) => set({ opens_at: e.target.value })} /></label>
              <label className="f">يغلق (اختياري)<input className="field" type="datetime-local" value={f.closes_at} onChange={(e) => set({ closes_at: e.target.value })} /></label>
              <label className="check"><input type="checkbox" checked={f.required} onChange={(e) => set({ required: e.target.checked })} />واجب (عدم المشاركة يظهر في تقاريرك)</label></fieldset>
          </div>

          <fieldset className="glass card col" style={{ border: 0 }}><legend className="small muted">الدرجات والإعدادات</legend>
            <div className="grid g4 g-keep2">{num("pointsPerCorrect", "درجة الإجابة الصحيحة", 1, 100)}{num("speedBonusMax", "أقصى نقاط طاقة", 0, 100)}{num("secondsPerQuestion", "ثوانٍ لكل سؤال", 5, 300)}{num("maxAttempts", "عدد المحاولات", 1, 20)}</div>
            <div className="row"><label className="check"><input type="checkbox" checked={f.s.timer} onChange={(e) => set({ s: { ...f.s, timer: e.target.checked } })} />إظهار المؤقت</label><label className="check"><input type="checkbox" checked={f.s.allowPause} onChange={(e) => set({ s: { ...f.s, allowPause: e.target.checked } })} />السماح بالإيقاف المؤقت وفتح المرجع</label></div>
            <div className="notice info small"><b>طريقة الاحتساب:</b> كل إجابة صحيحة = {f.s.pointsPerCorrect} نقطة كما هي، تُضاف إليها نقاط طاقة حتى {f.s.speedBonusMax} للإجابة الصحيحة السريعة (تتناقص خطيًا حتى تبلغ صفرًا عند {f.s.secondsPerQuestion} ث). الإجابة الخاطئة 0. عند تساوي المجموع يتقدّم الأسرع زمنًا.</div>
          </fieldset>

          <div className="grid g2">
            <label className="f">المرجع المصاحب (يفتحه الطالب أثناء الإيقاف المؤقت)<select className="field" value={f.ref_id} onChange={(e) => set({ ref_id: e.target.value })}><option value="">— بلا مرجع —</option>{refs.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</select></label>
            <label className="f">الحالة<select className="field" value={f.status} onChange={(e) => set({ status: e.target.value as "draft" | "published" })}><option value="draft">مسودة (لا يراها الطلاب)</option><option value="published">منشور</option></select></label>
          </div>
        </div>
        <div className="savebar" style={{ marginTop: 16, position: "static" }}><span className={"dot" + (dirty ? " dirty" : "")} /><span className="grow small">{dirty ? "توجد تعديلات غير محفوظة" : "لا تعديلات"}</span>
          <button className="btn ghost sm" onClick={() => (dirty ? setConfirm(true) : onClose())}>إلغاء</button><button className="btn sm" disabled={saving || (!dirty && !!act)} onClick={save}>{saving ? "جارٍ الحفظ…" : "حفظ"}</button></div>
      </Modal>
      {confirm && <Confirm text="لديك تعديلات غير محفوظة. تجاهلها؟" yes="تجاهل" danger onNo={() => setConfirm(false)} onYes={onClose} />}
    </>
  );
}
