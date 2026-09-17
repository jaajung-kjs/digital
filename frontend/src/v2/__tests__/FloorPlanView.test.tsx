/**
 * FloorPlanView — 상태 전이 + 스토어 스테이징 테스트 (W4-1)
 *
 * jsdom에서 canvas 렌더는 목(전역 setup.ts에서 getContext/ResizeObserver 이미 목킹됨)이라
 * 픽셀은 단언하지 않는다. 대신 REAL 컴포넌트 + REAL 워킹카피 스토어를 구동해
 * (i) 케이블 도구 FSM 전이와 스테이징, (ii) ESC 취소, (iii) 배치 팔레트 armed 전이만
 * 단언한다 — 로직을 테스트에서 재구현하지 않는다.
 *
 * getBoundingClientRect가 jsdom에서 항상 {top:0,left:0}을 반환하므로, viewport 초기값
 * (zoom:100, pan:0,0)에서 screenToWorld(clientX, clientY, ...) === {x:clientX, y:clientY} —
 * 즉 자산 좌표 = 클릭 clientX/clientY로 그대로 맞춰 좌표 변환을 재구현하지 않는다.
 */
import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { v2WorkingCopyStore } from '../store/workingCopyStore';
import { emptyOverlays } from '../store/workingCopyStore';
import { FloorPlanView } from '../components/floorplan/FloorPlanView';
import type { V2Asset, V2AssetType, V2Cable, V2Floor } from '../types';
import type { CablePickRequest } from '../cablePick';
import {
  openSession, withFrom,
  type ConnectSession, type ConnectFrom, type PendingConnect,
} from '../connectSession';
import { ConnectCategoryDialog } from '../components/ConnectCategoryDialog';
import { connectCable } from '../cableActions';

/* useV2Catalog 만 목킹 — 도면에 놓이는 것은 **설비 품목**뿐이다(장비 품목에는 배치 개념이
   없다). 케이블 그룹 1개(카테고리 1개)도 공급한다. */
const mockTypes: V2AssetType[] = [
  {
    id: 't-panel', key: 'PANEL', name: '배전반', categoryId: 'c1', sortOrder: 1,
    assetCount: 0, laborCode: null, installManDays: 0, removeManDays: 0, relocateManDays: 0,
    portTemplates: [],
  },
];
const mockAssemblies = [
  {
    id: 'asm-panel', key: 'PANEL-SET', name: '배전반', categoryId: 'c1',
    sortOrder: 1,
    items: [{ id: 'it1', typeId: 't-panel', name: '배전반', col: 0, row: 0, colSpan: 1, rowSpan: 1, sortOrder: 0 }],
  },
];

/* 종류 상자와 도면이 **같은 어휘**를 본다 — 하네스가 상자에 직접 넘기므로 여기 이름을 둔다. */
const mockCableGroups = [
  {
    id: 'g1', key: 'power', name: '전력', color: '#333333', laborCode: null,
    installManDays: 0, removeManDays: 0, sortOrder: 1,
    categories: [{ id: 'cat1', name: '저압', sortOrder: 1 }, { id: 'cat2', name: '고압', sortOrder: 2 }],
  },
];

vi.mock('../hooks', () => ({
  useV2Catalog: () => ({
    data: {
      categories: [{ id: 'c1', key: 'panel', name: '배전반류', sortOrder: 1 }],
      types: mockTypes,
      assemblies: mockAssemblies,
      cableGroups: mockCableGroups,
    },
  }),
  // 포트 피커가 매체 키를 사람이 읽는 이름으로 바꿔 보여준다 — 모의에서는 키를 그대로 돌려준다.
  // 장비의 포트를 놓는 순간 만들려면 장비 품목이 필요하다(저장 전에도 포트가 보여야 한다).
  useTypesById: (types?: { id: string }[]) => new Map((types ?? []).map((t) => [t.id, t])),
  useMediumLabel: () => (key: string) => key,
  useMediumColor: () => () => null,
  /* 층을 만드는 길이 평면도에도 있다(빈 화면 + 탭 줄 끝) — 여기서는 부르지 않는다. */
  /* 대국 상자가 변전소 목록을 조직 트리에서 가져온다 — 여기서는 비어 있어도 된다. */
  useV2OrgTree: () => ({ data: null }),
  useOrgMutations: () => ({
    createOrgNode: { mutate: () => {}, mutateAsync: async () => {}, isPending: false },
    renameOrgNode: { mutate: () => {}, mutateAsync: async () => {}, isPending: false },
    deleteOrgNode: { mutate: () => {}, mutateAsync: async () => {}, isPending: false },
  }),
}));

