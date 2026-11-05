import { useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { TOPICS, topicLabel } from "../../lib/constants";
import type { Ref } from "../../lib/types";
import { Confirm, Empty, ErrorBox, Loading, Modal, useAsync, useToast } from "../../lib/ui";
import { PageHead } from "../../components/bits";

/** إدارة المحتوى: القطع والمراجع (نصوص قراءة، قواعد، قوائم كلمات…) مرتبة حسب التناول، خاصة بالمعلم. */
export default function Content() {
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(async () => {
    const r = await supabase.from("learning_refs").select("*").is("archived_at", null).order("created_at", { ascending: false });
    if (r.error) throw new Error(r.error.message); return r.data as Ref[];
  });
  const [topic, setTopic] = useState("");
  const [edit, setEdit] = useState<Partial<Ref> | null>(null);
  const [dirty, setDirty] = useState(false); const [saving, setSaving] = useState(false); const [arch, setArch] = useState<Ref | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const close = () => (dirty ? setConfirmClose(true) : setEdit(null));

  const save = async () => {
    if (!edit?.title?.trim() || !edit.content?.trim()) return toast("اكتب العنوان والمحتوى", true);
    setSaving(true);
    const row = { title: edit.title.trim(), topic: edit.topic || null, content: edit.content };
    const res = edit.id ? await supabase.from("learning_refs").update(row).eq("id", edit.id) : await supabase.from("learning_refs").insert(row);
    setSaving(false); if (res.error) return toast(res.error.message, true);
    toast("تم الحفظ"); setEdit(null); setDirty(false); reload();
  };
  const archive = async () => { if (!arch) return; await supabase.from("learning_refs").update({ archived_at: new Date().toISOString() }).eq("id", arch.id); setArch(null); toast("نُقل إلى الأرشيف"); reload(); };

  if (loading) return <Loading />; if (error) return <ErrorBox msg={error} />;
  const list = (data ?? []).filter((r) => !topic || r.topic === topic);
  return (
    <div className="page">
      <PageHead title="إدارة المحتوى" sub="قطع القراءة والمراجع التعليمية التي تربطها بأسئلتك وأنشطتك.">
        <button className="btn" onClick={() => { setEdit({ topic: topic || "reading", title: "", content: "" }); setDirty(false); }}><Plus size={18} />مرجع جديد</button>
      </PageHead>
      <div className="tabs" role="tablist"><button className={!topic ? "on" : ""} onClick={() => setTopic("")}>الكل</button>{TOPICS.map((t) => <button key={t.id} className={topic === t.id ? "on" : ""} onClick={() => setTopic(t.id)}>{t.label}</button>)}</div>
      {!list.length ? <div className="glass card"><Empty icon={<BookOpen size={40} />} text="لا توجد مراجع هنا بعد." /></div> : (
        <div className="auto-grid">{list.map((r) => (
          <article key={r.id} className="glass card hover col">
            <span className="chip info" style={{ alignSelf: "flex-start" }}>{topicLabel(r.topic ?? "")}</span>
            <h3 style={{ margin: 0 }} className="tashkeel">{r.title}</h3>
            <p className="tashkeel muted" style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", margin: 0 }}>{r.content}</p>
            <div className="row"><button className="btn ghost sm" onClick={() => { setEdit(r); setDirty(false); }}>تعديل</button><button className="btn danger sm" onClick={() => setArch(r)}>أرشفة</button></div>
          </article>))}
        </div>)}
      {edit && (
        <Modal title={edit.id ? "تعديل مرجع" : "مرجع جديد"} onClose={close}>
          <div className="col">
            <label className="f">العنوان<input className="field tashkeel" value={edit.title ?? ""} onChange={(e) => { setEdit({ ...edit, title: e.target.value }); setDirty(true); }} /></label>
            <label className="f">التناول<select className="field" value={edit.topic ?? ""} onChange={(e) => { setEdit({ ...edit, topic: e.target.value }); setDirty(true); }}>{TOPICS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
            <label className="f">المحتوى (يدعم التشكيل)<textarea className="field tashkeel" rows={8} value={edit.content ?? ""} onChange={(e) => { setEdit({ ...edit, content: e.target.value }); setDirty(true); }} /></label>
            <div className="savebar" style={{ position: "static" }}><span className={"dot" + (dirty ? " dirty" : "")} /><span className="grow small">{dirty ? "توجد تعديلات غير محفوظة" : "لا تعديلات"}</span><button className="btn sm" disabled={saving || (!dirty && !!edit.id)} onClick={save}>حفظ</button></div>
          </div>
        </Modal>)}
      {confirmClose && <Confirm text="لديك تعديلات غير محفوظة. تجاهلها؟" yes="تجاهل" danger onNo={() => setConfirmClose(false)} onYes={() => { setConfirmClose(false); setEdit(null); setDirty(false); }} />}
      {arch && <Confirm text={`أرشفة «${arch.title}»؟ يمكن استرجاعها من الأرشيف.`} yes="أرشفة" onNo={() => setArch(null)} onYes={archive} />}
    </div>
  );
}
