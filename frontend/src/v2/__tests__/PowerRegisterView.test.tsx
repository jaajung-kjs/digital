/**
 * 계통 표 배선 — **나무가 화면까지 관통하는가**.
 *
 * 선택자 시험만으로는 콜사이트가 배선을 빠뜨려도 통과한다(선번장에서 실제로 그랬다).
 * 여기서는 실제로 그려서, 반마다 「입력 줄 + 회로 줄」이 서고 값이 고쳐지는지 본다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { emptyOverlays, v2WorkingCopyStore } from '../store/workingCopyStore';
import { PowerRegisterView, powerColumnWidths, powerValueColumns } from '../components/registers/PowerRegisterView';
import { cableFieldsFor, portFieldsFor } from '@twin/core';
import type { V2Asset, V2Cable } from '../types';

/* 전압은 **포트를 만들 때 실린다**(장비 품목의 포트 선언) — 놓인 포트는 이미 그것을 들고 있다. */
const port = (id: string, assetId: string, group: string, index: number, direction: 'IN' | 'OUT', name: string,
              voltage = 'AC 220V') =>
  ({ id, assetId, group, index, name, direction, medium: 'power', positions: 1, variant: 'AC',
     fieldValues: { voltage } });
const asset = (id: string, name: string, extra: Partial<V2Asset> = {}): V2Asset => ({
  id, name, typeId: 't', substationId: 'sub-1', status: 'normal',
  floorId: null, x: null, y: null, width: null, height: null,
  parentAssetId: null, col: null, row: null, colSpan: null, rowSpan: null,
  fieldValues: {}, updatedAt: 'v', ports: [], ...extra,
});
/** 반으로 서는 종류 하나 — `board` 만 계통에 회로를 편다. */
const TYPES = [{ id: 'board', managesPowerCircuits: true }, { id: 't', managesPowerCircuits: false }];

const cable = (id: string, a: string, b: string, extra: Partial<V2Cable> = {}): V2Cable => ({
  id, name: null, substationId: 'sub-1', aPortId: a, bPortId: b, categoryId: null,
  pathPoints: [], specParams: {}, updatedAt: 'v', ...extra,
});

const rack = asset('rack', '분전반');
const main = asset('main', '소내전원반', {
  typeId: 'board', parentAssetId: 'rack',
  ports: [port('main-in', 'main', 'IN', 1, 'IN', '전원 입력'),
          port('main-o1', 'main', 'OUT', 1, 'OUT', '출력 1'),
          port('main-o2', 'main', 'OUT', 2, 'OUT', '출력 2')],
});
/* **반인지 아닌지는 종류가 말한다**(`managesPowerCircuits`) — 출력 수로 세지 않는다.
   랙 안의 −48V 분배반이 분기 일곱이라 그 눈에는 변전소 분전반과 똑같이 보였다. */
const ups = asset('ups', 'UPS', {
  typeId: 'board', parentAssetId: 'rack',
  ports: [port('ups-in', 'ups', 'IN', 1, 'IN', '전원 입력'),
          port('ups-o1', 'ups', 'OUT', 1, 'OUT', '출력 1'),
          port('ups-o2', 'ups', 'OUT', 2, 'OUT', '출력 2')],
});
const load = asset('load', '통합단말', { ports: [port('load-in', 'load', 'IN', 1, 'IN', '전원 입력')] });

function setStore(assets: V2Asset[], cables: V2Cable[]) {
  v2WorkingCopyStore.setState({
    substationId: 'sub-1',
    saved: { substation: null, floors: [], assets, maintenanceLogs: [], inspectionLogs: [], cables, photos: [] },
    overlays: emptyOverlays(),
    baseVersions: {},
  });
}

const wired = () => [
  cable('c1', 'main-o1', 'ups-in', { specParams: { lengthM: 8 } }),
  cable('c2', 'ups-o1', 'load-in', {}),
];

