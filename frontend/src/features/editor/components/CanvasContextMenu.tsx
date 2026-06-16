import { useEditorStore } from '../stores/editorStore';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { useSelectionStore } from '../../workspace/selectionStore';
import { useTraceGraph } from '../../trace/traceGraph';
import { cableToAddress } from '../../workspace/selectionHighlight';

export interface CanvasContextMenuState {
  /** 메뉴를 띄울 화면 좌표 (clientX/clientY) */
  x: number;
  y: number;
  target: { type: 'equipment' | 'cable'; id: string };
}

interface CanvasContextMenuProps {
  menu: CanvasContextMenuState;
  onClose: () => void;
}

/**
 * 캔버스 우클릭 컨텍스트 메뉴. 설비/케이블 대상에 따라 항목이 달라진다.
 * 마크업/오버레이 패턴은 EditorInsertBar 의 프리셋 컨텍스트 메뉴를 따른다.
 */
export function CanvasContextMenu({ menu, onClose }: CanvasContextMenuProps) {
  const { x, y, target } = menu;
  const { graph } = useTraceGraph();

  const handleOpenDetail = () => {
    const es = useEditorStore.getState();
    es.openDetail(target.id);
    es.bumpFocusTick();
    onClose();
  };

  const handleDuplicate = () => {
    const es = useEditorStore.getState();
    const asset = useSubstationWorkingCopy.getState().effectiveAssets().find((a) => a.id === target.id);
    if (asset) {
      es.setClipboard({ type: 'equipment', data: asset });
      es.setPasteEquipmentName('');
      es.setPasteEquipmentModalOpen(true);
    }
    onClose();
  };

  const handleDeleteEquipment = () => {
    const es = useEditorStore.getState();
    const asset = useSubstationWorkingCopy.getState().effectiveAssets().find((a) => a.id === target.id);
    onClose();
    if (!asset) return;
    if (!window.confirm(`'${asset.name}' 설비를 삭제하시겠습니까? 연결된 케이블도 함께 삭제됩니다.`)) return;
    useSubstationWorkingCopy.getState().stageEquipmentDeleteCascade(target.id);
    es.clearSelection();
  };

  const handleTraceCable = () => {
    const addr = graph ? cableToAddress(target.id, null, graph) : null;
    useSelectionStore.getState().setSelectedComponent(addr?.assetId ?? target.id, addr?.core ?? null, target.id);
    onClose();
  };

  const handleDeleteCable = () => {
    const es = useEditorStore.getState();
    onClose();
    if (!window.confirm('선택한 케이블을 삭제하시겠습니까?')) return;
    useSubstationWorkingCopy.getState().stageCableDelete(target.id);
    es.setSelectedCableId(null);
  };

  const items: { label: string; onClick: () => void; danger?: boolean }[] =
    target.type === 'equipment'
      ? [
          { label: '상세 열기', onClick: handleOpenDetail },
          { label: '복제', onClick: handleDuplicate },
          { label: '삭제', onClick: handleDeleteEquipment, danger: true },
        ]
      : [
          { label: '경로 추적', onClick: handleTraceCable },
          { label: '삭제', onClick: handleDeleteCable, danger: true },
        ];

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="fixed z-50 bg-surface border border-line rounded-md shadow-lg py-1 min-w-[140px]"
        style={{ left: x, top: y }}
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              item.danger
                ? 'text-danger hover:bg-danger-bg'
                : 'text-content hover:bg-surface-2'
            }`}
            onClick={item.onClick}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}
