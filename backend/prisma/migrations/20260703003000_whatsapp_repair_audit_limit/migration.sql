CREATE TABLE "whatsapp_repair_audits" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "actorTenantEmail" TEXT,
    "actorTenantPlan" TEXT,
    "outcome" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "whatsapp_repair_audits_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "whatsapp_repair_audits_tenantId_createdAt_idx" ON "whatsapp_repair_audits"("tenantId", "createdAt");
CREATE INDEX "whatsapp_repair_audits_tenantId_sessionId_createdAt_idx" ON "whatsapp_repair_audits"("tenantId", "sessionId", "createdAt");
