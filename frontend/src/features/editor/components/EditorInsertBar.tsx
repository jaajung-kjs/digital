import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore } from '../stores/editorStore';
import { startCableConnection } from '../cableConnection';
import { useDeleteRackPreset, useRackPresets } from '../../rack/hooks/useRackPresets';
import { EditRackPresetDialog } from '../../rack/components/EditRackPresetDialog';
import { useIsAdmin } from '../../../stores/authStore';
import {
  EQUIPMENT_KINDS,
  EQUIPMENT_KIND_INFO,
  type EquipmentKind,
} from '../../../types/equipmentKind';
import { CABLE_DISPLAY_GROUPS, CABLE_DISPLAY_GROUP_COLORS as CABLE_GROUP_COLORS } from '../../../types/cableCategory';
import type { CableDisplayGroup } from '../../../types/cableCategory';
import type { RackPreset } from '../../../types/rackPreset';

/**
 * Horizontal "insert" toolbar — the left EditorInsertBar relaid out horizontally.
 * Renders the same four parts left-to-right and reuses the exact store
 * actions/handlers/hooks from EditorInsertBar (placement interactions are
 * position-independent: click-to-arm → canvas handles placement).
 *
 *  [선택] | 설비: [랙][OFD][분전반][접지함체][공조설비] | 랙 프리셋 ▾ | 케이블: [전원][접지][네트워크][광][제어]
 */
