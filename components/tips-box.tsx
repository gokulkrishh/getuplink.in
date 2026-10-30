import { after, connection } from "next/server";
import { AiNotes } from "@/components/home/week-tips";
import { type Finding, findingsToSend, type TipCar, type TipSurface, tipsToShow } from "@/lib/ai-tips";
import { loadCarDetails } from "@/lib/server/car";
import { generateTips, loadTips } from "@/lib/server/ai-tips";
import { currentReader } from "@/lib/server/auth";
import { hides } from "@/lib/server/data/owner";
import { loadTipVotes } from "@/lib/server/tip-votes";

// The "Tips" box on a page (lib/ai-tips.ts): the stored tips for these findings, with the owner's votes on
// them, or nothing, and some written after the response for the next view. The owner's votes so far move each
// kind of finding up or down before the top few are sent. Await it with the page's own data, so the page
// arrives in one paint: the box when there are tips to show, nothing at all when there aren't (no findings,
// none stored yet, all voted not useful). It is read on every request and never cached, so a vote and a
// newly written tip show on the next view.
// at: the IST day's start for daily tips, else the drive's or charge's start. entity: what a vote is on (the
// day's start, the drive's start or the charge's id).
export async function loadTipsBox({ surface, vehicleId, at, daily, entity, findings }: { surface: TipSurface; vehicleId: string | null; at: number; daily: boolean; entity: string; findings: Finding[] }) {
  if (!vehicleId || findings.length === 0) return null;
  // Outside the pages' cached scope: the session check reads the clock, so this part renders per request.
  await connection();
  const reader = await currentReader();
  if (!reader) return null;
  const { owner } = reader;
  // The AI's tips can name a station or a town, so a view link that hides locations gets no tips box at
  // all, and nothing is read for one.
  if (hides(owner, "locations")) return null;
  const [{ votes, net }, details] = await Promise.all([loadTipVotes(owner, surface.scope, entity), loadCarDetails(owner, vehicleId).catch(() => null)]);
  // The car the tips are for, so the AI writes for this Tesla and its battery (LFP or not).
  const car: TipCar = details && { name: [details.year, details.model, details.pack, details.drive?.toLowerCase()].filter(Boolean).join(" ").replace(/ (all|rear)-wheel/, ", $1-wheel"), lfp: details.likelyLfp };
  const sent = findingsToSend(findings, net, car?.lfp ?? null);
  const key = { vehicleId, at, daily };
  const stored = await loadTips(owner, surface, key, sent, car);
  // A viewer (a view link) sees the stored tips only: no AI writing set off, and no votes.
  if (stored.generate && !owner.viewOnly) after(() => generateTips(owner, surface, key, sent, car));
  const shown = tipsToShow(stored.tips, votes);
  if (shown.length === 0) return null;
  return <AiNotes title="Tips" notes={shown} vote={owner.viewOnly ? undefined : { scope: surface.scope, entity, votes, swap: { vehicleId, at } }} />;
}
