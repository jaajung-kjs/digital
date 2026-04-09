-- Add new enum values
ALTER TYPE "EquipmentCategory" ADD VALUE 'CHARGER';
ALTER TYPE "EquipmentCategory" ADD VALUE 'UPS';

-- Migrate existing POWER records to OTHER
UPDATE equipment SET category = 'OTHER' WHERE category = 'POWER';
