"use client";

import { useEffect, useState } from "react";
import { BackLink as Back } from "@/components/back-link";
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
  return <Back href={`${list}${search}`} label={label} />;
}
