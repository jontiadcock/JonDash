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
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Helper" ("channel", "channelPin", "id", "installedAt", "migratedVersion", "name", "providesJson", "updatedAt", "version") SELECT "channel", "channelPin", "id", "installedAt", "migratedVersion", "name", "providesJson", "updatedAt", "version" FROM "Helper";
DROP TABLE "Helper";
ALTER TABLE "new_Helper" RENAME TO "Helper";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
