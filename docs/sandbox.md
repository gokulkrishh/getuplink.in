# Local sandbox: try sign-up and invites without a second Tesla account

`bun run sandbox` runs the real app with two pieces swapped out:
- **A fake Tesla.** Sign-in goes to a local page that lists made-up accounts.
- **A throwaway database in memory.** It is seeded with one owner and their car.

Everything else is the real code: `/api/auth/connect`, the callback, `signIn`, the invite and region checks, Access, the check after sign-in, sessions and Suspend.

Demo mode (`bun run demo`) is different. It skips the database and sign-in entirely, so it can't exercise any of this.

## Run it

```sh
bun install
bun run sandbox          # UPLINK_SANDBOX=1 next dev
```

Open http://localhost:3000. Every page carries a yellow banner, "Local sandbox: fake Tesla, throwaway data". Its **Reset** button puts the database back to the seed.

- **Restarting the server** also reseeds the database.
- **Private windows:** each one is a separate person. Chrome's guest windows or separate profiles work too.
- **Plain `localhost` serves the app,** as in demo mode. You don't need `app.uplink.localhost`.
- **Signup mode:** the sandbox runs as `SIGNUP_MODE=invite`, which is how Uplink ships. To try the waitlist, start it with `SANDBOX_SIGNUP_MODE=waitlist bun run sandbox`.

## What's safe about it

- **It only starts locally.** It's on only when `NODE_ENV` is `development` (that is, `next dev`) and `UPLINK_SANDBOX=1` is set.
- **It refuses production and Vercel.** If the flag is set in a production build or server, or anywhere `VERCEL` is set, `next.config.ts` and `instrumentation.ts` throw at startup.
- **It never reads your real secrets.** It ignores `.env.local` for every secret it would use: `SUPABASE_URL` and the service role key, the Supabase access token, Tesla's client id and secret, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET` and `MAX_USERS`. It uses its own values instead (`lib/sandbox/flag.ts`, `SANDBOX_ENV`).
- **It never makes a Supabase client.** `db()` hands out the in-memory database.
- **It can't reach Tesla or Supabase.** While it runs, any `fetch` to `*.tesla.com` or `*.supabase.co`/`.com` throws. Place-name lookups (OSM) are off.
- **Sessions don't cross over.** They are signed with the sandbox's own key, so a sandbox session is useless in the real app, and the other way round.

## The made-up accounts

| On the login page | Tesla region | Cars |
| --- | --- | --- |
| Owner (admin) | Asia-Pacific | Model Y `LRWYGCEK3TCSBX001` |
| Friend with car | Asia-Pacific | Model 3 `LRW3E7EK1TCSBX777` |
| Account with no car | Asia-Pacific | none |
| Second driver of the owner's car | Asia-Pacific | the owner's Model Y, `…SBX001` |
| Europe account | Europe | Model Y `XP7YGCEK0TCEU0042` |

The seed is one user: the owner. They are approved, an admin and connected. Their car has about five weeks of fake telemetry (from the demo generator), version history and charging sessions, so the dashboard has something to draw.

## The order signIn checks things in

The script's expected messages come from this order (`lib/server/tesla.ts`, `signIn` and `joinThroughInvite`). For an account Uplink doesn't know:
- **With an invite link:**
  1. The link must still be unused. If not: "This invite link has expired or was already used."
  2. Region. If Tesla serves the account from outside India and Asia-Pacific: "Uplink is for Tesla accounts in India and Asia-Pacific only."
  3. VIN. If no car on the account ends in the invite's 6 characters: "This invite is for a different car."
  4. Then a place must be free, and the account joins as approved.
- **Without an invite:** "Uplink is invite-only." The region isn't asked.
- **A refusal changes nothing:** no users row, no stored tokens, and the invite stays unused.
- **An already used link stops at the invite page** ("This invite link was already used"), before Tesla. The callback's "expired or used" only shows when a link stops working while someone is on Tesla's page.

## Test script

In the main window:
1. Open http://localhost:3000. You land on the home page, signed out.
2. Choose **Sign in**. The sandbox's Tesla page opens. Choose **Owner (admin)**. You land on the dashboard with the Model Y, its battery, drives and charging.
3. Open **Access** (`/admin/waitlist`). Create an invite for `SBX777` labelled "Friend's 3", then one for `ZZZ999` labelled "Nobody's car". Copy both links.

In private window 1:

