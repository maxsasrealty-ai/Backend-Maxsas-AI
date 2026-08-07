import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function resetDatabase() {
  try {
    console.log("🔄 Resetting database...");

    // Delete in correct order (handle foreign keys)
    const voiceAudit = await prisma.voiceIngestAudit.deleteMany({});
    console.log(`✅ VoiceIngestAudit cleared (${voiceAudit.count} records)`);

    const transcripts = await prisma.transcriptSegment.deleteMany({});
    console.log(`✅ TranscriptSegment cleared (${transcripts.count} records)`);

    const leads = await prisma.leadExtraction.deleteMany({});
    console.log(`✅ LeadExtraction cleared (${leads.count} records)`);

    const events = await prisma.callEvent.deleteMany({});
    console.log(`✅ CallEvent cleared (${events.count} records)`);

    const calls = await prisma.callSession.deleteMany({});
    console.log(`✅ CallSession cleared (${calls.count} records)`);

    const requests = await prisma.outboundRequest.deleteMany({});
    console.log(`✅ OutboundRequest cleared (${requests.count} records)`);

    console.log("\n✨ Database reset complete - ready for fresh data!");
  } catch (err) {
    console.error("❌ Reset failed:", err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

resetDatabase();
