Goal
- Update UI to show both raw CRM outcome and derived `lead_bucket` across Calls list, Call detail, and Master Control. Provide SSE handling and tab behavior.

Prompt for Copilot (frontend developer)
--------------------------------------
You are implementing UI wiring for lead classification. The backend now provides two fields on call objects: `raw_call_outcome` (string|null) and `lead_bucket` (one of "Qualified","Neutral","Retry","Failed","Unknown" or null).

Requirements
- Calls List: show a small chip for `lead_bucket` next to each row; if null show "—". Provide ability to sort/filter by `lead_bucket` (the backend currently computes on-read; if filtering server-side is added later, queries will accept `leadBucket` param).
- Call Detail: show `raw_call_outcome` as a small badge with tooltip showing full raw label and confidence when available. Show `lead_bucket` prominently as the business label.
- SSE / Realtime: admin SSE now emits events with `raw_call_outcome` and `lead_bucket` where applicable. On SSE update, update row and open detail view accordingly.
- Tabs: Master Control / Calls tabs should map `lead_bucket` to four buckets/tabs: "Qualified", "Neutral", "Failed", "Retry". A fifth "All" tab is optional and maps to any non-null value.

Implementation hints
- Use existing CallSummary/CallDetail shapes. The new fields are optional — be defensive.
- For chips use color mapping: Qualified=green, Neutral=gray, Retry=amber, Failed=red, Unknown=muted.
- For SSE updates, merge incoming `callId` updates into the list and the detail if open (do not re-fetch detail unless critical fields change).

Testing
- Add unit tests for render states with `raw_call_outcome` present/absent and SSE updates.
