-- =====================================================================
-- منصة التعلّم العربية — مخطط قاعدة البيانات (Supabase / Postgres)
-- شغّله مرة واحدة في: Supabase → SQL Editor → New query → Run
-- آمن لإعادة التشغيل (idempotent) قدر الإمكان.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- 1) الإعدادات والمالك
-- ---------------------------------------------------------------
create table if not exists public.app_config (
  key   text primary key,
  value text not null
);
alter table public.app_config enable row level security;

-- بريد المالك (معرّف وليس سرًا). غيّره من هنا عند الحاجة:
--   update public.app_config set value = 'new@mail.com' where key = 'owner_email';
insert into public.app_config (key, value)
values ('owner_email', 'mr.galal.ar@gmail.com')
on conflict (key) do nothing;

-- هوية المستخدم: هل لديه هوية Google؟ وهل لديه هوية بريد/كلمة مرور (تُمنع للمالك والمعلمين)؟
create or replace function public.has_identity(p_provider text)
returns boolean language sql stable security definer set search_path = public, auth
as $$ select exists (select 1 from auth.identities i where i.user_id = auth.uid() and i.provider = p_provider); $$;

-- المالك = بريده المُتحقق منه يطابق owner_email + دخل بـ Google + لا توجد له هوية بريد/كلمة مرور.
-- يُقرأ من JWT الموقّع من Supabase ومن جدول الهويات، ولا يمكن تزويره من المتصفح.
create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public, auth
as $$
  select coalesce(
    lower(auth.jwt() ->> 'email') = lower((select value from public.app_config where key = 'owner_email'))
    and coalesce((auth.jwt() -> 'user_metadata' ->> 'email_verified')::boolean, false)
    and public.has_identity('google')
    and not public.has_identity('email'),
    false);
$$;

drop policy if exists app_config_owner on public.app_config;
create policy app_config_owner on public.app_config for select using (public.is_owner());

-- المعلمون (المالك أيضًا له صف هنا ليملك فصولًا، وتنشئه وظيفة الخادم `me`)
create table if not exists public.teachers (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,
  email        text not null,
  display_name text,
  is_primary   boolean not null default false,
  status       text not null default 'active' check (status in ('active','suspended')),
  invited_by   uuid,
  created_at   timestamptz not null default now(),
  archived_at  timestamptz
);
alter table public.teachers enable row level security;

-- معرّف المعلم الحالي (نشط فقط). يعمل مع المالك وبقية المعلمين.
create or replace function public.my_teacher_id()
returns uuid language sql stable security definer set search_path = public
as $$
  select t.id from public.teachers t
  where t.auth_user_id = auth.uid() and t.status = 'active' and t.archived_at is null
  limit 1;
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_owner() or public.my_teacher_id() is not null; $$;

-- دعوات المعلمين (تُنشأ بوظيفة الخادم؛ يُخزَّن SHA-256 للرمز فقط)
create table if not exists public.teacher_invites (
  id         uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  label      text,
  email      text,                                   -- اختياري: يقصر الدعوة على بريد Google محدد
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at    timestamptz,
  used_by    uuid,
  revoked_at timestamptz
);
alter table public.teacher_invites enable row level security;

drop policy if exists teachers_select on public.teachers;
create policy teachers_select on public.teachers for select
  using (public.is_owner() or auth_user_id = auth.uid());
drop policy if exists teachers_owner_update on public.teachers;
create policy teachers_owner_update on public.teachers for update
  using (public.is_owner() and not is_primary) with check (public.is_owner() and not is_primary);
revoke insert, update, delete on public.teachers from authenticated, anon;
grant update (status, display_name, archived_at) on public.teachers to authenticated;

drop policy if exists invites_owner on public.teacher_invites;
create policy invites_owner on public.teacher_invites for select using (public.is_owner());
drop policy if exists invites_owner_upd on public.teacher_invites;
create policy invites_owner_upd on public.teacher_invites for update using (public.is_owner()) with check (public.is_owner());
revoke insert, update, delete on public.teacher_invites from authenticated, anon;
grant update (revoked_at) on public.teacher_invites to authenticated;

