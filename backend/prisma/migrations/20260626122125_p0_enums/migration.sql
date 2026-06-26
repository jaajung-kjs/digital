-- CreateEnum
CREATE TYPE "CableRole" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "FailureSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FailureLogType" AS ENUM ('FAILURE', 'REPAIR');

-- CreateEnum
CREATE TYPE "FailureStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PhotoSide" AS ENUM ('front', 'rear');

-- AlterTable cables: convert source_role/target_role String→CableRole with USING cast (data exists)
ALTER TABLE "cables"
  ALTER COLUMN "source_role" TYPE "CableRole" USING ("source_role"::text::"CableRole"),
  ALTER COLUMN "target_role" TYPE "CableRole" USING ("target_role"::text::"CableRole");

-- AlterTable maintenance_logs: drop default first, then change type, then restore default
-- (PostgreSQL requires dropping default before altering column type when default must be recast)
ALTER TABLE "maintenance_logs"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "maintenance_logs"
  ALTER COLUMN "logType" TYPE "FailureLogType" USING ("logType"::text::"FailureLogType"),
  ALTER COLUMN "severity" TYPE "FailureSeverity" USING ("severity"::text::"FailureSeverity"),
  ALTER COLUMN "status" TYPE "FailureStatus" USING ("status"::text::"FailureStatus");

ALTER TABLE "maintenance_logs"
  ALTER COLUMN "status" SET DEFAULT 'OPEN'::"FailureStatus";

-- AlterTable asset_photos: empty table, USING cast added for consistency
ALTER TABLE "asset_photos"
  ALTER COLUMN "side" TYPE "PhotoSide" USING ("side"::text::"PhotoSide");
