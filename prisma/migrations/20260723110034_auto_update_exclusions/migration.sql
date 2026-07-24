-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Helper" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "providesJson" TEXT NOT NULL DEFAULT '[]',
    "migratedVersion" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'stable',
    "channelPin" TEXT,
    "autoUpdate" BOOLEAN NOT NULL DEFAULT false,
    "autoUpdateExcluded" BOOLEAN NOT NULL DEFAULT false,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Helper" ("autoUpdate", "channel", "channelPin", "id", "installedAt", "migratedVersion", "name", "providesJson", "updatedAt", "version") SELECT "autoUpdate", "channel", "channelPin", "id", "installedAt", "migratedVersion", "name", "providesJson", "updatedAt", "version" FROM "Helper";
DROP TABLE "Helper";
ALTER TABLE "new_Helper" RENAME TO "Helper";
CREATE TABLE "new_Module" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'bundled',
    "channel" TEXT NOT NULL DEFAULT 'stable',
    "autoUpdate" BOOLEAN NOT NULL DEFAULT false,
    "autoUpdateExcluded" BOOLEAN NOT NULL DEFAULT false,
    "grantedPermissions" TEXT NOT NULL DEFAULT '[]',
    "migratedVersion" TEXT,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Module" ("autoUpdate", "channel", "enabled", "grantedPermissions", "id", "installedAt", "migratedVersion", "name", "source", "updatedAt", "version") SELECT "autoUpdate", "channel", "enabled", "grantedPermissions", "id", "installedAt", "migratedVersion", "name", "source", "updatedAt", "version" FROM "Module";
DROP TABLE "Module";
ALTER TABLE "new_Module" RENAME TO "Module";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
