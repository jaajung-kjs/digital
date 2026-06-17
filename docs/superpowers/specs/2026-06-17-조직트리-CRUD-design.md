# 조직 트리 CRUD (본부·지사·변전소·층 추가/편집/삭제) 설계

**작성일:** 2026-06-17
**상태:** 설계 승인됨 → 구현 계획

## 1. 목표

좌측 조직 트리에서 **본부·지사·변전소·층을 추가/이름변경/삭제**하는 진입점을 자연스럽게 추가한다. 백엔드 CRUD·`organizationApi`·`organizationStore` 액션은 이미 존재하므로 **UI 배선 + rename 메서드 버그 수정**이 핵심.

## 2. 백엔드 현황 (이미 완비) + 수정 1건

- `organizationApi`에 4계층 create/rename/delete 풀세트 존재. 백엔드 라우트·서비스·zod·cascade 삭제 완비.
- **버그(같이 수정):** `organizationApi.renameSubstation`·`renameFloor`가 `api.patch`로 호출하나 백엔드는 `PUT`만 정의 → 404. → 프론트를 `api.put`으로 정정(백엔드 라우트 변경 없음).
- 편집 필드 확장(변전소 주소·층 층번호)은 update 스키마가 허용할 때만(계획에서 확인; 미허용 시 편집=이름만).

## 3. UX

- **노드 호버 → 우측 `⋯` 케밥 버튼 → 드롭다운**(노드 타입별 액션):
  - 본부: `+ 지사 추가` · `이름 변경` · `삭제`
  - 지사: `+ 변전소 추가` · `이름 변경` · `삭제`
  - 변전소: `+ 층 추가` · `이름 변경` · `삭제`
  - 층: `이름 변경` · `삭제`
- **본부 추가:** 트리 패널 헤더("조직 트리")에 `+` 버튼(상위 노드 없음).
- **추가/편집:** 공용 `Modal` + `Input`. 타입별 필드(§5).
- **삭제:** `confirm()` + cascade 영향 경고 문구(로드된 children 수 있으면 표기).
- 디자인: `text-sm`(입력)/`text-xs`(라벨), 시맨틱 토큰만, 공용 컴포넌트만(일회용 div 금지).

## 4. 컴포넌트 (단위 분리)

- `frontend/src/components/tree/TreeNodeMenu.tsx` — 호버 케밥 드롭다운. props: `node`, 액션 콜백(`onAddChild`/`onRename`/`onDelete`). 노드 타입 → 액션 목록·"+자식" 라벨 매핑. 트리 외부 클릭/Esc로 닫힘.
- `frontend/src/components/tree/OrgNodeModal.tsx` — 추가/편집 공용 모달. props: `mode: 'add'|'edit'`, `nodeType`(추가면 자식 타입, 편집이면 대상 타입), `initial`(편집 prefill), `onSubmit(values)`, `onClose`. 공용 `Modal`/`Input`/`Button` 사용. Enter=확인/Esc=취소, 빈 이름 비활성, 저장 중 disabled, 실패 시 `text-danger` 인라인.
- `frontend/src/components/tree/useOrgNodeCrud.ts` — CRUD 캡슐화 훅. `addChild(parent, values)`, `rename(node, name)`, `remove(node)`, `addHeadquarters(name)`. 내부에서 `organizationApi` 호출 + `organizationStore` 갱신 + React Query 무효화. TreePanel을 비대화하지 않게.
- `frontend/src/components/tree/orgNodeActions.ts` (순수) — `childType(type)` 매핑(hq→branch, branch→substation, substation→floor, floor→null), 액션 목록·라벨. 단위 테스트 대상.
- `TreePanel.tsx` 배선: renderNode에 케밥(`TreeNodeMenu`) + 헤더 `+본부` 버튼 + 모달/확인 상태.
- `organizationApi.ts`: rename 메서드 PATCH→PUT 정정(변전소·층).

## 5. 타입별 자식·필드

| 노드 | 추가 자식 | 추가 API | 추가 필드 | 편집 |
|---|---|---|---|---|
| 본부 | 지사 | `createBranch(hqId,{name})` | 이름 | 이름 |
| 지사 | 변전소 | `createSubstation(branchId,{name,address?})` | 이름(+주소) | 이름(+주소, 허용 시) |
| 변전소 | 층 | `createFloor(subId,{name,floorNumber?})` | 이름(+층번호) | 이름(+층번호, 허용 시) |
| 층 | — | — | — | 이름(+층번호, 허용 시) |
| (헤더) | 본부 | `createHeadquarters({name})` | 이름 | — |

## 6. 데이터 흐름 (즉시 API 반영 — staged 아님)

- **추가:** `create*` 성공 → `fetchChildNodes(parent)` → `setChildren(parentId, children)` + `expandNode(parentId)`. 본부 추가는 `listHeadquarters()` → `setRoots`. 변전소/층 추가 시 관련 RQ(`['substation-floors', subId]`) 무효화.
- **이름변경:** `rename*(id,{name})`(PUT/PATCH) → `renameNode(id,name)`.
- **삭제:** `confirm` 통과 → `delete*(id)` → `removeNode(id)` + 관련 RQ 무효화 + `viewingNodeId===id`면 정리. cascade로 하위는 DB가 자동 삭제(프론트는 removeNode로 서브트리 제거).
- 실패: 모달은 인라인 에러, 삭제는 alert/toast. 낙관적 갱신 대신 API 성공 후 갱신(단순·안전).

## 7. 에러/엣지

- rename PATCH/PUT 불일치 수정(§2).
- 본부 추가 후 루트 재로드 시 기존 펼침/선택 상태 보존(가능하면 setRoots 대신 신규 본부만 append — 구현 시 단순한 쪽 택, 펼침 상태 손실 최소화).
- 삭제 대상이 현재 작업 중 변전소/층이면 선택·라우팅 정리(viewingNodeId/URL).
- 동일 이름 중복은 백엔드 검증에 위임(에러 표시).

## 8. 테스트

- **단위:** `orgNodeActions.childType`·액션목록 매핑, `OrgNodeModal` 타입별 필드 렌더(이름만 vs 이름+주소/층번호), `TreeNodeMenu` 타입별 액션 렌더.
- **빌드/기존:** `npm run build` + `vitest run` 그린. 백엔드 빌드(스키마 확장 시).
- **브라우저 수동:** 본부→지사→변전소→층 각 추가/이름변경/삭제 동작, 삭제 경고, 트리 즉시 반영, 평면도 층 드롭다운 동기화.

## 9. 범위 밖

- 평면도 층 드롭다운은 선택 전용 유지(트리가 층 CRUD 홈).
- 드래그 reorder 기존 그대로.
- 변전소 주소/층 층번호 *편집*은 update 스키마 허용 시에만(아니면 이름만; 백엔드 스키마 확장은 소규모 선택).

## 10. Self-review 메모
- 플레이스홀더 없음. update 스키마 필드 허용 여부는 §2/§9에 "계획에서 확인"으로 명시(추가는 create 스키마가 이미 허용).
- 일관성: `childType`/`useOrgNodeCrud`/`TreeNodeMenu`/`OrgNodeModal` 명칭 통일. 즉시 API 반영(워킹카피 staged와 구분 — 조직 트리는 워킹카피 밖).
