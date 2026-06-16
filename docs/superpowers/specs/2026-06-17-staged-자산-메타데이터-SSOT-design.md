# Staged 자산 메타데이터 SSOT 완전화 설계 (A)

**작성일:** 2026-06-17
**상태:** 설계 승인 대기 → 구현 계획
**범위:** A만 — "저장 전 staged 변경이 트레이스-그래프 파생 UI에 반영되지 않는" 버그 계열의 근본 수정. (B = 분산 함수 통합은 별도 스펙.)

## 1. 목표

워킹카피(SSOT) → 트레이스 그래프 다리에서 누락되는 staged 자산 메타데이터를 채워, **저장 전에도 staged 자산의 이름·변전소명·부모·종류가 모든 파생 UI에 반영**되게 한다. 휴리스틱 패치가 아니라 단일 지점(`buildTraceGraph`)에서 누락을 제거해 버그 계열 전체를 없앤다.

대표 증상(이 수정으로 해소되어야 함):
- 경로슬롯(conduit) 이름이 저장 전 "자국 - 대국 #포트번호"로 안 뜸.
- 피더(분전반) 정보탭 파생 GUI가 저장 전 불완전.

## 2. 근본 원인 (확정)

`frontend/src/features/trace/traceGraph.ts` `buildTraceGraph`:
- 자산 파생 맵(`nameById`/`subNameById`/`subById`/`parentById`/`codeById`)을 **`slimAssets`(저장된 전역 쿼리 `['assets-slim']`)에서만** 채운다 (라인 104-118).
- staged-create 자산 루프(라인 122-129)는 `nameById`/`parentById`/`codeById`/`connectionKind`만 채우고 **`subById`·`subNameById`는 안 채운다.**
- 이유(코드 주석 119-121): `effectiveAssets()`가 반환하는 `Asset`에 `substationName`이 없음(`types/asset.ts`엔 `substationId`만). `SlimAssetDTO`만 `substationName` 보유.

결과: 저장(→ `['assets-slim']`·`['cables']` 리페치) 전까지 staged-create 자산의 `subNameById`가 비어, 그걸 읽는 모든 파생(슬롯 자국/대국명, 피더 회로 대국명 등)이 불완전. 저장 후 slim 피드에 substationName이 실려 정상화 → "저장 전엔 안 됨" 패턴.

소비처(읽기 전용, 자동 수혜): `fiberSlotLabel`(fiberSlotLabel.ts), `remoteSlotSubstation`(traceGraph.ts:149), `SlotPortsPanel`/`buildSlotPorts`, `buildSlotCoreRows`, `FeederCircuitsPanel`/`buildFeederCircuits`, `connectionDiagram`, `AssetConnectionsSection`.

## 3. 설계

**원칙:** staged 자산은 전부 현재 로드된 변전소 소속(`useSubstationWorkingCopy.substationId`)이고, `Asset`은 `substationId`를 들고 있다. 그래프 빌드 시 이 `substationId`를 그래프에 흘리고, id→변전소명 맵으로 `subNameById`를 채운다.

### 3.1 `buildTraceGraph` 변경 (frontend/src/features/trace/traceGraph.ts)
1. staged 자산 파라미터 타입(라인 80)에 `substationId?: string | null` 추가. (호출측이 넘기는 `effectiveAssets()`는 full `Asset`이라 이미 보유.)
2. 새 옵션 파라미터 `currentSubName?: string | null` 추가 — slim에 없는 변전소(예: 커밋 자산이 0개인 새 변전소)용 fallback 이름.
3. slim 루프에서 **변전소 id→이름 맵** `subNameByStationId: Map<string,string>` 구성: 각 slim 자산의 `(substationId → substationName)`. (이미 `subNameById`(자산 id 기준)와 별개로 변전소 기준 맵.)
4. staged-create 루프(122-129)에 추가:
   ```ts
   const subId = (a as { substationId?: string | null }).substationId ?? null;
   if (subId) {
     if (!subById.has(a.id)) subById.set(a.id, subId);
     if (!subNameById.has(a.id)) {
       const sname = subNameByStationId.get(subId) ?? currentSubName ?? null;
       if (sname) subNameById.set(a.id, sname);
     }
   }
   ```
   (기존 nameById/parentById/codeById/connectionKind 설정은 유지.)

