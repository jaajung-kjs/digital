/** 랙 모듈 React Query 키 — substationCommit 의 캐시 무효화 등에서 사용. */
export const RACK_MODULE_KEYS = {
  all: ['rack-modules'] as const,
  byRack: (rackId: string) => ['rack-modules', 'byRack', rackId] as const,
  detail: (id: string) => ['rack-modules', 'detail', id] as const,
};
