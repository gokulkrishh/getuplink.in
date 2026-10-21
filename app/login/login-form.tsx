"use client";

import { useSearchParams } from "next/navigation";
import { loginErrorMessage } from "@/lib/login-errors";
import { cn } from "@/lib/utils";

export function LoginError({ className }: { className?: string }) {
  const message = loginErrorMessage(useSearchParams().get("error"));
  return message ? <p className={cn("text-sm text-destructive", className)}>{message}</p> : null;
}
