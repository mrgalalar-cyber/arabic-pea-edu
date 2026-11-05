import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { fmtSecs } from "../../lib/util";
import { Empty, ErrorBox, Loading, useAsync } from "../../lib/ui";
import { Avatar, Rank } from "../../components/bits";

export default function StudentChampions() {
  const { me } = useAuth();
  const { data, loading, error } = useAsync(async () => {
    const r = await supabase.rpc("class_champions", { p_class: me!.classId });
    if (r.error) throw new Error(r.error.message); return r.data as any[];
  }, [me?.classId]);
  if (loading) return <Loading />; if (error) return <ErrorBox msg={error} />;
  const list = data ?? []; const mine = list.find((r) => r.is_me);
  return (
    <>
      <div className="glass card"><h1 style={{ margin: 0 }}>أبطال الفصل 🏆</h1><p className="muted" style={{ margin: 0 }}>نحتفي بالمشاركة والدقة والتحسّن.</p></div>
      {!list.length ? <div className="glass card"><Empty text="لا توجد نتائج لعرضها بعد، أو أن معلمك أخفى اللوحة. العب نشاطًا لتظهر هنا!" /></div> : (
        <div className="glass card col">
          {mine && <div className="notice info">ترتيبك الحالي: <b>{mine.place}</b> · {mine.total_score} نقطة · دقة {mine.accuracy}%</div>}
          {list.map((r) => <div key={r.student_id} className="row" style={{ padding: 8, borderRadius: 14, background: r.is_me ? "var(--t2)" : undefined }}><Rank n={r.place} /><Avatar name={r.full_name} size={36} /><div className="grow"><b>{r.full_name}{r.is_me && " (أنت)"}</b><div className="small muted">{r.played}/{r.total_activities} أنشطة · دقة {r.accuracy}% · {fmtSecs(r.total_time_ms)}</div></div><span className="chip good">{r.total_score}</span></div>)}
          <p className="small muted">الترتيب: مجموع النقاط، ثم الدقة، ثم الأسرع.</p>
        </div>)}
    </>
  );
}
