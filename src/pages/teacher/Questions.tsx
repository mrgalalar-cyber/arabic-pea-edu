import { useMemo, useState } from "react";
import { Archive, Copy, Pencil, Plus, Sparkles, Wand2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { DIFFICULTY, GAMES, QTYPES, TOPICS, qtypeLabel, topicLabel } from "../../lib/constants";
import type { Question, Ref } from "../../lib/types";
import { Confirm, Empty, ErrorBox, Loading, useAsync, useToast } from "../../lib/ui";
import { PageHead } from "../../components/bits";
import { QuestionEditor } from "../../components/QuestionEditor";
import { seedSamples } from "../../lib/samples";

export default function Questions() {
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(async () => {
    const [q, r] = await Promise.all([
      supabase.from("questions").select("*").is("archived_at", null).order("created_at", { ascending: false }),
      supabase.from("learning_refs").select("*").is("archived_at", null).order("title"),
    ]);
    if (q.error) throw new Error(q.error.message);
    return { questions: q.data as Question[], refs: (r.data ?? []) as Ref[] };
  });
  const [f, setF] = useState({ topic: "", type: "", diff: "", text: "" });
  const [edit, setEdit] = useState<Question | null | "new">(null);
  const [archiving, setArchiving] = useState<Question | null>(null);
  const [seeding, setSeeding] = useState(false);

  const list = useMemo(() => (data?.questions ?? []).filter((q) =>
    (!f.topic || q.topic === f.topic) && (!f.type || q.type === f.type) && (!f.diff || q.difficulty === +f.diff) &&
    (!f.text || q.prompt.includes(f.text) || (q.skill ?? "").includes(f.text) || (q.subject ?? "").includes(f.text))), [data, f]);

  const duplicate = async (q: Question) => {
    const { id, created_at, updated_at, teacher_id, is_sample, ...rest } = q;
    const { error } = await supabase.from("questions").insert({ ...rest, prompt: q.prompt + " (نسخة)", is_sample: false });
    if (error) toast(error.message, true); else { toast("تم النسخ"); reload(); }
  };
  const archive = async () => {
    if (!archiving) return;
    const { error } = await supabase.from("questions").update({ archived_at: new Date().toISOString() }).eq("id", archiving.id);
    setArchiving(null); if (error) toast(error.message, true); else { toast("نُقل السؤال إلى الأرشيف (يمكن استرجاعه)"); reload(); }
  };
  const seed = async () => {
    setSeeding(true);
    try { const n = await seedSamples(); toast(`أُضيف ${n} سؤالًا تجريبيًا إلى بنكك`); reload(); } catch (e: any) { toast(e.message, true); } finally { setSeeding(false); }
  };

  if (loading) return <Loading />; if (error) return <ErrorBox msg={error} />;
  const all = data!.questions;
  return (
    <div className="page">
      <PageHead title="بنك الأسئلة" sub="أسئلتك الخاصة فقط — لا يراها معلم آخر.">
        <button className="btn ghost" disabled title="متاح في المرحلة 4: الذكاء الاصطناعي لا يعمل قبل ربط مفتاح Gemini في وظيفة خلفية"><Wand2 size={18} />توليد بـ Gemini <span className="chip warn">المرحلة 4</span></button>
        <button className="btn" onClick={() => setEdit("new")}><Plus size={18} />سؤال جديد</button>
      </PageHead>

      <div className="glass card row" role="search">
        <input className="field" style={{ flex: "2 1 200px" }} placeholder="بحث في النص أو المهارة أو الموضوع" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} aria-label="بحث" />
        <select className="field" style={{ flex: "1 1 140px" }} value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} aria-label="التناول"><option value="">كل التناولات</option>{TOPICS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
        <select className="field" style={{ flex: "1 1 140px" }} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} aria-label="النوع"><option value="">كل الأنواع</option>{QTYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
        <select className="field" style={{ flex: "1 1 120px" }} value={f.diff} onChange={(e) => setF({ ...f, diff: e.target.value })} aria-label="الصعوبة"><option value="">كل المستويات</option>{[1, 2, 3].map((d) => <option key={d} value={d}>{DIFFICULTY[d]}</option>)}</select>
      </div>

      {!all.length ? (
        <div className="glass card"><Empty icon={<Sparkles size={40} />} text="بنك أسئلتك فارغ. أنشئ سؤالك الأول، أو أضف مجموعة تجريبية موسومة «تجريبي» لتجربة المنصة.">
          <div className="row" style={{ justifyContent: "center" }}><button className="btn" onClick={() => setEdit("new")}>سؤال جديد</button><button className="btn ghost" disabled={seeding} onClick={seed}>{seeding ? "جارٍ الإضافة…" : "إضافة أسئلة تجريبية"}</button></div></Empty></div>
      ) : (<>
        <p className="small muted">{list.length} من {all.length} سؤالًا</p>
        <div className="col">
          {list.map((q) => (
            <article className="glass card hover" key={q.id}>
              <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                <div className="grow">
                  <div className="row" style={{ gap: 6, marginBottom: 6 }}>
                    <span className="chip info">{topicLabel(q.topic)}</span><span className="chip">{qtypeLabel(q.type)}</span><span className="chip">{DIFFICULTY[q.difficulty]}</span>
                    {q.skill && <span className="chip">{q.skill}</span>}{q.is_sample && <span className="sample-tag">تجريبي</span>}
                    {q.game_templates.map((g) => <span key={g} className="chip good">{GAMES.find((x) => x.id === g)?.label}</span>)}
                  </div>
                  <div className="tashkeel" style={{ fontWeight: 700 }}>{q.prompt}</div>
                </div>
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <button className="icon-btn" onClick={() => setEdit(q)} aria-label="تعديل" title="تعديل"><Pencil size={17} /></button>
                  <button className="icon-btn" onClick={() => duplicate(q)} aria-label="نسخ" title="نسخ"><Copy size={17} /></button>
                  <button className="icon-btn" onClick={() => setArchiving(q)} aria-label="أرشفة" title="أرشفة"><Archive size={17} /></button>
                </div>
              </div>
            </article>
          ))}
          {!list.length && <Empty text="لا توجد أسئلة مطابقة للتصفية." />}
        </div>
      </>)}

      {edit && <QuestionEditor q={edit === "new" ? null : edit} refs={data!.refs} defaults={{ topic: f.topic || undefined }} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {archiving && <Confirm text="سيُنقل السؤال إلى الأرشيف ولن يظهر عند إنشاء الأنشطة، ويمكنك استرجاعه لاحقًا. الأنشطة الحالية تحتفظ به." yes="أرشفة" onNo={() => setArchiving(null)} onYes={archive} />}
    </div>
  );
}