4. Open the `ZZZ999` link. Choose **Sign in with Tesla**, then **Friend with car**. The home page says "This invite is for a different car."
5. Open the `ZZZ999` link again and sign in as **Account with no car**. Same message: "This invite is for a different car."
6. Open the `ZZZ999` link again and sign in as **Europe account**. The message is "Uplink is for Tesla accounts in India and Asia-Pacific only." That is the region refusal, which comes before the VIN check.
7. Go to `/api/auth/connect` (or the home page's Sign in) with no invite, and choose **Account with no car**. The message is "Uplink is invite-only."
8. Open the `SBX777` link and sign in as **Friend with car**. They join and land on their dashboard with "Friend's 3", the Model 3. The check after sign-in fetched the car from the fake Tesla.

In private window 2:

9. Open the `SBX777` link. The page says "This invite link was already used", and there's no sign-in button.
10. Open the `ZZZ999` link and choose **Sign in with Tesla**, but don't pick an account yet. In the main window, **Revoke** `ZZZ999` on Access. Back in window 2, choose **Account with no car**. The message is "This invite link has expired or was already used."

Back in the main window:

11. On Access, create an invite for `SBX001` labelled "Second driver". Open it in private window 3 and sign in as **Second driver of the owner's car**. They join and see the Model Y. They see nothing from before they joined: their window on the car's readings starts now.
12. Reload Access. The invites read:
    - Friend's 3: **Used … · Model 3 · X777**, with Suspend;
    - Second driver: **Used … · Model Y · X001**, with Suspend;
    - Nobody's car: **Revoked**, with New link.

    The tiles show 2 approved, not counting you.
13. **Suspend** Friend's 3. In window 1, reload: the friend is signed out (home page). Signing in again as **Friend with car** says "Not approved."
14. Choose **Reset** in the banner. You land on `/home`. The owner is still signed in in the main window, the invites are gone, and the other windows are signed out.

The `/setup` gate isn't covered: `/setup` isn't on `main` yet (it's on `worktree-agent-ae3ec5d1f4a8a543a`). The fake Tesla already answers `fleet_status` (every car key-paired) and `fleet_telemetry_config` (synced), so the gate can be added to this script once that branch merges.

## What the sandbox covers

**Pages that work on the throwaway database:**
- home (`/home`)
- sign-in (`/api/auth/connect`, the fake Tesla page, `/api/auth/callback`)
- `/invite/[token]`
- Access (`/admin/waitlist`): invites, Suspend, and the waitlist's approve and decline
- the dashboard (`/`), for the owner and for anyone who joins

The check after sign-in runs against the fake Tesla. It records the car, a snapshot, and a version-history row for a new account.

**Other pages are best effort.** The data layer runs unchanged on the in-memory database, but these were not walked through: car detail, Updates, Rollout, Stats, Settings, Admin and Costs.
- **Rollout and Admin's fleet totals** use PostgREST embeds, which the fake doesn't model, so they may show less than they would.
- **Costs** shows its "connect" states: the Supabase and Vercel tokens are unset in the sandbox.
- **Database functions:** the fake models `counter_values_at`, `snapshot_odometer_at`, the usage counters and the check locks. Any other function logs "isn't modelled" and returns no rows.

**The fake Tesla answers these:**
- the token endpoint (code and refresh)
- `/api/1/users/me`
- `/api/1/users/region`
- `/api/1/vehicles`
- `vehicle_data`
- `fleet_status`
- `fleet_telemetry_config` (GET and DELETE)
- `fleet_telemetry_errors`
- `release_notes` (none)
- `dx/charging/history` (empty)

Anything else gets a 404.

## Where it lives

- **`lib/sandbox/flag.ts`:** the switch (`sandboxOn()`), the startup check, the sandbox's own settings and the fetch guard.
- **`lib/sandbox/accounts.ts`:** the made-up accounts.
- **`lib/sandbox/tesla.ts`:** the fake Tesla transport.
- **`lib/sandbox/db.ts`:** the in-memory database (`FakeDb` plus column defaults and functions), its seed and Reset.
- **`lib/sandbox/fake-db.ts`:** `FakeDb`. It is the same implementation the tests use; `test/fake-db.ts` re-exports it.
- **`app/sandbox/tesla-login`:** the login page. **`app/sandbox/actions.ts`:** Reset. **`components/sandbox-banner.tsx`:** the banner.
- **The hooks in the real code:**
  - `db()` in `lib/server/supabase.ts`;
  - the Tesla transport and `authorizeUrl` in `lib/server/tesla.ts`;
  - `env()` and the other env reads (through `envValue`);
  - session signing in `lib/session.ts`;
  - `proxy.ts`: any host, and the login page;
  - the banner in `app/layout.tsx`.

**In a production build** `sandboxOn()` is always false, so none of these branches run:
- the login page is a 404 (and the proxy sends a signed-out visitor to `/home`);
- the banner never renders;
- Reset throws.

The sandbox modules are bundled into the server output but are unreachable. None of it reaches client code.

**Tests:**
- `test/sandbox.test.ts`:
  - the sandbox refuses production and Vercel;
  - the fetch guard;
  - outside the sandbox, sign-in uses Tesla's real endpoints and never the fake.
- `test/sandbox-flow.test.ts`: this script end to end, through the route handlers and server actions. It runs in its own `bun test` process. It also checks that no Supabase client is made and that nothing touches the network.
- `test/data-layer-guard.test.ts`: only the two switches (`db()` and the Tesla transport) and Reset import the sandbox's database or fake Tesla.
