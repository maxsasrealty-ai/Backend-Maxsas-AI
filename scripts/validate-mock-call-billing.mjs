#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const pattern = /^mock_call_billing_.*\.sql$/;
const files = fs.readdirSync(process.cwd()).filter(f=>pattern.test(f)).sort();
if (!files.length) {
  console.error('No generated SQL files found. Run generate-mock-call-billing.mjs first.');
  process.exit(2);
}
const file = files[files.length-1];
const txt = fs.readFileSync(path.join(process.cwd(), file), 'utf8');

const nonBillableSet = new Set(['voicemail_detected','busy_line','invalid_number','user_no_response','wrong_person','call_failed','not_available_callback_requested']);

const re = /INSERT INTO "CallBillingTransaction" \(([^)]+)\) VALUES \(([^)]+)\);/g;
let m;
let errors = 0;
while ((m = re.exec(txt)) !== null){
  const cols = m[1].split(',').map(s=>s.trim().replace(/"/g,''));
  const vals = m[2].split(/,(?=(?:[^']*'[^']*')*[^']*$)/).map(s=>s.trim());
  const row = {};
  cols.forEach((c,i)=> row[c]=vals[i]);

  const metaJsonRaw = row['transactionMetaJson'];
  const meta = JSON.parse(metaJsonRaw.replace(/^'|'$/g, '').replace(/''/g, "'"));
  const outcome = meta.outcome;
  const duration = Number(meta.duration);
  const billedMinutes = Number(row['billedMinutes']);
  const perMinute = Number(row['perMinuteRatePaise']);
  const debit = Number(row['debitAmountPaise']);

  const expectedBilled = Math.ceil(Math.max(0,duration)/60);
  const expectedDebit = nonBillableSet.has(outcome) || expectedBilled===0 ? 0 : expectedBilled * perMinute;

  if (billedMinutes !== expectedBilled){
    console.error(`Billed minutes mismatch for call ${row.callId}: got ${billedMinutes}, expected ${expectedBilled}`);
    errors++;
  }
  if (debit !== expectedDebit){
    console.error(`Debit amount mismatch for call ${row.callId}: got ${debit}, expected ${expectedDebit}`);
    errors++;
  }
}

if (errors===0) {
  console.log('Validation passed: all CallBillingTransaction rows match rules.');
  process.exit(0);
} else {
  console.error('Validation failed with', errors, 'errors.');
  process.exit(3);
}
