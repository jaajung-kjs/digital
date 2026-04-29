import { useState } from 'react';

/* ================================================================
   Upload Description Dialog
   ================================================================ */

export function UploadDialog({
  fileName,
  side,
  onConfirm,
  onCancel,
  isPending,
}: {
  fileName: string;
  side: 'front' | 'rear';
  onConfirm: (description: string) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [desc, setDesc] = useState('');

  return (
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-5 max-w-sm w-full mx-4 shadow-xl">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">
          {side === 'front' ? '전면' : '후면'} 사진 업로드
        </h4>
        <p className="text-xs text-gray-500 mb-3 truncate">{fileName}</p>
        <input
          type="text"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(desc); }}
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-4"
          placeholder="사진 설명 (예: UPS 교체 후)"
          autoFocus
        />
        <div className="flex gap-2">
          <button
            onClick={() => onConfirm(desc)}
            disabled={isPending}
            className="flex-1 text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? '업로드 중...' : '업로드'}
          </button>
          <button
            onClick={onCancel}
            disabled={isPending}
            className="text-sm px-4 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
