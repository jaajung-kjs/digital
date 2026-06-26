import type { Asset } from '../../../../../types/asset';
import type { DetailPanelKind } from '../../../../../types/assetDetailKind';

/**
 * 자산 → 상세 패널의 공간(spatial) 섹션 종류(SSOT). 분류는 assetType.role 단일 소스.
 * standalone/device 는 공간섹션 없음(일반 인스펙터만).
 */
const ROLE_TO_PANEL: Record<string, DetailPanelKind> = {
  slot: 'conduit-ports',
  feeder: 'feeder-circuits',
  rack: 'rack',
  ofd: 'ofd',
  panel: 'distribution',
};

export function resolveAssetDetailKind(asset: Asset | null | undefined): DetailPanelKind | null {
  return ROLE_TO_PANEL[asset?.assetType?.role ?? ''] ?? null;
}
