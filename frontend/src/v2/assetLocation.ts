import { cellLabel } from '@twin/core';
import type { V2Asset } from './types';

/**
 * 자산이 어디에 있는가 — 층부터 슬롯까지 전체 경로.
 *
 * 예전에는 **바로 위 한 단계만** 적었다. 랙 안의 장비는 `전원랙 A · 슬롯 3` 이라고만 나와서
 * 그 랙이 몇 층인지 알 수 없었고, 두 단계 이상 중첩되면 층 정보가 완전히 사라졌다.
 * 상위를 끝까지 거슬러 올라가 `1층 · 전원랙 A · 슬롯 3` 으로 적는다.
 *
 * 같은 계산이 현황표와 상세 패널에 각각 복제돼 있었다(한쪽만 고치면 두 화면이 달라진다).
 * 여기 한 곳에 둔다.
 *
 * 격자 안의 자리는 **행·열**로 적는다 — 좌표를 번호 하나로 접지 않는다.
 */
export function assetLocationPath(
  asset: V2Asset,
  assetById: Map<string, V2Asset>,
  floorNameById: Map<string, string>,
): string {
  const parts: string[] = [];
  let cur: V2Asset | undefined = asset;
  const seen = new Set<string>(); // 데이터가 순환해도 멈추게 한다

  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.floorId != null) {
      parts.unshift(floorNameById.get(cur.floorId) ?? '—');
      break;
    }
    if (cur.parentAssetId == null) {
      // 층에도, 상위 자산에도 붙어 있지 않다.
      if (cur === asset) return '미배치';
      break;
    }
    const parent: V2Asset | undefined = assetById.get(cur.parentAssetId);
    /* 자리는 "그 상위의 어느 칸인가" 이므로 상위 이름 뒤에 붙인다. 칸은 **행·열로 말한다** —
       예전에는 `row × cols + col + 1` 로 접어 「자리 4」라고 불렀는데, 도화지 좌표에 이름을
       붙인 것일 뿐이라 도화지가 촘촘해지면 뜻이 없어진다. */
    const slot =
      cur.col != null && cur.row != null
        ? ` · ${cellLabel(cur.col, cur.row)}`
        : '';
    parts.unshift(`${parent?.name ?? '—'}${slot}`);
    cur = parent;
  }

  return parts.length > 0 ? parts.join(' · ') : '미배치';
}
