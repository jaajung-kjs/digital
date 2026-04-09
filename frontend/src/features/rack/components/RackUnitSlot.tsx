interface RackUnitSlotProps {
  unitNumber: number;
  height: number;
  isOccupied: boolean;
  children?: React.ReactNode;
}

export function RackUnitSlot({ unitNumber, height, isOccupied, children }: RackUnitSlotProps) {
  return (
    <div
      className="relative flex items-stretch border-b border-gray-700"
      style={{ height: `${height}px` }}
    >
      {/* U number label */}
      <div className="w-8 shrink-0 flex items-center justify-center text-[10px] text-gray-500 font-mono bg-gray-900 border-r border-gray-700">
        {unitNumber}
      </div>

      {/* Slot area */}
      <div className="flex-1 relative">
        {children ? (
          children
        ) : (
          <div
            className={`w-full h-full ${
              isOccupied
                ? 'bg-gray-800'
                : 'bg-gray-850 hover:bg-gray-750'
            }`}
            style={{ backgroundColor: isOccupied ? '#1e293b' : '#1a2332' }}
          />
        )}
      </div>
    </div>
  );
}
