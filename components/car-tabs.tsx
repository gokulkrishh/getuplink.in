import { TabLinks } from "@/components/segmented";

type CarView = "car" | "updates";

// One line for the whole Car section, naming what its tabs do for the owner.
const DESCRIPTION = "How your car is doing, and what's new in its software.";

// The Car section's heading, line and tabs: the owner's own car, and its software (with the India rollout
// under it). The same shape as Stats' (StatsPage).
export function CarTabs({ value }: { value: CarView }) {
  return (
    <>
      <h1 className="text-[1.5rem] font-medium tracking-heading max-sm:text-[1.25rem]">Car</h1>
      <p className="mt-2 mb-12 text-sm text-muted-foreground">{DESCRIPTION}</p>
      <div className="mb-6">
        <TabLinks
          name="car-view-indicator"
          label="Car sections"
          options={[
            { value: "car", label: "My Car", href: "/car" },
            { value: "updates", label: "Updates", href: "/updates" },
          ]}
          value={value}
        />
      </div>
    </>
  );
}