/**
 * **계통의 빈 칸도 잇는 자리다** — 다만 조서가 그 자리를 부르는 이름은 남는다.
 *
 * 「예비」·「미결선」은 「적다 만 것」이 아니라 「비워 둔 것」이라는 사실이다. 「잇기」로
 * 덮으면 그 사실이 화면에서 사라지므로, **그 말이 버튼이 된다**.
 */
describe('계통 빈 칸에서 잇기', () => {
  beforeEach(() => setStore([], []));

  const draw = (onConnect?: (portId: string) => void) =>
    render(<PowerRegisterView
      types={TYPES}
      substationId="sub-1"
      selectedAssetId={null}
      onSelectAsset={vi.fn()}
      {...(onConnect ? { onConnect } : {})}
    />);

  /** 반이 여럿이라 「예비」도 여럿이다 — 그 반의 표 안에서 찾는다. */
  const tableOf = (title: string) =>
    within(screen.getByRole('button', { name: new RegExp(`${title}$`) }).closest('section')!);

  it('예비 회로를 누르면 그 회로의 포트로 잇기가 시작된다 — 말은 「예비」 그대로', () => {
    setStore([rack, main, ups, load], wired());
    const onConnect = vi.fn();
    draw(onConnect);

    /* 소내전원반의 출력 2 가 비어 있다(출력 1 은 UPS 로 간다) — 누른 칸의 포트가 출발이어야
       한다(한때 줄의 첫 포트를 집어, 어느 반을 눌러도 같은 자리에서 시작했다). */
    fireEvent.click(tableOf('분전반 · 소내전원반').getByRole('button', { name: '예비' }));
    expect(onConnect).toHaveBeenCalledWith('main-o2');

    /* UPS 의 예비를 누르면 그 반의 포트다 — 「예비」라는 말만 같다. */
    fireEvent.click(tableOf('분전반 · UPS').getByRole('button', { name: '예비' }));
    expect(onConnect).toHaveBeenLastCalledWith('ups-o2');
  });

  it('안 이은 입력도 잇는 자리다 — 말은 「미결선」 그대로', () => {
    setStore([rack, main, ups, load], wired());
    const onConnect = vi.fn();
    draw(onConnect);

    fireEvent.click(screen.getByRole('button', { name: '미결선' }));
    expect(onConnect).toHaveBeenCalledWith('main-in');
  });

  /* 케이블은 있고 대국만 도면 밖인 칸 — 자리가 이미 팔렸으므로 글자로 남는다. */
  it('이 도면 밖에서 오는 입력은 잇기가 서지 않는다', () => {
    setStore([rack, main, ups, load], [...wired(), cable('c-far', 'main-in', 'far-port')]);
    draw(vi.fn());
    expect(screen.getByText('이 도면 밖')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '이 도면 밖' })).toBeNull();
  });
});

