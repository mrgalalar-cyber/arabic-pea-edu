import { useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, Link } from "react-router-dom";
import { Archive, Award, BarChart3, BookOpen, ChevronsLeft, ChevronsRight, ClipboardList, Gamepad2, Gauge, GraduationCap, LayoutDashboard, LibraryBig, LogOut, MessageCircle, MoreHorizontal, Settings, ShieldCheck, Trophy, User, Users } from "lucide-react";
import { useAuth } from "../lib/auth";
import { ThemeSwitch } from "../lib/theme";
import { supabase } from "../lib/supabase";
import { Modal, useAsync } from "../lib/ui";
import { Avatar } from "./bits";

interface Item { to: string; label: string; icon: ReactNode; soon?: boolean; owner?: boolean; end?: boolean; badge?: number }

export function TeacherShell() {
  const { me, signOut } = useAuth();
  const loc = useLocation();
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem("sidebar") === "1"; } catch { return false; } });
  const [more, setMore] = useState(false);
  const pending = useAsync(async () => {
    const { count } = await supabase.from("join_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
    return count ?? 0;
  }, [loc.pathname]);
  const ic = 20;
  const items: Item[] = [
    { to: "/teacher", label: "الرئيسية", icon: <LayoutDashboard size={ic} />, end: true },
    { to: "/teacher/classes", label: "فصولي", icon: <Users size={ic} />, badge: pending.data ?? 0 },
    { to: "/teacher/questions", label: "بنك الأسئلة", icon: <LibraryBig size={ic} /> },
    { to: "/teacher/activities", label: "الواجبات والأنشطة", icon: <ClipboardList size={ic} /> },
    { to: "/teacher/arena", label: "ساحة الألعاب", icon: <Gamepad2 size={ic} /> },
    { to: "/teacher/content", label: "إدارة المحتوى", icon: <BookOpen size={ic} /> },
    { to: "/teacher/assessment", label: "التقييم", icon: <Gauge size={ic} />, soon: true },
    { to: "/teacher/reports", label: "التقارير والتحليلات", icon: <BarChart3 size={ic} />, soon: true },
    { to: "/teacher/certificates", label: "الشهادات", icon: <Award size={ic} />, soon: true },
    { to: "/teacher/messages", label: "الرسائل", icon: <MessageCircle size={ic} />, soon: true },
    { to: "/teacher/teachers", label: "المعلمون والدعوات", icon: <ShieldCheck size={ic} />, owner: true },
    { to: "/teacher/archive", label: "الأرشيف", icon: <Archive size={ic} /> },
    { to: "/teacher/settings", label: "الإعدادات", icon: <Settings size={ic} /> },
  ].filter((i) => !i.owner || me?.role === "owner");
  const quick = items.slice(0, 4);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem("sidebar", c ? "0" : "1"); } catch { /* */ } return !c; });
  const title = items.find((i) => (i.end ? loc.pathname === i.to : loc.pathname.startsWith(i.to)))?.label ?? "";

  const link = (i: Item, onClick?: () => void) => (
    <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => (isActive ? "active" : "")} title={i.label} onClick={onClick}>
      {i.icon}<span>{i.label}</span>
      {i.soon && <em className="soon" style={{ fontStyle: "normal" }}>قريبًا</em>}
      {!!i.badge && <em className="badge" style={{ fontStyle: "normal" }}>{i.badge}</em>}
    </NavLink>
  );

  return (
    <div className={"app" + (collapsed ? " collapsed" : "")}>
      <aside className="sidebar glass" aria-label="القائمة الرئيسية">
        <div className="brand"><div className="brand-mark"><GraduationCap size={24} /></div><span>منصة التعلّم</span></div>
        <nav className="nav">
          <div className="nav-sec">التدريس</div>{items.slice(0, 6).map((i) => link(i))}
          <div className="nav-sec">المتابعة</div>{items.slice(6, 10).map((i) => link(i))}
          <div className="nav-sec">النظام</div>{items.slice(10).map((i) => link(i))}
        </nav>
        <div className="side-foot">
          <button onClick={toggle} aria-label={collapsed ? "توسيع القائمة" : "طيّ القائمة"}>{collapsed ? <ChevronsLeft size={ic} /> : <ChevronsRight size={ic} />}<span>طيّ القائمة</span></button>
          <button onClick={signOut}><LogOut size={ic} /><span>تسجيل الخروج</span></button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar glass no-print">
          <h1 className="grow">{title}</h1>
          <span className="chip info">{me?.role === "owner" ? "المالك" : "معلم"}</span>
          <ThemeSwitch />
          <div className="row" style={{ gap: 8 }}><Avatar name={me?.name || me?.email || "م"} size={36} /><span className="small muted" style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{me?.name || me?.email}</span></div>
        </header>
        <Outlet />
      </div>

      <nav className="bottom-nav glass no-print" aria-label="تنقّل سريع">
        {quick.map((i) => <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => (isActive ? "active" : "")}>{i.icon}<span>{i.label.replace("الواجبات والأنشطة", "الأنشطة")}</span></NavLink>)}
        <button onClick={() => setMore(true)}><MoreHorizontal size={ic} /><span>المزيد</span></button>
      </nav>
      {more && (
        <Modal title="القائمة" onClose={() => setMore(false)}>
          <div className="auto-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
            {items.slice(4).map((i) => <NavLink key={i.to} to={i.to} className="glass card hover row" style={{ textDecoration: "none", color: "var(--text)" }} onClick={() => setMore(false)}>{i.icon}<span>{i.label}</span>{i.soon && <span className="soon chip warn">قريبًا</span>}</NavLink>)}
            <button className="glass card hover row" style={{ font: "inherit", color: "var(--text)", cursor: "pointer" }} onClick={signOut}><LogOut size={ic} />خروج</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function StudentShell() {
  const { me, signOut } = useAuth();
  return (
    <div className="play" style={{ paddingBottom: 100 }}>
      <header className="glass play-top no-print">
        <div className="brand" style={{ padding: 0 }}><div className="brand-mark"><GraduationCap size={22} /></div><span>منصة التعلّم</span></div>
        <span className="grow" />
        <ThemeSwitch />
        <button className="icon-btn" onClick={signOut} aria-label="تسجيل الخروج" title="تسجيل الخروج"><LogOut size={19} /></button>
      </header>
      <Outlet />
      <nav className="bottom-nav glass no-print" style={{ display: "flex", maxWidth: 520, marginInline: "auto" }} aria-label="تنقّل الطالب">
        <NavLink to="/student" end className={({ isActive }) => (isActive ? "active" : "")}><LayoutDashboard size={20} /><span>أنشطتي</span></NavLink>
        <NavLink to="/student/champions" className={({ isActive }) => (isActive ? "active" : "")}><Trophy size={20} /><span>أبطال الفصل</span></NavLink>
        <NavLink to="/student/me" className={({ isActive }) => (isActive ? "active" : "")}><User size={20} /><span>{me?.name?.split(" ")[0] ?? "ملفي"}</span></NavLink>
      </nav>
    </div>
  );
}

export function ComingSoon({ title, items, phase }: { title: string; items: string[]; phase: string }) {
  return (
    <div className="page">
      <div className="page-head"><div><h1>{title}</h1><p className="muted">هذه الصفحة غير مفعّلة بعد ({phase}). لا توجد بيانات وهمية هنا.</p></div></div>
      <div className="glass card"><h3>ما سيتوفر هنا</h3><ul>{items.map((t) => <li key={t}>{t}</li>)}</ul>
        <p className="small muted">الجداول المطلوبة موجودة جزئيًا في قاعدة البيانات (انظر docs/ARCHITECTURE.md).</p>
        <Link to="/teacher" className="btn ghost sm">العودة للرئيسية</Link></div>
    </div>
  );
}
