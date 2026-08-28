/**
 * 계통 표 배선 — **나무가 화면까지 관통하는가**.
 *
 * 선택자 시험만으로는 콜사이트가 배선을 빠뜨려도 통과한다(선번장에서 실제로 그랬다).
 * 여기서는 실제로 그려서, 반마다 「입력 줄 + 회로 줄」이 서고 값이 고쳐지는지 본다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { emptyOverlays, v2WorkingCopyStore } from '../store/workingCopyStore';
import { PowerRegisterView, powerColumnWidths } from '../components/registers/PowerRegisterView';
import { cableFieldsFor, portFieldsFor } from '@twin/core';
import type { V2Asset, V2Cable } from '../types';

/* 전압은 **포트를 만들 때 실린다**(장비 품목의 포트 선언) — 놓인 포트는 이미 그것을 들고 있다. */
const port = (id: string, assetId: string, group: string, index: number, direction: 'IN' | 'OUT', name: string,
              voltage = 'AC 220V 1φ') =>
  ({ id, assetId, group, index, name, direction, medium: 'power', positions: 1, variant: 'AC',
     fieldValues: { voltage } });
const asset = (id: string, name: string, extra: Partial<V2Asset> = {}): V2Asset => ({
  id, name, typeId: 't', substationId: 'sub-1', status: 'normal',
  floorId: null, x: null, y: null, width: null, height: null,
  parentAssetId: null, col: null, row: null, colSpan: null, rowSpan: null,
  fieldValues: {}, updatedAt: 'v', ports: [], ...extra,
});
const cable = (id: string, a: string, b: string, extra: Partial<V2Cable> = {}): V2Cable => ({
  id, name: null, substationId: 'sub-1', aPortId: a, bPortId: b, categoryId: null,
  pathPoints: [], specParams: {}, updatedAt: 'v', ...extra,
});

