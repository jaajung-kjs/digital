import type { Equipment } from '../../../types/rack';
import { getCategoryColor } from '../../../types/rack';

interface RackEquipmentCardProps {
  equipment: Equipment;
  heightU: number;
  uSlotHeight: number;
}

export function RackEquipmentCard({ equipment, heightU, uSlotHeight }: RackEquipmentCardProps) {
  const totalHeight = heightU * uSlotHeight;
  const categoryColor = getCategoryColor(equipment.category);

  return (
    <div
      className="absolute left-0 right-0 mx-1 rounded-sm flex items-center justify-center overflow-hidden text-white text-xs font-medium select-none"
      style={{
        height: `${totalHeight}px`,
        backgroundColor: categoryColor,
        top: 0,
      }}
      title={`${equipment.name} (${equipment.startU}U~${equipment.startU + equipment.heightU - 1}U, ${equipment.heightU}U)`}
    >
      <div className="flex flex-col items-center gap-0 px-1 text-center leading-tight">
        <span className="truncate max-w-full">{equipment.name}</span>
        {heightU >= 2 && (
          <span className="text-[10px] opacity-80">{equipment.heightU}U</span>
        )}
      </div>
    </div>
  );
}
