import type { ViewMode } from '../../../types/floorPlan';
import { CABLE_COLORS } from '../../editor/renderers/connectionRenderer';

interface LegendItem {
  type: string;
  label: string;
  color: string;
}

const LEGEND_BY_MODE: Record<string, LegendItem[]> = {
  'connection-network': [
    { type: 'LAN', label: 'LAN', color: CABLE_COLORS.LAN },
    { type: 'FIBER', label: 'FIBER', color: CABLE_COLORS.FIBER },
  ],
  'connection-power': [
    { type: 'AC', label: 'AC 전원', color: CABLE_COLORS.AC },
    { type: 'DC', label: 'DC 전원', color: CABLE_COLORS.DC },
  ],
  'connection-ground': [
    { type: 'GROUND', label: '접지', color: CABLE_COLORS.GROUND },
  ],
};

interface ConnectionLegendProps {
  viewMode: ViewMode;
}

export function ConnectionLegend({ viewMode }: ConnectionLegendProps) {
  const items = LEGEND_BY_MODE[viewMode];
  if (!items) return null;

  return (
    <div className="absolute top-3 right-56 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
      <div className="text-xs font-medium text-gray-500 mb-1.5">케이블 범례</div>
      <div className="flex flex-col gap-1">
        {items.map((item) => (
          <div key={item.type} className="flex items-center gap-2">
            <div
              className="w-5 h-0.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-gray-700">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