describe('계통 표 — 반이 묶음, 회로가 줄', () => {
  beforeEach(() => setStore([], []));

  /** 그 반의 표 — 묶음 제목으로 찾는다(제목 앞에는 거슬러 온 길이 흐리게 붙는다). */
  const tableOf = (title: string) =>
    within(screen.getByRole('button', { name: new RegExp(`${title}$`) }).closest('section')!);

  it('반마다 제 표가 서고, 매달린 반은 그 아래에 선다', () => {
    setStore([rack, main, ups, load], wired());
    render(<PowerRegisterView types={TYPES} substationId="sub-1" selectedAssetId={null} onSelectAsset={vi.fn()} />);

    /* 자식은 부모 **바로 밑**에 오고, 거슬러 온 길이 제목 앞에 적힌다 — 묶음마다 표가 따로
       서는 판에서 들여쓰기로 매달림을 보이면 제목만 밀리고 표는 제자리라 어긋나 보인다. */
    const titles = screen.getAllByRole('button', { name: /분전반 · / }).map((b) => b.textContent);
    expect(titles).toEqual(['분전반 · 소내전원반', '소내전원반 › 분전반 · UPS']);
  });

  /**
   * **입력도 한 줄이다.** 어디서 오는지·개폐·길이·전압을 회로와 같은 칸에서 읽는다 —
   * 머리글에 글자로만 적어 두면 값을 고칠 수가 없다.
   */
  it('입력이 표의 첫 줄로 선다 — 어디서 오는지·전압·용량까지', () => {
    setStore([rack, main, ups, load], wired());
    render(<PowerRegisterView types={TYPES} substationId="sub-1" selectedAssetId={null} onSelectAsset={vi.fn()} />);

    const upsTable = tableOf('분전반 · UPS');
    const first = upsTable.getAllByRole('row')[1]!; // 0 은 머리글
    expect(within(first).getByText('입력')).toBeInTheDocument();
    expect(within(first).getByText(/소내전원반/)).toBeInTheDocument();
    /* 인입 차단기의 값도 회로와 **같은 칸**에서 읽고 고친다 — 머리글에 글자로만 적어 두면
       주차단기 정격을 적을 곳이 없다. */
    expect(within(first).getByRole('button', { name: '전압 고치기' })).toBeInTheDocument();
    expect(within(first).getByRole('button', { name: '용량 고치기' })).toBeInTheDocument();
  });

  it('아직 안 이은 입력과 이 도면 밖에서 오는 입력은 다르게 말한다', () => {
    setStore([rack, main, ups, load], wired());
    render(<PowerRegisterView types={TYPES} substationId="sub-1" selectedAssetId={null} onSelectAsset={vi.fn()} />);
    expect(tableOf('분전반 · 소내전원반').getByText('미결선')).toBeInTheDocument();
  });

  it('회로는 출력 포트마다 한 줄 — 이 회로가 먹이는 것이 용도다', () => {
    setStore([rack, main, ups, load], wired());
    render(<PowerRegisterView types={TYPES} substationId="sub-1" selectedAssetId={null} onSelectAsset={vi.fn()} />);

    const rows = tableOf('분전반 · 소내전원반').getAllByRole('row');
    // 머리글 + 입력 + 회로 2
    expect(rows).toHaveLength(4);
    expect(within(rows[2]!).getByText(/UPS/)).toBeInTheDocument();
    expect(within(rows[3]!).getAllByText('—').length).toBeGreaterThan(0); // 빈 회로
  });

  /**
   * **차단기 용량은 회로(포트)의 값**이다 — 강릉 대장의 「50A · 30A · 20A」 열.
   *
   * 고치면 그 포트에만 담긴다. 한때 이 칸이 스토어를 다시 뒤져 값을 읽었는데(셀렉터가 매
   * 렌더 새 객체를 돌려줬다) 값을 한 번 고치는 순간 무한 렌더로 화면이 통째로 사라졌다 —
   * 그래서 여기서 **고쳐 본다**.
   */
  it('용량은 회로마다 따로 적힌다 — 고쳐도 화면이 살아 있다', () => {
    setStore([rack, main, ups, load], wired());
    render(<PowerRegisterView types={TYPES} substationId="sub-1" selectedAssetId={null} onSelectAsset={vi.fn()} />);

    const circuit = tableOf('분전반 · 소내전원반').getAllByRole('row')[2]!; // 머리글 · 입력 다음
    fireEvent.click(within(circuit).getByRole('button', { name: '용량 고치기' }));
    /* 용량도 목록이다(정해진 값) — 고르면 그 자리에서 담긴다. */
    fireEvent.change(screen.getByRole('combobox', { name: '용량' }), { target: { value: '30' } });

    const staged = v2WorkingCopyStore.getState().overlays.assets.updates['main'];
    const port = (staged?.ports as { id: string; fieldValues: Record<string, unknown> }[]).find((p) => p.id === 'main-o1');
    expect(port?.fieldValues).toEqual({ voltage: 'AC 220V', ampere: 30 });
    /* 다른 회로에는 적히지 않는다 — 판 하나에 값 하나가 아니다. */
    const other = (staged?.ports as { id: string; fieldValues: Record<string, unknown> }[]).find((p) => p.id === 'main-o2');
    expect(other?.fieldValues.ampere).toBeUndefined();
    // 표가 그대로 서 있다(무한 렌더로 사라지지 않았다).
    expect(tableOf('분전반 · 소내전원반').getAllByRole('row').length).toBe(4);
  });

  /**
   * **한 반에서 3상과 단상이 섞인다 — 그것은 전압이 아니라 상·선식이다.**
   *
   * 380/220V 3상4선 반은 한 모선에서 3상 부하(4P·선간 380V)와 단상 부하(2P·상전압 220V)를
   * 함께 내보낸다. 전압은 그 모선 하나이고 회로마다 다른 것은 **몇 상 몇 선인가**다 —
   * 현장 조서의 「규격」 칸이 그것이고, 도면의 「NFB#1 2P 100A」의 그 2P 다.
   *
   * 그래서 전압은 반의 머리줄이 한 번 말하고(스무 줄에 같은 값이 스무 번 서던 자리다),
   * 회로 줄에서 고치는 것은 상·선식이다.
   */
  it('상·선은 회로마다 고친다 — 한 반에서 3상과 단상이 섞인다', () => {
    /* 모선은 3상4선, 회로 하나만 단상 — 나머지는 모선에서 물려받는다. */
    const main3P = { ...main, ports: main.ports.map((p) =>
      p.id === 'main-in' ? { ...p, fieldValues: { voltage: 'AC 380/220V', wiring: '3φ4W' } }
        : p.id === 'main-o2' ? { ...p, fieldValues: { wiring: '1φ2W' } } : p) };
    setStore([rack, main3P, ups, load], wired());
    render(<PowerRegisterView types={TYPES} substationId="sub-1" selectedAssetId={null} onSelectAsset={vi.fn()} />);

    const rows = tableOf('분전반 · 소내전원반').getAllByRole('row');
    /* 안 적은 회로는 모선을 따라 3상4선(흐리게), 따로 적은 회로만 1상2선(진하게). */
    expect(within(rows[2]!).getByRole('button', { name: '상 고치기' }).textContent).toBe('3φ4W');
    expect(within(rows[3]!).getByRole('button', { name: '상 고치기' }).textContent).toBe('1φ2W');

    /* 그 자리에서 고친다 — 값은 **그 포트**에 담긴다(케이블이 아니라). */
    fireEvent.click(within(rows[2]!).getByRole('button', { name: '상 고치기' }));
    fireEvent.change(screen.getByRole('combobox', { name: '상' }), { target: { value: '3φ3W' } });
    const staged = v2WorkingCopyStore.getState().overlays.assets.updates['main'];
    const port = (staged?.ports as { id: string; fieldValues: Record<string, unknown> }[]).find((p) => p.id === 'main-o1');
    expect(port?.fieldValues.wiring).toBe('3φ3W');
  });

  /**
   * **안 적힌 값은 지어내지 않는다** — 모선에도 없으면 「—」다.
   *
   * 포트가 생길 때 갈래의 예사 전압을 저장하던 자리가 있었다. 편했지만 아무도 확인한 적 없는
   * 값이 자료로 굳었다 — 옛 대장을 옮길 때 화면이 없는 사실을 말한다.
   */
  it('모선에도 없으면 비어 있다 — 모선에 적으면 회로가 따라온다', () => {
    const bare = { ...main, ports: main.ports.map((p) => ({ ...p, fieldValues: {} })) };
    setStore([rack, bare, ups, load], wired());
    const { rerender } = render(<PowerRegisterView types={TYPES} substationId="sub-1" selectedAssetId={null} onSelectAsset={vi.fn()} />);
    const 전압 = () => tableOf('분전반 · 소내전원반').getAllByRole('row')
      .slice(1).map((r) => within(r).getByRole('button', { name: '전압 고치기' }).textContent);
    expect(전압()).toEqual(['—', '—', '—']); // 입력 · 회로 둘 다 비었다

    /* 모선에만 적는다 — 회로가 따라온다. */
    const fed = { ...bare, ports: bare.ports.map((p) => (p.id === 'main-in' ? { ...p, fieldValues: { voltage: 'DC 48V' } } : p)) };
    setStore([rack, fed, ups, load], wired());
    rerender(<PowerRegisterView types={TYPES} substationId="sub-1" selectedAssetId={null} onSelectAsset={vi.fn()} />);
    expect(전압()).toEqual(['DC 48V', 'DC 48V', 'DC 48V']);
  });

  /** 전압은 **모선의 성질**이라 회로 줄이 아니라 머리줄이 말한다 — 극수까지 함께. */
  it('모선의 전압·상·정격은 반의 머리줄이 한 번 말한다', () => {
    const withRating = { ...main, ports: main.ports.map((p) => (p.id === 'main-in' ? { ...p, fieldValues: { voltage: 'AC 380/220V', wiring: '3φ4W', ampere: 400 } } : p)) };
    setStore([rack, withRating, ups, load], wired());
    render(<PowerRegisterView types={TYPES} substationId="sub-1" selectedAssetId={null} onSelectAsset={vi.fn()} />);
    expect(screen.getByText('AC 380/220V · 3φ4W(4P) · 400A')).toBeInTheDocument();
  });

  /**
   * **전압은 회로마다 다를 수 있다** — 그래서 회로 줄에 서고, 그 자리에서 고친다.
   *
   * 한때 「모선의 성질」이라며 이 열을 뺐다. 절반만 맞는 말이었다: 380/220V 3상4선 반은 한
   * 모선에서 380V 3상과 220V 단상을 함께 내보내고, 강릉 대장에는 같은 반에 110V 회로가 하나
   * 섞여 있다. 빼는 순간 그 회로를 고칠 길이 사라진다.
   *
   * 스무 줄에 같은 값이 스무 번 서던 문제는 **지우지 않고 흐리게** 푼다 — 모선(입력 줄)이
   * 이미 말한 값이면 흐리고, 다른 값만 진하게 눈에 걸린다(대장의 ditto).
   */
  it('모선이 이미 말한 값은 흐리고, 다른 값만 진하다', () => {
    const mixed = { ...main, ports: main.ports.map((p) => (p.id === 'main-o2' ? { ...p, fieldValues: { voltage: 'AC 380/220V' } } : p)) };
    setStore([rack, mixed, ups, load], wired());
    render(<PowerRegisterView types={TYPES} substationId="sub-1" selectedAssetId={null} onSelectAsset={vi.fn()} />);

    const rows = tableOf('분전반 · 소내전원반').getAllByRole('row');
    /* 모선(입력)과 같은 회로는 흐리다. */
    const same = within(rows[2]!).getByRole('button', { name: '전압 고치기' });
    expect(same.className).toMatch(/faint/);
    /* 다른 값은 진하다 — 스물 속에서 이것만 눈에 걸려야 한다. */
    const different = within(rows[3]!).getByRole('button', { name: '전압 고치기' });
    expect(different.textContent).toBe('AC 380/220V');
    expect(different.className).not.toMatch(/faint/);
  });

  /** 아직 아무것도 안 문 회로는 **예비**다 — 조서가 그 자리를 그렇게 부른다. */
  it('안 이은 회로는 예비로 읽힌다', () => {
    setStore([rack, main, ups, load], wired());
    render(<PowerRegisterView types={TYPES} substationId="sub-1" selectedAssetId={null} onSelectAsset={vi.fn()} />);
    const rows = tableOf('분전반 · 소내전원반').getAllByRole('row');
    expect(within(rows[3]!).getByText('예비')).toBeInTheDocument();
  });

  /**
   * **케이블의 물량은 회로 대장의 칸이 아니다.**
   *
   * 강릉 조서의 「전원케이블」 칸에 적힌 것은 `FR-5.5sq` — 종류와 **굵기**이고 길이가 아니다.
   * SCADA 분전반 조서에는 케이블 칸 자체가 없다(번호·용량·규격·Type·부하). 아홉 열을
   * 세웠더니 정작 자료가 채우는 **용도**가 10%까지 굶어 부하 이름이 다 잘렸다.
   *
   * 길이를 적는 자리는 **포트 상세 카드의 연결 줄**이다 — 그 케이블이 서 있는 곳이다.
   */
  it('케이블 길이는 회로 대장의 열이 아니다 — 규격(단면적)은 남는다', () => {
    setStore([rack, main, ups, load], wired());
    render(<PowerRegisterView types={TYPES} substationId="sub-1" selectedAssetId={null} onSelectAsset={vi.fn()} />);
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).not.toContain('길이');
    expect(heads).toContain('규격');
    /* 차단기 종류도 같다 — 어휘로는 남기고(포트 카드에서 적는다) 열에서만 내린다. */
    expect(heads).not.toContain('차단기');
  });
});

