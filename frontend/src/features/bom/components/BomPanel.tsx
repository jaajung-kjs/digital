import { useState } from 'react';
import { useBom } from '../hooks/useBom';
import { BomTable } from './BomTable';
import { BomExportButton } from './BomExportButton';

interface BomPanelProps {
  roomId: string;
  roomName?: string;
  onClose: () => void;
}

export function BomPanel({ roomId, roomName, onClose }: BomPanelProps) {
  const { items, isLoading } = useBom(roomId);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="absolute bottom-14 right-3 z-30 w-[480px] bg-white border border-gray-200 rounded-lg shadow-lg flex flex-col overflow-hidden"
      style={{ maxHeight: collapsed ? 'auto' : '50vh' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50 shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span className="text-sm font-semibold text-gray-800">자재산출 (BOM)</span>
          {isLoading && (
            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCollapsed((p) => !p)}
            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded transition-colors"
            title={collapsed ? '펼치기' : '접기'}
          >
            <svg className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded transition-colors"
            title="닫기"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        <>
          <BomTable items={items} />
          {/* Footer */}
          <div className="flex items-center justify-end px-3 py-2 border-t border-gray-200 bg-gray-50 shrink-0">
            <BomExportButton items={items} roomName={roomName} />
          </div>
        </>
      )}
    </div>
  );
}
