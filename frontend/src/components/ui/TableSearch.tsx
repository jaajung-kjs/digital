import { Input } from './Input';

export interface TableSearchProps {
  value: string;
  onChange: (value: string) => void;
  /** 무엇을 훑는지 알려주는 안내 — `이름 · 종류 · 담당자 검색` 처럼 실제 대상 열을 적는다. */
  placeholder: string;
  'aria-label': string;
  /** 걸러낸 뒤 남은 건수. */
  shown: number;
  /** 거르기 전 전체 건수. */
  total: number;
}

/**
 * 표 위의 검색 상자 + 건수.
 *
 * 표가 있는 화면마다 "찾을 방법이 정렬뿐" 인 상태가 되기 쉬워 세 곳(현황·선번장·계통)이
 * 같은 것을 필요로 한다. 생김새가 화면마다 달라지지 않도록 여기 한 곳에 둔다.
 *
 * **무엇으로 거를지는 호출부가 정한다** — 어떤 열이 있는지는 표마다 다르고, 여기서
 * 알 방법도 없다. 이 컴포넌트는 상자와 건수만 맡는다.
 *
 * 건수를 늘 함께 보여주는 이유: 검색 결과가 비었을 때 "검색이 잘못됐다" 인지 "원래
 * 없다" 인지 구분되지 않으면 사용자가 같은 검색을 반복한다.
 *
 * **건수는 지금 나열된 것을 서술한다.** 예전에는 검색 중일 때만 `N / M건` 을 적고 평소에는
 * 전체만 적었다 — 현황표는 설비를 접어 두므로 화면에 두 줄이 보이는데 「18건」이라고 서
 * 있었다. 화면과 다른 수는 세는 사람을 헷갈리게 할 뿐이다.
 */
export function TableSearch({ value, onChange, placeholder, shown, total, ...rest }: TableSearchProps) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="w-64">
        <Input
          size="sm"
          aria-label={rest['aria-label']}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      </div>
      {/* 건수는 줄바꿈되지 않게 — 좁은 칸에서 "48" / "건" 으로 갈라져 두 줄이 됐다. */}
      <span className="whitespace-nowrap text-xs text-content-muted">
        {shown === total ? `${total}건` : `${shown} / ${total}건`}
      </span>
    </div>
  );
}
