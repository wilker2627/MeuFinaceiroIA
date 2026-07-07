-- CreateTable
CREATE TABLE "tenant_notification_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "remindersHour" INTEGER NOT NULL DEFAULT 8,
    "dailyDigestEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyDigestHour" INTEGER NOT NULL DEFAULT 20,
    "weeklyDigestEnabled" BOOLEAN NOT NULL DEFAULT true,
    "weeklyDigestWeekday" INTEGER NOT NULL DEFAULT 0,
    "weeklyDigestHour" INTEGER NOT NULL DEFAULT 19,
    "cashflowAlertEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRemindersSentAt" DATETIME,
    "lastDailyDigestSentAt" DATETIME,
    "lastWeeklyDigestSentAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "tenant_notification_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_notification_settings_tenantId_key" ON "tenant_notification_settings"("tenantId");
