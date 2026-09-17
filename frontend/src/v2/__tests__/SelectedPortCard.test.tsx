/**
 * SelectedPortCard — **대국 케이블은 누구의 것인가**.
 *
 * 서버는 한쪽 끝만 이 국이면 케이블을 받는다(`commit.service.ts`). 그래서 대국으로 이은
 * 가닥이 반대쪽 국의 판에도 보이는데, 그 가닥은 이 워킹카피에 없어 고칠 수가 없다 — 고치면
 * 커밋이 `{ id, substationId }` 로 좁혀 튕기고(422) 저장 전체가 깨진다. 지금까지 그 말이
 * 화면에 없어 「왜 안 고쳐지지」가 됐다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { emptyOverlays, v2WorkingCopyStore } from '../store/workingCopyStore';
import { SelectedPortCard } from '../components/detail/SelectedPortCard';
import { buildPortIndex } from '../peerResolve';
import type { V2Asset, V2Cable } from '../types';

const CATEGORY = { id: 'cat-opgw', name: 'OPGW', groupId: 'fiber' };
vi.mock('../hooks', () => ({
  useV2Catalog: () => ({ data: { cableGroups: [{ key: 'fiber', name: '광', categories: [CATEGORY] }] } }),
}));

const port = (id: string, assetId: string, name: string) => ({
  id, assetId, group: 'CORE', index: 1, name,
  direction: 'BI' as const, medium: 'fiber', positions: 1, fieldValues: {},
});
const asset = (id: string, name: string, substationId: string, ports: ReturnType<typeof port>[]): V2Asset => ({
  id, name, typeId: 't', substationId, status: 'normal',
  floorId: null, x: null, y: null, width: null, height: null,
  parentAssetId: null, col: null, row: null, colSpan: null, rowSpan: null,
  fieldValues: {}, updatedAt: 'v', ports,
});

const HERE = 'ss-here';
const mine = asset('mine', '판암 OFD', HERE, [port('p-mine', 'mine', '광 1')]);
const alsoMine = asset('also', '판암 송광치', HERE, [port('p-also', 'also', '광 1')]);

/** 이 국이 주인인 가닥 — 고칠 수 있다. */
const localCable: V2Cable = {
  id: 'c-local', name: null, substationId: HERE, aPortId: 'p-mine', bPortId: 'p-also',
  categoryId: CATEGORY.id, pathPoints: [], specParams: { lengthM: 40 }, updatedAt: 'v',
};

/** **저쪽 국이 주인인** 가닥 — 이 판에서는 읽기만 된다. 건너편 끝점은 서버가 실어 준다. */
const foreignCable: V2Cable = {
  id: 'c-foreign', name: null, substationId: 'ss-there', aPortId: 'p-mine', bPortId: 'p-far',
  categoryId: CATEGORY.id, pathPoints: [], specParams: { lengthM: 1200 }, updatedAt: 'v',
  bRef: {
    portName: '광', portGroup: 'CORE', portIndex: 1,
    assetId: 'far', assetName: '서홍천 OFD', substationId: 'ss-there', substationName: '서홍천S/S',
  },
};

function setStore(cables: V2Cable[]) {
  v2WorkingCopyStore.setState({
    substationId: HERE,
    saved: { substation: null, floors: [], assets: [mine, alsoMine], maintenanceLogs: [], inspectionLogs: [], cables, photos: [] },
    overlays: emptyOverlays(),
    baseVersions: {},
  });
}

function draw(cables: V2Cable[]) {
  const portIndex = buildPortIndex([mine, alsoMine]);
  const cablesByPortId = new Map(
    [['p-mine', cables.map((c) => ({ cableId: c.id, peerPortId: c.aPortId === 'p-mine' ? c.bPortId : c.aPortId, cable: c }))]],
  );
  return render(
    <MemoryRouter>
      <SelectedPortCard
        port={mine.ports[0]!}
        owner={mine}
        localSubstationId={HERE}
        cablesByPortId={cablesByPortId}
        portIndex={portIndex}
        label={(id) => ({ primary: id, secondary: null })}
        onSelectAsset={vi.fn()}
        onTrace={vi.fn()}
        onDeleteCable={vi.fn()}
        traceResult={null}
        onTopology={vi.fn()}
        onClearTrace={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe('대국 케이블은 여는 쪽 국의 것이라고 적는다', () => {
  beforeEach(() => setStore([]));

  it('이 국의 가닥은 그대로 고칠 수 있다', () => {
    setStore([localCable]);
    draw([localCable]);
    expect(screen.getByRole('button', { name: '길이 고치기' })).toBeInTheDocument();
    expect(screen.queryByText(/의 케이블/)).toBeNull();
  });

  it('남의 국 가닥은 누구의 것인지 적고 그 국으로 가는 길을 둔다', () => {
    setStore([foreignCable]);
    draw([foreignCable]);
    expect(screen.getByText('서홍천S/S')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '그 변전소로 가기' })).toBeInTheDocument();
  });

  /* 누를 수 있는데 아무 일도 안 일어나는 칸을 만들지 않는다 — 값은 읽는 줄로 끝난다. */
  it('남의 국 가닥은 값 칸이 잠긴다', () => {
    setStore([foreignCable]);
    draw([foreignCable]);
    expect(screen.queryByRole('button', { name: '길이 고치기' })).toBeNull();
    /* 값은 **그대로 보인다** — 잠근다고 사실을 지우지 않는다(품목 줄의 요약과 길이 줄, 둘). */
    expect(screen.getAllByText('1200m')).toHaveLength(2);
  });

  /* 품목도 같다 — 고쳐 봐도 이 국의 워킹카피에 그 가닥이 없다. */
  it('남의 국 가닥은 품목도 못 바꾼다', () => {
    setStore([foreignCable]);
    draw([foreignCable]);
    expect(screen.queryByRole('button', { name: '케이블 품목 바꾸기' })).toBeNull();
    expect(screen.getByText('OPGW')).toBeInTheDocument();
  });

  /**
   * **지우는 길도 없다.** 커밋이 `{ id, substationId }` 로 좁혀 지우므로 여기서 지우면 422 로
   * 저장 전체가 깨진다 — 값만 잠그고 삭제를 남겨 두면 잠근 뜻이 무색하다.
   */
  it('남의 국 가닥은 지울 수도 없다', () => {
    setStore([foreignCable]);
    draw([foreignCable]);
    expect(screen.queryByRole('button', { name: '연결 삭제' })).toBeNull();
  });

  /* 이 국의 가닥은 그대로 지울 수 있다 — 위 시험이 「삭제 버튼이 원래 없다」로 통과하지 않게. */
  it('이 국의 가닥은 지울 수 있다', () => {
    setStore([localCable]);
    draw([localCable]);
    expect(screen.getByRole('button', { name: '연결 삭제' })).toBeInTheDocument();
  });
});
