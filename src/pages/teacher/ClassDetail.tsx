import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Archive, Ban, Check, Copy, KeyRound, MoveLeft, Pause, Play, UserPlus, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { api } from "../../lib/api";
import type { JoinRequest, Klass, Student } from "../../lib/types";
import { copyText, fmtDate, fmtDateTime } from "../../lib/util";
import { Confirm, Empty, ErrorBox, Loading, Modal, SaveBar, useAsync, useDirty, useToast } from "../../lib/ui";
import { Avatar, PageHead } from "../../components/bits";

export default function ClassDetail() {
  const { id = "" } = useParams(); const toast = useToast(); const nav = useNavigate();
  const [tab, setTab] = useState<"students" | "requests" | "settings">("students");
  const { data, loading, error, reload } = useAsync(async () => {
    const [c, s, r, all] = await Promise.all([
      supabase.from("classes").select("*").eq("id", id).maybeSingle(),
      supabase.from("students").select("*").eq("class_id", id).is("archived_at", null).order("full_name"),
      supabase.from("join_requests").select("*").eq("class_id", id).eq("status", "pending").order("created_at"),
      supabase.from("classes").select("id,name").is("archived_at", null).order("name"),
    ]);
    if (!c.data) throw new Error("الفصل غير موجود أو ليس من فصولك");
    return { cls: c.data as Klass, students: (s.data ?? []) as Student[], requests: (r.data ?? []) as JoinRequest[], classes: (all.data ?? []) as { id: string; name: string }[] };
  }, [id]);

  const [adding, setAdding] = useState(false); const [names, setNames] = useState("");
  const [moving, setMoving] = useState<Student | null>(null); const [moveTo, setMoveTo] = useState("");
  const [renaming, setRenaming] = useState<Student | null>(null); const [newName, setNewName] = useState("");
  const [blocking, setBlocking] = useState<Student | null>(null); const [days, setDays] = useState("3");
  const [archiving, setArchiving] = useState<Student | null>(null);
  const [code, setCode] = useState<{ name: string; code: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const upd = async (sid: string, patch: Partial<Student>, msg: string) => {
    const { error } = await supabase.from("students").update(patch).eq("id", sid);
    if (error) return toast(error.message, true); toast(msg); reload();
  };
  const addNames = async () => {
    const list = [...new Set(names.split(/\n/).map((n) => n.trim()).filter((n) => n.length >= 2))];
    if (!list.length) return toast("اكتب اسمًا واحدًا على الأقل (اسم في كل سطر)", true);
    const { error } = await supabase.from("students").insert(list.map((full_name) => ({ class_id: id, full_name })));
    if (error) return toast(error.message, true); toast(`أُضيف ${list.length} طالبًا`); setAdding(false); setNames(""); reload();
  };
  const decide = async (r: JoinRequest, action: "approve" | "reject") => {
    setBusy(true);
    try {
      const res = await api<{ code: string | null }>("manage", { action, requestId: r.id });
      toast(action === "approve" ? "تمت الموافقة" : "تم الرفض");
      if (action === "approve" && res.code) setCode({ name: r.requested_name, code: res.code });
      reload();
    } catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  };
  const reissue = async (s: Student) => {
    try { const r = await api<{ code: string }>("manage", { action: "reissueCode", studentId: s.id }); setCode({ name: s.full_name, code: r.code }); }
    catch (e: any) { toast(e.message, true); }
  };

  const { dirty, touch, clean } = useDirty();
  const [form, setForm] = useState<{ name: string; grade: string; show: boolean } | null>(null);
  const [saving, setSaving] = useState(false); const [archClass, setArchClass] = useState(false);
  const f = form ?? (data ? { name: data.cls.name, grade: data.cls.grade ?? "", show: data.cls.show_leaderboard } : null);
  const saveClass = async () => {
    if (!f) return; setSaving(true);
    const { error } = await supabase.from("classes").update({ name: f.name.trim(), grade: f.grade.trim() || null, show_leaderboard: f.show }).eq("id", id);
    setSaving(false); if (error) return toast(error.message, true); toast("تم حفظ إعدادات الفصل"); clean(); setForm(null); reload();
  };

  if (loading) return <Loading />; if (error) return <ErrorBox msg={error} />;
  const { cls, students, requests, classes } = data!;
  const stat = (s: Student) => s.status === "suspended" ? <span className="chip bad">موقوف</span> : s.blocked_until && new Date(s.blocked_until) > new Date() ? <span className="chip warn">محظور حتى {fmtDate(s.blocked_until)}</span> : <span className="chip good">نشط</span>;

  return (
    <div className="page">
      <PageHead title={cls.name} sub={cls.grade ?? undefined}>
        <span className="chip info" dir="ltr" title="رمز انضمام الفصل">{cls.join_code}</span>
        <button className="btn ghost sm" onClick={async () => toast((await copyText(cls.join_code)) ? "نُسخ الرمز" : "تعذر النسخ")}><Copy size={16} />نسخ الرمز</button>
        <Link to="/teacher/classes" className="btn ghost sm">كل الفصول</Link>
      </PageHead>
      <div className="tabs" role="tablist">
        <button className={tab === "students" ? "on" : ""} onClick={() => setTab("students")}>الطلاب ({students.length})</button>
        <button className={tab === "requests" ? "on" : ""} onClick={() => setTab("requests")}>طلبات الانضمام {requests.length > 0 && <span className="chip warn">{requests.length}</span>}</button>
        <button className={tab === "settings" ? "on" : ""} onClick={() => setTab("settings")}>إعدادات الفصل</button>
      </div>

      {tab === "students" && (<div className="glass card col">
        <div className="row"><h3 className="grow" style={{ margin: 0 }}>طلاب الفصل</h3><button className="btn sm" onClick={() => setAdding(true)}><UserPlus size={16} />إضافة طلاب</button></div>
        {!students.length ? <Empty text="لا يوجد طلاب. أضف أسماءهم ليختاروها عند الانضمام، أو وافق على طلباتهم." /> : (
          <div className="table-wrap"><table className="table"><thead><tr><th>الطالب</th><th>الدخول</th><th>الحالة</th><th>آخر ظهور</th><th /></tr></thead><tbody>
            {students.map((s) => (
              <tr key={s.id}>
                <td><Link to={`/teacher/students/${s.id}`} className="row" style={{ textDecoration: "none", color: "var(--text)", flexWrap: "nowrap" }}><Avatar name={s.full_name} size={34} /><b>{s.full_name}</b></Link></td>
                <td>{s.login_kind === "google" ? <span className="chip info">Google</span> : s.login_kind === "code" ? <span className="chip">رمز</span> : <span className="chip warn">لم يُربط</span>}</td>
                <td>{stat(s)}</td><td className="small muted">{s.last_seen_at ? fmtDateTime(s.last_seen_at) : "—"}</td>
                <td><div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                  <button className="icon-btn" title="تعديل الاسم" aria-label="تعديل الاسم" onClick={() => { setRenaming(s); setNewName(s.full_name); }}>✎</button>
                  <button className="icon-btn" title="نقل إلى فصل آخر" aria-label="نقل" onClick={() => { setMoving(s); setMoveTo(""); }}><MoveLeft size={17} /></button>
                  {s.login_kind === "code" && <button className="icon-btn" title="استعادة رمز الدخول" aria-label="استعادة الرمز" onClick={() => reissue(s)}><KeyRound size={17} /></button>}
                  {s.status === "active" ? <button className="icon-btn" title="إيقاف الحساب" aria-label="إيقاف" onClick={() => upd(s.id, { status: "suspended" }, "تم إيقاف الحساب")}><Pause size={17} /></button> : <button className="icon-btn" title="إعادة التفعيل" aria-label="تفعيل" onClick={() => upd(s.id, { status: "active" }, "تمت إعادة التفعيل")}><Play size={17} /></button>}
                  {s.blocked_until && new Date(s.blocked_until) > new Date() ? <button className="icon-btn" title="رفع الحظر" aria-label="رفع الحظر" onClick={() => upd(s.id, { blocked_until: null }, "رُفع الحظر")}><Check size={17} /></button> : <button className="icon-btn" title="حظر مؤقت" aria-label="حظر مؤقت" onClick={() => setBlocking(s)}><Ban size={17} /></button>}
                  <button className="icon-btn" title="أرشفة الطالب" aria-label="أرشفة" onClick={() => setArchiving(s)}><Archive size={17} /></button>
                </div></td>
              </tr>))}
          </tbody></table></div>)}
      </div>)}

      {tab === "requests" && (<div className="glass card col">
        <h3 style={{ margin: 0 }}>طلبات الانضمام المعلّقة</h3>
        {!requests.length ? <Empty text="لا توجد طلبات معلّقة." /> : requests.map((r) => (
          <div key={r.id} className="row glass card" style={{ padding: 14 }}>
            <Avatar name={r.requested_name} /><div className="grow"><b>{r.requested_name}</b><div className="small muted">{r.auth_user_id ? `Google — ${r.email ?? ""}` : "رمز دخول ثابت"} · {r.student_id ? "اختار ملفًا موجودًا" : "اسم جديد"} · {fmtDateTime(r.created_at)}</div></div>
            <button className="btn sm" disabled={busy} onClick={() => decide(r, "approve")}><Check size={16} />موافقة</button>
            <button className="btn danger sm" disabled={busy} onClick={() => decide(r, "reject")}><X size={16} />رفض</button>
          </div>))}
        <p className="small muted">إلى أن توافق يبقى الطالب ضيفًا: لا تُحتسب مشاركاته ولا يرى محتوى الفصل.</p>
      </div>)}

      {tab === "settings" && f && (<>
        <div className="glass card col" style={{ maxWidth: 640 }}>
          <label className="f">اسم الفصل<input className="field" value={f.name} onChange={(e) => { setForm({ ...f, name: e.target.value }); touch(); }} /></label>
          <label className="f">المرحلة / الصف<input className="field" value={f.grade} onChange={(e) => { setForm({ ...f, grade: e.target.value }); touch(); }} /></label>
          <label className="check"><input type="checkbox" checked={f.show} onChange={(e) => { setForm({ ...f, show: e.target.checked }); touch(); }} />إظهار لوحات الصدارة للطلاب (بأسمائهم الحقيقية داخل الفصل فقط)</label>
          <div className="notice info small">رمز الانضمام: <b dir="ltr">{cls.join_code}</b> — يعرف من يملكه أسماء الطلاب غير المربوطين في هذا الفصل ليختار اسمه، فلا تنشره علنًا.</div>
          <button className="btn danger" style={{ alignSelf: "flex-start" }} onClick={() => setArchClass(true)}><Archive size={16} />أرشفة الفصل</button>
        </div>
        <SaveBar dirty={dirty} saving={saving} onSave={saveClass} onCancel={() => { setForm(null); clean(); }} />
      </>)}

      {adding && <Modal title="إضافة طلاب" onClose={() => setAdding(false)}><div className="col"><label className="f">اكتب اسم كل طالب في سطر مستقل<textarea className="field" rows={8} value={names} onChange={(e) => setNames(e.target.value)} placeholder={"أحمد محمد\nسلمى علي"} /></label><p className="small muted">تظهر أسماؤهم في قائمة الانضمام ليختار كل طالب اسمه.</p><button className="btn" onClick={addNames}>إضافة</button></div></Modal>}
      {renaming && <Modal title="تعديل الاسم" onClose={() => setRenaming(null)}><div className="col"><input className="field" value={newName} onChange={(e) => setNewName(e.target.value)} /><button className="btn" onClick={() => { upd(renaming.id, { full_name: newName.trim() }, "تم تعديل الاسم"); setRenaming(null); }} disabled={newName.trim().length < 2}>حفظ</button></div></Modal>}
      {moving && <Modal title={`نقل ${moving.full_name}`} onClose={() => setMoving(null)}><div className="col"><label className="f">الفصل الجديد (من فصولك فقط)<select className="field" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}><option value="">اختر…</option>{classes.filter((c) => c.id !== id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button className="btn" disabled={!moveTo} onClick={() => { upd(moving.id, { class_id: moveTo }, "تم نقل الطالب"); setMoving(null); }}>نقل</button></div></Modal>}
      {blocking && <Modal title={`حظر ${blocking.full_name} مؤقتًا`} onClose={() => setBlocking(null)}><div className="col"><label className="f">المدة<select className="field" value={days} onChange={(e) => setDays(e.target.value)}>{[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} يوم</option>)}</select></label><button className="btn danger" onClick={() => { upd(blocking.id, { blocked_until: new Date(Date.now() + +days * 86400000).toISOString() }, "تم الحظر المؤقت"); setBlocking(null); }}>حظر</button></div></Modal>}
      {archiving && <Confirm text={`أرشفة ${archiving.full_name}؟ تُحفظ نتائجه ويمكن استرجاعه من الأرشيف.`} yes="أرشفة" onNo={() => setArchiving(null)} onYes={() => { upd(archiving.id, { archived_at: new Date().toISOString() }, "نُقل إلى الأرشيف"); setArchiving(null); }} />}
      {archClass && <Confirm text="أرشفة الفصل بكامله؟ يختفي من القوائم ويمكن استرجاعه من الأرشيف." yes="أرشفة الفصل" danger onNo={() => setArchClass(false)} onYes={async () => { await supabase.from("classes").update({ archived_at: new Date().toISOString() }).eq("id", id); toast("نُقل الفصل إلى الأرشيف"); nav("/teacher/classes"); }} />}
      {code && <Modal title="رمز الدخول الثابت" onClose={() => setCode(null)}><div className="col center"><p>رمز <b>{code.name}</b>. يصل الطالب تلقائيًا إلى صفحة حالته، وهذا العرض لتسلّمه له إن لزم. يُعرض هنا مرة واحدة.</p><div className="big-code">{code.code}</div><button className="btn ghost" onClick={async () => toast((await copyText(code.code)) ? "نُسخ" : "تعذر النسخ")}><Copy size={16} />نسخ</button></div></Modal>}
    </div>
  );
}
