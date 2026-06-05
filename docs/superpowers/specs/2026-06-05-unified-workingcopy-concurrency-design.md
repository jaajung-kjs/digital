# Lv1 설계 — 제네릭 워킹카피 엔진 (Unit of Work) + 낙관적 동시성

- 작성일: 2026-06-05 (제네릭 엔진 방향으로 전면 재작성)
- 상태: 설계 승인됨 (구현 계획 작성 전)
- 범위: 대규모 리팩토링의 **토대 수직**. 흩어진 git-like 코드를 **단일 제네릭 Unit-of-Work 엔진**으로 통합하고, 동시 사용자 충돌을 막는 **낙관적 동시성 제어(OCC)** 를 엔진에 내장한다. 에디터·레지스터는 이 엔진의 *인스턴스*가 된다. (가) 패널 수렴·이후 모든 수직이 이 위에 올라간다.

---

## 1. 배경 / 문제

### 1-1. 지금은 git-like가 엔티티마다 손으로 흩어져 있다
- `editorStore`: `localEquipment`/`localCables`/`localRackModules`/`localDistributionCircuits`/`pendingFiberPaths`/`deletedCableIds`/`deletedFiberPathIds`/`pendingUploads`/`pendingLogs`/`stagedBackgroundDrawing` — **엔티티별 overlay 필드**.
- `features/workingCopy/`: `mergeFiberPaths`/`mergeCables`(엔티티별 머지), `resolveCableIds`/`resolveRackModuleIds`/`resolveCircuitIds`(엔티티별 리졸버), `commit.ts`(엔티티별 setQueryData 나열).
- → **새 엔티티 추가 = overlay 필드 + mergeX + resolveX + commit 배선을 또 추가.** (2026-06-02 working-copy 중앙화 spec도 *비목표*로 "generic 구조는 나중에" 라고 부채를 명시.)
- 게다가 **V1 레지스터는 즉시 저장**(`PUT /assets/:id`)이라 워킹카피 밖, git-like 아님. 그리고 동시성 검사가 어디에도 없다 → 동시 편집 시 last-writer-wins 로 조용히 덮어씀.

### 1-2. 업계 표준
- **스테이징·원자 커밋** = **Unit of Work + Identity Map**(Fowler PoEAA; Hibernate Session, EF DbContext.SaveChanges 가 이걸로 동작). 하나의 제네릭 추적기가 신규/수정/삭제를 모아 원자 커밋.
- **동시성** = **낙관적 동시성 제어(OCC)** — version/ETag 토큰 + 불일치 시 412/409 (RFC 7232; ORM `@Version`).
- **saved 캐시** = 정규화 캐시(React Query — 이미 사용).
- (실시간 자동머지=CRDT/OT 는 Lv3, 이번 범위 밖.)

→ 결론: **제네릭 엔진이 곧 업계 표준(Unit of Work + OCC)** 이고, 지금의 per-entity 분산은 그 표준이 풀어주는 ad-hoc 상태다. Lv1 은 이 표준으로 정렬한다.

---

## 2. 목표 / 비목표

### 목표
1. **제네릭 워킹카피 엔진** — 컬렉션을 *descriptor(설명)* 로 등록하면 stage·merge·dirty·idMap·commit·충돌검사가 **자동**. 엔티티 추가 = descriptor 1개, 새 함수 없음.
2. **OCC 내장** — 커밋 시 base 버전(`updatedAt`) 대조, 충돌 1건이라도 있으면 원자적 거부(409) + 충돌 목록.
3. **에디터·레지스터를 엔진 인스턴스로** — 둘 다 같은 엔진, 컬렉션 구성·커밋 transport 만 다름.
4. **충돌 UX** 공용 — 충돌 표시 + "최신 불러오기" 후 재검토·재커밋.
5. 레지스터를 즉시저장 → 스테이징(엔진)으로 전환. 사진·유지보수도 큐 컬렉션으로 스테이징(에디터 패턴).

