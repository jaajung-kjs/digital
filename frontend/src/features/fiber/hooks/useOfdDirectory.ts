import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import { queryClient } from '../../../lib/queryClient';
import { useEditorStore } from '../../editor/stores/editorStore';
import { isTempId } from '../../../utils/idHelpers';

/**
 * 글로벌 OFD directory — pending FiberPath display 와 picker 가 공유하는 단일 source.
 *
 * D안: backend 가 floor.fiberPaths 에 OFD 의 name+substationName 을 denorm 해 주므로
 * saved path 표시는 directory 없이도 가능. directory 는 (1) picker 의 "변전소로 검색"
 * 과 (2) pending path 의 양쪽 OFD 정보 합성에 필요.
 *
 * 로컬에서 막 생성된 (아직 저장 안 한) OFD 도 directory 에 합쳐 줌 — substationName 은
 * 미지 (저장 후 backend 가 채움). 현재 floor 의 unsaved OFD 한정.
 */

export interface OfdDirectoryEntry {
  id: string;
  name: string;
  substationName: string;
  /** OFD 가 속한 floor — 원격 OFD 로 navigate 할 때 사용. unsaved 면 null. */
  floorId: string | null;
}

const QUERY_KEY = ['ofd-directory'] as const;

async function fetchOfdList(): Promise<Array<{ id: string; name: string; substationName?: string; floorId?: string | null }>> {
  const { data } = await api.get<{ data: Array<{ id: string; name: string; substationName?: string; floorId?: string | null }> }>(
    '/equipment',
    { params: { kind: 'OFD' } },
  );
  return data.data;
}

function mergeLocalUnsaved(
  saved: Array<{ id: string; name: string; substationName?: string; floorId?: string | null }>,
  localEquipment: { id: string; name: string; kind: string }[],
): OfdDirectoryEntry[] {
  const m = new Map<string, OfdDirectoryEntry>(
    saved.map((e) => ({
      id: e.id,
      name: e.name,
      substationName: e.substationName ?? '',
      floorId: e.floorId ?? null,
    })).map((e) => [e.id, e]),
  );
  for (const eq of localEquipment) {
    if (eq.kind !== 'OFD') continue;
    if (m.has(eq.id)) continue;
    if (!isTempId(eq.id)) continue;
    m.set(eq.id, { id: eq.id, name: eq.name, substationName: '', floorId: null });
  }
  return [...m.values()];
}

/**
 * Hook 형태 — React 컴포넌트에서 사용.
 * 반환은 lookup 용 Map. unsaved local OFD 도 포함.
 */
export function useOfdDirectory(): Map<string, OfdDirectoryEntry> {
  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchOfdList,
    staleTime: 5 * 60 * 1000,
  });
  const localEquipment = useEditorStore((s) => s.localEquipment);
  return useMemo(() => {
    const list = mergeLocalUnsaved(data ?? [], localEquipment);
    return new Map(list.map((e) => [e.id, e]));
  }, [data, localEquipment]);
}

/**
 * Non-hook accessor — zustand store action 등 비-React 컨텍스트용.
 * 캐시된 데이터가 없으면 빈 Map (caller 가 fallback 처리).
 * Fetch 가 필요하면 `ensureOfdDirectory()` 사용.
 */
export function getOfdDirectory(): Map<string, OfdDirectoryEntry> {
  const saved = queryClient.getQueryData<Awaited<ReturnType<typeof fetchOfdList>>>(QUERY_KEY) ?? [];
  const localEquipment = useEditorStore.getState().localEquipment;
  const list = mergeLocalUnsaved(saved, localEquipment);
  return new Map(list.map((e) => [e.id, e]));
}

/**
 * 비-React 진입점에서 directory 를 보장해야 할 때. 캐시 hit 면 즉시 반환.
 */
export async function ensureOfdDirectory(): Promise<Map<string, OfdDirectoryEntry>> {
  await queryClient.ensureQueryData({
    queryKey: QUERY_KEY,
    queryFn: fetchOfdList,
    staleTime: 5 * 60 * 1000,
  });
  return getOfdDirectory();
}
