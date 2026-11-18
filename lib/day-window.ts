/*
 * The scheduling day normally runs 6 AM → 4 AM the next morning (Miami time).
 * Some days run longer: for Thanksgiving / Black Friday week (Nov 23–29, 2026)
 * Thursday to Sunday run 6 AM → 6 AM the next morning (24 h; a show that starts
 * after midnight still belongs to the day before). Asked by management Nov 18, 2026.
 */
export const DEFAULT_DAY_END = "04:00";

export const EXTENDED_DAY_END: Record<string, string> = {
  "2026-11-26": "06:00", // Thursday (Thanksgiving)
  "2026-11-27": "06:00", // Friday (Black Friday)
  "2026-11-28": "06:00", // Saturday
  "2026-11-29": "06:00", // Sunday
};

/** End of the scheduling day that starts on `date` ("HH:MM", on the next calendar day). */
export function dayEndTime(date: string) {
  return EXTENDED_DAY_END[date.slice(0, 10)] ?? DEFAULT_DAY_END;
}
