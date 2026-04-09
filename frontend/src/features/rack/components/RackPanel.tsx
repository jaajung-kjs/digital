import { useRackPanelStore } from '../stores/rackPanelStore';
import { useRackEquipment } from '../hooks/useRackEquipment';
import { RackDiagram } from './RackDiagram';

export function RackPanel() {
  const { activeRackId, viewSide, closePanel, toggleSide } = useRackPanelStore();
  const { rack, equipmentList, isLoading, totalU, usedU, freeU } = useRackEquipment(activeRackId);

  if (!activeRackId) return null;

  return (
    <div className="w-80 shrink-0 bg-white border-l border-gray-300 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-gray-900 truncate">
            {isLoading ? '...' : rack?.name ?? ''}
          </h2>
          {rack?.code && (
            <p className="text-[10px] text-gray-500 truncate">{rack.code}</p>
          )}
        </div>

        {/* Front/Rear toggle */}
        <div className="flex rounded border overflow-hidden text-xs shrink-0">
          <button
            onClick={() => { if (viewSide !== 'front') toggleSide(); }}
            className={`px-2 py-1 ${
              viewSide === 'front'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            Front
          </button>
          <button
            onClick={() => { if (viewSide !== 'rear') toggleSide(); }}
            className={`px-2 py-1 ${
              viewSide === 'rear'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            Rear
          </button>
        </div>

        {/* Close button */}
        <button
          onClick={closePanel}
          className="p-1 hover:bg-gray-200 rounded"
          title="Close"
        >
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body — Rack Diagram */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : (
          <RackDiagram totalU={totalU} equipmentList={equipmentList} />
        )}
      </div>

      {/* Footer — Summary stats */}
      <div className="px-3 py-2 border-t bg-gray-50 text-xs text-gray-600 flex items-center justify-between">
        <span>
          Total: <strong>{totalU}U</strong>
        </span>
        <span>
          Used: <strong className="text-blue-600">{usedU}U</strong>
        </span>
        <span>
          Free: <strong className="text-green-600">{freeU}U</strong>
        </span>
        <span className="text-gray-400">
          {totalU > 0 ? Math.round((usedU / totalU) * 100) : 0}%
        </span>
      </div>
    </div>
  );
}
