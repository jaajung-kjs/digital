import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './editorStore';

// 우측 패널 단일 enum(rightPanel) — 동시에 최대 하나만 열리는 상호배타 불변식 검증.
describe('editorStore rightPanel (single mutually-exclusive enum)', () => {
  beforeEach(() => {
    useEditorStore.getState().resetEditor();
  });

  it('초기 상태는 닫힘', () => {
    const s = useEditorStore.getState();
    expect(s.rightPanel).toBeNull();
    expect(s.detailAssetId).toBeNull();
    expect(s.detailPanelEquipmentId).toBeNull();
  });

  it("openDetail('a') → detail + detailAssetId 'a' + alias 동기화", () => {
    useEditorStore.getState().openDetail('a');
    const s = useEditorStore.getState();
    expect(s.rightPanel).toBe('detail');
    expect(s.detailAssetId).toBe('a');
    // 캔버스 선택/하이라이트가 읽는 alias 가 detail 을 반영.
    expect(s.detailPanelEquipmentId).toBe('a');
  });

  it("openPanel('report') 가 열려 있던 detail 을 닫는다 (상호배타)", () => {
    useEditorStore.getState().openDetail('a');
    useEditorStore.getState().openPanel('report');
    const s = useEditorStore.getState();
    expect(s.rightPanel).toBe('report');
    expect(s.detailAssetId).toBeNull();
    // detail 이 닫혔으므로 alias 도 null.
    expect(s.detailPanelEquipmentId).toBeNull();
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

  it('closeRightPanel → null + detailAssetId/alias null', () => {
    useEditorStore.getState().openDetail('a');
    useEditorStore.getState().closeRightPanel();
    const s = useEditorStore.getState();
    expect(s.rightPanel).toBeNull();
    expect(s.detailAssetId).toBeNull();
    expect(s.detailPanelEquipmentId).toBeNull();
  });

  it('alias 는 detail 일 때만 채워진다 (report/history/background 는 null)', () => {
    const store = useEditorStore.getState();
    store.openPanel('history');
    expect(useEditorStore.getState().detailPanelEquipmentId).toBeNull();
    store.openDetail('x');
    expect(useEditorStore.getState().detailPanelEquipmentId).toBe('x');
    store.openPanel('background');
    expect(useEditorStore.getState().detailPanelEquipmentId).toBeNull();
  });
});
