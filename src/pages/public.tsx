import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, Clock, Copy, GraduationCap, KeyRound, ShieldAlert, Users, XCircle } from "lucide-react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { supabase } from "../lib/supabase";
import { Lamp, ThemeSwitch } from "../lib/theme";
import { copyText } from "../lib/util";
import { Loading, useToast } from "../lib/ui";

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.100 0 24s.9 7.600 2.600 10.800l7.900-6.100z"/><path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.600-5.900c-2.100 1.400-4.900 2.300-8.300 2.300-6.300 0-11.600-4.100-13.500-9.800l-7.900 6.100C6.500 42.600 14.600 48 24 48z"/></svg>
);
const GoogleBtn = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => <button className="google-btn" onClick={onClick}><GoogleIcon />{children}</button>;

function Frame({ children, back = "/" }: { children: ReactNode; back?: string }) {
  return (
    <div className="hero">
      <div style={{ position: "absolute", top: 16, insetInlineStart: 16, display: "flex", gap: 10, alignItems: "center" }}>
        <Link to={back} className="icon-btn" aria-label="رجوع"><ArrowRight size={20} /></Link><ThemeSwitch />
      </div>
      {children}
    </div>
  );
}

export function NotConfigured() {
  return (
    <div className="hero"><div className="glass auth-card">
      <div className="brand-mark" style={{ marginBottom: 12 }}><ShieldAlert size={24} /></div>
      <h2>المنصة تحتاج إلى إعداد أولي</h2>
      <p className="muted">لم تُضبط متغيرات الاتصال بقاعدة البيانات. اتبع ملف <b>README-ar.md</b> (الخطوة 1 و2)، ثم أضف المتغيرين التاليين في Netlify وأعد النشر:</p>
      <div className="big-code" style={{ fontSize: ".95rem", letterSpacing: 0, textAlign: "left" }}>VITE_SUPABASE_URL<br />VITE_SUPABASE_ANON_KEY</div>
    </div></div>
  );
}