export function EditorInsertBar() {
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
  const isAdmin = useIsAdmin();
  const deletePreset = useDeleteRackPreset();

  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
  const presetBtnRef = useRef<HTMLButtonElement>(null);
  const [editTarget, setEditTarget] = useState<RackPreset | null>(null);

  // 도구바 루트의 overflow-x-auto 가 드롭다운을 클립하므로, 메뉴는 portal+fixed 로 띄운다.
  const togglePresetMenu = () => {
    if (presetMenuOpen) {
      setPresetMenuOpen(false);
      return;
    }
    const r = presetBtnRef.current?.getBoundingClientRect();
    if (r) setMenuPos({ left: r.left, top: r.bottom + 4 });
    setPresetMenuOpen(true);
  };

  // ───── Click handlers (verbatim from EditorInsertBar) ─────
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
    setPresetMenuOpen(false);
  };

  const handleDeletePreset = async (preset: RackPreset) => {
    if (!window.confirm(`"${preset.name}" 프리셋을 삭제하시겠습니까?`)) return;
    try {
      await deletePreset.mutateAsync(preset.id);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } }; message?: string })
          ?.response?.data?.message ??
        (e as { message?: string })?.message ??
        '삭제에 실패했습니다.';
      window.alert(msg);
    }
  };

  const handleCableGroupClick = (group: CableDisplayGroup) => {
    resetNewEquipmentSelection();
    startCableConnection({ group });
  };

  const activePresets = (rackPresets ?? []).filter((p) => p.isActive);
  const activePreset =
    tool === 'equipment' && newEquipmentPreset
      ? activePresets.find((p) => p.id === newEquipmentPreset.id)
      : undefined;

  return (
    <div className="shrink-0 flex items-center gap-1 px-3 py-1.5 border-b border-line bg-surface overflow-x-auto">
      {/* ───── 선택 (Select) ───── */}
      <button
        type="button"
        onClick={handleSelect}
        className={`px-2 py-1 text-xs rounded font-medium transition-colors duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
          tool === 'select'
            ? 'bg-info-bg text-primary'
            : 'hover:bg-surface-2 text-content-muted'
        }`}
      >
        선택
      </button>

      <Separator />

      {/* ───── 설비 (5 standalone kinds) ───── */}
      <span className="text-xs text-content-faint whitespace-nowrap pl-1 pr-0.5">설비:</span>
      {EQUIPMENT_KINDS.map((kind) => {
        const info = EQUIPMENT_KIND_INFO[kind];
        const active =
          tool === 'equipment' &&
          newEquipmentKind === kind &&
          !newEquipmentPreset;
        return (
          <button
            key={kind}
            type="button"
            onClick={() => handleKindClick(kind)}
            title={
              kind === 'RACK'
                ? '빈 랙 (12 슬롯) — 캔버스에 드래그로 배치'
                : `${info.label} — 캔버스에 드래그로 배치`
            }
            className={`px-2 py-1 text-xs rounded font-medium transition-colors duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              active
                ? 'bg-info-bg text-primary'
                : 'hover:bg-surface-2 text-content-muted'
            }`}
          >
            {info.label}
          </button>
        );
      })}

      <Separator />

      {/* ───── 랙 프리셋 (dropdown — portal+fixed 로 overflow 클립 회피) ───── */}
      <button
        ref={presetBtnRef}
        type="button"
        onClick={togglePresetMenu}
        className={`px-2 py-1 text-xs rounded font-medium transition-colors duration-150 whitespace-nowrap flex items-center gap-1 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
          activePreset
            ? 'bg-info-bg text-primary'
            : 'hover:bg-surface-2 text-content-muted'
        }`}
      >
        {activePreset ? `랙 프리셋: ${activePreset.name}` : '랙 프리셋'}
        <span aria-hidden className="text-xs">▾</span>
      </button>

      {presetMenuOpen &&
        menuPos &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setPresetMenuOpen(false)}
              onContextMenu={(e) => {
                e.preventDefault();
                setPresetMenuOpen(false);
              }}
            />
            <div
              className="fixed z-50 bg-surface border border-line rounded-md shadow-lg py-1 min-w-[200px] max-h-72 overflow-y-auto"
              style={{ left: menuPos.left, top: menuPos.top }}
            >
              {activePresets.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-content-faint">
                  프리셋 없음
                </div>
              ) : (
                activePresets.map((preset) => {
                  const active =
                    tool === 'equipment' &&
                    newEquipmentPreset?.id === preset.id;
                  return (
                    <div
                      key={preset.id}
                      className={`group flex items-center gap-2 px-3 py-1.5 text-sm transition-colors duration-150 ${
                        active ? 'bg-info-bg' : 'hover:bg-surface-2'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handlePresetClick(preset)}
                        title={
                          preset.description ??
                          `${preset.totalU}U 랙 — 클릭 후 캔버스에 클릭하면 즉시 배치`
                        }
                        className={`flex-1 min-w-0 text-left flex items-center gap-2 ${
                          active ? 'text-primary' : 'text-content-muted'
                        }`}
                      >
                        <span
                          aria-hidden
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-black/5"
                          style={{ backgroundColor: 'var(--primary)' }}
                        />
                        <span className="truncate">{preset.name}</span>
                        <span className="ml-auto text-xs text-content-faint">
                          {preset.totalU}U
                        </span>
                      </button>
                      {isAdmin && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            title="수정"
                            className="px-1 text-xs text-content-muted hover:text-content transition-colors duration-150"
                            onClick={() => {
                              setEditTarget(preset);
                              setPresetMenuOpen(false);
                            }}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            title="삭제"
                            className="px-1 text-xs text-danger hover:opacity-80 transition-opacity duration-150"
                            onClick={() => handleDeletePreset(preset)}
                          >
                            삭제
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>,
          document.body,
        )}

      <Separator />

      {/* ───── 케이블 (5 displayGroup pills) ───── */}
      <span className="text-xs text-content-faint whitespace-nowrap pl-1 pr-0.5">케이블:</span>
      {CABLE_DISPLAY_GROUPS.map((group) => {
        const color = CABLE_GROUP_COLORS[group];
        const active =
          tool === 'cable' && preselectedCableDisplayGroup === group;
        return (
          <button
            key={group}
            type="button"
            onClick={() => handleCableGroupClick(group)}
            className={`px-2 py-1 text-xs rounded font-medium transition-colors duration-150 whitespace-nowrap border flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              active
                ? ''
                : 'bg-surface border-line text-content-muted hover:bg-surface-2'
            }`}
            style={
              active
                ? { backgroundColor: color, borderColor: color, color: '#fff' }
                : undefined
            }
          >
            <span
              aria-hidden
              className="w-1.5 h-1.5 rounded-full inline-block"
              style={{ backgroundColor: active ? '#fff' : color }}
            />
            {group}
          </button>
        );
      })}

      {editTarget && (
        <EditRackPresetDialog
          preset={editTarget}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}

function Separator() {
  return <div className="w-px h-5 bg-line mx-1 shrink-0" />;
}
