import { useState } from "react";
import { Download, Monitor, Moon, Sun } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";
import { useAuth } from "../../lib/auth";
import { downloadFile } from "../../lib/util";
import { PageHead } from "../../components/bits";
import { useToast } from "../../lib/ui";

export default function SettingsPage() {
  const { pref, setPref } = useTheme(); const { me } = useAuth(); const toast = useToast(); const [busy, setBusy] = useState(false);

  const backup = async () => {
    setBusy(true);
    try {
      // كل جدول يُقرأ عبر RLS فيحصل المعلم على بياناته فقط (والمالك على الجميع). أعمدة الهوية والرموز لا تُصدَّر.
      const tables: [string, string][] = [
        ["classes", "*"], ["students", "id,class_id,full_name,email,login_kind,status,blocked_until,avatar,teacher_note,joined_at,archived_at"],
        ["learning_refs", "*"], ["questions", "*"], ["activities", "*"], ["attempts", "*"], ["attempt_answers", "*"],
      ];
      const out: Record<string, unknown> = { exported_at: new Date().toISOString(), version: 1 };
      for (const [t, cols] of tables) { const r = await supabase.from(t).select(cols).limit(50000); if (r.error) throw new Error(`${t}: ${r.error.message}`); out[t] = r.data; }
      downloadFile(`نسخة-احتياطية-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(out, null, 1), "application/json;charset=utf-8");
      toast("تم تنزيل النسخة الاحتياطية");
    } catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  };

  return (
    <div className="page">
      <PageHead title="الإعدادات" />
      <div className="glass card col" style={{ maxWidth: 640 }}>
        <h3 style={{ margin: 0 }}>المظهر</h3>
        <div className="tabs" role="radiogroup" aria-label="المظهر">
          {([["light", "نهاري", <Sun size={16} key="s" />], ["dark", "ليلي", <Moon size={16} key="m" />], ["system", "حسب الجهاز", <Monitor size={16} key="d" />]] as const).map(([v, l, i]) => <button key={v} role="radio" aria-checked={pref === v} className={pref === v ? "on" : ""} onClick={() => setPref(v)}>{i}{l}</button>)}
        </div>
      </div>
      <div className="glass card col" style={{ maxWidth: 640 }}>
        <h3 style={{ margin: 0 }}>الحساب</h3>
        <div className="small"><div>البريد: <b dir="ltr">{me?.email}</b></div><div>الدور: <b>{me?.role === "owner" ? "مالك المنصة" : "معلم"}</b></div></div>
      </div>
      <div className="glass card col" style={{ maxWidth: 640 }}>
        <h3 style={{ margin: 0 }}>نسخة احتياطية</h3>
        <p className="muted small">تنزيل ملف JSON بفصولك وطلابك وأسئلتك وأنشطتك ونتائجك. يُنصح بتنزيله دوريًا (الخطة المجانية في Supabase بلا نسخ احتياطية تلقائية). لا يتضمن الرموز ولا بيانات الدخول. للاستعادة من الملف راجع قسم النسخ الاحتياطي في README-ar.md.</p>
        <button className="btn" disabled={busy} onClick={backup}><Download size={18} />{busy ? "جارٍ التجهيز…" : "تنزيل نسخة احتياطية"}</button>
      </div>
    </div>
  );
}