### 비목표 (Lv2+/후속)
- 사용자별 명명 브랜치·세션 넘는 초안·타인 초안 열람(Lv2).
- CRDT/OT 실시간 자동머지(Lv3), WebSocket 실시간 푸시·잠금.
- 로컬-퍼스트 sync 프레임워크(Replicache/ElectricSQL) 도입 — 엔진 경계만 깨끗이 둬서 *나중에* 가능하게.
- (가) 패널 컴포넌트 수렴 — 이 토대 위 별도 진행.
- 충돌 시 필드 단위 자동 머지 — Lv1 은 항목 단위 거부 + 수동 재검토.

---

## 3. 아키텍처 — 제네릭 엔진

`frontend/src/features/workingCopy/` 를 엔진으로 확장(기존 merge/commit/idMaps/resolvers 흡수·일반화).

### 3.1 CollectionDescriptor — 엔티티 1개의 "설명"
```ts
type CollectionKind = 'delta' | 'queue';

interface CollectionDescriptor<T, Patch = Partial<T>> {
  name: string;                       // 'assets', 'cables', 'fiberPaths', 'photos'...
  kind: CollectionKind;               // delta = create/update/delete + OCC; queue = append-only(사진·이력)
  queryKey: QueryKey;                 // saved 출처 (React Query)
  fetchSaved: () => Promise<T[]>;     // queryClient.fetchQuery 용
  idOf: (t: T) => string;
  versionOf?: (t: T) => string | null;// OCC 토큰(updatedAt). queue 는 없음
  isTemp: (id: string) => boolean;
  applyIdMap?: (t: T, idMap: IdMap) => T;  // tempId 참조 해석(예: cable→equipment)
}
```

### 3.2 Overlay<T> — 한 컬렉션의 스테이징 상태 (제네릭)
```ts
interface Overlay<T, Patch> {
  creates: Map<string, T>;            // tempId → 신규
  updates: Map<string, Patch>;        // id → 누적 패치
  deletes: Set<string>;
  baseVersions: Map<string, string>;  // id → 로드시 versionOf (OCC base)
}
// queue 변형: items: QueueItem[] (append-only)
```

### 3.3 WorkingCopy 인스턴스 — 엔진 본체 (제네릭)
```ts
interface CommitTransport {
  // 인스턴스마다 다름: 엔드포인트 + 직렬화 + 응답파싱
  commit: (payload: WorkingCopyDelta) => Promise<CommitResponse>;
  //   WorkingCopyDelta = { [collection]: { creates, updates(+baseVersion), deletes(+baseVersion) }, queues }
  //   CommitResponse   = { ok:true, idMap, updated:[{collection,id,version}] }
  //                    | { ok:false, conflicts:[{collection,id,name}] }   // 409
}

class WorkingCopy {
  constructor(descriptors: CollectionDescriptor[], transport: CommitTransport, queryClient);
  effective<T>(name): T[];            // 제네릭 merge(saved, overlay) — mergeFiberPaths/mergeCables 대체
  stageCreate(name, item); stageUpdate(name, id, patch); stageDelete(name, id);
  enqueue(name, item);                // queue 컬렉션
  isDirty(): boolean; dirtyCount(): number;
  revert();                           // overlay 폐기
  async commit(): Promise<CommitOutcome>;
  //   1) delta 조립(+baseVersions) → transport.commit
  //   2) 409 → conflicts 반환(overlay 보존)
  //   3) ok → idMap 으로 overlay/queue 참조 해석 → queue 후처리(업로드/로그) →
  //           setQueryData 로 saved 캐시에 effective 미리 박기 → overlay 비우기 →
  //           invalidate → baseVersions 갱신
  conflicts: Conflict[] | null;       // UI 가 구독
}
```
**핵심:** `effective`·`stage*`·`commit`·OCC 는 전부 **제네릭**. 엔티티/컨텍스트가 늘어도 **descriptor·인스턴스만** 추가. mergeX·resolveX·새 store 없음.

