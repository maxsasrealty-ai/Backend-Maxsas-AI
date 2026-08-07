export enum LeadBucket {
  Qualified = "Qualified",
  Neutral = "Neutral",
  Retry = "Retry",
  Failed = "Failed",
  Unknown = "Unknown",
}

export const DEFAULT_LEAD_OUTCOME_MAPPING: Record<string, LeadBucket> = {
  // Qualified
  qualified_lead_buy: LeadBucket.Qualified,
  site_visit_scheduled: LeadBucket.Qualified,
  advisor_callback_scheduled: LeadBucket.Qualified,

  // Neutral
  details_requested: LeadBucket.Neutral,
  budget_not_decided: LeadBucket.Neutral,
  timeline_long_term: LeadBucket.Neutral,
  already_purchased: LeadBucket.Neutral,

  // Retry
  busy_line: LeadBucket.Retry,
  user_no_response: LeadBucket.Retry,
  not_available_callback_requested: LeadBucket.Retry,

  // Failed
  call_failed: LeadBucket.Failed,
  invalid_number: LeadBucket.Failed,
  voicemail_detected: LeadBucket.Failed,
  wrong_person: LeadBucket.Failed,
  not_interested: LeadBucket.Failed,
};

export function computeLeadBucket(rawOutcome?: string | null): LeadBucket | null {
  if (!rawOutcome || typeof rawOutcome !== "string") return null;
  const key = rawOutcome.trim().toLowerCase();
  return DEFAULT_LEAD_OUTCOME_MAPPING[key] ?? LeadBucket.Unknown;
}

export default {
  LeadBucket,
  DEFAULT_LEAD_OUTCOME_MAPPING,
  computeLeadBucket,
};
