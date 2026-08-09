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