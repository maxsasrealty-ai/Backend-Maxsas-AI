Purpose
- Describe options and a safe migration/backfill to persist `lead_bucket` in `CallSession`.

Recommendation
- Default rollout: compute-on-read (no DB migration) — already implemented.
- Optional: add denormalized `leadBucket` column if you need to filter by bucket at DB level.

Prisma migration (optional)
1) Add column in Prisma schema:

model CallSession {
  id            String   @id @default(uuid())
  // ... existing fields ...
  callOutcome   String?  @db.VarChar(255)
  leadBucket    String?  @db.VarChar(64)    // NEW
}

2) Create Prisma migration (example):
   npx prisma migrate dev --name add_lead_bucket

Backfill script (Node/Prisma)
---------------------------------
Use a script that scans CallSession rows and updates `leadBucket` using server-side mapping.

Pseudo:
```
const { prisma } = require("../src/lib/prisma");
const { computeLeadBucket } = require("../shared/leadOutcome");

async function backfill() {
  const batchSize = 1000;
  let offset = 0;
  while (true) {
    const rows = await prisma.callSession.findMany({ skip: offset, take: batchSize });
    if (rows.length === 0) break;
    const updates = rows.map(r => ({ id: r.id, leadBucket: computeLeadBucket(r.callOutcome) }));
    for (const u of updates) {
      await prisma.callSession.update({ where: { id: u.id }, data: { leadBucket: u.leadBucket } });
    }
    offset += rows.length;
  }
}
backfill();
```

Notes
- Backfill can be run in chunks during low traffic.
- Add an index on `leadBucket` if you expect frequent filtering: `CREATE INDEX ON "CallSession" ("leadBucket");`
