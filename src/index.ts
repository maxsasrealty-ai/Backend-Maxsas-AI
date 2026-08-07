import { config as loadEnvFile } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

loadEnvFile({ path: path.join(rootDir, ".env"), override: false });
loadEnvFile({ path: path.join(rootDir, ".env.local"), override: true });

if (process.env.DATABASE_URL?.startsWith("file:")) {
  delete process.env.DATABASE_URL;
  loadEnvFile({ path: path.join(rootDir, ".env"), override: true });
}

const [
  { default: app },
  { config },
  { ensureDevAuthUser },
  { logger },
  { startOutboundCallWorker },
  { startAccountDeletionSweeper },
  { startWebhookBridge },
  { default: webinarRoutes }
] = await Promise.all([
  import("./app"),
  import("./lib/config"),
  import("./lib/dev-auth"),
  import("./lib/logger"),
  import("./queue/worker"),
  import("./services/accountDeletionService"),
  import("./services/webhookBridgeService"),
  import("./routes/webinar")
]);

const port = Number(config.PORT || 4000);

// Telephony Environment Verification Logging
const tkUrl = process.env.LIVEKIT_URL ? "Set" : "Missing";
const tkKey = process.env.LIVEKIT_API_KEY ? "Set" : "Missing";
const tkSecret = process.env.LIVEKIT_API_SECRET ? "Set" : "Missing";
const tkTrunk = (process.env.SIP_OUTBOUND_TRUNK_ID || process.env.LIVEKIT_OUTBOUND_TRUNK_ID) ? "Set" : "Missing";

logger.info("Telephony environment check", {
  livekitUrl: tkUrl,
  livekitApiKey: tkKey,
  livekitApiSecret: tkSecret,
  trunkId: tkTrunk,
  agentName: config.LIVEKIT_AGENT_NAME,
  appEnv: config.APP_ENV,
  voiceTestMode: config.isTestMode,
  billingBypass: config.isBillingBypass,
});

if (config.startupWarnings.length > 0) {
  logger.warn("Local safety warnings", {
    warnings: config.startupWarnings,
    databaseTarget: config.databaseTarget,
    redisTarget: config.redisTarget,
    localSafetyMode: config.isLocalSafetyMode,
    allowDangerousLocalSideEffects: config.allowDangerousLocalSideEffects,
  });
}

if (process.env.NODE_ENV !== "test") {
  void (async () => {
    await startOutboundCallWorker();
    app.listen(port, () => {
      logger.info("Backend listening", { port });
      startAccountDeletionSweeper();
      startWebhookBridge(port);
      void ensureDevAuthUser().catch((error) => {
        logger.warn("Dev auth seed failed", {
          message: error instanceof Error ? error.message : String(error),
        });
      });
    });
  })();
}