import { useState } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { useRackPresets } from '../../rack/hooks/useRackPresets';
import {
  EQUIPMENT_KINDS,
  EQUIPMENT_KIND_INFO,
  type EquipmentKind,
} from '../../../types/equipmentKind';
import type { CableDisplayGroup } from '../../../types/cableCategory';
import type { RackPreset } from '../../../types/rackPreset';

const CABLE_DISPLAY_GROUPS: CableDisplayGroup[] = [
  '전원',
  '접지',
  '네트워크',
  '광',
  '제어',
];

// Group representative colors — match ConnectionLegend GROUP_COLORS.
const CABLE_GROUP_COLORS: Record<CableDisplayGroup, string> = {
  '전원': '#ef4444',
  '접지': '#eab308',
  '네트워크': '#3b82f6',
  '광': '#22c55e',
  '제어': '#6b7280',
};

const SECTION_DEFAULT_OPEN = true;

/**
 * Left-rail sidebar — P9 reorganization.
 *
 *  ┌──────────────────┐
 *  │ [🖱 선택] (1)     │
 *  │ ─────────────    │
 *  │ ▾ 설비           │
 *  │   • 랙           │  drag to place
 *  │   • OFD          │
 *  │   • 분전반        │
 *  │   • 접지함체      │
 *  │   • 공조설비      │
 *  │ ─────────────    │
 *  │ ▾ 랙 프리셋       │  click then click on canvas
 *  │   • PITR-5000…   │
 *  │ ─────────────    │
 *  │ ▾ 케이블          │  group pills only
 *  │   [전원][접지]…   │
 *  └──────────────────┘
 *
 * Standalone equipment leaf → setNewEquipmentKind(kind), tool='equipment'.
 * Rack preset leaf          → setNewEquipmentPreset(preset), tool='equipment'.
 * Cable group pill          → setPreselectedCableDisplayGroup(group), tool='cable'.
 */
