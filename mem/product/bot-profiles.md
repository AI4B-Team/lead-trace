---
name: Template-scoped bot profiles
description: Conversation profiles per lead source/record type — resolution order, additive-only guardrails, and the sender-identity boundary
type: feature
---
The AI agent's persona is per lead SOURCE, not per workspace. `bot_profiles` is scoped by `template_id` + optional `record_type`.

Resolution order (first hit wins, no generic fallback — unresolved is an error/handoff):
1. workspace profile matching template + record_type
2. workspace profile matching template, record_type null
3. workspace `is_default` profile
4. platform default (`workspace_id IS NULL`)

Hard rules:
- Profiles change WHAT the agent says, never which number or 10DLC brand it sends from. Never touch number provisioning, brand registration, or assertCanText for profile work.
- Platform guardrails (HANDOFF_PATTERNS, regulated regexes, banned-output filter, opt-out interception) always run first and cannot be relaxed. A profile's escalation_triggers / banned_topics are additive only.
- Prompt order: platform guardrails → profile persona → record context → history. Record/case facts outrank profile copy on matters of fact.
- Categorical escalation always hands off: real estate (legal, tax, title, the specific court process), insurance (coverage, underwriting, eligibility), home services (binding quotes, warranty, code compliance).