-- ---------------------------------------------------------------
-- 2) الفصول والطلاب
-- ---------------------------------------------------------------
create table if not exists public.classes (
  id               uuid primary key default gen_random_uuid(),
  teacher_id       uuid not null default public.my_teacher_id() references public.teachers(id),
  name             text not null,
  grade            text,
  join_code        text not null unique,
  show_leaderboard boolean not null default true,
  archived_at      timestamptz,
  created_at       timestamptz not null default now()
);

create table if not exists public.students (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references public.classes(id),
  full_name     text not null,
  email         text,
  auth_user_id  uuid unique,                       -- null = ملف لم يُطالَب به بعد
  login_kind    text check (login_kind in ('google','code')),
  code_hash     text unique,                        -- SHA-256 لرمز الدخول الثابت (لا يُخزَّن الرمز نفسه)
  status        text not null default 'active' check (status in ('active','suspended')),
  blocked_until timestamptz,                        -- حظر مؤقت
  avatar        text not null default 'a1',
  teacher_note  text,
  joined_at     timestamptz not null default now(),
  last_seen_at  timestamptz,
  archived_at   timestamptz
);
create index if not exists students_class_idx on public.students(class_id);

create table if not exists public.join_requests (
  id              uuid primary key default gen_random_uuid(),
  class_id        uuid not null references public.classes(id),
  student_id      uuid references public.students(id),   -- إن اختار ملفًا موجودًا
  requested_name  text not null,
  auth_user_id    uuid,                                  -- إن كان طلب Google
  email           text,
  token_hash      text,                                  -- لمتابعة الحالة دون حساب
  status          text not null default 'pending' check (status in ('pending','approved','rejected')),
  issued_code     text,                                  -- يُسلَّم مرة واحدة ثم يُمسح
  created_at      timestamptz not null default now(),
  decided_at      timestamptz
);
create index if not exists jr_class_idx on public.join_requests(class_id, status);

-- هوية الطالب الحالي (فقط إن كان نشطًا وغير محظور وغير مؤرشف)
create or replace function public.my_student_id()
returns uuid language sql stable security definer set search_path = public
as $$
  select s.id from public.students s
  where s.auth_user_id = auth.uid()
    and s.archived_at is null
    and s.status = 'active'
    and (s.blocked_until is null or s.blocked_until <= now())
  limit 1;
$$;

create or replace function public.my_class_id()
returns uuid language sql stable security definer set search_path = public
as $$
  select s.class_id from public.students s
  where s.id = public.my_student_id();
$$;