### 3.2 `useTraceGraph` 변경 (같은 파일, 훅)
- 현재 변전소 이름을 조직 트리에서 해소해 `currentSubName`으로 넘긴다:
  ```ts
  const subId = useSubstationWorkingCopy((s) => s.substationId);
  const currentSubName = useOrganizationStore((s) => (subId ? findNodeName(s.roots, subId) : null));
  // buildTraceGraph({ ..., currentSubName })
  ```
  - 조직 스토어에서 노드 이름을 찾는 접근자(`findNode`/트리 탐색)가 이미 있으면 그걸 쓰고, 없으면 작은 순수 헬퍼로 트리에서 id 매칭 이름을 반환. (slim-derived 맵이 1차, currentSubName은 fallback이라 새 변전소·커밋 0개일 때만 쓰임.)

### 3.3 `pathHighlightStore.loadProjection` (동일 buildTraceGraph 호출처)
- `loadProjection`도 `buildTraceGraph`를 호출(traceGraph 입력). staged 자산에 `substationId`가 자동 포함되므로 `subById`/`subNameById`가 채워짐. `currentSubName` fallback은 비-React 컨텍스트라 생략 가능(또는 `useSubstationWorkingCopy.getState()` + org store getState로 동일하게 전달). 토폴로지 모달 데이터에도 동일 수혜.

## 4. 버그별 귀결

- **버그 2 (슬롯 이름):** staged 슬롯/OFD의 `subNameById`가 채워져 `fiberSlotLabel`/`remoteSlotSubstation`/`SlotPortsPanel.label`이 자국·대국명을 저장 전에도 정상 표기.
- **버그 1 (피더 정보탭):** 피더/회로 대국명이 `subNameById`로 채워져 파생 GUI가 완전해짐. **단, 구현 계획에서 브라우저로 버그1을 실제 검증**한다. 만약 메타데이터와 무관한 별도 게이팅(예: staged DIST 자산의 `resolveAssetDetailKind`/정보탭 분배 섹션 노출 조건)이 남으면, 그 게이팅을 추가로 정밀 수정한다(계획의 검증 단계에서 분기).

## 5. 비목표 (이 스펙 밖)
- B: 분산 함수 통합(이름 해소 단일화, buildSlotPorts/buildSlotCoreRows 통합, roleAt/other 공용화, 로컬 kindOf 제거) — 별도 스펙/계획.
- `Asset` 타입/백엔드 DTO에 `substationName` 추가(불필요 — substationId + id→name 맵으로 해결).

## 6. 테스트 전략
- **단위 테스트(`traceGraph` )**: `buildTraceGraph`에 staged-create 자산(substationId 보유) + 같은 substationId의 slim 자산(substationName 보유)을 주면 staged 자산의 `subById`·`subNameById`가 채워지는지. slim에 없고 `currentSubName`만 줄 때 fallback으로 채워지는지. 기존 동작(커밋 자산) 회귀 없는지.
- **빌드/기존 테스트**: `npm run build` 타입체크 + `vitest run` 그린.
- **브라우저 수동 검증**: (a) 새 경로슬롯/OPGW staged 직후 슬롯 이름이 "자국 - 대국 #번호"로 즉시 표기. (b) 피더 정보탭 파생 GUI가 저장 전 완전. (c) 저장 후에도 동일(회귀 없음).

## 7. 리스크
- `currentSubName` 트리 탐색이 큰 트리에서 매 렌더 비용 → `useOrganizationStore` 셀렉터 + (필요시) 메모이즈로 최소화.
- staged-UPDATE(커밋 자산 수정)는 slim 루프가 처리하며 substationName은 slim에서 오므로 변동 없음(자산의 변전소는 안 바뀜).
- cross-substation staged 자산은 워킹카피가 변전소 단위라 발생하지 않음(staged는 항상 현재 변전소).

## 8. Self-review 메모
- 플레이스홀더 없음. `findNodeName`/org 접근자는 "이미 있으면 사용, 없으면 순수 헬퍼"로 구현 시 확정(계획에서 정확 경로 지정).
- 일관성: `subById`(=substationId), `subNameById`(=변전소명), `subNameByStationId`(변전소id→명, 신규 내부 맵) 명칭 구분 명확.
