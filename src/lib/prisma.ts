import { PrismaClient } from "../generated/prisma";
import { config } from "./config";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

const connectRetries = Number(process.env.PRISMA_CONNECT_RETRIES ?? "5");
const retryDelayMs = Number(process.env.PRISMA_CONNECT_RETRY_DELAY_MS ?? "2000");

if (config.isLocalSafetyMode && !config.allowDangerousLocalSideEffects && config.databaseTarget !== "local") {
  console.warn("[prisma] local safety mode is enabled while DATABASE_URL targets a remote database", {
    databaseTarget: config.databaseTarget,
  });
}

async function connectWithRetry(): Promise<void> {
  for (let attempt = 1; attempt <= connectRetries; attempt += 1) {
    try {
      await prisma.$connect();
      console.info("[prisma] database connection ready");
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[prisma] database connection failed", {
        attempt,
        connectRetries,
        message,
      });

      if (attempt >= connectRetries) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}

void connectWithRetry();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
