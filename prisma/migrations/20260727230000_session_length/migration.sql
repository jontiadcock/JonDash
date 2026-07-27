-- Session lifetime + Idle timeout become one "Session length" (1.8.0).
--
-- Two overlapping controls became one. The idle window is what people mean by "how long do I
-- stay signed in", so that is what survives as a setting; the absolute cap lives on as a fixed
-- constant in code (SESSION_ABSOLUTE_CAP_DAYS) so a stolen token still cannot be kept alive
-- indefinitely.
--
-- THE POINT OF THIS MIGRATION IS THAT NOBODY'S SESSION CHANGES LENGTH ON UPGRADE.
--   * Had an idle timeout set  -> keep exactly that.
--   * Had it switched OFF (0)  -> the absolute lifetime was the only thing ending their
--                                 sessions, so that becomes the new window. Anything else
--                                 would silently sign them out sooner than before.
--   * Had neither              -> the shipped default, 120 minutes.
--
-- Only runs when there is no `session.lengthMinutes` row already, so it is safe to re-run and
-- never overwrites a choice made after the upgrade.
--
-- `valueJson` holds JSON.stringify(value), which for an int is the bare number, so CAST works.
-- The legacy rows are deliberately LEFT IN PLACE: they are what makes this derivable, and a
-- migration that destroys its own inputs cannot be checked afterwards.

INSERT INTO "Setting" ("id", "scope", "ownerId", "key", "valueJson", "secret", "createdAt", "updatedAt")
SELECT
  'seed-session-length-1800',
  'global',
  '',
  'session.lengthMinutes',
  CAST(
    CASE
      WHEN idle."valueJson" IS NOT NULL AND CAST(idle."valueJson" AS INTEGER) > 0
        THEN CAST(idle."valueJson" AS INTEGER)
      WHEN life."valueJson" IS NOT NULL
        THEN CAST(life."valueJson" AS INTEGER) * 1440
      ELSE 120
    END AS TEXT),
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (SELECT 1) AS anchor
LEFT JOIN "Setting" AS idle
  ON idle."key" = 'session.idleTimeoutMinutes' AND idle."scope" = 'global' AND idle."ownerId" = ''
LEFT JOIN "Setting" AS life
  ON life."key" = 'session.lifetimeDays' AND life."scope" = 'global' AND life."ownerId" = ''
WHERE NOT EXISTS (
  SELECT 1 FROM "Setting"
  WHERE "key" = 'session.lengthMinutes' AND "scope" = 'global' AND "ownerId" = ''
);
