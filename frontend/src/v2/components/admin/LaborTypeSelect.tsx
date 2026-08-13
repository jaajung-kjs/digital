/**
 * 직종 고르기 — 자산 종류·설비 종류·케이블 종류가 **같은 어휘**를 쓴다.
 *
 * 예전에는 세 화면이 각자 자유 텍스트 상자를 갖고 있었다. 그래서 「통신내선공」과
 * 「통신내선공 」(뒤 공백)이 다른 직종으로 잡혔고, 설계서에서 노임을 붙일 방법도 없었다.
 *
 * 고르는 것은 이름이지만 **저장되는 것은 코드**다(`useWageCatalog`). 그래서 반기마다 판을
 * 갈아도, 직종 이름이 바뀌어도 대장을 손댈 일이 없다.
 *
 * 아직 기준자료가 없으면 잠긴다 — 대신 저장을 막지는 않는다. 품셈 없이도 종류는 만들 수
 * 있어야 하고, 기준자료는 나중에 올려도 된다.
 */
import { Select } from '../../../components/ui';
import { useWageCatalog } from '../../hooks';

export function LaborTypeSelect({
  value,
  onChange,
  ariaLabel = '노무유형',
}: {
  /** 저장돼 있는 직종 코드. 아직 없으면 null. */
  value: string | null;
  onChange: (code: string | null) => void;
  ariaLabel?: string;
}) {
  const wage = useWageCatalog();
  const empty = wage.rows.length === 0;

  /* 지금 판에 없는 코드도 목록에 세운다 — 조용히 빈칸으로 만들면 값이 사라진 줄 모른다.
     (직종이 폐지됐거나, 기준자료를 아직 안 올렸거나) */
  const unknown = value != null && !wage.known(value);

  return (
    <div className="flex w-full flex-col gap-0.5">
      <Select
        aria-label={ariaLabel}
        disabled={empty && !unknown}
        value={value ?? ''}
        onChange={(e) => onChange(e.currentTarget.value || null)}
      >
        <option value="">— 없음 —</option>
        {unknown && <option value={value}>{wage.nameOf(value)}</option>}
        {wage.rows.map((r) => (
          <option key={r.code} value={r.code}>
            {r.name}
            {` · ${r.wage.toLocaleString()}원/일`}
            {/* 이번 회차에 조사되지 않은 직종은 **그 직종의 가장 최근 값**이 온다.
                숨기지 않고 언제 값인지 적는다. */}
            {wage.staleDateOf(r.code) && ` (${r.effectiveLabel} 기준)`}
          </option>
        ))}
      </Select>
      {empty && (
        <span className="text-xs text-content-faint">「기준자료」 탭에서 노임단가를 먼저 올리세요</span>
      )}
      {unknown && !empty && (
        <span className="text-xs text-warning">지금 기준({wage.effective})에 없는 직종입니다</span>
      )}
      {/* 옛 회차 값이면 그 사정을 **보고서 문장 그대로** 옮긴다. */}
      {value != null && !unknown && wage.staleDateOf(value) && (
        <span className="text-xs text-content-faint">
          {wage.staleDateOf(value)} 기준 — {wage.noteOf(value) ?? '이번 회차에는 조사되지 않은 직종입니다'}
        </span>
      )}
    </div>
  );
}
