#!/usr/bin/env node

/**
 * Voice Events Full Integration Test
 * 
 * Simulates a complete call lifecycle:
 * 1. call_started → call_ringing → call_connected → call_active
 * 2. call_transcript_final → lead_extracted (optional)
 * 3. call_analysis_completed → call_completed
 * 
 * Usage:
 *   node scripts/test-voice-events-integration.mjs
 * 
 * Environment:
 *   BACKEND_URL=http://localhost:4000 (default)
 *   WEBHOOK_TOKEN=<bearer_token> (required)
 *   TENANT_ID=<uuid> (required)
 */

import { randomUUID } from 'crypto';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN || 'dev_secret_token_livekit_99';
const TENANT_ID = process.env.TENANT_ID || '709b47b6-1dc4-439d-872c-3625fae2374f';

const callId = randomUUID();
const roomId = `test-room-${Date.now()}`;
const phoneNumber = '+918882453059';
const agentName = 'maxsas-voice-agent-prod';

// Helper to send webhook event
async function sendWebhookEvent(eventType, payload, occurredAt = new Date().toISOString()) {
  const eventId = randomUUID();
  const envelope = {
    event_id: eventId,
    event_type: eventType,
    tenant_id: TENANT_ID,
    call_id: callId,
    room_id: roomId,
    occurred_at: occurredAt,
    payload,
  };

  console.log(`\n[${eventType}]`);
  console.log(`  Event ID: ${eventId}`);
  console.log(`  Occurred: ${occurredAt}`);

  try {
    const response = await fetch(`${BACKEND_URL}/api/webhooks/voice/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${WEBHOOK_TOKEN}`,
        'X-Event-Id': eventId,
        'X-Call-Id': callId,
        'X-Occurred-At': occurredAt,
      },
      body: JSON.stringify(envelope),
    });

    const result = await response.json();

    if (response.ok) {
      console.log(`  ✓ Accepted`);
      if (result.data) {
        console.log(`    Tenant: ${result.data.tenantId}`);
        console.log(`    Call: ${result.data.callId}`);
      }
    } else {
      console.error(`  ✗ Failed: ${response.status}`);
      console.error(`    ${JSON.stringify(result, null, 2)}`);
    }

    return response.ok;
  } catch (err) {
    console.error(`  ✗ Error: ${err.message}`);
    return false;
  }
}

