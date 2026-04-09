import type { Equipment } from '../../../types/rack';
import { RackUnitSlot } from './RackUnitSlot';
import { RackEquipmentCard } from './RackEquipmentCard';

interface RackDiagramProps {
  totalU: number;
  equipmentList: Equipment[];
}

const U_SLOT_HEIGHT = 24; // pixels per U

export function RackDiagram({ totalU, equipmentList }: RackDiagramProps) {
  // Build an occupancy map: for each U, which equipment occupies it
  const occupancyMap = new Map<number, Equipment>();
  for (const eq of equipmentList) {
    for (let u = eq.startU; u < eq.startU + eq.heightU; u++) {
      occupancyMap.set(u, eq);
    }
  }

  // Find equipment that START at a given U (for rendering the card)
  const equipmentStartMap = new Map<number, Equipment>();
  for (const eq of equipmentList) {
    equipmentStartMap.set(eq.startU, eq);
  }

  // Render from top (highest U) to bottom (1U)
  const slots: React.ReactNode[] = [];
  let u = totalU;

  while (u >= 1) {
    const equipment = occupancyMap.get(u);

    if (equipment && u === equipment.startU + equipment.heightU - 1) {
      // This is the top U of an equipment — render the full equipment card
      const topU = equipment.startU + equipment.heightU - 1;
      const containerHeight = equipment.heightU * U_SLOT_HEIGHT;

      slots.push(
        <div
          key={`eq-${equipment.id}`}
          className="relative flex items-stretch"
          style={{ height: `${containerHeight}px` }}
        >
          {/* U number labels for the equipment span */}
          <div className="w-8 shrink-0 flex flex-col bg-gray-900 border-r border-gray-700">
            {Array.from({ length: equipment.heightU }, (_, i) => {
              const slotU = topU - i;
              return (
                <div
                  key={slotU}
                  className="flex-1 flex items-center justify-center text-[10px] text-gray-500 font-mono border-b border-gray-700"
                >
                  {slotU}
                </div>
              );
            })}
          </div>

          {/* Equipment card */}
          <div className="flex-1 relative border-b border-gray-700">
            <RackEquipmentCard
              equipment={equipment}
              heightU={equipment.heightU}
              uSlotHeight={U_SLOT_HEIGHT}
            />
          </div>
        </div>
      );

      // Skip the U slots this equipment occupies
      u -= equipment.heightU;
    } else {
      // Empty slot or middle of equipment (shouldn't happen with proper logic)
      const isOccupied = occupancyMap.has(u);
      slots.push(
        <RackUnitSlot
          key={`slot-${u}`}
          unitNumber={u}
          height={U_SLOT_HEIGHT}
          isOccupied={isOccupied}
        />
      );
      u -= 1;
    }
  }

  return (
    <div className="flex flex-col bg-gray-900 rounded border border-gray-700 overflow-hidden">
      {slots}
    </div>
  );
}
