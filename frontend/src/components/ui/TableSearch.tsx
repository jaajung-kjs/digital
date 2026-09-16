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
 * **건수는 걸러낼 때만 적는다.** 검색 결과가 비었을 때 「검색이 잘못됐다」인지 「원래
 * 없다」인지 구분되지 않으면 같은 검색을 반복하게 되므로, 거르는 동안에는 `N / M건` 이
 * 필요하다. 하지만 안 거를 때의 수는 화면이 이미 말하고 있는 것을 되풀이할 뿐이고,
 * 접어 둔 표에서는 화면과 다른 수가 되기까지 했다(두 줄이 보이는데 「18건」).
 */
export function TableSearch({ value, onChange, placeholder, shown, total, ...rest }: TableSearchProps) {
  const filtering = value.trim().length > 0;
  return (
    <div className="flex shrink-0 items-center gap-2">
      {/* 건수는 입력칸 **앞**에 선다 — 머리 띠의 오른쪽 끝은 `ml-auto` 로 밀려 있어서,
          건수를 뒤에 두면 글자를 치는 순간 그것이 나타나며 입력칸이 왼쪽으로 튄다.
          줄바꿈되지 않게: 좁은 칸에서 "48" / "건" 으로 갈라져 두 줄이 됐다. */}
      {filtering && (
        <span className="whitespace-nowrap text-xs text-content-muted">
          {shown} / {total}건
        </span>
      )}
      <div className="w-64">
        <Input
          size="sm"
          aria-label={rest['aria-label']}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      </div>
    </div>
  );
}
