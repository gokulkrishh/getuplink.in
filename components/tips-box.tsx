import { after, connection } from "next/server";
import { AiNotes } from "@/components/home/week-tips";
import { type Finding, rankWithVotes, type TipCar, type TipSurface, topFindings } from "@/lib/ai-tips";
import { loadCarDetails } from "@/lib/server/car";
import { generateTips, loadTips } from "@/lib/server/ai-tips";
import { currentOwner } from "@/lib/server/auth";
import { loadTipVotes } from "@/lib/server/tip-votes";

// The "Tips" box on a page (lib/ai-tips.ts): the stored tips for these findings, with the owner's votes on
// them, or none and some written after the response for the next view. The owner's votes so far move each
// kind of finding up or down before the top few are sent. Render it inside a Suspense with AiNotesSkeleton,
// and only when there are findings, so a page with nothing to say has no box.
// at: the IST day's start for daily tips, else the drive's or charge's start. entity: what a vote is on (the
// day's start, the drive's start or the charge's id).
export async function TipsBox({ surface, vehicleId, at, daily, entity, findings }: { surface: TipSurface; vehicleId: string; at: number; daily: boolean; entity: string; findings: Finding[] }) {
  // Outside the pages' cached scope: the session check reads the clock, so this part renders per request.
  await connection();
  const owner = await currentOwner();
  if (!owner) return null;
  const [{ votes, net }, details] = await Promise.all([loadTipVotes(owner, surface.scope, entity), loadCarDetails(owner, vehicleId).catch(() => null)]);
  // The car the tips are for, so the AI writes for this Tesla and its battery (LFP or not).
  const car: TipCar = details && { name: [details.year, details.model, details.pack, details.drive?.toLowerCase()].filter(Boolean).join(" ").replace(/ (all|rear)-wheel/, ", $1-wheel"), lfp: details.likelyLfp };
  // "Tesla suggests a daily limit of 90% or less" is wrong for an LFP battery, so that finding is left out.
  const fitting = car?.lfp ? findings.filter((f) => f.kind !== "highDays") : findings;
  const sent = topFindings(rankWithVotes(fitting, net));
  const key = { vehicleId, at, daily };
  const stored = await loadTips(owner, surface, key, sent, car);
  if (stored.generate) after(() => generateTips(owner, surface, key, sent, car));
  return <AiNotes title="Tips" notes={stored.tips} vote={{ scope: surface.scope, entity, votes, swap: { vehicleId, at } }} />;
}