/**
 * **열 폭은 재서 정한다.** 손으로 나눴다가 두 번 틀렸다: 전압(「AC 220V 1φ」)이 두 줄로 접혔고,
 * 개폐는 글자가 아니라 스위치라 「ON」이 칸 밖으로 잘렸다. 눈으로는 멀쩡해 보이는 크기다.
 */
describe('계통 표 열 폭', () => {
  /* 화면이 세우는 목록 그대로 — 시험이 제 손으로 다시 세우면 칸이 늘 때 둘이 갈린다. */
  const valueFields = powerValueColumns().map((c) => c.field);
  const stateFields = portFieldsFor('power').filter((f) => f.type === 'boolean');
  const widths = powerColumnWidths(valueFields, stateFields);

  it('합이 100 이다 — 표의 규약', () => {
    expect(Math.round(widths.reduce((a, b) => a + b, 0))).toBe(100);
    expect(widths).toHaveLength(2 + valueFields.length + stateFields.length);
  });

  /**
   * **모든 선택지가 한 줄에 들어간다.** 지금 적힌 값만 보고 폭을 정했다가 두 번 접혔다 —
   * 「AC 380V 3φ」를 고르는 순간 2px 모자랐다. 열은 **고를 수 있는 것 전부**를 담아야 한다.
   */
  it('열은 그 열의 어떤 선택지든 담는다', () => {
    const REFERENCE_PX = 760;
    const PADDING_PX = 32;
    const guess = (t: string) => [...t].reduce((n, ch) => n + (/[가-힣]/.test(ch) ? 14 : 8), 0);
    const [, , ...rest] = widths;
    valueFields.forEach((f, i) => {
      const inner = (rest[i]! / 100) * REFERENCE_PX - PADDING_PX;
      for (const o of f.options ?? []) {
        expect(inner, `${f.label}: ${o}`).toBeGreaterThanOrEqual(guess(String(o) + (f.unit ?? '')));
      }
    });
  });

  /* 「가장 넓은 칸은 전압」이라는 시험이 여기 있었다. 전압에 위상이 들어 있어 가장 긴 값이던
     시절의 것인데, 전압은 이제 모선의 것이라 이 표에 없다. 남은 보장(「어떤 선택지든 한 줄에
     들어간다」)은 바로 위 시험이 이미 지킨다 — 칸들의 넓이 **차례**는 지킬 값이 아니다. */

  it('용도가 남는 폭을 받는다 — 자료가 채우는 열이라 가장 넓다', () => {
    expect(widths[1]!).toBeGreaterThan(Math.max(...widths.filter((_, i) => i !== 1)));
  });

  /* 개폐는 스위치 + 글자라 회로 번호 칸보다 넓어야 한다 — 좁게 잡아 「ON」이 잘렸었다. */
  it('개폐 칸은 스위치가 들어갈 만큼 — 회로 번호 칸보다 넓다', () => {
    expect(widths[widths.length - 1]!).toBeGreaterThan(widths[0]!);
  });
});
