export const TOPICS = [
  { id: "reading", label: "القراءة" },
  { id: "comprehension", label: "الفهم والاستيعاب" },
  { id: "vocabulary", label: "الحصيلة اللغوية" },
  { id: "spelling", label: "الرسم الهجائي" },
  { id: "dictation", label: "فقرات الإملاء" },
  { id: "grammar", label: "قواعد النحو" },
  { id: "writing", label: "التعبير الكتابي" },
] as const;
export const topicLabel = (id: string) => TOPICS.find((t) => t.id === id)?.label ?? id;

export const QTYPES = [
  { id: "mcq", label: "اختيار من متعدد" },
  { id: "true_false", label: "صح أو خطأ" },
  { id: "ordering", label: "ترتيب" },
  { id: "matching", label: "توصيل ومطابقة" },
  { id: "fill_blank", label: "إكمال فراغ" },
  { id: "quick", label: "تحدٍّ سريع" },
] as const;
export const qtypeLabel = (id: string) => QTYPES.find((t) => t.id === id)?.label ?? id;

export const DIFFICULTY = ["", "سهل", "متوسط", "صعب"];

export const GAMES = [
  { id: "race", label: "سباق التحدي", desc: "تسابق مع عقارب الوقت: كل إجابة صحيحة تدفع مركبتك للأمام.", color: "#0b8794" },
  { id: "garden", label: "حديقة المعرفة", desc: "ازرع نبتتك: كل إجابة صحيحة تسقيها فتنمو وتزهر.", color: "#2f9e5f" },
] as const;
export const gameLabel = (id: string) => GAMES.find((g) => g.id === id)?.label ?? id;

export const PHASE_NEXT = ["التقييم", "التقارير والتحليلات", "الشهادات", "الرسائل"] as const;
