/**
 * TopologyModal — 배선 시험.
 *
 * core 의 순수 함수는 따로 시험한다(`packages/core/src/topology`). 여기서 잡는 것은
 * **콜사이트가 그것들을 옳게 이어 놓았는가**다 — 인자를 하나 빠뜨려도 셀렉터 시험은
 * 통과하고 화면만 조용히 빈다(예전에 실제로 그랬다).
 *
 * 마디가 국에서 장비로 바뀌었다(Task 8) — 국 「나」에도 장비(나단말)를 하나 두어야
 * 코어가 슬롯을 지나 장비까지 뚫린다. 앞면만 있고 장비가 없던 예전 픽스처는 이제
 * 마디를 하나도 못 낸다(경로슬롯은 마디가 아니므로).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { V2Reach } from '../types';
import { TopologyModal } from '../components/topology/TopologyModal';

const reach: V2Reach = {
  substations: [{ id: 'sa', name: '가국' }, { id: 'sb', name: '나국' }],
  floors: [{ id: 'fa', name: '1층', substationId: 'sa' }],
  assets: [
    { id: 'a-ofd', name: 'OFD', typeId: null, parentAssetId: null, substationId: 'sa', floorId: 'fa' },
    { id: 'a-slot', name: '가슬롯', typeId: 'slot', parentAssetId: 'a-ofd', substationId: 'sa', floorId: null },
    { id: 'a-dev', name: '가단말', typeId: 'dev', parentAssetId: null, substationId: 'sa', floorId: 'fa' },
    /* 설비(OFD) 아래 장비 — assemblyName 이 실제로 채워지는 경우를 지킨다. 아무 데도
       안 이어지지 않은 채로 둔다 — 성단 안 된 장비도 마디로만 서는지 함께 지킨다. */
    { id: 'a-tx', name: 'TX1', typeId: 'dev', parentAssetId: 'a-ofd', substationId: 'sa', floorId: 'fa' },
    { id: 'b-slot', name: '나슬롯', typeId: 'slot', parentAssetId: null, substationId: 'sb', floorId: null },
    { id: 'b-dev', name: '나단말', typeId: 'dev', parentAssetId: null, substationId: 'sb', floorId: null },
  ],
  ports: [
    /* 앞면 2심 + OPGW 2심 — 「앞면 i 번은 코어 i」가 유도되는 최소 모양이다. */
    { id: 'a-front1', assetId: 'a-slot', group: 'FIBER', index: 1, name: '광 1', medium: 'fiber', direction: 'BI', positions: 1 },
    { id: 'a-front2', assetId: 'a-slot', group: 'FIBER', index: 2, name: '광 2', medium: 'fiber', direction: 'BI', positions: 1 },
    { id: 'a-opgw', assetId: 'a-slot', group: 'TRUNK', index: 1, name: 'OPGW', medium: 'fiber', direction: 'BI', positions: 2 },
    { id: 'a-dev1', assetId: 'a-dev', group: 'FIBER', index: 1, name: '광 1', medium: 'fiber', direction: 'BI', positions: 1 },
    { id: 'a-tx1', assetId: 'a-tx', group: 'FIBER', index: 1, name: '광 1', medium: 'fiber', direction: 'BI', positions: 1 },
    { id: 'b-front1', assetId: 'b-slot', group: 'FIBER', index: 1, name: '광 1', medium: 'fiber', direction: 'BI', positions: 1 },
    { id: 'b-opgw', assetId: 'b-slot', group: 'TRUNK', index: 1, name: 'OPGW', medium: 'fiber', direction: 'BI', positions: 2 },
    { id: 'b-dev1', assetId: 'b-dev', group: 'FIBER', index: 1, name: '광 A', medium: 'fiber', direction: 'BI', positions: 1 },
  ],
  cables: [
    { id: 'jumper', aPortId: 'a-dev1', bPortId: 'a-front1', categoryId: null },
    { id: 'opgw', aPortId: 'a-opgw', bPortId: 'b-opgw', categoryId: null },
    { id: 'b-jumper', aPortId: 'b-dev1', bPortId: 'b-front1', categoryId: null },
  ],
  truncated: false,
};

/* 이 상자가 부르는 훅은 `useReach` 하나뿐이다 — 카탈로그를 안 쓴다(모달 주석 참조). */
vi.mock('../hooks', () => ({
  useReach: () => ({ data: reach, isLoading: false, error: null }),
}));

