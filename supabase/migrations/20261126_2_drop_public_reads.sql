-- Step 2 of 2: stop the public (anon) key from reading whole tables.
-- Apply ONLY AFTER the availability app that uses the step-1 functions is live.
-- Managers keep full access through their existing "managers full access" policies.

drop policy if exists "Allow public read people" on public.people;
drop policy if exists "Allow public read schedule weeks" on public.schedule_weeks;
drop policy if exists "Allow public read availability" on public.availability_blocks;
drop policy if exists "Allow public read availability submissions" on public.availability_submissions;
drop policy if exists "Allow public read vacation requests" on public.vacation_requests;
drop policy if exists "dev read recurring availability rules" on public.recurring_availability_rules;
drop policy if exists "dev read shabbat availability rules" on public.shabbat_availability_rules;

-- Undo (only if something breaks): recreate the old policies, e.g.
--   create policy "Allow public read people" on public.people for select to anon using (true);
