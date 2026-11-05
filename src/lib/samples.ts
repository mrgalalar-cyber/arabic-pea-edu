// أسئلة تجريبية موسومة is_sample=true تظهر بوسم «تجريبي». تُدرج فعليًا في بنك المعلم الحالي (وتخصه وحده) عند طلبه.
import { supabase } from "./supabase";

const G = ["race", "garden"];
type S = { topic: string; type: string; difficulty: number; prompt: string; body: any; explanation?: string; skill?: string; ref?: boolean };

const REF_TITLE = "حَديقةُ الحَيَوانِ (قطعة تجريبية)";
const REF_TEXT = "ذَهَبَتْ سَلْمى مَعَ أُسْرَتِها إلى حَديقةِ الحَيَوانِ. شاهَدَتِ الأَسَدَ والفِيلَ والزَّرافةَ. أَعجَبَها الفِيلُ لأَنَّهُ كَبيرٌ ولَطيفٌ، وأَطعَمَتِ العَصافيرَ الحَبَّ.";

const SAMPLES: S[] = [
  { topic: "grammar", type: "mcq", difficulty: 1, skill: "الفاعل", prompt: "الفاعِلُ في جُملةِ «كَتَبَ الطّالِبُ الدَّرسَ» هو:", body: { options: ["الطّالِبُ", "الدَّرسَ", "كَتَبَ", "لا شيءَ"], correct: 0 }, explanation: "الفاعِلُ هو مَن قامَ بالفِعلِ، والذي كَتَبَ هو الطّالِبُ." },
  { topic: "grammar", type: "mcq", difficulty: 1, skill: "الجملة الفعلية", prompt: "اختَرِ الجُملةَ الفِعلِيّةَ:", body: { options: ["الشَّمسُ مُشرِقةٌ", "ذَهَبَ أَحمَدُ إلى المَدرَسةِ", "الحَديقةُ جَميلةٌ", "العِلمُ نورٌ"], correct: 1 }, explanation: "الجُملةُ الفِعلِيّةُ تَبدأُ بِفِعلٍ، وهنا الفِعلُ «ذَهَبَ»." },
  { topic: "grammar", type: "true_false", difficulty: 1, skill: "أنواع الفعل", prompt: "الفِعلُ «يَلعَبُ» فِعلٌ مُضارِعٌ.", body: { correct: true }, explanation: "يَبدأُ بِحَرفِ المُضارَعةِ (الياء) ويَدُلُّ على الحاضِرِ أو المُستَقبَلِ." },
  { topic: "grammar", type: "ordering", difficulty: 2, skill: "تركيب الجملة", prompt: "رَتِّبِ الكَلِماتِ لِتُكَوِّنَ جُملةً مُفيدةً:", body: { items: ["ذَهَبَ", "الوَلَدُ", "إلى", "المَدرَسةِ"] } },
  { topic: "vocabulary", type: "mcq", difficulty: 1, skill: "المرادف", prompt: "ما مُرادِفُ كَلِمةِ «سَعيد»؟", body: { options: ["حَزين", "مَسرور", "غاضِب", "مُتعَب"], correct: 1 } },
  { topic: "vocabulary", type: "mcq", difficulty: 1, skill: "الضد", prompt: "ما ضِدُّ كَلِمةِ «قَريب»؟", body: { options: ["بَعيد", "صَغير", "سَريع", "جَميل"], correct: 0 } },
  { topic: "vocabulary", type: "matching", difficulty: 2, skill: "الأضداد", prompt: "صِلْ كُلَّ كَلِمةٍ بِضِدِّها:", body: { pairs: [{ left: "طَويل", right: "قَصير" }, { left: "نَهار", right: "لَيل" }, { left: "فَرَح", right: "حُزن" }, { left: "قَوِيّ", right: "ضَعيف" }] } },
  { topic: "vocabulary", type: "fill_blank", difficulty: 2, skill: "الجمع", prompt: "جَمعُ كَلِمةِ «كِتاب» هو: ______", body: { answer: "كُتُب", accepted: [], choices: ["كُتُب", "كاتِبون", "مَكاتِب"], strict: true } },
  { topic: "spelling", type: "fill_blank", difficulty: 1, skill: "التاء المربوطة", prompt: "أَكمِلْ بِالحَرفِ المُناسِبِ (ة / ت): الطّالِب__ مُجتَهِدةٌ", body: { answer: "ة", accepted: [], choices: ["ة", "ت"], strict: true }, explanation: "كَلِمةُ «الطّالِبةُ» اسمٌ مُفرَدٌ مُؤَنَّثٌ فَتُكتَبُ بِتاءٍ مَربوطةٍ." },
  { topic: "reading", type: "true_false", difficulty: 1, skill: "اللام الشمسية", prompt: "في كَلِمةِ «الشَّمسُ» لا تُنطَقُ اللّامُ.", body: { correct: true }, explanation: "لامُ «الـ» تُدغَمُ في الشّينِ لأنَّها حَرفٌ شَمسِيٌّ." },
  { topic: "writing", type: "mcq", difficulty: 2, skill: "بداية القصة", prompt: "أيُّ الجُمَلِ تَصلُحُ بِدايةً لِقِصّةٍ؟", body: { options: ["كانَ يا ما كانَ في قَديمِ الزَّمانِ…", "وشُكرًا لَكُم", "وأَخيرًا انتَهَتِ الحِكايةُ", "انتَبِهوا أَيُّها الرُّكّابُ"], correct: 0 } },
  { topic: "comprehension", type: "mcq", difficulty: 1, ref: true, skill: "التفاصيل", prompt: "إلى أَينَ ذَهَبَتْ سَلْمى؟", body: { options: ["المَدرَسةِ", "حَديقةِ الحَيَوانِ", "السُّوقِ"], correct: 1 } },
  { topic: "comprehension", type: "mcq", difficulty: 1, ref: true, skill: "التفاصيل", prompt: "ما الحَيَوانُ الذي أَعجَبَ سَلْمى؟", body: { options: ["الأَسَدُ", "الزَّرافةُ", "الفِيلُ"], correct: 2 } },
  { topic: "comprehension", type: "true_false", difficulty: 2, ref: true, skill: "الاستنتاج", prompt: "أَطعَمَتْ سَلْمى القِرَدةَ.", body: { correct: false }, explanation: "أَطعَمَتِ العَصافيرَ الحَبَّ." },
];

/** يدرج الأسئلة التجريبية في بنك المعلم الحالي. يعيد عدد الأسئلة المُدرَجة. */
export async function seedSamples(): Promise<number> {
  const { data: ref, error: e1 } = await supabase.from("learning_refs").insert({ title: REF_TITLE, topic: "comprehension", content: REF_TEXT }).select("id").single();
  if (e1) throw new Error("تعذر إضافة المرجع التجريبي: " + e1.message);
  const rows = SAMPLES.map((s) => ({
    topic: s.topic, type: s.type, difficulty: s.difficulty, skill: s.skill ?? null, prompt: s.prompt, body: s.body,
    explanation: s.explanation ?? null, game_templates: G, status: "approved", is_sample: true, ref_id: s.ref ? ref.id : null,
  }));
  const { error } = await supabase.from("questions").insert(rows);
  if (error) throw new Error("تعذر إضافة الأسئلة: " + error.message);
  return rows.length;
}
