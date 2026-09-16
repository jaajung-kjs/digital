/**
 * InfoTab — 상세 패널 1번째 탭 '정보'
 *
 * 기본정보(이름·상태·위치)·커스텀 필드·포트·수용 섹션을 표시/편집한다.
 * AssetDetailPanel 에서 추출 — RecordsTab/ConnectionsTab 과 같은 형제 탭 패턴으로 정리했다.
 */

import { useMemo, useState } from 'react';
import { ASSET_STATUSES, assetFieldDefs, assetStatusTone, occupantsOf, validateGridPlacement, ASSEMBLY_GRID, type GridCell, type GridPlacement } from '@twin/core';
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
  
  EMPTY,
  isCommitKey,
} from '../../../components/ui';
import { AssemblyGrid } from '../AssemblyGrid';
import { makeNewAsset, portsForNewAsset } from '../../newAsset';
import { deleteAssetWithConfirm } from '../../deleteActions';
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


/**
 * 고른 장비 — **설비에서 갈라지는 것만** 적는다.
 *
 * 장비마다 다를 수 있는 것은 상태·설치일·담당자다(L3 스위치만 나중에 갈아 끼우면 설치일이
 * 다르다). 사진·점검·고장이력은 **설비의 것**이고, 포트는 설비의 포트 탭이 이미 장비별로
 * 묶어 보여준다 — 그래서 여기 다시 두지 않는다.
 */
/**
 * 격자에서 누른 장비 — **대화상자**로 연다.
 *
 * 아래에 카드로 펴 봤는데, 그러면 구성 탭이 「판 + 카드」 두 층이 되어 판을 보러 온 사람이
 * 매번 카드에 자리를 내주게 된다. 랙을 보러 왔으면 랙만 보여야 한다.
 *
 * 대화상자인 이유는 **빈 칸이 이미 그렇게 동작하기 때문**이다 — 빈 칸을 누르면 「자산 추가」
 * 상자가 뜬다. 찬 칸을 누르면 그 장비 상자가 뜬다: 한 판에서 누르는 곳에 따라 만들기와
 * 고치기가 같은 모양으로 열린다. 카드로 펴면 이 둘이 서로 다른 어법이 된다.
 *
 * 판은 **한 번도 줄지 않는다**(상자가 위에 뜨므로) — 20행이 눌려 글씨가 뭉갤 일이 없다.
 */
