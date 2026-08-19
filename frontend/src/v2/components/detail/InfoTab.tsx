/**
 * InfoTab — 상세 패널 1번째 탭 '정보'
 *
 * 기본정보(이름·상태·위치)·커스텀 필드·포트·수용 섹션을 표시/편집한다.
 * AssetDetailPanel 에서 추출(원 위치: L253-444) — RecordsTab/ConnectionsTab 과 같은
 * 형제 탭 패턴으로 정리, 거동은 동일하다. selectedChildId/addModalCtx 는 부모(AssetDetailPanel)가
 * 소유(부모가 자산 전환 시 리셋 + 하단 AddAssetModal 렌더를 관장)하므로 setter 만 prop 으로 받는다.
 */

import { useMemo, useState } from 'react';
import { ASSET_STATUSES, assetFieldDefs, assetStatusTone, validateGridPlacement, ASSEMBLY_GRID } from '@twin/core';
import {
  Button,
  DetailCard,
  DetailCardHeader,
  DetailRow,
  DateInput,
  Input,
  Modal,
  Select,
  useConfirm,
  cn,
  EMPTY,
} from '../../../components/ui';
import type { GridPlacement } from '../../gridDrag';
import { AssemblyGrid } from '../AssemblyGrid';
import { cableCountByPortId } from '../../cableSelectors';
import { mergeEffective } from '../../store/overlay';
import { useV2WorkingCopy } from '../../store/workingCopyStore';
import type { InputProps } from '../../../components/ui';
import type { V2Asset, V2AssetType, V2Assembly } from '../../types';

/**
 * 선언된 필드 하나를 적는 칸 — 날짜만 다른 칸을 쓴다.
 *
 * 날짜를 네이티브 `type="date"` 로 두면 표기를 브라우저 로케일이 정해, 한국어 앱에
 * `mm/dd/yyyy` 가 선다(`DateInput` 참고). 두 자리에서 같은 판단을 되풀이하지 않도록
 * 고르는 일을 여기 한 번만 적는다.
 */
function FieldInput({ isDate, type, ...rest }: InputProps & { isDate: boolean }) {
  return isDate ? <DateInput {...rest} /> : <Input type={type} {...rest} />;
}

export interface AddModalContext {
  parentAssetId: string;
  /**
   * 눌러(또는 끌어) 잡은 **자리와 크기** — 없이는 열리지 않는다.
   *
   * 크기를 함께 나르지 않던 동안, 여러 칸을 묶어 끌어도 만들어지는 것은 늘 1×1 이었다
   * (모달이 `colSpan: 1` 을 못 박고 있었다). 끌어서 잡은 크기가 조용히 버려진 셈이다.
   */
  cell: { col: number; row: number; colSpan?: number; rowSpan?: number };
}

/**
 * 그 자산의 포트 점유 요약 — `2/2` 처럼.
 *
 * 수용 목록은 이름만 보여줘서, "이 장비 포트가 다 물렸나" 를 보려면 포트 탭으로 옮겨가야 했다.
 * 같은 자식에 대한 정보가 두 탭에 갈려 있던 것을 한 줄로 잇는다. 포트가 없으면 아무것도
 * 적지 않는다(적을 것이 없다).
 */
function PortSummary({ asset, occupiedPortIds }: { asset: V2Asset; occupiedPortIds: ReadonlyMap<string, number> }) {
  if (asset.ports.length === 0) return null;
  const used = asset.ports.filter((p) => occupiedPortIds.has(p.id)).length;
  return (
    <span
      className={cn('shrink-0 text-xs tabular-nums', used > 0 ? 'text-success' : 'text-content-faint')}
      title="연결된 포트 / 전체 포트"
    >
      {used}/{asset.ports.length}
    </span>
  );
}

/**
 * 고른 부품 — **설비에서 갈라지는 것만** 적는다.
 *
 * 부품마다 다를 수 있는 것은 상태·설치일·담당자다(L3 스위치만 나중에 갈아 끼우면 설치일이
 * 다르다). 사진·점검·고장이력은 **설비의 것**이고, 포트는 설비의 포트 탭이 이미 부품별로
 * 묶어 보여준다 — 그래서 여기 다시 두지 않는다.
 */