-- هل الفصل يخص المستخدم الحالي؟ (المالك: كل الفصول، المعلم: فصوله فقط)
create or replace function public.owns_class(p_class uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_owner()
      or exists (select 1 from public.classes c
                 where c.id = p_class and c.teacher_id = public.my_teacher_id());
$$;

-- ---------------------------------------------------------------
-- 3) بنك الأسئلة والمراجع
-- ---------------------------------------------------------------
create table if not exists public.learning_refs (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null default public.my_teacher_id() references public.teachers(id),
  title       text not null,
  topic       text,
  content     text not null default '',
  image_url   text,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.questions (
  id             uuid primary key default gen_random_uuid(),
  teacher_id     uuid not null default public.my_teacher_id() references public.teachers(id),
  topic          text not null check (topic in
                   ('reading','comprehension','vocabulary','spelling','dictation','grammar','writing')),
  skill          text,
  subject        text,
  difficulty     int  not null default 1 check (difficulty between 1 and 3),
  type           text not null check (type in ('mcq','true_false','ordering','matching','fill_blank','quick')),
  prompt         text not null,
  -- mcq/quick : {"options":["..",".."],"correct":0}
  -- true_false: {"correct":true}
  -- ordering  : {"items":["الأول","الثاني",...]}   (بالترتيب الصحيح)
  -- matching  : {"pairs":[{"left":"..","right":".."}]}
  -- fill_blank: {"answer":"..","accepted":[".."],"choices":["..",".."]}
  body           jsonb not null,
  explanation    text,
  ref_id         uuid references public.learning_refs(id),
  image_url      text,
  game_templates text[] not null default '{race,garden}',
  status         text not null default 'approved' check (status in ('draft','approved')),
  is_sample      boolean not null default false,
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists questions_topic_idx on public.questions(teacher_id, topic, difficulty);

-- ---------------------------------------------------------------
-- 4) الأنشطة والمحاولات
-- ---------------------------------------------------------------
create table if not exists public.activities (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  class_id     uuid not null references public.classes(id),
  student_ids  uuid[],                              -- null = كل الفصل
  question_ids uuid[] not null default '{}',
  required     boolean not null default false,      -- افتراضيًا اختياري
  opens_at     timestamptz,
  closes_at    timestamptz,
  templates    text[] not null default '{race}',     -- أكثر من قالب = الطالب يختار
  ref_id       uuid references public.learning_refs(id),
  image_url    text,
  settings     jsonb not null default
    '{"pointsPerCorrect":10,"speedBonusMax":5,"secondsPerQuestion":20,"maxAttempts":1,"timer":true,"allowPause":true}',
  status       text not null default 'draft' check (status in ('draft','published')),
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists activities_class_idx on public.activities(class_id);

create table if not exists public.attempts (
  id              uuid primary key default gen_random_uuid(),
  activity_id     uuid not null references public.activities(id),
  student_id      uuid not null references public.students(id),
  attempt_no      int  not null default 1,
  template        text not null,
  question_order  uuid[] not null,
  status          text not null default 'in_progress' check (status in ('in_progress','finished')),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  correct_count   int not null default 0,
  total_questions int not null default 0,
  base_points     int not null default 0,
  bonus_points    int not null default 0,
  score           int not null default 0,
  total_time_ms   bigint not null default 0,
  rating          int check (rating between 1 and 5),
  unique (activity_id, student_id, attempt_no)
);
create index if not exists attempts_act_idx on public.attempts(activity_id, status);
create index if not exists attempts_student_idx on public.attempts(student_id, started_at desc);

create table if not exists public.attempt_answers (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid not null references public.attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id),
  response    jsonb,
  correct     boolean not null,
  time_ms     int not null default 0,
  base_points int not null default 0,
  bonus_points int not null default 0,
  answered_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

-- ---------------------------------------------------------------
-- 5) سجلات ومساعدات خلفية
-- ---------------------------------------------------------------
create table if not exists public.audit_log (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  action    text not null,
  entity    text,
  entity_id uuid,
  details   jsonb
);

create table if not exists public.rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  hits         int not null default 0
);

-- حدّ محاولات بسيط (يُستدعى من الوظائف الخلفية فقط)
create or replace function public.rl_hit(p_key text, p_max int, p_window interval)
returns boolean language plpgsql security definer set search_path = public
as $$
declare r public.rate_limits;
begin
  insert into public.rate_limits(key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case when public.rate_limits.window_start < now() - p_window then now() else public.rate_limits.window_start end,
    hits         = case when public.rate_limits.window_start < now() - p_window then 1 else public.rate_limits.hits + 1 end
  returning * into r;
  return r.hits <= p_max;
end $$;
revoke all on function public.rl_hit(text,int,interval) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 6) المرحلة 2 (مجهّزة): الواجبات الصوتية — الحذف بعد 3 أشهر
-- ---------------------------------------------------------------
create table if not exists public.recording_tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  reading_text text,
  class_id     uuid not null references public.classes(id),
  student_ids  uuid[],
  max_seconds  int not null default 120,
  due_at       timestamptz,
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists public.recordings (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.recording_tasks(id),
  student_id   uuid not null references public.students(id),
  storage_path text,                                   -- يصبح null بعد الحذف الفعلي
  mime         text,
  duration_s   int,
  uploaded_at  timestamptz not null default now(),
  delete_after timestamptz not null default (now() + interval '3 months'),
  deleted_at   timestamptz,
  delete_error text,
  grade        int check (grade between 0 and 100),
  teacher_note text,
  reviewed_at  timestamptz
);
create index if not exists recordings_due_idx on public.recordings(delete_after) where deleted_at is null;

