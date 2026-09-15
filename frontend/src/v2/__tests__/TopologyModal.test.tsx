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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { V2Reach } from '../types';
import { TopologyModal } from '../components/topology/TopologyModal';
import { useReach } from '../hooks';

const reach: V2Reach = {
  substations: [{ id: 'sa', name: '가국' }, { id: 'sb', name: '나국' }],
  floors: [{ id: 'fa', name: '1층', substationId: 'sa' }],
  assets: [
    { id: 'a-ofd', name: 'OFD', typeId: null, parentAssetId: null, substationId: 'sa', floorId: 'fa' },
    { id: 'a-slot', name: '가슬롯', typeId: 'slot', parentAssetId: 'a-ofd', substationId: 'sa', floorId: null },
    { id: 'a-dev', name: '가단말', typeId: 'dev', parentAssetId: null, substationId: 'sa', floorId: 'fa' },
    /* 설비(OFD) 아래 장비 — **함체가 마디로 서는** 경우를 지킨다.
       상대는 **다른 국**에 둔다: 토폴로지는 국을 벗어나는 줄만 그리므로(추적의 여집합)
       한 국 안에서만 이어진 장비는 마디가 되지 않는다. */
    { id: 'a-tx', name: 'TX1', typeId: 'dev', parentAssetId: 'a-ofd', substationId: 'sa', floorId: 'fa' },
    { id: 'b-tx', name: 'TX2', typeId: 'dev', parentAssetId: null, substationId: 'sb', floorId: null },
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
    { id: 'b-tx1', assetId: 'b-tx', group: 'FIBER', index: 1, name: '광 1', medium: 'fiber', direction: 'BI', positions: 1 },
  ],
  cables: [
    { id: 'tx', aPortId: 'a-tx1', bPortId: 'b-tx1', categoryId: null },
    { id: 'jumper', aPortId: 'a-dev1', bPortId: 'a-front1', categoryId: null },
    { id: 'opgw', aPortId: 'a-opgw', bPortId: 'b-opgw', categoryId: null },
    { id: 'b-jumper', aPortId: 'b-dev1', bPortId: 'b-front1', categoryId: null },
  ],
  truncated: false,
};

/* 평행 구간 전용 픽스처 — 같은 장비 둘을 코어 둘로 잇되, 포트 id 를 일부러 엇갈리게
   짓는다(dev-x 쪽 zz2 가 dev-y 쪽 aa2 보다 사전순으로 뒤). `buildTopologyGraph` 가 줄의
   source/target 을 포트 id 로 정하면 이 두 줄만 방향이 반대로 서고, 캔버스는 그 방향에서
   평행선의 벌림을 구하므로 반대 방향인 두 줄은 벌림이 상쇄돼 완전히 겹쳐 그려진다
   (2026-08-31, 사용자가 화면에서 신고). 위 `reach` 를 그대로 쓰지 않는 이유는 기존
   시험들이 「구간 케이블은 줄 하나」를 전제하기 때문이다 — 거기에 평행 구간을 더하면
   그 시험들이 깨진다. */
const parallelReach: V2Reach = {
  /* 국을 갈라 둔다 — 토폴로지는 국을 벗어나는 줄만 그리므로 한 국에 두면 줄이 안 선다. */
  substations: [{ id: 's', name: 's국' }, { id: 't', name: 't국' }],
  floors: [],
  assets: [
    { id: 'dev-x', name: '장비X', typeId: null, parentAssetId: null, substationId: 's', floorId: null },
    { id: 'dev-y', name: '장비Y', typeId: null, parentAssetId: null, substationId: 't', floorId: null },
  ],
  ports: [
    { id: 'x1', assetId: 'dev-x', group: 'FIBER', index: 1, name: '광 1', medium: 'fiber', direction: 'BI', positions: 1 },
    { id: 'y1', assetId: 'dev-y', group: 'FIBER', index: 1, name: '광 A', medium: 'fiber', direction: 'BI', positions: 1 },
    { id: 'zz2', assetId: 'dev-x', group: 'FIBER', index: 2, name: '광 2', medium: 'fiber', direction: 'BI', positions: 1 },
    { id: 'aa2', assetId: 'dev-y', group: 'FIBER', index: 2, name: '광 B', medium: 'fiber', direction: 'BI', positions: 1 },
  ],
  cables: [
    { id: 'c1', aPortId: 'x1', bPortId: 'y1', categoryId: null },
    { id: 'c2', aPortId: 'zz2', bPortId: 'aa2', categoryId: null },
  ],
  truncated: false,
};

