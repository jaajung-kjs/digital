import { FormRow, fieldClass } from '../../assets/components/detail/SectionShell';

/**
 * 노무시간 number input — 설치/철거/이설 값 입력에 쓰이는 공용 헬퍼.
 * AssetTypeForm (개당) 과 CableGroupForm (미터당) 양쪽에서 재사용.
 */
export function HoursInput({
  label,
  ariaLabel,
  value,
  onCommit,
}: {
  label: string;
  ariaLabel: string;
  value: number | null;
  onCommit: (n: number) => void;
}) {
  return (
    <FormRow label={label}>
      <input
        type="number"
        aria-label={ariaLabel}
        className={fieldClass}
        placeholder="0.000"
        step="0.001"
        value={value ?? ''}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (!isNaN(n)) onCommit(n);
        }}
      />
    </FormRow>
  );
}
