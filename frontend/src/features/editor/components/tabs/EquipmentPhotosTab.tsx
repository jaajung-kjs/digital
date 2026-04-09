import type { Equipment } from '../../../../types/rack';

interface EquipmentPhotosTabProps {
  equipment: Equipment;
}

export function EquipmentPhotosTab({ equipment }: EquipmentPhotosTabProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-gray-500 mb-3">사진</h3>
      <div className="flex flex-col items-center text-gray-400 py-8">
        <svg className="w-12 h-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <p className="text-sm text-gray-500">
          {equipment.name}의 사진이 없습니다.
        </p>
        <p className="text-xs text-gray-400 mt-1">
          사진 기능은 추후 추가될 예정입니다.
        </p>
      </div>
    </div>
  );
}
