/**
 * PortsEditor — **줄 수가 고정된 표**. 종류마다 한 줄, 개수만 적는다(0 = 없음).
 *
 * 포트 종류는 고정 어휘라(`portPresets()` 일곱) 편집기도 고정일 수 있다. 예전에는 종류를
 * 고를 때마다 카드가 쌓여 자산마다 편집 화면의 키가 달랐다(§1.6 위반).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { V2Catalog } from '../types';
import type { TypeDraft } from '../catalogDraft';
import { PortsEditor } from '../components/admin/PortsEditor';

/* 판은 매체 이름·색을 카탈로그에서 읽는다(`useMediumLabel`·`useMediumColor`) — 그 훅은
   react-query 를 타므로 여기서는 어휘만 돌려주는 목으로 갈음한다. */
const MEDIUM_NAMES: Record<string, string> = {
  power: '전원', network: '네트워크', fiber: '광', control: '제어', ground: '접지',
};
vi.mock('../hooks', () => ({
  useMediumLabel: () => (key: string) => MEDIUM_NAMES[key] ?? key,
  useMediumColor: () => () => null,
}));

// ─── 팩토리 ─────────────────────────────────────────────────────────────────
const mkCatalog = (): V2Catalog => ({
  categories: [{ id: 'cat-1', key: '통신', name: '통신장비', sortOrder: 1 }],
  types: [],
  cableGroups: [
    { id: 'cg-1', key: 'fiber', name: '광', color: '#8B5CF6', laborCode: null, installManDays: 0, removeManDays: 0, sortOrder: 1, categories: [] },
    { id: 'cg-2', key: 'network', name: '통신', color: '#3B82F6', laborCode: null, installManDays: 0, removeManDays: 0, sortOrder: 2, categories: [] },
  ],
});

const mkDraft = (portOverrides: TypeDraft['ports'] = []): TypeDraft => ({
  key: 'RACK',
  name: '랙',
  categoryId: 'cat-1',
  sortOrder: 1,
  defaultWidth: null,
  defaultHeight: null,
  laborCode: null,
  installManDays: 0,
  removeManDays: 0,
  relocateManDays: 0,
  fieldDefs: [],
  containers: [],
  ports: portOverrides,
  links: [],
});

