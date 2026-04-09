import type { Equipment } from '../../../../types/rack';

interface EquipmentLogsTabProps {
  equipment: Equipment;
}

export function EquipmentLogsTab({ equipment }: EquipmentLogsTabProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-gray-500 mb-3">이력</h3>

      {/* 기본 타임스탬프 정보 */}
      <div className="space-y-3">
        <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
          <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-gray-900">설비 등록</p>
            <p className="text-xs text-gray-500">
              {new Date(equipment.createdAt).toLocaleString('ko-KR')}
            </p>
          </div>
        </div>

        {equipment.updatedAt !== equipment.createdAt && (
          <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-gray-900">마지막 수정</p>
              <p className="text-xs text-gray-500">
                {new Date(equipment.updatedAt).toLocaleString('ko-KR')}
              </p>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-4">
        상세 이력 기능은 추후 추가될 예정입니다.
      </p>
    </div>
  );
}