/**
 * 격자에서 누른 부품 — **대화상자**로 연다.
 *
 * 아래에 카드로 펴 봤는데, 그러면 구성 탭이 「판 + 카드」 두 층이 되어 판을 보러 온 사람이
 * 매번 카드에 자리를 내주게 된다. 랙을 보러 왔으면 랙만 보여야 한다.
 *
 * 대화상자인 이유는 **빈 칸이 이미 그렇게 동작하기 때문**이다 — 빈 칸을 누르면 「자산 추가」
 * 상자가 뜬다. 찬 칸을 누르면 그 부품 상자가 뜬다: 한 판에서 누르는 곳에 따라 만들기와
 * 고치기가 같은 모양으로 열린다. 카드로 펴면 이 둘이 서로 다른 어법이 된다.
 *
 * 판은 **한 번도 줄지 않는다**(상자가 위에 뜨므로) — 20행이 눌려 글씨가 뭉갤 일이 없다.
 */
function PartDialog({
  part, typeName, portBoard, onClose, onDelete,
}: {
  part: V2Asset;
  typeName: string;
  /** 이 부품의 포트 판 — 포트 탭이 쓰는 것과 **같은 판**이다(위에서 만들어 내려온다). */
  portBoard: React.ReactNode;
  onClose: () => void;
  onDelete: () => void;
}) {
  const commit = (patch: Partial<V2Asset>) => useV2WorkingCopy.getState().stageAssetUpdate(part.id, patch);
  const field = (key: string, value: string) => {
    const current = useV2WorkingCopy.getState().effectiveAssets().find((a) => a.id === part.id)?.fieldValues ?? {};
    if (String(current[key] ?? '') === value) return;
    commit({ fieldValues: { ...current, [key]: value } });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={part.name}
      /* 포트 판이 들어오므로 좁으면 타일이 한 줄에 서너 개밖에 못 선다. */
      size="lg"
      footer={
        <>
          {/* 삭제는 왼쪽 끝 — 닫기 옆에 두면 손이 미끄러진다. */}
          <Button variant="danger" size="sm" className="mr-auto" onClick={onDelete}>
            삭제
          </Button>
          <Button variant="secondary" size="sm" onClick={onClose}>
            닫기
          </Button>
        </>
      }
    >
      <div className="space-y-3">
      <DetailRow label="종류">{typeName}</DetailRow>
      <DetailRow label="이름">
        <Input
          key={part.id + part.name}
          aria-label="부품 이름"
          defaultValue={part.name}
          size="sm"
          onBlur={(e) => {
            const v = e.currentTarget.value.trim();
            if (v && v !== part.name) commit({ name: v });
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        />
      </DetailRow>
      <DetailRow label="상태">
        <Select value={part.status} size="sm" onChange={(e) => commit({ status: e.currentTarget.value })}>
          {ASSET_STATUSES.map((st) => (
            <option key={st.value} value={st.value}>{st.label}</option>
          ))}
        </Select>
      </DetailRow>
      {assetFieldDefs().map((fd) => {
        const raw = part.fieldValues[fd.key];
        const str = raw != null ? String(raw) : '';
        return (
          <DetailRow key={fd.key} label={fd.label}>
            <FieldInput
              key={part.id + fd.key + str}
              isDate={fd.type === 'date'}
              type={fd.type === 'number' ? 'number' : 'text'}
              defaultValue={str}
              size="sm"
              onBlur={(e) => field(fd.key, e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            />
          </DetailRow>
        );
      })}
      </div>

      {/* 포트는 **여기서 본다.** 예전에는 「25개 보기」가 포트 탭으로 보냈는데, 부품 하나를
          보러 상자를 연 사람에게 상자를 닫고 다른 탭으로 건너뛰게 하는 일이었다.
          판은 포트 탭이 쓰는 것과 같은 것을 그대로 쓴다 — 포트를 보는 판이 둘이 되면
          「빈 자리가 어디였지」를 화면마다 다시 배워야 한다. */}
      {portBoard && <div className="mt-3 border-t border-line pt-3">{portBoard}</div>}
    </Modal>
  );
}

// ── props ─────────────────────────────────────────────────────────────────────
interface InfoTabProps {
  assetId: string;
  asset: V2Asset;
  type: V2AssetType | undefined;
  /** 설비의 분류이자 자리 명세 — 격자가 여기서 나온다. */
  assembliesById: Map<string, V2Assembly>;
  effectiveAssets: V2Asset[];
}

interface LayoutTabProps {
  assetId: string;
  asset: V2Asset;
  /** 설비의 분류이자 자리 명세 — 격자가 여기서 나온다. */
  assembliesById: Map<string, V2Assembly>;
  /** 이 설비 안에 놓인 부품들 — 자리 순. */
  parts: V2Asset[];
  /** 자산 종류 이름을 부품 상자에 적는다. */
  typesById: Map<string, V2AssetType>;
  /** 밖에서 부품을 지목해 온 경우(현황표에서 부품 행을 눌렀을 때) — 격자에서 빛난다. */
  focusPartId?: string | null;
  /**
   * 그 부품의 포트 판 — 상자 안에 그대로 앉는다.
   *
   * 판을 여기서 만들지 않고 받는 이유: 그것은 포트 탭이 쓰는 것과 **같은 판**이어야 하고,
   * 그 판이 쓰는 것들(추적·대국 이동·케이블 잇기)은 이 탭이 아니라 워크스페이스의 것이다.
   * `close` 는 **화면 뒤를 바꾸는 일**에 쓴다 — 다른 자산으로 옮겨가거나 평면도의 케이블
   * 도구를 무장시키면, 그 앞을 가린 상자는 닫혀야 한다.
   */
  renderPortBoard: (partId: string, close: () => void) => React.ReactNode;
  /** 지금 무엇을 넣을지 묻는 중인가 — 그 자리를 판에 남겨 두려면 값도 알아야 한다. */
  addModalCtx: AddModalContext | null;
  setAddModalCtx: (ctx: AddModalContext | null) => void;
}

export function InfoTab({
  assetId,
  asset,
  type,
  assembliesById,
  effectiveAssets,
}: InfoTabProps) {
  const { confirm, confirmDialog } = useConfirm();
  /* 종류 이름을 짓는 데만 쓴다 — 격자는 「구성」 탭이 맡는다. */
  const assembly = asset.assemblyId ? assembliesById.get(asset.assemblyId) : undefined;

  /** 함께 사라지는 것이 몇인가 — 삭제 확인 문구가 쓴다. */
  function countDescendants(rootId: string): number {
    const kids = effectiveAssets.filter((a) => a.parentAssetId === rootId);
    return kids.length + kids.reduce((n, k) => n + countDescendants(k.id), 0);
  }
  const descendantCount = countDescendants(assetId);

  // ── 삭제 핸들러 ────────────────────────────────────────────────────────────
  async function handleDelete() {
    const msg =
      descendantCount > 0
        ? `${descendantCount}개 하위 자산이 함께 삭제됩니다. 계속하시겠습니까?`
        : '이 자산을 삭제하시겠습니까?';
    if (!(await confirm({ title: '자산 삭제', target: asset.name, message: msg, confirmLabel: '삭제', danger: true }))) return;
    useV2WorkingCopy.getState().stageAssetDeleteCascade(assetId);
  }

  /** 부품 하나 걷어내기 — 설비는 그대로 둔다. */

  // ── 인라인 편집 핸들러 ─────────────────────────────────────────────────────
  function handleNameCommit(value: string) {
    const trimmed = value.trim();
    if (trimmed && trimmed !== asset.name) {
      useV2WorkingCopy.getState().stageAssetUpdate(assetId, { name: trimmed });
    }
  }

  function handleStatusChange(value: string) {
    useV2WorkingCopy.getState().stageAssetUpdate(assetId, { status: value });
  }

  function handleFieldCommit(key: string, value: string) {
    // 커밋 시점 스토어에서 현재 fieldValues 를 읽는다 (렌더 클로저 stale 방지; 이벤트 핸들러라 반응성 무관)
    const current = useV2WorkingCopy.getState().effectiveAssets().find((a) => a.id === assetId)?.fieldValues ?? {};
    if (String(current[key] ?? '') === value) return;
    useV2WorkingCopy.getState().stageAssetUpdate(assetId, { fieldValues: { ...current, [key]: value } });
  }

  return (
    <>
      {/* 기본 정보 카드 */}
      <DetailCard>
        {/* 종류 — 부품은 타입이, 설비 종류로 놓은 설비는 **설비 종류**가 그 분류다. */}
        <DetailCardHeader title={type?.name ?? assembly?.name ?? EMPTY} onDelete={handleDelete} />

        {/* 이름 */}
        <DetailRow label="이름">
          <Input
            defaultValue={asset.name}
            size="sm"
            onBlur={(e) => handleNameCommit(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
            key={asset.name}
          />
        </DetailRow>

        {/* 상태 */}
        <DetailRow label="상태">
          <Select value={asset.status} size="sm" onChange={(e) => handleStatusChange(e.currentTarget.value)}>
            {ASSET_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </DetailRow>


        {/* 설치일·담당자도 **같은 카드**에 둔다 — 자산 하나를 두고 「이름·상태」와 「설치일·
            담당자」로 카드를 가를 이유가 없다. 넷 다 이 자산에 적는 값이고, 카드를 나누면
            스크롤만 늘고 어느 카드에 무엇이 있는지 기억해야 한다.
            타입마다 필드를 따로 선언하던 길은 걷었다: 실제로 쓰인 것은 피더의 개폐 상태뿐이었고,
            그건 자산이 아니라 회로의 상태라 전원 출력 포트로 옮겼다. */}
        {assetFieldDefs().map((fd) => {
          const rawVal = asset.fieldValues[fd.key];
          const strVal = rawVal != null ? String(rawVal) : '';
          return (
            <DetailRow key={fd.key} label={fd.label}>
              {fd.type === 'select' ? (
                <Select
                  defaultValue={strVal}
                  size="sm"
                  onBlur={(e) => handleFieldCommit(fd.key, e.currentTarget.value)}
                  key={strVal}
                >
                  <option value="">{EMPTY}</option>
                  {(fd.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </Select>
              ) : (
                <FieldInput
                  isDate={fd.type === 'date'}
                  type={fd.type === 'number' ? 'number' : 'text'}
                  defaultValue={strVal}
                  size="sm"
                  onBlur={(e) => handleFieldCommit(fd.key, e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  key={strVal}
                />
              )}
            </DetailRow>
          );
        })}
      </DetailCard>

      {/* 포트는 '연결' 탭이 담당한다 — 여기 있던 섹션은 타입의 **포트 템플릿**을 다시 그린
          것이라 실제 포트도 아니고 연결 상태도 몰랐다. 같은 "포트" 가 두 탭에 반쪽씩
          나뉘어 있어, 어느 쪽을 봐야 하는지 알 수 없었다. */}

      {confirmDialog}
    </>
  );
}

/**
 * 구성 탭 — **설비 안을 실제로 들여다보는 판**.
 *
 * 예전에는 이 격자가 「정보」 탭 안, 기본정보 카드 **아래**에 240px 상자로 있었다. 설비를
 * 고른 사람이 가장 먼저 보고 싶은 것이 그 안인데, 스크롤해야 나왔고 크기도 작았다.
 *
 * **스크롤이 생기지 않는다.** 격자가 남는 높이를 채우고(`fill`), 부품을 고르면 그만큼
 * 줄어들며 아래에 그 부품 카드가 선다 — 포트 탭이 쓰는 어법과 같다(고른 것의 상세는
 * 누른 판 **바로 아래**). 부품을 눌렀다고 다른 탭으로 튕기지 않는다.
 */
export function LayoutTab({
  assetId,
  asset,
  assembliesById,
  parts,
  typesById,
  focusPartId,
  renderPortBoard,
  addModalCtx,
  setAddModalCtx,
}: LayoutTabProps) {
  const { confirm, confirmDialog } = useConfirm();
  /** 격자에서 누른 부품 — 대화상자가 뜬다. 판 자체는 그대로다. */
  const [openPartId, setOpenPartId] = useState<string | null>(null);

  const openPart = parts.find((p) => p.id === openPartId) ?? null;
  const savedCables = useV2WorkingCopy((st) => st.saved.cables);
  const cableOverlays = useV2WorkingCopy((st) => st.overlays.cables);
  /* 케이블이 물린 포트 — 부품 칸의 포트 요약(n/m)이 읽는다. */
  const occupiedPortIds = useMemo(
    () => cableCountByPortId(mergeEffective(savedCables, cableOverlays)),
    [savedCables, cableOverlays],
  );

  const assembly = asset.assemblyId ? assembliesById.get(asset.assemblyId) : undefined;

  function canPlaceInGrid(movingId: string, at: GridPlacement): boolean {
    return (
      validateGridPlacement({
        grid: ASSEMBLY_GRID,
        ...at,
        occupants: parts
          .filter((a) => a.id !== movingId && a.col != null && a.row != null)
          .map((a) => ({
            assetId: a.id, col: a.col!, row: a.row!, colSpan: a.colSpan ?? 1, rowSpan: a.rowSpan ?? 1,
          })),
      }) === null
    );
  }

  async function handleDeletePart(part: V2Asset) {
    const ok = await confirm({
      title: '부품 삭제', target: part.name, message: '이 설비에서 걷어냅니다.',
      confirmLabel: '삭제', danger: true,
    });
    if (!ok) return;
    useV2WorkingCopy.getState().stageAssetDeleteCascade(part.id);
    setOpenPartId(null);
  }

  return (
    /* 구성 탭에는 **구성뿐**이다 — 부품을 눌러도 아래에 카드가 붙지 않는다(대화상자로 뜬다).
       판이 탭을 통째로 쓰므로 스크롤도 생기지 않는다. */
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 자리는 그 설비 종류의 격자다: 랙이라는 자산을 따로 두고 그 타입이 자리를 선언하던 층은 걷었다. */}
      {assembly && (
        <DetailCard className="flex min-h-0 flex-1 flex-col">
          {/* 「몇 칸 중 몇 칸」은 적지 않는다 — 격자는 그저 배치용 도화지라, 200칸 중 몇 칸을
              썼는지는 이 설비에 대해 아무것도 말해 주지 않는다(꽉 채워 그린 접지함체가 촘촘히
              그린 랙보다 「찼다」고 읽힐 이유가 없다). */}
          <DetailCardHeader title="구성" />
          <AssemblyGrid
            grid={ASSEMBLY_GRID}
            /* 상자를 못 박지 않고 **남는 높이를 채운다**(`fill`) — 구성 탭은 스크롤이 생기면 안 된다. */
            fill
            items={parts}
            /* 밖에서 고른 부품(현황 표·평면도)도 여기서 빛난다 — 대화상자를 열면 그 부품으로 옮겨간다. */
            selectedId={openPartId ?? focusPartId ?? null}
            /* 부품을 누르면 **그 부품 상자**가 뜬다. 패널이 통째로 그 부품으로 바뀌지 않는다:
               부품마다 다른 것은 이름·상태·설치일·담당자 네 줄뿐인데, 그것을 보려고 맥락(지금
               어느 설비를 보고 있나)이 사라지고 대부분 빈 탭 넷이 다시 떴다. */
            onSelect={(child) => setOpenPartId(child.id)}
            /* 놓인 자산이라 묻는다 — 포트·연결까지 함께 사라진다. */
            onRemove={(part) => void handleDeletePart(part)}
            trailing={(child) => <PortSummary asset={child} occupiedPortIds={occupiedPortIds} />}
            onAddAtCell={(cell) => setAddModalCtx({ parentAssetId: assetId, cell })}
            /* 무엇을 넣을지 묻는 동안 그 네모는 판에 남는다 — 상자가 가리는 것은 판이지
               방금 그린 자리가 아니어야 한다. */
            pending={
              addModalCtx
                ? {
                    at: {
                      col: addModalCtx.cell.col,
                      row: addModalCtx.cell.row,
                      colSpan: addModalCtx.cell.colSpan ?? 1,
                      rowSpan: addModalCtx.cell.rowSpan ?? 1,
                    },
                    label: '새 자산',
                  }
                : null
            }
            canPlace={canPlaceInGrid}
            onMove={(id, at) => useV2WorkingCopy.getState().stageAssetUpdate(id, at)}
            /* 칸마다 운전 상태 불 — 색은 어휘가 정한다(정상 초록·예비 노랑·고장 빨강). */
            toneOf={(part) => assetStatusTone(part.status)}
          />
        </DetailCard>
      )}

      {openPart && (
        <PartDialog
          part={openPart}
          typeName={typesById.get(openPart.typeId ?? '')?.name ?? EMPTY}
          portBoard={openPart.ports.length > 0 ? renderPortBoard(openPart.id, () => setOpenPartId(null)) : null}
          onClose={() => setOpenPartId(null)}
          onDelete={() => void handleDeletePart(openPart)}
        />
      )}

      {confirmDialog}
    </div>
  );
}
