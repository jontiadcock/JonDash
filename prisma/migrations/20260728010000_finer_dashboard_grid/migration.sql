-- The dashboard grid goes to 3x resolution (1.8.0-beta.11).
--
-- Owner: "the minimum size is still too big — make them able to be 3x smaller." A finer unit is
-- the only way to offer that, and on its own it would shrink every existing dashboard to a third
-- of its size. So the defaults grew from 1x1 to 3x3 (tiles) and 2x2 to 6x6 (widgets), and every
-- saved span is multiplied to match.
--
-- The result is that nothing looks different after upgrading, and 1x1 becomes a genuinely small
-- tile somebody can now choose.
--
-- Rows with no saved layout need nothing: they render from DEFAULT_SPAN, which already moved.

UPDATE "DashboardLayout"
SET "width" = "width" * 3,
    "height" = "height" * 3;
