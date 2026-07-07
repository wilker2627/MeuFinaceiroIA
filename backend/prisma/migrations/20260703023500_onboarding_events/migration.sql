CREATE TABLE "onboarding_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checkoutId" TEXT,
    "email" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "onboarding_events_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "billing_checkouts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "onboarding_events_email_createdAt_idx" ON "onboarding_events"("email", "createdAt");
CREATE INDEX "onboarding_events_eventType_createdAt_idx" ON "onboarding_events"("eventType", "createdAt");