function PartDialog({
  part, types, portBoard, onClose, onDelete,
}: {
  part: V2Asset;
  /** 고를 수 있는 장비 품목 — 종류를 여기서 바꾸면 포트가 그 종류대로 다시 만들어진다. */
  types: V2AssetType[];
  /** 이 장비의 포트 판 — 포트 탭이 쓰는 것과 **같은 판**이다(위에서 만들어 내려온다). */
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
      /* 갓 만든 자산은 이름이 없다 — 제목이 비면 이 상자가 무엇의 것인지 말하지 못한다. */
      title={part.name || '새 장비'}
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
      {/* **종류도 여기서 고친다.** 예전에는 읽기만 했고, 잘못 고른 장비를 바로잡는 길이
          「지우고 다시 만들기」뿐이었다 — 그러면 점검·고장이력·사진이 함께 사라진다.
          종류를 바꾸면 포트는 그 종류대로 다시 만들어진다(포트가 무엇인지는 종류가 정한다).
          케이블이 물린 포트가 사라지는 경우만 저장할 때 막힌다 — 포트를 줄일 때와 같은 규칙. */}
      <DetailRow label="품목">
        <Select
          aria-label="장비 품목"
          value={part.typeId ?? ''}
          size="sm"
          onChange={(e) => {
            const next = types.find((t) => t.id === e.currentTarget.value);
            if (!next) return;
            commit({ typeId: next.id, ports: portsForNewAsset(next, part.id) });
          }}
        >
          <option value="">— 품목 선택 —</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </Select>
      </DetailRow>
      <DetailRow label="이름">
        <Input
          key={part.id + part.name}
          aria-label="장비 이름"
          defaultValue={part.name}
          /* 방금 만든 빈 자산이면 이름부터 적는다 — 종류는 판에서 고른 뒤 여기 와 있다. */
          autoFocus={part.name === ''}
          size="sm"
          onBlur={(e) => {
            const v = e.currentTarget.value.trim();
            if (v && v !== part.name) commit({ name: v });
          }}
          onKeyDown={(e) => { if (isCommitKey(e)) e.currentTarget.blur(); }}
        />
      </DetailRow>
      <DetailRow label="상태">
        <Select value={part.status} size="sm" onChange={(e) => commit({ status: e.currentTarget.value })}>
          {ASSET_STATUSES.map((st) => (
            <option key={st.value} value={st.value}>{st.label}</option>
          ))}
        </Select>
      </DetailRow>
      {/* 폼의 줄은 **선언이 정한다** — 그리는 자리에서 정하는 값(정면)은 여기 서지 않는다. */}
      {assetFieldDefs().filter((fd) => fd.inForm !== false).map((fd) => {
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
              onKeyDown={(e) => { if (isCommitKey(e)) e.currentTarget.blur(); }}
            />
          </DetailRow>
        );
      })}
      </div>

      {/* 포트는 **여기서 본다.** 예전에는 「25개 보기」가 포트 탭으로 보냈는데, 장비 하나를
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
  /** 이 설비 안에 놓인 장비들 — 자리 순. */
  parts: V2Asset[];
  /** 밖에서 장비를 지목해 온 경우(현황표에서 장비 행을 눌렀을 때) — 격자에서 빛난다. */
  focusPartId?: string | null;
  /**
   * 그 장비의 포트 판 — 상자 안에 그대로 앉는다.
   *
   * 판을 여기서 만들지 않고 받는 이유: 그것은 포트 탭이 쓰는 것과 **같은 판**이어야 하고,
   * 그 판이 쓰는 것들(추적·대국 이동·케이블 잇기)은 이 탭이 아니라 설비 관리의 것이다.
   * `close` 는 **화면 뒤를 바꾸는 일**에 쓴다 — 다른 자산으로 옮겨가거나 평면도의 케이블
   * 도구를 무장시키면, 그 앞을 가린 상자는 닫혀야 한다.
   */
  renderPortBoard: (partId: string, close: () => void) => React.ReactNode;
  /** 이 변전소 — 새로 만드는 자산이 어디 것인지. */
  substationId: string;
  /** 고를 수 있는 장비 품목 — 상자 안에서 종류를 고른다. */
  types: V2AssetType[];
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


  // ── 삭제 핸들러 — 묻는 말도 지우는 일도 도면과 **같은 문**이다. ───────────
  async function handleDelete() {
    await deleteAssetWithConfirm({ asset, assets: effectiveAssets, confirm });
  }

  /** 장비 하나 걷어내기 — 설비는 그대로 둔다. */

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
        {/* 종류 — 장비는 타입이, 설비 품목으로 놓은 설비는 **설비 품목**가 그 분류다. */}
        <DetailCardHeader title={type?.name ?? assembly?.name ?? EMPTY} onDelete={handleDelete} />

        {/* 이름 */}
        <DetailRow label="이름">
          <Input
            defaultValue={asset.name}
            size="sm"
            onBlur={(e) => handleNameCommit(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (isCommitKey(e)) {
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
        {/* 폼의 줄은 **선언이 정한다**(`inForm`) — 정면은 평면도 도구바의 회전이 쥔다. */}
        {assetFieldDefs().filter((fd) => fd.inForm !== false).map((fd) => {
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
                    if (isCommitKey(e)) e.currentTarget.blur();
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
 * **스크롤이 생기지 않는다.** 격자가 남는 높이를 채우고(`fill`), 장비를 고르면 그만큼
 * 줄어들며 아래에 그 장비 카드가 선다 — 포트 탭이 쓰는 어법과 같다(고른 것의 상세는
 * 누른 판 **바로 아래**). 장비를 눌렀다고 다른 탭으로 튕기지 않는다.
 */
export function LayoutTab({
  assetId,
  asset,
  assembliesById,
  parts,
  focusPartId,
  renderPortBoard,
  substationId,
  types,
}: LayoutTabProps) {
  const { confirm, confirmDialog } = useConfirm();
  /** 격자에서 누른 장비 — 대화상자가 뜬다. 판 자체는 그대로다. */
  const [openPartId, setOpenPartId] = useState<string | null>(null);

  const openPart = parts.find((p) => p.id === openPartId) ?? null;

  /**
   * 빈 자리에 **빈 자산을 놓는다** — 종류도 이름도 아직 없다.
   *
   * 만들어 두고 고치는 편이 낫다: 판에 그 자산이 실제로 서므로 「지금 무엇을 하는 중인가」가
   * 화면에 있고, 고르는 상자와 고치는 상자가 하나로 합쳐진다.
   */
  function createBlankPart(
    cell: GridCell & { colSpan?: number; rowSpan?: number },
    /** 선언된 자리에서 났으면 그 이름과 항목 id — 「S.5」처럼. 없으면 사람이 적는다. */
    slot?: { name: string; itemId: string },
  ): string {
    const asset = makeNewAsset({
      type: null,
      name: slot?.name ?? '',
      ...(slot ? { assemblyItemId: slot.itemId } : {}),
      substationId,
      placement: {
        kind: 'grid',
        parentAssetId: assetId,
        col: cell.col,
        row: cell.row,
        colSpan: cell.colSpan ?? 1,
        rowSpan: cell.rowSpan ?? 1,
      },
    });
    useV2WorkingCopy.getState().stageAssetCreate(asset);
    return asset.id;
  }

  /**
   * 상자를 닫는다 — **종류나 이름이 없는 장비는 없는 것**이다.
   *
   * 빈 자리를 눌렀다가 마음이 바뀌면 그냥 닫으면 된다. 남겨 두면 손해가 두 겹이다: 무엇인지도
   * 모르는 줄이 현황표에 늘고, 이름 없는 자산은 **저장 자체가 거절돼**(서버가 이름을 요구한다)
   * 그 변전소의 다른 변경까지 함께 막힌다.
   */
  function closeDialog(part: V2Asset) {
    if (!part.typeId || part.name.trim() === '') useV2WorkingCopy.getState().stageAssetDeleteCascade(part.id);
    setOpenPartId(null);
  }

  const assembly = asset.assemblyId ? assembliesById.get(asset.assemblyId) : undefined;
  /**
   * 설비 품목이 **선언해 둔 빈 자리들** — 자리와 이름은 정해졌고 아직 아무것도 안 꽂혔다.
   *
   * 실물 랙은 「구성은 같고 실장만 다르다」: 8410P 는 서비스 슬롯이 열인데 두 장만 꽂혀 있고,
   * OFD 는 24심 판인데 12심만 성단돼 있다. 자리를 안 그리면 나중에 꽂는 사람이 **크기와 자리를
   * 매번 새로 정해야** 하고, 그러면 국마다 같은 슬롯이 다른 크기로 굳는다.
   *
   * **자산이 아니다** — 없는 물건이 산출·현황·미점검에 세어지면 안 된다. 그래서 판에만 서고,
   * 누르는 순간 그 자리 그대로 장비가 난다.
   */
  const emptySlots = useMemo(() => {
    const taken = new Set(parts.map((p) => p.assemblyItemId).filter(Boolean));
    return (assembly?.items ?? [])
      .filter((item) => item.typeId == null && !taken.has(item.id))
      .map((item) => ({ id: `slot:${item.id}`, name: item.name, col: item.col, row: item.row, colSpan: item.colSpan, rowSpan: item.rowSpan }));
  }, [assembly, parts]);
  const isSlot = (id: string) => id.startsWith('slot:');
  /** 그 빈 자리에 **선언된 크기 그대로** 장비를 낸다 — 크기를 다시 정할 일이 없다. */
  const fillSlot = (slot: { id: string; name: string; col: number | null; row: number | null; colSpan: number | null; rowSpan: number | null }) =>
    createBlankPart(
      { col: slot.col ?? 0, row: slot.row ?? 0, colSpan: slot.colSpan ?? 1, rowSpan: slot.rowSpan ?? 1 },
      { name: slot.name, itemId: slot.id.slice('slot:'.length) },
    );


  function canPlaceInGrid(movingId: string, at: GridPlacement): boolean {
    return (
      validateGridPlacement({
        grid: ASSEMBLY_GRID,
        ...at,
        occupants: occupantsOf(parts, movingId),
      }) === null
    );
  }

  async function handleDeletePart(part: V2Asset) {
    const ok = await confirm({
      title: '장비 삭제', target: part.name, message: '이 설비에서 걷어냅니다.',
      confirmLabel: '삭제', danger: true,
    });
    if (!ok) return;
    useV2WorkingCopy.getState().stageAssetDeleteCascade(part.id);
    setOpenPartId(null);
  }

  return (
    /* 구성 탭에는 **구성뿐**이다 — 장비를 눌러도 아래에 카드가 붙지 않는다(대화상자로 뜬다).
       판이 탭을 통째로 쓰므로 스크롤도 생기지 않는다. */
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 자리는 그 설비 품목의 격자다: 랙이라는 자산을 따로 두고 그 타입이 자리를 선언하던 층은 걷었다. */}
      {/* **판만 선다.** 「구성」이라는 탭 안에 다시 「구성」이라는 제목이 있고 그것을 카드가
          감싸고 있었다 — 같은 말을 세 겹으로 하면서 정작 판이 그만큼 좁아졌다. 탭 이름이 이미
          무엇인지 말하므로 여기서는 판을 크게 편다. */}
      {assembly && (
          <AssemblyGrid
            grid={ASSEMBLY_GRID}
            /* 상자를 못 박지 않고 **남는 높이를 채운다**(`fill`) — 구성 탭은 스크롤이 생기면 안 된다. */
            fill
            /* 놓인 장비 + **선언된 빈 자리** — 판은 실물 랙의 정면이라 빈 슬롯도 자리를 갖는다. */
            items={[...parts, ...emptySlots]}
            /* 밖에서 고른 장비(현황 표·평면도)도 여기서 빛난다 — 대화상자를 열면 그 장비로 옮겨간다. */
            selectedId={openPartId ?? focusPartId ?? null}
            /* 장비를 누르면 **그 장비 상자**가 뜬다. 패널이 통째로 그 장비로 바뀌지 않는다:
               장비마다 다른 것은 이름·상태·설치일·담당자 네 줄뿐인데, 그것을 보려고 맥락(지금
               어느 설비를 보고 있나)이 사라지고 대부분 빈 탭 넷이 다시 떴다. */
            onSelect={(child) => {
              /* 빈 자리를 누르면 **그 자리 그대로** 장비가 나고 그 상자가 열린다. */
              const slot = emptySlots.find((sl) => sl.id === child.id);
              setOpenPartId(slot ? fillSlot(slot) : child.id);
            }}
            /* 놓인 자산이라 묻는다 — 포트·연결까지 함께 사라진다. */
            /* 빈 자리는 뺄 것이 없다 — 자리는 설비 품목의 것이라 여기서 못 지운다. */
            onRemove={(part) => { if (!isSlot(part.id)) void handleDeletePart(part as V2Asset); }}
            /* 칸에는 **이름만** 적는다. 포트 수(0/2)는 좁은 칸에서 이름과 자리를 다투고,
               그것을 보러 온 사람은 포트 탭으로 간다. */
            /* 빈 칸을 누르면 **그 자리에 빈 자산이 생기고** 그 자산의 상자가 열린다.
               한때는 「자산 추가」라는 다른 상자가 떴는데, 그러면 같은 일(무엇을 넣을지 정하기)에
               상자가 둘이었다 — 하나는 만들 때, 하나는 고칠 때. 만들자마자 고치는 것으로 두면
               상자는 하나이고, 판에는 그 자산이 실제로 놓여 있어 무엇을 하는 중인지가 보인다. */
            onAddAtCell={(cell) => setOpenPartId(createBlankPart(cell))}
            canPlace={(id, at) => !isSlot(id) && canPlaceInGrid(id, at)}
            onMove={(id, at) => useV2WorkingCopy.getState().stageAssetUpdate(id, at)}
            /* 칸마다 운전 상태 불 — 색은 어휘가 정한다(정상 초록·예비 노랑·고장 빨강). */
            toneOf={(part) => (isSlot(part.id) ? null : assetStatusTone((part as V2Asset).status))}
            ghostOf={(part) => isSlot(part.id)}
          />
      )}

      {openPart && (
        <PartDialog
          part={openPart}
          types={types}
          portBoard={openPart.ports.length > 0 ? renderPortBoard(openPart.id, () => setOpenPartId(null)) : null}
          onClose={() => closeDialog(openPart)}
          onDelete={() => void handleDeletePart(openPart)}
        />
      )}

      {confirmDialog}
    </div>
  );
}
