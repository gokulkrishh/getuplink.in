"use client";

import { useSearchParams } from "next/navigation";
import { loginErrorMessage } from "@/lib/login-errors";

export function LoginError() {
  const message = loginErrorMessage(useSearchParams().get("error"));
  return message ? <p className="text-sm text-destructive">{message}</p> : null;
}
