/* Availability form time conversion (Nov 26, 2026). Run before every deploy: bun test tests */
import { describe, expect, test } from "bun:test";
import { blockToWindow, windowToBlock } from "@/lib/form-time";

describe("form → saved times", () => {
  test("2 AM – 4 AM on Monday's form is Tuesday 2–4 AM (the late end of Monday)", () => {
    expect(windowToBlock({ date: "2026-11-30", start: "02:00", end: "04:00", allDay: false })).toEqual({ start_at: "2026-12-01T02:00:00Z", end_at: "2026-12-01T04:00:00Z" });
  });
  test("6 PM – 2 AM ends the next calendar day", () => {
    expect(windowToBlock({ date: "2026-11-30", start: "18:00", end: "02:00", allDay: false })).toEqual({ start_at: "2026-11-30T18:00:00Z", end_at: "2026-12-01T02:00:00Z" });
  });
  test("10 AM – 6 PM stays on the day", () => {
    expect(windowToBlock({ date: "2026-11-30", start: "10:00", end: "18:00", allDay: false })).toEqual({ start_at: "2026-11-30T10:00:00Z", end_at: "2026-11-30T18:00:00Z" });
  });
  test("unavailable all day = 6 AM → 4 AM", () => {
    expect(windowToBlock({ date: "2026-11-30", start: "06:00", end: "04:00", allDay: true })).toEqual({ start_at: "2026-11-30T06:00:00Z", end_at: "2026-12-01T04:00:00Z" });
  });
  test("all day on a long Black Friday day = 6 AM → 6 AM", () => {
    expect(windowToBlock({ date: "2026-11-28", start: "06:00", end: "06:00", allDay: true })).toEqual({ start_at: "2026-11-28T06:00:00Z", end_at: "2026-11-29T06:00:00Z" });
  });
  test("long day: 5 AM – 6 AM is the next morning", () => {
    expect(windowToBlock({ date: "2026-11-28", start: "05:00", end: "06:00", allDay: false })).toEqual({ start_at: "2026-11-29T05:00:00Z", end_at: "2026-11-29T06:00:00Z" });
  });
  test("Sunday 1 AM – 4 AM goes into Monday (next week's first morning)", () => {
    expect(windowToBlock({ date: "2026-12-06", start: "01:00", end: "04:00", allDay: false })).toEqual({ start_at: "2026-12-07T01:00:00Z", end_at: "2026-12-07T04:00:00Z" });
  });
});

describe("saved times → form (round trip)", () => {
  const windows = [
    { date: "2026-11-30", start: "02:00", end: "04:00", allDay: false },
    { date: "2026-11-30", start: "18:00", end: "02:00", allDay: false },
    { date: "2026-11-30", start: "10:00", end: "18:00", allDay: false },
    { date: "2026-11-30", start: "06:00", end: "04:00", allDay: true },
    { date: "2026-11-28", start: "06:00", end: "06:00", allDay: true },
    { date: "2026-11-28", start: "05:00", end: "06:00", allDay: false },
    { date: "2026-12-06", start: "01:00", end: "04:00", allDay: false },
  ];
  for (const w of windows) {
    test(`${w.date} ${w.start}–${w.end}${w.allDay ? " (all day)" : ""}`, () => expect(blockToWindow(windowToBlock(w))).toEqual(w));
  }
});
