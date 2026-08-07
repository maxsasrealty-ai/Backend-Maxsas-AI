import assert from "node:assert/strict";

import { buildLeadUploadPreview } from "../src/modules/leads/lead-upload.pipeline";

type Case = {
  label: string;
  phone: string;
  expectedStatus: "valid" | "invalid" | "ambiguous";
  expectedPhone?: string;
};

const cases: Case[] = [
  { label: "plain valid", phone: "7856895680", expectedStatus: "valid", expectedPhone: "+917856895680" },
  { label: "with plus91 spaces", phone: "+91 7856895680", expectedStatus: "valid", expectedPhone: "+917856895680" },
  { label: "with letters", phone: "+91 a 7856895680", expectedStatus: "valid", expectedPhone: "+917856895680" },
  { label: "with dash", phone: "91-7856895680", expectedStatus: "valid", expectedPhone: "+917856895680" },
  { label: "with brackets", phone: "(+91) 78568 95680", expectedStatus: "valid", expectedPhone: "+917856895680" },
  { label: "leading zero", phone: "07856895680", expectedStatus: "valid", expectedPhone: "+917856895680" },
  { label: "leading 0091", phone: "0091 7856895680", expectedStatus: "valid", expectedPhone: "+917856895680" },
  { label: "prefix text", phone: "mob: 7856895680", expectedStatus: "valid", expectedPhone: "+917856895680" },
  { label: "ext suffix", phone: "call me at +91-78568-95680 ext 12", expectedStatus: "valid", expectedPhone: "+917856895680" },
  { label: "inside alpha", phone: "abc7856895680xyz", expectedStatus: "valid", expectedPhone: "+917856895680" },
  { label: "all repeated", phone: "9999999999", expectedStatus: "invalid" },
  { label: "ascending fake", phone: "6789012345", expectedStatus: "invalid" },
  { label: "descending fake", phone: "9876543210", expectedStatus: "invalid" },
  { label: "too short", phone: "78568956", expectedStatus: "invalid" },
  { label: "empty", phone: "", expectedStatus: "invalid" },
  { label: "landline style", phone: "0221234567", expectedStatus: "invalid" },
  { label: "11 digits noisy but recoverable", phone: "89788979878", expectedStatus: "valid" },
  { label: "multiple valid numbers", phone: "7856895680 / 9876123456", expectedStatus: "ambiguous" },
  { label: "valid then ext", phone: "7856895680x44", expectedStatus: "valid", expectedPhone: "+917856895680" },
  { label: "double zero random", phone: "007856895680", expectedStatus: "invalid" },
  { label: "dot separated", phone: "78.56.89.56.80", expectedStatus: "valid", expectedPhone: "+917856895680" },
  { label: "spaces between all", phone: "7 8 5 6 8 9 5 6 8 0", expectedStatus: "valid", expectedPhone: "+917856895680" },
  { label: "comma noise", phone: "+91,78568,95680", expectedStatus: "valid", expectedPhone: "+917856895680" },
  { label: "prefix sentence", phone: "reach me tomorrow at 7856895680", expectedStatus: "valid", expectedPhone: "+917856895680" },
  { label: "two long groups ambiguous", phone: "00917856895680 and 00919876123456", expectedStatus: "ambiguous" },
  { label: "non digit garbage", phone: "not available", expectedStatus: "invalid" },
  { label: "valid with tab", phone: "\t+91\t7856895680\t", expectedStatus: "valid", expectedPhone: "+917856895680" },
  { label: "0 prefix + extra chars", phone: "0-78568-95680 abc", expectedStatus: "valid", expectedPhone: "+917856895680" },
  { label: "contains two 10d one invalid one valid", phone: "1234567890 and 7856895680", expectedStatus: "valid", expectedPhone: "+917856895680" },
  { label: "14 digit with 0091", phone: "00917856895680", expectedStatus: "valid", expectedPhone: "+917856895680" },
  { label: "12 digit with 91", phone: "917856895680", expectedStatus: "valid", expectedPhone: "+917856895680" },
  { label: "11 digit with 0", phone: "07856895680", expectedStatus: "valid", expectedPhone: "+917856895680" },
  { label: "multiple with phone column hint", phone: "primary: 7856895680 backup: 9765432109", expectedStatus: "ambiguous" },
];

let passed = 0;

for (const testCase of cases) {
  const result = buildLeadUploadPreview({
    rows: [
      {
        name: "Test",
        phone: testCase.phone,
        email: "user@example.com",
      },
    ],
  });

  if (testCase.expectedStatus === "valid") {
    const item = result.preview[0];
    assert.ok(item, `failed: ${testCase.label} (missing preview item)`);
    assert.equal(item.phoneStatus, "valid", `failed: ${testCase.label} (status)`);
    if (testCase.expectedPhone) {
      assert.equal(item.normalizedPhoneE164, testCase.expectedPhone, `failed: ${testCase.label} (phone)`);
    }
  } else {
    assert.equal(result.validRows, 0, `failed: ${testCase.label} (should not be valid)`);
    assert.ok(result.rejected.length > 0, `failed: ${testCase.label} (missing rejection)`);
    if (testCase.expectedStatus === "ambiguous") {
      assert.ok(
        result.rejected[0].reason.includes("multiple_valid_phone_candidates"),
        `failed: ${testCase.label} (reason)`
      );
    }
  }

  passed += 1;
}

const duplicateCheck = buildLeadUploadPreview({
  rows: [
    { name: "A", phone: "7856895680", email: "a@example.com" },
    { name: "A Better", phone: "+91 7856895680", email: "a@example.com", company: "X" },
    { name: "B", phone: "9876123456", email: "b@example.com" },
  ],
});

assert.equal(duplicateCheck.validRows, 2, "dedupe should keep only best unique rows");
assert.equal(duplicateCheck.duplicateRows, 1, "duplicate count should be 1");

const csvCheck = buildLeadUploadPreview({
  csvText: "Name,Mobile,Email\nRahul,+91 7856895680,rahul@example.com\nBad,12345,bad@example.com",
});

assert.equal(csvCheck.totalRows, 2, "csv parser should read two rows");
assert.equal(csvCheck.validRows, 1, "csv parser should produce one valid row");

console.log(`[lead-normalization] passed ${passed} edge cases + dedupe + csv parser checks`);
