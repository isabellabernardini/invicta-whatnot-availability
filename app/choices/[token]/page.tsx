import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ShiftChoicesForm, { type ChoicePageData } from "./shift-choices-form";

export const instant = false;

/*
 * Shift choices link (Eric & Liam). They pick exactly the shows they will
 * work this week; the boys schedule then fills the rest around them.
 */
export default async function ShiftChoicesPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { data, error } = await supabase.rpc("shift_choice_page", { p_token: token });
  if (error) throw new Error(error.message);
  if (!data) notFound();
  return <ShiftChoicesForm token={token} data={data as ChoicePageData} />;
}
