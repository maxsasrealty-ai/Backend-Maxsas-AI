import { prisma } from "../../src/lib/db";
const callId = process.argv[2];

if (!callId) {
  console.error("Usage: npx tsx scripts/debug/temp-check.mjs <callId>");
  process.exit(1);
}

(async()=>{
  const ev=await prisma.callEvent.findMany({where:{callId},orderBy:{createdAt:'asc'}});
  console.log(JSON.stringify(ev.map(e=>({eventType:e.eventType,eventId:e.eventId,createdAt:e.createdAt})),null,2));
  const session=await prisma.callSession.findUnique({where:{id:callId}});
  console.log('session', session?.status, session?.initiatedAt);
  await prisma.$disconnect();
})();