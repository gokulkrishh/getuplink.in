# Legal review: Privacy and Terms

A compliance review of `app/privacy/page.tsx` and `app/terms/page.tsx`, done on 26 Oct 2026. It was done by Claude, not a lawyer. Each requirement lists its source, the date the source was checked, and how the pages meet it. The judgement calls are under [Ask a lawyer](#ask-a-lawyer), and changes to the code that the law or Tesla's terms point to are under [Code gaps](#code-gaps).

Change this file when either page changes, or when what the code stores changes.

## Sources (all checked 26 Oct 2026)

| Short name | Source |
| --- | --- |
| DPDP Act | Digital Personal Data Protection Act, 2023 (22 of 2023), MeitY copy: https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf |
| DPDP Rules | DPDP Rules, 2025, G.S.R. 846(E), 13 Nov 2025: https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf |
| Commencement | G.S.R. 843(E), 13 Nov 2025, as summarised at https://www.taxmann.com/post/blog/govt-notifies-commencement-dates-for-dpdp-act/ and https://www.azbpartners.com/bank/indias-digital-personal-data-protection-act-phased-rollout-and-key-compliance-milestones/ (the gazette itself wasn't fetched) |
| SPDI Rules | IT (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011, G.S.R. 313(E): https://prsindia.org/files/bills_acts/bills_parliament/2011/IT_Rules_2011.pdf |
| Tesla FAA | Tesla Fleet API Agreement, last updated 21 March 2025: https://digitalassets.tesla.com/tesla-contents/image/upload/Fleet-API-Agreement-EN.pdf |
| Tesla telemetry docs | https://developer.tesla.com/docs/fleet-api/fleet-telemetry (location fields need `vehicle_location`) |
| Tesla third-party page | https://www.tesla.com/support/access-third-party-apps |
| Google GMP terms | Google Maps Platform Terms of Service, last modified 26 Aug 2026 (the version list starts with 23 Jun 2026 as the previous one): https://cloud.google.com/maps-platform/terms |
| Google service terms | https://cloud.google.com/maps-platform/terms/maps-service-terms (see `docs/place-names.md`, checked the same day) |
| E-Commerce Rules | Consumer Protection (E-Commerce) Rules, 2020, G.S.R. 462(E), as summarised at https://www.legitquest.com/act/consumer-protection-e-commerce-rules-2020/91C8 (official PDF not fetched) |

### When the law applies

- **Now (since 13 Nov 2025):** DPDP Act ss. 1(2), 2, 18 to 26, 35, 38 to 43, 44(1) and (3), and Rules 1, 2 and 17 to 21. These cover definitions, the Board and procedure. None of them puts a duty on Uplink yet.
- **13 Nov 2026:** consent managers (s. 6(9), Rule 4). Not relevant.
- **May 2027 (sources say 12 or 13 May):** the core duties, ss. 3 to 17, s. 44(2), and Rules 3 and 5 to 16. Section 44(2) also deletes IT Act s. 43A, which ends the SPDI Rules.
- **Until then**, IT Act s. 43A and the SPDI Rules are the law in force. They apply to a "body corporate"; see Ask a lawyer.

So the pages say "Uplink follows" these laws, and don't claim rights "under" a DPDP section that isn't in force yet. The notice text already covers the DPDP duties. The [Code gaps](#code-gaps) (a consent step, a consent record, other languages) remain to be fixed before May 2027.

## DPDP Act and Rules

| Requirement | Source | How the pages meet it |
| --- | --- | --- |
| Notice: an itemised list of the personal data | Act s. 5(1)(i); Rules r. 3(b)(i) | Privacy: What Uplink stores (16 items) and Signing in (each Tesla scope and what it's for). |
| Notice: the purpose, and what's provided | Act s. 5(1)(i); r. 3(b)(ii) | Privacy: Why, and How data arrives. |
| Notice: how to withdraw consent, as easily as it was given | Act s. 5(1)(ii), s. 6(4); r. 3(c)(i) | Privacy: Withdrawing consent. Each route is one button in Settings, or one switch on Tesla's page. Waitlist withdrawal is by email (see Code gaps). |
| Notice: how to exercise rights and complain to the Board | Act s. 5(1)(ii), (iii); r. 3(c)(ii), (iii) | Privacy: Your rights, ending with the Data Protection Board. No Board URL is given, because none could be verified from an official source. |
| Notice readable on its own, in clear and plain language | r. 3(a), (b) | Short plain sentences, and the page stands alone. |
| Notice in English or an Eighth Schedule language, at the user's choice | Act s. 5(3), s. 6(3) | Not met: English only. See Ask a lawyer. |
| Consent: free, specific, informed, and limited to what's needed | Act s. 6(1) | Tesla's scope screen lets the owner untick location, and the page says what each scope is for. There's no consent step of Uplink's own before the Tesla sign-in. See Code gaps. |
| Consenting first, before any processing | Act s. 6(10) (proof of consent) | No consent record is kept. See Code gaps. |
| Ceasing on withdrawal, and processors ceasing too | Act s. 6(6) | Disconnect clears the tokens and stops streaming (`disconnectTesla`, `stopStreaming` in `lib/server/tesla.ts`). The page says reading stops. |
| Erasing on withdrawal, or when the purpose ends, and having processors erase | Act s. 8(7) | Delete my data and Delete account (`eraseOwnerRows`, `deleteAccount`). Readings past their use go each day (`lib/telemetry-retention.ts`). The page lists retention honestly. |
| The Third Schedule: erasure after 3 years idle | r. 8(1), (2), Third Schedule | Doesn't apply. It covers only e-commerce (2 crore or more users), online gaming (50 lakh or more) and social media (2 crore or more). |
| Keeping data and logs for at least one year | r. 6(1)(e), r. 8(3) | Not promised either way. The page says "if a law makes Uplink keep something longer, it keeps only that". See Ask a lawyer. |
| Security safeguards | Act s. 8(5); r. 6 | Privacy: Security. It names only what the code does: AES-256-GCM-encrypted tokens (`lib/server/crypto.ts`), a hashed connector token, TLS, mutual TLS for the car stream, and database access by service role only (RLS on, no policies). |
| Processors only under a valid contract | Act s. 8(2); r. 6(1)(f) | Vercel, Supabase and Fly.io are used on their standard online terms, which weren't reviewed here. Whether those are enough is in Ask a lawyer. |
| Breach: tell each affected person without delay, through their user account | Act s. 8(6); r. 7(1) | Privacy: If there's a breach. Uplink holds no email, so it tells users in the app (r. 7(1) allows "her user account"). |
| Breach: tell the Board without delay, then in full within 72 hours | r. 7(2) | The page says Uplink reports to the Board. The 72-hour report is the operator's duty; the page doesn't need to say it. |
| Publish a contact who can answer questions | Act s. 8(9); r. 9 | Privacy: Grievance Officer, with the email. **Every reply to a rights request must repeat this contact (r. 9).** |
| Grievance redressal, with a response time published (90 days at most) | Act s. 8(10), s. 13; r. 14(3) | Privacy: confirmed within 2 days, answered within 30 days. Terms: Contact, 30 days. |
| Publish how to make a rights request, and the identifier needed | r. 14(1)(a), (b) | Privacy: Your rights asks for the car's VIN, because Settings shows no account number. See Code gaps. |
| Access: a summary, and who it was shared with | Act s. 11 | The app shows the data. On request, a summary plus the list under Who else gets it. `/api/debug` returns the stored raw data to the signed-in owner. |
| Correction, completion, erasure | Act s. 12 | Privacy: Your rights. Erasure is self-serve. Correction is by email; most data is Tesla's, so a fix usually means a fresh read. |
| Nomination | Act s. 14; r. 14(4) | Privacy: Your rights (email the nominee's details). |
| Children: verifiable parental consent, and no tracking of children | Act s. 2(f) (under 18), s. 9; r. 10 | Privacy: Age, and Terms: Who can use it, both 18 or over. A child's account is deleted. There's no age check. See Ask a lawyer. |
| Cross-border transfer: allowed unless a notified country is restricted | Act s. 16(1); r. 15 | The page names where each processor is (Mumbai, Singapore, Vercel's worldwide network) and that three are US companies. No country has been notified as restricted, as far as this review could find. |
| Significant Data Fiduciary duties | Act s. 10; r. 13 | Doesn't apply. Only fiduciaries the government notifies are SDFs, judged on volume, sensitivity and risk. Uplink is a small, single-operator app. |
| Personal or domestic use exemption | Act s. 3(c)(i) | Doesn't apply: Uplink processes other people's data as a service. |

## IT Act and SPDI Rules (in force until May 2027)

| Requirement | Source | How the pages meet it |
| --- | --- | --- |
| Privacy policy with practices, types of data, purpose, disclosure and security | SPDI r. 4(1)(i) to (v) | Privacy covers each in turn: What Uplink stores, Why, Who else gets it, Security. |
| Sensitive data: passwords, and financial details such as card or bank numbers | SPDI r. 3 | Uplink never sees a Tesla password. Tokens may count; see Ask a lawyer. Invoices hold amounts, not card or bank numbers, though a file could show part of a card number. |
| Telling people what's collected, why, who receives it, and who collects and keeps it | SPDI r. 5(3)(a) to (d) | Covered, except a postal name and address. See Ask a lawyer. |
| Not keeping data longer than needed | SPDI r. 5(4) | How long we keep it. |
| Review and correction on request | SPDI r. 5(6) | Your rights. |
| Option to withdraw consent | SPDI r. 5(7) | Withdrawing consent. |
| A Grievance Officer's name and contact, resolving within one month | SPDI r. 5(9) | Section Grievance Officer, with the email and 30 days. **No name is published** (the operator chose not to). See Ask a lawyer. |
| Disclosure to third parties needs permission, unless it's in the contract or required by law | SPDI r. 6 | Who else gets it lists every recipient, and the Terms accept the Privacy page. Disclosure to authorities only when the law requires. |
| Intermediary due diligence (rules, privacy policy, Grievance Officer) | IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, r. 3 | Probably not an intermediary: Uplink stores invoices only for the owner who sent them, and publishes nothing. See Ask a lawyer. |

## Tesla Fleet API Agreement (last updated 21 March 2025)

| Requirement | Section | How the pages meet it |
| --- | --- | --- |
| A privacy policy saying how data is collected, used, stored and disclosed | 5.4, 9.3.2 | The whole Privacy page. |
| Tell users that Tesla may use submitted information under Tesla's Privacy Notice | 5.4 | Privacy: Who else gets it, linking https://www.tesla.com/legal/privacy. **This was missing.** |
| A policy consistent with Tesla's Privacy Notice, and kept publicly linked | 9.3.3 | The page is public (`proxy.ts` PUBLIC_PATHS) and linked from the home page and every plain page. |
| Explicit, prior, specific, informed opt-in consent, with required categories set apart | 9.3.2, 9.3.7 | Tesla's OAuth scope screen, plus Signing in, which explains each scope. There's no separate consent step of Uplink's own. See Code gaps. |
| Precise location: express opt-in consent, and a conspicuous indicator while it's collected | 9.3.5 | Opt-in: the Vehicle Location scope, which can be unticked; Tesla then sends no location fields (Tesla telemetry docs). Indicator: none. See Code gaps. |
| Users can review the categories they granted, and revoke | 9.3.8 | The page points to revoking in the Tesla account and to Settings. Settings doesn't list the granted scopes. See Code gaps. |
| Requests to access, correct, delete or withdraw are honoured | 9.3.2(g) | Your rights. |
| Deletion within 30 days of a request, or of the app stopping | 9.3.10 | Your rights (30 days). Terms: Availability (deletes within 30 days if it shuts down). |
| No selling or passing on of User Personal Data without a legal basis | 5.6.7 | "Doesn't sell your data." Sharing with the AI the owner connects is at the owner's own instruction. See Ask a lawyer. |
| No harassing or stalking use | 5.6.15 | Terms: Fair use (no tracking someone without their knowledge) and People who drive your car. |
| No sensitive information, and none inferred | 9.3.6 | Nothing collected is sensitive information. Location is precise geolocation, which 9.3.5 covers. |
| No Tesla trademark in the app's name, and no implied endorsement | 7, 14.3, 14.4 | The app is called "Uplink". Terms: Not Tesla. The footer of every plain page says "Not affiliated with Tesla, Inc." |
| Report a breach to Tesla immediately, and credential misuse within 48 hours | 5.5, 9.3.9 | Privacy: If there's a breach says Uplink reports it to Tesla. The timing is the operator's duty. |
| No storing of Tesla passwords | 5.6.23 | OAuth only; the password is never seen. |

Tesla's third-party page also says the shared data is governed by the app's own privacy policy, not Tesla's, and that apps should request only the data categories they need. Uplink asks for `openid offline_access user_data vehicle_device_data vehicle_location vehicle_charging_cmds` (`lib/server/tesla.ts`). `vehicle_charging_cmds` is needed for charging history and invoices (`lib/server/charging.ts`). It also allows charging commands, which Uplink never sends, and the page now says so.

## Google Maps Platform (terms last modified 26 Aug 2026)

| Requirement | Section | How the pages meet it |
| --- | --- | --- |
| The app's terms of service say it includes Google Maps features and content, and that their use is subject to the Google Maps Additional Terms and the Google Privacy Policy | GMP terms 3.2.2(a) | Terms: Google Maps, linking https://maps.google.com/help/terms_maps/ and https://policies.google.com/privacy. **This was missing.** |
| Attribution as Google provides it, not modified or hidden | 3.2.2(b) | "Google Maps" under the sheet's Google places and beside every Google name in a row or title, at Google's text size and colours (see `docs/place-names.md`). |
| Google receives search terms, IP addresses and coordinates, and may use and keep them under its Privacy Policy | 4.4(a) | Privacy: Who else gets it (Google gets the spot's coordinates and what the owner types in the sheet's search, under Google's Privacy Policy). |
| Comply with privacy and cookie laws | 4.4(c)(i) | Google is called only from the server, so no Google cookies reach the browser. |
| Don't give Google an End User's personally identifiable information | 4.4(c)(ii) | Only coordinates are sent, with no account or VIN. See Ask a lawyer. |
| Tell users in advance what's collected, and about combining location with another provider's data; don't obtain or cache a user's location without express, prior, revocable consent | 4.4(c)(iii) | Suggestions are asked for only when the owner opens Name this place, for that one spot. Only the place ID of a place the owner picks is stored; its name is fetched live. The location is the car's, consented through Tesla's scope. |
| No Google content on a non-Google map; no scraping or caching | Service terms 6.2, 14.2; GMP 3.2.3 | Covered in `docs/place-names.md` (updated 26 Oct 2026 for picked places: ID only, names live, never on a map). |

## Consumer Protection (E-Commerce) Rules, 2020

These cover entities that sell goods or services, digital ones included, over a digital platform (r. 2), and require a Grievance Officer who acknowledges within 48 hours and resolves within a month (r. 4). Uplink sells nothing and is free, so they likely don't apply. The pages still meet the timeline anyway: confirmed within 2 days and answered within 30 days. See Ask a lawyer.

## What changed on the pages

### Privacy: statements that didn't match the code

- **"Tesla Supercharger sessions … and their invoices" were listed as stored.** Tesla invoice PDFs are streamed from Tesla when opened (`app/api/charging/invoice/[id]/route.ts`), never stored. Fixed.
- **Third-party invoices weren't mentioned at all.** The MCP `attach_charge_invoice` tool stores the network, station, times, kWh, amount, GST, invoice number, the Gmail message id and the file, in the private `charge-invoices` bucket (`supabase/migrations/20261026120000_charge_receipts.sql`, `lib/server/receipts.ts`). Added.
- **Not listed:** the Tesla account id (`users.tesla_sub`), owner-named places (`user_places`), check logs (`poll_runs`), Tesla API call counts (`api_usage`) and the connector token hash. Added.
- **"The rest for 7 to 14 days" was wrong.** `retentionRules()` keeps BrickVoltageMax, BrickVoltageMin and InsideTemp for 14 days, the four TPMS last-seen fields for 21, Soc and IsolationResistance for 22, and every other unlisted field for 7. Also kept for good: EnergyRemaining, module temperatures, charger fields and lifetime counters, as well as charging, charge level, odometer and versions. Fixed to "a few cabin, battery and tyre readings for 14 to 22 days; the rest for 7 days".
- **Delete account wasn't mentioned.** Settings has it (`deleteWholeAccount`). Added, with what it keeps: the API counts move to "unattributed" (`foldApiUsage`).
- **Delete my data was described as removing everything.** It keeps the users row, so the account can sign in again. Now said.
- **Shared cars weren't mentioned.** Readings are stored once per VIN. A second user sees them from when they added the car, and those readings survive the first user's deletion (`supabase/migrations/20261102120000_shared_cars.sql`, `eraseOwnerRows`). Added.
- **"Disconnect removes your Tesla tokens."** It also stops streaming and signs out everywhere. Fixed.
- **Missing recipients:** Google (coordinates, `lib/server/place-suggestions.ts`), OpenStreetMap Nominatim (exact coordinates with no account, `lib/server/place-names.ts`), CARTO (tiles load in the browser, `components/ui/map.tsx`), the AI the owner connects, other users of a shared car, rollout totals shown to every signed-in owner, and the operator's access. Added.
- **"The app is hosted on Vercel"** was vague. `vercel.json` pins functions to `bom1` (Mumbai). Fixed.
- **"It doesn't sell or share your data."** It does share, with the recipients above. Now: "doesn't sell your data, and shares it only as listed".
- **Area names** (`place_names`) are shared, kept by rounded coordinates and not deleted by either delete. Now said.
- **Location read by the 6-hour check** is used only to work out the state and the station, and is never stored (`homeStateFrom` in `lib/server/poll.ts`; `drive_state` is dropped by `lib/stored-raw.ts`). Now said.

Checked and found to match: the cookies (`tiu_session`, `tiu_oauth_state`, and the theme cookie and localStorage in `lib/theme.ts`; no analytics), no wake and no commands, the receiver logging no values (`fly/telemetry/worker.ts`), the 6-hour poll (`lib/server/poll.ts`), the waitlist keeping only the account id and times (the email constraint was dropped in `20261031120000_users_role_no_email.sql`, and nothing writes `users.email`), and Fonts (`next/font/google` is self-hosted at build time, so Google Fonts isn't a recipient).

### Privacy: added

Signing in (each Tesla scope and why, and unticking location), Who else gets it (processors, places and other recipients), Deleting your data, Withdrawing consent, Your rights (each right, how to ask, the VIN as identifier, 2 and 30 days, nomination, the Board), Grievance Officer, Security, If there's a breach, Age, and in Changes, asking again before any new use (Tesla 9.3.7).

### Terms: added

Agreeing (to these terms and the Privacy page), Who can use it (18 or over, your own account, the waitlist), Your Tesla account (responsibility, Tesla's terms, API changes), People who drive your car, Fair use (now naming tracking, others' data, reselling and invoices), Your connector token, Google Maps (required by GMP 3.2.2(a)), As is (now naming what not to rely on), Availability (deletes within 30 days on shutdown, per Tesla 9.3.10.2), Leaving and suspension, Liability (rights the law gives aren't taken away), Changes, Law and disputes (courts in India, write to us first), and a reply time in Contact.

### Elsewhere

- `app/home/page.tsx` FAQ, "How do I delete my data?": now also names Delete account.
- `app/settings/confirm-actions.tsx`, Delete my data: its description and confirmation left out invoices and places. Both now name them. Disconnect and Delete account were already accurate.
- Privacy, Signing in: without location, trips still show (drives come from Gear and Odometer, `lib/drives.ts`), just without a route. The page says so.
- Privacy, Deleting and Withdrawing: streaming stops only for cars no other Uplink user tracks (`stopStreaming`), and Delete my data keeps the API call counts (only Delete account folds them). Both now said.
- `app/agents.md` makes no privacy claims that conflict.

## Code gaps

These are what the law or Tesla's terms point to and the pages can't fix on their own. None are built in this change.

1. **No notice or consent step before the Tesla sign-in.** DPDP s. 5(1) and s. 6(1), and Tesla 9.3.2 and 9.3.7, want the notice to come before or with the consent request, and the consent to be explicit. Today the home page links to Privacy, and Tesla's scope screen is the only opt-in. Add a short screen before `/api/auth/connect` with the itemised list, a link to Privacy and Terms, and an "I agree" button.
2. **No consent record.** DPDP s. 6(10) puts the burden of proof on Uplink. Store when each user agreed, to which version of the pages, and which scopes Tesla granted (`user_tokens.scope` already holds the scopes).
3. **No location indicator.** Tesla 9.3.5 wants a conspicuous indicator while precise location is collected. Add a small "Location on" marker in the app header or on the car page while the stream includes Location.
4. **Settings doesn't show the granted data categories.** Tesla 9.3.8: list the scopes from `hasScope`, with a link to revoke in the Tesla account.
5. **No account identifier for emailed requests.** DPDP r. 14(1)(b). Show the account number in Settings, so a request can quote it instead of a VIN.
6. **No way to leave the waitlist in the app.** Withdrawal should be as easy as asking (s. 6(4)). Add "Leave the waitlist" to `/waitlist`, deleting the users row.
7. **English only.** DPDP s. 5(3) and s. 6(3): offer the notice in an Eighth Schedule language on request, or translate it.
8. **Breach notice channel.** There's no in-app banner mechanism for a breach notice. Add one (the status page or a site-wide notice) before it's needed.

## Ask a lawyer

1. **Does the SPDI regime apply to an individual?** IT Act s. 43A applies to a "body corporate", which includes a sole proprietorship "engaged in commercial or professional activities". Is a free, non-commercial app run by one person covered? If it is, SPDI r. 5(9) requires the Grievance Officer's **name**, and r. 5(3)(d) the **name and address** of who collects and keeps the data. The pages give a role and an email only, by the operator's choice.
2. **Are Tesla OAuth tokens "passwords"** under SPDI r. 2(1)(h) and r. 3(i) ("secret … key")? If so, r. 5(1) wants written consent (letter, fax or email) before collecting them.
3. **Rule 6(1)(e) and Rule 8(3)** (from May 2027) require keeping "such personal data, associated traffic data and other logs of the processing" for at least one year. Does that override Delete my data, which erases at once, and the 7-day readings? Is it only logs, or the data too? And what about processor logs (Vercel, Supabase, Fly) that Uplink doesn't control?
4. **Is Tesla's scope screen, with the Privacy link on the home page, valid consent** under DPDP s. 6(1) and Tesla 9.3.2, or is Uplink's own consent step (Code gap 1) required?
5. **Tesla 9.3.5's indicator.** Does a map of trips count as an "indicator", or is a live marker needed?
6. **Shared cars.** One owner's deletion leaves the readings a second user's window covers. Whose data are they? Can the first owner demand their erasure, given the second user also has Tesla access to the car?
7. **Other drivers.** Trips record where the car went whoever drives (family members, a driver). They're data principals who never consented. Is the owner's notice duty in the Terms enough?
8. **Car coordinates sent to Google.** Under GMP 4.4(c)(ii), is a parked spot's coordinates "personally identifiable information"? And under Tesla 5.6.7, is sending Tesla-derived location to Google and OpenStreetMap a permitted disclosure?
9. **Sharing with the AI the owner connects.** Is the owner's own instruction a "valid legal basis" under Tesla 5.6.7, and is Uplink then a fiduciary for what the AI does with it?
10. **Rollout totals.** A state with one or two cars on a version could identify an owner to other signed-in owners. Is a minimum count needed?
11. **Area names kept after deletion** (rounded coordinates with no owner). Personal data or not?
12. **Liability.** Does "isn't liable for losses" hold for a free service under the Indian Contract Act s. 23 and the Consumer Protection Act, 2019? Should there be a cap?
13. **Jurisdiction.** "Courts in India" doesn't name a city. Should one be named, such as the operator's city?
14. **Cross-border.** No country is notified under DPDP s. 16(1) as far as this review found. Please confirm, and confirm that Singapore and US processors need no extra step. Do any sector rules apply (none are known)?
15. **Processor contracts.** Are the standard online terms (and any DPA) of Vercel, Supabase and Fly.io a "valid contract" under DPDP s. 8(2) and r. 6(1)(f)?
16. **The Board's complaint route.** No official URL could be verified (dpbi.gov.in and others are cited only by secondary sources). Confirm the URL, and whether naming the Board is enough under r. 3(c)(iii).
17. **E-Commerce Rules and Intermediary Rules.** Confirm that neither applies to a free app that sells nothing and publishes no user content.
18. **Commitments.** Are the 2-day acknowledgement and 30-day reply realistic for one operator? Is "deletes your data within 30 days if it shuts down" (Tesla 9.3.10.2) a promise the operator wants to make? And "asks you first" before any new use?
19. **Age.** Is "18 or over" with no check enough, or is age assurance needed under r. 10? Owning a car and a Tesla account suggests an adult, but a family member's account may not be.
