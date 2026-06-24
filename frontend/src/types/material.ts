/**
 * P9: legacy `MaterialCategory` / `Material` types are gone — they were split
 * in P6 into:
 *
 *   - CableCategory       (./cableCategory)
 *   - RackModuleCategory  (./rackModule)
 *   - RackPreset          (./rackPreset)
 *
 * What remains here is re-exports of shared spec/panel-kind types.
 */

export type {
  SpecParam,
  SpecTemplate,
} from './specTemplate';
export type { DetailPanelKind } from './equipmentKind';
