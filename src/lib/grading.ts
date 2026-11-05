// منطق التصحيح والنقاط — نقي (بلا اعتماد على المتصفح) ويُستخدم في الخادم والاختبارات.

export type QType = "mcq" | "true_false" | "ordering" | "matching" | "fill_blank" | "quick";

export interface ActivitySettings {
  pointsPerCorrect: number;   // درجة صحة الإجابة
  speedBonusMax: number;      // أقصى نقاط طاقة للإجابة الصحيحة السريعة
  secondsPerQuestion: number; // الوقت المتاح لكل سؤال
  maxAttempts: number;
  timer: boolean;
  allowPause: boolean;
}

export const DEFAULT_SETTINGS: ActivitySettings = {
  pointsPerCorrect: 10, speedBonusMax: 5, secondsPerQuestion: 20, maxAttempts: 1, timer: true, allowPause: true,
};

/** إزالة التشكيل والتطويل وتوحيد الألف والياء/التاء المربوطة قبل مقارنة الإجابات الكتابية */
export function normalizeArabic(input: string, strict = false): string {
  let s = (input ?? "")
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "");   // التشكيل والتطويل لا يُحتسبان دائمًا
  // في الوضع الصارم (الإملاء) تبقى الهمزات والتاء المربوطة والألف المقصورة مميّزة
  if (!strict) s = s.replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

export interface GradeResult { correct: boolean }

/** body = محتوى السؤال المخزّن، response = إجابة الطالب */
export function gradeAnswer(type: QType, body: any, response: any): GradeResult {
  try {
    switch (type) {
      case "mcq":
      case "quick":
        return { correct: Number.isInteger(response?.choice) && response.choice === body.correct };
      case "true_false":
        return { correct: typeof response?.value === "boolean" && response.value === body.correct };
      case "ordering": {
        const r: unknown = response?.order;
        if (!Array.isArray(r) || r.length !== body.items.length) return { correct: false };
        return { correct: r.every((v, i) => v === body.items[i]) };
      }
      case "matching": {
        const m = response?.matches; // { [left]: right }
        if (!m || typeof m !== "object") return { correct: false };
        const pairs = body.pairs as { left: string; right: string }[];
        return { correct: pairs.every((p) => m[p.left] === p.right) && Object.keys(m).length === pairs.length };
      }
      case "fill_blank": {
        const strict = body.strict !== false;
        const a = normalizeArabic(String(response?.text ?? ""), strict);
        if (!a) return { correct: false };
        const ok = [body.answer, ...(body.accepted ?? [])].map((x: string) => normalizeArabic(x, strict));
        return { correct: ok.includes(a) };
      }
    }
  } catch { /* تجاهل */ }
  return { correct: false };
}

/** نقاط الإجابة: الدرجة الأساسية كما هي + نقاط طاقة تتناقص خطيًا مع الزمن (للصحيحة فقط) */
export function computePoints(correct: boolean, timeMs: number, s: ActivitySettings) {
  if (!correct) return { base: 0, bonus: 0 };
  const limit = Math.max(1, s.secondsPerQuestion) * 1000;
  const t = Math.min(Math.max(timeMs, 0), limit);
  const bonus = s.speedBonusMax > 0 ? Math.round(s.speedBonusMax * (1 - t / limit)) : 0;
  return { base: s.pointsPerCorrect, bonus };
}

/** مثل الخلط لكن حتميّ بالبذرة (يُستعمل لترتيب الأسئلة والخيارات) */
export function seededShuffle<T>(arr: T[], seed: string): T[] {
  let h = 2166136261;
  for (const c of seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** إزالة الإجابات الصحيحة من السؤال قبل إرساله لمتصفح الطالب */
export function sanitizeQuestion(q: { id: string; type: QType; prompt: string; body: any; image_url?: string | null; topic: string }, seed: string) {
  let body: any = {};
  switch (q.type) {
    case "mcq":
    case "quick": {
      // نخلط الخيارات ونرسل أرقامها الأصلية حتى يبقى التصحيح ممكنًا
      const idx = seededShuffle<number>(q.body.options.map((_: string, i: number) => i), seed + q.id);
      body = { options: idx.map((i) => ({ i, text: q.body.options[i] as string })) };
      break;
    }
    case "true_false": body = {}; break;
    case "ordering": body = { items: seededShuffle<string>(q.body.items, seed + q.id) }; break;
    case "matching":
      body = {
        lefts: q.body.pairs.map((p: any) => p.left),
        rights: seededShuffle<string>(q.body.pairs.map((p: any) => p.right), seed + q.id),
      };
      break;
    case "fill_blank": body = { choices: q.body.choices ? seededShuffle<string>(q.body.choices, seed + q.id) : null }; break;
  }
  return { id: q.id, type: q.type, prompt: q.prompt, topic: q.topic, image_url: q.image_url ?? null, body };
}

/** نص الإجابة الصحيحة للعرض بعد الإجابة */
export function correctAnswerText(type: QType, body: any): string {
  switch (type) {
    case "mcq": case "quick": return body.options[body.correct];
    case "true_false": return body.correct ? "صح" : "خطأ";
    case "ordering": return body.items.join(" ← ");
    case "matching": return body.pairs.map((p: any) => `${p.left} = ${p.right}`).join("، ");
    case "fill_blank": return body.answer;
  }
}
