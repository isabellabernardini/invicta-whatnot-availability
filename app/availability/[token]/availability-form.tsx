"use client";

import {
  useMemo,
  useState,
} from "react";

import { supabase } from "@/lib/supabase";

type Group =
  | "girls"
  | "boys";

type Week = {
  id: string;
  week_start: string;
  week_end: string;
};

type Person = {
  id: string;
  name: string;
};

type AvailabilityWindow = {
  date: string;
  start: string;
  end: string;
  allDay: boolean;
};

function formatDay(
  date: string
) {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      weekday:
        "long",
      month:
        "short",
      day:
        "numeric",
      timeZone:
        "UTC",
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
  const result:
    string[] = [];

  const current =
    new Date(
      `${start}T12:00:00Z`
    );

  const endDate =
    new Date(
      `${end}T12:00:00Z`
    );

  while (
    current <=
    endDate
  ) {
    result.push(
      current
        .toISOString()
        .split("T")[0]
    );

    current.setUTCDate(
      current.getUTCDate() +
        1
    );
  }

  return result;
}

function nextDate(
  date: string
) {
  const value =
    new Date(
      `${date}T12:00:00Z`
    );

  value.setUTCDate(
    value.getUTCDate() +
      1
  );

  return value
    .toISOString()
    .split("T")[0];
}

function buildDateTime(
  date: string,
  time: string
) {
  return `${date}T${time}:00Z`;
}

function timeToMinutes(
  time: string
) {
  const [
    hours,
    minutes,
  ] = time
    .split(":")
    .map(Number);

  return (
    hours * 60 +
    minutes
  );
}

function utcDateString(
  value: string
) {
  return new Date(value)
    .toISOString()
    .split("T")[0];
}

function utcTimeString(
  value: string
) {
  const date =
    new Date(value);

  return `${String(
    date.getUTCHours()
  ).padStart(
    2,
    "0"
  )}:${String(
    date.getUTCMinutes()
  ).padStart(
    2,
    "0"
  )}`;
}

