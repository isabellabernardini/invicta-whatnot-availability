-- Step 1 of 2: token- and PIN-checked read functions for the public availability form.
-- Additive only: nothing existing is changed or removed. Apply BEFORE deploying the app change.

-- Week page: valid availability token required. Returns only what the form needs:
-- the week, active people in the group (id + name only), their standing rules, and the next open week's link.
create or replace function public.availability_page(p_token text, p_group text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with w as (
    select id, week_start, week_end from schedule_weeks
     where availability_token = p_token and p_token is not null and length(p_token) >= 8
  ),
  g as (
    select p.id, p.name from people p
     where p.active
       and p.gender = case p_group when 'girls' then 'female' when 'boys' then 'male' end
  )
  select case when not exists (select 1 from w) then null else jsonb_build_object(
    'week', (select to_jsonb(w) from w),
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by g.name) from g), '[]'::jsonb),
    'recurring_rules', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'person_id', r.person_id, 'weekday', r.weekday, 'all_day', r.all_day,
        'start_time', r.start_time, 'end_time', r.end_time, 'ends_next_day', r.ends_next_day,
        'strength', r.strength, 'active', r.active))
      from recurring_availability_rules r where r.active and r.person_id in (select id from g)), '[]'::jsonb),
    'shabbat_rules', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'person_id', s.person_id, 'mode', s.mode, 'active', s.active))
      from shabbat_availability_rules s where s.active and s.person_id in (select id from g)), '[]'::jsonb),
    'next_week', (select jsonb_build_object('week_start', n.week_start, 'week_end', n.week_end, 'availability_token', n.availability_token)
                    from schedule_weeks n
                   where n.week_start > (now() at time zone 'America/New_York')::date
                     and n.availability_token is not null
                   order by n.week_start limit 1)
  ) end;
$$;

-- One person's saved availability for a week: correct PIN required (same 5-tries / 15-minute lockout).
create or replace function public.my_availability(p_person uuid, p_pin text, p_week uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.require_person_pin(p_person, p_pin);
  return jsonb_build_object(
    'blocks', coalesce((select jsonb_agg(jsonb_build_object('start_at', b.start_at, 'end_at', b.end_at, 'type', b.type) order by b.start_at)
                          from availability_blocks b
                         where b.week_id = p_week and b.person_id = p_person and b.type <> 'vacation'), '[]'::jsonb),
    'notes', (select s.notes from availability_submissions s where s.week_id = p_week and s.person_id = p_person)
  );
end;
$$;

-- Vacation requests for the girls' calendar: correct PIN required.
-- The person's own requests come back with notes; other girls' requests only with dates (no notes),
-- which is all the "3+ girls off" warning needs.
create or replace function public.group_vacations(p_person uuid, p_pin text, p_from date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_gender text;
begin
  perform public.require_person_pin(p_person, p_pin);
  select gender into v_gender from people where id = p_person;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', v.id, 'person_id', v.person_id, 'start_date', v.start_date, 'end_date', v.end_date,
             'note', case when v.person_id = p_person then v.note else null end)
           order by v.start_date)
      from vacation_requests v
      join people p on p.id = v.person_id and p.active and p.gender = v_gender
     where v.cancelled_at is null and v.end_date >= p_from), '[]'::jsonb);
end;
$$;

revoke all on function public.availability_page(text, text) from public;
revoke all on function public.my_availability(uuid, text, uuid) from public;
revoke all on function public.group_vacations(uuid, text, date) from public;
grant execute on function public.availability_page(text, text) to anon, authenticated;
grant execute on function public.my_availability(uuid, text, uuid) to anon, authenticated;
grant execute on function public.group_vacations(uuid, text, date) to anon, authenticated;

-- Only managers should create shift-choice links (it was callable by any signed-in user).
create or replace function public.create_shift_choice_token(p_week uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare t text;
begin
  if not public.is_manager() then raise exception 'Only managers can create this link.' using errcode = '42501'; end if;
  select shift_choice_token into t from schedule_weeks where id = p_week;
  if not found then raise exception 'Week not found'; end if;
  if t is null then
    t := translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/=', 'xyz');
    update schedule_weeks set shift_choice_token = t where id = p_week;
  end if;
  return t;
end $function$;
