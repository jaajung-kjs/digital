-- Drop legacy AssetType columns (role 단일화 R4)
-- These columns are superseded by `role` (7-value enum, backfilled in R1–R3).
ALTER TABLE "asset_types" DROP COLUMN "placement_kind", DROP COLUMN "connection_kind", DROP COLUMN "group_name";
