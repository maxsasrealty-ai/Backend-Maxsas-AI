# VPS Agent Integration

Use these values in /root/ai-voice-system/agent/agent.py or its environment file.

## Environment Variables (Required)
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`: LiveKit server connection
- `SIP_OUTBOUND_TRUNK_ID` or `LIVEKIT_OUTBOUND_TRUNK_ID`: Outbound SIP trunk (either is accepted)
- `VOICE_WEBHOOK_BEARER_TOKEN`: Secret for webhook authentication
- `VOICE_WEBHOOK_PUBLIC_URL` (optional): Used to generate webhook URLs; falls back to `API_BASE_URL` if not set
- `VOICE_TEST_MODE`, `BILLING_BYPASS`: Enable test mode or bypass billing (for development)

## Required webhook URLs
Webhook URLs are auto-generated as:
- Voice events webhook: `{VOICE_WEBHOOK_PUBLIC_URL or API_BASE_URL}/api/webhooks/voice/events`
- Agent logs webhook: `{VOICE_WEBHOOK_PUBLIC_URL or API_BASE_URL}/api/webhooks/voice/agent-logs`
Set VOICE_WEBHOOK_PUBLIC_URL in your environment to override the default.

## Required auth
- Authorization header: `Bearer {VOICE_WEBHOOK_BEARER_TOKEN}` (required for all webhooks)
- Optional: `x-event-id` header for idempotency (unique per event)

## Dispatch metadata
Backend dispatch sends the following metadata fields for agent runtime:
- `webhookUrl`: Voice events webhook URL
- `logsWebhookUrl`: Agent logs webhook URL
- `webhookAuthToken`: Bearer token for webhook auth
- `callId`: Unique call identifier
- `tenantId`: Workspace/tenant identifier

## Example payload for logs forwarding
POST /api/webhooks/voice/agent-logs
```json
{
  "tenant_id": "lexus-demo",
  "call_id": "<call-id>",
  "room_id": "<room-id>",
  "level": "info",
  "message": "agent started stream",
  "occurred_at": "2026-04-05T15:30:00.000Z",
  "meta": { "provider": "livekit" }
}
```

## SIP trunk
Set either `SIP_OUTBOUND_TRUNK_ID` or `LIVEKIT_OUTBOUND_TRUNK_ID` in your environment. The backend will use whichever is set. Ensure this matches your active trunk in LiveKit or SIP provider.

---

### Developer Notes
- Webhook endpoints require raw JSON body (see backend/src/index.ts)
- Test mode and billing bypass can be enabled for development via env vars
- All webhook URLs and tokens are managed via environment variables for flexibility