const floor: V2Floor = { id: 'f1', name: '1층', sortOrder: 1, substationId: 'sub-1' };

const port = (id: string, assetId: string) =>
  ({ id, assetId, group: 'A', index: 1, name: `포트 ${id}`, direction: 'BI' as const, medium: 'power' });

const asset = (id: string, x: number, y: number, extra: Partial<V2Asset> = {}): V2Asset => ({
  id, name: `자산-${id}`, typeId: 't-panel', substationId: 'sub-1', status: 'normal',
  floorId: 'f1', x, y, width: 50, height: 50,
  parentAssetId: null, assemblyId: null, col: null, row: null, colSpan: null, rowSpan: null,
  fieldValues: {}, updatedAt: 'v1', ports: [port(`p-${id}`, id)], ...extra,
});

function setStore(assets: V2Asset[], cables: V2Cable[] = []) {
  v2WorkingCopyStore.setState({
    substationId: 'sub-1',
    saved: {
      substation: { id: 'sub-1', name: '변전소', branchId: 'b1', sortOrder: 1 },
      floors: [floor], assets, maintenanceLogs: [], inspectionLogs: [], cables, photos: [],
    },
    overlays: emptyOverlays(),
    baseVersions: {},
  });
}

/**
 * 포트를 고르는 판은 **상세 패널의 포트 탭**에 있다 — 평면도는 「이 자산에서 골라 달라」는
 * 요청을 내보내고 고른 결과를 콜백으로 받을 뿐이다(`cablePick.ts`).
 *
 * 그리고 「지금 무엇을 잇는 중인가」는 **연결 세션**이 들고 그 주인은 페이지다
 * (`V2WorkspacePage`) — 오버레이가 탭·층·국을 옮겨도 남아야 하므로 도면이 쥘 수 없다.
 * 그래서 시험도 그 배선을 흉내낸다: 작은 하네스가 세션을 들고 도면에 내려 준다.
 */
/**
 * 페이지가 하는 일을 그대로 — **세션과 종류 상자를 이 하네스가 쥔다.**
 *
 * 도면은 「포트를 골랐다」만 알린다(`onPortPicked`). 출발인지 도착인지, 무엇으로 이을지는
 * 세션을 쥔 쪽이 정하므로, 도면만 그려서는 잇기가 끝나지 않는다 — 실제 배선과 같은 모양으로
 * 여기 세운다(`V2WorkspacePage` 의 `pickPort`·`confirmConnect`).
 */
