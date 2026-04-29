import { useMemo, useState } from 'react';
import { useMaterialCategories } from '../../materials/hooks/useMaterialCategories';
import { useEditorStore } from '../stores/editorStore';
import type {
  MaterialCategory,
  CableDisplayGroup,
} from '../../../types/material';

const CABLE_DISPLAY_GROUPS: CableDisplayGroup[] = [
  '전원',
  '접지',
  '네트워크',
  '광',
  '제어',
];

const SECTION_DEFAULT_OPEN = true;

/**
 * Left-rail sidebar housing the editor tools.
 *
 *  ┌──────────────────┐
 *  │ [🖱 선택] (1)     │
 *  │ ─────────────    │
 *  │ ▾ 설비           │
 *  │   • 랙           │
 *  │     - EQP-RACK-* │
 *  │   • 단독설비      │
 *  │     - OFD/DIST/… │
 *  │ ─────────────    │
 *  │ ▾ 케이블          │
 *  │   • 전원/접지/…   │
 *  └──────────────────┘
 *
 * Clicking an equipment leaf preselects the material on the editor store and
 * activates the equipment tool — the user then drags on canvas, the existing
 * EquipmentMaterialModal opens with the category already chosen.
 *
 * Clicking a cable leaf activates the cable tool and stashes
 * `preselectedCableCategoryId` so CableSpecModal can preselect it once the
 * source/target/path is committed.
 */
export function EditorSidebar() {
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const setNewEquipmentMaterial = useEditorStore(
    (s) => s.setNewEquipmentMaterial,
  );
  const resetNewEquipmentMaterial = useEditorStore(
    (s) => s.resetNewEquipmentMaterial,
  );
  const newEquipmentMaterialCategoryId = useEditorStore(
    (s) => s.newEquipmentMaterialCategoryId,
  );
  const preselectedCableCategoryId = useEditorStore(
    (s) => s.preselectedCableCategoryId,
  );
  const setPreselectedCableCategory = useEditorStore(
    (s) => s.setPreselectedCableCategory,
  );

  const { data: equipmentCats } = useMaterialCategories('EQUIPMENT');
  const { data: cableCats } = useMaterialCategories('CABLE');

  const [equipmentOpen, setEquipmentOpen] = useState(SECTION_DEFAULT_OPEN);
  const [cableOpen, setCableOpen] = useState(SECTION_DEFAULT_OPEN);

  // ───── Equipment groups ─────
  // by-type returns parents only (parentId === null) with children prepopulated.
  const rackPresets = useMemo<MaterialCategory[]>(() => {
    const rack = equipmentCats?.find((c) => c.code === 'EQP-RACK');
    return rack?.children ?? [];
  }, [equipmentCats]);

  const standalones = useMemo<MaterialCategory[]>(() => {
    if (!equipmentCats) return [];
    return equipmentCats.filter(
      (c) =>
        c.code !== 'EQP-RACK' &&
        c.placementType === 'standalone' &&
        c.detailPanelKind !== 'rack',
    );
  }, [equipmentCats]);

  // ───── Cable groups ─────
  const cableCategoriesByGroup = useMemo<
    Record<CableDisplayGroup, MaterialCategory[]>
  >(() => {
    const map: Record<CableDisplayGroup, MaterialCategory[]> = {
      전원: [],
      접지: [],
      네트워크: [],
      광: [],
      제어: [],
    };
    if (!cableCats) return map;
    // by-type returns root categories (parentId === null) — cables are flat
    for (const c of cableCats) {
      if (c.displayGroup && map[c.displayGroup]) {
        map[c.displayGroup].push(c);
      }
    }
    return map;
  }, [cableCats]);

  // ───── Click handlers ─────
  const handleSelect = () => {
    setTool('select');
    resetNewEquipmentMaterial();
    setPreselectedCableCategory(null);
  };

  const handleEquipmentClick = (cat: MaterialCategory) => {
    setTool('equipment');
    setPreselectedCableCategory(null);
    setNewEquipmentMaterial(
      cat.id,
      cat.code,
      cat.name,
      cat.displayColor,
      {},
      cat.name,
    );
  };

  const handleCableClick = (cat: MaterialCategory) => {
    setTool('cable');
    resetNewEquipmentMaterial();
    setPreselectedCableCategory(cat.id);
  };

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

        {/* ───── Equipment ───── */}
        <CollapsibleSection
          title="설비"
          open={equipmentOpen}
          onToggle={() => setEquipmentOpen((v) => !v)}
        >
          <SidebarGroup label="랙">
            {rackPresets.length === 0 ? (
              <EmptyHint />
            ) : (
              rackPresets.map((cat) => (
                <SidebarLeaf
                  key={cat.id}
                  cat={cat}
                  active={
                    tool === 'equipment' &&
                    newEquipmentMaterialCategoryId === cat.id
                  }
                  onClick={() => handleEquipmentClick(cat)}
                />
              ))
            )}
          </SidebarGroup>
          <SidebarGroup label="단독설비">
            {standalones.length === 0 ? (
              <EmptyHint />
            ) : (
              standalones.map((cat) => (
                <SidebarLeaf
                  key={cat.id}
                  cat={cat}
                  active={
                    tool === 'equipment' &&
                    newEquipmentMaterialCategoryId === cat.id
                  }
                  onClick={() => handleEquipmentClick(cat)}
                />
              ))
            )}
          </SidebarGroup>
        </CollapsibleSection>

        {/* ───── Cable ───── */}
        <CollapsibleSection
          title="케이블"
          open={cableOpen}
          onToggle={() => setCableOpen((v) => !v)}
        >
          {CABLE_DISPLAY_GROUPS.map((group) => {
            const items = cableCategoriesByGroup[group];
            return (
              <SidebarGroup key={group} label={group}>
                {items.length === 0 ? (
                  <EmptyHint />
                ) : (
                  items.map((cat) => (
                    <SidebarLeaf
                      key={cat.id}
                      cat={cat}
                      active={
                        tool === 'cable' &&
                        preselectedCableCategoryId === cat.id
                      }
                      onClick={() => handleCableClick(cat)}
                    />
                  ))
                )}
              </SidebarGroup>
            );
          })}
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

function SidebarGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2">
      <div className="px-4 pt-1 pb-0.5 text-[11px] uppercase tracking-wide text-gray-400 font-medium">
        {label}
      </div>
      <div className="px-2 space-y-0.5">{children}</div>
    </div>
  );
}

function SidebarLeaf({
  cat,
  active,
  onClick,
}: {
  cat: MaterialCategory;
  active: boolean;
  onClick: () => void;
}) {
  const color = cat.displayColor ?? '#9ca3af';
  return (
    <button
      onClick={onClick}
      title={cat.description ?? cat.name}
      className={`w-full text-left px-2 py-1.5 flex items-center gap-2 rounded text-sm transition-colors ${
        active
          ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
          : 'hover:bg-gray-50 text-gray-700'
      }`}
    >
      <span
        aria-hidden
        className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-black/5"
        style={{ backgroundColor: color }}
      />
      <span className="truncate">{cat.name}</span>
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
