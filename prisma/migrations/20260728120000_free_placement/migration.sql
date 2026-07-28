-- Free placement on the dashboard (1.8.0).
--
-- Owner: "I want to be able to arrange the grid in any way I want… one icon at the top, and one at
-- the bottom, not directly next to each other." That is not expressible as an ordering, so an
-- item's position becomes data: an explicit column and row.
--
-- Both are NULL by default and NULL means "pack me into the first free space", which is exactly
-- what the previous ordering did. So an install upgrading to this version looks identical until
-- somebody moves something, at which point every visible item gets a stored position at once —
-- otherwise a mix of placed and packed items would shuffle whenever anything was added.

ALTER TABLE "DashboardLayout" ADD COLUMN "col" INTEGER;
ALTER TABLE "DashboardLayout" ADD COLUMN "row" INTEGER;
