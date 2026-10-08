import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  createOrgNode,
  deleteOrgNode,
  fetchOrgTree,
  fetchStandards,
  fetchWageRates,
  patchOrgNode,
  type OrgKind,
} from './api';
import { putOrder, type OrderKind } from './model/api';
import type { WageRow } from './model/types';
import { useCatalog } from './model/hooks';

/** 올려 둔 기준정보 판 목록 — 「기준정보」 탭이 쓴다. */
export function useStandards() {
  return useQuery({ queryKey: ['v2', 'standards'], queryFn: fetchStandards, staleTime: 60_000 });
}
/** 임포트된 직종 노임 전체 — 기준정보 탭에서만 본다(457행이라 카탈로그에 싣지 않는다). */
export function useWageRates() {
  return useQuery({ queryKey: ['v2', 'wage-rates'], queryFn: fetchWageRates, staleTime: 60_000 });
}
export function useV2OrgTree() {
  return useQuery({ queryKey: ['v2', 'org-tree'], queryFn: fetchOrgTree, staleTime: 30_000 });
}
/**
 * 대장의 모든 부르는 쪽은 `mutateAsync` 를 기다렸다가 **제 화면에** 오류를 그린다(저장 바,
 * 분류 오류 줄, 모달 안). 그래서 전역 띠까지 뜨면 같은 문장이 두 번 선다 — `meta.quiet` 이
 * 그것을 끈다(`lib/queryClient.ts`). 조직 트리처럼 화면에 그릴 자리가 없는 곳은 전역 띠가
 * 유일한 표면이므로 붙이지 않는다.
 */
const QUIET = { quiet: true } as const;

/** 조직 트리 뮤테이션 — 성공 시 ['v2','org-tree'] 자동 무효화 */
export function useOrgMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['v2', 'org-tree'] });

  return {
    /* 만들기·이름 바꾸기는 **트리 안에서** 벌어지고 실패도 그 자리에서 말한다 — 전역 띠까지
       울리면 같은 문장이 화면 두 곳에 겹친다(`meta.quiet`). 삭제는 말할 자리가 없어 띠로 간다. */
    createOrgNode: useMutation({
      mutationFn: (v: { kind: OrgKind; body: Record<string, string> }) => createOrgNode(v.kind, v.body),
      onSuccess: invalidate,
      meta: QUIET,
    }),
    renameOrgNode: useMutation({
      mutationFn: (v: { kind: OrgKind; id: string; name: string }) => patchOrgNode(v.kind, v.id, { name: v.name }),
      onSuccess: invalidate,
      meta: QUIET,
    }),
    deleteOrgNode: useMutation({
      mutationFn: (v: { kind: OrgKind; id: string }) => deleteOrgNode(v.kind, v.id),
      onSuccess: invalidate,
    }),
  };
}

/**
 * 순서 바꾸기 — **모든 트리가 같은 것을 쓴다**(조직 · 분야 · 품목).
 *
 * 예전에는 조직만 제 손으로 순서를 고쳤고, 같은 트리 판을 쓰는 대장들은 못 했다. 종류마다
 * 길을 따로 내면 그렇게 갈린다 — 문은 하나고(`putOrder`), 무엇의 순서인지만 다르다.
 */
export function useReorder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { kind: OrderKind; ids: string[] }) => putOrder(v.kind, v.ids),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['v2', 'org-tree'] }),
        qc.invalidateQueries({ queryKey: ['v2', 'catalog'] }),
      ]);
    },
    meta: QUIET, // 실패는 트리가 그 자리에서 말한다
  });
}

/**
 * 직종 어휘 — **적용 중인 노임단가 판**이 유일한 출처다.
 *
 * 카탈로그는 직종 **코드**를 저장한다. 이름과 단가는 판에서 읽으므로, 반기마다 판을 갈아도
 * 대장을 손댈 일이 없고 이름이 바뀌면 화면이 저절로 새 이름을 쓴다.
 *
 * 아직 아무 판도 안 올렸으면 `rows` 가 비어 있다 — 그때 드롭다운은 잠기고 화면이 「기준정보를
 * 먼저 올리세요」라고 말한다. 저장은 막지 않는다(품셈 없이도 종류는 만들 수 있어야 한다).
 */
export function useWageCatalog() {
  const catalog = useCatalog();
  const std = catalog.data?.wageStandard ?? null;
  return useMemo(() => {
    const rows: WageRow[] = std?.rows ?? [];
    const byCode = new Map(rows.map((r) => [r.code, r]));
    return {
      effective: std?.latestDate ?? null,
      rows,
      /** 이 코드의 이름 — 판에 없으면 「(직종 1084)」처럼 코드라도 보여 준다. */
      nameOf: (code: string | null) => (code == null ? null : (byCode.get(code)?.name ?? `(직종 ${code})`)),
      /** 「1086 통신내선공」 — 저장되는 값을 앞에 둔다(보고서 인쇄와 같은 차례). */
      labelOf: (code: string | null) =>
        code == null ? null : `${code} ${byCode.get(code)?.name ?? '(표에 없음)'}`,
      /** 이 코드의 노임(원/일). 표에 없으면 null — 설계서가 「미등록」으로 말한다. */
      wageOf: (code: string | null) => (code == null ? null : (byCode.get(code)?.wage ?? null)),
      /**
       * 이 값이 **옛 회차**의 것이면 그 기준일, 최신 회차면 null.
       *
       * 이번 반기에 조사되지 않은 직종이 있다 — 그때는 그 직종의 가장 최근 값이 온다.
       * 숨기지 않고 언제 값인지 적는다.
       */
      staleDateOf: (code: string | null) => {
        const row = code == null ? undefined : byCode.get(code);
        if (!row || std?.latestDate == null) return null;
        return row.effectiveLabel === std.latestDate ? null : row.effectiveLabel;
      },
      /** 판에 있는 직종인가 — 없는 것을 고쳐야 한다고 짚을 때. */
      known: (code: string | null) => code != null && byCode.has(code),
      /**
       * 이 직종의 각주 문장 — **보고서 원문 그대로**.
       *
       * 「**」 직종은 조사되지 않아 단가가 없다. 그 이유를 우리가 지어내지 않고 보고서가 쓴
       * 문장을 그대로 보여 준다(기준이 바뀌면 문장도 함께 바뀐다).
       */
      noteOf: (code: string | null) => (code == null ? null : (byCode.get(code)?.markerNote ?? null)),
    };
  }, [std]);
}
