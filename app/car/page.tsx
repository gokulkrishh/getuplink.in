import type { Metadata } from "next";
import { CarPage } from "./car-page";

export const metadata: Metadata = { title: "Car" };

// The primary car, so the header can link here without knowing its id.
export default function Page() {
  return <CarPage id={Promise.resolve(null)} />;
}
