import { useState } from "react";
import { ArchiveRestore } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Empty, ErrorBox, Loading, useAsync, useToast } from "../../lib/ui";
import { fmtDate } from "../../lib/util";
import { PageHead } from "../../components/bits";

const KINDS = [
  { id: "classes", label: "الفصول", table: "classes", title: "name" },
  { id: "students", label: "الطلاب", table: "students", title: "full_name" },
  { id: "activities", label: "الأنشطة", table: "activities", title: "title" },
  { id: "questions", label: "الأسئلة", table: "questions", title: "prompt" },
  { id: "refs", label: "المراجع", table: "learning_refs", title: "title" },
] as const;

export default function ArchivePage() {
  const toast = useToast(); const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("classes");
  const k = KINDS.find((x) => x.id === kind)!;
  const { data, loading, error, reload } = useAsync(async () => {
    const r = await supabase.from(k.table).select("*").not("archived_at", "is", null).order("archived_at", { ascending: false });
    if (r.error) throw new Error(r.error.message); return r.data as any[];
  }, [kind]);
  const restore = async (id: string) => { const { error } = await supabase.from(k.table).update({ archived_at: null }).eq("id", id); if (error) return toast(error.message, true); toast("تم الاسترجاع"); reload(); };
  return (
    <div className="page">
      <PageHead title="الأرشيف" sub="الحذف عندنا أرشفة قابلة للاسترجاع؛ لا حذف نهائي مباشر." />
      <div className="tabs">{KINDS.map((x) => <button key={x.id} className={kind === x.id ? "on" : ""} onClick={() => setKind(x.id)}>{x.label}</button>)}</div>
      <div className="glass card col">
        {loading ? <Loading /> : error ? <ErrorBox msg={error} /> : !data?.length ? <Empty text="لا عناصر مؤرشفة هنا." /> : data.map((r) => (
          <div key={r.id} className="row glass card" style={{ padding: 14 }}>
            <div className="grow"><b className="tashkeel" style={{ fontSize: "1.05rem" }}>{String(r[k.title]).slice(0, 90)}</b><div className="small muted">أُرشف في {fmtDate(r.archived_at)}</div></div>
            <button className="btn ghost sm" onClick={() => restore(r.id)}><ArchiveRestore size={16} />استرجاع</button>
          </div>))}
        {kind === "students" && <p className="small muted">إن كان فصل الطالب مؤرشفًا فاسترجع الفصل أولًا.</p>}
      </div>
    </div>
  );
}