export function Landing() {
  const { loading, me } = useAuth();
  if (!loading && me?.role === "owner") return <Navigate to="/teacher" replace />;
  if (!loading && me?.role === "teacher") return <Navigate to="/teacher" replace />;
  if (!loading && me?.role === "student") return <Navigate to="/student" replace />;
  return (
    <div className="hero">
      <Lamp />
      <div style={{ position: "absolute", top: 16, insetInlineStart: 16 }}><ThemeSwitch /></div>
      <div className="glass hero-card">
        <div className="brand" style={{ padding: 0, marginBottom: 18 }}><div className="brand-mark"><GraduationCap size={26} /></div><span>منصة التعلّم العربية</span></div>
        <h1 style={{ maxWidth: 640 }}>تعلّمٌ هادئ، وألعابٌ تُحبّها العقول الصغيرة</h1>
        <p className="muted" style={{ maxWidth: 560, fontSize: "1.05rem" }}>يجهّز المعلمون الفصول والأنشطة، ويلعب الطلاب ويتنافسون بروح طيبة. اسحب حبل المصباح لتبديل الوضع الليلي والنهاري.</p>
        <div className="grid g2" style={{ marginTop: 22 }}>
          <Link to="/student/login" className="glass role-card card hover">
            <span className="big-ico" style={{ background: "var(--t3)" }}><Users size={28} /></span>
            <h2 style={{ margin: 0 }}>أنا طالب</h2><span className="muted">ادخل برمزك أو بحساب Google، أو اطلب الانضمام إلى فصلك.</span>
          </Link>
          <Link to="/teacher/login" className="glass role-card card hover">
            <span className="big-ico" style={{ background: "var(--t2)" }}><GraduationCap size={28} /></span>
            <h2 style={{ margin: 0 }}>أنا معلم</h2><span className="muted">ادخل لإدارة الفصول وبنك الأسئلة والأنشطة والنتائج.</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export function AuthCallback() {
  const { loading, session, me } = useAuth();
  const nav = useNavigate();
  useEffect(() => {
    if (loading) return;
    let next = "/";
    try { next = sessionStorage.getItem("postLoginNext") || "/"; sessionStorage.removeItem("postLoginNext"); } catch { /* */ }
    if (!session) { nav("/", { replace: true }); return; }
    if (me?.role === "owner" || me?.role === "teacher") nav(next.startsWith("/teacher") ? next : "/teacher", { replace: true });
    else if (me?.role === "student") nav("/student", { replace: true });
    else nav(next, { replace: true });
  }, [loading, session, me, nav]);
  return <Loading />;
}

export function TeacherLogin() {
  const { loading, me, google, signOut } = useAuth();
  if (!loading && (me?.role === "owner" || me?.role === "teacher")) return <Navigate to="/teacher" replace />;
  return (
    <Frame>
      <div className="glass auth-card col">
        <div className="brand-mark"><GraduationCap size={24} /></div>
        <h2 style={{ margin: 0 }}>دخول المعلم</h2>
        <p className="muted">سجّل الدخول بحساب Google. المعلمون الجدد يدخلون عبر رابط دعوة خاص من مالك المنصة.</p>
        {me?.role === "none" && <div className="notice bad">هذا الحساب ({me.email}) غير مسجَّل كمعلم. إن كانت لديك دعوة فافتح رابطها، وإلا فاطلب رابطًا من المالك.</div>}
        {me?.role === "student" && <div className="notice bad">هذا الحساب مرتبط بملف طالب.</div>}
        <GoogleBtn onClick={() => google("/teacher")}>المتابعة باستخدام Google</GoogleBtn>
        {me && <button className="btn ghost" onClick={signOut}>تبديل الحساب</button>}
      </div>
    </Frame>
  );
}

export function InvitePage() {
  const { token = "" } = useParams();
  const { loading, session, me, google, refresh } = useAuth();
  const nav = useNavigate(); const toast = useToast();
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  if (!loading && (me?.role === "owner" || me?.role === "teacher")) return <Navigate to="/teacher" replace />;
  const accept = async () => {
    setBusy(true); setErr("");
    try { await api("auth", { action: "redeemInvite", token }); await refresh(); toast("تم قبول الدعوة، مرحبًا بك"); nav("/teacher", { replace: true }); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Frame>
      <div className="glass auth-card col">
        <div className="brand-mark"><KeyRound size={24} /></div>
        <h2 style={{ margin: 0 }}>دعوة للانضمام كمعلم</h2>
        <p className="muted">دُعيتَ لإدارة فصولك وطلابك وأسئلتك وأنشطتك الخاصة. بياناتك معزولة تمامًا عن بقية المعلمين.</p>
        {err && <div className="notice bad" role="alert">{err}</div>}
        {loading ? <Loading /> : !session
          ? <GoogleBtn onClick={() => google(`/teacher/invite/${token}`)}>الدخول بـ Google لقبول الدعوة</GoogleBtn>
          : <button className="btn lg" onClick={accept} disabled={busy}>{busy ? "جارٍ القبول…" : `قبول الدعوة بحساب ${session.user.email}`}</button>}
      </div>
    </Frame>
  );
}

/* ---------------- الطالب: الانضمام ---------------- */
interface ClassInfo { classId: string; name: string; grade: string | null; students: { id: string; full_name: string }[] }

export function StudentJoin() {
  const { loading, session, me, google } = useAuth();
  const nav = useNavigate(); const loc = useLocation(); const toast = useToast();
  const [step, setStep] = useState<"code" | "profile" | "method">("code");
  const [joinCode, setJoinCode] = useState(""); const [info, setInfo] = useState<ClassInfo | null>(null);
  const [studentId, setStudentId] = useState<string>(""); const [name, setName] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const resumed = useRef(false);

  const submit = async (mode: "google" | "code", draft?: { joinCode: string; studentId: string; name: string }) => {
    const d = draft ?? { joinCode, studentId, name };
    setBusy(true); setErr("");
    try {
      const r = await api<{ trackToken: string }>("join", { action: "submit", mode, joinCode: d.joinCode, studentId: d.studentId || undefined, name: d.name || undefined });
      try { if (mode === "code") localStorage.setItem("joinTrack", r.trackToken); else localStorage.removeItem("joinTrack"); } catch { /* */ }
      nav("/student/status", { replace: true });
    } catch (e: any) { setErr(e.message); toast(e.message, true); } finally { setBusy(false); }
  };

  // العودة من Google: نكمل الطلب المحفوظ تلقائيًا
  useEffect(() => {
    if (resumed.current || loading || !session || new URLSearchParams(loc.search).get("resume") !== "1") return;
    resumed.current = true;
    try { const raw = sessionStorage.getItem("joinDraft"); if (raw) { sessionStorage.removeItem("joinDraft"); submit("google", JSON.parse(raw)); } } catch { /* */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session]);

  const lookup = async () => {
    setBusy(true); setErr("");
    try { const r = await api<ClassInfo>("join", { action: "classInfo", joinCode }); setInfo(r); setStep("profile"); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const googleSubmit = () => {
    if (session && me?.role === "none") return submit("google");
    try { sessionStorage.setItem("joinDraft", JSON.stringify({ joinCode, studentId, name })); } catch { /* */ }
    google("/student/join?resume=1");
  };
  const okName = studentId || name.trim().length >= 2;

  return (
    <Frame back="/student/login">
      <div className="glass auth-card col">
        <h2 style={{ margin: 0 }}>الانضمام إلى فصل</h2>
        <div className="progress" aria-hidden><i style={{ width: step === "code" ? "33%" : step === "profile" ? "66%" : "100%" }} /></div>
        {err && <div className="notice bad" role="alert">{err}</div>}
        {step === "code" && (<>
          <p className="muted">اكتب رمز الفصل الذي أعطاك إياه معلمك.</p>
          <label className="f">رمز الفصل<input className="field code-input" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="XXXXXXXX" maxLength={12} autoFocus onKeyDown={(e) => e.key === "Enter" && joinCode.length >= 6 && lookup()} /></label>
          <button className="btn lg" disabled={busy || joinCode.trim().length < 6} onClick={lookup}>متابعة</button>
        </>)}
        {step === "profile" && info && (<>
          <p>فصل <b>{info.name}</b>{info.grade ? ` — ${info.grade}` : ""}</p>
          <p className="muted small">اختر اسمك من القائمة. إن لم تجد اسمك فاكتبه، وسيصل طلبك إلى معلمك للموافقة.</p>
          <div className="col" style={{ maxHeight: 260, overflow: "auto" }}>
            {info.students.map((s) => <label key={s.id} className="check glass" style={{ padding: "10px 14px", borderRadius: 14 }}><input type="radio" name="st" checked={studentId === s.id} onChange={() => { setStudentId(s.id); setName(""); }} />{s.full_name}</label>)}
            <label className="check glass" style={{ padding: "10px 14px", borderRadius: 14 }}><input type="radio" name="st" checked={!studentId} onChange={() => setStudentId("")} />لستُ في القائمة</label>
          </div>
          {!studentId && <label className="f">اسمك الكامل<input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم الثلاثي" maxLength={80} /></label>}
          <div className="row"><button className="btn ghost" onClick={() => setStep("code")}>رجوع</button><button className="btn grow" disabled={!okName} onClick={() => setStep("method")}>متابعة</button></div>
        </>)}
        {step === "method" && (<>
          <p className="muted">كيف تريد الدخول في كل مرة؟</p>
          <GoogleBtn onClick={googleSubmit}>حساب Google</GoogleBtn>
          <button className="btn ghost" disabled={busy} onClick={() => submit("code")}><KeyRound size={18} />بدون Google — رمز دخول ثابت</button>
          <div className="notice info small">بعد موافقة معلمك تحصل على <b>رمز دخول ثابت</b> تحتفظ به. يتعرف عليك الموقع به عند كل زيارة، وإن فقدته أو غيّرت جهازك فيستعيده لك معلمك.</div>
          <button className="btn ghost sm" onClick={() => setStep("profile")}>رجوع</button>
        </>)}
        <div className="notice small">إلى أن يوافق معلمك تبقى ضيفًا: لا تُحتسب مشاركاتك ولا ترى محتوى الفصل.</div>
      </div>
    </Frame>
  );
}

export function StudentStatus() {
  const { session, me, refresh } = useAuth();
  const nav = useNavigate(); const toast = useToast();
  const [st, setSt] = useState<{ status: string; code?: string | null; name?: string } | null>(null);
  const [code, setCode] = useState<string>(() => { try { return sessionStorage.getItem("issuedCode") || ""; } catch { return ""; } });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true, timer: number;
    const poll = async () => {
      let track: string | null = null; try { track = localStorage.getItem("joinTrack"); } catch { /* */ }
      if (!track && !session) { if (alive) setSt({ status: "none" }); return; }
      try {
        const r = await api<any>("join", { action: "status", trackToken: track ?? undefined });
        if (!alive) return; setSt(r);
        if (r.code) { setCode(r.code); try { sessionStorage.setItem("issuedCode", r.code); } catch { /* */ } }
        if (r.status === "pending") timer = window.setTimeout(poll, 6000);
        if (r.status === "approved" && !r.code && session) { const m = await refresh(); if (m?.role === "student") nav("/student", { replace: true }); }
      } catch { timer = window.setTimeout(poll, 10000); }
    };
    poll(); return () => { alive = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  const enter = async () => {
    setBusy(true);
    try {
      const r = await api<{ access_token: string; refresh_token: string }>("student-login", { code });
      await supabase.auth.setSession(r);
      try { localStorage.removeItem("joinTrack"); sessionStorage.removeItem("issuedCode"); } catch { /* */ }
      nav("/auth/callback");
    } catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  };

  return (
    <Frame back="/student/login">
      <div className="glass auth-card col center">
        {!st ? <Loading /> : st.status === "pending" ? (<>
          <Clock size={44} color="var(--warn)" style={{ alignSelf: "center" }} />
          <h2 style={{ margin: 0 }}>طلبك عند المعلم</h2>
          <p className="muted">أنت الآن ضيف إلى أن يوافق معلمك. أبقِ هذه الصفحة أو عُد إليها لاحقًا من نفس المتصفح.</p>
        </>) : st.status === "approved" ? (<>
          <CheckCircle2 size={44} color="var(--good)" style={{ alignSelf: "center" }} />
          <h2 style={{ margin: 0 }}>تمت الموافقة{st.name ? ` يا ${st.name.split(" ")[0]}` : ""}!</h2>
          {code ? (<>
            <p className="muted">هذا <b>رمز دخولك الثابت</b>. اكتبه في مكان آمن؛ ستحتاجه في كل زيارة أو على أي جهاز جديد.</p>
            <div className="big-code">{code}</div>
            <div className="row" style={{ justifyContent: "center" }}>
              <button className="btn ghost sm" onClick={async () => toast((await copyText(code)) ? "تم النسخ" : "تعذر النسخ", false)}><Copy size={16} />نسخ</button>
              <button className="btn" onClick={enter} disabled={busy}>الدخول الآن</button>
            </div>
            <p className="small muted">إن فقدت الرمز يستعيده لك معلمك.</p>
          </>) : <button className="btn lg" onClick={async () => { const m = await refresh(); nav(m?.role === "student" ? "/student" : "/student/login"); }}>الدخول</button>}
        </>) : st.status === "rejected" ? (<>
          <XCircle size={44} color="var(--bad)" style={{ alignSelf: "center" }} /><h2 style={{ margin: 0 }}>لم يُقبل الطلب</h2>
          <p className="muted">تواصل مع معلمك، ثم يمكنك إرسال طلب جديد.</p><Link className="btn" to="/student/join">طلب جديد</Link>
        </>) : (<><h2 style={{ margin: 0 }}>لا يوجد طلب</h2><Link className="btn" to="/student/join">الانضمام إلى فصل</Link></>)}
      </div>
    </Frame>
  );
}

export function StudentLogin() {
  const { loading, me, google, signOut } = useAuth();
  const nav = useNavigate(); const toast = useToast();
  const [tab, setTab] = useState<"code" | "google">("code");
  const [code, setCode] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  if (!loading && me?.role === "student") return <Navigate to="/student" replace />;
  const enter = async () => {
    setBusy(true); setErr("");
    try {
      const r = await api<{ access_token: string; refresh_token: string }>("student-login", { code });
      await supabase.auth.setSession(r); nav("/auth/callback");
    } catch (e: any) { setErr(e.message); toast(e.message, true); } finally { setBusy(false); }
  };
  return (
    <Frame>
      <div className="glass auth-card col">
        <h2 style={{ margin: 0 }}>دخول الطالب</h2>
        <div className="tabs"><button className={tab === "code" ? "on" : ""} onClick={() => setTab("code")}>برمز الدخول</button><button className={tab === "google" ? "on" : ""} onClick={() => setTab("google")}>بحساب Google</button></div>
        {err && <div className="notice bad" role="alert">{err}</div>}
        {tab === "code" ? (<>
          <label className="f">رمز الدخول<input className="field code-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX" maxLength={14} autoFocus onKeyDown={(e) => e.key === "Enter" && enter()} /></label>
          <button className="btn lg" disabled={busy || code.replace(/[^A-Za-z0-9]/g, "").length < 12} onClick={enter}>دخول</button>
        </>) : (<>
          {me?.role === "none" && <div className="notice">حسابك ({me.email}) غير معتمد كطالب بعد. اطلب الانضمام ليوافق معلمك.</div>}
          <GoogleBtn onClick={() => google("/student")}>المتابعة باستخدام Google</GoogleBtn>
          {me && <button className="btn ghost sm" onClick={signOut}>تبديل الحساب</button>}
        </>)}
        <hr style={{ border: 0, borderTop: "1px solid var(--line)", width: "100%" }} />
        <Link to="/student/join" className="btn ghost">لستُ مسجَّلًا — أريد الانضمام إلى فصل</Link>
      </div>
    </Frame>
  );
}
