import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './editorStore';
import { useSelectionStore } from '../../workspace/selectionStore';

// 상세 대상 자산 id 는 워크스페이스 단일 선택 store(selectionStore.selectedAssetId)가
// SSOT — editorStore 액션이 거기에 위임해 쓴다. 동작은 동일(detail 일 때만 채워지고,
// 다른 패널/닫기 시 비워짐). 검증 대상 source 만 selectionStore 로 바뀐 것.
const detailAssetId = () => useSelectionStore.getState().selectedAssetId;

// 우측 패널 단일 enum(rightPanel) — 동시에 최대 하나만 열리는 상호배타 불변식 검증.
describe('editorStore rightPanel (single mutually-exclusive enum)', () => {
  beforeEach(() => {
    useEditorStore.getState().resetEditor();
    useSelectionStore.setState({ selectedAssetId: null });
  });

  it('초기 상태는 닫힘', () => {
    const s = useEditorStore.getState();
    expect(s.rightPanel).toBeNull();
    expect(detailAssetId()).toBeNull();
  });

  it("openDetail('a') → detail + selectedAssetId 'a'", () => {
    useEditorStore.getState().openDetail('a');
    expect(useEditorStore.getState().rightPanel).toBe('detail');
    expect(detailAssetId()).toBe('a');
  });

  it("openPanel('report') 가 열려 있던 detail 을 닫는다 (상호배타)", () => {
    useEditorStore.getState().openDetail('a');
    useEditorStore.getState().openPanel('report');
    expect(useEditorStore.getState().rightPanel).toBe('report');
    expect(detailAssetId()).toBeNull();
  });

  it('togglePanel: 같은 종류면 닫고, 다른 종류면 연다', () => {
    const { togglePanel } = useEditorStore.getState();
    togglePanel('report');
    expect(useEditorStore.getState().rightPanel).toBe('report');
    // 같은 종류 재토글 → 닫힘.
    togglePanel('report');
    expect(useEditorStore.getState().rightPanel).toBeNull();
    // 다른 종류 → 그 패널로 전환.
    togglePanel('history');
    expect(useEditorStore.getState().rightPanel).toBe('history');
    togglePanel('background');
    expect(useEditorStore.getState().rightPanel).toBe('background');
  });

  it('closeRightPanel → null + selectedAssetId null', () => {
    useEditorStore.getState().openDetail('a');
    useEditorStore.getState().closeRightPanel();
    expect(useEditorStore.getState().rightPanel).toBeNull();
    expect(detailAssetId()).toBeNull();
  });

  it('selectedAssetId 는 detail 일 때만 채워진다 (report/history/background 는 null)', () => {
    const store = useEditorStore.getState();
    store.openPanel('history');
    expect(detailAssetId()).toBeNull();
    store.openDetail('x');
    expect(detailAssetId()).toBe('x');
    store.openPanel('background');
    expect(detailAssetId()).toBeNull();
  });

  // 케이블 더블클릭 = 자산 openDetail(id, '연결') — 기존 자산 패널을 연결 탭으로 연다(새 패널 없음).
  it("openDetail('a', '연결') → detail + detailInitialTab '연결'", () => {
    useEditorStore.getState().openDetail('a', '연결');
    expect(useEditorStore.getState().rightPanel).toBe('detail');
    expect(useEditorStore.getState().detailInitialTab).toBe('연결');
    expect(detailAssetId()).toBe('a');
  });

  it("openDetail('a') (탭 미지정) → detailInitialTab null (정보 탭)", () => {
    useEditorStore.getState().openDetail('a', '연결');
    useEditorStore.getState().openDetail('b');
    expect(useEditorStore.getState().detailInitialTab).toBeNull();
  });
});
