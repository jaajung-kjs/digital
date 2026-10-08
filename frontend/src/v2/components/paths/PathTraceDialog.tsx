import { useMemo } from 'react';
import { traceFromCore, type Side } from '@twin/core';
import { Badge, Button, Chain, ChainLink, ChainStep, Modal, PageState } from '../../../components/ui';
import { useV2OrgTree } from '../../hooks';
import { useNetwork } from '../../model/networkApi';
import { useWorkingCopy } from '../../model/store/workingCopy';
import { ancestorPath, flattenTree } from '../../orgTreeSelectors';
import { useWorkspaceRoute } from '../../useWorkspaceRoute';
import { DutyBadge } from './duty';
import { effectiveNetwork } from './networkSelectors';
import { BREAK_TEXT, pathSteps, pathSummary, pathTitle, type BlockAt, type ChainStep as Step } from './pathChain';

export interface PathTraceDialogProps {
  /** 연 국 — 그 국의 본부가 범위다. */
  substationId: string;
  /** 물은 코어 끝 — 선번장 줄이면 그 블록의 끝, 연결 목록이면 연결의 코어 끝. */
  at: { lineId: string; coreNo: number; side: Side };
  onClose: () => void;
}

/**
 * 중계경로 추적 — 코어 끝 하나에서 한 회선의 사슬을 현장 표기로(설비 → 코어 → 광선로 → 중계 패치 → … → 설비).
 *
 * 범위는 **이 국의 본부**(서버 범위 데이터) 위에 **저장 전 변경**을 겹친 것이다(`effectiveNetwork`) — 방금 등록한
 * 패치도 저장 전에 추적에 든다. 판정(사슬)은 core `traceFromCore` 한 곳이고, 여기는 줄을 세울 뿐이다.
 * 국 이름·코어를 누르면 그 국 선번장의 그 블록으로 간다(기록을 남긴다).
 */
export function PathTraceDialog({ substationId, at, onClose }: PathTraceDialogProps) {
  const route = useWorkspaceRoute();
  const org = useV2OrgTree();
  const hqId = useMemo(() => {
    if (!org.data) return null;
    /* 트리에 본부가 없으면(국이 트리 밖·자료 어긋남) 그 국 범위로 — 영영 「불러오는 중」에 머물지 않게. */
    return ancestorPath(flattenTree(org.data), substationId).find((n) => n.kind === 'hq')?.id ?? substationId;
  }, [org.data, substationId]);
  const net = useNetwork(hqId);
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);

  const view = useMemo(() => (net.data ? effectiveNetwork(net.data, { saved, overlays }) : null), [net.data, saved, overlays]);
  const path = useMemo(() => (view ? traceFromCore(view.input, at) : null), [view, at]);

  const go = (b: BlockAt) => { route.openBlockAt(b.substationId, { lineId: b.lineId, side: b.side }); onClose(); };

  const failed = org.isError || net.isError;
  const title = view && path ? pathTitle(view, path, at) : '중계경로';

  return (
    <Modal open onClose={onClose} title={title} size="lg" footer={<Button variant="secondary" onClick={onClose}>닫기</Button>}>
      {failed ? (
        <PageState error="중계경로를 불러오지 못했습니다" action={<Button variant="secondary" size="sm" onClick={() => { void org.refetch(); void net.refetch(); }}>다시 시도</Button>} />
      ) : !view || !path ? (
        <PageState />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span data-testid="path-summary" className="min-w-0 flex-1 break-words text-sm font-medium tabular-nums">{pathSummary(view, path).split('-').flatMap((part, i) => (i === 0 ? [part] : ['-', <wbr key={i} />, part]))}</span>
            {/* 회선의 주/예비 — 사슬의 코어가 모두 같을 때만 값이 선다(core 가 정한다). 회선 목록과 같은 배지. */}
            {path.complete ? <DutyBadge duty={path.duty} /> : <Badge status="warning">경로 미완결</Badge>}
          </div>
          <Chain aria-label="중계경로">
            {pathSteps(view, path).map((s, i) => <StepRow key={i} step={s} go={go} />)}
          </Chain>
        </div>
      )}
    </Modal>
  );
}

function StepRow({ step: s, go }: { step: Step; go: (b: BlockAt) => void }) {
  const station = (name: string, b: BlockAt) => (
    <ChainLink className="font-semibold" title={`${name} 선번장에서 보기`} onClick={() => go(b)}>{name}</ChainLink>
  );
  const dot = <span aria-hidden className="text-content-faint"> · </span>;
  switch (s.kind) {
    case 'end':
      return (
        <ChainStep data-testid="path-step" data-kind="end">
          {station(s.station, s.at)}{dot}{s.equipment}{s.port && <>{dot}{s.port}</>}
        </ChainStep>
      );
    case 'terminal':
      return (
        <ChainStep data-testid="path-step" data-kind="terminal">
          {s.showStation && <>{station(s.station, s.at)}{dot}</>}
          {s.place}{dot}어댑터 {s.adapter}{dot}
          <ChainLink title={`${s.station} 선번장 · 코어 ${s.coreNo}`} onClick={() => go(s.at)}>코어 {s.coreNo}</ChainLink>
        </ChainStep>
      );
    case 'line':
      return <ChainStep tone="link" data-testid="path-step" data-kind="line">{s.text}</ChainStep>;
    case 'patch':
      return <ChainStep tone="link" data-testid="path-step" data-kind="patch">중계 패치</ChainStep>;
    case 'broken':
      return (
        <ChainStep tone="warning" data-testid="path-step" data-kind="broken">
          경로 미완결 — {BREAK_TEXT[s.cause]}{dot}
          <ChainLink tone="primary" onClick={() => go(s.at)}>{s.station} · 코어 {s.coreNo}</ChainLink>
        </ChainStep>
      );
  }
}
