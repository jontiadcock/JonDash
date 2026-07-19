-- CreateTable
CREATE TABLE "AccessRole" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "permissionsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "_UserAccessRoles" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_UserAccessRoles_A_fkey" FOREIGN KEY ("A") REFERENCES "AccessRole" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_UserAccessRoles_B_fkey" FOREIGN KEY ("B") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AccessRole_name_key" ON "AccessRole"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_UserAccessRoles_AB_unique" ON "_UserAccessRoles"("A", "B");

-- CreateIndex
CREATE INDEX "_UserAccessRoles_B_index" ON "_UserAccessRoles"("B");
