import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, School, Users } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { Klass } from "../../lib/types";
import { genJoinCode } from "../../lib/util";
import { Empty, ErrorBox, Loading, Modal, useAsync, useToast } from "../../lib/ui";
import { PageHead } from "../../components/bits";

export default function Classes() {
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(async () => {
    const [c, s, j] = await Promise.all([
      supabase.from("classes").select("*").is("archived_at", null).order("created_at"),
      supabase.from("students").select("id,class_id").is("archived_at", null),
      supabase.from("join_requests").select("id,class_id").eq("status", "pending"),
    ]);
    if (c.error) throw new Error(c.error.message);
    return { classes: c.data as Klass[], students: s.data ?? [], pending: j.data ?? [] };
  });
  const [open, setOpen] = useState(false); const [name, setName] = useState(""); const [grade, setGrade] = useState(""); const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim()) return toast("اكتب اسم الفصل", true);
    setBusy(true);
    let err = "";
    for (let i = 0; i < 5; i++) {
      const { error } = await supabase.from("classes").insert({ name: name.trim(), grade: grade.trim() || null, join_code: genJoinCode() });
      if (!error) { err = ""; break; }
      err = error.message; if (!/duplicate|unique/i.test(error.message)) break;   // تكرار رمز نادر: نعيد بمحاولة جديدة
    }
    setBusy(false);
    if (err) return toast("تعذر إنشاء الفصل: " + err, true);
    toast("تم إنشاء الفصل"); setOpen(false); setName(""); setGrade(""); reload();
  };

  if (loading) return <Loading />; if (error) return <ErrorBox msg={error} />;
  const { classes, students, pending } = data!;
  return (
    <div className="page">
      <PageHead title="فصولي" sub="أنشئ فصلًا وشارك رمزه مع طلابك ليطلبوا الانضمام."><button className="btn" onClick={() => setOpen(true)}><Plus size={18} />فصل جديد</button></PageHead>
      {!classes.length ? <div className="glass card"><Empty icon={<School size={44} />} text="لا توجد فصول بعد. ابدأ بإنشاء أول فصل."><button className="btn" onClick={() => setOpen(true)}>إنشاء فصل</button></Empty></div> : (
        <div className="auto-grid">
          {classes.map((c) => {
            const n = students.filter((s) => s.class_id === c.id).length, p = pending.filter((x) => x.class_id === c.id).length;
            return (
              <Link key={c.id} to={`/teacher/classes/${c.id}`} className="glass card hover col" style={{ textDecoration: "none", color: "var(--text)" }}>
                <div className="row"><span className="brand-mark" style={{ width: 44, height: 44 }}><Users size={22} /></span><div className="grow"><h3 style={{ margin: 0 }}>{c.name}</h3><span className="small muted">{c.grade ?? "—"}</span></div>{p > 0 && <span className="chip warn">{p} طلب</span>}</div>
                <div className="row small"><span className="chip">{n} طالبًا</span><span className="chip info" dir="ltr">{c.join_code}</span>{!c.show_leaderboard && <span className="chip">اللوحة مخفية</span>}</div>
              </Link>);
          })}
        </div>)}
      {open && (
        <Modal title="فصل جديد" onClose={() => setOpen(false)}>
          <div className="col">
            <label className="f">اسم الفصل<input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: الرابع / 2" autoFocus /></label>
            <label className="f">المرحلة / الصف (اختياري)<input className="field" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="مثال: الصف الرابع الابتدائي" /></label>
            <p className="small muted">سيُولَّد رمز انضمام عشوائي تعطيه لطلابك.</p>
            <button className="btn" disabled={busy} onClick={create}>{busy ? "جارٍ الإنشاء…" : "إنشاء"}</button>
          </div>
        </Modal>)}
    </div>
  );
}
