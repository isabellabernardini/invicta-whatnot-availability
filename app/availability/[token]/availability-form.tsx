"use client";

import {
  useMemo,
  useState,
} from "react";

import { supabase } from "@/lib/supabase";

type Week = {
  id: string;
  week_start: string;
  week_end: string;
};

type Person = {
  id: string;
  name: string;
};

type Live = {
  id: string;
  live_date: string;
  start_at: string;
  end_at: string;
};

type AvailabilityWindow = {
  date: string;
  start: string;
  end: string;
  allDay: boolean;
};

type RecurringAvailabilityRule = {
  id: string;
  person_id: string;
  weekday: number;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  ends_next_day: boolean;
  strength: "hard" | "soft";
  label: string | null;
  active: boolean;
};

type ShabbatMode =
  | "full_shabbat"
  | "friday_night_hard"
  | "friday_night_soft";

type ShabbatAvailabilityRule = {
  id: string;
  person_id: string;
  mode: ShabbatMode;
  active: boolean;
};

type PermanentBlock = {
  id: string;
  ruleId: string;
  source:
    | "recurring"
    | "shabbat";
  label: string;
  startAt: string;
  endAt: string;
  strength: "hard" | "soft";
  overridable: boolean;
};

type ShabbatTimesResponse = {
  ok: boolean;
  error?: string;
  candleLighting?: string;
  havdalah?: string;
};

function formatDay(
  date: string
) {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      weekday: "long",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }
  ).format(
    new Date(
      `${date}T12:00:00Z`
    )
  );
}

function dateRange(
  start: string,
  end: string
) {
  const result: string[] = [];

  const current =
    new Date(
      `${start}T12:00:00Z`
    );

  const endDate =
    new Date(
      `${end}T12:00:00Z`
    );

  while (
    current <= endDate
  ) {
    result.push(
      current
        .toISOString()
        .split("T")[0]
    );

    current.setUTCDate(
      current.getUTCDate() + 1
    );
  }

  return result;
}

function addDays(
  date: string,
  amount: number
) {
  const value =
    new Date(
      `${date}T12:00:00Z`
    );

  value.setUTCDate(
    value.getUTCDate() +
      amount
  );

  return value
    .toISOString()
    .split("T")[0];
}

function weekdayForDate(
  date: string
) {
  return new Date(
    `${date}T12:00:00Z`
  ).getUTCDay();
}

function wallTime(
  value: string
) {
  /*
   * Hebcal returns an ISO datetime
   * with the Hollywood, FL offset.
   *
   * The scheduling app stores local
   * wall-clock times without applying
   * the browser's timezone, so keep
   * YYYY-MM-DDTHH:mm:ss exactly as
   * supplied by Hebcal.
   */
  return value.slice(
    0,
    19
  );
}

function operationalStart(
  date: string
) {
  return `${date}T06:00:00`;
}

function operationalEnd(
  date: string
) {
  return `${addDays(
    date,
    1
  )}T03:00:00`;
}

function formatTime(
  dateTime: string
) {
  const time =
    dateTime.slice(
      11,
      16
    );

  const [
    hourText,
    minute,
  ] = time.split(":");

  const hour =
    Number(hourText);

  const suffix =
    hour >= 12
      ? "PM"
      : "AM";

  const displayHour =
    hour % 12 || 12;

  return minute === "00"
    ? `${displayHour}:00 ${suffix}`
    : `${displayHour}:${minute} ${suffix}`;
}

function permanentBlocksForDay(
  blocks: PermanentBlock[],
  date: string
) {
  const dayStart =
    operationalStart(date);

  const dayEnd =
    operationalEnd(date);

  return blocks
    .filter(
      (block) =>
        block.startAt <
          dayEnd &&
        block.endAt >
          dayStart
    )
    .map(
      (block) => ({
        ...block,

        displayStart:
          block.startAt >
          dayStart
            ? block.startAt
            : dayStart,

        displayEnd:
          block.endAt <
          dayEnd
            ? block.endAt
            : dayEnd,
      })
    );
}

