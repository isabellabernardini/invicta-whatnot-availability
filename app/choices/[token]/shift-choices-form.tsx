"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ChoiceLive = {
  id: string;
  display_name: string;
  live_date: string;
  start_at: string;
  end_at: string;
  channel_code: string;
  channel_name: string;
};

export type ChoicePageData = {
  week: { id: string; week_start: string; week_end: string };
  people: { id: string; name: string }[];
  lives: ChoiceLive[];
};

// Show times are stored as Miami wall-clock digits, so format them in UTC.
const clock = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(iso));
const dayLabel = (date: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`));
const shortDay = (date: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`));
const hours = (l: ChoiceLive) => (Date.parse(l.end_at) - Date.parse(l.start_at)) / 3600000;
const overlaps = (a: ChoiceLive, b: ChoiceLive) =>
  Date.parse(a.start_at) < Date.parse(b.end_at) && Date.parse(b.start_at) < Date.parse(a.end_at);

const card = "rounded-2xl border border-[#353535] bg-[#171717] p-5 sm:p-6";
const input = "w-full rounded-xl border border-[#494949] bg-[#252525] px-3 py-3 text-white outline-none focus:border-[#F4C542]";
const goldButton = "rounded-xl bg-[#F4C542] px-5 py-3 font-semibold text-[#111111] transition hover:bg-[#FFDA65] disabled:cursor-not-allowed disabled:opacity-40";

