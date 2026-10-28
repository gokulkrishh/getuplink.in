# Legal review: Privacy and Terms

The record of how Uplink's Privacy page (`app/privacy/page.tsx`), Terms (`app/terms/page.tsx`) and data practices measure up against Indian law and Tesla's and Google's terms. Last reviewed 28 Oct 2026.

**This is an AI review, not legal advice.** Claude wrote it in the role of a technology and data-protection advocate, reading the code and the sources below. It isn't a licensed advocate and can't sign anything off. Three items need a practising advocate's view before May 2027 (they're marked **Lawyer**): #3 (keeping logs for a year against erasing on request), #6 (shared cars) and #15 (processor contracts). A one-time read of the final pages by an advocate before the DPDP duties start is worth the fee.

Change this file when either page changes, or when what the code stores changes.

Status means:

- **Done**: the pages or code now meet it. Nothing left to do.
- **Recommended**: a change Uplink should make, with the design. Not built.
- **Owner**: a decision or task only the operator can do (a personal detail, an account setting, a contract).
- **Lawyer**: needs a practising advocate to sign off.

## When each duty applies

| From | What | Why it matters |
| --- | --- | --- |
| Now | Tesla Fleet API Agreement (contract) | Breaking it can end API access, which ends Uplink. The most urgent gaps are here. |
| Now | Google Maps Platform terms (contract) | Same, for Name this place. |
| Now | IT Act s. 43 and s. 72A (any person) | s. 72A: disclosing personal information in breach of a lawful contract, knowing it causes wrongful loss, is an offence. Keep sharing to what Privacy lists. |
| Now, if it applies | IT Act s. 43A and the SPDI Rules, 2011 | Only for a "body corporate". See #1. |
| Now, if it applies | CERT-In Directions of 28 Apr 2022 (IT Act s. 70B(6)) | See #20. |
| Now | Indian Contract Act, 1872; IT Act s. 10A (e-contracts) | The Terms. |
| 13 Nov 2026 | DPDP consent managers (s. 6(9), r. 4) | Not relevant. |
| 13 May 2027 | DPDP Act ss. 3 to 17 and Rules 3, 5 to 16 | The core duties. Section 44(2) then omits IT Act s. 43A, which ends the SPDI Rules. |

A January 2026 MeitY proposal to cut the 18 months to 12 was aimed at Significant Data Fiduciaries. As of the last update found (Sept 2026), nothing amending the dates has been notified. Uplink isn't an SDF either way. Check the gazette again before May 2027.

## Sources (checked 26 Oct 2026)