function Harness({
  onSelectAsset = vi.fn(),
  initialFrom = null,
  pick,
}: {
  onSelectAsset?: (id: string | null) => void;
  /** 포트 탭·표에서 시작한 경우 — 출발이 이미 정해진 채로 세션이 선다. */
  initialFrom?: ConnectFrom | null;
  pick: { current: CablePickRequest | null };
}) {
  const origin = { substationId: 'sub-1', view: '평면도' as const, floorId: 'f1' };
  const [session, setSession] = useState<ConnectSession | null>(
    initialFrom ? withFrom(openSession(origin), initialFrom) : null,
  );
  const [pending, setPending] = useState<PendingConnect | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickPort = (portId: string) => {
    const assets = v2WorkingCopyStore.getState().effectiveAssets();
    const owner = assets.find((a) => a.ports.some((p) => p.id === portId));
    const port = owner?.ports.find((p) => p.id === portId);
    if (!owner || !port) return;
    const label = `${owner.name} · ${port.name}`;
    const from = session?.from;
    if (!from) {
      setSession((s) => withFrom(s ?? openSession(origin), { portId, label, substationId: 'sub-1', medium: port.medium }));
      return;
    }
    setError(null);
    setPending({ from, toPortId: portId, toLabel: label });
  };

  return (
    <>
      <FloorPlanView
        substationId="sub-1"
        selectedAssetId={null}
        onSelectAsset={onSelectAsset}
        session={session}
        onOpenConnect={(from) => setSession(from ? withFrom(openSession(origin), from) : openSession(origin))}
        onPortPicked={pickPort}
        onCancelConnect={() => { setSession(null); setPending(null); }}
        onPickPort={(req) => { pick.current = req; }}
      />
      {pending && (
        <ConnectCategoryDialog
          pending={pending}
          groups={mockCableGroups}
          error={error}
          onConfirm={(categoryId) => {
            const wc = v2WorkingCopyStore.getState();
            const assets = wc.effectiveAssets();
            const toPort = assets.flatMap((a) => a.ports).find((x) => x.id === pending.toPortId);
            if (!toPort) { setError('이을 포트를 찾을 수 없습니다'); return; }
            const err = connectCable({
              firstPortId: pending.from.portId, toPort, assets, cables: wc.effectiveCables(),
              substationId: pending.from.substationId, categoryId, mediumKey: pending.from.medium,
              pathPoints: [],
            });
            if (err) { setError(err); return; }
            setPending(null);
            setSession(null);
          }}
          onCancel={() => { setPending(null); setError(null); }}
        />
      )}
    </>
  );
}

function renderFloorPlan(
  onSelectAsset: (id: string | null) => void = vi.fn(),
  extra: { initialFrom?: ConnectFrom | null } = {},
) {
  const pick: { current: CablePickRequest | null } = { current: null };
  const utils = render(<Harness onSelectAsset={onSelectAsset} pick={pick} {...extra} />);
  return { ...utils, pick };
}

/** 지금 고르라고 온 자산에서 포트 하나를 고른다 — 판이 하던 일을 그대로. */
function choosePort(pick: { current: CablePickRequest | null }, portId: string) {
  const req = pick.current;
  if (!req) throw new Error('포트를 고르라는 요청이 오지 않았다');
  /* 저장 전 자산의 포트도 고를 수 있어야 하므로 **워킹카피 전체**에서 찾는다. */
  const target = v2WorkingCopyStore.getState().effectiveAssets()
    .flatMap((a) => a.ports)
    .find((p) => p.id === portId);
  if (!target) throw new Error(`포트 ${portId} 없음`);
  // 판이 아니라 콜백으로 부르므로 React 밖의 호출이다 — act 로 감싸야 전이가 반영된다.
  act(() => req.onSelect(target as never));
}

/** 케이블 도구가 켜져 있는가 — 「케이블」 단추가 주 버튼으로 솟는다. */
const cableArmed = () => screen.getByRole('button', { name: '케이블' }).className.includes('bg-primary');

