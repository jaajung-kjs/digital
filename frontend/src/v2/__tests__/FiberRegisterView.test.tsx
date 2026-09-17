/**
 * FiberRegisterView — 배선(wiring) 테스트
 *
 * 셀렉터 단위 테스트만으로는 콜사이트가 배선을 빠뜨려도 통과하는 갭이 있었다
 * (R-3 리뷰 P1: buildFiberRows 인자 누락 → 프로덕션에서 meta 전부 비활성).
 * 이 테스트는 컴포넌트를 실제 렌더해, 다심 인입 선언이 **코어별** 값 입력까지
 * 관통하는지 단언한다 — 배선이 끊기면 실패한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { v2WorkingCopyStore } from '../store/workingCopyStore';
import { emptyOverlays } from '../store/workingCopyStore';
import { FiberRegisterView } from '../components/registers/FiberRegisterView';
import type { V2Asset, V2AssetType, V2Cable } from '../types';

const mockTypes: V2AssetType[] = [
  {
    id: 't', key: 'SLOT-X', name: '경로슬롯', categoryId: 'c', sortOrder: 1,
    assetCount: 0,
    laborCode: null, installManDays: 0, removeManDays: 0, relocateManDays: 0,
    containerSpecs: [],
    portTemplates: [
      { id: 'pt-a', group: 'CORE', count: 2, direction: 'BI', medium: 'fiber', namePattern: '광 {n}', sortOrder: 1, positions: 1 },
      { id: 'pt-b', group: 'TRUNK', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'OPGW', sortOrder: 2, positions: 2 },
    ],
  },
];

vi.mock('../hooks', () => ({
  useV2Catalog: () => ({ data: { categories: [], types: mockTypes, cableGroups: [] } }),
  useTypesById: () => new Map(mockTypes.map((t) => [t.id, t])),
}));

const port = (
  id: string, assetId: string, group: string, index: number,
  extra: { medium?: string; name?: string; positions?: number; fieldValues?: Record<string, unknown> } = {},
) => ({
  id, assetId, group, index,
  name: extra.name ?? `광 ${index}`,
  direction: 'BI' as const,
  medium: extra.medium ?? 'fiber',
  positions: extra.positions ?? 1,
  fieldValues: extra.fieldValues ?? {},
});
const asset = (id: string, name: string, extra: Partial<V2Asset> = {}): V2Asset => ({
  id, name, typeId: 't', substationId: 'sub-1', status: 'normal',
  floorId: null, x: null, y: null, width: null, height: null,
  parentAssetId: null, containerKey: null, col: null, row: null, colSpan: null, rowSpan: null,
  fieldValues: {}, updatedAt: 'v', ports: [], ...extra,
});
const cable = (id: string, a: string, b: string, extra: Partial<V2Cable> = {}): V2Cable => ({
  id, name: null, substationId: 'sub-1', aPortId: a, bPortId: b, categoryId: null,
  pathPoints: [], specParams: {}, updatedAt: 'v', ...extra,
});

const ofd = asset('ofd', 'OFD-1');
/* 심선 값(손실)은 **인입 포트**에 코어 번호 아래 담긴다 — 케이블도, 심선별 포트도 아니다. */
const slot = asset('slot', '슬롯1', {
  parentAssetId: 'ofd',
  ports: [
    port('a1', 'slot', 'CORE', 1),
    port('a2', 'slot', 'CORE', 2),
    port('t1', 'slot', 'TRUNK', 1, {
      medium: 'fiber', name: 'OPGW', positions: 2,
      fieldValues: { 1: { loss1550: 0.3 }, 2: { loss1550: 0.9 } },
    }),
  ],
});

/** 그 판에 들어온 광 — 선번장은 **인입이 물린 판만** 적으므로 어느 시험에나 이것이 있어야 한다. */
const trunkCable = cable('in', 't1', 'far-trunk');

function setStore(assets: V2Asset[], cables: V2Cable[]) {
  v2WorkingCopyStore.setState({
    substationId: 'sub-1',
    saved: { substation: null, floors: [], assets, maintenanceLogs: [], inspectionLogs: [], cables, photos: [] },
    overlays: emptyOverlays(),
    baseVersions: {},
  });
}

/**
 * **빈 심선 칸이 잇는 자리다.**
 *
 * 예전에는 대시 하나로 끝났다. 한 슬롯에 심선 스물넷을 잇는 자리에서 잇는 길이 없어, 도면으로
 * 나가 같은 포트를 이름으로 다시 찾아야 했다 — 포트는 이 칸이 이미 쥐고 있는데.
 */
