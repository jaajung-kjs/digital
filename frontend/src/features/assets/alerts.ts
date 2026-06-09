/**
 * 설치 후 경과 연수가 임계치를 넘으면 교체 검토 경고.
 * 변전소 설비의 통상적 교체 주기(약 20년)를 기준으로 한다. 필요 시 조정.
 */
export const INSTALL_AGE_ALERT_YEARS = 20;

export interface AssetAlert {
  kind: 'replace';
  label: string;
  /** 설치 후 경과 연수(floor). */
  years: number;
}

/** installDate 가 INSTALL_AGE_ALERT_YEARS 년 이상 경과하면 경고. */
export function assetAlert(asset: { installDate: string | null }, today: Date): AssetAlert | null {
  if (!asset.installDate) return null;
  const installed = new Date(asset.installDate);
  if (Number.isNaN(installed.getTime())) return null;
  const years = Math.floor(
    (today.getTime() - installed.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
  );
  if (years >= INSTALL_AGE_ALERT_YEARS) {
    return { kind: 'replace', label: `설치 ${years}년 경과`, years };
  }
  return null;
}
