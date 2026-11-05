import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { configured } from "./lib/supabase";
import { Loading } from "./lib/ui";
import { ComingSoon, StudentShell, TeacherShell } from "./components/Shell";
import { AuthCallback, InvitePage, Landing, NotConfigured, StudentJoin, StudentLogin, StudentStatus, TeacherLogin } from "./pages/public";

const TeacherHome = lazy(() => import("./pages/teacher/Home"));
const Classes = lazy(() => import("./pages/teacher/Classes"));
const ClassDetail = lazy(() => import("./pages/teacher/ClassDetail"));
const StudentProfile = lazy(() => import("./pages/teacher/StudentProfile"));
const Questions = lazy(() => import("./pages/teacher/Questions"));
const Content = lazy(() => import("./pages/teacher/Content"));
const Activities = lazy(() => import("./pages/teacher/Activities"));
const ActivityResults = lazy(() => import("./pages/teacher/ActivityResults"));
const Arena = lazy(() => import("./pages/teacher/Arena"));
const Teachers = lazy(() => import("./pages/teacher/Teachers"));
const ArchivePage = lazy(() => import("./pages/teacher/Archive"));
const SettingsPage = lazy(() => import("./pages/teacher/Settings"));
const StudentHome = lazy(() => import("./pages/student/Home"));
const StudentChampions = lazy(() => import("./pages/student/Champions"));
const StudentMe = lazy(() => import("./pages/student/Me"));
const Play = lazy(() => import("./pages/student/Play"));

function Guard({ roles, children, login }: { roles: string[]; children: ReactNode; login: string }) {
  const { loading, session, me, signOut } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Navigate to={login} replace />;
  if (!me || !roles.includes(me.role)) {
    return (
      <div className="hero"><div className="glass auth-card center">
        <h2>هذا الحساب لا يملك صلاحية هذه الصفحة</h2>
        <p className="muted">{me?.role === "none" ? "حسابك لم يُعتمد بعد لهذا الدور." : "سجّل الدخول بالحساب المناسب."}</p>
        <div className="row" style={{ justifyContent: "center" }}><button className="btn ghost" onClick={signOut}>تسجيل الخروج</button><a className="btn" href="/">الرئيسية</a></div>
      </div></div>
    );
  }
  return <>{children}</>;
}

export function App() {
  if (!configured) return <NotConfigured />;
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/teacher/login" element={<TeacherLogin />} />
        <Route path="/teacher/invite/:token" element={<InvitePage />} />
        <Route path="/student/join" element={<StudentJoin />} />
        <Route path="/student/status" element={<StudentStatus />} />
        <Route path="/student/login" element={<StudentLogin />} />

        <Route path="/teacher" element={<Guard roles={["owner", "teacher"]} login="/teacher/login"><TeacherShell /></Guard>}>
          <Route index element={<TeacherHome />} />
          <Route path="classes" element={<Classes />} />
          <Route path="classes/:id" element={<ClassDetail />} />
          <Route path="students/:id" element={<StudentProfile />} />
          <Route path="questions" element={<Questions />} />
          <Route path="content" element={<Content />} />
          <Route path="activities" element={<Activities />} />
          <Route path="activities/:id/results" element={<ActivityResults />} />
          <Route path="arena" element={<Arena />} />
          <Route path="teachers" element={<Teachers />} />
          <Route path="archive" element={<ArchivePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="assessment" element={<ComingSoon title="التقييم البنائي" phase="المرحلة 3" items={["عدد المشاركات وصحة الإجابات ومستوى الإتقان", "التفاعل والسرعة والاستمرارية والتقدم عبر الزمن", "أوزان قابلة للضبط مع إظهار طريقة احتساب الدرجة"]} />} />
          <Route path="reports" element={<ComingSoon title="التقارير والتحليلات" phase="المرحلة 3" items={["تقارير الفصل والطالب مع تصدير PDF", "مقارنة الأنشطة وتحليل الأسئلة الأصعب"]} />} />
          <Route path="certificates" element={<ComingSoon title="الشهادات" phase="المرحلة 3" items={["قوالب: مشاركة مميزة، بطل النشاط، تطور ملحوظ، إتقان مهارة", "نص مخصص، طباعة وتنزيل PDF، وحفظها في ملف الطالب"]} />} />
          <Route path="messages" element={<ComingSoon title="الرسائل" phase="المرحلة 2" items={["مراسلة خاصة بين الطالب ومعلمه فقط", "نص وصورة، وردّ المعلم من واجهته"]} />} />
        </Route>

        <Route path="/student" element={<Guard roles={["student"]} login="/student/login"><StudentShell /></Guard>}>
          <Route index element={<StudentHome />} />
          <Route path="champions" element={<StudentChampions />} />
          <Route path="me" element={<StudentMe />} />
        </Route>
        <Route path="/play/:activityId" element={<Guard roles={["student"]} login="/student/login"><Play /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
