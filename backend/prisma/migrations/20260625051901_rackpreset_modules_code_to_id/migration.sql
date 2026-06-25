-- Migration: rack_presets.modules categoryCode → categoryId
-- CASE-guarded: only transforms elements that still have a 'categoryCode' key.
-- Elements already having 'categoryId' (and no 'categoryCode') are left unchanged.
-- Idempotent: running twice is a no-op (no elements with 'categoryCode' remain after first run).

-- Pre-check: log any categoryCode values that have no matching asset_types.code
DO $$
DECLARE
  v_unresolved TEXT;
BEGIN
  SELECT string_agg(DISTINCT elem->>'categoryCode', ', ')
  INTO v_unresolved
  FROM rack_presets rp,
       jsonb_array_elements(rp.modules) elem
  WHERE elem ? 'categoryCode'
    AND NOT EXISTS (
      SELECT 1 FROM asset_types at WHERE at.code = elem->>'categoryCode'
    );

  IF v_unresolved IS NOT NULL THEN
    RAISE NOTICE 'rack_presets migration WARNING: unresolvable categoryCode values (left unchanged): %', v_unresolved;
  ELSE
    RAISE NOTICE 'rack_presets migration: all categoryCode values resolved (or none present).';
  END IF;
END
$$;

-- Transform: for each rack_preset row, rebuild modules jsonb array with CASE guard:
--   - Element has 'categoryCode' key AND a resolvable asset_types.code → replace with categoryId, drop categoryCode
--   - Element has 'categoryCode' key but NO matching asset_types row → leave element UNCHANGED (keep categoryCode, no null categoryId)
--   - Element already has 'categoryId' (no 'categoryCode') → leave UNCHANGED
UPDATE rack_presets rp
SET modules = sub.new_modules
FROM (
  SELECT rp2.id,
    jsonb_agg(
      CASE
        WHEN elem ? 'categoryCode' AND at.id IS NOT NULL
          THEN (elem - 'categoryCode') || jsonb_build_object('categoryId', at.id)
        ELSE
          elem
      END
    ORDER BY elem_ord
    ) AS new_modules
  FROM rack_presets rp2,
       jsonb_array_elements(rp2.modules) WITH ORDINALITY AS t(elem, elem_ord)
       LEFT JOIN asset_types at ON at.code = elem->>'categoryCode' AND (elem ? 'categoryCode')
  GROUP BY rp2.id
) sub
WHERE rp.id = sub.id;