const rack = asset('rack', '분전반');
const main = asset('main', '소내전원반', {
  parentAssetId: 'rack',
  ports: [port('main-in', 'main', 'IN', 1, 'IN', '전원 입력'),
          port('main-o1', 'main', 'OUT', 1, 'OUT', '출력 1'),
          port('main-o2', 'main', 'OUT', 2, 'OUT', '출력 2')],
});
const ups = asset('ups', 'UPS', {
  parentAssetId: 'rack',
  ports: [port('ups-in', 'ups', 'IN', 1, 'IN', '전원 입력'),
          port('ups-o1', 'ups', 'OUT', 1, 'OUT', '출력 1')],
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

describe('계통 표 — 반이 묶음, 회로가 줄', () => {
  beforeEach(() => setStore([], []));

  /** 그 반의 표 — 묶음 제목으로 찾는다(제목 앞에는 거슬러 온 길이 흐리게 붙는다). */
  const tableOf = (title: string) =>
    within(screen.getByRole('button', { name: new RegExp(`${title}$`) }).closest('section')!);

  it('반마다 제 표가 서고, 매달린 반은 그 아래에 선다', () => {
    setStore([rack, main, ups, load], wired());
    render(<PowerRegisterView substationId="sub-1" selectedAssetId={null} onSelectAsset={vi.fn()} />);

    /* 자식은 부모 **바로 밑**에 오고, 거슬러 온 길이 제목 앞에 적힌다 — 묶음마다 표가 따로
       서는 판에서 들여쓰기로 매달림을 보이면 제목만 밀리고 표는 제자리라 어긋나 보인다. */
    const titles = screen.getAllByRole('button', { name: /분전반 · / }).map((b) => b.textContent);
    expect(titles).toEqual(['분전반 · 소내전원반', '소내전원반 › 분전반 · UPS']);
  });

  /**
   * **입력도 한 줄이다.** 어디서 오는지·개폐·길이·전압을 회로와 같은 칸에서 읽는다 —
   * 머리글에 글자로만 적어 두면 값을 고칠 수가 없다.
   */
  it('입력이 표의 첫 줄로 선다 — 어디서 오는지·길이·전압까지', () => {
    setStore([rack, main, ups, load], wired());
    render(<PowerRegisterView substationId="sub-1" selectedAssetId={null} onSelectAsset={vi.fn()} />);

    const upsTable = tableOf('분전반 · UPS');
    const first = upsTable.getAllByRole('row')[1]!; // 0 은 머리글
    expect(within(first).getByText('입력')).toBeInTheDocument();
    expect(within(first).getByText(/소내전원반/)).toBeInTheDocument();
    expect(within(first).getByRole('button', { name: '길이 고치기' }).textContent).toBe('8m');
  });

  it('아직 안 이은 입력과 이 도면 밖에서 오는 입력은 다르게 말한다', () => {
    setStore([rack, main, ups, load], wired());
    render(<PowerRegisterView substationId="sub-1" selectedAssetId={null} onSelectAsset={vi.fn()} />);
    expect(tableOf('분전반 · 소내전원반').getByText('미결선')).toBeInTheDocument();
  });

  it('회로는 출력 포트마다 한 줄 — 이 회로가 먹이는 것이 용도다', () => {
    setStore([rack, main, ups, load], wired());
    render(<PowerRegisterView substationId="sub-1" selectedAssetId={null} onSelectAsset={vi.fn()} />);

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
    render(<PowerRegisterView substationId="sub-1" selectedAssetId={null} onSelectAsset={vi.fn()} />);

    const circuit = tableOf('분전반 · 소내전원반').getAllByRole('row')[2]!; // 머리글 · 입력 다음
    fireEvent.click(within(circuit).getByRole('button', { name: '용량 고치기' }));
    /* 용량도 목록이다(정해진 값) — 고르면 그 자리에서 담긴다. */
    fireEvent.change(screen.getByRole('combobox', { name: '용량' }), { target: { value: '30' } });

    const staged = v2WorkingCopyStore.getState().overlays.assets.updates['main'];
    const port = (staged?.ports as { id: string; fieldValues: Record<string, unknown> }[]).find((p) => p.id === 'main-o1');
    expect(port?.fieldValues).toEqual({ voltage: 'AC 220V 1φ', ampere: 30 });
    /* 다른 회로에는 적히지 않는다 — 판 하나에 값 하나가 아니다. */
    const other = (staged?.ports as { id: string; fieldValues: Record<string, unknown> }[]).find((p) => p.id === 'main-o2');
    expect(other?.fieldValues.ampere).toBeUndefined();
    // 표가 그대로 서 있다(무한 렌더로 사라지지 않았다).
    expect(tableOf('분전반 · 소내전원반').getAllByRole('row').length).toBe(4);
  });

  /**
   * **전압은 그 포트가 들고 온 값**이다 — 여기서 고치지 않는다.
   *
   * 「이 장비의 전원 입력은 DC 48V」는 그 품목의 성질이라 적는 자리는 장비 관리의 포트 선언
   * 하나뿐이다. 표에서도 고칠 수 있게 두면 같은 회로의 두 끝이 다른 전압으로 적히고, 어느
   * 쪽이 사실인지 알 길이 없어진다.
   */
  it('전압은 포트가 들고 온 값 — 표는 보여 주기만 한다', () => {
    const main3P = { ...main, ports: main.ports.map((p) => (p.id === 'main-o1' ? { ...p, fieldValues: { voltage: 'AC 380V 3φ' } } : p)) };
    setStore([rack, main3P, ups, load], wired());
    render(<PowerRegisterView substationId="sub-1" selectedAssetId={null} onSelectAsset={vi.fn()} />);

    const circuit = tableOf('분전반 · 소내전원반').getAllByRole('row')[2]!;
    expect(within(circuit).getByText('AC 380V 3φ')).toBeInTheDocument();
    /* 고치는 단추가 없다 — 용량·개폐는 회로마다 다르니 여기서 고치지만, 전압은 아니다. */
    expect(within(circuit).queryByRole('button', { name: '전압 고치기' })).toBeNull();
    expect(within(circuit).getByRole('button', { name: '용량 고치기' })).toBeInTheDocument();
  });

  it('길이는 그 자리에서 고친다 — 케이블에 담긴다', () => {
    setStore([rack, main, ups, load], wired());
    render(<PowerRegisterView substationId="sub-1" selectedAssetId={null} onSelectAsset={vi.fn()} />);

    /* 입력 줄의 길이 — 그 반의 첫 줄이다(회로 줄에도 같은 이름의 단추가 있다). */
    const input = tableOf('분전반 · UPS').getAllByRole('row')[1]!;
    fireEvent.click(within(input).getByRole('button', { name: '길이 고치기' }));
    fireEvent.change(screen.getByDisplayValue('8'), { target: { value: '12.5' } });
    fireEvent.blur(screen.getByDisplayValue('12.5'));

    const staged = v2WorkingCopyStore.getState().overlays.cables.updates['c1'];
    expect((staged?.specParams as Record<string, unknown>).lengthM).toBe(12.5);
  });
});

/**
 * **열 폭은 재서 정한다.** 손으로 나눴다가 두 번 틀렸다: 전압(「AC 220V 1φ」)이 두 줄로 접혔고,
 * 개폐는 글자가 아니라 스위치라 「ON」이 칸 밖으로 잘렸다. 눈으로는 멀쩡해 보이는 크기다.
 */
describe('계통 표 열 폭', () => {
  const valueFields = [
    ...portFieldsFor('power').filter((f) => f.type !== 'boolean'),
    ...cableFieldsFor('power'),
  ].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
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

  it('가장 긴 값을 담는 칸이 가장 넓다 — 전압에 위상까지 들어간다', () => {
    const [, , ...rest] = widths;
    const valueWidths = rest.slice(0, valueFields.length);
    const widest = valueFields[valueWidths.indexOf(Math.max(...valueWidths))]!;
    expect(widest.key).toBe('voltage');
  });

  it('용도가 남는 폭을 받는다 — 자료가 채우는 열이라 가장 넓다', () => {
    expect(widths[1]!).toBeGreaterThan(Math.max(...widths.filter((_, i) => i !== 1)));
  });

  /* 개폐는 스위치 + 글자라 회로 번호 칸보다 넓어야 한다 — 좁게 잡아 「ON」이 잘렸었다. */
  it('개폐 칸은 스위치가 들어갈 만큼 — 회로 번호 칸보다 넓다', () => {
    expect(widths[widths.length - 1]!).toBeGreaterThan(widths[0]!);
  });
});
