/**
 * PortPickerPopover — 케이블 연결 시 포트 선택 팝오버.
 * 화면 좌표 근처에 absolute 포지션으로 렌더링.
 * CONVENTIONS 준수: text-xs/text-sm, 시맨틱 색 토큰, z-backdrop/z-modal.
 */
import type { V2Asset, V2Port } from '../types';
import { Button } from '../../components/ui';

interface Props {
  /** 팝오버를 표시할 화면 좌표 (캔버스 좌상단 기준 offset) */
  screenPos: { x: number; y: number };
  asset: V2Asset;
  /** freePortsOf 결과 (호출부에서 필터링해 전달) */
  freePorts: V2Port[];
  /** 미저장 자산 (updatedAt === '') 이면 true → "저장 후 연결 가능" 안내만 표시 */
  isUnsaved: boolean;
  /** 포트 선택 콜백 */
  onSelectPort: (port: V2Port) => void;
  /** 닫기 콜백 */
  onClose: () => void;
}

export function PortPickerPopover({
  screenPos,
  asset,
  freePorts,
  isUnsaved,
  onSelectPort,
  onClose,
}: Props) {
  return (
    <>
      {/* 백드롭: 팝오버 바깥 클릭 시 닫기 */}
      <div
        className="fixed inset-0 z-backdrop"
        onClick={onClose}
        aria-hidden
      />
      {/* 팝오버 본체 */}
      <div
        className="absolute z-modal min-w-[160px] max-w-[220px] rounded-lg border border-line bg-surface shadow-lg p-2"
        style={{ left: screenPos.x + 8, top: screenPos.y + 8 }}
      >
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-semibold text-content-muted truncate">{asset.name}</span>
          <button
            type="button"
            className="ml-2 text-xs text-content-faint hover:text-content"
            onClick={onClose}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {isUnsaved ? (
          <p className="text-xs text-warning py-1">저장 후 연결 가능합니다.</p>
        ) : freePorts.length === 0 ? (
          <p className="text-xs text-content-faint py-1">사용 가능한 포트 없음</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {freePorts.map((port) => (
              <li key={port.id}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => onSelectPort(port)}
                >
                  <span className="text-content-muted mr-1">{port.group}</span>
                  {port.name}
                  <span className="ml-auto text-content-faint">{port.medium}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
