import type { ReactNode, ThHTMLAttributes } from 'react';
import { cn } from './cn';

/**
 * 데이터 표의 껍데기 — 현황·선번장·계통이 같은 테두리·배경·폭을 쓰도록 하는 단일 지점.
 *
 * 예전에는 세 뷰가 각자 `<div className="overflow-auto"><table className="w-full text-sm">` 를
 * 써서, 현황만 카드 위에 있고 나머지는 회색 배경에 그대로 떠 있었다. 열 폭도 없어 넓은
 * 화면에서 짧은 열이 200px 로 벌어졌다.
 *
 * `table-fixed` 가 기본이다 — 열 폭은 `<Th className="w-28">` 처럼 머리글이 선언한다.
 */
export function TableCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('max-w-6xl overflow-auto rounded-lg border border-line bg-surface', className)}>
      <table className="w-full table-fixed text-sm">{children}</table>
    </div>
  );
}

interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  children: ReactNode;
}

/** 표 머리글 셀 — 라벨 타이포(`text-xs`)와 구분선을 고정한다. 폭은 `className` 으로 준다. */
export function Th({ children, className, ...rest }: ThProps) {
  return (
    <th
      className={cn(
        'border-b border-line bg-surface px-3 py-2 text-left text-xs font-medium text-content-muted',
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}
