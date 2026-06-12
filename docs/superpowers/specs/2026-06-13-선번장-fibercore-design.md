# 선번장(OFD Fiber-Core 대장) 설계

**작성일:** 2026-06-13
**범위:** 선번장 슬라이스 1개 (전원계통·접지계통은 후속 슬라이스 — 본 문서 범위 밖)

---

## 1. 목표 (Goal)

원주가 엑셀 *선번장*으로 관리하던 **OFD 광코어 단위 연결 대장**을 단일 SSOT 위에서 앱 안으로 가져온다.
변전소 스코프의 **그리드 뷰**로 모든 광경로의 코어(점유/빈)와 실무 메타(용도·수용내역·융착/패치·사용여부)를
한눈에 보고, 행을 클릭하면 현황뷰와 **동일한 방식**으로 사이드패널 + 연결탭이 열리고, 평면도에서 경로가
하이라이트된다.

## 2. 확정된 아키텍처 (대화로 합의)

- **UX 골격**: 평면도 = 유일한 시각화 캔버스. 현황·**선번장**·(후속)전원·접지 = SSOT를 보는 **데이터 그리드 렌즈**.
  모든 렌즈가 같은 클릭 동작 → 사이드패널 + 연결탭 → 평면도 하이라이트.
- **핵심 추상 = "허브 + 번호 슬롯 + 점유/빈"**: 랙(기구현, `Asset.slotIndex`), 선번장(OFD코어), (후속)분전반 CB, 접지 단자가
  전부 같은 패턴. 선번장은 이 패턴의 *광(FIBER)* 인스턴스.
- **슬롯 두 가족**: 자산-슬롯(랙·분전반, 점유=자식 Asset, *이미 됨*) / **포트-슬롯**(광코어·접지단자, 점유=Cable).
  선번장 = 포트-슬롯.
- **FiberPath = OFD쌍당 1개**(UUID 정규화, `fiberPath.service.ts:161`), 유지. FiberCore는 그 1개 경로 밑에만 달림.
- **점유는 케이블에서 도출 (드리프트 0)**. 랙 슬롯 그리드를 `module.slotIndex`로 도출하는 것과 동일 패턴.
  - 로컬 측(sideA): 프론트 `usePortStatus`의 `overlayLocalStagedCables`가 워킹카피 effective cables로 이미 도출.
  - 원격 측(sideB): 상대 변전소 데이터라 로컬 워킹카피에 없음 → 백엔드 `buildPortStatuses`가 제공. **유지.**
- **FiberCore = 희소(sparse) 메타 전용 테이블**. 점유는 절대 저장하지 않는다.

## 3. 데이터 모델

### 3.1 신규 테이블: `FiberCore` (희소 메타)

한 광경로의 한 코어가 **사람이 입력한 메타를 가질 때만** 한 행이 생긴다(희소). 점유/빈/sideA·B는 저장하지 않는다.

```prisma
model FiberCore {
  id          String   @id @default(uuid())
  fiberPathId String   @map("fiber_path_id")
  coreNumber  Int      @map("core_number")        // 1..portCount

  purpose       String? @map("purpose") @db.VarChar(50)   // 용도: 통합단말/송변전광/PITR ...
  circuitText   String? @map("circuit_text") @db.VarChar(200) // 수용내역(회선/링명) — v1은 자유 텍스트
  spliceType    String? @map("splice_type") @db.VarChar(10)   // 융착 | 패치 | null
  usageOverride String? @map("usage_override") @db.VarChar(10) // 사용 | 미사용 | null(=점유에서 도출)

  description String?  @db.Text
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  createdById String?  @map("created_by")
  updatedById String?  @map("updated_by")

  fiberPath FiberPath @relation(fields: [fiberPathId], references: [id], onDelete: Cascade)
  createdBy User?     @relation("FiberCoreCreatedBy", fields: [createdById], references: [id])
  updatedBy User?     @relation("FiberCoreUpdatedBy", fields: [updatedById], references: [id])

  @@unique([fiberPathId, coreNumber])
  @@index([fiberPathId])
  @@map("fiber_cores")
}
```

`FiberPath`에 `fiberCores FiberCore[]` 역참조 추가.

**v1 필드 결정**: `purpose · circuitText · spliceType · usageOverride` (+ description). 엑셀의 `측정가능여부 ·
송전선로관리번호 · 송배전선로명 · 사용회사`는 **후속**(필요 시 추가). `수용내역`을 자유 텍스트로 시작하고,
회선/링을 1급 엔티티(`Circuit`)로 올리는 건 후속 슬라이스.

### 3.2 커밋/워킹카피 통합 (SSOT 단일 저장 경로)

FiberCore 편집은 **기존 단일 커밋 경로**(`substationCommit`)를 탄다. fiberPaths 처리와 1:1로 미러:

- `substationCommit.schema.ts`: `fiberCores: collection(fiberCoreCreate, fiberCorePatch)` 추가.
- `substationCommit.service.ts`: fiberCores upsert/delete (tempId 해소는 fiberPathId가 같은 커밋에서 생성될 수 있으므로
  fiberPaths 뒤 순서로).
- 프론트 워킹카피: `overlays.fiberCores` + `useEffectiveFiberCores()` 훅 (`useEffectiveFiberPaths` 패턴 복제).
- 편집 액션: `stageFiberCoreUpsert(fiberPathId, coreNumber, patch)` / `stageFiberCoreDelete`.

## 4. 도출 — 코어 한 행 객체 만들기

