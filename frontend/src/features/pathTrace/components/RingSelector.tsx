import type { TraceRing } from '../types';

interface RingSelectorProps {
  rings: TraceRing[];
  selectedRingId: string | null;
  onSelectRing: (ringId: string | null) => void;
}

export function RingSelector({ rings, selectedRingId, onSelectRing }: RingSelectorProps) {
  if (rings.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 border-t border-gray-200 px-4 py-3">
      <button
        onClick={() => onSelectRing(null)}
        className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
          selectedRingId === null
            ? 'border-blue-400 bg-blue-50 text-blue-700'
            : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
        }`}
      >
        전체 보기
      </button>
      {rings.map((ring) => (
        <button
          key={ring.id}
          onClick={() => onSelectRing(ring.id)}
          className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
            selectedRingId === ring.id
              ? 'border-blue-400 bg-blue-50 text-blue-700'
              : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          {ring.label}
        </button>
      ))}
    </div>
  );
}
