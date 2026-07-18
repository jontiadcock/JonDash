-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL DEFAULT 'global',
    "ownerId" TEXT NOT NULL DEFAULT '',
    "key" TEXT NOT NULL,
    "valueJson" TEXT NOT NULL,
    "secret" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Setting_scope_ownerId_key_key" ON "Setting"("scope", "ownerId", "key");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
