import { EditableField } from '../../assets/components/EditableField';
import { ampDigits } from '../powerUnits';

/**
 * 용량(정격전류) 인라인 편집 — 숫자만 입력, 표시는 'A' 자동(20→20A). 저장값은 숫자만(ampDigits).
 * 그리드 셀·피더 패널 카드가 공유(같은 입력/표시 규약 한 곳에).
 * @param value 저장된 용량 원문('20' 또는 '20A' 모두 안전)
 * @param onCommit 숫자만(또는 null)을 받는다 — 호출부는 그대로 저장하면 됨.
 * @param valueClickEdits 값 클릭으로 편집 시작(카드=true, 그리드=false).
 */
export function AmpField({ value, onCommit, valueClickEdits = false }: {
  value: string;
  onCommit: (digits: string | null) => void;
  valueClickEdits?: boolean;
}) {
  return (
    <EditableField
      value={ampDigits(value)}
      type="number"
      ariaLabel="용량"
      placeholder="용량"
      valueClickEdits={valueClickEdits}
      display={(v) => (v ? `${v}A` : <span className="text-content-faint">—</span>)}
      onCommit={(v) => onCommit(ampDigits(v) || null)}
    />
  );
}
