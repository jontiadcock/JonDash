-- CORE-11 + CORE-12: ModuleLayout becomes DashboardLayout.
--
-- Two changes at once, because they are the same table:
--   * `kind` + `refId` replace `moduleId`, so ONE ordering can span module widgets and
--     service tiles (CORE-11).
--   * `profile` splits the arrangement per device, so rearranging on a phone does not
--     reorder the desktop (CORE-12).
--
-- BACK COMPAT — every existing row is copied into BOTH profiles.
-- Today a single saved layout serves every screen size. Migrating it into "wide" only would
-- silently discard the arrangement on a phone, which is a change nobody asked for; copying it
-- into both preserves exactly the current behaviour and lets the two diverge the moment
-- somebody rearranges on one of them. Back compat is the default here.

CREATE TABLE "DashboardLayout" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "userId"    TEXT NOT NULL,
    "kind"      TEXT NOT NULL DEFAULT 'module',
    "refId"     TEXT NOT NULL,
    "profile"   TEXT NOT NULL DEFAULT 'wide',
    "width"     INTEGER NOT NULL DEFAULT 1,
    "height"    INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "DashboardLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- The existing desktop arrangement.
INSERT INTO "DashboardLayout" ("id", "userId", "kind", "refId", "profile", "width", "height", "sortOrder")
SELECT "id" || '-w', "userId", 'module', "moduleId", 'wide', "width", "height", "sortOrder"
FROM "ModuleLayout";

-- The same arrangement for narrow screens, so nothing changes until someone rearranges there.
INSERT INTO "DashboardLayout" ("id", "userId", "kind", "refId", "profile", "width", "height", "sortOrder")
SELECT "id" || '-n', "userId", 'module', "moduleId", 'narrow', "width", "height", "sortOrder"
FROM "ModuleLayout";

DROP TABLE "ModuleLayout";

CREATE UNIQUE INDEX "DashboardLayout_userId_profile_kind_refId_key"
    ON "DashboardLayout" ("userId", "profile", "kind", "refId");
CREATE INDEX "DashboardLayout_userId_profile_idx"
    ON "DashboardLayout" ("userId", "profile");
