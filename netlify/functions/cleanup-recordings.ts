// وظيفة مجدولة يوميًا: تحذف التسجيلات الصوتية فعليًا من التخزين بعد انقضاء delete_after (3 أشهر من الرفع).
// تُسجَّل النتيجة في الجدول (deleted_at / delete_error)؛ وأي فشل يُعاد المحاولة فيه في التشغيل التالي.
import type { Config } from "@netlify/functions";
import { admin } from "./_shared/util";

export const config: Config = { schedule: "@daily" };

export default async () => {
  const db = admin();
  const started = Date.now();
  let removed = 0, failed = 0;

  // الخطة المجانية تحدّد زمن الوظيفة بنحو 10 ثوانٍ، فنعمل بدفعات ونتوقف قبل الحد
  while (Date.now() - started < 7000) {
    const { data: due, error } = await db.from("recordings").select("id,storage_path")
      .is("deleted_at", null).lte("delete_after", new Date().toISOString()).limit(50);
    if (error) { console.error("cleanup query failed", error.message); break; }
    if (!due?.length) break;

    for (const rec of due) {
      if (rec.storage_path) {
        const r = await db.storage.from("recordings").remove([rec.storage_path]);
        if (r.error) {
          failed++;
          await db.from("recordings").update({ delete_error: r.error.message.slice(0, 300) }).eq("id", rec.id);
          continue;
        }
      }
      await db.from("recordings").update({ storage_path: null, deleted_at: new Date().toISOString(), delete_error: null }).eq("id", rec.id);
      removed++;
    }
    if (failed >= due.length) break; // كل الدفعة فشلت: لا فائدة من التكرار الآن
  }
  await db.from("audit_log").insert({ action: "recordings.cleanup", details: { removed, failed } });
  console.log(`cleanup: removed=${removed} failed=${failed}`);
};
