interface Props {
  conflicts: { id: string; name?: string }[];
  onReloadLatest: () => void;
  onClose: () => void;
}

export function ConflictDialog({ conflicts, onReloadLatest, onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center" style={{ zIndex: 70 }}>
      <div className="bg-white rounded-lg shadow-lg p-5 w-96">
        <h2 className="text-sm font-semibold mb-2">충돌 — 다른 사용자가 먼저 변경했습니다</h2>
        <ul className="text-sm text-gray-600 mb-3 max-h-40 overflow-auto">
          {conflicts.map((c) => <li key={c.id}>· {c.name ?? c.id}</li>)}
        </ul>
        <p className="text-xs text-gray-500 mb-3">최신 내용을 불러온 뒤 내 변경을 다시 확인하고 커밋하세요.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-1 rounded bg-gray-100">닫기</button>
          <button onClick={onReloadLatest} className="text-sm px-3 py-1 rounded bg-blue-600 text-white">최신 불러오기</button>
        </div>
      </div>
    </div>
  );
}
