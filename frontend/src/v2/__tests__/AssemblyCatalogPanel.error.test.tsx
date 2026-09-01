/**
 * 설비 품목 저장이 거절당하면 **서버가 말한 이유가 화면에 뜬다.**
 *
 * 예전에는 이 자리가 `e instanceof Error ? e.message : …` 였다. 그 `message` 는 axios 가
 * 지은 「Request failed with status code 400」이라, 어느 칸이 틀렸는지는커녕 한국어도
 * 아니었다 — 실제로 그 화면에서 저장이 안 되는데 이유를 알 수 없다는 말을 들었다.
 * 번역은 한 곳에서만 한다(`apiErrorMessage`); 이 시험은 그 자리가 다시 끊기지 않게 붙든다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../lib/queryClient';
import { AssemblyCatalogPanel } from '../components/admin/AssemblyCatalogPanel';
import type { V2Assembly, V2Catalog } from '../types';

/** 서버가 거절한 모양 그대로 — `{ error, message, details }` 를 실은 axios 오류. */
const rejection = {
  isAxiosError: true,
  message: 'Request failed with status code 400',
  response: { status: 400, data: { error: 'BAD_REQUEST', message: '구성 1번째 이름: 값을 입력하세요' } },
};

const updateAssembly = vi.fn();

/* 거절은 **시험마다 다시 심는다** — 이 프로젝트는 `mockReset: true` 라(vitest.config) 만들 때
   심어 둔 구현이 시험 시작 전에 지워진다. 그러면 저장이 조용히 성공해 시험이 헛돈다. */
beforeEach(() => {
  updateAssembly.mockRejectedValue(rejection);
});

vi.mock('../hooks', () => ({
  useCatalogMutations: () => ({
    createAssembly: { mutateAsync: vi.fn(), isPending: false },
    updateAssembly: { mutateAsync: updateAssembly, isPending: false },
    deleteAssembly: { mutateAsync: vi.fn(), isPending: false },
  }),
  useReorder: () => vi.fn(),
  /* 기준정보(노임)는 이 시험의 관심이 아니다 — 빈 판으로 둔다(`useWageCatalog` 의 모양 그대로). */
  useWageCatalog: () => ({
    effective: null, rows: [], known: () => false,
    nameOf: (c: string | null) => c, labelOf: (c: string | null) => c,
    wageOf: () => null, staleDateOf: () => null, noteOf: () => null,
  }),
}));

const assembly: V2Assembly = {
  id: 'asm-1', key: 'GROUNDING', name: '접지함체', categoryId: 'cat-1', sortOrder: 1,
  laborCode: null, unitPrice: null, installManDays: null, removeManDays: null, relocateManDays: null,
  items: [{
    id: 'it-1', assemblyId: 'asm-1', typeId: 'ty-1', name: '접지함체',
    col: 0, row: 0, colSpan: 1, rowSpan: 1, portCounts: {}, portPositions: {}, sortOrder: 0,
  }],
};

const catalog = {
  categories: [{ id: 'cat-1', key: 'STRUCT', name: '구조', sortOrder: 1, typeCount: 0 }],
  types: [{
    id: 'ty-1', key: 'GND', name: '접지함체', categoryId: 'cat-1', sortOrder: 1, assetCount: 0,
    laborCode: null, unitPrice: null, installManDays: 0, removeManDays: 0, relocateManDays: 0,
    containerSpecs: [], portTemplates: [],
  }],
  assemblies: [assembly],
  cableGroups: [],
} as unknown as V2Catalog;

const noop = { add: vi.fn(), rename: vi.fn(), remove: vi.fn(), removeBlocked: () => undefined };

describe('AssemblyCatalogPanel — 저장 거절', () => {
  it('서버가 말한 이유를 그대로 띄운다 — axios 의 영어 문장이 아니라', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AssemblyCatalogPanel catalog={catalog} category={noop} />
      </QueryClientProvider>,
    );

    /* 저장을 누르게 하려면 고친 것이 있어야 한다 — 이름 한 칸을 바꾼다. */
    fireEvent.change(screen.getByLabelText('설비 품목 이름'), { target: { value: '접지함체2' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(screen.getByText('구성 1번째 이름: 값을 입력하세요')).toBeTruthy());
    expect(screen.queryByText(/Request failed/)).toBeNull();
  });
});