describe('FloorPlanView — 케이블 잇기', () => {
  beforeEach(() => {
    // asset-a: (0,0)-(50,50), asset-b: (200,0)-(250,50) — jsdom rect가 항상 0,0이므로
    // clientX/clientY == world 좌표 (viewport 초기값 zoom:100/pan:0,0)
    setStore([asset('a', 0, 0), asset('b', 200, 0)]);
  });

  /** 지금 뜬 종류 상자에서 종류를 고르고 「연결」을 누른다. */
  function chooseCategory(id: string) {
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('케이블 종류'), { target: { value: id } });
    fireEvent.click(within(dialog).getByRole('button', { name: '연결' }));
  }

  const staged = () => Object.values(v2WorkingCopyStore.getState().overlays.cables.creates);

  it('도구 켜기 → 설비·포트 → 반대쪽 설비·포트 → 종류를 묻고 → 스테이지', () => {
    const { pick } = renderFloorPlan();

    fireEvent.click(screen.getByRole('button', { name: '케이블' }));
    expect(cableArmed()).toBe(true);

    // 첫 번째 자산(A) 클릭 → 그 자산에서 고르라는 요청
    fireEvent.click(screen.getByTestId('floorplan-canvas'), { clientX: 25, clientY: 25 });
    expect(pick.current?.assetId).toBe('a');
    choosePort(pick, 'p-a');
    /* 아직 상자는 없다 — 출발만 정해졌다. */
    expect(screen.queryByRole('dialog')).toBeNull();

    // 두 번째 자산(B) 클릭 → 그 자산에서 고르라는 요청
    fireEvent.click(screen.getByTestId('floorplan-canvas'), { clientX: 225, clientY: 25 });
    expect(pick.current?.assetId).toBe('b');
    /* 첫 끝점이 실려 온다 — 판이 「어디서 출발했나」를 적고 자기 자신을 가린다. */
    expect(pick.current?.firstEndpoint?.portId).toBe('p-a');
    choosePort(pick, 'p-b');

    /* **포트를 고른 순간 종류를 묻는다** — 무엇과 무엇을 잇는지도 글자로 함께 뜬다. */
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('자산-a · 포트 p-a');
    expect(dialog.textContent).toContain('자산-b · 포트 p-b');

    chooseCategory('cat2');
    expect(staged()).toHaveLength(1);
    expect(staged()[0]).toMatchObject({ aPortId: 'p-a', bPortId: 'p-b', categoryId: 'cat2' });
  });

  /**
   * **종류를 고르지 않으면 이어지지 않는다 — 그러나 고른 포트도 버려지지 않는다.**
   *
   * 예전에는 매체 그룹의 **첫 품목을 말없이** 집었다. 광 포트에서 시작하면 「OPGW」가 되는데
   * 정작 이으려던 것이 「광점퍼코드」여도 그랬다. 그 뒤에는 오버레이에서 **미리** 고르게 했는데,
   * 안 고른 채 포트를 누르면 「종류를 고르세요」로 튕기면서 **고른 포트 둘이 함께 사라졌다**.
   * 이제 상자가 열린 채로 기다린다 — 「연결」이 눌리지 않을 뿐이다.
   */
  it('종류를 고르기 전에는 연결할 수 없고, 고른 포트는 상자에 남는다', () => {
    const { pick } = renderFloorPlan();

    fireEvent.click(screen.getByRole('button', { name: '케이블' }));
    fireEvent.click(screen.getByTestId('floorplan-canvas'), { clientX: 25, clientY: 25 });
    choosePort(pick, 'p-a');
    fireEvent.click(screen.getByTestId('floorplan-canvas'), { clientX: 225, clientY: 25 });
    choosePort(pick, 'p-b');

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: '연결' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: '연결' }));
    expect(staged()).toHaveLength(0);

    /* 고른 것은 그대로 있다 — 이어서 종류만 고르면 이어진다. */
    chooseCategory('cat1');
    expect(staged()).toHaveLength(1);
  });

  /* 상자를 접으면 **고른 포트만** 버려지고 연결 모드는 남는다 — 처음부터 다시가 아니다. */
  it('종류 상자를 접으면 연결 모드는 남는다', () => {
    const { pick } = renderFloorPlan();

    fireEvent.click(screen.getByRole('button', { name: '케이블' }));
    fireEvent.click(screen.getByTestId('floorplan-canvas'), { clientX: 25, clientY: 25 });
    choosePort(pick, 'p-a');
    fireEvent.click(screen.getByTestId('floorplan-canvas'), { clientX: 225, clientY: 25 });
    choosePort(pick, 'p-b');

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(staged()).toHaveLength(0);
    /* 도구는 여전히 켜져 있다 — 다시 이을 곳을 고르면 된다. */
    expect(cableArmed()).toBe(true);
    fireEvent.click(screen.getByTestId('floorplan-canvas'), { clientX: 225, clientY: 25 });
    choosePort(pick, 'p-b');
    chooseCategory('cat1');
    expect(staged()).toHaveLength(1);
  });

  /**
   * **저장 전 설비에도 케이블을 잇는다.**
   *
   * 도면이 「이을 수 있는 것」을 고를 때 저장된 것만 세던 시절이 있었다. 그때 방금 놓은 설비는
   * 흐리게 그려지고 눌러도 열리지 않았다 — 포트 탭은 같은 자산의 빈 포트를 보여 주며 「이을 수
   * 있습니다」라고 적고 있는데도. 포트는 놓는 순간 화면이 만들고 그 id 로 저장되므로
   * (`portsForNewAsset` · 서버 `portIds`), 저장은 잇기의 전제가 아니다.
   */
  it('방금 놓은(저장 전) 설비도 끝점이 된다', () => {
    const fresh = asset('n', 400, 0, { updatedAt: '' });
    act(() => v2WorkingCopyStore.getState().stageAssetCreate(fresh));
    const { pick } = renderFloorPlan();

    fireEvent.click(screen.getByRole('button', { name: '케이블' }));
    /* 첫 끝점이 저장 전 자산 — 도면에서 눌리는가. */
    fireEvent.click(screen.getByTestId('floorplan-canvas'), { clientX: 425, clientY: 25 });
    expect(pick.current?.assetId).toBe('n');
    choosePort(pick, 'p-n');

    fireEvent.click(screen.getByTestId('floorplan-canvas'), { clientX: 25, clientY: 25 });
    expect(pick.current?.assetId).toBe('a');
    choosePort(pick, 'p-a');
    chooseCategory('cat1');

    expect(staged()).toHaveLength(1);
    expect(staged()[0]).toMatchObject({ aPortId: 'p-n', bPortId: 'p-a' });
  });

  /**
   * **진입점이 달라도 같은 일이 일어난다.**
   *
   * 잇기를 시작하는 길은 넷이다(도면·포트 탭·선번장·계통). 예전에는 각자 상태를 세워서, 뒤쪽
   * 길로 시작하면 첫 끝점에 **장비**(슬롯)가 들어갔다 — 도면은 놓인 설비로만 그림을 그리므로
   * 강조도 미리보기도 아무것도 안 나왔다. 이제 진입점이 하는 일은 **출발을 정하는 것** 하나다.
   */
  it('포트 탭에서 시작해도 도면에서 시작한 것과 같은 상태가 된다', () => {
    const fromPanel = renderFloorPlan(vi.fn(), {
      initialFrom: { portId: 'p-a', label: 'a · p-a', substationId: 'sub-1', medium: 'power' },
    });
    /* 도구가 켜진 자리 — 도면에서 두 번 눌러 온 것과 같은 상태다. */
    expect(cableArmed()).toBe(true);

    /* 이어서 반대쪽을 고르면 같은 상자가 뜬다 — 첫 끝점이 제대로 서 있다는 뜻이다. */
    fireEvent.click(fromPanel.getByTestId('floorplan-canvas'), { clientX: 225, clientY: 25 });
    expect(fromPanel.pick.current?.assetId).toBe('b');
    expect(fromPanel.pick.current?.firstEndpoint?.portId).toBe('p-a');
    choosePort(fromPanel.pick, 'p-b');
    chooseCategory('cat1');

    expect(staged()).toHaveLength(1);
    expect(staged()[0]).toMatchObject({ aPortId: 'p-a', bPortId: 'p-b' });
  });

  /**
   * **같은 설비의 다른 포트끼리도 잇는다.**
   *
   * 랙 하나 안에서 광단말 앞면을 인입 슬롯에 무는 점퍼가 그렇다 — 같은 설비 안의 일인데
   * 도면에서 그 설비를 다시 누를 수 없으면 이을 길이 없다. 규칙에도 그런 금지는 없다
   * (`validateConnection` 은 **같은 포트**만 막는다).
   */
  it('같은 설비의 다른 포트로도 이어진다', () => {
    setStore([asset('a', 0, 0, {
      ports: [port('p-a1', 'a'), { ...port('p-a2', 'a'), index: 2 }],
    })]);
    const { pick } = renderFloorPlan();

    fireEvent.click(screen.getByRole('button', { name: '케이블' }));
    fireEvent.click(screen.getByTestId('floorplan-canvas'), { clientX: 25, clientY: 25 });
    choosePort(pick, 'p-a1');

    /* **같은 설비를 다시 누른다** — 흐려져 있으면 여기서 요청이 오지 않는다. */
    fireEvent.click(screen.getByTestId('floorplan-canvas'), { clientX: 25, clientY: 25 });
    expect(pick.current?.assetId).toBe('a');
    choosePort(pick, 'p-a2');
    chooseCategory('cat1');

    expect(staged()).toHaveLength(1);
    expect(staged()[0]).toMatchObject({ aPortId: 'p-a1', bPortId: 'p-a2' });
  });

  /* 접으면 **부분 상태가 남지 않는다** — 고르라는 요청도 함께 걷힌다. */
  it('접으면 아무것도 스테이지하지 않고 요청도 걷힌다', () => {
    const { pick } = renderFloorPlan();

    fireEvent.click(screen.getByRole('button', { name: '케이블' }));
    fireEvent.click(screen.getByTestId('floorplan-canvas'), { clientX: 25, clientY: 25 });
    choosePort(pick, 'p-a');
    expect(cableArmed()).toBe(true);

    /* 「케이블」을 다시 누르면 접힌다(도구 토글) — 세션을 닫는 일은 페이지가 한다. */
    fireEvent.click(screen.getByRole('button', { name: '케이블' }));
    expect(cableArmed()).toBe(false);

    // 아무것도 스테이지되지 않았다
    expect(staged()).toHaveLength(0);
  });
});

