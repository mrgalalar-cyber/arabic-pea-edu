import { useState } from "react";
import { Copy, Link2, ShieldCheck } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { api } from "../../lib/api";
import type { Invite, Klass, Teacher } from "../../lib/types";
import { copyText, fmtDate } from "../../lib/util";
import { Empty, ErrorBox, Loading, Modal, useAsync, useToast } from "../../lib/ui";
import { Avatar, PageHead } from "../../components/bits";
import { useAuth } from "../../lib/auth";

export default function Teachers() {
  const { me } = useAuth(); const toast = useToast();
  const { data, loading, error, reload } = useAsync(async () => {
    const [t, i, c] = await Promise.all([
      supabase.from("teachers").select("*").order("created_at"), supabase.from("teacher_invites").select("*").order("created_at", { ascending: false }),
      supabase.from("classes").select("id,teacher_id").is("archived_at", null),
    ]);
    if (t.error) throw new Error(t.error.message);
    return { teachers: t.data as Teacher[], invites: (i.data ?? []) as Invite[], classes: (c.data ?? []) as Pick<Klass, "id" | "teacher_id">[] };
  });
  const [open, setOpen] = useState(false); const [label, setLabel] = useState(""); const [email, setEmail] = useState(""); const [days, setDays] = useState("7");
  const [link, setLink] = useState(""); const [busy, setBusy] = useState(false);

  if (me?.role !== "owner") return <div className="notice bad">هذه الصفحة للمالك فقط.</div>;
  if (loading) return <Loading />; if (error) return <ErrorBox msg={error} />;

  const create = async () => {
    setBusy(true);
    try { const r = await api<{ token: string }>("manage", { action: "createInvite", label, email: email || undefined, days: +days }); setLink(`${location.origin}/teacher/invite/${r.token}`); reload(); }
    catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  };
  const state = (i: Invite) => i.revoked_at ? ["ملغاة", "bad"] : i.used_at ? ["مستخدمة", "good"] : new Date(i.expires_at) < new Date() ? ["منتهية", "warn"] : ["فعّالة", "info"];
  const patchT = async (t: Teacher, status: "active" | "suspended") => { const { error } = await supabase.from("teachers").update({ status }).eq("id", t.id); if (error) return toast(error.message, true); toast(status === "active" ? "أُعيد تفعيل المعلم" : "أُوقف المعلم"); reload(); };

  return (
    <div className="page">
      <PageHead title="المعلمون والدعوات" sub="المعلم المدعو يدير فصوله وطلابه ومحتواه فقط، ولا يرى بيانات غيره.">
        <button className="btn" onClick={() => { setOpen(true); setLink(""); setLabel(""); setEmail(""); }}><Link2 size={18} />دعوة معلم</button>
      </PageHead>
      <div className="glass card col"><h3 style={{ margin: 0 }}>المعلمون</h3>
        <div className="table-wrap"><table className="table"><thead><tr><th>المعلم</th><th>الدور</th><th>الفصول</th><th>انضم</th><th>الحالة</th><th /></tr></thead><tbody>
          {data!.teachers.map((t) => <tr key={t.id}><td><div className="row" style={{ flexWrap: "nowrap" }}><Avatar name={t.display_name || t.email} size={32} /><div><b>{t.display_name || "—"}</b><div className="small muted" dir="ltr">{t.email}</div></div></div></td>
            <td>{t.is_primary ? <span className="chip info"><ShieldCheck size={12} />المالك</span> : "معلم"}</td><td>{data!.classes.filter((c) => c.teacher_id === t.id).length}</td><td className="small muted">{fmtDate(t.created_at)}</td>
            <td><span className={"chip " + (t.status === "active" ? "good" : "bad")}>{t.status === "active" ? "نشط" : "موقوف"}</span></td>
            <td>{!t.is_primary && (t.status === "active" ? <button className="btn danger sm" onClick={() => patchT(t, "suspended")}>إيقاف</button> : <button className="btn ghost sm" onClick={() => patchT(t, "active")}>تفعيل</button>)}</td></tr>)}
        </tbody></table></div>
        <p className="small muted">إيقاف المعلم يمنعه فورًا من الوصول لبياناته دون حذفها، وتبقى ظاهرة لك.</p>
      </div>
      <div className="glass card col"><h3 style={{ margin: 0 }}>الدعوات</h3>
        {!data!.invites.length ? <Empty text="لم تُنشأ دعوات بعد." /> : <div className="table-wrap"><table className="table"><thead><tr><th>الوصف</th><th>مقيّدة بالبريد</th><th>تنتهي</th><th>الحالة</th><th /></tr></thead><tbody>
          {data!.invites.map((i) => { const [txt, cls] = state(i); return <tr key={i.id}><td>{i.label || "—"}</td><td dir="ltr" className="small">{i.email ?? "أي بريد Google"}</td><td className="small muted">{fmtDate(i.expires_at)}</td><td><span className={"chip " + cls}>{txt}</span></td>
            <td>{txt === "فعّالة" && <button className="btn danger sm" onClick={async () => { await supabase.from("teacher_invites").update({ revoked_at: new Date().toISOString() }).eq("id", i.id); toast("أُلغيت الدعوة"); reload(); }}>إلغاء</button>}</td></tr>; })}
        </tbody></table></div>}
      </div>
      {open && <Modal title="دعوة معلم جديد" onClose={() => setOpen(false)}>
        {!link ? <div className="col">
          <label className="f">وصف للدعوة (لك فقط)<input className="field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="مثال: أ. سارة" /></label>
          <label className="f">تقييد ببريد Google (اختياري، أكثر أمانًا)<input className="field" dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teacher@gmail.com" /></label>
          <label className="f">صلاحية الرابط<select className="field" value={days} onChange={(e) => setDays(e.target.value)}>{[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} يوم</option>)}</select></label>
          <button className="btn" disabled={busy} onClick={create}>إنشاء الرابط</button></div>
        : <div className="col"><div className="notice">انسخ الرابط الآن وأرسله للمعلم؛ لا يمكن عرضه مرة أخرى. الرابط يعمل مرة واحدة فقط.</div><div className="big-code" style={{ fontSize: ".85rem", letterSpacing: 0, wordBreak: "break-all" }}>{link}</div>
          <button className="btn" onClick={async () => toast((await copyText(link)) ? "نُسخ الرابط" : "تعذر النسخ", false)}><Copy size={16} />نسخ الرابط</button></div>}
      </Modal>}
    </div>
  );
}
