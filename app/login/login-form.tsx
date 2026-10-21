"use client";

import { useSearchParams } from "next/navigation";

export function LoginError() {
  const error = useSearchParams().get("error");
  return error ? <p className="text-sm text-destructive">{error}</p> : null;
}
