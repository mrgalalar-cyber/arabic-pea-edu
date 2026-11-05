// اختبار عزل المعلمين وسياسات RLS على مخطط Supabase الفعلي (Postgres داخل العملية عبر PGlite).
// ملاحظة: مخطط auth وstorage هنا مقلِّدات مبسّطة لما توفره Supabase.
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const OWNER = "00000000-0000-0000-0000-0000000000a0";
const TA = "00000000-0000-0000-0000-0000000000a1";
const TB = "00000000-0000-0000-0000-0000000000b1";
const STU = "00000000-0000-0000-0000-0000000000c1";
const SUSP = "00000000-0000-0000-0000-0000000000d1";
const OWNER_EMAIL = "mr.galal.ar@gmail.com";

let db: PGlite;
const ids: Record<string, string> = {};

async function as<T>(sub: string | null, email: string | null, fn: () => Promise<T>): Promise<T> {
  const claims = sub ? JSON.stringify({ sub, email, user_metadata: { email_verified: true } }) : "{}";
  await db.exec(`select set_config('request.jwt.claims', '${claims}', false); set role ${sub ? "authenticated" : "anon"};`);
  try { return await fn(); } finally { await db.exec("reset role;"); }
}
const q = async (sql: string, params: any[] = []) => (await db.query<any>(sql, params)).rows;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create table auth.identities (user_id uuid, provider text);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
    create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as
      $$ select (string_to_array(name,'/'))[1:greatest(array_length(string_to_array(name,'/'),1)-1,0)] $$;
    grant usage on schema public, auth, storage to anon, authenticated;
    grant select on auth.identities to authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    grant all on all tables in schema storage to authenticated;
  `);
  const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf-8")
    .replace("create extension if not exists pgcrypto;", "");
  await db.exec(schema);

  // بيانات تهيئة (بصلاحية المدير)
  await db.exec(`
    insert into auth.identities values ('${OWNER}','google'),('${TA}','google'),('${TB}','google'),('${SUSP}','google');
    insert into public.teachers (id, auth_user_id, email, is_primary) values
      ('10000000-0000-0000-0000-000000000000','${OWNER}','${OWNER_EMAIL}', true),
      ('10000000-0000-0000-0000-00000000000a','${TA}','a@x.com', false),
      ('10000000-0000-0000-0000-00000000000b','${TB}','b@x.com', false);
    insert into public.teachers (id, auth_user_id, email, status) values
      ('10000000-0000-0000-0000-00000000000d','${SUSP}','s@x.com','suspended');
    insert into public.classes (id, teacher_id, name, join_code) values
      ('20000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-00000000000a','فصل أ','AAAA1111'),
      ('20000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-00000000000b','فصل ب','BBBB2222');
    insert into public.students (id, class_id, full_name, auth_user_id) values
      ('30000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-00000000000a','طالب أ','${STU}'),
      ('30000000-0000-0000-0000-00000000000b','20000000-0000-0000-0000-00000000000b','طالب ب', null),
      ('30000000-0000-0000-0000-0000000000a2','20000000-0000-0000-0000-00000000000a','طالب أ2', null);
    insert into public.questions (id, teacher_id, topic, type, prompt, body) values
      ('40000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-00000000000a','grammar','true_false','سؤال أ','{"correct":true}'),
      ('40000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-00000000000b','grammar','true_false','سؤال ب','{"correct":true}');
    insert into public.activities (id, class_id, title, question_ids, status) values
      ('50000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-00000000000a','نشاط أ','{40000000-0000-0000-0000-00000000000a}','published'),
      ('50000000-0000-0000-0000-00000000000b','20000000-0000-0000-0000-00000000000b','نشاط ب','{40000000-0000-0000-0000-00000000000b}','published');
    insert into public.attempts (id, activity_id, student_id, template, question_order, status, score, correct_count, total_questions)
      values ('60000000-0000-0000-0000-00000000000a','50000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','race','{40000000-0000-0000-0000-00000000000a}','finished',15,1,1),
             ('60000000-0000-0000-0000-00000000000b','50000000-0000-0000-0000-00000000000b','30000000-0000-0000-0000-00000000000b','race','{40000000-0000-0000-0000-00000000000b}','finished',15,1,1);
    insert into public.teacher_invites (token_hash, label) values ('h1','دعوة');
  `);
});

describe("هوية المالك", () => {
  it("المالك الحقيقي (Google + البريد المطابق) يُعرَّف مالكًا", async () => {
    const r = await as(OWNER, OWNER_EMAIL, () => q("select public.is_owner() as o"));
    expect(r[0].o).toBe(true);
  });
  it("معلم آخر ليس مالكًا", async () => {
    expect((await as(TA, "a@x.com", () => q("select public.is_owner() as o")))[0].o).toBe(false);
  });
  it("حساب بالبريد نفسه لكن له هوية بريد/كلمة مرور لا يُعدّ مالكًا (منع الانتحال)", async () => {
    const FAKE = "00000000-0000-0000-0000-0000000000ee";
    await db.exec(`insert into auth.identities values ('${FAKE}','email')`);
    expect((await as(FAKE, OWNER_EMAIL, () => q("select public.is_owner() as o")))[0].o).toBe(false);
    await db.exec(`insert into auth.identities values ('${FAKE}','google')`);
    expect((await as(FAKE, OWNER_EMAIL, () => q("select public.is_owner() as o")))[0].o).toBe(false);
  });
  it("مستخدم Google ببريد مختلف لا يصبح مالكًا حتى لو ادّعى ذلك في بيانات المستخدم", async () => {
    expect((await as(TB, "b@x.com", () => q("select public.is_owner() as o")))[0].o).toBe(false);
  });
});

describe("عزل المعلم أ عن المعلم ب", () => {
  it("يرى فصله فقط", async () => {
    const r = await as(TA, "a@x.com", () => q("select name from public.classes"));
    expect(r.map((x) => x.name)).toEqual(["فصل أ"]);
  });
  it("يرى طلاب فصله فقط", async () => {
    const r = await as(TA, "a@x.com", () => q("select full_name from public.students order by 1"));
    expect(r.map((x) => x.full_name)).toEqual(["طالب أ", "طالب أ2"]);
  });
  it("يرى أسئلته فقط (بنك خاص)", async () => {
    const r = await as(TA, "a@x.com", () => q("select prompt from public.questions"));
    expect(r.map((x) => x.prompt)).toEqual(["سؤال أ"]);
  });
  it("يرى أنشطته ونتائج طلابه فقط", async () => {
    expect((await as(TA, "a@x.com", () => q("select title from public.activities"))).length).toBe(1);
    const r = await as(TA, "a@x.com", () => q("select id from public.attempts"));
    expect(r.length).toBe(1);
  });
  it("لا يستطيع إنشاء فصل باسم معلم آخر", async () => {
    await expect(as(TA, "a@x.com", () =>
      q("insert into public.classes (teacher_id,name,join_code) values ('10000000-0000-0000-0000-00000000000b','x','ZZZZ0001')"))).rejects.toThrow();
  });
  it("إنشاء فصل وسؤال يُنسبان تلقائيًا إليه", async () => {
    const r = await as(TA, "a@x.com", async () => {
      const c = await q("insert into public.classes (name,join_code) values ('جديد','NEWC0001') returning teacher_id");
      const qq = await q("insert into public.questions (topic,type,prompt,body) values ('grammar','true_false','س','{\"correct\":true}') returning teacher_id");
      return [c[0].teacher_id, qq[0].teacher_id];
    });
    expect(r).toEqual(["10000000-0000-0000-0000-00000000000a", "10000000-0000-0000-0000-00000000000a"]);
  });
  it("لا يستطيع نقل فصله إلى معلم آخر بتعديل teacher_id", async () => {
    await expect(as(TA, "a@x.com", () =>
      q("update public.classes set teacher_id='10000000-0000-0000-0000-00000000000b' where id='20000000-0000-0000-0000-00000000000a'"))).rejects.toThrow();
  });
  it("لا يستطيع تعديل فصل معلم آخر (0 صفوف)", async () => {
    const r = await as(TA, "a@x.com", () => db.query("update public.classes set name='اختراق' where id='20000000-0000-0000-0000-00000000000b'"));
    expect(r.affectedRows).toBe(0);
  });
  it("لا يستطيع نقل طالب إلى فصل معلم آخر", async () => {
    await expect(as(TA, "a@x.com", () =>
      q("update public.students set class_id='20000000-0000-0000-0000-00000000000b' where id='30000000-0000-0000-0000-0000000000a2'"))).rejects.toThrow();
  });
  it("يستطيع نقل طالب بين فصوله هو", async () => {
    await as(TA, "a@x.com", async () => {
      await q("insert into public.classes (id,name,join_code) values ('20000000-0000-0000-0000-0000000000a2','فصل أ2','AAAA2222')");
      const r = await db.query("update public.students set class_id='20000000-0000-0000-0000-0000000000a2' where id='30000000-0000-0000-0000-0000000000a2'");
      expect(r.affectedRows).toBe(1);
    });
  });
  it("لا يستطيع إسناد سؤال معلم آخر إلى نشاطه", async () => {
    await expect(as(TA, "a@x.com", () =>
      q("insert into public.activities (class_id,title,question_ids) values ('20000000-0000-0000-0000-00000000000a','س','{40000000-0000-0000-0000-00000000000b}')"))).rejects.toThrow();
  });
  it("لا يستطيع إنشاء نشاط داخل فصل معلم آخر", async () => {
    await expect(as(TA, "a@x.com", () =>
      q("insert into public.activities (class_id,title,question_ids) values ('20000000-0000-0000-0000-00000000000b','س','{}')"))).rejects.toThrow();
  });
  it("لا يستطيع ربط حساب مستخدم بملف طالب (الأعمدة الحساسة محجوبة)", async () => {
    await expect(as(TA, "a@x.com", () =>
      q(`update public.students set auth_user_id='${TB}' where id='30000000-0000-0000-0000-0000000000a2'`))).rejects.toThrow();
  });
  it("لا يستطيع تعديل الدرجات", async () => {
    await expect(as(TA, "a@x.com", () => q("update public.attempts set score=999"))).rejects.toThrow();
  });
  it("لا يرى المعلمين الآخرين ولا الدعوات ولا سجل التدقيق", async () => {
    const t = await as(TA, "a@x.com", () => q("select email from public.teachers"));
    expect(t.map((x) => x.email)).toEqual(["a@x.com"]);
    expect((await as(TA, "a@x.com", () => q("select * from public.teacher_invites"))).length).toBe(0);
    expect((await as(TA, "a@x.com", () => q("select * from public.audit_log"))).length).toBe(0);
  });
  it("لا يستطيع ترقية نفسه أو إنشاء معلم أو دعوة", async () => {
    await expect(as(TA, "a@x.com", () => q(`insert into public.teachers (auth_user_id,email) values ('${STU}','z@z.com')`))).rejects.toThrow();
    await expect(as(TA, "a@x.com", () => q(`insert into public.teacher_invites (token_hash) values ('x')`))).rejects.toThrow();
    await expect(as(TA, "a@x.com", () => q(`update public.teachers set status='active'`))).resolves.toBeDefined();
  });
  it("المعلم الموقوف لا يرى شيئًا", async () => {
    expect((await as(SUSP, "s@x.com", () => q("select * from public.classes"))).length).toBe(0);
    expect((await as(SUSP, "s@x.com", () => q("select * from public.questions"))).length).toBe(0);
  });
  it("لوحة الصدارة: معلم لا يرى لوحة نشاط معلم آخر", async () => {
    expect((await as(TA, "a@x.com", () => q("select * from public.activity_leaderboard('50000000-0000-0000-0000-00000000000b')"))).length).toBe(0);
    expect((await as(TA, "a@x.com", () => q("select * from public.activity_leaderboard('50000000-0000-0000-0000-00000000000a')"))).length).toBe(1);
  });
});

describe("المالك", () => {
  it("يرى كل الفصول والأسئلة والمعلمين والدعوات", async () => {
    expect((await as(OWNER, OWNER_EMAIL, () => q("select * from public.classes"))).length).toBeGreaterThanOrEqual(2);
    expect((await as(OWNER, OWNER_EMAIL, () => q("select * from public.questions"))).length).toBeGreaterThanOrEqual(2);
    expect((await as(OWNER, OWNER_EMAIL, () => q("select * from public.teachers"))).length).toBe(4);
    expect((await as(OWNER, OWNER_EMAIL, () => q("select * from public.teacher_invites"))).length).toBe(1);
  });
  it("يستطيع إيقاف معلم لكن لا يستطيع إيقاف صفّ المالك", async () => {
    const r1 = await as(OWNER, OWNER_EMAIL, () => db.query("update public.teachers set status='suspended' where email='b@x.com'"));
    expect(r1.affectedRows).toBe(1);
    const r2 = await as(OWNER, OWNER_EMAIL, () => db.query("update public.teachers set status='suspended' where is_primary"));
    expect(r2.affectedRows).toBe(0);
    await db.exec("update public.teachers set status='active' where email='b@x.com'");
  });
});

describe("الطالب", () => {
  it("لا يقرأ بنك الأسئلة ولا ملفات الطلاب الآخرين ولا المعلمين", async () => {
    expect((await as(STU, "s@s.com", () => q("select * from public.questions"))).length).toBe(0);
    expect((await as(STU, "s@s.com", () => q("select * from public.teachers"))).length).toBe(0);
    const st = await as(STU, "s@s.com", () => q("select full_name from public.students"));
    expect(st.map((x) => x.full_name)).toEqual(["طالب أ"]);
  });
  it("يرى أنشطة فصله المنشورة فقط", async () => {
    const r = await as(STU, "s@s.com", () => q("select title from public.activities"));
    expect(r.map((x) => x.title)).toEqual(["نشاط أ"]);
  });
  it("لا يستطيع كتابة محاولات أو تعديل درجات", async () => {
    await expect(as(STU, "s@s.com", () =>
      q("insert into public.attempts (activity_id,student_id,template,question_order) values ('50000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','race','{}')"))).rejects.toThrow();
    await expect(as(STU, "s@s.com", () => q("update public.attempts set score=1000"))).rejects.toThrow();
  });
  it("إخفاء لوحة الصدارة يخفيها عن الطالب لا عن المعلم", async () => {
    await db.exec("update public.classes set show_leaderboard=false where id='20000000-0000-0000-0000-00000000000a'");
    expect((await as(STU, "s@s.com", () => q("select * from public.activity_leaderboard('50000000-0000-0000-0000-00000000000a')"))).length).toBe(0);
    expect((await as(TA, "a@x.com", () => q("select * from public.activity_leaderboard('50000000-0000-0000-0000-00000000000a')"))).length).toBe(1);
    await db.exec("update public.classes set show_leaderboard=true where id='20000000-0000-0000-0000-00000000000a'");
    expect((await as(STU, "s@s.com", () => q("select * from public.activity_leaderboard('50000000-0000-0000-0000-00000000000a')"))).length).toBe(1);
  });
  it("الطالب الموقوف/المحظور لا يصل لشيء", async () => {
    await db.exec("update public.students set blocked_until = now() + interval '1 day' where auth_user_id = '" + STU + "'");
    expect((await as(STU, "s@s.com", () => q("select * from public.activities"))).length).toBe(0);
    await db.exec("update public.students set blocked_until = null where auth_user_id = '" + STU + "'");
  });
  it("زائر غير مسجّل لا يرى أي بيانات", async () => {
    for (const t of ["classes", "students", "questions", "activities", "attempts", "teachers"]) {
      expect((await as(null, null, () => q(`select * from public.${t}`).catch(() => []))).length).toBe(0);
    }
  });
});