| Short name | Source |
| --- | --- |
| DPDP Act | Digital Personal Data Protection Act, 2023 (22 of 2023): https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf |
| DPDP Rules | DPDP Rules, 2025, G.S.R. 846(E), 13 Nov 2025: https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf and the gazette copy https://egazette.gov.in/WriteReadData/2025/267650.pdf. **Neither could be fetched this time** (403, and a certificate error). Rules 6, 7, 8(3) and 10 are cited from the earlier review and from commentary: https://www.barandbench.com/view-point/meity-notifies-final-digital-personal-data-protection-rules-2025, https://techlawforum.nalsar.ac.in/privacy-with-a-footnote-data-retention-under-the-dpdp-framework/, https://www.scconline.com/blog/post/2025/12/26/digital-personal-data-protection-rules-2025-key-highlights/ |
| Commencement | G.S.R. 843(E), 13 Nov 2025, as summarised at https://www.taxmann.com/post/blog/govt-notifies-commencement-dates-for-dpdp-act/ and https://www.mirvolegal.com/insights/dpdp-rules-2025-compliance-timeline/ |
| 12-month proposal | https://www.business-standard.com/technology/tech-news/meity-may-cut-compliance-timeline-for-key-dpdp-rules-to-12-months-126012201293_1.html, https://ssrana.in/articles/meity-plans-to-cut-short-dpdp-compliance-timeline-and-notify-cross-border-restrictions-for-sdfs/ |
| SPDI Rules | IT (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011, G.S.R. 313(E): https://prsindia.org/files/bills_acts/bills_parliament/2011/IT_Rules_2011.pdf, and MeitY's clarification of 24 Aug 2011 (consent by electronic communication), from the reviewer's knowledge |
| CERT-In | Directions under s. 70B(6), 28 Apr 2022, summarised at https://www.khaitanco.com/thought-leaderships/Decoding-the-new-CERT-In-Directions:-Government-releases-the-much-awaited-FAQs and https://corporate.cyrilamarchandblogs.com/2022/05/the-cert-in-cyber-security-directions-more-questions-than-answers/ |
| Board | No official URL found. Secondary sources name dpbi.gov.in and others: https://righttoinformation.wiki/exercise-data-protection-rights-dpdp-2026 |
| Tesla FAA | Tesla Fleet API Agreement, last updated 21 March 2025: https://digitalassets.tesla.com/tesla-contents/image/upload/Fleet-API-Agreement-EN.pdf |
| Tesla telemetry docs | https://developer.tesla.com/docs/fleet-api/fleet-telemetry |
| Tesla third-party page | https://www.tesla.com/support/access-third-party-apps |
| Google GMP terms | Google Maps Platform Terms of Service, last modified 26 Aug 2026: https://cloud.google.com/maps-platform/terms |
| Google service terms | https://cloud.google.com/maps-platform/terms/maps-service-terms (see `docs/place-names.md`) |
| E-Commerce Rules | Consumer Protection (E-Commerce) Rules, 2020, G.S.R. 462(E), as summarised at https://www.legitquest.com/act/consumer-protection-e-commerce-rules-2020/91C8 |
| Case law | Cited from the reviewer's knowledge, not fetched: *Central Inland Water Transport Corp. v. Brojo Nath Ganguly* (1986) 3 SCC 156; *A.B.C. Laminart v. A.P. Agencies* (1989) 2 SCC 163; *Swastik Gases v. Indian Oil Corp.* (2013) 9 SCC 32. Check them before relying on them. |

## The 19 items

### 1. Does the SPDI regime apply to an individual?

- **Answer:** Probably not. IT Act s. 43A, Explanation (i), defines "body corporate" to include a sole proprietorship "engaged in commercial or professional activities". A free app with no income, run by one person, is arguably not commercial. But two things apply anyway: s. 72A (any person) applies now, and from May 2027 the DPDP Act covers any "person" as a Data Fiduciary (s. 2(i), (s)), individuals included. DPDP r. 9 asks for the contact of "a person able to answer", which an email meets; no name is needed.
- **Risk:** Low.
- **Change:** None needed. Publishing a Grievance Officer name and a postal address would remove the doubt while SPDI lasts. That's the operator's choice, and no real details belong in this repo until they decide.
- **Status:** Owner.

### 2. Are Tesla OAuth tokens "passwords"?

- **Answer:** Plausibly yes. SPDI r. 2(1)(h) defines a password to include a "secret key … that one uses to gain admittance or access to information", and a refresh token is exactly that. If SPDI applies, r. 5(1) wants written consent before collecting it. MeitY's 2011 clarification accepts consent by electronic communication, and IT Act s. 10A recognises e-contracts. The invite page's required box is that consent for new users. Storage already meets r. 8's intent: AES-256-GCM (`lib/server/crypto.ts`), service-role-only database access.
- **Risk:** Low.
- **Change:** Done: the consent box on the invite page (see #4).
- **Status:** Done.

### 3. One year of logs (Rules 6(1)(e) and 8(3)) against erasing on request

- **Answer:** From 13 May 2027, r. 8(3) (as commentary reads it) requires keeping "such personal data, associated traffic data and other logs of the processing" for at least one year, for the Seventh Schedule purposes (requests by the State), then erasing them. Rule 6 also asks for logs to detect and investigate unauthorised access. Act s. 8(7) lets a fiduciary keep data where "retention is necessary for compliance with any law", so the rule overrides an erasure request to that extent. What it doesn't settle is whether the raw readings themselves must stay a year, or only a record of the processing. Reading it to require keeping every deleted reading would defeat s. 8(7) and the storage-limitation principle. Processor logs (Vercel, Supabase, Fly) are each provider's own, under its terms.
- **Risk:** Medium, from May 2027. Nothing is due now.
- **Change:** Recommended before May 2027: a `processing_log` table that Delete account doesn't erase. One row per read, delete or share, holding the account id, the kind of data, the time and the action, but no readings or locations. Keep it 365 days, then prune. Delete my data then still removes the readings at once. The Privacy line "If a law makes Uplink keep something longer, it keeps only that" already covers it; name the one-year log there when it's built.
- **Status:** Lawyer (the scope of "personal data" in r. 8(3)), then Recommended.

### 4. Is Tesla's scope screen valid consent?

- **Answer:** Not on its own. Tesla 9.3.2 and 9.3.7 put the duty to get explicit, prior, informed opt-in consent on the developer, and DPDP s. 5(1) and s. 6(1) want Uplink's own notice to come before or with the request, and a clear affirmative act. Tesla's screen is Tesla's consent for Tesla.
- **Risk:** High for anyone who hasn't seen Uplink's own step (a Tesla contract duty, in force now).
- **Change:**
  - Done: the invite page (the only sign-up path when `SIGNUP_MODE=invite`) now says what signing in shares, and has a required box: "I'm 18 or over, and I agree to the Terms and the Privacy page". `startInviteSignIn` refuses a post without it.
  - Recommended: existing users, and anyone who joins the waitlist (the header's Sign in, when `SIGNUP_MODE` is `waitlist` or `open`) and is approved, sign in through `/api/auth/connect` and never see it. DPDP s. 5(2) also wants a notice to people who consented before May 2027, "as soon as reasonably practicable". Add an `agreed_at` and `agreed_version` to `users`. In the callback, an approved user without the current version goes to a short `/agree` page (the same notice and box) before tokens are stored. That also gives the consent record s. 6(10) asks for, alongside `user_tokens.scope`.
- **Status:** Done (people who join by invite); Recommended (existing and waitlist users, and the record).

### 5. Does a trip map count as Tesla 9.3.5's location indicator?

- **Answer:** No. 9.3.5 wants a "conspicuous indicator" while precise location is being collected. A map of past trips shows what was collected, not that collection is on now.
- **Risk:** High (Tesla contract).
- **Change:** Recommended: in `components/header.tsx`, a small "Location on" label beside the nav, streamed behind its own Suspense like `AdminItem`, shown when `hasScope(owner, LOCATION_SCOPE)` is true. It links to Settings, which should list the granted scopes and say how to turn location off (Tesla 9.3.8; Open work 3).
- **Status:** Recommended.

### 6. Shared cars: whose readings are they?

- **Answer:** Readings about a car are personal data of each person they identify: each owner, and whoever drove. Two Uplink users who both have Tesla access each consented for their own time with the car. The first owner's erasure right (s. 12(3), s. 8(7)) reaches processing based on *their* consent. It doesn't reach readings Uplink holds on the second user's consent. Uplink keeps only readings inside the second user's window, and erases the rest (`eraseOwnerRows`, `forgetUnseenReadings`). That's a defensible line, and Privacy says so. The open point is a first owner who asks to erase their own trips from that shared window.
- **Risk:** Low in practice (few shared cars), novel in law.
- **Change:** None now. If asked, handle it case by case and log the reply.
- **Status:** Lawyer (optional, low priority).

### 7. Other drivers

- **Answer:** Family members or a driver are data principals who never consented to Uplink. The owner's household-use exemption (s. 3(c)(i)) covers the owner, not Uplink. No "legitimate use" in s. 7 fits. The practical answer, as in every telematics app, is that the owner tells the people who drive (Terms: People who drive your car), Uplink uses trips only for the owner, and a driver has a way to ask.
- **Risk:** Low in practice, medium in theory.
- **Change:** Done: Privacy, Your rights, now says a driver can write about their trips.
- **Status:** Done.

### 8. Car coordinates sent to Google and OpenStreetMap

- **Answer:** Google gets a spot's coordinates only when the owner opens Name this place and asks, with no account, VIN or name, under GMP 4.4(c)(ii). That's a disclosure at the owner's instruction, disclosed in Privacy, so it fits Tesla 5.6.7's legal basis (consent). Nominatim was different: it got the car's *exact* coordinates automatically, though the name is kept by a spot rounded to 3 decimals.
- **Risk:** Low.
- **Change:** Done: `lib/server/place-names.ts` now sends the rounded spot (about 100 m), the same key it stores. Privacy and `docs/place-names.md` say so. For certainty on 5.6.7, ask Tesla developer support in writing.
- **Status:** Done.

### 9. Sharing with the AI the owner connects

- **Answer:** Yes, the owner's own instruction, given by making a token and handing it to their AI, is consent and a valid legal basis under Tesla 5.6.7 and DPDP s. 6. The AI provider decides its own purposes and means under its own terms, so it's a separate Data Fiduciary chosen by the owner, not Uplink's processor. Uplink's duty ends at handing the data over securely: the token is hashed, shown once and revocable. The bot template reads the owner's Gmail through the owner's own AI. Uplink never touches Gmail.
- **Risk:** Low.
- **Change:** None. Privacy and Terms (Your connector token) already say this.
- **Status:** Done.

### 10. Rollout totals could identify an owner

- **Answer:** With about 25 users, mostly friends, "1 car in Kerala on 2026.38" can identify a person to others who know them. That makes the total personal data (s. 2(t)), shown to other users.
- **Risk:** Low to medium.
- **Change:** Recommended: a minimum cell of 3. In the state breakdown (`buildStateRollout`), fold any state with fewer than 3 cars on a version into "Other states". Version totals across India are fine.
- **Status:** Recommended.

### 11. Area names kept after deletion

- **Answer:** Not personal data. A name for a spot rounded to about 100 m, with no account, car or time, doesn't identify anyone (s. 2(t)).
- **Risk:** Low.
- **Change:** None.
- **Status:** Done.

### 12. Does "isn't liable for losses" hold?

- **Answer:** Partly.
  - A user of a free service is likely not a "consumer" under the Consumer Protection Act, 2019, s. 2(7), which needs consideration paid or promised. Data as consideration is untested.
  - Under the Contract Act, a click-through agreement binds (IT Act s. 10A, and now the invite box).
  - Courts read exclusion clauses in standard forms strictly. A clause excluding liability even for fraud risks being void under s. 23, or struck as unconscionable (*Brojo Nath Ganguly*).
  - Statutory liability, such as s. 43A compensation or DPDP penalties, can't be contracted out.
- **Risk:** Low.
- **Change:** Done: Liability now excepts losses caused by Uplink's fraud or wilful misconduct. Optional: a cap such as ₹1,000 in total. It's common and likely enforceable for a free service, but it's the operator's call.
- **Status:** Done; the cap is Owner.

### 13. "Courts in India" without a city

- **Answer:** A clause naming one court's city is valid if that court would otherwise have jurisdiction (CPC s. 20; *A.B.C. Laminart*; *Swastik Gases*). The operator's home city qualifies. Without a city, any court with jurisdiction can hear it. If the Consumer Protection Act did apply, the user could still file where they live (s. 34(2)(d)).
- **Risk:** Low.
- **Change:** Owner: change Law and disputes to "courts at <city> have exclusive jurisdiction". Not done here, because it's a personal detail.
- **Status:** Owner.

### 14. Cross-border transfer

- **Answer:** Section 16(1) is a negative list. No country had been notified as restricted, as far as this review could find. The January 2026 proposal on cross-border limits targeted SDFs and isn't notified. Rule 15 (as read) adds only requirements the government may set by order. No sector rule (RBI payment-data storage, for example) applies: Uplink isn't a payment system, and invoice amounts aren't payment-system data. Singapore (Fly) and the US companies need no extra step today.
- **Risk:** Low.
- **Change:** None. Privacy already names where each processor is. Recheck before May 2027.
- **Status:** Done.

### 15. Are the processors' online terms a "valid contract"?

- **Answer:** Online terms accepted by the operator are contracts. Section 8(2) and r. 6(1)(f) want one that binds the processor to process only for the fiduciary and to keep the safeguards. Each provider offers a DPA: Vercel and Supabase have self-serve DPAs, and Fly.io has one on request or in its terms. Whether each one's wording covers what the DPDP asks (instructions, security, erasing at the end, help with breaches) hasn't been checked.
- **Risk:** Medium, from May 2027.
- **Change:** Owner: accept or sign each DPA (Vercel, Supabase, Fly.io) and keep copies.
- **Status:** Owner, then Lawyer to confirm they suffice.

### 16. The Board's complaint route

- **Answer:** Rule 3(c)(iii) wants the notice to say how to complain to the Board, and s. 13(3) wants people to come to Uplink first. Privacy says both. No official Board URL could be verified: secondary sources disagree.
- **Risk:** Low. Nothing is due before May 2027.
- **Change:** Recommended: add the Board's link to Your rights once MeitY or the Board publishes it officially.
- **Status:** Recommended.

### 17. E-Commerce Rules and Intermediary Rules

- **Answer:**
  - **E-Commerce Rules: don't apply.** They cover entities that buy or sell goods or services over a digital network (CPA s. 2(16)). Uplink sells nothing and is free.
  - **Intermediary Rules: Uplink may technically be one.** IT Act s. 2(1)(w) makes anyone who stores an electronic record on behalf of another an intermediary, and that includes storing an owner's invoice files. The Rules' r. 3 due diligence is mainly the condition for the s. 79 safe harbour (r. 7), and that protection matters little for private files only their owner sees. The pages already meet most of r. 3: rules and a privacy policy, Fair use, a grievance contact.
- **Risk:** Low.
- **Change:** None.
- **Status:** Done.

### 18. Are the commitments realistic?

- **Answer:**
  - **30-day reply: keep.** It meets SPDI r. 5(9) (one month) and DPDP r. 14(3) (at most 90 days).
  - **2-day acknowledgement: optional.** No law requires it for Uplink, because the E-Commerce 48 hours don't apply. It's still a published promise, so keep it only if one person can meet it while travelling or ill. Otherwise make it "within 7 days".
  - **Delete within 30 days on shutdown: keep.** Tesla 9.3.10.2 requires it, so it isn't optional. It depends on the backup window (#22).
  - **Ask first before any new use: keep.** DPDP s. 6(1) and Tesla 9.3.7 require fresh consent for a new purpose anyway.
- **Risk:** Low.
- **Change:** None made.
- **Status:** Owner (the 2-day promise).

### 19. Is "18 or over" with no check enough?

- **Answer:** Yes, now that the age is confirmed. Rule 10 asks for measures that get a parent's verifiable consent before processing a child's data. It doesn't ask for age verification of everyone. For an adult-oriented service, a self-declaration is a proportionate measure: a Tesla account, a car and a personal invite make a child user unlikely, and Uplink doesn't target or track children. The new invite box includes "I'm 18 or over"; waitlist joiners get it with the `/agree` page (#4).
- **Risk:** Low.
- **Change:** Done (the invite box). Privacy, Age, mentions it.
- **Status:** Done.

## Issues the list missed

### 20. CERT-In Directions, 2022

- **Answer:** They cover "service providers, intermediaries, data centres, body corporate and Government organisations". They ask for listed incidents (including data breaches and unauthorised access) to be reported to CERT-In within 6 hours of noticing them, for logs of all ICT systems to be kept securely for a rolling 180 days, and for clocks synced to NTP. Whether a one-person free app is covered turns on #1 and #17; it may be. Whether logs may sit outside India (per CERT-In's FAQ) wasn't verified this time.
- **Risk:** Low to medium.
- **Change:**
  - Done: Privacy, If there's a breach, now names CERT-In.
  - Owner: keep CERT-In's incident address (incident@cert-in.org.in, per its site) in the runbook beside Tesla's and the Board's.
  - Recommended: check how long Vercel, Supabase and Fly keep logs. If CERT-In applies, add a log drain kept 180 days, holding requests only and no car data.
- **Status:** Done (page); Recommended (logs).

### 21. Backups

- **Answer:** Deleted rows stay in the database host's backups until they expire. The "within 30 days" promises (Tesla 9.3.10, Privacy, Terms) hold only if backups expire within 30 days.
- **Risk:** Low.
- **Change:** Done: Privacy says deleted data can stay in backups until they expire. Owner: confirm Supabase's backup and PITR window is 30 days or less (`docs/costs.md` lists 7, 14 or 28 days for PITR).
- **Status:** Done; Owner to confirm.

### 22. What invoice files contain

- **Answer:** The file is kept as the charging network made it, so it may show the owner's name, phone number or part of a card number. A partial card number isn't full "payment instrument details" under SPDI r. 3, but the notice should say what's in the file.
- **Risk:** Low.
- **Change:** Done: Privacy, What Uplink stores.
- **Status:** Done.

### 23. Invite records

- **Answer:** An invite holds the last 6 VIN characters and the admin's note. The note can name a friend before they've consented. Delete account cleared the joined car but left the note.
- **Risk:** Low.
- **Change:**
  - Done: `deleteUser` now clears the note as well (`lib/server/data/system.ts`, tested in `test/invites.test.ts`), and Privacy lists invite records.
  - Recommended: delete unused invites 30 days after they expire. They keep the VIN characters and note forever today, and the 6 characters can't be cleared from a used invite (NOT NULL).
  - Owner: write notes like "Blue Model Y", not names.
- **Status:** Done; Recommended (pruning).

### 24. Request logs, IP addresses and the invite cookie

- **Answer:** Privacy didn't mention that Vercel sees the user's IP address and Fly.io the car's, and both keep logs. It also left out that the invite page counts tries per IP in memory, and the invite cookie.
- **Risk:** Low.
- **Change:** Done: Privacy, Who else gets it, and the cookies line.
- **Status:** Done.

### 25. Check logs and the waitlist kept with no end date

- **Answer:** `poll_runs` (check logs) and declined or suspended `users` rows are kept until the account is deleted, with no limit. Section 8(7)(a) wants data erased once its purpose is served.
- **Risk:** Low.
- **Change:** Recommended: prune `poll_runs` older than a year in the daily retention run, which fits #3's one year.
- **Status:** Recommended.

### 26. Notice in other languages

- **Answer:** DPDP s. 5(3) and s. 6(3), from May 2027: the notice and consent request in English or any Eighth Schedule language, at the user's choice.
- **Risk:** Low.
- **Change:** Recommended: before May 2027, add a line to Privacy offering the page in any Eighth Schedule language on request, and send a translation within the 30 days.
- **Status:** Recommended.

## Requirements and how the pages meet them

### DPDP Act and Rules (from 13 May 2027)

| Requirement | Source | How it's met |
| --- | --- | --- |
| Itemised notice of the data | s. 5(1)(i); r. 3(b)(i) | Privacy: What Uplink stores, Signing in. |
| Purpose | s. 5(1)(i); r. 3(b)(ii) | Privacy: Why, How data arrives. |
| New purpose: Owners totals (other owners who share see totals across at least 5 cars) | s. 6(1), s. 6(4); Tesla 9.3.7 | Opt-in consent of its own, separate from sign-in: off by default, turned on only by the owner's "Share my car's figures" (/owners) or the Settings switch (`users.share_with_owners`, `shared_since` as the record). Withdrawn as easily: the same switch, which deletes the day rows at once and republishes the totals. Delete my data turns it off. Privacy: What Uplink stores, Why, Who else gets it, How long we keep it. |
| Withdraw as easily as consent was given | s. 5(1)(ii), s. 6(4); r. 3(c)(i) | Privacy: Withdrawing consent. Leaving the waitlist is by email (Recommended: a button on `/waitlist`). |
| Rights and complaints to the Board | s. 5(1)(ii), (iii); r. 3(c) | Privacy: Your rights. Board link pending (#16). |
| Notice to people who consented before | s. 5(2) | Recommended (#4). |
| English or an Eighth Schedule language | s. 5(3), s. 6(3) | Recommended (#26). |
| Free, specific, informed, unambiguous consent by clear affirmative action | s. 6(1) | Invite box (Done); existing users (#4). |
| Proof of consent | s. 6(10) | Recommended (#4). |
| Cease and erase on withdrawal, processors too | s. 6(6), s. 8(7) | Disconnect, Delete my data, Delete account; readings past their use go daily (`lib/telemetry-retention.ts`). |
| Keep logs a year | r. 6(1)(e), r. 8(3) | #3. |
| Security safeguards | s. 8(5); r. 6 | Privacy: Security, and /privacy/car-data. AES-256 at rest for the whole database (Supabase), AES-256-GCM tokens on top, hashed connector token, TLS, mutual TLS for the car stream, service-role-only database. Not end-to-end: the receiver decrypts to store. |
| Processor contracts | s. 8(2); r. 6(1)(f) | #15. |
| Breach: tell each person and the Board (in full within 72 hours) | s. 8(6); r. 7 | Privacy: If there's a breach (in the app; no email is held). An in-app banner for it isn't built (Recommended: a site-wide notice). |
| Contact who answers questions; repeat it in each reply | s. 8(9); r. 9 | Privacy: Grievance Officer. **Every reply to a rights request must repeat this contact.** |
| Grievance redressal, period published (at most 90 days) | s. 8(10), s. 13; r. 14(3) | 30 days. |
| How to make a request, and the identifier | r. 14(1) | Your rights asks for the VIN. Recommended: show an account number in Settings. |
| Access, correction, erasure, nomination | ss. 11, 12, 14 | Your rights. |
| Children | s. 9; r. 10 | #19. |
| Cross-border | s. 16; r. 15 | #14. |
| SDF duties, Third Schedule erasure | s. 10; r. 8(1), 13 | Don't apply: Uplink isn't notified as an SDF, and isn't an e-commerce, gaming or social media platform of the listed size. |

### IT Act and SPDI Rules (until May 2027, if they apply: #1)

| Requirement | Source | How it's met |
| --- | --- | --- |
| Privacy policy: practices, data, purpose, disclosure, security | r. 4(1) | Privacy, section by section. |
| Consent in writing for sensitive data | r. 5(1) | Invite box (#2). |
| Tell people what, why, who receives it, who keeps it | r. 5(3) | Covered, except a postal name and address (#1). |
| Not longer than needed | r. 5(4) | How long we keep it. |
| Review, correct, withdraw | r. 5(6), (7) | Your rights, Withdrawing consent. |
| Grievance Officer name, one month | r. 5(9) | Email and 30 days; no name (#1). |
| Disclosure only with permission or by law | r. 6 | Who else gets it. |
| New recipient: TypeSafe's Jev checks each AI tip (28 Oct 2026) | r. 5(3), r. 6; DPDP s. 5(1)(i), s. 8(2) | Privacy: Who else gets it names it. Jev gets the tip's text and the figures sent to the tip writer (`modelFindings`), never location, place names, VIN or account ids, through OpenRouter with `data_collection: "deny"` (`lib/server/jev.ts`). TypeSafe's country isn't published on OpenRouter, so it isn't in the "US companies" line yet (**Owner**: confirm it and add it there). Its DPA joins #15. |
| Disclosure in breach of contract | IT Act s. 72A | Sharing is only as Privacy lists. |

### Tesla Fleet API Agreement (now)

| Requirement | Section | How it's met |
| --- | --- | --- |
| Privacy policy on collection, use, storage, disclosure; consistent with Tesla's, publicly linked | 5.4, 9.3.2, 9.3.3 | Privacy is public (`proxy.ts` PUBLIC_PATHS), linked from home and every plain page, and links Tesla's Privacy Notice. |
| Explicit, prior, specific, informed opt-in | 9.3.2, 9.3.7 | #4. |
| Precise location: express opt-in and a conspicuous indicator | 9.3.5 | Opt-in: the Vehicle Location scope. Indicator: #5. |
| Users can review granted categories and revoke | 9.3.8 | Privacy points to Tesla and Settings. Recommended: list scopes in Settings (`hasScope`). |
| Honour requests; delete within 30 days, or on shutdown | 9.3.2(g), 9.3.10 | Your rights; Terms: Availability. Backups: #21. |
| No selling or passing on without a legal basis | 5.6.7 | #8, #9. |
| No stalking use | 5.6.15 | Terms: Fair use, People who drive your car. |
| No sensitive information | 9.3.6 | None collected. |
| No Tesla mark in the name, no implied endorsement | 7, 14.3, 14.4 | "Uplink"; Terms: Not Tesla; every plain page's footer. |
| Report a breach immediately; credential misuse within 48 hours | 5.5, 9.3.9 | Privacy says Uplink reports to Tesla. Timing is the operator's runbook. |
| No Tesla passwords | 5.6.23 | OAuth only. |

Uplink asks for `openid offline_access user_data vehicle_device_data vehicle_location vehicle_charging_cmds` (`lib/server/tesla.ts`). `vehicle_charging_cmds` is needed for Supercharger history and invoices (`lib/server/charging.ts`); Uplink never sends a charging command, and Privacy says so.

### Google Maps Platform (now)

| Requirement | Section | How it's met |
| --- | --- | --- |
| Terms say the app uses Google Maps, under Google's Additional Terms and Privacy Policy | 3.2.2(a) | Terms: Google Maps. |
| Attribution, unmodified | 3.2.2(b) | "Google Maps" beside each Google name (`docs/place-names.md`). |
| Users told Google gets terms, IP and coordinates | 4.4(a) | Privacy: Who else gets it. |
| No personally identifiable information to Google | 4.4(c)(ii) | Coordinates and the typed search only, server side, no account or VIN (#8). |
| Location only with prior, revocable consent; no caching | 4.4(c)(iii); service terms 6.2, 14.2 | Only when the owner opens Name this place; only the place ID is stored. |

## What changed in this review

Pages:

- Privacy, Signing in: the invite's consent box comes first.
- Privacy, What Uplink stores: what invoice files may show; invite records.
- Privacy, the cookies line: the invite cookie.
- Privacy, Who else gets it: Nominatim gets a rounded spot; Vercel and Fly see IP addresses and keep logs; the invite page counts tries per IP in memory.
- Privacy, How long we keep it: backups.
- Privacy, Deleting your data: what Delete account does to an invite.
- Privacy, Your rights: drivers can write too.
- Privacy, If there's a breach: CERT-In.
- Privacy, Age: the invite asks you to confirm.
- Terms, Agreeing: signing in, and on an invite ticking its box.
- Terms, Liability: except fraud or wilful misconduct.
- Privacy, Who else gets it (28 Oct 2026): TypeSafe's Jev, through OpenRouter, checks each tip's text and the figures behind it.

Code:

- `app/invite/[token]/page.tsx`, `invite-sign-in.tsx`, `actions.ts`: a short notice and a required "I'm 18 or over, and I agree to the Terms and the Privacy page" box, checked again by `startInviteSignIn`.
- `lib/server/data/system.ts` `deleteUser`: also clears the invite's admin note. Test in `test/invites.test.ts`.
- `lib/server/place-names.ts`: Nominatim gets the spot rounded to 3 decimals. `docs/place-names.md` updated.

The earlier review's corrections (Supercharger invoices streamed, not stored; third-party invoices; the retention periods; Delete account; shared cars; the recipient list; Mumbai hosting; area names; the 6-hour check's location not stored) still hold and were rechecked against the code.

## Open work, in order

1. **Location indicator** (#5): Tesla contract, now.
2. **Consent for existing users and a consent record** (#4): Tesla contract now, DPDP from May 2027.
3. **Scopes listed in Settings**, with a link to revoke in the Tesla account (Tesla 9.3.8).
4. **Processor DPAs** accepted and filed (#15); backup window confirmed (#21).
5. **Minimum count in rollout states** (#10).
6. **Processing log kept a year**, after a lawyer confirms the scope (#3); prune `poll_runs` (#25) and old invites (#23).
7. **Leave the waitlist** button on `/waitlist`; an account number in Settings (r. 14(1)); an in-app breach banner.
8. **Board link** when official (#16); **language offer** (#26); **court city** (#13).
