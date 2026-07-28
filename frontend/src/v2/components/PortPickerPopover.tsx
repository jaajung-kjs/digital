/**
 * PortPickerPopover — 케이블 연결 시 포트 선택 팝오버.
 * 화면 좌표 근처에 absolute 포지션으로 렌더링.
 * 클릭된 자산의 자식(전이적 포함)까지 포트를 그룹별로 표시한다.
 * CONVENTIONS 준수: text-xs/text-sm, 시맨틱 색 토큰, z-backdrop/z-modal.
 */
import type { V2Asset, V2Port } from '../types';
import { Button } from '../../components/ui';

export interface PortGroup {
  asset: V2Asset;
  ports: V2Port[];
}

interface Props {
  /** 팝오버를 표시할 화면 좌표 (캔버스 좌상단 기준 offset) */
  screenPos: { x: number; y: number };
  /** 클릭된 자산 (헤더 표시 + 미저장 판정용) */
  asset: V2Asset;
  /**
   * 자산별 그룹 목록. 각 그룹의 ports 는 이미 freePortsOf 필터링된 결과.
   * 빈 ports 를 가진 그룹은 표시하지 않는다.
   */
  portGroups: PortGroup[];
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
  portGroups,
  isUnsaved,
  onSelectPort,
  onClose,
}: Props) {
  const hasFreePorts = portGroups.some((g) => g.ports.length > 0);

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
        className="absolute z-modal min-w-[160px] max-w-[240px] rounded-lg border border-line bg-surface shadow-lg p-2"
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
        ) : !hasFreePorts ? (
          <p className="text-xs text-content-faint py-1">연결 가능한 포트 없음</p>
        ) : (
          <div className="flex flex-col gap-1">
            {portGroups.map((group) => {
              if (group.ports.length === 0) return null;
              return (
                <div key={group.asset.id}>
                  {/* 자산 그룹 헤더 (루트와 다를 때만 표시) */}
                  {group.asset.id !== asset.id && (
                    <p className="text-xs text-content-muted px-1 pb-0.5 truncate">{group.asset.name}</p>
                  )}
                  <ul className="flex flex-col gap-0.5">
                    {group.ports.map((port) => (
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