// Test sequence
async function runFullCallFlow() {
  console.log('='.repeat(60));
  console.log('Voice Events Integration Test');
  console.log('='.repeat(60));
  console.log(`Call ID: ${callId}`);
  console.log(`Room ID: ${roomId}`);
  console.log(`Tenant: ${TENANT_ID}`);
  console.log(`Backend: ${BACKEND_URL}`);
  console.log('='.repeat(60));

  const baseTime = new Date();
  let eventCount = 0;

  // 1. call_started
  const startTime = new Date(baseTime.getTime() + 0);
  if (await sendWebhookEvent('call_started', {
    phone_number: phoneNumber,
    agent_name: agentName,
    direction: 'outbound',
    status: 'started',
  }, startTime.toISOString())) {
    eventCount++;
  }

  // Wait before next event
  await new Promise(r => setTimeout(r, 500));

  // 2. call_ringing
  const ringTime = new Date(baseTime.getTime() + 1000);
  if (await sendWebhookEvent('call_ringing', {
    status: 'call_ringing',
    direction: 'outbound',
    agent_name: agentName,
    phone_number: phoneNumber,
  }, ringTime.toISOString())) {
    eventCount++;
  }

  await new Promise(r => setTimeout(r, 500));

  // 3. call_connected
  const connectedTime = new Date(baseTime.getTime() + 3000);
  if (await sendWebhookEvent('call_connected', {
    status: 'call_connected',
    direction: 'outbound',
    agent_name: agentName,
    participant_identity: `sip-${callId}`,
  }, connectedTime.toISOString())) {
    eventCount++;
  }

  await new Promise(r => setTimeout(r, 500));

  // 4. call_active
  const activeTime = new Date(baseTime.getTime() + 4000);
  if (await sendWebhookEvent('call_active', {
    status: 'call_active',
    direction: 'outbound',
    agent_name: agentName,
  }, activeTime.toISOString())) {
    eventCount++;
  }

  await new Promise(r => setTimeout(r, 500));

  // 5. call_transcript_final
  const transcriptTime = new Date(baseTime.getTime() + 240000); // 4 min into call
  if (await sendWebhookEvent('call_transcript_final', {
    turns: [
      {
        speaker: 'agent',
        text: "Hello! I'm calling about a real estate opportunity in Bangalore.",
        sequenceNo: 1,
      },
      {
        speaker: 'person',
        text: "Yes, I'm interested. Tell me more about the project.",
        sequenceNo: 2,
      },
      {
        speaker: 'agent',
        text: 'Great! We have a 3 BHK apartment available in Whitefield.',
        sequenceNo: 3,
      },
      {
        speaker: 'person',
        text: "What's the budget?",
        sequenceNo: 4,
      },
      {
        speaker: 'agent',
        text: 'Between 80 lakhs and 1.2 crores. Would you like to schedule a site visit?',
        sequenceNo: 5,
      },
      {
        speaker: 'person',
        text: 'Yes, sounds good. Call me back next week.',
        sequenceNo: 6,
      },
    ],
    transcript_turns: 6,
  }, transcriptTime.toISOString())) {
    eventCount++;
  }

  await new Promise(r => setTimeout(r, 500));

  // 6. lead_extracted (optional)
  const leadTime = new Date(baseTime.getTime() + 241000);
  if (await sendWebhookEvent('lead_extracted', {
    property_type: 'apartment',
    preferred_location: 'Whitefield, Bangalore',
    budget_range: '80L - 1.2Cr',
    purchase_timeline: '3-6 months',
    confidence: {
      overall: 0.92,
      threshold: 0.75,
      attempt: 1,
    },
  }, leadTime.toISOString())) {
    eventCount++;
  }

  await new Promise(r => setTimeout(r, 500));

  // 7. call_analysis_completed (CRITICAL - CRM record)
  const analysisTime = new Date(baseTime.getTime() + 242000);
  if (await sendWebhookEvent('call_analysis_completed', {
    call_id: callId,
    started_at: startTime.toISOString(),
    duration_sec: 242,
    status: 'completed',
    lead: {
      property_type: 'apartment',
      location: 'Whitefield, Bangalore',
      budget: '80L - 1.2Cr',
      timeline: 'short_term',
    },
    call_outcome: 'qualified_lead_buy',
    confidence: 0.89,
  }, analysisTime.toISOString())) {
    eventCount++;
  }

  await new Promise(r => setTimeout(r, 500));

  // 8. call_completed (success path)
  const completeTime = new Date(baseTime.getTime() + 245000);
  if (await sendWebhookEvent('call_completed', {
    status: 'completed',
    ended_by: 'participant_disconnected',
    duration_sec: 245,
    transcript_turns: 6,
    recording_url: null,
  }, completeTime.toISOString())) {
    eventCount++;
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Test Complete: ${eventCount}/8 events accepted`);
  console.log('='.repeat(60));

  if (eventCount === 8) {
    console.log('\n✓ Full call lifecycle simulated successfully!');
    console.log('\nNext steps:');
    console.log('  1. Check database for CallSession, CallEvent, LeadExtraction records');
    console.log('  2. Verify call_analysis_completed populated callOutcome and confidence');
    console.log('  3. Connect frontend to SSE stream to see real-time events');
    console.log(`  4. Stream URL: ${BACKEND_URL}/api/realtime/calls/stream?tenantId=${TENANT_ID}`);
  } else {
    console.log(`\n✗ Only ${eventCount}/8 events accepted. Check errors above.`);
    process.exit(1);
  }
}

// Also test failure path
async function runFailureFlow() {
  console.log('\n' + '='.repeat(60));
  console.log('Testing Failure Path (call_failed)');
  console.log('='.repeat(60));

  const failureCallId = randomUUID();
  const failureRoomId = `test-failure-${Date.now()}`;
  const baseTime = new Date();

  // call_started
  await sendWebhookEvent(
    'call_started',
    {
      phone_number: '+9199999999',
      agent_name: agentName,
      direction: 'outbound',
      status: 'started',
    },
    new Date(baseTime.getTime() + 0).toISOString()
  );

  await new Promise(r => setTimeout(r, 500));

  // call_failed
  await sendWebhookEvent(
    'call_failed',
    {
      status: 'failed',
      error: 'Max duration timeout exceeded (30m limit)',
      stage: 'runtime_max_duration',
      retryable: false,
    },
    new Date(baseTime.getTime() + 1800000).toISOString() // 30 min later
  );

  console.log('✓ Failure path tested');
}

// Main
async function main() {
  try {
    await runFullCallFlow();
    await runFailureFlow();
  } catch (err) {
    console.error('\n✗ Test failed:', err);
    process.exit(1);
  }
}

main();