// ─── 테스트 ──────────────────────────────────────────────────────────────────
describe('PortsEditor', () => {
  const catalog = mkCatalog();

  it('(a) 개수 칸은 **판의 구획 라벨 옆**에 있다', () => {
    const draft = mkDraft([
      { group: 'A', count: 12, direction: 'BI', medium: 'fiber', namePattern: '코어 {n}' },
    ]);
    render(<PortsEditor draft={draft} onChange={vi.fn()} issues={[]} />);

    // 구획 이름은 포트 이름에서 나온다(광이 둘이라 갈린다) — 그 옆 칸이 개수다.
    expect((screen.getByLabelText('코어 개수') as HTMLInputElement).value).toBe('12');
    // 지어내야 하던 값들은 화면에 없다 — 종류가 이미 정했다.
    expect(screen.queryByDisplayValue('A')).toBeNull();
    expect(screen.queryByDisplayValue('코어 {n}')).toBeNull();
  });

  /* 표는 늘 일곱 줄이다 — 무엇을 고르든 키가 그대로여야 자산마다 화면이 달라지지 않는다. */
  it('(a-2) 포트가 하나도 없어도 종류 줄은 모두 서 있다', () => {
    render(<PortsEditor draft={mkDraft([])} onChange={vi.fn()} issues={[]} />);
    for (const name of ['전원 입력', '전원 출력', '네트워크', '광', 'OPGW', '제어', '접지']) {
      expect((screen.getByLabelText(`${name} 개수`) as HTMLInputElement).value).toBe('0');
    }
  });

  /* 예전에는 종류마다 버튼이 있어 누르면 카드가 하나 쌓였다. 이제 그 줄의 개수를 적으면 된다. */
  it('(b) 개수를 적으면 그 종류의 포트가 규칙에 맞게 만들어진다', () => {
    const onChange = vi.fn();
    render(<PortsEditor draft={mkDraft([])} onChange={onChange} issues={[]} />);

    fireEvent.change(screen.getByLabelText('네트워크 개수'), { target: { value: '24' } });

    const called = onChange.mock.calls[0][0] as { ports: TypeDraft['ports'] };
    expect(called.ports).toHaveLength(1);
    expect(called.ports[0]).toMatchObject({ medium: 'network', direction: 'BI', count: 24 });
    // 지어낼 필요가 없어야 한다 — 빈칸으로 나오면 예전과 같아진다.
    expect(called.ports[0]!.group).not.toBe('');
    expect(called.ports[0]!.namePattern).toContain('{n}');
  });

  it('(b-2) 전원은 입력·출력이 따로 있다 — 서로 다른 물건이다', () => {
    const onChange = vi.fn();
    render(<PortsEditor draft={mkDraft([])} onChange={onChange} issues={[]} />);

    fireEvent.change(screen.getByLabelText('전원 출력 개수'), { target: { value: '2' } });
    expect(onChange.mock.calls[0][0].ports[0]).toMatchObject({ medium: 'power', direction: 'OUT' });
  });

  /* 개수 0 이 곧 「그 종류 없음」이다 — 지우는 길이 따로 있으면 규칙이 둘이 된다. */
  it('(b-3) 개수를 0 으로 되돌리면 그 종류가 빠진다', () => {
    const existing = mkDraft([{ group: 'NETWORK', count: 2, direction: 'BI', medium: 'network', namePattern: '네트워크 {n}' }]);
    const onChange = vi.fn();
    render(<PortsEditor draft={existing} onChange={onChange} issues={[]} />);

    fireEvent.change(screen.getByLabelText('네트워크 개수'), { target: { value: '0' } });
    expect(onChange.mock.calls[0][0].ports).toHaveLength(0);
  });

  /* 24심 OPGW 한 가닥은 앞면 24구로 갈라져 나온다 — 코어 하나가 어댑터 하나다.
     그래서 코어 수를 고치면 어댑터 개수가 따라온다(12심 슬롯 = 성단 12 + 코어 12). */
  it('(f) 성단 코어 수를 고치면 앞면 광 포트 개수가 따라온다', () => {
    const draft = mkDraft([
      { group: 'CORE', count: 24, direction: 'BI', medium: 'fiber', namePattern: '광 포트 {n}', positions: 1 },
      { group: 'TRUNK', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'OPGW', positions: 24 },
    ]);
    const onChange = vi.fn();
    render(<PortsEditor draft={draft} onChange={onChange} issues={[]} />);

    fireEvent.change(screen.getByLabelText('OPGW 심선 수'), { target: { value: '12' } });
    const ports = onChange.mock.calls[0][0].ports as TypeDraft['ports'];
    expect(ports.find((p) => p.group === 'TRUNK')!.positions).toBe(12);
    expect(ports.find((p) => p.group === 'CORE')!.count).toBe(12);
  });

  /* 성단을 켜면 나갈 어댑터가 함께 생긴다 — 24심 인입만 있고 앞면이 없는 판은 없다. */
  it('(f-3) 앞면이 없는 상태에서 성단을 켜면 광 포트가 함께 생긴다', () => {
    const onChange = vi.fn();
    render(<PortsEditor draft={mkDraft([])} onChange={onChange} issues={[]} />);

    fireEvent.change(screen.getByLabelText('OPGW 개수'), { target: { value: '1' } });
    const ports = onChange.mock.calls[0][0].ports as TypeDraft['ports'];
    const trunk = ports.find((p) => (p.positions ?? 1) > 1)!;
    const adapter = ports.find((p) => p.medium === 'fiber' && (p.positions ?? 1) === 1)!;
    expect(trunk.count).toBe(1);
    expect(adapter.count).toBe(trunk.positions);
  });

  /* 어긋난 조합도 실물에 있다 — 24심 인입 옆의 48구 판. 일부러 어긋내 둔 값은 안 건드린다. */
  it('(f-2) 어댑터가 코어 수와 이미 어긋나 있으면 따라오지 않는다', () => {
    const draft = mkDraft([
      { group: 'CORE', count: 48, direction: 'BI', medium: 'fiber', namePattern: '광 포트 {n}', positions: 1 },
      { group: 'TRUNK', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'OPGW', positions: 24 },
    ]);
    const onChange = vi.fn();
    render(<PortsEditor draft={draft} onChange={onChange} issues={[]} />);

    fireEvent.change(screen.getByLabelText('OPGW 심선 수'), { target: { value: '12' } });
    const ports = onChange.mock.calls[0][0].ports as TypeDraft['ports'];
    expect(ports.find((p) => p.group === 'CORE')!.count).toBe(48);
  });

  /* 광은 단심과 다심이 **다른 줄**이다 — 어느 쪽인지는 심선 수가 가른다. */
  it('(b-4) 광 다심 줄은 단심 광과 섞이지 않는다', () => {
    const existing = mkDraft([
      { group: 'FIBER', count: 24, direction: 'BI', medium: 'fiber', namePattern: '광 {n}', positions: 1 },
    ]);
    const onChange = vi.fn();
    render(<PortsEditor draft={existing} onChange={onChange} issues={[]} />);

    expect((screen.getByLabelText('광 개수') as HTMLInputElement).value).toBe('24');
    expect((screen.getByLabelText('OPGW 개수') as HTMLInputElement).value).toBe('0');

    fireEvent.change(screen.getByLabelText('OPGW 개수'), { target: { value: '1' } });
    const ports = onChange.mock.calls[0][0].ports as TypeDraft['ports'];
    expect(ports).toHaveLength(2);
    expect(ports[1]).toMatchObject({ medium: 'fiber', count: 1 });
    expect(ports[1]!.positions).toBeGreaterThan(1);
    expect(ports[1]!.group).not.toBe(ports[0]!.group);
  });

  /* 매체를 고르는 칸은 없앴다 — 종류 버튼이 곧 매체 선택이다. 나중에 매체를 바꾸고 싶으면
     그 줄을 지우고 다시 고른다(중간에 바꾸면 이름·심선 수가 어긋난 채로 남는다). */
  it('(c) 매체·방향·그룹·이름 패턴을 고르는 칸이 없다', () => {
    const draft = mkDraft([
      { group: 'A', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'A' },
    ]);
    render(<PortsEditor draft={draft} onChange={vi.fn()} issues={[]} />);

    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  /* 미리 잠그지 않는다. 정말로 막히는 것은 「지우려는 그 포트에 케이블이 물렸을 때」뿐이고
     그건 이 화면이 알 수 없다(케이블은 변전소마다 있다) — 알 수도 없는 것을 미리 막으면
     할 수 있는 일까지 함께 막힌다. 막히면 저장할 때 서버가 무엇이 막았는지 말해 준다. */
  it('(d) 사용 중인 종류라도 칸은 잠기지 않는다 — 늘리는 것도 줄이는 것도', () => {
    const draft = mkDraft([
      { group: 'NETWORK', count: 2, direction: 'BI', medium: 'network', namePattern: '네트워크 {n}' },
    ]);
    const onChange = vi.fn();
    render(<PortsEditor draft={draft} onChange={onChange} issues={[]} />);

    const count = screen.getByLabelText('네트워크 개수') as HTMLInputElement;
    expect(count.disabled).toBe(false);
    expect(count.min).toBe('0');

    fireEvent.change(count, { target: { value: '1' } });
    expect(onChange.mock.calls[0]![0].ports[0]).toMatchObject({ count: 1 });
  });

  /* 심선 수는 **다심이 있는 종류**(광)에만 뜬다. 그 안에서 1이면 어댑터, 24면 성단이다 —
     예전에는 매체 키가 그 둘을 갈랐다. 전원에는 다심이 없으므로 칸도 없다. */
  it('(e) 심선 수 칸은 **다심 줄**에만 뜬다', () => {
    const draft = mkDraft([
      { group: 'PWR', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 {n}' },
      { group: 'CORE', count: 24, direction: 'BI', medium: 'fiber', namePattern: '광 {n}', positions: 1 },
      { group: 'TRUNK', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'OPGW', positions: 24 },
    ]);
    render(<PortsEditor draft={draft} onChange={vi.fn()} issues={[]} />);

    expect(screen.queryByLabelText('전원 입력 심선 수')).toBeNull(); // 전원 — 다심이 없다
    expect(screen.queryByLabelText('광 심선 수')).toBeNull();        // 단심 광 어댑터 — 늘 1
    expect((screen.getByLabelText('OPGW 심선 수') as HTMLInputElement).value).toBe('24');
  });

  it('(e-2) 심선 수를 고치면 onChange 로 positions 가 전달된다', () => {
    const draft = mkDraft([
      { group: 'TRUNK', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'OPGW', positions: 24 },
    ]);
    const onChange = vi.fn();
    render(<PortsEditor draft={draft} onChange={onChange} issues={[]} />);

    fireEvent.change(screen.getByLabelText('OPGW 심선 수'), { target: { value: '12' } });
    const called = onChange.mock.calls[0][0] as { ports: TypeDraft['ports'] };
    expect(called.ports[0]).toMatchObject({ positions: 12 });
  });
});
