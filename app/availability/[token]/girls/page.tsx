import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AvailabilityForm from "../availability-form";

export const instant = false;

export default async function GirlsAvailabilityPage({
  params,
}: {
  params: Promise<{
    token: string;
  }>;
}) {
  const { token } =
    await params;

  const {
    data: week,
    error,
  } =
    await supabase
      .from("schedule_weeks")
      .select(`
        id,
        week_start,
        week_end
      `)
      .eq(
        "availability_token",
        token
      )
      .single();

  if (
    error ||
    !week
  ) {
    notFound();
  }

  const [
    peopleResult,
    recurringRulesResult,
  ] =
    await Promise.all([
      supabase
        .from("people")
        .select(`
          id,
          name
        `)
        .eq(
          "gender",
          "female"
        )
        .eq(
          "active",
          true
        )
        .order(
          "name"
        ),

      supabase
        .from(
          "recurring_availability_rules"
        )
        .select(`
          id,
          person_id,
          weekday,
          all_day,
          start_time,
          end_time,
          ends_next_day,
          strength,
          active
        `)
        .eq(
          "active",
          true
        ),
    ]);

  if (
    peopleResult.error
  ) {
    throw new Error(
      peopleResult.error.message
    );
  }

  if (
    recurringRulesResult.error
  ) {
    throw new Error(
      recurringRulesResult
        .error
        .message
    );
  }

  const people =
    peopleResult.data ??
    [];

  const girlIds =
    new Set(
      people.map(
        (person) =>
          person.id
      )
    );

  const recurringRules =
    (
      recurringRulesResult.data ??
      []
    ).filter(
      (rule) =>
        girlIds.has(
          rule.person_id
        )
    );

  return (
    <AvailabilityForm
      week={
        week
      }
      people={
        people
      }
      group="girls"
      recurringRules={
        recurringRules
      }
    />
  );
}