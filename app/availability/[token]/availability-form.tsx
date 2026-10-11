"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Group = "girls" | "boys";

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

type TimeOption = {
  value: string;
  label: string;
};

function formatDay(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function dateRange(start: string, end: string) {
  const result: string[] = [];

  const current = new Date(
    `${start}T12:00:00Z`
  );

  const endDate = new Date(
    `${end}T12:00:00Z`
  );

  while (current <= endDate) {
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

function nextDate(date: string) {
  const value = new Date(
    `${date}T12:00:00Z`
  );

  value.setUTCDate(
    value.getUTCDate() + 1
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

function timeToMinutes(time: string) {
  const [hours, minutes] =
    time.split(":").map(Number);

  return hours * 60 + minutes;
}

function to12HourLabel(
  hours: number,
  minutes: number
) {
  const suffix =
    hours >= 12 ? "PM" : "AM";

  const displayHour =
    hours % 12 === 0
      ? 12
      : hours % 12;

  return `${displayHour}:${String(
    minutes
  ).padStart(2, "0")} ${suffix}`;
}

/*
 * Operational day:
 *
 * 6:00 AM
 * ↓
 * 11:30 PM
 * ↓
 * 12:00 AM
 * ↓
 * 3:00 AM
 *
 * So Monday availability means:
 * Monday 6:00 AM → Tuesday 3:00 AM.
 */
function buildTimeOptions(): TimeOption[] {
  const result: TimeOption[] = [];

  /*
   * 6:00 AM → 11:30 PM
   */
  for (
    let minutes = 6 * 60;
    minutes <= 23 * 60 + 30;
    minutes += 30
  ) {
    const hours =
      Math.floor(minutes / 60);

    const mins =
      minutes % 60;

    const value =
      `${String(hours).padStart(
        2,
        "0"
      )}:${String(mins).padStart(
        2,
        "0"
      )}`;

    result.push({
      value,
      label: to12HourLabel(
        hours,
        mins
      ),
    });
  }

  /*
   * Midnight → 3:00 AM
   */
  for (
    let minutes = 0;
    minutes <= 3 * 60;
    minutes += 30
  ) {
    const hours =
      Math.floor(minutes / 60);

    const mins =
      minutes % 60;

    const value =
      `${String(hours).padStart(
        2,
        "0"
      )}:${String(mins).padStart(
        2,
        "0"
      )}`;

    result.push({
      value,
      label: to12HourLabel(
        hours,
        mins
      ),
    });
  }

  return result;
}

const TIME_OPTIONS =
  buildTimeOptions();

function operationalPosition(
  time: string
) {
  const minutes =
    timeToMinutes(time);

  /*
   * 6 AM → midnight keeps normal value.
   *
   * Midnight → 3 AM is treated as
   * "next-day" time by adding 24 hours.
   */
  if (
    minutes <
    6 * 60
  ) {
    return (
      minutes +
      24 * 60
    );
  }

  return minutes;
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
  const [personId, setPersonId] =
    useState("");

  const [
    confirmedPerson,
    setConfirmedPerson,
  ] =
    useState<Person | null>(
      null
    );

  const [windows, setWindows] =
    useState<
      AvailabilityWindow[]
    >([]);

  const [loading, setLoading] =
    useState(false);

  const [
    loadingExisting,
    setLoadingExisting,
  ] =
    useState(false);

  const [success, setSuccess] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");

  const groupLabel =
    group === "girls"
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
          item.id === personId
      );

    if (!person) {
      return;
    }

    setErrorMessage("");
    setLoadingExisting(true);

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
        .order("start_at");

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

            const endDate =
              utcDateString(
                block.end_at
              );

            const expectedNextDate =
              nextDate(
                startDate
              );

            const allDay =
              start === "06:00" &&
              end === "03:00" &&
              endDate ===
                expectedNextDate;

            return {
              date: startDate,
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
          start: "09:00",
          end: "18:00",
          allDay: false,
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

  function validateWindows() {
    for (
      const window
      of windows
    ) {
      if (
        window.allDay
      ) {
        continue;
      }

      const start =
        operationalPosition(
          window.start
        );

      const end =
        operationalPosition(
          window.end
        );

      if (
        end <= start
      ) {
        return (
          `${formatDay(
            window.date
          )}: the end time must be after the start time within the 6:00 AM–3:00 AM scheduling day.`
        );
      }
    }

    return null;
  }

  async function submitAvailability() {
    if (
      !confirmedPerson
    ) {
      return;
    }

    const validationError =
      validateWindows();

    if (
      validationError
    ) {
      setErrorMessage(
        validationError
      );

      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      /*
       * Replace previous availability
       * for this person and week.
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
        const rows =
          windows.map(
            (window) => {
              const start =
                window.allDay
                  ? "06:00"
                  : window.start;

              const end =
                window.allDay
                  ? "03:00"
                  : window.end;

              const startPosition =
                operationalPosition(
                  start
                );

              const endPosition =
                operationalPosition(
                  end
                );

              const crossesMidnight =
                endPosition >
                  24 * 60 &&
                startPosition <
                  24 * 60;

              const endDate =
                crossesMidnight
                  ? nextDate(
                      window.date
                    )
                  : window.date;

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
          .insert(rows);

        if (
          insertError
        ) {
          throw insertError;
        }
      }

      /*
       * Record submission even if
       * fully available.
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
      <main className="flex min-h-screen items-center justify-center bg-black px-5 py-8">
        <div className="w-full max-w-lg rounded-3xl border border-yellow-500/20 bg-[#0D0D0D] p-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-yellow-400">
            Availability Submitted
          </p>

          <h1 className="mt-4 text-3xl font-semibold text-white">
            Thank you,{" "}
            {
              confirmedPerson.name
            }
          </h1>

          <p className="mt-3 text-sm leading-6 text-neutral-400">
            Your unavailable
            times have been
            saved.
          </p>

          <p className="mt-2 text-xs text-neutral-500">
            Any time you did
            not mark as unavailable
            is considered available.
          </p>

          <button
            type="button"
            onClick={() =>
              setSuccess(false)
            }
            className="mt-6 rounded-xl border border-white/10 px-5 py-2.5 text-sm text-white"
          >
            Edit submission
          </button>
        </div>
      </main>
    );
  }

  if (!confirmedPerson) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-5 py-8">
        <div className="w-full max-w-lg rounded-3xl border border-yellow-500/20 bg-[#0D0D0D] p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-yellow-400">
            Invicta Whatnot
          </p>

          <h1 className="mt-4 text-3xl font-semibold text-white">
            {groupLabel}{" "}
            Availability
          </h1>

          <p className="mt-3 text-sm leading-6 text-neutral-400">
            Select your name
            and mark only the
            times when you
            cannot work.
          </p>

          <div className="mt-6 rounded-xl border border-yellow-500/15 bg-yellow-500/[0.04] p-4">
            <p className="text-sm font-medium text-yellow-300">
              Each scheduling day runs from 6:00 AM until 3:00 AM the following morning.
            </p>

            <p className="mt-2 text-xs leading-5 text-neutral-400">
              For example, Monday includes Monday evening and the Monday night show ending at 3:00 AM on Tuesday.
            </p>
          </div>

          <div className="mt-7">
            <label className="mb-2 block text-sm text-neutral-300">
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
                  event.target.value
                )
              }
              className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white"
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
            className="mt-6 w-full rounded-xl bg-yellow-400 px-5 py-3 font-semibold text-black disabled:opacity-40"
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
    <main className="min-h-screen bg-black px-4 py-7 text-white">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-yellow-400">
          {groupLabel} Weekly Availability
        </p>

        <h1 className="mt-3 text-3xl font-semibold">
          Hi,{" "}
          {
            confirmedPerson.name
          }
        </h1>

        <p className="mt-2 text-sm leading-6 text-neutral-400">
          Add only the times when you cannot work.
          Any time you leave blank is treated as available.
        </p>

        <div className="mt-4 rounded-xl border border-yellow-500/15 bg-yellow-500/[0.04] p-4">
          <p className="text-sm text-yellow-300">
            Each day: 6:00 AM → 3:00 AM next morning
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setConfirmedPerson(
              null
            );

            setPersonId("");

            setWindows([]);
          }}
          className="mt-4 text-xs text-neutral-400 hover:text-yellow-300"
        >
          ← Change name
        </button>

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

              return (
                <section
                  key={date}
                  className="rounded-2xl border border-white/10 bg-[#0D0D0D] p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold">
                        {
                          formatDay(
                            date
                          )
                        }
                      </h2>

                      <p className="mt-1 text-xs text-neutral-500">
                        6:00 AM → 3:00 AM
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        addWindow(
                          date
                        )
                      }
                      className="rounded-xl border border-white/10 px-3 py-2 text-xs text-yellow-300"
                    >
                      + Unavailable
                    </button>
                  </div>

                  {dayWindows.length ===
                  0 ? (
                    <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-xs text-neutral-500">
                      Fully available
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {dayWindows.map(
                        (
                          window
                        ) => (
                          <div
                            key={
                              window.index
                            }
                            className="rounded-xl border border-white/10 bg-black/40 p-4"
                          >
                            <div className="flex items-center justify-between gap-4">
                              <label className="flex items-center gap-2 text-sm">
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

                                Unavailable entire day
                              </label>

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

                            {!window.allDay && (
                              <div className="mt-4 grid grid-cols-2 gap-3">
                                <div>
                                  <label className="mb-1 block text-xs text-neutral-500">
                                    From
                                  </label>

                                  <select
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
                                    className="w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-white"
                                  >
                                    {TIME_OPTIONS.map(
                                      (
                                        option
                                      ) => (
                                        <option
                                          key={
                                            option.value
                                          }
                                          value={
                                            option.value
                                          }
                                        >
                                          {
                                            option.label
                                          }
                                        </option>
                                      )
                                    )}
                                  </select>
                                </div>

                                <div>
                                  <label className="mb-1 block text-xs text-neutral-500">
                                    Until
                                  </label>

                                  <select
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
                                    className="w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-white"
                                  >
                                    {TIME_OPTIONS.map(
                                      (
                                        option
                                      ) => (
                                        <option
                                          key={
                                            option.value
                                          }
                                          value={
                                            option.value
                                          }
                                        >
                                          {
                                            option.label
                                          }
                                        </option>
                                      )
                                    )}
                                  </select>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  )}
                </section>
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
          className="mt-6 w-full rounded-xl bg-yellow-400 px-6 py-4 font-semibold text-black disabled:opacity-50"
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