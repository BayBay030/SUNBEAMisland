-- ============================================================
--  SUNBEAMISLAND 島嶼地圖 —— Supabase 建表
--  由 Claude 建立 2026-10-15
--
--  整段貼到 Supabase 後台的 SQL Editor 按 Run 就好。
--  重複執行不會壞（都有 if not exists / drop policy if exists）。
-- ============================================================

-- ------------------------------------------------------------
--  1. 線上位置（誰在島上、站在哪）
-- ------------------------------------------------------------
create table if not exists public.presence (
  id    text primary key,                 -- 訪客代號（瀏覽器產生的）
  ch    text not null,                    -- 角色代號
  name  text not null,
  x     real not null default 0,
  z     real not null default 0,
  ry    real not null default 0,
  at    timestamptz not null default now()
);
create index if not exists presence_at_idx on public.presence (at desc);

-- ------------------------------------------------------------
--  2. 聊天
-- ------------------------------------------------------------
create table if not exists public.chat (
  id      text primary key,
  from_id text not null,
  name    text not null,
  ch      text not null,
  body    text not null check (char_length(body) between 1 and 60),
  at      timestamptz not null default now()
);
create index if not exists chat_at_idx on public.chat (at desc);

-- ------------------------------------------------------------
--  3. 神木的能量球
-- ------------------------------------------------------------
create table if not exists public.energy (
  id      bigserial primary key,
  visitor text not null,
  day     date not null default current_date,
  emotion text not null,
  note    text not null default '' check (char_length(note) <= 60),
  seed    bigint not null,
  at      timestamptz not null default now()
);
create index if not exists energy_day_idx on public.energy (day desc);

-- 同一個人同一天只能投一顆
create unique index if not exists energy_one_per_day on public.energy (visitor, day);

-- ------------------------------------------------------------
--  4. 公佈欄留言
-- ------------------------------------------------------------
create table if not exists public.board (
  id      text primary key,
  visitor text not null,
  day     date not null default current_date,
  name    text not null check (char_length(name) <= 12),
  body    text not null check (char_length(body) between 1 and 120),
  up      int  not null default 0,
  at      timestamptz not null default now()
);
create index if not exists board_at_idx on public.board (at desc);

-- ------------------------------------------------------------
--  5. 收集到的鑽石
-- ------------------------------------------------------------
create table if not exists public.gems (
  visitor text primary key,
  amount  int not null default 0 check (amount >= 0),
  at      timestamptz not null default now()
);

-- ============================================================
--  權限規則（Row Level Security）
--
--  重點：給網頁用的那把 anon 金鑰是公開的，任何人打開網頁都看得到。
--  所以規則必須寫死「可以做什麼」，不能靠前端自律。
--
--  這裡的原則：
--    - 大家都可以看（這是公開的島）
--    - 大家都可以新增（留言、投球、報位置）
--    - 位置和鑽石可以更新（因為要一直回報）
--    - 公佈欄只准更新 up 這一個欄位（按愛心），別的改不了
--    - 聊天、能量、留言本文一旦送出就不能改
--    - 誰都不能刪（要刪只能你自己進後台刪）
-- ============================================================

alter table public.presence enable row level security;
alter table public.chat     enable row level security;
alter table public.energy   enable row level security;
alter table public.board    enable row level security;
alter table public.gems     enable row level security;

-- ---- 看：全部開放 ----
drop policy if exists p_read on public.presence;
create policy p_read on public.presence for select using (true);

drop policy if exists c_read on public.chat;
create policy c_read on public.chat for select using (true);

drop policy if exists e_read on public.energy;
create policy e_read on public.energy for select using (true);

drop policy if exists b_read on public.board;
create policy b_read on public.board for select using (true);

drop policy if exists g_read on public.gems;
create policy g_read on public.gems for select using (true);

-- ---- 新增：全部開放（欄位長度已經在上面用 check 擋住）----
drop policy if exists p_ins on public.presence;
create policy p_ins on public.presence for insert with check (true);

drop policy if exists c_ins on public.chat;
create policy c_ins on public.chat for insert with check (true);

drop policy if exists e_ins on public.energy;
create policy e_ins on public.energy for insert with check (true);

drop policy if exists b_ins on public.board;
create policy b_ins on public.board for insert with check (true);

drop policy if exists g_ins on public.gems;
create policy g_ins on public.gems for insert with check (true);

-- ---- 更新：只開放需要一直變的那幾張 ----
drop policy if exists p_upd on public.presence;
create policy p_upd on public.presence for update using (true) with check (true);

drop policy if exists g_upd on public.gems;
create policy g_upd on public.gems for update using (true) with check (true);

drop policy if exists b_upd on public.board;
create policy b_upd on public.board for update using (true) with check (true);

-- 公佈欄：用欄位層級權限，鎖死成「只能動 up」。
-- 這樣就算有人想改別人的留言內容也改不了。
revoke update on public.board from anon;
grant  update (up) on public.board to anon;

-- ---- 刪除：一律不給（沒有建立任何 delete 規則 = 預設擋掉）----

-- ============================================================
--  收尾：清掉太久沒更新的線上位置
--  （Supabase 後台 Database → Cron 可以排程每分鐘跑一次，
--    不排也沒關係，前端本來就會忽略超過 30 秒沒動的人）
-- ============================================================
create or replace function public.prune_presence()
returns void
language sql
security definer
as $$
  delete from public.presence where at < now() - interval '2 minutes';
$$;
