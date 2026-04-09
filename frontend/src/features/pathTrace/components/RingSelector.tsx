import { useMemo } from 'react';
import type { TraceRing } from '../types';

interface RingSelectorProps {
  rings: TraceRing[];
  selectedRingId: string | null;
  onSelectRing: (ringId: string | null) => void;
}

function RingButton({
  label,
  isSelected,
  onClick,
  variant = 'default',
}: {
  label: string;
  isSelected: boolean;
  onClick: () => void;
  variant?: 'default' | 'composite' | 'child';
}) {
  const base = 'rounded-md border px-3 py-1 text-xs font-medium transition-colors';
  const selected = 'border-blue-400 bg-blue-50 text-blue-700';
  const unselected = 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50';
  const compositeStyle = 'border-indigo-300 bg-indigo-50 text-indigo-700';
  const compositeUnselected = 'border-indigo-200 bg-white text-indigo-600 hover:bg-indigo-50';

  let className = base;
  if (variant === 'composite') {
    className += ' ' + (isSelected ? compositeStyle : compositeUnselected);
  } else {
    className += ' ' + (isSelected ? selected : unselected);
  }

  return (
    <button onClick={onClick} className={className}>
      {variant === 'composite' && <span className="mr-1 text-[10px]">◎</span>}
      {variant === 'child' && <span className="mr-1 text-[10px]">○</span>}
      {label}
    </button>
  );
}

export function RingSelector({ rings, selectedRingId, onSelectRing }: RingSelectorProps) {
  // Organize rings into hierarchy
  const { composites, independents } = useMemo(() => {
    const composites = rings.filter((r) => r.level === 1);
    const childIdSet = new Set(composites.flatMap((c) => c.childRingIds));
    const independents = rings.filter((r) => r.level === 0 && !childIdSet.has(r.id));
    return { composites, independents };
  }, [rings]);

  const childMap = useMemo(() => {
    const map = new Map<string, TraceRing[]>();
    for (const comp of composites) {
      map.set(
        comp.id,
        comp.childRingIds
          .map((cid) => rings.find((r) => r.id === cid))
          .filter((r): r is TraceRing => r != null),
      );
    }
    return map;
  }, [rings, composites]);

  if (rings.length === 0) return null;

  return (
    <div className="border-t border-gray-200 px-4 py-3 space-y-2">
      {/* Top row: 전체 + composite rings + independent rings */}
      <div className="flex flex-wrap gap-2">
        <RingButton
          label="전체 보기"
          isSelected={selectedRingId === null}
          onClick={() => onSelectRing(null)}
        />
        {composites.map((ring) => (
          <RingButton
            key={ring.id}
            label={ring.label}
            isSelected={selectedRingId === ring.id}
            onClick={() => onSelectRing(ring.id)}
            variant="composite"
          />
        ))}
        {independents.map((ring) => (
          <RingButton
            key={ring.id}
            label={ring.label}
            isSelected={selectedRingId === ring.id}
            onClick={() => onSelectRing(ring.id)}
          />
        ))}
      </div>

      {/* Child rings for each composite */}
      {composites.map((comp) => {
        const children = childMap.get(comp.id) ?? [];
        if (children.length === 0) return null;
        return (
          <div key={`children-${comp.id}`} className="flex flex-wrap items-center gap-2 pl-4">
            <span className="text-[10px] text-gray-400">└</span>
            {children.map((child) => (
              <RingButton
                key={child.id}
                label={child.label}
                isSelected={selectedRingId === child.id}
                onClick={() => onSelectRing(child.id)}
                variant="child"
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
