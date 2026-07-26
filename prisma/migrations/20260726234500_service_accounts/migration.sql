-- SEC-07 · Service accounts.
--
-- An identity that holds permissions and appears in the audit log but that nobody can
-- ever sign in as. Both columns are additive with safe defaults, so an existing install
-- migrates with every current account unchanged and unmistakably human.
--
-- `isServiceAccount` defaults to 0: no existing row can accidentally become unreachable,
-- and — critically — no existing row stops counting toward "an admin exists", which gates
-- the first-run recovery wizard.
-- AlterTable
ALTER TABLE "User" ADD COLUMN "isServiceAccount" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "displayName" TEXT;
