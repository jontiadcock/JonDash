-- CreateTable
CREATE TABLE "Module" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'bundled',
    "grantedPermissions" TEXT NOT NULL DEFAULT '[]',
    "migratedVersion" TEXT,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ModuleRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "moduleId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueJson" TEXT NOT NULL,
    "secret" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ModuleMigration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "moduleId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ModuleRecord_moduleId_idx" ON "ModuleRecord"("moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleRecord_moduleId_key_key" ON "ModuleRecord"("moduleId", "key");

-- CreateIndex
CREATE INDEX "ModuleMigration_moduleId_idx" ON "ModuleMigration"("moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleMigration_moduleId_filename_key" ON "ModuleMigration"("moduleId", "filename");
