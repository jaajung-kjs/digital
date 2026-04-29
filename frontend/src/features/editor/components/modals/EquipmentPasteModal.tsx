import { useEditorStore } from '../../stores/editorStore';

interface EquipmentPasteModalProps {
  onPaste: () => void;
}

/**
 * Modal triggered by Ctrl+V on a copied equipment. Asks for a new name
 * before committing the paste via `onPaste`.
 */
export function EquipmentPasteModal({ onPaste }: EquipmentPasteModalProps) {
  const open = useEditorStore((s) => s.pasteEquipmentModalOpen);
  const setOpen = useEditorStore((s) => s.setPasteEquipmentModalOpen);
  const pasteEquipmentName = useEditorStore((s) => s.pasteEquipmentName);
  const setPasteEquipmentName = useEditorStore((s) => s.setPasteEquipmentName);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">설비 붙여넣기</h3>
        <p className="text-sm text-gray-500 mb-3">복사한 설비의 새 이름을 입력하세요.</p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">설비 이름</label>
          <input
            type="text"
            value={pasteEquipmentName}
            onChange={(e) => setPasteEquipmentName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && pasteEquipmentName) onPaste(); }}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="예: UPS-02"
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={() => { setOpen(false); setPasteEquipmentName(''); }} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">취소</button>
          <button onClick={onPaste} disabled={!pasteEquipmentName} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">붙여넣기</button>
        </div>
      </div>
    </div>
  );
}
