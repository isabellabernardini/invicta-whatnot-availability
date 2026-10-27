"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

/*
 * Vacation calendar (girls). A girl picks the days she will be away; the
 * request is saved in vacation_requests and the database automatically
 * marks those days as unavailable in every schedule week.
 */

export type VacationRequest = {
  id: string;
  person_id: string;
  start_date: string;
  end_date: string;
  note: string | null;
};

/** At this many OTHER girls off on the same day, the day is flagged. */
export const VACATION_OVERLAP_THRESHOLD = 3;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, amount: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + amount);
  return isoDate(d);
}

export function daysOf(request: { start_date: string; end_date: string }) {
  const result: string[] = [];
  for (let day = request.start_date; day <= request.end_date; day = addDays(day, 1)) {
    result.push(day);
  }
  return result;
}

function formatDay(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatMonth(year: number, month: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month, 15)));
}

/** Groups single days into contiguous ranges. */
function toRanges(days: string[]) {
  const sorted = [...new Set(days)].sort();
  const ranges: { start_date: string; end_date: string }[] = [];
  for (const day of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && addDays(last.end_date, 1) === day) last.end_date = day;
    else ranges.push({ start_date: day, end_date: day });
  }
  return ranges;
}

export default function VacationCalendar({
  personId,
  pin,
  requests,
  othersOffByDay,
  onClose,
  onSaved,
}: {
  personId: string;
  /** The girl's 4-digit code; checked by the database. */
  pin: string;
  /** This girl's active vacation requests. */
  requests: VacationRequest[];
  /** Number of OTHER girls off on each day. */
  othersOffByDay: Map<string, number>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = isoDate(new Date());
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth());
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const myDays = useMemo(() => new Set(requests.flatMap(daysOf)), [requests]);

  const cells = useMemo(() => {
    const firstOfMonth = new Date(Date.UTC(year, month, 1));
    const start = addDays(isoDate(firstOfMonth), -firstOfMonth.getUTCDay());
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [year, month]);

  function changeMonth(delta: number) {
    const d = new Date(Date.UTC(year, month + delta, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth());
  }

  function toggle(day: string) {
    if (day < today || myDays.has(day)) return;
    setSelected((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day]
    );
  }

  async function save() {
    if (!selected.length || saving) return;
    setSaving(true);
    setError("");
    try {
      const { error: insertError } = await supabase.rpc("request_vacation", {
        p_person: personId,
        p_pin: pin,
        p_ranges: toRanges(selected),
        p_note: note.trim() || null,
      });
      if (insertError) throw insertError;
      setSelected([]);
      setNote("");
      onSaved();
    } catch (e) {
      setError((e as { message?: string } | null)?.message || "Could not save your vacation days.");
    } finally {
      setSaving(false);
    }
  }

  async function cancel(id: string) {
    setError("");
    const { error: updateError } = await supabase.rpc("cancel_vacation", {
      p_person: personId,
      p_pin: pin,
      p_request: id,
    });
    if (updateError) setError(updateError.message);
    else onSaved();
  }

  const crowdedSelected = selected.filter(
    (day) => (othersOffByDay.get(day) ?? 0) >= VACATION_OVERLAP_THRESHOLD
  );
  const upcoming = requests
    .filter((r) => r.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#353535] bg-[#171717] p-6 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#F4C542]">Vacation</p>
            <h2 className="mt-2 text-2xl font-semibold">Request days off</h2>
            <p className="mt-2 text-sm leading-6 text-[#C5C5C5]">
              Tap the days you will be away. They are marked as unavailable
              automatically in the schedule for those weeks.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-xl text-[#BDBDBD] hover:text-white" aria-label="Close">×</button>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button type="button" onClick={() => changeMonth(-1)} className="rounded-lg px-3 py-1 text-[#F4C542] hover:bg-[#2A2518]" aria-label="Previous month">‹</button>
          <p className="font-semibold">{formatMonth(year, month)}</p>
          <button type="button" onClick={() => changeMonth(1)} className="rounded-lg px-3 py-1 text-[#F4C542] hover:bg-[#2A2518]" aria-label="Next month">›</button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] text-[#9A9A9A]">
          {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((day) => {
            const inMonth = Number(day.slice(5, 7)) - 1 === month;
            const past = day < today;
            const mine = myDays.has(day);
            const picked = selected.includes(day);
            const crowded = (othersOffByDay.get(day) ?? 0) >= VACATION_OVERLAP_THRESHOLD;
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggle(day)}
                disabled={past || mine}
                title={crowded ? `${othersOffByDay.get(day)} other girls are already off this day` : undefined}
                className={[
                  "relative h-10 rounded-lg text-sm transition",
                  !inMonth ? "opacity-30" : "",
                  past ? "cursor-not-allowed text-[#555]" : "",
                  mine ? "bg-[#F4C542]/25 text-[#F4C542] font-semibold" : "",
                  picked ? "bg-[#F4C542] text-black font-semibold" : "",
                  !mine && !picked && !past ? "hover:bg-[#2A2518]" : "",
                ].join(" ")}
              >
                {Number(day.slice(8, 10))}
                {crowded && !past && (
                  <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-orange-400" />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-[#AFAFAF]">
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-[#F4C542]" />Selected</span>
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-[#F4C542]/25" />Already requested</span>
          <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-orange-400" /> {VACATION_OVERLAP_THRESHOLD}+ other girls already off</span>
        </div>

        {crowdedSelected.length > 0 && (
          <p className="mt-4 rounded-xl border border-orange-400/30 bg-orange-400/10 p-3 text-xs leading-5 text-orange-100">
            Heads up: {crowdedSelected.map(formatDay).join(", ")}{" "}
            {crowdedSelected.length === 1 ? "already has" : "already have"} {VACATION_OVERLAP_THRESHOLD} or more
            girls off. If you can, please consider other days.
          </p>
        )}

        <label htmlFor="vacation-note" className="mb-2 mt-5 block text-sm font-semibold">Note (optional)</label>
        <input
          id="vacation-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Family trip"
          className="w-full rounded-xl border border-[#494949] bg-[#252525] px-3 py-3 text-sm text-white outline-none focus:border-[#F4C542]"
        />

        {error && <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>}

        <button
          type="button"
          onClick={save}
          disabled={!selected.length || saving}
          className="mt-5 w-full rounded-xl bg-[#F4C542] px-5 py-3 font-semibold text-[#111111] transition hover:bg-[#FFDA65] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving…" : selected.length ? `Request ${selected.length} day${selected.length === 1 ? "" : "s"} off` : "Select days"}
        </button>

        {upcoming.length > 0 && (
          <div className="mt-6 border-t border-[#353535] pt-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#F4C542]">Your upcoming vacation</p>
            <ul className="mt-3 space-y-2">
              {upcoming.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#353535] bg-[#202020] px-3 py-2 text-sm">
                  <span>
                    {r.start_date === r.end_date
                      ? formatDay(r.start_date)
                      : `${formatDay(r.start_date)} – ${formatDay(r.end_date)}`}
                    {r.note ? <span className="text-[#9A9A9A]"> · {r.note}</span> : null}
                  </span>
                  <button type="button" onClick={() => cancel(r.id)} className="text-xs font-semibold text-[#FFA3A3] hover:underline">Cancel</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
