-- SEC-07 follow-up · make a service account legible.
--
-- An account nobody can sign in as, with nothing on its page, is indistinguishable from a
-- forgotten one. These three columns answer "what is this for?" and "is it still in use?".
-- All nullable and additive: existing rows are untouched and read as "never used", which for
-- a person is simply true and never displayed.
-- AlterTable
ALTER TABLE "User" ADD COLUMN "credentialKind" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "lastUsedAt" DATETIME;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "lastUsedByHelper" TEXT;
