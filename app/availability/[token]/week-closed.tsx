import { connection } from "next/server";
import { supabase } from "@/lib/supabase";

/*
 * A week's availability form closes when that week starts (Monday, Miami
 * time): the schedule is already made. Shows a link to the next open week.
 * The database refuses late submissions too (submit_availability).
 */
export async function weekHasStarted(weekStart: string) {
  await connection();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  return { started: today >= weekStart, today };
}

const fmt = (date: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

export default async function WeekClosed({ weekStart, weekEnd, today, group }: { weekStart: string; weekEnd: string; today: string; group: "girls" | "boys" }) {
  const { data: next } = await supabase
    .from("schedule_weeks")
    .select("week_start, week_end, availability_token")
    .gt("week_start", today)
    .not("availability_token", "is", null)
    .order("week_start")
    .limit(1)
    .maybeSingle();
  return (
    <main className="mx-auto max-w-xl px-6 py-16 text-center">
      <p className="text-xs uppercase tracking-[0.2em] text-[#8F897C]">Invicta Whatnot · Team Portal</p>
      <h1 className="mt-3 text-2xl font-semibold text-[#F5F2E8]">This week has already started</h1>
      <p className="mt-3 text-sm leading-6 text-[#B7B0A0]">
        This link is for the week of {fmt(weekStart)} – {fmt(weekEnd)}, which has already been scheduled, so availability can't be
        changed here. For changes this week, please message your manager.
      </p>
      {next?.availability_token ? (
        <a
          href={`/availability/${next.availability_token}/${group}`}
          className="mt-8 inline-block rounded-xl border border-[#D4AF37]/50 bg-[#D4AF37]/10 px-6 py-3 text-sm font-semibold text-[#E7C766]"
        >
          Enter availability for {fmt(next.week_start)} – {fmt(next.week_end)} →
        </a>
      ) : (
        <p className="mt-8 text-sm text-[#8F897C]">The link for next week isn't ready yet — your manager will send it.</p>
      )}
    </main>
  );
}
