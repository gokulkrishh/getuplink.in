"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LIST_KEY } from "./list-memory";

// The way back from a trip or a charge to its list, in the period the list was last on (see PeriodScope);
// the list's own opening period when it wasn't opened here.
export function BackLink({ list, label }: { list: "/stats/driving" | "/stats/charging"; label: string }) {
  const [search, setSearch] = useState("");
  useEffect(() => {
    try {
      setSearch(sessionStorage.getItem(LIST_KEY + list) ?? "");
    } catch {}
  }, [list]);
  return (
    <Link href={`${list}${search}`} className="-ml-1 mb-4 inline-flex min-h-9 items-center gap-1 pr-3 text-sm text-muted-foreground transition-colors hover:text-foreground">
      <ChevronLeft className="size-4" aria-hidden="true" />
      {label}
    </Link>
  );
}