/* 패치 전용 픽스처 — 앞국 단말 ⇄ (가운데국을 그냥 지나) ⇄ 뒷국 단말. 가운데국에서는
   슬롯끼리 점퍼로 물려 통과하므로 그 국은 마디가 아니고, 줄 하나에 「가운데국 (패치)」만
   적힌다. */
const patchReach: V2Reach = {
  substations: [{ id: 'p1', name: '앞국' }, { id: 'p2', name: '가운데국' }, { id: 'p3', name: '뒷국' }],
  floors: [],
  assets: [
    { id: 'pda', name: '앞단말', typeId: null, parentAssetId: null, substationId: 'p1', floorId: null },
    { id: 'pa', name: '앞슬롯', typeId: null, parentAssetId: null, substationId: 'p1', floorId: null },
    { id: 'pw', name: '가운데서', typeId: null, parentAssetId: null, substationId: 'p2', floorId: null },
    { id: 'pe', name: '가운데동', typeId: null, parentAssetId: null, substationId: 'p2', floorId: null },
    { id: 'pc', name: '뒷슬롯', typeId: null, parentAssetId: null, substationId: 'p3', floorId: null },
    { id: 'pdc', name: '뒷단말', typeId: null, parentAssetId: null, substationId: 'p3', floorId: null },
  ],
  ports: [
    ...['pa', 'pw', 'pe', 'pc'].flatMap((id) => [
      { id: `${id}-f1`, assetId: id, group: 'FIBER', index: 1, name: '광 1', medium: 'fiber', direction: 'BI' as const, positions: 1 },
      { id: `${id}-t`, assetId: id, group: 'TRUNK', index: 1, name: 'OPGW', medium: 'fiber', direction: 'BI' as const, positions: 2 },
    ]),
    { id: 'pda-1', assetId: 'pda', group: 'FIBER', index: 1, name: '광 1', medium: 'fiber', direction: 'BI' as const, positions: 1 },
    { id: 'pdc-1', assetId: 'pdc', group: 'FIBER', index: 1, name: '광 1', medium: 'fiber', direction: 'BI' as const, positions: 1 },
  ],
  cables: [
    { id: 'j1', aPortId: 'pda-1', bPortId: 'pa-f1', categoryId: null },
    { id: 'opgw-1', aPortId: 'pa-t', bPortId: 'pw-t', categoryId: null },
    { id: 'patch', aPortId: 'pw-f1', bPortId: 'pe-f1', categoryId: null },
    { id: 'opgw-2', aPortId: 'pe-t', bPortId: 'pc-t', categoryId: null },
    { id: 'j2', aPortId: 'pc-f1', bPortId: 'pdc-1', categoryId: null },
  ],
  truncated: false,
};

/* 이 상자가 부르는 훅은 `useReach` 하나뿐이다 — 카탈로그를 안 쓴다(모달 주석 참조).
   `vi.fn()` 으로 만들어 두는 이유는 평행 구간 시험 하나만 `mockReturnValueOnce` 로
   다른 자료를 흘려 넣기 위해서다 — 다른 시험은 전부 기본값(`reach`)을 그대로 쓴다. */
vi.mock('../hooks', () => ({ useReach: vi.fn() }));

/* 기본 답은 **시험마다 다시 심는다** — 이 프로젝트는 `mockReset: true` 라(vitest.config)
   시험 하나가 끝날 때마다 구현이 지워진다. 만들 때 한 번만 심어 두면 그 뒤로는 전부
   `undefined` 를 받아 상자가 첫 줄에서 깨진다. */
beforeEach(() => {
  vi.mocked(useReach).mockReturnValue({ data: reach, isLoading: false, error: null } as never);
});

/** `scale(0.73…)` 에서 숫자만 — 배율을 값으로 견주려고. */
const scaleOf = (t: string) => parseFloat(/scale\(([\d.]+)\)/.exec(t)?.[1] ?? '1');
/** `translate(12px, 34px)` 에서 두 수만. */
const translateOf = (t: string) => {
  const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(t);
  return { x: parseFloat(m?.[1] ?? '0'), y: parseFloat(m?.[2] ?? '0') };
};

