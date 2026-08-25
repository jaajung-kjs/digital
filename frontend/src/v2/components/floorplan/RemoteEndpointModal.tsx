/**
 * RemoteEndpointModal — **이 도면 밖의 끝점**을 찾아 고르는 상자.
 *
 * 케이블은 도면을 눌러 잇지만 반대쪽이 이 도면에 없으면 누를 것이 없다. 다른 변전소로 나가는
 * OPGW 가 그렇고, **같은 국의 다른 층**도 그렇다 — 층을 옮기면 고르던 끝점이 따라가 버려서
 * 층 넘는 케이블은 아예 만들 수가 없었다. 찾는 문은 하나로 두고 「변전소 · 층」을 함께 적는다.
 *
 * 1. 검색 Input (300ms 디바운스) → 결과 리스트 (이름 · 변전소 · 층 · 품목)
 * 2. 자산 선택 → 포트 리스트 (가득 찬 포트 제외 + medium 필터 + excludePortId 제외)
 * 3. 포트 선택 → onSelectPort 콜백
 *
 * CONVENTIONS: text-xs/text-sm, 시맨틱 색 토큰, z-modal (Modal 컴포넌트 내장).
 */
import { useEffect, useRef, useState } from 'react';
import { portHasRoom } from '@twin/core';
import { Button, Input, Modal } from '../../../components/ui';
import { searchAssets, fetchAssetPorts } from '../../api';
import type { AssetSearchResult } from '../../api';
import type { V2Port } from '../../types';

/** 어디 있는 것인가 — 「변전소 · 층」. 도면에 안 놓인 것은 국 이름만 적는다. */
const placeOf = (a: AssetSearchResult) => (a.floorName ? `${a.substationName} · ${a.floorName}` : a.substationName);

interface Props {
  open: boolean;
  onClose: () => void;
  /** 연결할 medium 필터 (undefined 이면 전체 허용) */
  mediumFilter?: string;
  /** 이미 선택된 첫 끝점 포트 ID — 결과에서 제외 */
  excludePortId?: string;
  /** occupied 포트 ID 집합 — 이미 연결된 포트 제외 */
  /** 포트별 케이블 수 — 가득 찼는지는 종류가 정한다(접지 부스바는 여러 가닥). */
  cableCountByPortId: ReadonlyMap<string, number>;
  /** 포트 선택 완료 콜백 (모달은 자동으로 닫히지 않음 — 호출자가 닫는다) */
  onSelectPort: (port: V2Port, asset: AssetSearchResult) => void;
  /** 검증 실패 등 에러 메시지 — 포트 리스트 위에 표시 */
  errorText?: string | null;
}

export function RemoteEndpointModal({
  open,
  onClose,
  mediumFilter,
  excludePortId,
  cableCountByPortId,
  onSelectPort,
  errorText,
}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AssetSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<AssetSearchResult | null>(null);
  const [ports, setPorts] = useState<V2Port[]>([]);
  const [loadingPorts, setLoadingPorts] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchSeqRef = useRef(0);

  // 모달 닫힐 때 상태 초기화
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setSearching(false);
      setSelectedAsset(null);
      setPorts([]);
      setLoadingPorts(false);
      fetchSeqRef.current++; // 레이스 토큰 리셋 — close 후 도착하는 응답 무시
      if (debounceRef.current) clearTimeout(debounceRef.current);
    }
  }, [open]);

  // 검색어 변경 시 300ms 디바운스
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchAssets(query.trim());
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  // 자산 선택 → 포트 목록 로드 (레이스 토큰: 응답 도착 시 현재 선택 자산과 불일치면 무시)
  async function handleSelectAsset(asset: AssetSearchResult) {
    const seq = ++fetchSeqRef.current;
    setSelectedAsset(asset);
    setPorts([]);
    setLoadingPorts(true);
    try {
      const data = await fetchAssetPorts(asset.id);
      // 레이스 체크: 요청 후 다른 자산이 선택되었으면 이 응답 무시
      if (seq !== fetchSeqRef.current) return;
      // occupied 제외 + medium 필터 + excludePortId 제외
      const filtered = data.filter((p) => {
        if (p.occupied) return false;
        if (!portHasRoom(p.medium, cableCountByPortId.get(p.id) ?? 0)) return false;
        if (p.id === excludePortId) return false;
        if (mediumFilter && p.medium !== mediumFilter) return false;
        return true;
      });
      setPorts(filtered);
    } catch {
      if (seq !== fetchSeqRef.current) return;
      setPorts([]);
    } finally {
      if (seq === fetchSeqRef.current) setLoadingPorts(false);
    }
  }

  function handleBack() {
    fetchSeqRef.current++; // 레이스 토큰 증가 — 뒤로가기 후 도착하는 포트 응답 무시 (M-3)
    setSelectedAsset(null);
    setPorts([]);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="다른 층·변전소에서 포트 선택"
      size="md"
    >
      {selectedAsset ? (
        /* 포트 선택 화면 */
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleBack}>
              ← 뒤로
            </Button>
            <div>
              <p className="text-sm font-semibold text-content">{selectedAsset.name}</p>
              <p className="text-xs text-content-muted">{placeOf(selectedAsset)} · {selectedAsset.typeName}</p>
            </div>
          </div>

          {errorText && (
            <p className="text-xs text-danger">{errorText}</p>
          )}

          {loadingPorts ? (
            <p className="text-xs text-content-faint py-2">포트 로딩 중…</p>
          ) : ports.length === 0 ? (
            <p className="text-xs text-content-faint py-2">연결 가능한 포트 없음</p>
          ) : (
            <ul className="divide-y divide-line max-h-64 overflow-y-auto">
              {ports.map((port) => (
                <li key={port.id}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-xs py-2"
                    onClick={() => onSelectPort(port, selectedAsset)}
                  >
                    <span className="text-content-muted mr-1">{port.group}</span>
                    {port.name}
                    <span className="ml-auto text-content-faint">{port.medium}</span>
                    <span className="ml-2 text-content-faint">{port.direction}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        /* 자산 검색 화면 */
        <div className="space-y-3">
          {/* 공용 `Input` 을 쓴다 — 여기만 테두리·여백·포커스를 손으로 적어 두어서
              같은 검색칸인데 다른 화면과 높이·초점 테가 달랐다. */}
          <Input
            autoFocus
            aria-label="설비 이름 검색"
            placeholder="설비 이름 검색…"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
          />

          {searching && (
            <p className="text-xs text-content-faint">검색 중…</p>
          )}

          {!searching && query.trim() && results.length === 0 && (
            <p className="text-xs text-content-faint">검색 결과 없음</p>
          )}

          {results.length > 0 && (
            <ul className="divide-y divide-line max-h-64 overflow-y-auto">
              {results.map((asset) => (
                <li key={asset.id}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start py-2"
                    onClick={() => handleSelectAsset(asset)}
                  >
                    <div className="text-left">
                      <p className="text-sm text-content">{asset.name}</p>
                      <p className="text-xs text-content-muted">{placeOf(asset)} · {asset.typeName}</p>
                    </div>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
