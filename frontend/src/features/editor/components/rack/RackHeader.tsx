import { RACK_SLOT_COUNT } from '../../../../types/rackModule';

interface Props {
  used: number;
}

export function RackHeader({ used }: Props) {
  const pct = Math.round((used / RACK_SLOT_COUNT) * 100);
  const color = pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#22c55e';
  return (
    <div className="px-2 pt-2 pb-1 shrink-0">
      <div className="flex items-center gap-2 text-[11px] text-gray-500">
        <span className="tabular-nums">
          {used}/{RACK_SLOT_COUNT} 슬롯
        </span>
        <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
        <span className="tabular-nums text-gray-400">{pct}%</span>
      </div>
    </div>
  );
}