export function EditorSidebar() {
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const newEquipmentKind = useEditorStore((s) => s.newEquipmentKind);
  const newEquipmentPreset = useEditorStore((s) => s.newEquipmentPreset);
  const setNewEquipmentKind = useEditorStore((s) => s.setNewEquipmentKind);
  const setNewEquipmentPreset = useEditorStore((s) => s.setNewEquipmentPreset);
  const resetNewEquipmentSelection = useEditorStore(
    (s) => s.resetNewEquipmentSelection,
  );
  const preselectedCableDisplayGroup = useEditorStore(
    (s) => s.preselectedCableDisplayGroup,
  );
  const setPreselectedCableDisplayGroup = useEditorStore(
    (s) => s.setPreselectedCableDisplayGroup,
  );

  const { data: rackPresets } = useRackPresets();

  const [equipmentOpen, setEquipmentOpen] = useState(SECTION_DEFAULT_OPEN);
  const [presetOpen, setPresetOpen] = useState(SECTION_DEFAULT_OPEN);
  const [cableOpen, setCableOpen] = useState(SECTION_DEFAULT_OPEN);

  // ───── Click handlers ─────
  const handleSelect = () => {
    setTool('select');
    resetNewEquipmentSelection();
    setPreselectedCableDisplayGroup(null);
  };

  const handleKindClick = (kind: EquipmentKind) => {
    setTool('equipment');
    setPreselectedCableDisplayGroup(null);
    setNewEquipmentKind(kind);
  };

  const handlePresetClick = (preset: RackPreset) => {
    setTool('equipment');
    setPreselectedCableDisplayGroup(null);
    setNewEquipmentPreset(preset);
  };

  const handleCableGroupClick = (group: CableDisplayGroup) => {
    setTool('cable');
    resetNewEquipmentSelection();
    setPreselectedCableDisplayGroup(group);
  };

  const activePresets = (rackPresets ?? []).filter((p) => p.isActive);

  return (
    <aside className="w-64 shrink-0 border-r bg-white flex flex-col overflow-hidden">
      <nav className="flex-1 overflow-y-auto py-2">
        {/* Select tool */}
        <SidebarToolButton
          active={tool === 'select'}
          label="선택"
          shortcut="1"
          icon={<SelectIcon />}
          onClick={handleSelect}
        />

        {/* ───── 설비 (5 standalone kinds — drag to place) ───── */}
        <CollapsibleSection
          title="설비"
          open={equipmentOpen}
          onToggle={() => setEquipmentOpen((v) => !v)}
        >
          <div className="px-2 space-y-0.5">
            {EQUIPMENT_KINDS.map((kind) => {
              const info = EQUIPMENT_KIND_INFO[kind];
              const active =
                tool === 'equipment' && newEquipmentKind === kind;
              return (
                <KindLeaf
                  key={kind}
                  label={info.label}
                  active={active}
                  onClick={() => handleKindClick(kind)}
                />
              );
            })}
          </div>
        </CollapsibleSection>

        {/* ───── 랙 프리셋 (single-click to arm placement) ───── */}
        <CollapsibleSection
          title="랙 프리셋"
          open={presetOpen}
          onToggle={() => setPresetOpen((v) => !v)}
        >
          <div className="px-2 space-y-0.5">
            {activePresets.length === 0 ? (
              <EmptyHint />
            ) : (
              activePresets.map((preset) => {
                const active =
                  tool === 'equipment' &&
                  newEquipmentPreset?.id === preset.id;
                return (
                  <PresetLeaf
                    key={preset.id}
                    preset={preset}
                    active={active}
                    onClick={() => handlePresetClick(preset)}
                  />
                );
              })
            )}
          </div>
        </CollapsibleSection>

        {/* ───── 케이블 (5 displayGroup pills) ───── */}
        <CollapsibleSection
          title="케이블"
          open={cableOpen}
          onToggle={() => setCableOpen((v) => !v)}
        >
          <div className="px-3 pt-1 pb-2 flex flex-wrap gap-1.5">
            {CABLE_DISPLAY_GROUPS.map((group) => {
              const color = CABLE_GROUP_COLORS[group];
              const active =
                tool === 'cable' && preselectedCableDisplayGroup === group;
              return (
                <button
                  key={group}
                  type="button"
                  onClick={() => handleCableGroupClick(group)}
                  className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium transition-colors border flex items-center gap-1`}
                  style={
                    active
                      ? { backgroundColor: color, borderColor: color, color: '#fff' }
                      : {
                          backgroundColor: '#fff',
                          borderColor: '#d1d5db',
                          color: '#4b5563',
                        }
                  }
                >
                  <span
                    aria-hidden
                    className="w-1.5 h-1.5 rounded-full inline-block"
                    style={{
                      backgroundColor: active ? '#fff' : color,
                    }}
                  />
                  {group}
                </button>
              );
            })}
          </div>
        </CollapsibleSection>
      </nav>
    </aside>
  );
}

// ───── Sub-components ─────

function SidebarToolButton({
  active,
  label,
  shortcut,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`mx-2 mb-1 px-3 py-2 w-[calc(100%-1rem)] flex items-center gap-2 rounded-md text-sm transition-colors ${
        active
          ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-200'
          : 'hover:bg-gray-100 text-gray-700'
      }`}
    >
      <span className="w-4 h-4 flex-shrink-0">{icon}</span>
      <span className="font-medium">{label}</span>
      <span
        className={`ml-auto text-[10px] ${active ? 'text-blue-400' : 'text-gray-400'}`}
      >
        {shortcut}
      </span>
    </button>
  );
}

function CollapsibleSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-2 border-t border-gray-100 pt-2">
      <button
        onClick={onToggle}
        className="w-full px-4 py-1.5 flex items-center justify-between text-sm font-semibold text-gray-800 hover:bg-gray-50"
      >
        <span>{title}</span>
        <svg
          className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  );
}

function KindLeaf({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={`${label} — 캔버스에 드래그로 배치`}
      className={`w-full text-left px-2 py-1.5 flex items-center gap-2 rounded text-sm transition-colors ${
        active
          ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
          : 'hover:bg-gray-50 text-gray-700'
      }`}
    >
      <span
        aria-hidden
        className="w-2.5 h-2.5 rounded-sm flex-shrink-0 ring-1 ring-black/5"
        style={{ backgroundColor: '#e5e7eb' }}
      />
      <span className="truncate">{label}</span>
    </button>
  );
}

function PresetLeaf({
  preset,
  active,
  onClick,
}: {
  preset: RackPreset;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={preset.description ?? `${preset.totalU}U 랙 — 클릭 후 캔버스에 클릭하면 즉시 배치`}
      className={`w-full text-left px-2 py-1.5 flex items-center gap-2 rounded text-sm transition-colors ${
        active
          ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
          : 'hover:bg-gray-50 text-gray-700'
      }`}
    >
      <span
        aria-hidden
        className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-black/5"
        style={{ backgroundColor: '#6366f1' }}
      />
      <span className="truncate">{preset.name}</span>
      <span className="ml-auto text-[10px] text-gray-400">{preset.totalU}U</span>
    </button>
  );
}

function EmptyHint() {
  return <div className="px-2 py-1 text-xs text-gray-300">(없음)</div>;
}

// ───── Icons ─────
function SelectIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
      />
    </svg>
  );
}
