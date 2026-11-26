import type { ComponentProps } from "react";
import { supabase } from "@/lib/supabase";
import type AvailabilityForm from "./availability-form";

type Group = "girls" | "boys";

type FormProps = ComponentProps<typeof AvailabilityForm>;

export type AvailabilityPageData = {
  week: FormProps["week"];
  people: FormProps["people"];
  recurring_rules: NonNullable<FormProps["recurringRules"]>;
  shabbat_rules: NonNullable<FormProps["shabbatRules"]>;
  next_week: { week_start: string; week_end: string; availability_token: string } | null;
};

/*
 * Everything the public form needs, from one token-checked database function
 * (availability_page). The publishable key can no longer read the tables
 * directly, so a wrong token gets nothing.
 */
export async function loadAvailabilityPage(token: string, group: Group) {
  const { data, error } = await supabase.rpc("availability_page", { p_token: token, p_group: group });
  if (error) throw new Error(error.message);
  return (data ?? null) as AvailabilityPageData | null;
}
