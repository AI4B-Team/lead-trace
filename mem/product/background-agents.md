---
name: Background agents governance
description: Rules for the P5.8 background agents — flag-only default, proposal approval, and hard guardrails agents may never touch
type: feature
---
Background agents (Conversation Labeler, Lead Scout, Hot-Lead Scorer, Booking Auditor, Coach, Wisdom Miner) live at `/app/background-agents`.

- Every agent ships in **Flag Only** mode. Never default an agent to `active` on an existing workspace.
- Coach and Wisdom Miner propose only — they have no active mode.
- Nothing an agent suggests applies itself; it lands in `agent_proposals` and a person approves it.
- Agents may never write to compliance/DNC/suppression/scrub/coverage tables, nor change send-permission fields (quiet hours, messaging mode, opt-out copy, scrub status). Enforced in `src/lib/agents/guardrails.ts`.
- Guardrail lists (escalation triggers, banned topics, handoff patterns) are additive-only: a proposal that removes an entry is rejected before it is stored.
- The Conversation Labeler is read-only and deterministic; a thread it can't categorise is recorded as `unclear` and flagged, never guessed.
- "Distressed" is its own sentiment value, not a synonym for negative.
- 3 consecutive failures disables an agent until an operator resets its mode.
- The Lead Scout nominates only: every candidate lands in the proposal queue as a `lead_nomination` with a score and plain-language reasons. It never sends, never enrols a lead in a campaign and never changes lead state.
- The Scout skips suppressed/opted-out phones, landlines, terminal dispositions and outcomes, leads already in an active sequence, live conversations (a reply with no recorded outcome belongs to a human), and anything touched in the last 4 days.
- Lead scoring runs on named signals with weights (`DEFAULT_SIGNAL_WEIGHTS` in `scout.shared.ts`). The Hot-Lead Scorer refits those weights weekly from the workspace's own labeled conversations using conversion-rate lift, clamped to half/double the default, and refuses to fit below 40 conversations / 5 conversions / 12 examples per signal — it says "not enough history" instead of guessing.
- A weight refit always lands as a `scorer_weights` proposal. Approving it applies the weighting; in active mode the Scorer applies its own weighting and still files the proposal as the audit trail.
## Coach (P5.8.5) — proposals only, permanently

Reads labeled conversations from the last 60 days, groups them by the bot profile
that drove them (older threads without a recorded profile fall to the workspace
default rather than being dropped), and drafts specific wording edits.

Rules baked into `src/lib/agents/coach.shared.ts`:
- A pattern needs at least 4 separate conversations before anything is drafted.
- Drafts are additive only: objection answers, FAQs, and escalation triggers are
  appended; nothing existing is ever removed.
- The opener is only touched when at least 20 conversations ran and 70%+ ended in
  no reply or a flat no, and the draft is the operator's own first two sentences.
- Every draft carries the thread keys and counts behind it.

Application path: the Coach never writes to `bot_profiles`. Approval in
`reviewAgentProposal` applies the field and records a `bot_profile_versions`
snapshot with `change_source = agent_proposal`, the proposal id, and the
approving user — so "what was the bot told to say on this date, and who signed it
off?" is answerable from one query. The Coach and Wisdom Miner have no active
mode, enforced in `assertModeAllowed`.

## Wisdom Miner (P5.8.6) — proposals only, permanently

Watches for human takeovers: an outbound SMS sent by a person (not the bot) in a
thread the bot had been driving. The inbound message immediately before it is
what they were answering. Those two lines become a candidate objection entry
(`trigger` = the question, `approved_response` = the operator's exact words).

Rules, all enforced in `wisdom.shared.ts` and unit-tested:
- Additive only. Existing objections and FAQs are never removed or rewritten.
- Thrown away: threads labeled `opted_out` / `hostile` / `wrong_person` /
  `complaint`; replies answered more than 24h after the question; replies under
  40 chars or 8 words; replies over 600 chars.
- Thrown away as `personal_detail`: anything containing a phone number, email,
  link, 7+ digit run, a specific dollar figure, a street address, a weekday, a
  clock time, or a personal commitment ("I'll swing by"). A one-off reply about
  one property is not standing wording.
- Same question answered several times: one proposal, keeping the fullest reply,
  with every thread key listed as evidence.
- Duplicates suppressed against existing wording and pending proposals.

Capture lands on the workspace default profile. Approval goes through the review
queue only, which snapshots a new `bot_profile_versions` row carrying the
proposal id and the approver — so wording on any date is reconstructable.

## Booking Auditor (P5.8.4) — flags only

Audits every thread currently marked "Appointment Set" plus every conversation
the Labeler recorded as `booked` in the last 14 days. It never changes a status,
cancels, reschedules, or replies — a booking stays exactly as recorded until a
person decides.

Issues it raises, worst first: `cancelled_after_booking`, `time_mismatch`,
`no_lead_confirmation` / `bot_assumed_yes`, `no_time_agreed`,
`stale_no_confirmation` (48h marked with no confirmation).

Rules in `booking.shared.ts`, unit-tested: the lead's last named day/time counts
only when it is not a question, so "could you do 5pm instead?" is not agreement;
a cancel counts only when it lands after the last confirmation; capped at 25
flags per run so the queue stays readable.