describe('TopologyModal', () => {
  it('장비가 마디로 선다 — 국 이름은 마디 안에 붙는다', () => {
    render(<TopologyModal open seedPortId="a-dev1" onClose={() => {}} />);
    expect(screen.getByText('가단말')).toBeInTheDocument();
    expect(screen.getByText('나단말')).toBeInTheDocument();
    /* 국 이름은 마디마다 붙으므로 한 국에 장비가 둘이면 두 번 나온다 — 있기만 하면 된다. */
    expect(screen.getAllByText('가국').length).toBeGreaterThan(0);
    expect(screen.getAllByText('나국').length).toBeGreaterThan(0);
  });

  it('설비 아래 장비는 설비가 마디로 선다 — 어느 장비였는지는 줄에 적힌다', () => {
    render(<TopologyModal open seedPortId="a-dev1" onClose={() => {}} />);
    /* 마디는 OFD 다. TX1 은 박스로 서지 않는다 — 한 함체면 한 장비이기 때문이다. */
    expect(screen.getByText('OFD')).toBeInTheDocument();
    expect(screen.queryByText('TX1')).not.toBeInTheDocument();
    /* 그래도 어느 카드의 어느 포트였는지는 사라지지 않는다 — 줄에 물으면 나온다. */
    const titles = [...document.body.querySelectorAll('svg title')].map((t) => t.textContent);
    expect(titles.some((t) => t?.includes('TX1 · 광 1'))).toBe(true);
  });

  /* 공용 `Modal` 은 `createPortal(document.body)` 로 그린다 — `render()` 가 돌려주는
     지역 container 는 포털 밖이라 아무것도 안 잡힌다. 그림을 찾을 곳은 body 다. */
  it('구간 케이블이 줄로 그려진다 — 슬롯·OPGW 를 지나도 장비 사이는 한 줄', () => {
    render(<TopologyModal open seedPortId="a-dev1" onClose={() => {}} />);
    expect(document.body.querySelectorAll('svg line')).toHaveLength(2); // 가↔나, TX1↔TX2
  });

  it('닫혀 있으면 아무것도 그리지 않는다', () => {
    render(<TopologyModal open={false} seedPortId="a-dev1" onClose={() => {}} />);
    expect(screen.queryByText('가국')).not.toBeInTheDocument();
  });

  /* 공용 `Modal` 은 포털이라 여기도 body 에서 찾는다(위 주석 참조). */
  it('마디 상자가 좌표에 놓이고 서로 겹치지 않는다', () => {
    render(<TopologyModal open seedPortId="a-dev1" onClose={() => {}} />);
    const boxes = [...document.body.querySelectorAll('[data-topo-node]')];
    expect(boxes).toHaveLength(4); // 가단말 · 나단말 · TX1 · TX2
    const at = boxes.map((b) => (b as HTMLElement).style.transform);
    expect(new Set(at).size).toBe(4);
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

  /* 그래프 자료(edges)는 코어 둘로 잇는 두 줄을 정확히 갈라 담지만, 포트 id 가 줄마다
     엇갈리면 캔버스가 벌리는 방향까지 어긋나 두 줄이 완전히 겹쳐 그려질 수 있었다
     (`packages/core/src/topology/graph.test.ts` 의 같은 이름 시험 참고 — 거기는 자료가
     옳은지, 여기는 그 자료로 실제 화면이 옳게 그려지는지를 본다). 개수부터 먼저
     단언해 공허하게 통과하지 않게 한다. */
  it('평행 구간은 두 줄로 갈라져 보인다 — 포트 id 가 줄마다 엇갈려도', () => {
    vi.mocked(useReach).mockReturnValueOnce({ data: parallelReach, isLoading: false, error: null });
    render(<TopologyModal open seedPortId="x1" onClose={() => {}} />);
    const lines = [...document.body.querySelectorAll('svg line')];
    expect(lines).toHaveLength(2);
    /* 두 끝점을 정렬해 방향과 무관한 자리로 견준다 — 방향만 뒤집힌 같은 자리(P→Q 와
       Q→P)를 「다른 줄」로 잘못 세면 겹쳐 그려진 버그도 공허하게 통과한다. */
    const at = lines.map((l) => {
      const pts = [
        [l.getAttribute('x1'), l.getAttribute('y1')],
        [l.getAttribute('x2'), l.getAttribute('y2')],
      ].sort(([ax, ay], [bx, by]) => Number(ax) - Number(bx) || Number(ay) - Number(by));
      return pts.map((p) => p.join(',')).join('|');
    });
    expect(new Set(at).size).toBe(2);
  });

  /* 국을 그냥 지나가도록 패치된 심선은 가운데 국을 건너뛴 **직결**로 선다. 장비끼리 이은
     길과 뜻이 다르니 무엇으로 이었는지를 줄 위에 적는다(사용자: 「직결할 때 패치한 포트
     내용을 간단하게 적어주면 되잖아, 엣지에」). */
  it('패치로 지나간 국이 줄 위에 적힌다', () => {
    vi.mocked(useReach).mockReturnValueOnce({ data: patchReach, isLoading: false, error: null } as never);
    render(<TopologyModal open seedPortId="pda-1" onClose={() => {}} />);
    const labels = [...document.body.querySelectorAll('svg text')].map((t) => t.textContent);
    expect(labels).toContain('가운데국 (패치)');
    /* 장비끼리 이은 줄에는 글자를 안 단다 — 그림이 글자로 덮인다. */
    expect(labels).toHaveLength(1);
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

  /* 판정은 화면이 다시 계산하지 않는다 — `nodes` 에 `isSeed` 인 마디가 하나도 없으면
     그 경우다(core 가 이미 정규화 실패를 그렇게 나타낸다, graph.test.ts 참고). */
  describe('시드가 어느 장비에도 안 닿을 때', () => {
    it('닿으면 안내가 없다', () => {
      render(<TopologyModal open seedPortId="a-dev1" onClose={() => {}} />);
      expect(screen.queryByText(/어느 장비에도/)).not.toBeInTheDocument();
    });

    it('안 닿으면 안내가 뜨고, 마디·줄은 그대로 선다', () => {
      // a-front2 는 어느 케이블에도 안 물렸다 — 정규화가 실패해 isSeed 인 마디가 없다.
      render(<TopologyModal open seedPortId="a-front2" onClose={() => {}} />);
      expect(screen.getByText('이 포트는 아직 어느 장비에도 닿지 않습니다 — 아래는 같은 광 계통의 장비들입니다.')).toBeInTheDocument();
      expect(screen.getByText('가단말')).toBeInTheDocument();
      expect(screen.getByText('나단말')).toBeInTheDocument();
      expect(document.body.querySelectorAll('svg line')).toHaveLength(2); // 가↔나, TX1↔TX2
    });
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

    /* 판에 맞춘 배율은 **처음 보이는 배율**일 뿐이다 — 촘촘한 링은 그대로는 못 읽으므로
       손으로 키울 수 있어야 한다. 휠은 가리키는 자리를 붙든 채 키운다(가운데 기준으로
       키우면 보고 있던 곳이 밖으로 밀려나 매번 다시 찾아야 한다). */
    it('휠을 굴리면 커지고, 가리킨 자리가 제자리에 남는다', () => {
      /* 판 크기를 흉내 내야 「처음 맞춘 배율」이 1보다 작아지고 가운데 여백도 생긴다 —
         그 여백이 배율에 딸려 다시 계산되면 키우는 순간 그림이 통째로 튄다(실제 버그). */
      class FakeResizeObserver {
        constructor(private cb: ResizeObserverCallback) {}
        observe() {
          this.cb([{ contentRect: { width: 400, height: 300 } } as ResizeObserverEntry],
            this as unknown as ResizeObserver);
        }
        disconnect() {}
        unobserve() {}
      }
      vi.stubGlobal('ResizeObserver', FakeResizeObserver);
      render(<TopologyModal open seedPortId="a-dev1" onClose={() => {}} />);
      const panel = document.body.querySelector('[data-topo-gutter]')!.parentElement!.parentElement!;
      const stage = document.body.querySelector('[data-topo-stage]') as HTMLElement;
      const before = stage.style.transform;

      /* 여백 상자는 화면에서 (0,0) 에 있다고 두고(jsdom 은 배치가 없어 모두 0이다),
         (100,100) 을 가리켜 키운다. 그 자리에 있던 **그림 좌표**가 키운 뒤에도 같은 화면
         자리에 있어야 한다 — 그러지 않으면 그림이 엉뚱한 데로 튄다. */
      const gutter = () => document.body.querySelector('[data-topo-gutter]') as HTMLElement;
      const panLayer = () => gutter().parentElement as HTMLElement;
      const stageEl = () => document.body.querySelector('[data-topo-stage]') as HTMLElement;
      /* 그림 좌표 한 점이 화면 어디에 오는가 — 판(jsdom 에서 0) + 여백 + 옮긴 몫 + 배율.
         「가리킨 자리가 제자리에 남는다」는 이 값으로만 정직하게 잴 수 있다. */
      const screenOf = (fx: number) =>
        parseFloat(gutter().style.marginLeft) + translateOf(panLayer().style.transform).x
        + fx * scaleOf(stageEl().style.transform);

      const at = 100;
      const anchor = (at - parseFloat(gutter().style.marginLeft)
        - translateOf(panLayer().style.transform).x) / scaleOf(before);

      const frameBefore = `${gutter().style.width}/${gutter().style.height}/${gutter().style.marginLeft}/${gutter().style.marginTop}`;

      /* **여러 번 굴린다.** 한 번만 보면 기준이 조금씩 밀리는 것을 못 잡는다 — 사용자가
         본 것이 그것이다(「실시간으로 계속 확대 기준값이 바뀌니까 어색하다」). */
      for (let i = 0; i < 3; i++) {
        fireEvent.wheel(panel, { deltaY: -100, clientX: at, clientY: at });
        expect(screenOf(anchor)).toBeCloseTo(at, 6);
      }
      const after = stageEl().style.transform;
      expect(scaleOf(after)).toBeCloseTo(scaleOf(before) * 1.1 ** 3, 6);

      /* 여백 상자는 **꿈쩍도 하지 않아야** 한다 — 그것이 배율에 딸려 다시 계산되면 키우는
         순간 그림이 통째로 튄다. 키운 몫은 옮긴 몫(pan)으로만 표현한다. */
      expect(`${gutter().style.width}/${gutter().style.height}/${gutter().style.marginLeft}/${gutter().style.marginTop}`)
        .toBe(frameBefore);

      /* 되돌리는 자리가 생긴다 — 끌다 길을 잃으면 여기서 처음으로 돌아온다. */
      const reset = screen.getByRole('button', { name: '맞춰 보기' });
      fireEvent.click(reset);
      expect((document.body.querySelector('[data-topo-stage]') as HTMLElement).style.transform).toBe(before);
      vi.unstubAllGlobals();
    });

    /* 배율은 한 축만 꽉 채운다 — 다른 축에는 반드시 여백이 남는데, 그걸 그냥 두면 그림이
       왼쪽 위로 쏠리고 반대쪽에만 빈 판이 펼쳐진다(사용자 지적). 남는 자리는 양쪽으로
       똑같이 나뉘어야 한다. */
    it('남는 자리를 양쪽으로 나눠 그림이 판 가운데 선다', () => {
      class FakeResizeObserver {
        constructor(private cb: ResizeObserverCallback) {}
        observe() {
          this.cb(
            [{ contentRect: { width: 1600, height: 120 } } as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          );
        }
        disconnect() {}
        unobserve() {}
      }
      vi.stubGlobal('ResizeObserver', FakeResizeObserver);

      render(<TopologyModal open seedPortId="a-dev1" onClose={() => {}} />);
      const stage = document.body.querySelector('[data-topo-stage]') as HTMLElement;
      const gutter = document.body.querySelector('[data-topo-gutter]') as HTMLElement;
      const figureW = parseFloat(stage.style.width);
      const figureH = parseFloat(stage.style.height);
      const scale = Math.min(1, 1600 / figureW, 120 / figureH);
      /* 판이 가로로 길어 배율은 높이가 정한다 — 그래서 가로에 여백이 남고, 그 절반이
         왼쪽에 와야 한다. 여백이 실제로 남는 상황인지 먼저 못 박는다(공허한 통과 방지). */
      const slackX = 1600 - figureW * scale;
      expect(slackX).toBeGreaterThan(0);
      expect(parseFloat(gutter.style.marginLeft)).toBeCloseTo(slackX / 2, 6);
      expect(parseFloat(gutter.style.marginTop)).toBeCloseTo(Math.max(0, 120 - figureH * scale) / 2, 6);

      vi.unstubAllGlobals();
    });
  });
});
