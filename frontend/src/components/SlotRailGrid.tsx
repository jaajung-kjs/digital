import type { ReactNode } from 'react';

/**
 * 공유 프레임: 바깥 테두리(border-line-strong) + 좌측 번호 레일(1..slotCount) +
 * 1-열 슬롯 그리드. 랙(RackSlotGrid)과 OFD(OfdSlotRail) 양쪽이 이 컴포넌트를
 * 직접 렌더하므로 프레임 마크업은 여기 한 곳에만 존재한다.
 *
 * 자식은 각자 explicit gridRowStart/End + gridColumnStart/End(=1/2) 로
 * 자기 위치를 선언해야 한다 — auto-flow 를 쓰지 않으므로 드래그 인디케이터와
 * 원본 셀이 같은 row 에 겹쳐도 밀려나지 않는다(RackSlotGrid 동작 보존).
 */
export function SlotRailGrid({
  slotCount,
  gridRef,
  children,
}: {
  slotCount: number;
  gridRef?: React.Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    // 백플레인 프레임 — 차단기 레일·포트 그리드와 동일 디자인 언어(border-line + bg-surface-2 + shadow-sm).
    <div className="h-full flex border border-line rounded-md overflow-hidden bg-surface-2 shadow-sm">
      {/* 슬롯 번호 레일(유닛 눈금) — 그리드와 동일 row 템플릿+gap 으로 정렬. */}
      <div
        aria-hidden
        className="shrink-0 w-7 grid gap-1 border-r border-line bg-surface-2"
        style={{ gridTemplateRows: `repeat(${slotCount}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: slotCount }, (_, i) => (
          <div
            key={i}
            className="flex items-center justify-center text-xs font-mono tabular-nums text-content-muted leading-none"
          >
            {i + 1}
          </div>
        ))}
      </div>
      {/* 슬롯 그리드 (gridRef — 드래그 geometry 의 기준). 세로 padding 은 금지(row 계산은 clientY
          delta 기반이라 row 높이가 바뀌면 어긋남) — 좌우 padding(px)만 추가해 여백 확보(드래그 무관).
          recessed 백플레인(shadow-inner)으로 흰 모듈이 박혀 보이게(고급 입체감). */}
      <div
        ref={gridRef}
        className="flex-1 bg-surface-2 grid gap-1 px-1.5 shadow-inner"
        style={{
          // 1 열 고정. column 을 explicit 으로 지정하지 않으면 같은 row 에
          // 여러 아이템이 있을 때 implicit column 이 추가되어 grid 가 2 열로
          // 갈라진다 (드래그 인디케이터가 원본 셀과 같은 row 일 때).
          gridTemplateColumns: 'minmax(0, 1fr)',
          gridTemplateRows: `repeat(${slotCount}, minmax(0, 1fr))`,
          // 혹시라도 implicit column 이 만들어지지 않도록 폭 0 으로 고정.
          gridAutoColumns: '0',
        }}
      >
        {children}
      </div>
    </div>
  );
}