-- ---------------------------------------------------------------
-- 7) حراسة الأنشطة: الأسئلة والمراجع والطلاب المستهدفون يجب أن يخصّوا معلم الفصل نفسه
--    (تمنع معلمًا من إسناد/قراءة محتوى معلم آخر حتى لو عرف معرّفاته)
-- ---------------------------------------------------------------
create or replace function public.activities_guard()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_teacher uuid; bad int;
begin
  select teacher_id into v_teacher from public.classes where id = new.class_id;
  if v_teacher is null then raise exception 'فصل غير موجود'; end if;

  select count(*) into bad
  from unnest(new.question_ids) as qid
  left join public.questions q on q.id = qid
  where q.id is null or q.teacher_id <> v_teacher;
  if bad > 0 then raise exception 'يوجد سؤال لا يخص معلّم هذا الفصل'; end if;

  if new.ref_id is not null and not exists
     (select 1 from public.learning_refs r where r.id = new.ref_id and r.teacher_id = v_teacher) then
    raise exception 'المرجع لا يخص معلّم هذا الفصل';
  end if;

  if new.student_ids is not null then
    select count(*) into bad from unnest(new.student_ids) as sid
    left join public.students s on s.id = sid
    where s.id is null or s.class_id <> new.class_id;
    if bad > 0 then raise exception 'طالب مستهدف ليس من هذا الفصل'; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_activities_guard on public.activities;
create trigger trg_activities_guard before insert or update on public.activities
  for each row execute function public.activities_guard();

create or replace function public.owns_activity(p_activity uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.activities a where a.id = p_activity and public.owns_class(a.class_id)); $$;

-- ---------------------------------------------------------------
-- 8) تفعيل RLS وسياسات المعلمين
-- ---------------------------------------------------------------
alter table public.classes          enable row level security;
alter table public.students         enable row level security;
alter table public.join_requests    enable row level security;
alter table public.learning_refs    enable row level security;
alter table public.questions        enable row level security;
alter table public.activities       enable row level security;
alter table public.attempts         enable row level security;
alter table public.attempt_answers  enable row level security;
alter table public.audit_log        enable row level security;
alter table public.rate_limits      enable row level security;   -- بلا سياسات = خدمة فقط
alter table public.recording_tasks  enable row level security;
alter table public.recordings       enable row level security;