describe('선번장 빈 칸에서 잇기', () => {
  beforeEach(() => setStore([], []));

  const draw = (onConnect?: (portId: string) => void) =>
    render(<FiberRegisterView
      substationId="sub-1"
      selectedAssetId={null}
      selectedPortId={null}
      containerId={null}
      onPickContainer={vi.fn()}
      onSelectAsset={vi.fn()}
      {...(onConnect ? { onConnect } : {})}
    />);

  it('안 이은 심선 칸을 누르면 **그 심선의 포트**로 잇기가 시작된다', () => {
    setStore([ofd, slot], [trunkCable]);
    const onConnect = vi.fn();
    draw(onConnect);

    /* 심선 1·2 가 다 비어 있으니 자리가 둘이다 — 누른 칸의 포트가 출발이어야 한다
       (한때 줄의 첫 포트를 집어, 어느 칸을 눌러도 같은 심선에서 시작했다). */
    const cells = screen.getAllByRole('button', { name: '잇기' });
    expect(cells).toHaveLength(2);
    fireEvent.click(cells[1]!);
    expect(onConnect).toHaveBeenCalledWith('a2');
  });

  /* 잇는 길을 안 내려 주면 예전 그대로 — 글자다. 표가 스스로 세션을 열지 않는다. */
  it('잇는 길을 안 받으면 빈 칸은 글자로 남는다', () => {
    setStore([ofd, slot], [trunkCable]);
    draw();
    expect(screen.queryByRole('button', { name: '잇기' })).toBeNull();
  });

  /**
   * **이미 물린 칸은 잇는 자리가 아니다.**
   *
   * 대국이 이 도면 밖이라 이름을 못 푼 칸도 케이블은 있다 — 거기까지 열면 한 자리가 두 번
   * 팔린다(`port-occupied` 로 튕기는 것을 눌러 본 뒤에야 알게 된다).
   */
  it('케이블이 이미 물린 칸은 잇기가 서지 않는다', () => {
    setStore([ofd, slot], [trunkCable, cable('c-a1', 'a1', 'somewhere-far')]);
    const onConnect = vi.fn();
    draw(onConnect);
    /* 심선 1 은 물렸고 2 만 비었다. */
    expect(screen.getAllByRole('button', { name: '잇기' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '잇기' }));
    expect(onConnect).toHaveBeenCalledWith('a2');
  });
});