점유(도출) + 메타(저장)를 **읽을 때 합쳐** 선번장 한 행을 만든다. 저장은 안 합친다.

```ts
interface FiberCoreRow {
  fiberPathId: string;
  coreNumber: number;
  // 도출(usePortStatus)
  sideA: FiberPortUsage | null;   // 로컬 측 근접 자산 (effective cables)
  sideB: FiberPortUsage | null;   // 원격 측 (백엔드)
  occupied: boolean;              // sideA||sideB
  // 저장(FiberCore, 희소 → 없으면 null/기본)
  purpose: string | null;
  circuitText: string | null;
  spliceType: string | null;
  usage: '사용' | '미사용';        // usageOverride ?? (occupied ? '사용' : '미사용')
}
```

- 한 광경로의 행들 = `portNumber 1..portCount`를 돌며 `usePortStatus`의 `FiberPortStatus`와
  `useEffectiveFiberCores()`(키 `fiberPathId|coreNumber`)를 LEFT JOIN.
- 이 머지 함수가 곧 "buildPortStatuses + 메타"의 프론트판. (백엔드 buildPortStatuses는 sideB 공급용으로 그대로 둠.)

## 5. 뷰 — top-level "연결" → "선번장" 교체

`WorkspacePage.tsx`의 `VIEWS`에서 기존 `connections`(연결) 항목을 **선번장으로 교체**(레이블·키),
렌더 블록을 새 `<FiberRegisterView>`로 교체.

### 5.1 그리드 레이아웃 (NodeStatusView 표 스타일 재사용 — 비즈니스 데이터 그리드)

변전소의 OFD 자산들을 모아, **광경로(상대국)별 섹션** + 코어 행:

```
▸ 원주 ↔ 홍천변전소   (24코어 · 사용 6/24)
  코어  근접자산(sideA)        상대국측(sideB)     용도       수용내역(회선/링)        융착/패치  사용
  ─────────────────────────────────────────────────────────────────────────────────────────
   1    —                    —                  —          —                       패치       미사용
   5    송변전광단말장치       홍천 통합단말        통합단말    원주 GR2링(원주-홍천)     패치       사용 ●
  ...
▸ 원주 ↔ 남원주S/S    (24코어 · 사용 8/24)
  ...
```

- 섹션 헤더 = 광경로(상대국) + 코어수 + 사용/전체. 정렬·접기 가능.
- 빈 코어 행도 표시(선번장의 핵심 = 빈 코어 찾기). 사용 행은 좌측 상태 점/강조.
- 컬럼: 코어#, 근접자산, 상대국측, 용도, 수용내역, 융착/패치, 사용. (밀도는 현황 그리드 기준 재사용)

### 5.2 상호작용 (현황뷰와 동일 메커니즘)

- **사용 코어 행 클릭** → `selectionStore.setSelectedAssetId(sideA.assetId)`(근접 자산) → `StagedEditDetailPanel`
  열리고 **연결탭** 활성 → 그 케이블 trace로 **평면도 하이라이트**(통합 `usePathHighlightStore.startTrace`).
  → 기존 현황뷰 행클릭 경로를 그대로 탐.
- **빈 코어 행 클릭** → 근접 자산이 없으므로 해당 **OFD 자산**을 선택(점유 가능 슬롯 안내). 액션 없음.
- **메타 편집(용도·수용내역·융착·사용override)** → 그리드 인라인 편집 → `stageFiberCoreUpsert` → 단일 커밋 바.
  (점유/연결 편집은 종전대로 **도면(캔버스)에서만** — 선번장 그리드는 점유를 만들지 않는다.)

## 6. 재사용 / 신규

**재사용(그대로):** `WorkspacePage.VIEWS`, `selectionStore`, `StagedEditDetailPanel`+탭, `AssetConnectionsSection`(연결탭),
`usePortStatus`/`overlayLocalStagedCables`, `useEffectiveCables`, 워킹카피 커밋, `usePathHighlightStore`, 백엔드 `buildPortStatuses`.

**신규:** `FiberCore` 모델+마이그레이션 / 커밋 스키마·서비스의 `fiberCores` / 워킹카피 `overlays.fiberCores`+`useEffectiveFiberCores`+stage 액션 /
머지 함수(`buildFiberCoreRows`) / `<FiberRegisterView>` 그리드 컴포넌트 / VIEWS 항목 교체.

## 7. 범위 밖 (후속 슬라이스)

- 전원계통(분전반 CB = fieldTemplate + 도출 그리드), 접지계통(접지함체 단자).
- 회선/링 1급 엔티티 `Circuit`(수용내역·링명·구성형태·중계경로 이름). v1은 `circuitText` 자유 텍스트.
- 엑셀(선번장/광단국현황) → 시드 import.
- 엑셀 잔여 컬럼(측정가능·송전선로관리번호·송배전선로명·사용회사).

## 8. 리뷰 필요 — 기본값으로 잡아둔 결정들

1. **FiberCore v1 필드**를 `purpose·circuitText·spliceType·usageOverride`로 한정 (나머지 엑셀 컬럼은 후속). OK?
2. **메타 편집 위치 = 선번장 그리드 인라인** (연결탭이 아니라). OK?
3. **빈 코어 클릭 = OFD 자산 선택** (무동작 대신). OK?
4. **top-level "연결" 뷰를 선번장으로 교체** (별도 신규 뷰 추가 아님). OK? — 사용자가 "연결뷰→선번장으로 바꾸자"라 함, 확인용.
