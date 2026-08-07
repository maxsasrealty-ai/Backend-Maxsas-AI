import { computeLeadBucket, LeadBucket } from "../../shared/leadOutcome";
import assert from "assert";

function run() {
  const cases: Array<{ in: string | null; out: LeadBucket | null }> = [
    { in: "qualified_lead_buy", out: LeadBucket.Qualified },
    { in: "site_visit_scheduled", out: LeadBucket.Qualified },
    { in: "details_requested", out: LeadBucket.Neutral },
    { in: "busy_line", out: LeadBucket.Retry },
    { in: "invalid_number", out: LeadBucket.Failed },
    { in: "SOME_UNKNOWN_LABEL", out: LeadBucket.Unknown },
    { in: null, out: null },
  ];

  cases.forEach((c) => {
    const got = computeLeadBucket(c.in as string | null);
    assert.strictEqual(got, c.out, `input=${String(c.in)} expected=${String(c.out)} got=${String(got)}`);
  });

  console.log("leadOutcome tests passed");
}

if (require.main === module) {
  run();
}
