-- Drop the old unique constraint (source, target, cableType)
DROP INDEX IF EXISTS "cables_source_equipment_id_target_equipment_id_cable_type_key";
DROP INDEX IF EXISTS "cables_unique_non_fiber";
DROP INDEX IF EXISTS "cables_unique_fiber";

-- Single unique index covering all cable types:
-- Non-fiber (port NULL): COALESCE → -1, so one cable per (source, target, type)
-- Fiber with port: one cable per (source, target, type, port)
-- Fiber without port: COALESCE → -1, so one unassigned fiber per pair
CREATE UNIQUE INDEX "cables_unique_connection"
ON "cables" (
  "source_equipment_id",
  "target_equipment_id",
  "cable_type",
  COALESCE("fiber_port_number", -1)
);
