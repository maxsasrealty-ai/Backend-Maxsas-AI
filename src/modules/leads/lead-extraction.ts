export interface LeadSignals {
  summary: string;
  intent: string | null;
  propertyType: string | null;
  location: string | null;
  budget: string | null;
  timeline: string | null;
  phoneNumber: string | null;
}

const propertyKeywords = ["apartment", "villa", "plot", "office", "shop", "flat"];
const intentKeywords = ["buy", "purchase", "rent", "lease", "invest"];
const timelineRegex = /(immediately|this month|next month|[0-9]+\s*(day|days|week|weeks|month|months))/i;
const budgetRegex = /(?:rs\.?|inr|rupees)?\s?([0-9]+(?:\.[0-9]+)?\s?(?:lakh|lac|crore|cr|k)?)/i;
const phoneRegex = /(\+?[0-9]{10,15})/;
const locationRegex = /(?:in|at|near)\s+([a-zA-Z\s]{3,40})/i;

export function extractLeadSignals(transcript: string): LeadSignals {
  const safeText = transcript.trim();
  const lower = safeText.toLowerCase();

  const propertyType = propertyKeywords.find((keyword) => lower.includes(keyword)) || null;
  const intent = intentKeywords.find((keyword) => lower.includes(keyword)) || null;
  const location = safeText.match(locationRegex)?.[1]?.trim() || null;
  const budget = safeText.match(budgetRegex)?.[1]?.trim() || null;
  const timeline = safeText.match(timelineRegex)?.[1]?.trim() || null;
  const phoneNumber = safeText.match(phoneRegex)?.[1] || null;

  const condensed = safeText.length > 220 ? `${safeText.slice(0, 220)}...` : safeText;

  return {
    summary: condensed || "No transcript content available",
    intent,
    propertyType,
    location,
    budget,
    timeline,
    phoneNumber,
  };
}
