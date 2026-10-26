import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { AdminPage } from "@/components/admin/admin-page";
import { Figures } from "@/components/stats/figures";
import { InfoButton } from "@/components/info-button";
import { type Decision, isFull, placesLine } from "@/lib/admin";
import { formatDateTime } from "@/lib/format";
import { isAdmin } from "@/lib/server/admin";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { type Account, loadWaitlist, WAITLIST_TAG, type WaitlistPage } from "@/lib/server/waitlist";
import { type InviteItem, type InvitesPage, loadInvites } from "@/lib/server/invites";
import { copyInviteLink, createInviteLink, decideAccount, renewInviteLink, revokeInviteLink } from "./actions";
import { ActionRow, type RowAction } from "./decision-button";
import { CreateInvite } from "./invite-forms";

export const metadata: Metadata = { title: "Access · Admin" };

// As /admin: the admin check runs before anything streams, so anyone else gets a real 404.
export const instant = false;

const heading = "text-lg font-medium tracking-heading";
const number = new Intl.NumberFormat("en-IN");

// The cache is for showing the page. Every decision checks the admin again itself (decideAccount).
async function loadPage(): Promise<{ data: WaitlistPage; invites: InvitesPage; now: number }> {
  "use cache: private";
  cacheTag(WAITLIST_TAG);
  // 5 minutes or more lets the page come along with a link's prefetch, so the tabs switch at once (Next's
  // instant-navigation guide); saves still refresh it at once (updateTag).
  cacheLife({ stale: 300 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  if (!(await isAdmin())) notFound();
  const now = Date.now();
  const [data, invites] = await Promise.all([loadWaitlist(now), loadInvites(now)]);
  return { data, invites, now };
}

function inviteLine(i: InviteItem): string {
  if (i.state === "used") return `Used ${formatDateTime(i.usedAt!)}${i.joined ? ` · ${i.joined}` : ""}`;
  if (i.state === "expired") return `Expired ${formatDateTime(i.expiresAt)}`;
  if (i.state === "revoked") return "Revoked";
  return `Unused · Expires ${formatDateTime(i.expiresAt)}`;
}

// Invite links: one for each friend's car, made here and shared by the admin. Uplink sends nothing.
function Invites({ invites, readOnly }: { invites: InvitesPage; readOnly: boolean }) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className={heading}>Invites</h2>
        <p className="text-sm text-muted-foreground">
          A link for one friend&apos;s car. It works once, for a day, and only for a Tesla account with that car.
        </p>
      </div>
      {invites.available ? (
        <CreateInvite action={createInviteLink} />
      ) : (
        <p className="text-sm text-faint">Invites aren&apos;t set up yet. Apply the invites migration.</p>
      )}
      {invites.items.length > 0 && (
        <ul className="divide-y border-t">
          {invites.items.map((i) => (
            <ActionRow key={i.id} actions={inviteActions(i, readOnly)}>
              <p className="text-sm font-medium">
                {i.label ?? "Invite"} <span className="font-mono text-xs font-normal text-muted-foreground">VIN …{i.vinSuffix}</span>
              </p>
              <p className="text-sm text-muted-foreground">{inviteLine(i)}</p>
            </ActionRow>
          ))}
        </ul>
      )}
    </section>
  );
}

// Copy and New link only hand back a link, so they work in demo mode too; the rest change something.
function inviteActions(i: InviteItem, readOnly: boolean): RowAction[] {
  if (i.state === "unused")
    return [
      { label: "Copy", pendingLabel: "Copying…", action: copyInviteLink.bind(null, i.id) },
      { label: "Revoke", pendingLabel: "Revoking…", action: revokeInviteLink.bind(null, i.id), disabled: readOnly },
    ];
  if (i.state === "expired" || i.state === "revoked") return [{ label: "New link", pendingLabel: "Creating…", action: renewInviteLink.bind(null, i.id) }];
  if (i.state === "used" && i.joinedApproved && i.joinedUserId !== null)
    return [{ label: "Suspend", pendingLabel: "Suspending…", action: decideAccount.bind(null, "suspend", i.joinedUserId), disabled: readOnly }];
  return [];
}

