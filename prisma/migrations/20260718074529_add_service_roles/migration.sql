-- CreateTable
CREATE TABLE "ServiceRole" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "_UserServiceRoles" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_UserServiceRoles_A_fkey" FOREIGN KEY ("A") REFERENCES "ServiceRole" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_UserServiceRoles_B_fkey" FOREIGN KEY ("B") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Link" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "roleId" TEXT,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "iconPath" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Link_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Link_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "ServiceRole" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Link" ("createdAt", "iconPath", "id", "sortOrder", "title", "updatedAt", "url", "userId") SELECT "createdAt", "iconPath", "id", "sortOrder", "title", "updatedAt", "url", "userId" FROM "Link";
DROP TABLE "Link";
ALTER TABLE "new_Link" RENAME TO "Link";
CREATE INDEX "Link_userId_sortOrder_idx" ON "Link"("userId", "sortOrder");
CREATE INDEX "Link_roleId_sortOrder_idx" ON "Link"("roleId", "sortOrder");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRole_name_key" ON "ServiceRole"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_UserServiceRoles_AB_unique" ON "_UserServiceRoles"("A", "B");

-- CreateIndex
CREATE INDEX "_UserServiceRoles_B_index" ON "_UserServiceRoles"("B");