### 3.4 인스턴스 구성
- **에디터(층)**: descriptors = [equipment, cables, fiberPaths, rackModules, distCircuits, photos(queue), logs(queue), background(stage)]. transport = `PUT /floors/:id/plan` (현행 reconcile 직렬화 + `baseFloorVersion`).
- **레지스터(변전소)**: descriptors = [assets, photos(queue), logs(queue)]. transport = `POST /substations/:id/assets/commit` (delta 직렬화).

> 두 엔드포인트의 요청 *모양* 은 다르지만(에디터=full-state reconcile, 레지스터=delta), 그 차이는 **transport 한 곳**에 격리된다. 엔진(추적·머지·OCC·idMap)은 공유.

---

## 4. 낙관적 동시성 (OCC) — 엔진·서버 공통

- **토큰**: 엔티티 `updatedAt`(Prisma `@updatedAt`, 스키마 추가 0). 에디터 층은 `Floor.updatedAt`.
- **base 스냅샷**: 워킹카피 로드 시 `versionOf` 를 `baseVersions` 에 저장.
- **커밋 검사(서버, 트랜잭션 내)**: 각 update/delete 대상의 현재 `updatedAt` == base? 아니면 충돌. **1건이라도 충돌 → 전체 롤백 + 409** `{ conflicts:[{collection,id,name}] }`. create 는 base 없음(검사 없음). delete 대상이 이미 없음 → 충돌.
- **서버 헬퍼(공용)**: `assertVersions(tx, model, [{id, base}])` — 모든 커밋 엔드포인트가 재사용. 409 응답 모양 표준화.

---

## 5. 백엔드

- **공용**: `backend/src/services/concurrency.ts` — `assertVersions(tx, delegate, items)` + `ConflictError(conflicts)` → errorHandler 가 409 `{error:'CONFLICT', conflicts}` 로.
- **레지스터 커밋(신규)**: `POST /api/substations/:id/assets/commit` — body `{ creates, updates:[{id,baseVersion,patch}], deletes:[{id,baseVersion}] }`. 트랜잭션: assertVersions → 적용 → `{ idMap, updated:[{id,updatedAt}] }`. 어드민.
- **에디터**: `PUT /floors/:id/plan` 에 `baseFloorVersion`(=로드시 Floor.updatedAt) 추가. reconcile 시작 시 현재 Floor.updatedAt 대조 → 불일치 시 409. (Floor.updatedAt 은 plan 커밋마다 `tx.floor.update` 로 갱신되므로 토큰으로 충분.)

---

## 6. 레지스터 인스턴스 (V1 즉시저장 → 엔진 스테이징)

- V1 의 `onPatch → updateAsset.mutate`(즉시) → **`workingCopy.stageUpdate('assets', id, patch)`**.
- 그리드·상세 패널은 `workingCopy.effective('assets')` 를 렌더. 새 행/삭제/복제 = stageCreate/stageDelete.
- 사진·유지보수 = `enqueue('photos'|'logs', ...)` (큐, 커밋 시 업로드/생성; 신규 자산엔 idMap 으로 realId 해석).
- 상단 바: "미커밋 N건 · [커밋] [되돌리기]". 커밋 = `workingCopy.commit()`.
- saved 출처 = React Query `['substation-assets', subId]` (기존 useSubstationAssets).

---

## 7. 에디터 마이그레이션 (분산 → 엔진 인스턴스)

흩어진 `editorStore` overlay + `mergeX`/`resolveX` 를 엔진 인스턴스로 흡수:
- 각 entity → CollectionDescriptor(equipment/cables/fiberPaths/rackModules/distCircuits/photos/logs/background).
- `mergeFiberPaths`/`mergeCables` → 제네릭 `effective` 로 대체(descriptor 의 idOf/versionOf/applyIdMap 사용).
- `resolveCableIds` 등 → descriptor.applyIdMap 으로.
- `commit.ts` → `WorkingCopy.commit` 로.
- 소비처(`ConnectionOverlay`, `usePortStatus`, network store 등)는 `effective('cables'|'fiberPaths')` 를 읽음.

