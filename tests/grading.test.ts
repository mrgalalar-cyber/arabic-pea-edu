import { describe, it, expect } from "vitest";
import { computePoints, correctAnswerText, DEFAULT_SETTINGS, gradeAnswer, normalizeArabic, sanitizeQuestion, seededShuffle } from "../src/lib/grading";

const S = { ...DEFAULT_SETTINGS, pointsPerCorrect: 10, speedBonusMax: 5, secondsPerQuestion: 20 };

describe("التصحيح", () => {
  it("اختيار من متعدد", () => {
    const b = { options: ["أ", "ب", "ج"], correct: 1 };
    expect(gradeAnswer("mcq", b, { choice: 1 }).correct).toBe(true);
    expect(gradeAnswer("mcq", b, { choice: 0 }).correct).toBe(false);
    expect(gradeAnswer("mcq", b, null).correct).toBe(false);
    expect(gradeAnswer("mcq", b, { choice: "1" }).correct).toBe(false);
  });
  it("صح/خطأ", () => {
    expect(gradeAnswer("true_false", { correct: false }, { value: false }).correct).toBe(true);
    expect(gradeAnswer("true_false", { correct: false }, { value: "false" }).correct).toBe(false);
  });
  it("ترتيب", () => {
    const b = { items: ["ذَهَبَ", "الوَلَدُ", "إلى"] };
    expect(gradeAnswer("ordering", b, { order: ["ذَهَبَ", "الوَلَدُ", "إلى"] }).correct).toBe(true);
    expect(gradeAnswer("ordering", b, { order: ["الوَلَدُ", "ذَهَبَ", "إلى"] }).correct).toBe(false);
    expect(gradeAnswer("ordering", b, { order: ["ذَهَبَ"] }).correct).toBe(false);
  });
  it("مطابقة", () => {
    const b = { pairs: [{ left: "طويل", right: "قصير" }, { left: "نهار", right: "ليل" }] };
    expect(gradeAnswer("matching", b, { matches: { طويل: "قصير", نهار: "ليل" } }).correct).toBe(true);
    expect(gradeAnswer("matching", b, { matches: { طويل: "ليل", نهار: "قصير" } }).correct).toBe(false);
    expect(gradeAnswer("matching", b, { matches: { طويل: "قصير" } }).correct).toBe(false);
  });
  it("إكمال فراغ: التشكيل لا يؤثر", () => {
    expect(gradeAnswer("fill_blank", { answer: "كُتُب", strict: true }, { text: "كتب" }).correct).toBe(true);
    expect(gradeAnswer("fill_blank", { answer: "كتب" }, { text: " كُتُبٌ " }).correct).toBe(true);
    expect(gradeAnswer("fill_blank", { answer: "كتب" }, { text: "كاتب" }).correct).toBe(false);
  });
  it("الوضع الصارم يميّز التاء المربوطة والهمزات (إملاء)", () => {
    expect(gradeAnswer("fill_blank", { answer: "ة", strict: true }, { text: "ه" }).correct).toBe(false);
    expect(gradeAnswer("fill_blank", { answer: "أحمد", strict: true }, { text: "احمد" }).correct).toBe(false);
    expect(gradeAnswer("fill_blank", { answer: "أحمد", strict: false }, { text: "احمد" }).correct).toBe(true);
  });
  it("إجابات بديلة مقبولة", () => {
    expect(gradeAnswer("fill_blank", { answer: "مدرسة", accepted: ["المدرسة"], strict: true }, { text: "المدرسة" }).correct).toBe(true);
  });
  it("مدخلات تالفة لا تُسقط الخادم", () => {
    expect(gradeAnswer("ordering", { items: ["a"] }, { order: "x" }).correct).toBe(false);
    expect(gradeAnswer("matching", { pairs: [] }, 5 as any).correct).toBe(false);
    expect(gradeAnswer("mcq", undefined as any, {}).correct).toBe(false);
  });
});

describe("النقاط", () => {
  it("الدرجة الأساسية كما هي + طاقة تتناقص بالزمن", () => {
    expect(computePoints(true, 0, S)).toEqual({ base: 10, bonus: 5 });
    expect(computePoints(true, 10000, S)).toEqual({ base: 10, bonus: 3 });   // نصف الوقت: 2.5 → 3
    expect(computePoints(true, 20000, S)).toEqual({ base: 10, bonus: 0 });
    expect(computePoints(true, 99999, S)).toEqual({ base: 10, bonus: 0 });
  });
  it("الخاطئة بلا نقاط ولا طاقة", () => {
    expect(computePoints(false, 100, S)).toEqual({ base: 0, bonus: 0 });
  });
  it("السرعة وحدها لا تمنح نجاحًا: الإجابة الصحيحة البطيئة تحتفظ بدرجتها كاملة", () => {
    expect(computePoints(true, 19000, S).base).toBe(10);
  });
  it("المعلم يستطيع تعطيل الطاقة", () => {
    expect(computePoints(true, 100, { ...S, speedBonusMax: 0 })).toEqual({ base: 10, bonus: 0 });
  });
});

describe("إرسال الأسئلة للطالب", () => {
  it("لا تتسرب الإجابات الصحيحة", () => {
    const q: any = { id: "q1", type: "mcq", prompt: "؟", topic: "grammar", body: { options: ["أ", "ب", "ج"], correct: 2 } };
    const out = JSON.stringify(sanitizeQuestion(q, "seed"));
    expect(out).not.toContain("correct");
    const items = sanitizeQuestion(q, "seed").body.options;
    expect(items.map((o: any) => o.i).sort()).toEqual([0, 1, 2]);   // الأرقام الأصلية محفوظة لتبقى الإجابة قابلة للتصحيح
    const t: any = { id: "q2", type: "true_false", prompt: "؟", topic: "x", body: { correct: true } };
    expect(sanitizeQuestion(t, "s").body).toEqual({});
    const f: any = { id: "q3", type: "fill_blank", prompt: "؟", topic: "x", body: { answer: "سر", accepted: ["سر2"], choices: ["سر", "غير"] } };
    expect(JSON.stringify(sanitizeQuestion(f, "s"))).not.toContain("سر2");
  });
  it("الخلط حتمي بالبذرة", () => {
    expect(seededShuffle([1, 2, 3, 4, 5, 6], "a")).toEqual(seededShuffle([1, 2, 3, 4, 5, 6], "a"));
    expect(seededShuffle([1, 2, 3, 4, 5, 6], "a").sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("نص الإجابة الصحيحة للعرض", () => {
    expect(correctAnswerText("mcq", { options: ["x", "y"], correct: 1 })).toBe("y");
    expect(correctAnswerText("true_false", { correct: false })).toBe("خطأ");
    expect(normalizeArabic("الشَّمْسُ")).toBe("الشمس");
  });
});
