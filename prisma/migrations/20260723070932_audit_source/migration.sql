-- Adds AuditLog.source: "request" (someone acting in the browser) or "system" (scheduled
-- or background work, which has no request and therefore no IP). Before this, a background
-- row was indistinguishable from one whose actor is genuinely unknown.
--
-- Existing rows take the 'request' default below, which is provably correct rather than a
-- guess: until BUG-29 was fixed (v1.5.3-beta.3), audit() called headers() before the write,
-- and headers() throws outside a request scope — so no row could ever have been written by
-- background work. Every pre-existing row came from a request.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "ip" TEXT,
    "detail" TEXT,
    "source" TEXT NOT NULL DEFAULT 'request',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AuditLog" ("action", "createdAt", "detail", "id", "ip", "userId") SELECT "action", "createdAt", "detail", "id", "ip", "userId" FROM "AuditLog";
DROP TABLE "AuditLog";
ALTER TABLE "new_AuditLog" RENAME TO "AuditLog";
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_source_idx" ON "AuditLog"("source");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