describe('FloorPlanView — 배치(armed/draw) 팔레트', () => {
  beforeEach(() => {
    setStore([]);
  });

  it('타입 arm → 힌트 표시 → ESC로 armed 해제(드래그 전)', () => {
    renderFloorPlan();

    fireEvent.click(screen.getByRole('button', { name: '배치' }));
    expect(screen.getByText('드래그로 영역 지정 · ESC 취소')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByText('드래그로 영역 지정 · ESC 취소')).toBeNull();
  });

  it('arm 후 드래그(mousedown→mousemove→mouseup)로 배치 모달이 열린다', () => {
    renderFloorPlan();

    fireEvent.click(screen.getByRole('button', { name: '배치' }));
    const canvas = screen.getByTestId('floorplan-canvas');

    fireEvent.mouseDown(canvas, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 60, clientY: 60 });
    fireEvent.mouseUp(window, { clientX: 60, clientY: 60 });

    /* 물어볼 것은 **현장 이름 하나뿐**이다 — 무엇이 몇 개 들어가는지는 설비 품목이 이미 안다.
       예전에는 장비 품목을 다시 고르게 했는데, 그러면 대장에서 짜 둔 뜻이 없다. */
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('textbox', { name: '설비 이름' })).toBeTruthy();
    expect(dialog.textContent).toContain('배전반');
  });

  it('드로우 mouseup 직후 합성 click 은 모달 뒤에서 선택을 바꾸지 않는다', () => {
    // 리뷰發 회귀핀: 가드가 armed 만 보면 modal 단계의 click 이 통과해
    // 열린 AddAssetModal 뒤에서 onSelectAsset 이 호출된다(구 ref 가드는 두 단계 모두 차단했음).
    setStore([asset('a', 0, 0)]); // 드래그 종료 지점과 겹치는 기존 자산
    const onSelectAsset = vi.fn();
    renderFloorPlan(onSelectAsset);

    fireEvent.click(screen.getByRole('button', { name: '배치' }));
    const canvas = screen.getByTestId('floorplan-canvas');

    fireEvent.mouseDown(canvas, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 40, clientY: 40 });
    fireEvent.mouseUp(window, { clientX: 40, clientY: 40 });
    expect(screen.getByRole('dialog')).toBeTruthy(); // modal 단계 진입

    // 브라우저가 mouseup 뒤 합성하는 click
    fireEvent.click(canvas, { clientX: 40, clientY: 40 });
    expect(onSelectAsset).not.toHaveBeenCalled();
  });

  it('너무 작은 드래그(MIN_DRAW 미만)는 모달을 열지 않는다', () => {
    renderFloorPlan();

    fireEvent.click(screen.getByRole('button', { name: '배치' }));
    const canvas = screen.getByTestId('floorplan-canvas');

    fireEvent.mouseDown(canvas, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 3, clientY: 3 });
    fireEvent.mouseUp(window, { clientX: 3, clientY: 3 });

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