-- جداول فيها teacher_id مباشرة: المعلم يرى ويعدّل صفوفه فقط، والمالك كل شيء.
do $$
declare t text;
begin
  foreach t in array array['classes','learning_refs','questions']
  loop
    execute format('drop policy if exists staff_all on public.%I', t);
    execute format('create policy staff_all on public.%I for all
       using (public.is_owner() or teacher_id = public.my_teacher_id())
       with check (public.is_owner() or teacher_id = public.my_teacher_id())', t);
  end loop;
end $$;

-- جداول مرتبطة بالفصل: تُحكم بملكية الفصل.
do $$
declare t text;
begin
  foreach t in array array['students','join_requests','activities','recording_tasks']
  loop
    execute format('drop policy if exists staff_all on public.%I', t);
    execute format('create policy staff_all on public.%I for all
       using (public.owns_class(class_id)) with check (public.owns_class(class_id))', t);
  end loop;
end $$;

-- المحاولات والإجابات والتسجيلات: قراءة للمعلم صاحب الفصل (الكتابة من الخادم فقط حفاظًا على سلامة الدرجات)
drop policy if exists staff_read on public.attempts;
create policy staff_read on public.attempts for select using (public.owns_activity(activity_id));
drop policy if exists staff_read on public.attempt_answers;
create policy staff_read on public.attempt_answers for select
  using (exists (select 1 from public.attempts at where at.id = attempt_id and public.owns_activity(at.activity_id)));
drop policy if exists staff_read on public.recordings;
create policy staff_read on public.recordings for select
  using (exists (select 1 from public.recording_tasks t where t.id = task_id and public.owns_class(t.class_id)));
drop policy if exists staff_update_rec on public.recordings;
create policy staff_update_rec on public.recordings for update
  using (exists (select 1 from public.recording_tasks t where t.id = task_id and public.owns_class(t.class_id)))
  with check (exists (select 1 from public.recording_tasks t where t.id = task_id and public.owns_class(t.class_id)));
revoke insert, update, delete on public.recordings from authenticated;
grant update (grade, teacher_note, reviewed_at) on public.recordings to authenticated;
revoke insert, update, delete on public.attempts, public.attempt_answers from authenticated;

-- سجل التدقيق: للمالك فقط
drop policy if exists owner_read on public.audit_log;
create policy owner_read on public.audit_log for select using (public.is_owner());

-- أعمدة حساسة في الطلاب لا يعدّلها المتصفح (الهوية والرمز تُدار من الخادم)
revoke insert, update on public.students from authenticated;
grant insert (class_id, full_name, email, avatar, teacher_note, status, blocked_until, archived_at),
      update (class_id, full_name, email, avatar, teacher_note, status, blocked_until, archived_at)
  on public.students to authenticated;
revoke insert, update on public.join_requests from authenticated;   -- القرارات عبر وظيفة الخادم
revoke update (teacher_id) on public.classes, public.learning_refs, public.questions from authenticated;

-- الطالب: قراءة فقط لما يخصه (والتصحيح والكتابة تتم عبر وظائف الخادم)
drop policy if exists student_read_class on public.classes;
create policy student_read_class on public.classes for select
  using (id = public.my_class_id() and archived_at is null);

drop policy if exists student_read_self on public.students;
create policy student_read_self on public.students for select
  using (id = public.my_student_id());

drop policy if exists student_read_activities on public.activities;
create policy student_read_activities on public.activities for select
  using (
    status = 'published' and archived_at is null
    and class_id = public.my_class_id()
    and (student_ids is null or public.my_student_id() = any(student_ids))
  );

drop policy if exists student_read_attempts on public.attempts;
create policy student_read_attempts on public.attempts for select
  using (student_id = public.my_student_id());

drop policy if exists student_read_tasks on public.recording_tasks;
create policy student_read_tasks on public.recording_tasks for select
  using (archived_at is null and class_id = public.my_class_id()
         and (student_ids is null or public.my_student_id() = any(student_ids)));

drop policy if exists student_recordings on public.recordings;
create policy student_recordings on public.recordings for select
  using (student_id = public.my_student_id());

-- ---------------------------------------------------------------
-- 9) لوحات الصدارة (دوال آمنة تحترم إعداد «إخفاء اللوحة»)
-- ---------------------------------------------------------------
create or replace function public.activity_leaderboard(p_activity uuid)
returns table(student_id uuid, full_name text, avatar text, score int, correct_count int,
              total_questions int, total_time_ms bigint, place int, is_me boolean)
language plpgsql stable security definer set search_path = public
as $$
declare v_class uuid; v_show boolean;
begin
  select a.class_id, c.show_leaderboard into v_class, v_show
  from public.activities a join public.classes c on c.id = a.class_id
  where a.id = p_activity;
  if v_class is null then return; end if;
  if not public.owns_class(v_class) then
    if public.my_class_id() is distinct from v_class or not v_show then return; end if;
  end if;
  return query
  with best as (
    select distinct on (at.student_id) at.student_id as sid, at.score as sc, at.correct_count as cc,
           at.total_questions as tq, at.total_time_ms as tt
    from public.attempts at
    where at.activity_id = p_activity and at.status = 'finished'
    order by at.student_id, at.score desc, at.total_time_ms asc)
  select b.sid, s.full_name, s.avatar, b.sc, b.cc, b.tq, b.tt,
         (row_number() over (order by b.sc desc, b.tt asc))::int,
         (b.sid = public.my_student_id())
  from best b join public.students s on s.id = b.sid
  where s.archived_at is null
  order by 8;
end $$;

create or replace function public.class_champions(p_class uuid)
returns table(student_id uuid, full_name text, avatar text, played int, total_activities int,
              accuracy numeric, total_score int, total_time_ms bigint, place int, is_me boolean)
language plpgsql stable security definer set search_path = public
as $$
declare v_show boolean; v_total int;
begin
  select c.show_leaderboard into v_show from public.classes c where c.id = p_class;
  if v_show is null then return; end if;
  if not public.owns_class(p_class) then
    if public.my_class_id() is distinct from p_class or not v_show then return; end if;
  end if;
  select count(*) into v_total from public.activities a
   where a.class_id = p_class and a.status = 'published' and a.archived_at is null;
  return query
  with best as (
    select distinct on (at.student_id, at.activity_id)
           at.student_id as sid, at.score as sc, at.correct_count as cc,
           at.total_questions as tq, at.total_time_ms as tt
    from public.attempts at
    join public.activities a on a.id = at.activity_id
    where a.class_id = p_class and a.archived_at is null and at.status = 'finished'
    order by at.student_id, at.activity_id, at.score desc, at.total_time_ms asc),
  agg as (
    select b.sid, count(*)::int as played,
           case when sum(b.tq) > 0 then round(100.0 * sum(b.cc) / sum(b.tq), 1) else 0 end as acc,
           sum(b.sc)::int as tot, sum(b.tt)::bigint as tm
    from best b group by b.sid)
  select s.id, s.full_name, s.avatar, g.played, v_total, g.acc, g.tot, g.tm,
         (row_number() over (order by g.tot desc, g.acc desc, g.tm asc))::int,
         (s.id = public.my_student_id())
  from agg g join public.students s on s.id = g.sid
  where s.archived_at is null
  order by 9;
end $$;

revoke execute on function public.activity_leaderboard(uuid), public.class_champions(uuid) from public, anon;
grant  execute on function public.activity_leaderboard(uuid), public.class_champions(uuid) to authenticated;

-- ---------------------------------------------------------------
-- 10) التخزين (حاويات خاصة)
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('recordings', 'recordings', false),
  ('avatars', 'avatars', false),
  ('question-images', 'question-images', false)