describe('FiberRegisterView 배선 — 다심 인입 선언이 코어별 값 입력까지 관통', () => {
  beforeEach(() => {
    setStore([], []);
  });

  it('길이는 인입 케이블에서, 손실은 인입 포트의 코어 번호에서 온다', () => {
    setStore([ofd, slot], [cable('c1', 't1', 'x', { specParams: { lengthM: 40 } })]);

    render(<FiberRegisterView
        substationId="sub-1"
        selectedAssetId={null}
        selectedPortId={null}
        containerId={null}
        onPickContainer={vi.fn()}
        onSelectAsset={vi.fn()}
      />);

    /* 값은 **읽는 줄**로 선다 — 고칠 때만 상자가 된다(`InlineEditCell`). */
    /* 길이는 케이블 한 가닥의 값이라 **슬롯 머리에 한 번** 적힌다 — 열로 세우면 스물네 줄에
       같은 글자가 스물네 번 선다(예전에는 심선마다 케이블이라 열이었다). */
    /* 단위는 **값 뒤에** 붙는다(머리글이 아니라) — 고칠 때 상자에는 수만 남는다. */
    expect(screen.getAllByRole('button', { name: '길이 고치기' }).filter((b) => b.textContent === '40m')).toHaveLength(1);
    // 측정값은 코어마다 다르다 — 같은 포트 하나에서 번호로 갈라져 나온다.
    const loss = screen.getAllByRole('button', { name: '1550 손실 고치기' }).map((b) => b.textContent);
    expect(loss).toContain('0.3dB');
    expect(loss).toContain('0.9dB');
  });

  it('코어 측정값을 고치면 그 코어 자리만 바뀌고, **측정일이 그날로 찍힌다**', () => {
    setStore([ofd, slot], [trunkCable]);
    render(<FiberRegisterView
        substationId="sub-1"
        selectedAssetId={null}
        selectedPortId={null}
        containerId={null}
        onPickContainer={vi.fn()}
        onSelectAsset={vi.fn()}
      />);

    /* 누르면 그때 상자가 선다 — 조회 화면에 상자 312개가 늘 서 있지 않게. */
    fireEvent.click(screen.getAllByRole('button', { name: '1550 손실 고치기' }).find((b) => b.textContent === '0.3dB')!);
    /* 고칠 때 상자에는 **수만** 남는다 — 단위까지 지웠다 다시 치게 하지 않는다. */
    const input = screen.getByDisplayValue('0.3');
    fireEvent.change(input, { target: { value: '1.4' } });
    fireEvent.blur(input);

    const staged = v2WorkingCopyStore.getState().effectiveAssets().find((a) => a.id === 'slot')!;
    const trunk = staged.ports.find((p) => p.id === 't1')!;
    /* 언제 쟀는가는 **적는 것이 아니라 찍히는 것**이다 — 값과 날짜가 어긋날 길을 두지 않는다. */
    const today = new Date().toISOString().slice(0, 10);
    expect(trunk.fieldValues).toEqual({ 1: { loss1550: 1.4, measuredAt: today }, 2: { loss1550: 0.9 } });
  });

  /* 표의 단위는 자산이 아니라 심선이다. 자산 id 로 칠하면 그 슬롯의 24행이 한꺼번에
     물들어, 어느 심선을 눌렀는지가 화면에서 사라진다(실제로 그랬다). */
  /**
   * **선택은 주소가 쥔다** — 표도 판도 그 하나를 본다.
   *
   * 줄을 누르면 표가 제 손으로 칠하지 않고 「이 포트를 골랐다」고 알린다. 칠하는 일은 주소가
   * 그 포트를 가리킬 때 일어난다 — 그래서 **판에서 포트를 골라도 같은 줄이 칠해진다**(예전에는
   * 표만 아는 지역 상태라, 판에서 고르면 표는 아무것도 몰랐다).
   */
  it('줄을 누르면 그 심선의 포트를 알린다', () => {
    setStore([ofd, slot], [trunkCable]);
    const onSelect = vi.fn();
    const { container } = render(
      <FiberRegisterView substationId="sub-1" selectedAssetId={null} selectedPortId={null} onSelectAsset={onSelect} />,
    );
    const dataRows = [...container.querySelectorAll('tbody tr')].filter((r) => r.querySelectorAll('td').length > 3);
    expect(dataRows).toHaveLength(2); // 코어 2가닥

    fireEvent.click(dataRows[0]!);
    expect(onSelect).toHaveBeenCalledWith('slot', 'a1');
    /* 아직 아무 줄도 칠해지지 않는다 — 주소가 바뀌어야 칠한다. */
    expect(dataRows.filter((r) => r.className.includes('bg-info-bg'))).toHaveLength(0);
  });

  it('주소가 가리키는 포트의 줄만 칠해진다 — 판에서 골라도 같다', () => {
    setStore([ofd, slot], [trunkCable]);
    const { container } = render(
      <FiberRegisterView substationId="sub-1" selectedAssetId="slot" selectedPortId="a1" onSelectAsset={vi.fn()} />,
    );
    const dataRows = [...container.querySelectorAll('tbody tr')].filter((r) => r.querySelectorAll('td').length > 3);
    const selected = dataRows.filter((r) => r.className.includes('bg-info-bg'));
    expect(selected).toHaveLength(1);
    expect(selected[0]).toBe(dataRows[0]);
  });

  /* 인입이 없는 자산은 선번장 대상이 아니다 — OTDR 로 잴 것이 없다. */
  it('단심 광 포트만 가진 자산은 선번장에 오르지 않는다', () => {
    const optTerm = asset('opt', '광단말-1', { parentAssetId: 'rack', ports: [port('o1', 'opt', 'CORE', 1)] });
    setStore([asset('rack', '통신랙 A'), optTerm], []);

    render(<FiberRegisterView
        substationId="sub-1"
        selectedAssetId={null}
        selectedPortId={null}
        containerId={null}
        onPickContainer={vi.fn()}
        onSelectAsset={vi.fn()}
      />);
    expect(screen.getByText(/선번장에 표시할 광 설비가 없습니다/)).toBeTruthy();
  });

  /* 선번장은 **들어온 광의 성단표**다. 아직 아무 광도 안 물린 판은 코어마다 빈 줄만
     스물넉 줄을 만들어, 정작 읽을 줄을 파묻는다 — 판이 서 있는 것과 적히는 것은 다르다.
     (한때 그런 판도 「인입 케이블 없음」이라 적고 세웠다.) */
  it('인입 케이블이 없는 슬롯은 표에 오르지 않는다', () => {
    setStore([ofd, slot], []);
    const { container } = render(<FiberRegisterView
        substationId="sub-1"
        selectedAssetId={null}
        selectedPortId={null}
        containerId={null}
        onPickContainer={vi.fn()}
        onSelectAsset={vi.fn()}
      />);

    expect(screen.queryByText('슬롯1')).toBeNull();
    const dataRows = [...container.querySelectorAll('tbody tr')].filter((r) => r.querySelectorAll('td').length > 3);
    expect(dataRows).toHaveLength(0);
  });
});
