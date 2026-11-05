import { useState } from "react";
import { Gamepad2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { GAMES } from "../../lib/constants";
import type { Activity, Klass } from "../../lib/types";
import { fmtSecs } from "../../lib/util";
import { Empty, ErrorBox, Loading, useAsync } from "../../lib/ui";
import { Avatar, PageHead, Rank } from "../../components/bits";

interface Champ { student_id: string; full_name: string; played: number; total_activities: number; accuracy: number; total_score: number; total_time_ms: number; place: number }

export default function Arena() {
  const base = useAsync(async () => {
    const [c, a] = await Promise.all([supabase.from("classes").select("*").is("archived_at", null).order("name"), supabase.from("activities").select("id,templates,status").is("archived_at", null)]);
    if (c.error) throw new Error(c.error.message); return { classes: c.data as Klass[], acts: (a.data ?? []) as Pick<Activity, "id" | "templates" | "status">[] };
  });
  const [sel, setSel] = useState("");
  const cid = sel || base.data?.classes[0]?.id;
  const champs = useAsync(async () => { if (!cid) return []; const r = await supabase.rpc("class_champions", { p_class: cid }); return (r.data ?? []) as Champ[]; }, [cid]);
  if (base.loading) return <Loading />; if (base.error) return <ErrorBox msg={base.error} />;
  const { classes, acts } = base.data!;
  return (
    <div className="page">
      <PageHead title="ساحة الألعاب" sub="قوالب الألعاب المتاحة، ولوحة «أبطال الفصل» الإجمالية." />
      <div className="grid g2">
        {GAMES.map((g) => (
          <div key={g.id} className="glass card col" style={{ borderTop: `4px solid ${g.color}` }}>
            <div className="row"><span className="brand-mark" style={{ background: g.color }}><Gamepad2 size={22} /></span><h3 className="grow" style={{ margin: 0 }}>{g.label}</h3><span className="chip good">يعمل</span></div>
            <p className="muted">{g.desc}</p><span className="chip">{acts.filter((a) => a.templates.includes(g.id)).length} نشاطًا يستخدمه</span>
          </div>))}
      </div>
      <div className="glass card col">
        <div className="row"><h3 className="grow" style={{ margin: 0 }}>أبطال الفصل</h3>{classes.length > 0 && <select className="field" style={{ width: "auto" }} value={cid} onChange={(e) => setSel(e.target.value)} aria-label="الفصل">{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</div>
        {champs.loading ? <Loading /> : !champs.data?.length ? <Empty text="لا نتائج مكتملة في هذا الفصل بعد." /> : (
          <div className="table-wrap"><table className="table"><thead><tr><th>#</th><th>الطالب</th><th>المشاركات</th><th>الدقة</th><th>النقاط</th><th>الزمن</th></tr></thead><tbody>
            {champs.data.map((r) => <tr key={r.student_id}><td><Rank n={r.place} /></td><td><div className="row" style={{ flexWrap: "nowrap" }}><Avatar name={r.full_name} size={30} />{r.full_name}</div></td><td>{r.played}/{r.total_activities}</td><td>{r.accuracy}%</td><td><b>{r.total_score}</b></td><td>{fmtSecs(r.total_time_ms)}</td></tr>)}
          </tbody></table></div>)}
        <div className="notice info small"><b>طريقة الاحتساب:</b> لكل نشاط تُؤخذ أفضل محاولة للطالب، ثم تُجمع النقاط عبر الأنشطة المنشورة حتى الآن. الترتيب: مجموع النقاط، ثم الدقة، ثم الأسرع. تظهر اللوحة للطلاب فقط إذا لم تُخفِها من إعدادات الفصل.</div>
      </div>
    </div>
  );
}
