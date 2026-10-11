export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-5">
      <div className="w-full max-w-xl rounded-3xl border border-yellow-500/20 bg-[#0d0d0d] p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-yellow-400">
          Invicta Whatnot
        </p>

        <h1 className="mt-4 text-3xl font-semibold text-white">
          Weekly Availability
        </h1>

        <p className="mt-3 text-sm leading-6 text-neutral-400">
          Please use the availability link sent to you by the team.
        </p>
      </div>
    </main>
  );
}