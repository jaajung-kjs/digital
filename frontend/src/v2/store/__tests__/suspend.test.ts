import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { V2Asset, V2Workingcopy } from '../../types';

const asset = (id: string, substationId: string): V2Asset => ({
  id, name: id, typeId: null, substationId, status: 'normal', floorId: null,
  x: null, y: null, width: null, height: null, parentAssetId: null,
  col: null, row: null, colSpan: null, rowSpan: null,
  fieldValues: {}, updatedAt: 'v1', ports: [],
});

/** 워킹카피 조회를 가짜로 — 국마다 자산 하나씩 든 판을 돌려준다. */
const wc = (substationId: string): V2Workingcopy => ({
  substation: { id: substationId, name: substationId, branchId: 'b', sortOrder: 1 },
  floors: [],
  assets: [asset(`${substationId}-asset`, substationId)],
  maintenanceLogs: [], inspectionLogs: [], cables: [], photos: [],
});

vi.mock('../../api', () => ({
  fetchWorkingcopy: vi.fn(async (id: string) => wc(id)),
}));

import { v2WorkingCopyStore } from '../workingCopyStore';

const st = () => v2WorkingCopyStore.getState();

beforeEach(async () => {
  /* 스토어는 모듈 수준이라 케이스 사이에 남는다. `load()` 는 보류를 **의도적으로** 지우지
     않으므로(한 겹 유지) 여기서 비운다 — 격리는 시험이 챌 일이다. */
  st().dropSuspended();
  await st().load('ss-a');
});

describe('보류하고 다녀오기', () => {
  /**
   * **담아 뒀다 되살리면 그대로 살아난다.**
   *
   * 예전에는 다른 국으로 옮기면 `confirmDiscard` 가 오버레이를 **버렸다**. 그래서 케이블을
   * 이으러 잠깐 다녀오는 일이 「지금까지 한 것을 버린다」와 같은 일이었다.
   */
  it('다른 국에 다녀와도 오버레이가 그대로다', async () => {
    st().stageAssetUpdate('ss-a-asset', { name: '고친 이름' });
    expect(st().dirtyCount()).toBe(1);

    await st().suspendAndLoad('ss-b');
    expect(st().substationId).toBe('ss-b');
    /* 다녀온 국은 **깨끗하다** — 거기서 고칠 일은 없다. */
    expect(st().overlays.assets.updates).toEqual({});

    await st().resumeSuspended();
    expect(st().substationId).toBe('ss-a');
    expect(st().overlays.assets.updates['ss-a-asset']).toEqual({ name: '고친 이름' });
    expect(st().suspended).toBeNull();
  });

  /**
   * **보류분도 「저장하지 않은 변경」이다.**
   *
   * 보류 중에는 로드된 국이 깨끗해서 `dirtyCount()` 가 0 이 된다. 그러면 셸의 이탈 가드가
   * 「변경 N건이 사라집니다」를 안 띄운 채 담아 둔 것을 **조용히 버린다**.
   */
  it('보류 중에도 변경 건수가 보류분을 함께 센다', async () => {
    st().stageAssetUpdate('ss-a-asset', { name: '고친 이름' });
    await st().suspendAndLoad('ss-b');
    expect(st().dirtyCount()).toBe(1);

    st().stageAssetUpdate('ss-b-asset', { name: '거기서도 고침' });
    expect(st().dirtyCount()).toBe(2);
  });

  /** **읽기 전용 = 보류 중**. 깃발을 따로 두지 않는다 — 어긋날 자리가 없다. */
  it('보류 중이면 읽기 전용이다', async () => {
    expect(st().readOnly()).toBe(false);
    await st().suspendAndLoad('ss-b');
    expect(st().readOnly()).toBe(true);
    await st().resumeSuspended();
    expect(st().readOnly()).toBe(false);
  });

  /* 떠날 때는 버린다 — 복원을 떠나는 길에 끼워 넣지 않는다(비동기라 절반만 끝난다). */
  it('버리면 보류가 사라진다', async () => {
    st().stageAssetUpdate('ss-a-asset', { name: '고친 이름' });
    await st().suspendAndLoad('ss-b');
    st().dropSuspended();
    expect(st().suspended).toBeNull();
    expect(st().dirtyCount()).toBe(0);
  });

  /* 보류가 없으면 돌아갈 곳이 없다 — 조용히 아무 일도 하지 않는다. */
  it('보류가 없으면 되살릴 것이 없다', async () => {
    await st().resumeSuspended();
    expect(st().substationId).toBe('ss-a');
  });

  /* `confirmDiscard` 가 「변경 N건이 사라집니다」라고 말했으면 보류분도 사라져야 참이다. */
  it('버리기(revert)는 보류분도 함께 버린다', async () => {
    st().stageAssetUpdate('ss-a-asset', { name: '고친 이름' });
    await st().suspendAndLoad('ss-b');
    st().revert();
    expect(st().dirtyCount()).toBe(0);
    expect(st().suspended).toBeNull();
  });

  /**
   * **케이블은 시작한 국의 것이다.**
   *
   * 예전에는 `stageCableCreate` 가 그때 로드된 국에 쌓여, A 에서 시작해 B 에서 고르면
   * 케이블이 B 의 것이 되었다. 되살린 뒤에 쌓으므로 이제 A 의 것이다.
   */
  it('되살린 뒤에 쌓으면 케이블이 담아 둔 국에 들어간다', async () => {
    st().stageAssetUpdate('ss-a-asset', { name: '고친 이름' });
    await st().suspendAndLoad('ss-b');
    await st().resumeSuspended();
    st().stageCableCreate({
      id: 'c-1', name: null, substationId: 'ss-a', aPortId: 'p-1', bPortId: 'p-2',
      categoryId: 'cat', pathPoints: [], specParams: {}, updatedAt: '',
    });
    expect(st().substationId).toBe('ss-a');
    expect(st().overlays.cables.creates['c-1']?.substationId).toBe('ss-a');
    expect(st().dirtyCount()).toBe(2);
  });

  /* 보류는 **한 겹만** — B 에서 또 C 로 가도 A 가 담아 둔 채로 남는다. */
  it('보류는 한 겹만 — 두 번 옮겨도 처음 것을 지킨다', async () => {
    st().stageAssetUpdate('ss-a-asset', { name: '고친 이름' });
    await st().suspendAndLoad('ss-b');
    await st().suspendAndLoad('ss-c');
    expect(st().substationId).toBe('ss-c');
    expect(st().suspended?.substationId).toBe('ss-a');
    await st().resumeSuspended();
    expect(st().substationId).toBe('ss-a');
    expect(st().overlays.assets.updates['ss-a-asset']).toEqual({ name: '고친 이름' });
  });
});
