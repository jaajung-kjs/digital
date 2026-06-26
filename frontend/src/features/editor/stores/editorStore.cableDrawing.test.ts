import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './editorStore';
import { useInteractionStore } from './interactionStore';
import { useSelectionStore } from '../../workspace/selectionStore';

describe('editorStore — 케이블 그리기 종료 / 단일클릭', () => {
  beforeEach(() => {
    useEditorStore.getState().resetEditor();
    useEditorStore.getState().setTool('select');
    useInteractionStore.getState().cancel();
    useSelectionStore.setState({ selectedAssetId: null });
  });

  it('cancelCableDrawing: interaction idle + tool select 를 함께 복원 (먹통 방지)', () => {
    // 케이블 그리기 중(tool=cable, mode=cableDrawing)에서 다이얼로그 ESC 등으로 취소하는 상황.
    useEditorStore.getState().setTool('cable');
    useInteractionStore.getState().cableActivate();
    expect(useInteractionStore.getState().mode.kind).toBe('cableDrawing');

    useEditorStore.getState().cancelCableDrawing();

    // 핵심: mode 만 idle 로 두고 tool='cable' 로 남기면 캔버스가 먹통 → 반드시 함께 select 로.
    expect(useInteractionStore.getState().mode.kind).toBe('idle');
    expect(useEditorStore.getState().tool).toBe('select');
  });

  it('단일클릭(selectAsset)은 떠 있던 상세 패널을 닫는다 — 패널은 더블클릭(openDetail)에서만', () => {
    useEditorStore.getState().openDetail('a'); // 더블클릭 → 패널 오픈
    expect(useEditorStore.getState().rightPanel).toBe('detail');

    useEditorStore.getState().selectAsset('b'); // 단일클릭 = 선택만

    expect(useEditorStore.getState().rightPanel).toBeNull(); // 패널 닫힘(다시 안 뜸)
    expect(useSelectionStore.getState().selectedAssetId).toBe('b'); // 선택은 b 로
  });
});