type Button = { decision: Decision; label: string; pendingLabel: string; primary?: boolean; disabled?: boolean };

function List({ title, accounts, empty, when, buttons, more }: {
  title: string;
  accounts: Account[];
  empty: string;
  when: (a: Account) => string;
  buttons: Button[];
  more?: string;
}) {
  return (
    <section className="space-y-2">
      <h2 className={heading}>{title}</h2>
      {accounts.length === 0 ? (
        <p className="border-t pt-3 text-sm text-faint">{empty}</p>
      ) : (
        <ul className="divide-y border-t">
          {accounts.map((a) => (
            <ActionRow
              key={a.id}
              actions={buttons.map((b) => ({ label: b.label, pendingLabel: b.pendingLabel, primary: b.primary, disabled: b.disabled, action: decideAccount.bind(null, b.decision, a.id) }))}
            >
              <p className="text-sm font-medium">Request {a.id}</p>
              <p className="text-sm text-muted-foreground">{when(a)}</p>
            </ActionRow>
          ))}
        </ul>
      )}
      {more && <p className="pt-1 text-xs text-faint">{more}</p>}
    </section>
  );
}

const asked = (a: Account) => `Asked ${formatDateTime(a.askedAt)}`;
const decided = (verb: string) => (a: Account) => `${verb} ${formatDateTime(a.decidedAt)}`;
const latest = (shown: number, total: number) => (total > shown ? `The latest ${shown} of ${number.format(total)}.` : undefined);

export default async function Page() {
  const { data, invites, now } = await loadPage();
  const full = isFull(data.used, data.max);
  // Demo mode saves nothing, so whatever would change something is off, said once here.
  const readOnly = data.simulated;
  return (
    <AdminPage
      tab="access"
      description={
        <p className="flex items-center gap-1">
          {placesLine(data.used, data.max)}.{readOnly && " Demo: read-only."}
          <InfoButton label="places">Approved accounts hold a place, yours included. Suspended ones don&apos;t. MAX_USERS sets the number.</InfoButton>
        </p>
      }
    >
      <Figures
        figures={[
          { label: "Waiting", value: number.format(data.counts.pending) },
          { label: "Approved", value: number.format(data.counts.approved), note: "Not counting you" },
          { label: "Suspended", value: number.format(data.counts.suspended) },
          { label: "Declined", value: number.format(data.counts.declined) },
        ]}
      />

      <Invites invites={invites} readOnly={readOnly} />

      <List
        title="Waiting"
        accounts={data.pending}
        empty="Nobody is waiting."
        when={asked}
        more={full ? "Every place is used. Suspend someone to approve another." : undefined}
        buttons={[
          { decision: "approve", label: "Approve", pendingLabel: "Approving…", primary: true, disabled: full || readOnly },
          { decision: "decline", label: "Decline", pendingLabel: "Declining…", disabled: readOnly },
        ]}
      />
      <List
        title="Approved"
        accounts={data.approved}
        empty="Nobody yet."
        when={decided("Approved")}
        more={latest(data.approved.length, data.counts.approved)}
        buttons={[{ decision: "suspend", label: "Suspend", pendingLabel: "Suspending…", disabled: readOnly }]}
      />
      <List
        title="Suspended"
        accounts={data.suspended}
        empty="Nobody."
        when={decided("Suspended")}
        more={latest(data.suspended.length, data.counts.suspended)}
        buttons={[{ decision: "restore", label: "Restore", pendingLabel: "Restoring…", disabled: full || readOnly }]}
      />
      <List
        title="Declined"
        accounts={data.declined}
        empty="Nobody."
        when={decided("Declined")}
        more={latest(data.declined.length, data.counts.declined) ?? "Restore puts a request back on the waitlist."}
        buttons={[{ decision: "reopen", label: "Restore", pendingLabel: "Restoring…", disabled: readOnly }]}
      />

      <p className="text-xs text-faint">As of {formatDateTime(now)}</p>
    </AdminPage>
  );
}
