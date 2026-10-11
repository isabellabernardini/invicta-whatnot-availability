import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AvailabilityForm from "../availability-form";

export const instant = false;

export default async function BoysAvailabilityPage({
  params,
}: {
  params: Promise<{
    token: string;
  }>;
}) {
  const { token } = await params;

  const { data: week, error } =
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

  if (error || !week) {
    notFound();
  }

  const {
    data: people,
    error: peopleError,
  } = await supabase
    .from("people")
    .select(`
      id,
      name
    `)
    .eq("gender", "male")
    .eq("active", true)
    .order("name");

  if (peopleError) {
    throw new Error(
      peopleError.message
    );
  }

  return (
    <AvailabilityForm
      week={week}
      people={people ?? []}
      group="boys"
    />
  );
}