import { Loader2 } from "lucide-react";

// A button's text that doesn't change size while it works. The label stays in place, see-through (so the
// button keeps its name), and a spinner that names the state sits over it, so the button and everything around it keep their size. The parent Button needs className="relative".
export function PendingLabel({ pending, label, pendingLabel }: { pending: boolean; label: string; pendingLabel: string }) {
  return (
    <>
      <span className={pending ? "opacity-0" : undefined}>{label}</span>
      {pending && <Loader2 className="absolute size-[1.1em] animate-spin motion-reduce:animate-none" role="img" aria-label={pendingLabel} />}
    </>
  );
}
