/**
 * TypeBasicsForm — TDD
 * (a) 원본 값이 화면에 렌더된다
 * (b) 이름 변경 시 onChange({name}) 1회 호출
 * (c) draftIssues 결과의 해당 path 이슈가 필드 하단 text-xs text-danger 로 표시
 * (d) 기존 타입은 key input 이 disabled
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { V2AssetType, V2Catalog } from '../types';
import type { TypeDraft } from '../catalogDraft';
import { typeToDraft } from '../catalogDraft';
import { TypeBasicsForm } from '../components/admin/TypeBasicsForm';

// ─── 팩토리 ─────────────────────────────────────────────────────────────────
const mkCatalog = (): V2Catalog => ({
  categories: [
    { id: 'cat-comm', key: '통신', name: '통신장비', sortOrder: 1 },
    { id: 'cat-struct', key: '구조물', name: '구조물', sortOrder: 2 },
  ],
  types: [],
  cableGroups: [],
});

const mkType = (overrides: Partial<V2AssetType> = {}): V2AssetType => ({
  id: 'type-1',
  key: 'RACK',
  name: '랙',
  categoryId: 'cat-comm',
  sortOrder: 1,
  isActive: true,
  assetCount: 0,
  placeable: true,
  defaultWidth: 60,
  defaultHeight: 80,
  laborType: '통신내선공',
  installHours: 2,
  removeHours: 1,
  relocateHours: 3,
  fieldDefs: [],
  containerSpecs: [],
  portTemplates: [],
  linkRules: [],
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
        original={type}
        catalog={catalog}
        onChange={onChange}
        issues={[]}
        locked={false}
      />,
    );

    // 이름 input에 원본 값
    const nameInput = screen.getByRole('textbox', { name: /이름/i });
    expect((nameInput as HTMLInputElement).value).toBe('랙');

    // key input에 원본 값
    const keyInput = screen.getByRole('textbox', { name: /키/i });
    expect((keyInput as HTMLInputElement).value).toBe('RACK');
  });

  it('(b) 이름 변경 시 onChange({ name }) 를 1회 호출한다', () => {
    const type = mkType();
    const draft: TypeDraft = typeToDraft(type);
    const onChange = vi.fn();

    render(
      <TypeBasicsForm
        draft={draft}
        original={type}
        catalog={catalog}
        onChange={onChange}
        issues={[]}
        locked={false}
      />,
    );

    const nameInput = screen.getByRole('textbox', { name: /이름/i });
    fireEvent.change(nameInput, { target: { value: '새 랙' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ name: '새 랙' });
  });

  it('(c) path=name 이슈가 이름 필드 하단에 text-xs text-danger 로 표시된다', () => {
    const type = mkType({ name: '' });
    const draft: TypeDraft = typeToDraft(type);
    const onChange = vi.fn();
    const issues = [{ path: 'name', message: '이름은 필수입니다' }];

    render(
      <TypeBasicsForm
        draft={draft}
        original={type}
        catalog={catalog}
        onChange={onChange}
        issues={issues}
        locked={false}
      />,
    );

    const errorEl = screen.getByText('이름은 필수입니다');
    expect(errorEl.className).toContain('text-xs');
    expect(errorEl.className).toContain('text-danger');
  });

  it('(d) 기존 타입(original != null)이면 key input이 disabled다', () => {
    const type = mkType();
    const draft: TypeDraft = typeToDraft(type);
    const onChange = vi.fn();

    render(
      <TypeBasicsForm
        draft={draft}
        original={type}
        catalog={catalog}
        onChange={onChange}
        issues={[]}
        locked={false}
      />,
    );

    const keyInput = screen.getByRole('textbox', { name: /키/i });
    expect((keyInput as HTMLInputElement).disabled).toBe(true);
  });

  it('(e) 신규 타입(original == null)이면 key input이 편집 가능하다', () => {
    const draft: TypeDraft = {
      key: '',
      name: '',
      categoryId: 'cat-comm',
      sortOrder: 0,
      isActive: true,
      placeable: false,
      defaultWidth: null,
      defaultHeight: null,
      laborType: null,
      installHours: 0,
      removeHours: 0,
      relocateHours: 0,
      fieldDefs: [],
      containers: [],
      ports: [],
      links: [],
    };
    const onChange = vi.fn();

    render(
      <TypeBasicsForm
        draft={draft}
        original={null}
        catalog={catalog}
        onChange={onChange}
        issues={[]}
        locked={false}
      />,
    );

    const keyInput = screen.getByRole('textbox', { name: /키/i });
    expect((keyInput as HTMLInputElement).disabled).toBe(false);

    fireEvent.change(keyInput, { target: { value: 'NEW_TYPE' } });
    expect(onChange).toHaveBeenCalledWith({ key: 'NEW_TYPE' });
  });
});
