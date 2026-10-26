import type { Metadata } from "next";
import { CarPage } from "../car-page";

export const metadata: Metadata = { title: "Car" };

export default function Page({ params }: PageProps<"/car/[id]">) {
  return <CarPage id={params.then((p) => p.id)} />;
}