export default function ShiftChoicesForm({ token, data }: { token: string; data: ChoicePageData }) {
  const { week, people, lives } = data;
  const [personId, setPersonId] = useState("");
  const [pin, setPin] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const person = people.find((p) => p.id === personId) ?? null;

  const days = useMemo(() => {
    const map = new Map<string, ChoiceLive[]>();
    for (const l of lives) {
      if (!map.has(l.live_date)) map.set(l.live_date, []);
      map.get(l.live_date)!.push(l);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [lives]);

  const chosen = lives.filter((l) => selected.has(l.id));
  const totalHours = chosen.reduce((n, l) => n + hours(l), 0);

  async function confirmPerson() {
    if (!person || pin.length !== 4 || busy) return;
    setBusy(true);
    setError("");
    try {
      const { data: status, error: pinError } = await supabase
        .rpc("check_person_pin", { p_person: person.id, p_pin: pin });
      if (pinError) throw pinError;
      if (status === "locked") return setError("Too many wrong codes. Please wait 15 minutes and try again.");
      if (status === "no_pin") return setError("You don't have a code yet. Please ask your manager for your 4-digit code.");
      if (status !== "ok") return setError("Wrong code. Please check your 4-digit code.");
      const { data: mine, error: loadError } = await supabase
        .rpc("my_shift_choices", { p_token: token, p_person: person.id, p_pin: pin });
      if (loadError) throw loadError;
      setSelected(new Set((mine?.lives ?? []) as string[]));
      setSubmittedAt(mine?.submitted_at ?? null);
      setConfirmed(true);
    } catch (e) {
      setError((e as { message?: string } | null)?.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function toggle(live: ChoiceLive) {
    setSaved(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(live.id)) next.delete(live.id);
      else next.add(live.id);
      return next;
    });
  }

  async function submit() {
    if (!person || busy) return;
    setBusy(true);
    setError("");
    try {
      const { error: saveError } = await supabase.rpc("submit_shift_choices", {
        p_token: token,
        p_person: person.id,
        p_pin: pin,
        p_lives: [...selected],
      });
      if (saveError) throw saveError;
      setSubmittedAt(new Date().toISOString());
      setSaved(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as { message?: string } | null)?.message || "Could not save your shows.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#090909] px-4 py-8 text-white sm:px-6 sm:py-12">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#F4C542]">Invicta · Choose your shows</p>
          <h1 className="mt-2 text-3xl font-semibold">Week of {shortDay(week.week_start)} – {shortDay(week.week_end)}</h1>
          <p className="mt-2 text-sm leading-6 text-[#C5C5C5]">
            Tick every show you want to work this week. You will be scheduled on exactly
            these shows and nothing else.
          </p>
        </header>

        {!confirmed ? (
          <section className={card}>
            <label htmlFor="person" className="mb-2 block text-sm font-semibold">Your name</label>
            <select id="person" value={personId} onChange={(e) => { setPersonId(e.target.value); setError(""); }} className={input}>
              <option value="">Select your name</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {person && (
              <>
                <label htmlFor="pin" className="mb-2 mt-5 block text-sm font-semibold">Your 4-digit code</label>
                <input
                  id="pin" type="password" inputMode="numeric" autoComplete="off" maxLength={4}
                  value={pin}
                  onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmPerson(); }}
                  className={`${input} tracking-[0.5em]`} placeholder="••••"
                />
              </>
            )}
            {error && <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>}
            <button type="button" onClick={confirmPerson} disabled={!person || pin.length !== 4 || busy} className={`${goldButton} mt-5 w-full`}>
              {busy ? "Checking…" : "Continue"}
            </button>
          </section>
        ) : (
          <>
            <section className={`${card} flex flex-wrap items-center justify-between gap-3`}>
              <div>
                <p className="text-lg font-semibold">{person?.name}</p>
                <p className="mt-1 text-sm text-[#BDBDBD]">
                  {chosen.length} show{chosen.length === 1 ? "" : "s"} · {totalHours % 1 ? totalHours.toFixed(1) : totalHours} hours
                </p>
              </div>
              {submittedAt ? (
                <span className="rounded-full border border-[#F4C542]/30 bg-[#F4C542]/10 px-3 py-1 text-xs text-[#F4C542]">
                  {saved ? "Saved ✓" : "Already submitted – you can still change it"}
                </span>
              ) : (
                <span className="rounded-full border border-[#494949] px-3 py-1 text-xs text-[#BDBDBD]">Not submitted yet</span>
              )}
            </section>

            {saved && (
              <p className="rounded-xl border border-[#F4C542]/30 bg-[#F4C542]/10 p-4 text-sm text-[#F4E3A8]">
                Thank you! Your shows are saved. You can come back to this link and change them
                until the schedule is made.
              </p>
            )}

            {lives.length === 0 && (
              <p className={`${card} text-sm text-[#BDBDBD]`}>No shows have been added for this week yet.</p>
            )}

            {days.map(([date, dayLives]) => (
              <section key={date} className={card}>
                <h2 className="text-lg font-semibold">{dayLabel(date)}</h2>
                <div className="mt-4 space-y-2">
                  {dayLives.map((live) => {
                    const on = selected.has(live.id);
                    const clash = !on && chosen.find((c) => overlaps(c, live));
                    return (
                      <button
                        key={live.id}
                        type="button"
                        onClick={() => !clash && toggle(live)}
                        disabled={Boolean(clash)}
                        className={[
                          "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition",
                          on ? "border-[#F4C542] bg-[#F4C542]/15" : "border-[#393939] bg-[#1F1F1F] hover:border-[#5A5A5A]",
                          clash ? "cursor-not-allowed opacity-40" : "",
                        ].join(" ")}
                      >
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-bold ${on ? "border-[#F4C542] bg-[#F4C542] text-black" : "border-[#6A6A6A]"}`}>
                          {on ? "✓" : ""}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">{live.display_name || live.channel_name}</span>
                          <span className="block text-xs text-[#BDBDBD]">
                            {clock(live.start_at)} – {clock(live.end_at)} · {live.channel_name}
                            {clash ? " · overlaps a show you picked" : ""}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}

            {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>}

            <button type="button" onClick={submit} disabled={busy || lives.length === 0} className={`${goldButton} w-full`}>
              {busy ? "Saving…" : chosen.length ? `Submit my ${chosen.length} show${chosen.length === 1 ? "" : "s"}` : "Submit – I won't work this week"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
