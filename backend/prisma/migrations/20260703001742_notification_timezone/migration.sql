-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_tenant_notification_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
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
INSERT INTO "new_tenant_notification_settings" ("cashflowAlertEnabled", "dailyDigestEnabled", "dailyDigestHour", "id", "lastDailyDigestSentAt", "lastRemindersSentAt", "lastWeeklyDigestSentAt", "remindersEnabled", "remindersHour", "tenantId", "updatedAt", "weeklyDigestEnabled", "weeklyDigestHour", "weeklyDigestWeekday") SELECT "cashflowAlertEnabled", "dailyDigestEnabled", "dailyDigestHour", "id", "lastDailyDigestSentAt", "lastRemindersSentAt", "lastWeeklyDigestSentAt", "remindersEnabled", "remindersHour", "tenantId", "updatedAt", "weeklyDigestEnabled", "weeklyDigestHour", "weeklyDigestWeekday" FROM "tenant_notification_settings";
DROP TABLE "tenant_notification_settings";
ALTER TABLE "new_tenant_notification_settings" RENAME TO "tenant_notification_settings";
CREATE UNIQUE INDEX "tenant_notification_settings_tenantId_key" ON "tenant_notification_settings"("tenantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
