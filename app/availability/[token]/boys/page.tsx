import { notFound } from "next/navigation";
import AvailabilityForm from "../availability-form";
import WeekClosed, { weekHasStarted } from "../week-closed";
import { loadAvailabilityPage } from "../load-page";

export const instant = false;

export default async function BoysAvailabilityPage({
  params,
}: {
  params: Promise<{
    token: string;
  }>;
}) {
  const { token } = await params;

  // One token-checked call returns the week, the active boys (id + name),
  // their standing rules and the next week's link.
  const data = await loadAvailabilityPage(token, "boys");
  if (!data?.week) {
    notFound();
  }
  const { week } = data;

  const { started, today } = await weekHasStarted(week.week_start);
  if (started) {
    return <WeekClosed weekStart={week.week_start} weekEnd={week.week_end} today={today} group="boys" next={data.next_week} />;
  }

  return (
    <AvailabilityForm
      week={week}
      people={data.people}
      group="boys"
      recurringRules={data.recurring_rules}
      shabbatRules={data.shabbat_rules}
    />
  );
}
