"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type ChargingRates, MAX_RATE } from "@/lib/charging-rates";
import { saveRates } from "./rate-actions";
import { Row } from "./row";

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="lg" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

function RateInput({ name, label, value, invalid }: { name: string; label: string; value: string; invalid: boolean }) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <span aria-hidden="true">₹</span>
      <Input
        // Remounts on a new saved value, since defaultValue only applies on mount.
        key={value}
        name={name}
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0.01"
        max={MAX_RATE}
        placeholder="Not set"
        defaultValue={value}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? "rates-error" : undefined}
        className="h-9 w-24 text-right font-mono tabular-nums"
      />
      <span aria-hidden="true">/kWh</span>
    </label>
  );
}

// Optional. Stats prices AC and third-party charging with these; Supercharger amounts come from Tesla.
export function ChargingRatesForm({ rates }: { rates: ChargingRates }) {
  const [state, action] = useActionState(saveRates, null);
  const home = state?.home ?? (rates.home === null ? "" : String(rates.home));
  const other = state?.other ?? (rates.other === null ? "" : String(rates.other));
  const invalid = Boolean(state?.error);
  return (
    <form action={action} className="divide-y">
      <Row
        title="Home AC"
        description="Your electricity rate, for AC charging."
        control={<RateInput name="home" label="Home AC rate in ₹ per kWh" value={home} invalid={invalid} />}
      />
      <Row
        title="Other chargers"
        description="For third-party DC chargers."
        control={<RateInput name="other" label="Other chargers rate in ₹ per kWh" value={other} invalid={invalid} />}
      />
      <Row
        title="Charging costs"
        description={
          state?.error ? (
            <p id="rates-error" role="alert" className="text-destructive">
              {state.error}
            </p>
          ) : state?.saved ? (
            <p role="status">Saved.</p>
          ) : (
            <p>Stats shows these costs at your rate. Leave a rate empty to show kWh only.</p>
          )
        }
        control={<Save />}
      />
    </form>
  );
}
