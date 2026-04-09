import type { Equipment } from '../../../../types/rack';

interface EquipmentConnectionsTabProps {
  equipment: Equipment;
}

export function EquipmentConnectionsTab({ equipment }: EquipmentConnectionsTabProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-gray-500 mb-3">연결 정보</h3>

      {/* 포트 요약 */}
      <div className="p-3 bg-gray-50 rounded-lg">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-700">총 포트</span>
          <span className="text-sm font-medium text-gray-900">{equipment.portCount}개</span>
        </div>
      </div>

      {equipment.portCount === 0 ? (
        <div className="flex flex-col items-center text-gray-400 py-6">
          <svg className="w-10 h-10 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
          <p className="text-sm text-gray-500">포트가 없습니다.</p>
        </div>
      ) : (
        <p className="text-xs text-gray-400">
          상세 연결 정보는 추후 추가될 예정입니다.
        </p>
      )}
    </div>
  );
}