function buildRecurringBlocks({
  rules,
  days,
}: {
  rules:
    RecurringAvailabilityRule[];
  days: string[];
}) {
  const blocks:
    PermanentBlock[] = [];

  for (
    const date
    of days
  ) {
    const weekday =
      weekdayForDate(
        date
      );

    const matchingRules =
      rules.filter(
        (rule) =>
          rule.active &&
          rule.weekday ===
            weekday
      );

    for (
      const rule
      of matchingRules
    ) {
      let startAt: string;
      let endAt: string;

      if (
        rule.all_day
      ) {
        startAt =
          operationalStart(
            date
          );

        endAt =
          operationalEnd(
            date
          );
      } else {
        if (
          !rule.start_time ||
          !rule.end_time
        ) {
          continue;
        }

        startAt =
          `${date}T${rule.start_time.slice(
            0,
            8
          )}`;

        const endDate =
          rule.ends_next_day
            ? addDays(
                date,
                1
              )
            : date;

        endAt =
          `${endDate}T${rule.end_time.slice(
            0,
            8
          )}`;
      }

      blocks.push({
        id:
          `recurring-${rule.id}-${date}`,

        ruleId:
          rule.id,

        source:
          "recurring",

        label:
          rule.label ||
          "Recurring unavailable",

        startAt,
        endAt,

        strength:
          rule.strength,

        overridable:
          false,
      });
    }
  }

  return blocks;
}

function fridayInWeek(
  days: string[]
) {
  return (
    days.find(
      (date) =>
        weekdayForDate(
          date
        ) === 5
    ) ?? null
  );
}

async function loadShabbatBlock({
  rule,
  days,
}: {
  rule:
    ShabbatAvailabilityRule;
  days: string[];
}) {
  const friday =
    fridayInWeek(days);

  if (!friday) {
    return null;
  }

  const response =
    await fetch(
      `/api/shabbat-times?date=${encodeURIComponent(
        friday
      )}`
    );

  const data =
    (await response.json()) as
      ShabbatTimesResponse;

  if (
    !response.ok ||
    !data.ok ||
    !data.candleLighting ||
    !data.havdalah
  ) {
    throw new Error(
      data.error ||
        "Could not load Shabbat times."
    );
  }

  const candleLighting =
    wallTime(
      data.candleLighting
    );

  let endAt: string;
  let strength:
    | "hard"
    | "soft";
  let label: string;
  let overridable =
    false;

  if (
    rule.mode ===
    "full_shabbat"
  ) {
    endAt =
      wallTime(
        data.havdalah
      );

    strength =
      "hard";

    label =
      "Shabbat — recurring unavailable";
  } else {
    endAt =
      `${addDays(
        friday,
        1
      )}T03:00:00`;

    strength =
      rule.mode ===
      "friday_night_soft"
        ? "soft"
        : "hard";

    overridable =
      rule.mode ===
      "friday_night_soft";

    label =
      overridable
        ? "Usually unavailable Friday night"
        : "Friday night — recurring unavailable";
  }

  return {
    id:
      `shabbat-${rule.id}`,

    ruleId:
      rule.id,

    source:
      "shabbat" as const,

    label,

    startAt:
      candleLighting,

    endAt,

    strength,

    overridable,
  };
}