export default function AvailabilityForm({
  week,
  people,
  group,
}: {
  week: Week;
  people: Person[];
  group: Group;
}) {
  const [
    personId,
    setPersonId,
  ] = useState("");

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
  ] = useState<
    AvailabilityWindow[]
  >([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    loadingExisting,
    setLoadingExisting,
  ] = useState(false);

  const [
    success,
    setSuccess,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const groupLabel =
    group ===
    "girls"
      ? "Girls"
      : "Boys";

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

    setErrorMessage("");
    setLoadingExisting(
      true
    );

    try {
      const {
        data,
        error,
      } = await supabase
        .from(
          "availability_blocks"
        )
        .select(`
          start_at,
          end_at,
          type
        `)
        .eq(
          "week_id",
          week.id
        )
        .eq(
          "person_id",
          person.id
        )
        .order(
          "start_at"
        );

      if (error) {
        throw error;
      }

      const existingWindows =
        (data ?? []).map(
          (block) => {
            const startDate =
              utcDateString(
                block.start_at
              );

            const start =
              utcTimeString(
                block.start_at
              );

            const end =
              utcTimeString(
                block.end_at
              );

            /*
             * Whole scheduling-day blocks
             * are stored as 06:00 → 03:00
             * the following day.
             */
            const allDay =
              start ===
                "06:00" &&
              end ===
                "03:00";

            return {
              date:
                startDate,

              start,

              end,

              allDay,
            };
          }
        );

      setWindows(
        existingWindows
      );

      setConfirmedPerson(
        person
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not load your previous availability."
      );
    } finally {
      setLoadingExisting(
        false
      );
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
    updates: Partial<AvailabilityWindow>
  ) {
    setWindows(
      (current) =>
        current.map(
          (
            window,
            currentIndex
          ) =>
            currentIndex ===
            index
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
          (
            _,
            currentIndex
          ) =>
            currentIndex !==
            index
        )
    );
  }

  async function submitAvailability() {
    if (
      !confirmedPerson
    ) {
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      /*
       * Replace the person's previous submission
       * for this week.
       */
      const {
        error:
          deleteError,
      } = await supabase
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

      if (
        deleteError
      ) {
        throw deleteError;
      }

      if (
        windows.length >
        0
      ) {
        /*
         * Every unavailable period becomes
         * its own row in availability_blocks.
         *
         * Example:
         *
         * Monday 06:00 → 10:00
         * Monday 18:00 → Tuesday 03:00
         *
         * Both are saved separately.
         */
        const rows =
          windows.map(
            (window) => {
              let start =
                window.start;

              let end =
                window.end;

              let endDate =
                window.date;

              /*
               * One operational scheduling day:
               *
               * 06:00 selected date
               * →
               * 03:00 following date
               */
              if (
                window.allDay
              ) {
                start =
                  "06:00";

                end =
                  "03:00";

                endDate =
                  nextDate(
                    window.date
                  );
              } else {
                const startMinutes =
                  timeToMinutes(
                    start
                  );

                const endMinutes =
                  timeToMinutes(
                    end
                  );

                const crossesMidnight =
                  endMinutes <=
                  startMinutes;

                endDate =
                  crossesMidnight
                    ? nextDate(
                        window.date
                      )
                    : window.date;
              }

              return {
                week_id:
                  week.id,

                person_id:
                  confirmedPerson.id,

                start_at:
                  buildDateTime(
                    window.date,
                    start
                  ),

                end_at:
                  buildDateTime(
                    endDate,
                    end
                  ),

                type:
                  "hard_unavailable",
              };
            }
          );

        const {
          error:
            insertError,
        } = await supabase
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
       * Record submission even if
       * there are zero unavailable periods.
       */
      const {
        error:
          submissionError,
      } = await supabase
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
              new Date().toISOString(),

            updated_at:
              new Date().toISOString(),
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
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not submit availability."
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
      <main className="flex min-h-screen items-center justify-center px-5 py-8">
        <div className="luxury-card w-full max-w-lg p-8 text-center">
          <p className="kicker">
            Availability Submitted
          </p>

          <h1 className="mt-3 text-3xl font-semibold">
            Thank you,{" "}
            {
              confirmedPerson.name
            }
          </h1>

          <p className="muted mt-3">
            Your unavailable
            times have been
            saved.
          </p>

          <p className="muted mt-2 text-xs">
            Any time you did
            not mark as
            unavailable is
            considered available.
          </p>

          <button
            type="button"
            onClick={() =>
              setSuccess(
                false
              )
            }
            className="secondary-button mt-6 rounded-xl px-5 py-2.5 text-sm"
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
      <main className="flex min-h-screen items-center justify-center px-5 py-8">
        <div className="luxury-card w-full max-w-lg p-8">
          <p className="kicker">
            Invicta Whatnot
          </p>

          <h1 className="mt-3 text-3xl font-semibold">
            {groupLabel}{" "}
            Availability
          </h1>

          <p className="muted mt-3 text-sm leading-6">
            Select your name
            and tell us only
            when you cannot
            work this week.
            You will be
            considered available
            at all other times.
          </p>

          <div className="mt-7">
            <label className="mb-2 block text-sm text-[#B7B0A0]">
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
                  event.target
                    .value
                )
              }
              className="w-full rounded-xl border border-[#D4AF37]/20 bg-[#0D0D0D] px-4 py-3 text-[#F5F2E8]"
            >
              <option value="">
                Select your name
              </option>

              {people.map(
                (person) => (
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

          {errorMessage && (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
              {
                errorMessage
              }
            </div>
          )}

          <button
            type="button"
            onClick={
              confirmPerson
            }
            disabled={
              !personId ||
              loadingExisting
            }
            className="gold-button mt-6 w-full rounded-xl px-5 py-3 disabled:opacity-40"
          >
            {loadingExisting
              ? "Loading..."
              : "Continue"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-5 py-8">
      <div className="mx-auto max-w-3xl">
        <div>
          <p className="kicker">
            {groupLabel}{" "}
            Weekly Availability
          </p>

          <h1 className="mt-2 text-3xl font-semibold">
            Hi,{" "}
            {
              confirmedPerson.name
            }
          </h1>

          <p className="muted mt-2">
            Add only the times
            when you cannot
            work.
          </p>

          <p className="muted mt-1 text-sm">
            You can add more than
            one unavailable period
            on the same day. Any
            time between those
            periods is considered
            available.
          </p>

          <button
            type="button"
            onClick={() => {
              setConfirmedPerson(
                null
              );

              setPersonId(
                ""
              );

              setWindows(
                []
              );
            }}
            className="mt-4 text-xs text-[#B7B0A0] hover:text-[#E7C766]"
          >
            ← Change name
          </button>
        </div>

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

              const hasAllDay =
                dayWindows.some(
                  (window) =>
                    window.allDay
                );

              return (
                <div
                  key={
                    date
                  }
                  className="luxury-card p-5"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-lg font-semibold">
                        {
                          formatDay(
                            date
                          )
                        }
                      </p>

                      <p className="muted mt-1 text-xs">
                        {dayWindows.length ===
                        0
                          ? "Available unless marked below"
                          : `${dayWindows.length} unavailable ${
                              dayWindows.length ===
                              1
                                ? "period"
                                : "periods"
                            } added`}
                      </p>
                    </div>

                    {dayWindows.length ===
                      0 && (
                      <button
                        type="button"
                        onClick={() =>
                          addWindow(
                            date
                          )
                        }
                        className="secondary-button w-fit rounded-xl px-4 py-2 text-xs"
                      >
                        + Add unavailable
                        period
                      </button>
                    )}
                  </div>

                  {dayWindows.length ===
                  0 ? (
                    <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.015] px-4 py-3 text-xs text-[#8F897C]">
                      No unavailable
                      times added.
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {dayWindows.map(
                        (
                          window,
                          rowIndex
                        ) => (
                          <div
                            key={
                              window.index
                            }
                            className="rounded-xl border border-white/10 p-4"
                          >
                            <div className="mb-4 flex items-center justify-between gap-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#E7C766]">
                                Unavailable
                                period{" "}
                                {
                                  rowIndex +
                                  1
                                }
                              </p>

                              <button
                                type="button"
                                onClick={() =>
                                  removeWindow(
                                    window.index
                                  )
                                }
                                className="text-xs text-red-300"
                              >
                                Remove
                              </button>
                            </div>

                            <label className="mb-4 flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
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

                              Unavailable
                              for the entire
                              scheduling day
                            </label>

                            {!window.allDay && (
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="mb-1 block text-xs text-[#8F897C]">
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
                                    className="w-full rounded-xl border border-white/10 bg-[#0D0D0D] px-3 py-2"
                                  />
                                </div>

                                <div>
                                  <label className="mb-1 block text-xs text-[#8F897C]">
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
                                    className="w-full rounded-xl border border-white/10 bg-[#0D0D0D] px-3 py-2"
                                  />
                                </div>
                              </div>
                            )}

                            {!window.allDay &&
                              timeToMinutes(
                                window.end
                              ) <=
                                timeToMinutes(
                                  window.start
                                ) && (
                                <p className="muted mt-3 text-xs">
                                  This period
                                  ends after
                                  midnight on
                                  the following
                                  day.
                                </p>
                              )}
                          </div>
                        )
                      )}

                      {!hasAllDay && (
                        <button
                          type="button"
                          onClick={() =>
                            addWindow(
                              date
                            )
                          }
                          className="secondary-button w-full rounded-xl px-4 py-2.5 text-xs"
                        >
                          + Add another
                          unavailable period
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            }
          )}
        </div>

        {errorMessage && (
          <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
            {
              errorMessage
            }
          </div>
        )}

        <button
          type="button"
          onClick={
            submitAvailability
          }
          disabled={
            loading
          }
          className="gold-button mt-6 w-full rounded-xl px-6 py-4 text-sm disabled:opacity-50"
        >
          {loading
            ? "Saving..."
            : windows.length ===
                0
              ? "Submit — Fully Available"
              : "Submit Availability"}
        </button>
      </div>
    </main>
  );
}