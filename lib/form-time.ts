import { dayEndTime } from "@/lib/day-window";

/*
 * How the weekly form turns a period into saved times and back (Nov 26, 2026).
 * Times are Miami wall-clock digits stored as UTC. The scheduling day starting
 * on `date` runs 6 AM → 4 AM (6 AM → 6 AM on long days): a time before 6 AM is
 * on the NEXT calendar day, for the start as well as the end.
 * Tested in tests/form-time.test.ts.
 */
const FIRST_MINUTE = 6 * 60;

function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const minutesOf = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

export type FormWindow = { date: string; start: string; end: string; allDay: boolean };

/** A period on the form → the stored start_at / end_at. */
export function windowToBlock(w: FormWindow) {
  const start = w.allDay ? "06:00" : w.start;
  const end = w.allDay ? dayEndTime(w.date) : w.end;
  return {
    start_at: `${minutesOf(start) < FIRST_MINUTE ? shiftDate(w.date, 1) : w.date}T${start}:00Z`,
    // "06:00" as an end can only be 6 AM the next morning (end of a long day).
    end_at: `${w.allDay || minutesOf(end) <= FIRST_MINUTE ? shiftDate(w.date, 1) : w.date}T${end}:00Z`,
  };
}

/** A stored block → the period shown on the form (on the scheduling day it belongs to). */
export function blockToWindow(block: { start_at: string; end_at: string }): FormWindow {
  const s = new Date(block.start_at);
  const e = new Date(block.end_at);
  const hm = (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  const startDate = s.toISOString().slice(0, 10);
  const date = s.getUTCHours() < 6 ? shiftDate(startDate, -1) : startDate;
  const start = hm(s);
  const end = hm(e);
  return {
    date,
    start,
    end,
    allDay:
      start === "06:00" &&
      (end === "04:00" || end === "03:00" || end === dayEndTime(date)) &&
      e.toISOString().slice(0, 10) === shiftDate(date, 1),
  };
}
