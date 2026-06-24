/**
 * 용량(정격전류) 단위 처리 — 저장은 **숫자만**, 표시는 **A 자동**.
 *  - ampDigits: 입력/저장용. 숫자(소수 포함)만 남긴다('20A'→'20', '20'→'20').
 *  - formatAmp: 표시용. 숫자가 있으면 'A' 를 붙인다('20'→'20A', ''→'').
 * 기존 '20A' 저장값과 새 '20' 저장값 모두 안전하게 처리(마이그레이션 불필요).
 */
export const ampDigits = (v: string | null | undefined): string => (v ?? '').replace(/[^\d.]/g, '');
export const formatAmp = (v: string | null | undefined): string => {
  const d = ampDigits(v);
  return d ? `${d}A` : '';
};
