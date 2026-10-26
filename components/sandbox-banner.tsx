import { resetSandbox } from "@/app/sandbox/actions";

// On every page while the local sandbox runs (bun run sandbox; app/layout.tsx shows it only then), so a
// screen from it is never mistaken for the real app. Reset puts the throwaway database back to its seed.
export function SandboxBanner() {
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-500/40 bg-amber-100 px-4 py-1.5 text-xs text-amber-950 dark:bg-amber-950 dark:text-amber-100">
      <span className="font-medium">Local sandbox: fake Tesla, throwaway data</span>
      <form action={resetSandbox}>
        <button type="submit" className="cursor-pointer rounded-sm underline decoration-dotted underline-offset-4 hover:decoration-solid">
          Reset
        </button>
      </form>
    </div>
  );
}
