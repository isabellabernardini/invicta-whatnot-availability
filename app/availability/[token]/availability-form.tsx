"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import VacationCalendar, {
  daysOf,
  VACATION_OVERLAP_THRESHOLD,
  type VacationRequest,
} from "./vacation-calendar";

type Group = "girls" | "boys";
type Week = { id: string; week_start: string; week_end: string };
type Person = { id: string; name: string };
type AvailabilityWindow = {
  date: string;
  start: string;
  end: string;
  allDay: boolean;
};

type RecurringAvailabilityRule = {
  id: string;
  person_id: string;
  weekday: number;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  ends_next_day: boolean;
  strength: "hard" | "soft";
  active: boolean;
};


type ShabbatMode =
  | "full_shabbat"
  | "friday_night_hard"
  | "friday_night_soft";

type ShabbatAvailabilityRule = {
  id: string;
  person_id: string;
  mode: ShabbatMode;
  active: boolean;
};

type ShabbatTimes = {
  candleLighting: string;
  havdalah: string;
};

const FIRST_MINUTE = 6 * 60;
const LAST_MINUTE = 27 * 60; // 3 AM the following calendar day
const STEP = 30;

function formatDay(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "short", day: "numeric", timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function weekdayForDate(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function formatClock(value: string) {
  const [hourText, minuteText] = value.slice(0, 5).split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

function dateRange(start: string, end: string) {
  const result: string[] = [];
  const current = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (current <= last) {
    result.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return result;
}

function nextDate(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function minutesOf(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function operationalMinutes(time: string) {
  const minutes = minutesOf(time);
  return minutes < FIRST_MINUTE ? minutes + 1440 : minutes;
}

function timeValue(minutes: number) {
  const wrapped = minutes % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

function timeLabel(time: string) {
  const [h, m] = time.split(":").map(Number);
  const hour = h % 12 || 12;
  return `${hour}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}${h < 6 ? " · next day" : ""}`;
}

const ALL_OPTIONS = Array.from(
  { length: Math.floor((LAST_MINUTE - FIRST_MINUTE) / STEP) + 1 },
  (_, index) => timeValue(FIRST_MINUTE + index * STEP)
);

function timeOptions(current: string, isEnd: boolean) {
  const base = ALL_OPTIONS.filter((_, index) => isEnd || index < ALL_OPTIONS.length - 1);
  // Preserve a previously saved off-grid time instead of silently changing it.
  if (!base.includes(current)) {
    return [...base, current].sort((a, b) => operationalMinutes(a) - operationalMinutes(b));
  }
  return base;
}

function dateTime(date: string, time: string, followingDay: boolean) {
  return `${followingDay ? nextDate(date) : date}T${time}:00Z`;
}

const card = "rounded-2xl border border-[#353535] bg-[#171717] shadow-[0_12px_36px_rgba(0,0,0,0.22)]";
const selectClass = "w-full min-w-0 rounded-xl border border-[#494949] bg-[#252525] px-3 py-3 text-sm text-white outline-none transition focus:border-[#F4C542] focus:ring-2 focus:ring-[#F4C542]/20";
const yellowButton = "rounded-xl bg-[#F4C542] px-5 py-3 font-semibold text-[#111111] transition hover:bg-[#FFDA65] disabled:cursor-not-allowed disabled:opacity-40";
const outlineButton = "rounded-xl border border-[#6A592A] bg-[#2A2518] px-4 py-2.5 text-sm font-semibold text-[#F4C542] transition hover:border-[#F4C542] hover:bg-[#37301F]";

export default function AvailabilityForm({ week, people, group, recurringRules = [], shabbatRules = [] }: {
  week: Week;
  people: Person[];
  group: Group;
  recurringRules?: RecurringAvailabilityRule[];
  shabbatRules?: ShabbatAvailabilityRule[];
}) {
  const [personId, setPersonId] = useState("");
  const [confirmedPerson, setConfirmedPerson] = useState<Person | null>(null);
  const [windows, setWindows] = useState<AvailabilityWindow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notes, setNotes] = useState("");
  const [shabbatTimes, setShabbatTimes] =
    useState<ShabbatTimes | null>(null);
  // Vacation requests (girls): all active requests that end today or later,
  // or that touch this week.
  const [vacations, setVacations] = useState<VacationRequest[]>([]);
  const [showVacationCalendar, setShowVacationCalendar] = useState(false);
  const [crowdedDays, setCrowdedDays] = useState<{ date: string; count: number }[]>([]);
  const days = useMemo(() => dateRange(week.week_start, week.week_end), [week.week_start, week.week_end]);

  const friday = useMemo(
  () =>
    days.find(
      (date) =>
        weekdayForDate(date) === 5
    ) ?? null,
  [days]
);

useEffect(() => {
  if (
    !friday ||
    shabbatRules.length === 0
  ) {
    setShabbatTimes(null);
    return;
  }

  let cancelled = false;

  fetch(
    `/api/shabbat-time?date=${friday}`
  )
    .then(async (response) => {
      const data =
        await response.json();

      if (
        !response.ok ||
        !data?.ok ||
        !data?.candleLighting ||
        !data?.havdalah
      ) {
        throw new Error(
          data?.error ||
            "Could not load Shabbat times."
        );
      }

      if (!cancelled) {
        setShabbatTimes({
          candleLighting:
            data.candleLighting,
          havdalah:
            data.havdalah,
        });
      }
    })
    .catch((error) => {
      console.error(
        "Could not load Shabbat times:",
        error
      );

      if (!cancelled) {
        setShabbatTimes(null);
      }
    });

  return () => {
    cancelled = true;
  };
}, [
  friday,
  group,
  shabbatRules.length,
]);

  function recurringRulesForDay(personId: string, date: string) {
    const weekday = weekdayForDate(date);
    return recurringRules.filter((rule) =>
      rule.active &&
      rule.person_id === personId &&
      rule.weekday === weekday
    );
  }

  function recurringRuleLabel(rule: RecurringAvailabilityRule) {
    if (rule.all_day) return "6:00 AM – 3:00 AM next day";
    if (!rule.start_time || !rule.end_time) return "Standing unavailable period";

    const startHour = Number(rule.start_time.slice(0, 2));
    const endHour = Number(rule.end_time.slice(0, 2));
    const nextDay = rule.ends_next_day || endHour < 6 || endHour < startHour;

    return `${formatClock(rule.start_time)} – ${formatClock(rule.end_time)}${nextDay ? " next day" : ""}`;
  }

  const groupLabel = group === "girls" ? "Girls" : "Boys";
  const panel = "min-h-screen bg-[#090909] px-4 py-8 text-white sm:px-6 sm:py-12";

  const peopleIds = useMemo(() => new Set(people.map((p) => p.id)), [people]);

  async function loadVacations(): Promise<VacationRequest[]> {
    if (group !== "girls") return [];
    const today = new Date().toISOString().slice(0, 10);
    const from = today < week.week_start ? today : week.week_start;
    const { data, error } = await supabase
      .from("vacation_requests")
      .select("id,person_id,start_date,end_date,note")
      .is("cancelled_at", null)
      .gte("end_date", from)
      .order("start_date");
    if (error) throw error;
    const rows = ((data ?? []) as VacationRequest[]).filter((r) => peopleIds.has(r.person_id));
    setVacations(rows);
    return rows;
  }

  /** Number of OTHER girls (not `selfId`) off on each day. */
  function othersOffByDay(rows: VacationRequest[], selfId: string) {
    const byDay = new Map<string, Set<string>>();
    for (const r of rows) {
      if (r.person_id === selfId) continue;
      for (const day of daysOf(r)) {
        if (!byDay.has(day)) byDay.set(day, new Set());
        byDay.get(day)!.add(r.person_id);
      }
    }
    return new Map([...byDay].map(([day, set]) => [day, set.size]));
  }

  async function confirmPerson() {
    const person = people.find((p) => p.id === personId);
    if (!person) return;
    setErrorMessage("");
    setLoadingExisting(true);
    try {
      const { data, error } = await supabase
        .from("availability_blocks")
        .select("start_at,end_at,type")
        .eq("week_id", week.id)
        .eq("person_id", person.id)
        // Vacation days are managed by the vacation calendar, not this form.
        .neq("type", "vacation")
        .order("start_at");
      if (error) throw error;
      const existing: AvailabilityWindow[] = (data ?? []).map((block) => {
        const startDate = new Date(block.start_at);
        const endDate = new Date(block.end_at);
        const start = `${String(startDate.getUTCHours()).padStart(2, "0")}:${String(startDate.getUTCMinutes()).padStart(2, "0")}`;
        const end = `${String(endDate.getUTCHours()).padStart(2, "0")}:${String(endDate.getUTCMinutes()).padStart(2, "0")}`;
        return {
          date: startDate.toISOString().slice(0, 10), start, end,
          allDay: start === "06:00" && end === "03:00" &&
            endDate.toISOString().slice(0, 10) === nextDate(startDate.toISOString().slice(0, 10)),
        };
      });
      // Restore existing notes so edits never silently erase preferences.
      const { data: submission, error: preferencesError } = await supabase
        .from("availability_submissions")
        .select("notes")
        .eq("week_id", week.id)
        .eq("person_id", person.id)
        .maybeSingle();
      if (preferencesError) throw preferencesError;
      setNotes(submission?.notes ?? "");
      setWindows(existing);
      // Girls: ask for help on days when 3+ other girls are on vacation.
      if (group === "girls") {
        const rows = await loadVacations();
        const mine = new Set(rows.filter((r) => r.person_id === person.id).flatMap(daysOf));
        const others = othersOffByDay(rows, person.id);
        setCrowdedDays(
          days
            .filter((date) => !mine.has(date) && (others.get(date) ?? 0) >= VACATION_OVERLAP_THRESHOLD)
            .map((date) => ({ date, count: others.get(date) ?? 0 }))
        );
      }
      setConfirmedPerson(person);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Could not load your previous availability.");
    } finally {
      setLoadingExisting(false);
    }
  }

  function shabbatRuleForPerson(
  personId: string
) {
  return (
    shabbatRules.find(
      (rule) =>
        rule.active &&
        rule.person_id === personId
    ) ?? null
  );
}

function formatShabbatClock(
  value: string
) {
  const match =
    value.match(
      /T(\d{2}):(\d{2})/
    );

  if (!match) {
    return value;
  }

  const hour =
    Number(match[1]);

  const minute =
    Number(match[2]);

  const displayHour =
    hour % 12 || 12;

  const suffix =
    hour < 12
      ? "AM"
      : "PM";

  return `${displayHour}:${String(
    minute
  ).padStart(
    2,
    "0"
  )} ${suffix}`;
}

  function addWindow(date: string) {
    setWindows((current) => [...current, { date, start: "09:00", end: "18:00", allDay: false }]);
    setErrorMessage("");
  }

  function updateWindow(index: number, updates: Partial<AvailabilityWindow>) {
    setWindows((current) => current.map((window, i) => i === index ? { ...window, ...updates } : window));
  }

  function removeWindow(index: number) {
    setWindows((current) => current.filter((_, i) => i !== index));
  }

  function setFullDay(date: string, checked: boolean) {
    setWindows((current) => checked
      ? [...current.filter((window) => window.date !== date), { date, start: "06:00", end: "03:00", allDay: true }]
      : current.filter((window) => !(window.date === date && window.allDay)));
  }

  function validateWindows(): string | null {
    for (const date of days) {
      const dayWindows = windows.filter((w) => w.date === date);
      if (dayWindows.some((w) => w.allDay) && dayWindows.length > 1) {
        return `${formatDay(date)}: an entire-day block cannot be combined with other periods.`;
      }
      const spans = dayWindows.map((w) => ({
        start: w.allDay ? FIRST_MINUTE : operationalMinutes(w.start),
        end: w.allDay ? LAST_MINUTE : operationalMinutes(w.end),
      }));
      if (spans.some((s) => s.start < FIRST_MINUTE || s.end > LAST_MINUTE || s.end <= s.start)) {
        return `${formatDay(date)}: choose a valid period between 6 AM and 3 AM (next day), with the end after the start.`;
      }
      spans.sort((a, b) => a.start - b.start);
      for (let i = 1; i < spans.length; i++) {
        if (spans[i].start < spans[i - 1].end) {
          return `${formatDay(date)}: unavailable periods overlap. Please adjust the times.`;
        }
      }
    }
    if (windows.some((w) => !days.includes(w.date))) {
      return "Your saved availability includes a date outside this week. Please contact an administrator.";
    }
    return null;
  }

  async function submitAvailability() {
    if (!confirmedPerson || loading) return;
    const validation = validateWindows();
    if (validation) { setErrorMessage(validation); return; }
    setLoading(true);
    setErrorMessage("");
    try {
      // Preserve the standalone project's existing replacement/upsert behavior.
      const { error: deleteError } = await supabase
        .from("availability_blocks").delete()
        .eq("week_id", week.id).eq("person_id", confirmedPerson.id)
        // Never remove vacation days requested in advance.
        .neq("type", "vacation");
      if (deleteError) throw deleteError;
      if (windows.length) {
        const rows = windows.map((w) => {
          const start = w.allDay ? "06:00" : w.start;
          const end = w.allDay ? "03:00" : w.end;
          return {
            week_id: week.id,
            person_id: confirmedPerson.id,
            start_at: dateTime(w.date, start, false),
            end_at: dateTime(w.date, end, w.allDay || minutesOf(end) < FIRST_MINUTE),
            type: "hard_unavailable",
          };
        });
        const { error: insertError } = await supabase.from("availability_blocks").insert(rows);
        if (insertError) throw insertError;
      }
      const now = new Date().toISOString();
      const { error: submissionError } = await supabase.from("availability_submissions").upsert({
        week_id: week.id,
        person_id: confirmedPerson.id,
        submitted_at: now,
        updated_at: now,
        notes: notes.trim() || null,
        // A modified note must not leave old AI interpretations in place.
        parsed_preferences: null,
        preferences_parsed_at: null,
      }, { onConflict: "week_id,person_id" });
      if (submissionError) throw submissionError;
      // The scheduler's generation flow can parse saved notes later.
      // We intentionally do not call a local AI endpoint here: the public
      // form and scheduler are separate Next.js applications.
      setSuccess(true);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Could not submit availability.");
    } finally {
      setLoading(false);
    }
  }
    const hasRecurringRestrictions =
        confirmedPerson
          ? recurringRules.some(
              (rule) =>
                rule.active &&
                rule.person_id === confirmedPerson.id &&
                days.some(
                  (date) =>
                    weekdayForDate(date) === rule.weekday
                ) &&
                (rule.all_day ||
                  Boolean(rule.start_time && rule.end_time))
            )
          : false;

      const hasShabbatRestrictions =
        confirmedPerson
          ? shabbatRules.some(
              (rule) =>
                rule.active &&
                rule.person_id === confirmedPerson.id &&
                friday !== null
            )
          : false;

      const hasVacationThisWeek =
        confirmedPerson
          ? vacations.some(
              (r) =>
                r.person_id === confirmedPerson.id &&
                daysOf(r).some((d) => days.includes(d))
            )
          : false;

      const isFullyAvailable =
        windows.length === 0 &&
        !hasRecurringRestrictions &&
        !hasShabbatRestrictions &&
        !hasVacationThisWeek;
  const myVacationDays = new Set(
    confirmedPerson
      ? vacations.filter((r) => r.person_id === confirmedPerson.id).flatMap(daysOf)
      : []
  );

  const vacationModals = confirmedPerson && group === "girls" ? (
    <>
      {showVacationCalendar && (
        <VacationCalendar
          personId={confirmedPerson.id}
          requests={vacations.filter((r) => r.person_id === confirmedPerson.id)}
          othersOffByDay={othersOffByDay(vacations, confirmedPerson.id)}
          onClose={() => setShowVacationCalendar(false)}
          onSaved={() => { loadVacations().catch(() => undefined); }}
        />
      )}
      {crowdedDays.length > 0 && !showVacationCalendar && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className={`${card} w-full max-w-md p-6 text-white`}>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#F4C542]">We need your help</p>
            <h2 className="mt-2 text-xl font-semibold">Several girls are on vacation</h2>
            <ul className="mt-4 space-y-2">
              {crowdedDays.map((d) => (
                <li key={d.date} className="rounded-xl border border-orange-400/30 bg-orange-400/10 px-3 py-2 text-sm text-orange-100">
                  <strong>{formatDay(d.date)}:</strong> {d.count} other girls are taking this day off for vacation.
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm leading-6 text-[#C5C5C5]">
              We would really appreciate your availability on {crowdedDays.length === 1 ? "this day" : "these days"} to help us with the scheduling of the lives.
            </p>
            <button type="button" onClick={() => setCrowdedDays([])} className={`${yellowButton} mt-5 w-full`}>OK, got it</button>
          </div>
        </div>
      )}
    </>
  ) : null;

  if (success && confirmedPerson) {
    return <main className={`${panel} flex items-center justify-center`}>
      <div className={`${card} w-full max-w-lg p-8 text-center sm:p-10`}>
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#F4C542] text-2xl font-bold text-black">✓</div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#F4C542]">Availability submitted</p>
        <h1 className="mt-3 text-3xl font-semibold">Thank you, {confirmedPerson.name}!</h1>
        <p className="mt-4 text-sm leading-6 text-[#C4C4C4]">Your unavailable times have been saved. Any time not marked as unavailable is considered available.</p>
        <button type="button" onClick={() => setSuccess(false)} className={`${outlineButton} mt-7`}>Edit submission</button>
      </div>
    </main>;
  }

  if (!confirmedPerson) {
    return <main className={`${panel} flex items-center justify-center`}>
      <div className={`${card} w-full max-w-lg p-7 sm:p-10`}>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#F4C542]">Invicta Whatnot · Team portal</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{groupLabel} Availability</h1>
        <p className="mt-3 text-sm leading-7 text-[#BDBDBD]">Select your name and tell us when you <strong className="text-white">cannot work</strong>. All other times will be considered available.</p>
        <p className="mt-3 rounded-lg border border-[#3B3421] bg-[#252014] px-3 py-3 text-xs text-[#E8D6A2]">Scheduling day: 6 AM to 3 AM the following day.</p>
        <label htmlFor="person" className="mb-2 mt-7 block text-sm font-semibold text-white">Your name</label>
        <select id="person" value={personId} onChange={(e) => setPersonId(e.target.value)} className={selectClass}>
          <option value="">Select your name</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {errorMessage && <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-200">{errorMessage}</p>}
        <button type="button" onClick={confirmPerson} disabled={!personId || loadingExisting} className={`${yellowButton} mt-6 w-full`}>{loadingExisting ? "Loading…" : "Continue →"}</button>
      </div>
    </main>;
  }

  return <main className={panel}>
    {vacationModals}
    <div className="mx-auto max-w-3xl">
      <header className="mb-7">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#F4C542]">Invicta Whatnot · {groupLabel} team</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Hi, {confirmedPerson.name}</h1>
        <p className="mt-3 text-sm leading-6 text-[#C5C5C5]">Mark only the times you <strong className="text-white">cannot work</strong>. You may add several periods on the same day; time between those periods stays available.</p>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#494029] bg-[#282318] px-4 py-3">
          <p className="text-sm text-[#F3DC9F]"><strong>Daily schedule:</strong> 6 AM – 3 AM (next day)</p>
          <button type="button" onClick={() => { setConfirmedPerson(null); setPersonId(""); setWindows([]); setNotes(""); setErrorMessage(""); setCrowdedDays([]); setVacations([]); }} className="text-xs font-semibold text-[#F4C542] hover:underline">← Change name</button>
        </div>
        {group === "girls" && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#353535] bg-[#171717] px-4 py-3">
            <p className="text-sm text-[#C5C5C5]">Planning time away? Request vacation days in advance.</p>
            <button type="button" onClick={() => setShowVacationCalendar(true)} className={outlineButton}>Request vacation days</button>
          </div>
        )}
      </header>
      <div className="space-y-4">
        {days.map((date) => {
          const dayWindows = windows.map((w, index) => ({ ...w, index })).filter((w) => w.date === date);
          const isFullDay = dayWindows.some((w) => w.allDay);
          const dayRecurringRules = confirmedPerson
            ? recurringRulesForDay(confirmedPerson.id, date)
            : [];
          const hasWeeklyOverride = dayWindows.length > 0;
          const shabbatRule =
            confirmedPerson
              ? shabbatRuleForPerson(
                  confirmedPerson.id
                )
              : null;

          const weekday =
            weekdayForDate(date);

          const showFridayShabbat =
            Boolean(
              shabbatRule &&
              shabbatTimes &&
              weekday === 5
            );

          const showSaturdayShabbat =
            Boolean(
              shabbatRule &&
              shabbatTimes &&
              shabbatRule.mode ===
                "full_shabbat" &&
              weekday === 6
            );
          return <section key={date} className={`${card} p-5 sm:p-6`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">{formatDay(date)}</h2>
                <p className="mt-1 text-xs text-[#BDBDBD]">{isFullDay ? "Unavailable all day" : dayWindows.length ? `${dayWindows.length} unavailable ${dayWindows.length === 1 ? "period" : "periods"}` : dayRecurringRules.length ? "Standing recurring unavailability applies" : "Available all day unless you add a period"}</p>
              </div>
              {!isFullDay && <button type="button" onClick={() => addWindow(date)} className={outlineButton}>+ Add unavailable period</button>}
            </div>
            {myVacationDays.has(date) && (
              <div className="mt-4 rounded-xl border border-[#6A592A] bg-[#2A2518] px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#F4C542]">Vacation</p>
                <p className="mt-2 text-sm text-[#E8D6A2]">You requested this day off in advance, so you are unavailable all day. Change it with “Request vacation days”.</p>
              </div>
            )}
            {dayRecurringRules.length > 0 && (
              <div className="mt-4 rounded-xl border border-[#6A592A] bg-[#2A2518] px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#F4C542]">Standing recurring rule</p>
                <div className="mt-2 space-y-1">
                  {dayRecurringRules.map((rule) => (
                    <p key={rule.id} className="text-sm text-[#E8D6A2]">
                      Unavailable {recurringRuleLabel(rule)}
                    </p>
                  ))}
                </div>
                <p className="mt-2 text-xs leading-5 text-[#B9B9B9]">
                  {hasWeeklyOverride
                    ? "The unavailable period(s) entered below replace this standing rule for this scheduling day only."
                    : "This standing rule applies automatically. Add a period below only if you need to replace it for this week."}
                </p>
              </div>
            )}

            {(showFridayShabbat ||
              showSaturdayShabbat) && (
              <div className="mt-4 rounded-xl border border-[#6A592A] bg-[#2A2518] px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#F4C542]">
                  Shabbat restriction
                </p>

                {showFridayShabbat && (
                  <p className="mt-2 text-sm text-[#E8D6A2]">
                    Unavailable from candle lighting (
                    {formatShabbatClock(
                      shabbatTimes!.candleLighting
                    )}
                    ) until 3:00 AM next day
                    {shabbatRule?.mode ===
                    "friday_night_soft"
                      ? " (soft)"
                      : ""}
                    .
                  </p>
                )}

                {showSaturdayShabbat && (
                  <p className="mt-2 text-sm text-[#E8D6A2]">
                    Unavailable from 6:00 AM until Havdalah (
                    {formatShabbatClock(
                      shabbatTimes!.havdalah
                    )}
                    ).
                  </p>
                )}
              </div>
            )}
            <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-xl border border-[#414141] bg-[#222222] p-3 text-sm text-white">
              <input type="checkbox" className="h-4 w-4 accent-[#F4C542]" checked={isFullDay} onChange={(e) => setFullDay(date, e.target.checked)} />
              Unavailable the entire day <span className="text-xs text-[#B9B9B9]">(6 AM – 3 AM)</span>
            </label>
            {!isFullDay && dayWindows.length === 0 && <p className="mt-4 rounded-xl border border-dashed border-[#393939] bg-[#1D1D1D] px-4 py-4 text-sm text-[#B4B4B4]">{dayRecurringRules.length ? "No weekly override added. Your standing recurring rule remains active." : "No unavailable periods added. You're available for this scheduling day."}</p>}
            {!isFullDay && dayWindows.length > 0 && <div className="mt-4 space-y-3">
              {dayWindows.map((w, i) => <div key={w.index} className="rounded-xl border border-[#434343] bg-[#202020] p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#F4C542]">Unavailable period {i + 1}</p>
                  <button type="button" className="text-xs font-semibold text-[#FFA3A3] hover:underline" onClick={() => removeWindow(w.index)}>Remove</button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div><label htmlFor={`from-${w.index}`} className="mb-1.5 block text-xs font-semibold text-[#DADADA]">From</label>
                    <select id={`from-${w.index}`} className={selectClass} value={w.start} onChange={(e) => updateWindow(w.index, { start: e.target.value })}>
                      {timeOptions(w.start, false).map((time) => <option key={time} value={time}>{timeLabel(time)}</option>)}
                    </select>
                  </div>
                  <div><label htmlFor={`until-${w.index}`} className="mb-1.5 block text-xs font-semibold text-[#DADADA]">Until</label>
                    <select id={`until-${w.index}`} className={selectClass} value={w.end} onChange={(e) => updateWindow(w.index, { end: e.target.value })}>
                      {timeOptions(w.end, true).map((time) => <option key={time} value={time}>{timeLabel(time)}</option>)}
                    </select>
                  </div>
                </div>
                {operationalMinutes(w.end) <= operationalMinutes(w.start) && <p className="mt-3 text-xs text-[#FFB3B3]">End time must be after start time.</p>}
              </div>)}
            </div>}
          </section>;
        })}
      </div>
      <section className={`${card} mt-6 p-5 sm:p-6`}>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#F4C542]">AI preferences & notes</p>
        <h2 className="mt-2 text-xl font-semibold text-white">Any scheduling preferences?</h2>
        <p className="mt-2 text-sm leading-6 text-[#C5C5C5]">
          Optional. Tell us your preferences in your own words. The scheduling system
          can interpret them when preparing the weekly schedule. For times you
          absolutely cannot work, please use the unavailable periods above.
        </p>
        <label htmlFor="weekly-notes" className="mt-5 mb-2 block text-sm font-semibold text-white">
          Your notes or preferences
        </label>
        <textarea
          id="weekly-notes"
          rows={5}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder={"For example:\n• No more than 3 shifts starting at 6 AM.\n• I prefer afternoons this week.\n• Please avoid Friday night if possible."}
          className="w-full resize-y rounded-xl border border-[#494949] bg-[#252525] px-4 py-3 text-sm leading-6 text-white placeholder:text-[#929292] outline-none transition focus:border-[#F4C542] focus:ring-2 focus:ring-[#F4C542]/20"
        />
        <p className="mt-2 text-xs leading-5 text-[#AFAFAF]">
          Notes are saved with your weekly submission and can be interpreted by AI in the scheduler.
        </p>
      </section>
      {errorMessage && <p role="alert" className="mt-6 rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200">{errorMessage}</p>}
      <div className="mt-6 rounded-2xl border border-[#353535] bg-[#171717] p-5">
        <p className="mb-4 text-xs leading-6 text-[#BDBDBD]">You can submit with no unavailable periods if you are fully available. Submitting again will replace your previous availability for this week.</p>
        <button type="button" disabled={loading} onClick={submitAvailability} className={`${yellowButton} w-full py-4`}>{loading ? "Saving…" : isFullyAvailable ? "Submit — Fully Available" : "Submit Availability"}</button>
      </div>
    </div>
  </main>;
}