describe('TopologyModal', () => {
  it('장비가 마디로 선다 — 국 이름은 마디 안에 붙는다', () => {
    render(<TopologyModal open seedPortId="a-dev1" onClose={() => {}} />);
    expect(screen.getByText('가단말')).toBeInTheDocument();
    expect(screen.getByText('나단말')).toBeInTheDocument();
    expect(screen.getByText('가국')).toBeInTheDocument();
    expect(screen.getByText('나국')).toBeInTheDocument();
  });

  it('설비 아래 장비는 설비 이름과 함께 선다 — 아무 데도 안 닿아도 마디로는 선다', () => {
    render(<TopologyModal open seedPortId="a-dev1" onClose={() => {}} />);
    expect(screen.getByText('TX1')).toBeInTheDocument();
    expect(screen.getByText('가국 · OFD')).toBeInTheDocument();
  });

  /* 공용 `Modal` 은 `createPortal(document.body)` 로 그린다 — `render()` 가 돌려주는
     지역 container 는 포털 밖이라 아무것도 안 잡힌다. 그림을 찾을 곳은 body 다. */
  it('구간 케이블이 줄로 그려진다 — 슬롯·OPGW 를 지나도 장비 사이는 한 줄', () => {
    render(<TopologyModal open seedPortId="a-dev1" onClose={() => {}} />);
    expect(document.body.querySelectorAll('svg line')).toHaveLength(1);
  });

  it('닫혀 있으면 아무것도 그리지 않는다', () => {
    render(<TopologyModal open={false} seedPortId="a-dev1" onClose={() => {}} />);
    expect(screen.queryByText('가국')).not.toBeInTheDocument();
  });

  /* 공용 `Modal` 은 포털이라 여기도 body 에서 찾는다(위 주석 참조). */
  it('마디 상자가 좌표에 놓이고 서로 겹치지 않는다', () => {
    render(<TopologyModal open seedPortId="a-dev1" onClose={() => {}} />);
    const boxes = [...document.body.querySelectorAll('[data-topo-node]')];
    expect(boxes).toHaveLength(3); // 가단말 · TX1 · 나단말
    const at = boxes.map((b) => (b as HTMLElement).style.transform);
    expect(new Set(at).size).toBe(3);
  });

  /* 코어가 지나간 줄만 굵다 — 강조는 두 단계뿐이다. */
  it('내 코어가 간 구간만 강조된다', () => {
    render(<TopologyModal open seedPortId="a-dev1" onClose={() => {}} />);
    const lit = document.body.querySelectorAll('line[data-lit="true"]');
    expect(lit).toHaveLength(1);
  });

  it('줄에 대고 물으면 양끝 포트 이름이 나온다', () => {
    render(<TopologyModal open seedPortId="a-dev1" onClose={() => {}} />);
    expect(document.body.querySelector('line title')?.textContent).toBe('광 1 ↔ 광 A');
  });

  it('층 이름은 층이 둘 이상인 국에만 — 여기서는 안 나온다', () => {
    render(<TopologyModal open seedPortId="a-dev1" onClose={() => {}} />);
    expect(screen.queryByText('1층')).not.toBeInTheDocument();
  });

  /* 말줄임(`truncate`)이 있으면 「…으로 생략된 경로도 다 보이게」 요구를 못 지킨다 —
     이름이 길면 잘리지 말고 접혀야 한다(`break-words`). */
  it('마디 이름은 말줄임 대신 접힌다', () => {
    render(<TopologyModal open seedPortId="a-dev1" onClose={() => {}} />);
    expect(document.body.querySelectorAll('.truncate')).toHaveLength(0);
    const box = document.body.querySelector('[data-topo-node]') as HTMLElement;
    expect(box.querySelector('.text-sm')?.className).toMatch(/break-words/);
    expect(box.querySelector('.text-xs')?.className).toMatch(/break-words/);
  });

  describe('배율 — 판에 맞춰 그림을 줄인다(눈대중 상수 없이 식으로)', () => {
    it('판 크기를 잴 수 없으면(시험 환경) 배율은 1이다', () => {
      render(<TopologyModal open seedPortId="a-dev1" onClose={() => {}} />);
      const stage = document.body.querySelector('[data-topo-stage]') as HTMLElement;
      expect(stage.style.transform).toBe('scale(1)');
    });

    /* 판 크기를 흉내 내는 가짜 ResizeObserver — 관찰을 시작하는 순간 정해 둔
       contentRect 로 콜백을 부른다. 그림은 여러 마디짜리라 판(80×60)보다 훨씬 크므로
       축소(<1)가 나와야 하고, 그 값은 눈대중이 아니라 `min(1, 판/그림)` 식과 일치해야 한다. */
    it('판 크기를 재면 배율이 min(1, 판/그림) 식으로 나온다', () => {
      class FakeResizeObserver {
        constructor(private cb: ResizeObserverCallback) {}
        observe() {
          this.cb(
            [{ contentRect: { width: 80, height: 60 } } as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          );
        }
        disconnect() {}
        unobserve() {}
      }
      vi.stubGlobal('ResizeObserver', FakeResizeObserver);

      render(<TopologyModal open seedPortId="a-dev1" onClose={() => {}} />);
      const stage = document.body.querySelector('[data-topo-stage]') as HTMLElement;
      const figureW = parseFloat(stage.style.width);
      const figureH = parseFloat(stage.style.height);
      const expected = Math.min(1, 80 / figureW, 60 / figureH);
      expect(stage.style.transform).toBe(`scale(${expected})`);
      expect(expected).toBeLessThan(1); // 축소가 실제로 일어났는지 — 공허한 통과 방지

      vi.unstubAllGlobals();
    });
  });
});