on conflict (id) do nothing;

drop policy if exists st_owner_all on storage.objects;
create policy st_owner_all on storage.objects for all
  using (bucket_id in ('recordings','avatars','question-images') and public.is_owner())
  with check (bucket_id in ('recordings','avatars','question-images') and public.is_owner());

-- صور الأسئلة: مجلد باسم معرّف المعلم
drop policy if exists st_teacher_qimg on storage.objects;
create policy st_teacher_qimg on storage.objects for all
  using (bucket_id = 'question-images' and (storage.foldername(name))[1] = public.my_teacher_id()::text)
  with check (bucket_id = 'question-images' and (storage.foldername(name))[1] = public.my_teacher_id()::text);

-- التسجيلات: المعلم يستمع فقط لتسجيلات طلاب فصوله
drop policy if exists st_teacher_rec_read on storage.objects;
create policy st_teacher_rec_read on storage.objects for select
  using (bucket_id = 'recordings' and exists (
    select 1 from public.recordings r join public.recording_tasks t on t.id = r.task_id
    where r.storage_path = storage.objects.name and public.owns_class(t.class_id)));

-- الطالب يرفع تسجيله داخل مجلد باسم معرّفه فقط ويقرأ تسجيله فقط
drop policy if exists st_student_rec_insert on storage.objects;
create policy st_student_rec_insert on storage.objects for insert
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = public.my_student_id()::text);
drop policy if exists st_student_rec_read on storage.objects;
create policy st_student_rec_read on storage.objects for select
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = public.my_student_id()::text);
