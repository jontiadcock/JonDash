-- CreateTable
CREATE TABLE "ModuleLayout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "width" INTEGER NOT NULL DEFAULT 1,
    "height" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ModuleLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_ModuleServiceRoles" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ModuleServiceRoles_A_fkey" FOREIGN KEY ("A") REFERENCES "Module" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ModuleServiceRoles_B_fkey" FOREIGN KEY ("B") REFERENCES "ServiceRole" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ModuleLayout_userId_idx" ON "ModuleLayout"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleLayout_userId_moduleId_key" ON "ModuleLayout"("userId", "moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "_ModuleServiceRoles_AB_unique" ON "_ModuleServiceRoles"("A", "B");

-- CreateIndex
CREATE INDEX "_ModuleServiceRoles_B_index" ON "_ModuleServiceRoles"("B");
