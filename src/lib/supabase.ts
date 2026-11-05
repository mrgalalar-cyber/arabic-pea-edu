import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** false حين لم تُضبط متغيرات البيئة بعد؛ تعرض الواجهة شاشة إعداد واضحة بدل الانهيار. */
export const configured = Boolean(url && key);

// مفتاح anon عام بحكم تصميم Supabase، والأمان الفعلي في سياسات RLS داخل قاعدة البيانات.
export const supabase = createClient(url ?? "http://localhost:54321", key ?? "not-configured", {
  auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
