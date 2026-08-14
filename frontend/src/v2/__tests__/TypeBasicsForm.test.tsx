/**
 * TypeBasicsForm — 자산 종류의 기본정보·공량 입력
 *
 * (a) 원본 값이 화면에 렌더된다
 * (b) 이름 변경 시 onChange({name}) 1회 호출
 * (c) draftIssues 결과의 해당 path 이슈가 필드 하단 text-xs text-danger 로 표시
 * (d) **키도 배치 여부도 묻지 않는다** — 키는 서버가 붙이는 참조용 식별자이고, 도면에
 *     놓이는 것은 설비 종류뿐이라 자산 종류에는 배치라는 개념이 없다.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { V2AssetType, V2Catalog } from '../types';
import type { TypeDraft } from '../catalogDraft';
import { typeToDraft } from '../catalogDraft';
import { TypeBasicsForm } from '../components/admin/TypeBasicsForm';
import { IssueReveal } from '../../components/ui';

/* 직종 드롭다운은 적용 중인 노임단가 판을 읽는다(react-query) — 이 폼의 관심사가 아니므로
   어휘만 세워 준다(`PortsEditor.test` 가 매체 이름·색을 세우는 것과 같은 방식). */
vi.mock('../hooks', () => ({
  useWageCatalog: () => ({
    effective: '2026년도 상반기',
    rows: [
      { code: '1086', name: '통신내선공', sector: '일반공사', wage: 284880, marker: '', markerNote: null, effectiveLabel: '2026.1.1' },
    ],
    nameOf: (c: string | null) => (c === '1086' ? '통신내선공' : c && `(직종 ${c})`),
    wageOf: () => null,
    known: (c: string | null) => c === '1086',
    staleDateOf: () => null,
    noteOf: () => null,
  }),
}));

// ─── 팩토리 ─────────────────────────────────────────────────────────────────
const mkCatalog = (): V2Catalog => ({
  categories: [
    { id: 'cat-comm', key: '통신', name: '통신장비', sortOrder: 1 },
    { id: 'cat-struct', key: '구조물', name: '구조물', sortOrder: 2 },
  ],
  types: [],
  cableGroups: [],
  assemblies: [],
  wageStandard: null,
});

const mkType = (overrides: Partial<V2AssetType> = {}): V2AssetType => ({
  id: 'type-1',
  key: 'OPT-TERM',
  name: '광단말',
  categoryId: 'cat-comm',
  sortOrder: 1,
  assetCount: 0,
  laborCode: '통신내선공',
  installManDays: 2,
  removeManDays: 1,
  relocateManDays: 3,
  portTemplates: [],
  ...overrides,
});

// ─── 테스트 ──────────────────────────────────────────────────────────────────
describe('TypeBasicsForm', () => {
  const catalog = mkCatalog();

  it('(a) 원본 타입의 값이 렌더된다', () => {
    const type = mkType();
    const draft: TypeDraft = typeToDraft(type);
    const onChange = vi.fn();

    render(
      <TypeBasicsForm
        draft={draft}
        catalog={catalog}
        onChange={onChange}
        issues={[]}
        locked={false}
      />,
    );

    // 이름 input에 원본 값
    const nameInput = screen.getByRole('textbox', { name: /이름/i });
    expect((nameInput as HTMLInputElement).value).toBe('광단말');
  });

  it('(b) 이름 변경 시 onChange({ name }) 를 1회 호출한다', () => {
    const type = mkType();
    const draft: TypeDraft = typeToDraft(type);
    const onChange = vi.fn();

    render(
      <TypeBasicsForm
        draft={draft}
        catalog={catalog}
        onChange={onChange}
        issues={[]}
        locked={false}
      />,
    );

    const nameInput = screen.getByRole('textbox', { name: /이름/i });
    fireEvent.change(nameInput, { target: { value: '광단말 B' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ name: '광단말 B' });
  });

  /* 아직 손대지 않은 칸은 실수라고 부르지 않는다 — 칸을 떠난 뒤부터 말한다. */
  it('(c) path=name 이슈는 손대기 전엔 조용하고, 칸을 떠나면 이름 필드 하단에 붉게 뜬다', () => {
    const type = mkType({ name: '' });
    const draft: TypeDraft = typeToDraft(type);
    const onChange = vi.fn();
    const issues = [{ path: 'name', message: '이름은 필수입니다' }];

    render(
      <TypeBasicsForm
        draft={draft}
        catalog={catalog}
        onChange={onChange}
        issues={issues}
        locked={false}
      />,
    );

    expect(screen.queryByText('이름은 필수입니다')).toBeNull();

    fireEvent.blur(screen.getByRole('textbox', { name: '이름' }));

    const errorEl = screen.getByText('이름은 필수입니다');
    expect(errorEl.className).toContain('text-xs');
    expect(errorEl.className).toContain('text-danger');
  });

  it('(c-2) 저장이 막히면 손대지 않은 칸까지 전부 짚어 준다', () => {
    render(
      <IssueReveal.Provider value>
        <TypeBasicsForm
          draft={typeToDraft(mkType({ name: '' }))}
          catalog={catalog}
          onChange={vi.fn()}
          issues={[{ path: 'name', message: '이름은 필수입니다' }]}
          locked={false}
        />
      </IssueReveal.Provider>,
    );
    expect(screen.getByText('이름은 필수입니다')).toBeTruthy();
  });

  /* 키는 시드·마이그레이션이 종류를 가리키는 참조용 식별자다. 필수 입력으로 두면 새 종류를
     만들 때마다 아무도 읽지 않을 영문 키를 지어내야 했다 — 서버가 붙인다. */
  it('(d) 키는 묻지 않는다', () => {
    const type = mkType();
    render(
      <TypeBasicsForm draft={typeToDraft(type)} catalog={catalog} onChange={vi.fn()} issues={[]} locked={false} />,
    );
    expect(screen.queryByRole('textbox', { name: /키/i })).toBeNull();
  });

  /* 도면에 놓이는 것은 설비 종류뿐이다 — 자산 종류에는 배치라는 개념이 없다.
     (기본 W/H 는 저장·편집만 되고 읽는 곳이 한 군데도 없는 죽은 값이기도 했다.) */
  it('(e) 배치 여부도 기본 크기도 묻지 않는다', () => {
    const type = mkType();
    render(
      <TypeBasicsForm draft={typeToDraft(type)} catalog={catalog} onChange={vi.fn()} issues={[]} locked={false} />,
    );
    expect(screen.queryByText(/평면도에 배치/)).toBeNull();
    expect(screen.queryByRole('spinbutton', { name: /기본 [WH]/ })).toBeNull();
  });
});
