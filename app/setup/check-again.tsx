"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { checkAgain } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="lg" disabled={pending}>
      {pending ? "Checking…" : "Check again"}
    </Button>
  );
}

export function CheckAgain() {
  return (
    <form action={checkAgain}>
      <Submit />
    </form>
  );
}
