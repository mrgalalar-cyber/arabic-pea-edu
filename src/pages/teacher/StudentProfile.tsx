import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Award, CheckCircle2, Clock, Target, Trophy } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { Activity, Attempt, Klass, Student } from "../../lib/types";
import { fmtDate, fmtDateTime, fmtSecs, pct } from "../../lib/util";
import { gameLabel } from "../../lib/constants";
import { ErrorBox, Loading, SaveBar, useAsync, useDirty, useToast } from "../../lib/ui";
import { Avatar, Stat } from "../../components/bits";

export default function StudentProfile() {
  const { id = "" } = useParams(); const toast = useToast();
  const { data, loading, error, reload } = useAsync(async () => {
    const s = await supabase.from("students").select("*").eq("id", id).maybeSingle();
    if (!s.data) throw new Error("الطالب غير موجود أو ليس من طلابك");
    const [c, at] = await Promise.all([
      supabase.from("classes").select("*").eq("id", s.data.class_id).single(),
      supabase.from("attempts").select("*").eq("student_id", id).order("started_at", { ascending: false }),
    ]);
    const ids = [...new Set((at.data ?? []).map((a: Attempt) => a.activity_id))];
    const acts = ids.length ? await supabase.from("activities").select("id,title").in("id", ids) : { data: [] };
    return { s: s.data as Student, cls: c.data as Klass, attempts: (at.data ?? []) as Attempt[], acts: (acts.data ?? []) as Pick<Activity, "id" | "title">[] };
  }, [id]);
  const { dirty, touch, clean } = useDirty();
  const [note, setNote] = useState<string | null>(null); const [saving, setSaving] = useState(false);

  if (loading) return <Loading />; if (error) return <ErrorBox msg={error} />;
  const { s, cls, attempts, acts } = data!;
  const done = attempts.filter((a) => a.status === "finished");
  const acc = pct(done.reduce((n, a) => n + a.correct_count, 0), done.reduce((n, a) => n + a.total_questions, 0));
  const title = (aid: string) => acts.find((a) => a.id === aid)?.title ?? "—";
  const save = async () => {
    setSaving(true); const { error } = await supabase.from("students").update({ teacher_note: note }).eq("id", id); setSaving(false);
    if (error) return toast(error.message, true); toast("تم حفظ الملاحظة"); clean(); reload();
  };
  return (
    <div className="page">
      <div className="glass card row">
        <Avatar name={s.full_name} size={64} />
        <div className="grow"><h1 style={{ margin: 0 }}>{s.full_name}</h1><div className="row small muted"><Link to={`/teacher/classes/${cls.id}`}>{cls.name}</Link><span>· انضم {fmtDate(s.joined_at)}</span>{s.email && <span dir="ltr">· {s.email}</span>}</div></div>
        <span className={"chip " + (s.status === "active" ? "good" : "bad")}>{s.status === "active" ? "نشط" : "موقوف"}</span>
      </div>
      <div className="grid g4 g-keep2">
        <Stat tint={1} icon={<Trophy size={20} />} value={done.reduce((n, a) => n + a.score, 0)} label="مجموع النقاط" />
        <Stat tint={2} icon={<Target size={20} />} value={`${acc}%`} label="دقة الإجابات" />
        <Stat tint={3} icon={<CheckCircle2 size={20} />} value={done.length} label="مشاركات مكتملة" />
        <Stat tint={4} icon={<Award size={20} />} value="—" label="الشهادات (قريبًا)" />
      </div>
      <div className="glass card col">
        <h3 style={{ margin: 0 }}>سجل المشاركات</h3>
        {!attempts.length ? <p className="muted">لم يشارك بعد.</p> : (
          <div className="table-wrap"><table className="table"><thead><tr><th>النشاط</th><th>اللعبة</th><th>النقاط</th><th>الصحيح</th><th>الزمن</th><th>التاريخ</th></tr></thead><tbody>
            {attempts.map((a) => <tr key={a.id}><td>{title(a.activity_id)}</td><td>{gameLabel(a.template)}</td><td><b>{a.score}</b></td><td>{a.correct_count}/{a.total_questions}</td><td>{a.status === "finished" ? fmtSecs(a.total_time_ms) : <span className="chip warn"><Clock size={12} />قيد اللعب</span>}</td><td className="small muted">{fmtDateTime(a.started_at)}</td></tr>)}
          </tbody></table></div>)}
      </div>
      <div className="glass card col">
        <h3 style={{ margin: 0 }}>ملاحظات المعلم</h3>
        <textarea className="field" rows={4} value={note ?? s.teacher_note ?? ""} onChange={(e) => { setNote(e.target.value); touch(); }} placeholder="ملاحظات خاصة بك عن الطالب (لا يراها الطالب)" />
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={save} onCancel={() => { setNote(null); clean(); }} />
    </div>
  );
}
