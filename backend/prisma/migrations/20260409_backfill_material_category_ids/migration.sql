-- Backfill cables: map each CableType to its default MaterialCategory
UPDATE cables c SET material_category_id = mc.id
FROM material_categories mc
WHERE c.material_category_id IS NULL
  AND (
    (c.cable_type = 'AC' AND mc.code = 'CBL-CV')
    OR (c.cable_type = 'DC' AND mc.code = 'CBL-EV')
    OR (c.cable_type = 'LAN' AND mc.code = 'CBL-UTP')
    OR (c.cable_type = 'FIBER' AND mc.code = 'CBL-FIBER-SM')
    OR (c.cable_type = 'GROUND' AND mc.code = 'CBL-GND-IV')
  );

-- Backfill equipment: map each EquipmentCategory to its default MaterialCategory
UPDATE equipment e SET material_category_id = mc.id
FROM material_categories mc
WHERE e.material_category_id IS NULL
  AND (
    (e.category = 'SERVER' AND mc.code = 'EQP-RTU')
    OR (e.category = 'NETWORK' AND mc.code = 'EQP-NET')
    OR (e.category = 'STORAGE' AND mc.code = 'EQP-RACK')
    OR (e.category = 'CHARGER' AND mc.code = 'EQP-UPS')
    OR (e.category = 'UPS' AND mc.code = 'EQP-UPS')
    OR (e.category = 'SECURITY' AND mc.code = 'EQP-SEC')
    OR (e.category = 'OTHER' AND mc.code = 'EQP-SEIS')
    OR (e.category = 'DISTRIBUTION_BOARD' AND mc.code = 'EQP-BRK')
    OR (e.category = 'OFD' AND mc.code = 'EQP-OFD')
  );
