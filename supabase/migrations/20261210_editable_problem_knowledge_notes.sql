-- Store each problem's optional learning reminder with the problem record.
-- Run once in the Supabase SQL Editor; existing JavaScript reminders remain a fallback.

begin;

alter table public.problems
  add column if not exists knowledge_note text;

commit;