export default function AvailabilityForm({
  week,
  people,
}: {
  week: Week;
  people: Person[];
  lives?: Live[];
  group?: "girls" | "boys";
}) {
  const [
    personId,
    setPersonId,
  ] =
    useState("");

  const [
    confirmedPerson,
    setConfirmedPerson,
  ] =
    useState<Person | null>(
      null
    );

  const [
    windows,
    setWindows,
  ] =
    useState<
      AvailabilityWindow[]
    >([]);

  const [
    permanentBlocks,
    setPermanentBlocks,
  ] =
    useState<
      PermanentBlock[]
    >([]);

  const [
    shabbatRule,
    setShabbatRule,
  ] =
    useState<
      ShabbatAvailabilityRule | null
    >(null);

  const [
    overriddenShabbatRuleIds,
    setOverriddenShabbatRuleIds,
  ] =
    useState<Set<string>>(
      new Set()
    );

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    loadingRules,
    setLoadingRules,
  ] =
    useState(false);

  const [
    rulesError,
    setRulesError,
  ] =
    useState("");

  const [
    success,
    setSuccess,
  ] =
    useState(false);

  const [
    notes,
    setNotes,
  ] =
    useState("");

  const days =
    useMemo(
      () =>
        dateRange(
          week.week_start,
          week.week_end
        ),
      [
        week.week_start,
        week.week_end,
      ]
    );

  async function confirmPerson() {
    const person =
      people.find(
        (item) =>
          item.id ===
          personId
      );

    if (!person) {
      return;
    }

    setConfirmedPerson(
      person
    );

    setWindows([]);
    setPermanentBlocks([]);
    setShabbatRule(null);
    setOverriddenShabbatRuleIds(
      new Set()
    );
    setRulesError("");
    setNotes("");
    setLoadingRules(true);

    try {
      const [
        recurringResult,
        shabbatResult,
        overridesResult,
        existingSubmissionResult,
      ] =
        await Promise.all([
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
              label,
              active
            `)
            .eq(
              "person_id",
              person.id
            )
            .eq(
              "active",
              true
            )
            .order(
              "weekday"
            ),

          supabase
            .from(
              "shabbat_availability_rules"
            )
            .select(`
              id,
              person_id,
              mode,
              active
            `)
            .eq(
              "person_id",
              person.id
            )
            .eq(
              "active",
              true
            )
            .maybeSingle(),

          supabase
            .from(
              "availability_rule_overrides"
            )
            .select(`
              shabbat_rule_id
            `)
            .eq(
              "week_id",
              week.id
            )
            .eq(
              "person_id",
              person.id
            ),

          supabase
            .from(
              "availability_submissions"
            )
            .select(`
              notes
            `)
            .eq(
              "week_id",
              week.id
            )
            .eq(
              "person_id",
              person.id
            )
            .maybeSingle(),
        ]);

      if (
        recurringResult.error
      ) {
        throw recurringResult.error;
      }

      if (
        shabbatResult.error
      ) {
        throw shabbatResult.error;
      }

      if (
        overridesResult.error
      ) {
        throw overridesResult.error;
      }

      if (
        existingSubmissionResult.error
      ) {
        throw existingSubmissionResult.error;
      }

      setNotes(
        existingSubmissionResult.data?.notes ??
          ""
      );

      const recurringRules =
        (
          recurringResult.data ??
          []
        ) as
          RecurringAvailabilityRule[];

      const fixedBlocks =
        buildRecurringBlocks({
          rules:
            recurringRules,
          days,
        });

      const existingOverrides =
        new Set(
          (
            overridesResult.data ??
            []
          ).map(
            (row) =>
              row.shabbat_rule_id as string
          )
        );

      setOverriddenShabbatRuleIds(
        existingOverrides
      );

      const currentShabbatRule =
        shabbatResult.data
          ? (
              shabbatResult.data as
                ShabbatAvailabilityRule
            )
          : null;

      setShabbatRule(
        currentShabbatRule
      );

      if (
        currentShabbatRule
      ) {
        const shabbatBlock =
          await loadShabbatBlock({
            rule:
              currentShabbatRule,
            days,
          });

        const isOverridden =
          currentShabbatRule.mode ===
            "friday_night_soft" &&
          existingOverrides.has(
            currentShabbatRule.id
          );

        setPermanentBlocks(
          shabbatBlock &&
          !isOverridden
            ? [
                ...fixedBlocks,
                shabbatBlock,
              ]
            : fixedBlocks
        );
      } else {
        setPermanentBlocks(
          fixedBlocks
        );
      }
    } catch (error) {
      console.error(
        "LOAD RECURRING AVAILABILITY ERROR",
        error
      );

      setRulesError(
        error instanceof Error
          ? error.message
          : "Could not load recurring availability."
      );
    } finally {
      setLoadingRules(false);
    }
  }

  function addWindow(
    date: string
  ) {
    setWindows(
      (current) => [
        ...current,
        {
          date,
          start:
            "09:00",
          end:
            "18:00",
          allDay:
            false,
        },
      ]
    );
  }

  function updateWindow(
    index: number,
    updates:
      Partial<AvailabilityWindow>
  ) {
    setWindows(
      (current) =>
        current.map(
          (
            window,
            i
          ) =>
            i === index
              ? {
                  ...window,
                  ...updates,
                }
              : window
        )
    );
  }

  function removeWindow(
    index: number
  ) {
    setWindows(
      (current) =>
        current.filter(
          (_, i) =>
            i !== index
        )
    );
  }

  function overrideSoftShabbat(
    block: PermanentBlock
  ) {
    if (
      !block.overridable
    ) {
      return;
    }

    setPermanentBlocks(
      (current) =>
        current.filter(
          (item) =>
            item.id !==
            block.id
        )
    );

    setOverriddenShabbatRuleIds(
      (current) => {
        const next =
          new Set(
            current
          );

        next.add(
          block.ruleId
        );

        return next;
      }
    );
  }

  async function restoreSoftShabbat() {
    if (
      !shabbatRule ||
      shabbatRule.mode !==
        "friday_night_soft"
    ) {
      return;
    }

    setLoadingRules(
      true
    );

    try {
      const block =
        await loadShabbatBlock({
          rule:
            shabbatRule,
          days,
        });

      if (block) {
        setPermanentBlocks(
          (current) => [
            ...current.filter(
              (item) =>
                !(
                  item.source ===
                    "shabbat" &&
                  item.ruleId ===
                    shabbatRule.id
                )
            ),
            block,
          ]
        );
      }

      setOverriddenShabbatRuleIds(
        (current) => {
          const next =
            new Set(
              current
            );

          next.delete(
            shabbatRule.id
          );

          return next;
        }
      );
    } finally {
      setLoadingRules(
        false
      );
    }
  }

  async function submitAvailability() {
    if (
      !confirmedPerson
    ) {
      return;
    }

    setLoading(true);

    try {
      /*
       * Replace only the person's
       * submitted week-specific
       * availability blocks.
       *
       * Recurring rules live in their
       * own tables and are never
       * deleted here.
       */
      const {
        error:
          deleteError,
      } =
        await supabase
          .from(
            "availability_blocks"
          )
          .delete()
          .eq(
            "week_id",
            week.id
          )
          .eq(
            "person_id",
            confirmedPerson.id
          );

      if (deleteError) {
        throw deleteError;
      }

      if (
        windows.length > 0
      ) {
        const rows =
          windows.map(
            (window) => {
              const start =
                window.allDay
                  ? operationalStart(
                      window.date
                    )
                  : `${window.date}T${window.start}:00`;

              const end =
                window.allDay
                  ? operationalEnd(
                      window.date
                    )
                  : `${window.date}T${window.end}:00`;

              return {
                week_id:
                  week.id,

                person_id:
                  confirmedPerson.id,

                start_at:
                  start,

                end_at:
                  end,

                type:
                  "hard_unavailable",
              };
            }
          );

        const {
          error:
            insertError,
        } =
          await supabase
            .from(
              "availability_blocks"
            )
            .insert(
              rows
            );

        if (
          insertError
        ) {
          throw insertError;
        }
      }

      /*
       * Persist the person's weekly
       * exception to any soft Shabbat
       * rule, currently Luna's Friday
       * night rule.
       */
      const {
        error:
          overrideDeleteError,
      } =
        await supabase
          .from(
            "availability_rule_overrides"
          )
          .delete()
          .eq(
            "week_id",
            week.id
          )
          .eq(
            "person_id",
            confirmedPerson.id
          );

      if (
        overrideDeleteError
      ) {
        throw overrideDeleteError;
      }

      if (
        overriddenShabbatRuleIds.size >
        0
      ) {
        const overrideRows =
          Array.from(
            overriddenShabbatRuleIds
          ).map(
            (
              shabbatRuleId
            ) => ({
              week_id:
                week.id,

              person_id:
                confirmedPerson.id,

              shabbat_rule_id:
                shabbatRuleId,

              action:
                "available",
            })
          );

        const {
          error:
            overrideInsertError,
        } =
          await supabase
            .from(
              "availability_rule_overrides"
            )
            .insert(
              overrideRows
            );

        if (
          overrideInsertError
        ) {
          throw overrideInsertError;
        }
      }

      const {
        error:
          submissionError,
      } =
        await supabase
          .from(
            "availability_submissions"
          )
          .upsert(
            {
              week_id:
                week.id,

              person_id:
                confirmedPerson.id,

              submitted_at:
                new Date()
                  .toISOString(),

              updated_at:
                new Date()
                  .toISOString(),

              notes:
                notes.trim() ||
                null,
            },
            {
              onConflict:
                "week_id,person_id",
            }
          );

      if (
        submissionError
      ) {
        throw submissionError;
      }

      setSuccess(true);
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Could not save availability."
      );
    } finally {
      setLoading(false);
    }
  }

  if (
    success &&
    confirmedPerson
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050505] px-6 text-white">
        <div className="w-full max-w-lg rounded-3xl border border-[#E7C766]/30 bg-[#0A0A0A] p-8 text-center shadow-2xl shadow-black/40">
          <p className="kicker">
            Availability Submitted
          </p>

          <h1 className="mt-3 text-3xl font-semibold">
            Thank you,{" "}
            {confirmedPerson.name}
          </h1>

          <p className="mt-3 text-[#D8D8D8]">
            Your additional unavailable
            times have been saved. Your
            recurring unavailable times
            are already included
            automatically.
          </p>

          <button
            onClick={() =>
              setSuccess(
                false
              )
            }
            className="mt-6 rounded-xl border border-[#E7C766]/40 bg-transparent px-5 py-2.5 text-sm font-medium text-[#E7C766] transition hover:bg-[#E7C766]/10"
          >
            Edit submission
          </button>
        </div>
      </main>
    );
  }

  if (
    !confirmedPerson
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050505] px-6 text-white">
        <div className="w-full max-w-lg rounded-3xl border border-[#E7C766]/30 bg-[#080808] p-8 shadow-2xl shadow-black/30">
          <div className="mb-6 inline-flex rounded-full border border-[#E7C766]/30 bg-[#E7C766]/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#E7C766]">
            Invicta Whatnot
          </div>

          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Weekly Availability
          </h1>

          <p className="mt-3 text-sm leading-6 text-[#D8D8D8]">
            Select your name. Your
            recurring unavailable times
            will already be blocked, so
            you only need to add anything
            different for this week.
          </p>

          <div className="mt-7">
            <label className="mb-2 block text-sm font-medium text-white">
              Your name
            </label>

            <select
              value={
                personId
              }
              onChange={(
                event
              ) =>
                setPersonId(
                  event
                    .target
                    .value
                )
              }
              className="w-full rounded-2xl border border-[#E7C766]/35 bg-black px-4 py-3 text-white outline-none focus:border-[#E7C766]"
            >
              <option value="">
                Select your
                name
              </option>

              {people.map(
                (
                  person
                ) => (
                  <option
                    key={
                      person.id
                    }
                    value={
                      person.id
                    }
                  >
                    {
                      person.name
                    }
                  </option>
                )
              )}
            </select>
          </div>

          <button
            onClick={
              confirmPerson
            }
            disabled={
              !personId
            }
            className="mt-6 w-full rounded-2xl bg-[#E7C766] px-5 py-3 font-semibold text-black transition hover:bg-[#F1D77B] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050505] px-5 py-8 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-3xl border border-[#E7C766]/25 bg-gradient-to-br from-[#111111] to-[#080808] p-6 md:p-7">
          <div className="inline-flex rounded-full border border-[#E7C766]/25 bg-[#E7C766]/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#E7C766]">
            Weekly Availability
          </div>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">
            Hi,{" "}
            {
              confirmedPerson.name
            }
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#D8D8D8]">
            Your recurring unavailable times are already blocked for you.
            Add only anything extra that is different for this week.
          </p>
        </div>

        {loadingRules && (
          <div className="mt-6 rounded-2xl border border-[#E7C766]/20 bg-[#0A0A0A] p-5">
            <p className="text-sm text-[#D8D8D8]">
              Loading your recurring
              availability...
            </p>
          </div>
        )}

        {rulesError && (
          <div className="mt-6 rounded-2xl border border-red-400/30 bg-[#120808] p-4">
            <p className="text-sm text-white">
              {rulesError}
            </p>
          </div>
        )}

        {shabbatRule?.mode ===
          "friday_night_soft" &&
          overriddenShabbatRuleIds.has(
            shabbatRule.id
          ) && (
            <div className="mt-6 rounded-2xl border border-[#E7C766]/30 bg-[#E7C766]/[0.06] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#E7C766]">
                    Friday night exception
                  </p>

                  <p className="mt-1 text-xs text-[#D8D8D8]">
                    Your usual Friday-night
                    restriction is removed
                    for this week.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={
                    restoreSoftShabbat
                  }
                  className="rounded-xl border border-[#E7C766]/40 bg-transparent px-4 py-2 text-xs font-medium text-[#E7C766] transition hover:bg-[#E7C766]/10"
                >
                  Restore usual restriction
                </button>
              </div>
            </div>
          )}

        <div className="mt-8 space-y-4">
          {days.map(
            (date) => {
              const dayWindows =
                windows
                  .map(
                    (
                      window,
                      index
                    ) => ({
                      ...window,
                      index,
                    })
                  )
                  .filter(
                    (
                      window
                    ) =>
                      window.date ===
                      date
                  );

              const dayPermanentBlocks =
                permanentBlocksForDay(
                  permanentBlocks,
                  date
                );

              return (
                <div
                  key={
                    date
                  }
                  className="rounded-3xl border border-[#E7C766]/20 bg-[#0A0A0A] p-5 shadow-lg shadow-black/20"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-lg font-semibold text-white">
                        {
                          formatDay(
                            date
                          )
                        }
                      </p>

                      <p className="mt-1 text-xs text-[#D8D8D8]">
                        Available unless
                        blocked below
                      </p>
                    </div>

                    <button
                      onClick={() =>
                        addWindow(
                          date
                        )
                      }
                      className="rounded-xl border border-[#E7C766]/40 bg-transparent px-4 py-2 text-xs font-medium text-[#E7C766] transition hover:bg-[#E7C766]/10"
                    >
                      + Unavailable time
                    </button>
                  </div>

                  {dayPermanentBlocks.length >
                    0 && (
                    <div className="mt-4 space-y-3">
                      {dayPermanentBlocks.map(
                        (
                          block
                        ) => (
                          <div
                            key={`${block.id}-${date}`}
                            className={
                              block.overridable
                                ? "rounded-2xl border border-[#E7C766]/35 bg-[#E7C766]/[0.06] p-4"
                                : "rounded-2xl border border-[#E7C766]/20 bg-black p-4"
                            }
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/10 px-2.5 py-1 text-[11px] font-medium text-[#E7C766]">
                                    {block.overridable
                                      ? "Usual restriction"
                                      : "Recurring unavailable"}
                                  </span>

                                  {block.source ===
                                    "shabbat" && (
                                    <span className="text-[11px] text-[#D8D8D8]">
                                      Automatic Shabbat time
                                    </span>
                                  )}
                                </div>

                                <p className="mt-2 text-sm font-medium">
                                  {
                                    block.label
                                  }
                                </p>

                                <p className="mt-1 text-xs text-[#D8D8D8]">
                                  {formatTime(
                                    block.displayStart
                                  )}{" "}
                                  –{" "}
                                  {formatTime(
                                    block.displayEnd
                                  )}
                                </p>
                              </div>

                              {block.overridable && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    overrideSoftShabbat(
                                      block
                                    )
                                  }
                                  className="rounded-xl border border-[#E7C766]/40 bg-transparent px-4 py-2 text-xs font-medium text-[#E7C766] transition hover:bg-[#E7C766]/10"
                                >
                                  I can work this Friday night
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {dayWindows.length >
                    0 && (
                    <div className="mt-4 space-y-3">
                      {dayWindows.map(
                        (
                          window
                        ) => (
                          <div
                            key={
                              window.index
                            }
                            className="rounded-2xl border border-[#E7C766]/20 bg-black p-4"
                          >
                            <div className="mb-4 flex items-center justify-between gap-4">
                              <label className="flex items-center gap-2 text-sm text-white">
                                <input
                                  type="checkbox"
                                  className="accent-[#E7C766]"
                                  checked={
                                    window.allDay
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    updateWindow(
                                      window.index,
                                      {
                                        allDay:
                                          event
                                            .target
                                            .checked,
                                      }
                                    )
                                  }
                                />

                                Unavailable all
                                operational day
                              </label>

                              <button
                                onClick={() =>
                                  removeWindow(
                                    window.index
                                  )
                                }
                                className="text-xs font-medium text-[#E7C766] hover:text-[#F1D77B]"
                              >
                                Remove
                              </button>
                            </div>

                            {!window.allDay && (
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="mb-1 block text-xs font-medium text-white">
                                    From
                                  </label>

                                  <input
                                    type="time"
                                    value={
                                      window.start
                                    }
                                    onChange={(
                                      event
                                    ) =>
                                      updateWindow(
                                        window.index,
                                        {
                                          start:
                                            event
                                              .target
                                              .value,
                                        }
                                      )
                                    }
                                    className="w-full rounded-xl border border-[#E7C766]/25 bg-black px-3 py-2 text-white outline-none focus:border-[#E7C766]"
                                  />
                                </div>

                                <div>
                                  <label className="mb-1 block text-xs font-medium text-white">
                                    Until
                                  </label>

                                  <input
                                    type="time"
                                    value={
                                      window.end
                                    }
                                    onChange={(
                                      event
                                    ) =>
                                      updateWindow(
                                        window.index,
                                        {
                                          end:
                                            event
                                              .target
                                              .value,
                                        }
                                      )
                                    }
                                    className="w-full rounded-xl border border-[#E7C766]/25 bg-black px-3 py-2 text-white outline-none focus:border-[#E7C766]"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              );
            }
          )}
        </div>

        <section className="mt-8 rounded-3xl border border-[#E7C766]/30 bg-[#0A0A0A] p-5 md:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E7C766] text-sm font-bold text-black">
              AI
            </div>

            <div className="min-w-0 flex-1">
              <p className="font-semibold text-white">
                Weekly notes for the scheduler
              </p>

              <p className="mt-1 text-xs leading-5 text-[#D8D8D8]">
                Optional. Add preferences or exceptions in your own words.
                The scheduling AI will interpret this together with your
                unavailable times.
              </p>
            </div>
          </div>

          <textarea
            value={notes}
            onChange={(event) =>
              setNotes(
                event.target.value
              )
            }
            rows={4}
            placeholder="Example: I can work Friday night this week, but please avoid 6 AM shifts if possible."
            className="mt-4 w-full resize-none rounded-2xl border border-[#E7C766]/35 bg-black px-4 py-3 text-sm text-white outline-none placeholder:text-[#8A8A8A] focus:border-[#E7C766]"
          />

          <p className="mt-2 text-[11px] text-[#D8D8D8]">
            You can leave this blank if there is nothing else to add.
          </p>
        </section>

        <button
          onClick={
            submitAvailability
          }
          disabled={
            loading ||
            loadingRules ||
            Boolean(
              rulesError
            )
          }
          className="mt-6 w-full rounded-2xl bg-[#E7C766] px-6 py-4 text-sm font-semibold text-black transition hover:bg-[#F2D875] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading
            ? "Saving..."
            : "Submit Availability"}
        </button>
      </div>
    </main>
  );
}