> 이게 가장 크고 위험한 단계(동작하는 에디터 내부). **마지막 단계로 배치**하고, 그 전까지는 엔진+레지스터+OCC 가 먼저 돌아가게 한다(§11 단계화). 즉 "새 것은 표준 위에서 시작, 에디터는 추적된 마이그레이션으로 합류".

---

## 8. 충돌 UX (공용 컴포넌트)

`workingCopy.conflicts` 구독 → 공용 모달/배너:
- "이 항목을 다른 사용자가 먼저 변경했습니다: ○○, △△"
- **[최신 불러오기]** — 충돌 컬렉션 `invalidate`(saved refetch), overlay 보존, 충돌 항목 하이라이트 → 사용자가 항목별 유지(재커밋)/폐기 결정 → 재커밋.
- 에디터(층 단위): "도면이 다른 사용자에 의해 변경됨 — 최신 불러오기"(현행 DraftRecovery 톤). Lv1 은 수동, 자동머지 없음.

---

## 9. 영향 받는 파일 (개요)

**Frontend (엔진)**
- 신규: `features/workingCopy/engine.ts`(WorkingCopy/Overlay), `descriptor.ts`(타입), `effective.ts`(제네릭 머지)+테스트, `useWorkingCopy.ts`(React 바인딩), 충돌 UX 컴포넌트.
- 수정·흡수: 기존 `merge.ts`/`resolvers.ts`/`idMaps.ts`/`commit.ts` → 엔진으로 일반화.
- 레지스터: `features/assets/workingCopy.ts`(인스턴스 구성=descriptors+transport), `SubstationAssetGrid`/`AssetDetailPanel`(즉시→stage), 미커밋 바.
- 에디터: editorStore overlay → 인스턴스로(§7), 소비처가 effective 사용.

**Backend**
- 신규: `services/concurrency.ts`, `assetCommit.service.ts` + `POST /substations/:id/assets/commit` 라우트/컨트롤러.
- 수정: `floor.service.bulkUpdatePlan`(baseFloorVersion), `floors.routes`(zod), `errorHandler`(CONFLICT 409).

---

## 10. 테스트

- **엔진 순수 TDD(핵심)**: `effective`(saved+overlay 머지: 빈/create/update/delete/혼합), overlay 누적 패치, idMap 적용. → 한 곳을 테스트하면 모든 컬렉션이 커버됨(제네릭의 이점).
- **백엔드**: `assertVersions`(일치→적용/불일치→409 롤백) 단위, 레지스터 배치 커밋 통합, 에디터 plan 409. 2a 라운드트립·V1·자산 테스트 회귀 없음.
- **수동 동시성**: 두 탭 같은 자산 편집 → A 커밋 → B 커밋 409 충돌표시 → 최신 불러오기 → 재커밋 성공(레지스터·에디터 각각).

---

## 11. 구현 단계 (plan 에서 분해)
1. **엔진 코어**(순수 TDD) — descriptor/overlay/effective/commit 골격 + 충돌 타입. 동작 변경 없음.
2. **백엔드 OCC** — concurrency 헬퍼 + 레지스터 배치 커밋 엔드포인트 + 409 표준화(+테스트).
3. **레지스터 인스턴스** — V1 그리드/패널을 엔진 stage 로 전환, 미커밋 바·커밋, 사진·이력 큐.
4. **충돌 UX 공용 컴포넌트** — 레지스터에 먼저 적용.
5. **에디터 인스턴스 마이그레이션**(가장 큼) — editorStore overlay/mergeX/resolveX/commit → 엔진. + baseFloorVersion. 충돌 UX 재사용.
6. **검증·회귀**.

(1~4 로 레지스터가 표준 엔진 위에서 동시안전하게 동작 → 5 에서 에디터 합류 → 분산 청산.)

## 12. 이후
이 엔진 위에서 (가) 패널 수렴(도면·레지스터 같은 패널, onPatch→`workingCopy.stage`), (나) 통합 워크스페이스, V2~V5 수직. Lv2(브랜치)·실시간이 필요해지면 transport/엔진 경계가 sync 프레임워크 도입 지점이 된다.
