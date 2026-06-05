import type { Asset } from '../../types/asset';

export interface AssetAlert {
  kind: 'warranty' | 'replace';
  label: string;
  date: string;
}

const WARRANTY_MONTHS_AHEAD = 6;

/** 하자보수기한 임박(N개월 이내) 또는 교체예정 도래/경과 시 경고. 둘 다면 warranty 우선. */
export function assetAlert(asset: Asset, today: Date): AssetAlert | null {
  if (asset.warrantyUntil) {
    const w = new Date(asset.warrantyUntil);
    if (w < today) return { kind: 'warranty', label: '하자보수 만료', date: asset.warrantyUntil };
    const threshold = new Date(today);
    threshold.setMonth(threshold.getMonth() + WARRANTY_MONTHS_AHEAD);
    if (w <= threshold) return { kind: 'warranty', label: '하자보수 임박', date: asset.warrantyUntil };
  }
  if (asset.replaceDue) {
    const r = new Date(asset.replaceDue);
    if (r <= today) return { kind: 'replace', label: '교체 도래', date: asset.replaceDue };
  }
  return null;
}
