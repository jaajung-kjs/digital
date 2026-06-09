# UI 리팩토링 ②C — IA 정리 번들 (중앙카드 제거 · 현황 통합 · 인스펙터 간소화) 설계

- 작성일: 2026-06-05
- 상태: 설계 승인됨 (구현 계획 전)
- 범위: UI 리팩토링의 ②C. 분산된 진입점·정보를 정리한다 — (C1) 중복 중앙 카드 브라우저 제거 + 좌 트리 단일 네비, (C2) 개요+표를 한 "현황" 뷰로 통합, (C3) 인스펙터 간소화(progressive disclosure). "연결→계통도"(C4)는 별도.

---

## 1. 배경 / 문제

사용자 지적(전부 업계표준 부합):
- 좌 트리 + **중앙 카드(TreeVisualization)** = 계층 브라우저 *2개* 중복. 업계표준은 트리 1개=네비, 메인=콘텐츠.
- **개요와 표가 같은 역할** — 깔끔한 개요만으로 현황 파악되면 별도 "표" 탭 불필요.
- **인스펙터 과밀** — 식별·속성·생애주기·사진·유지보수·연결을 한 번에 = 복잡. 핵심 먼저, 나머지 접기 필요.

업계 표준(netTerrain·DCIM·EAM): 트리 1개(좌) → 메인 = 선택 노드 콘텐츠(소수 뷰), 우 = 초점화된 인스펙터(progressive disclosure).

## 2. 목표 / 비목표

### 목표
1. **C1**: `TreeVisualization`(중앙 카드) 제거 + 홈 메인 = 선택 컨테이너 개요. 좌 트리가 단일 네비.
2. **C2**: 워크스페이스 `[개요][표]` → **`[현황]`** 하나(상단 요약 개수 + 자산 리스트). 기본 진입 = 현황.
3. **C3**: `AssetInspector` 간소화 — 핵심(식별·속성·생애주기) 먼저, 사진·유지보수·연결은 **접이식 섹션**(기본 접힘).

### 비목표 (후속)
- **C4 연결→계통도**(전원·접지 SLD + 토폴로지 자동생성) — 별도, 최대 작업. 이 번들에선 "연결" 뷰 라벨·내용 유지.
- 브레드크럼이 컨테이너(본부/지사) viewingNode 반영 — ③.
- 인스펙터를 패널 외 형태(모달/페이지)로 — 패널 유지(밀도만 개선).
- 요약 칩 클릭→리스트 필터 — 후속(nice-to-have).

## 3. 설계

### C1 — 중앙 카드 제거 + 트리 단일 네비
`pages/TreePage.tsx`(홈 `/`, AppShell 메인):
- `TreeVisualization` **제거**(파일 잔존, 미import). 자식 탐색은 좌 트리(TreePanel)로.
- 메인 = `viewingNode`(컨테이너)면 `<OverviewView nodeType nodeId />`, 없거나 floor면 안내("좌측 트리에서 변전소를 선택하세요").
- (변전소 클릭 → 워크스페이스, 층 → 평면도 는 기존 트리 네비 그대로.)

### C2 — 개요+표 → "현황" 뷰
신규 `features/assets/components/SubstationStatusView.tsx`:
- **상단 요약**: `useNodeStats('substation', substationId)` 의 `byCategory` 를 **개수 칩**(총계 + 종류별)으로 compact 표시. (드릴은 생략 — 칩만.)
- **아래 리스트**: 기존 `<SubstationAssetGrid substationId />`(자산 표 + 편집·커밋·필터·내보내기 + 우측 인스펙터). 그대로 임베드.
- = 한 뷰에서 "한눈 요약 + 상세 리스트".

`pages/SubstationWorkspacePage.tsx`:
- VIEWS: `[개요][표][배치도][연결]` → **`[현황][평면도][연결]`**.
  - `{ key: 'status', label: '현황' }`(=SubstationStatusView), `{ key: 'plan', label: '평면도' }`(배치도 리네임), `{ key: 'connections', label: '연결' }`.
  - `register`/`overview` 키 제거. 기본 진입 = `status`.
- 뷰 해석: `view = rawView==='plan' ? 'plan' : rawView==='connections' ? 'connections' : 'status'`. (legacy `?view=register|overview|tab=` → status 로 흡수. `gotoRegister` 는 `?view=status` 로 변경.)
- 본문: `view==='status' ? <SubstationStatusView substationId /> : view==='plan' ? <편집기> : <SubstationConnectionsView/>`.
- `gotoRegister(assetId)` → `?view=status&assetId=...`(현황으로). `gotoFloor` 그대로.

### C3 — 인스펙터 간소화 (progressive disclosure)
`features/assets/components/AssetInspector.tsx`:
- **항상 표시(핵심 현황)**: 식별(이름·종류·상태·담당자·설치일) + 속성(fieldTemplate) + 생애주기(+알림). = 그 설비의 실제 현황.
- **접이식 섹션(기본 접힘)**: 사진 / 유지보수 / 연결. 각 헤더(제목 + 개수 배지 + ▸/▾) 클릭으로 펼침.
- 작은 `CollapsibleSection`(헤더 + 토글 + 본문) 헬퍼 신규. edit/view 모드 무관(둘 다 적용).
- 밀도↓: 처음 보이는 건 핵심 현황, 사진·유지보수·연결은 필요 시 펼침.

## 4. 영향 받는 파일
**신규**: `features/assets/components/SubstationStatusView.tsx`, `components/CollapsibleSection.tsx`(또는 인스펙터 내부)
**수정**: `pages/TreePage.tsx`(TreeVisualization 제거 + OverviewView), `pages/SubstationWorkspacePage.tsx`(VIEWS 재편·status 기본·gotoRegister), `features/assets/components/AssetInspector.tsx`(접이식)
**미사용화**: `components/tree/TreeVisualization.tsx`(미import, 파일 잔존)

## 5. 테스트
- **RTL**: `SubstationStatusView`(요약 칩 + 그리드 렌더), `CollapsibleSection`(토글), `AssetInspector`(사진/유지보수/연결 기본 접힘, 핵심 표시).
- **수동(dev)**: ① 홈 `/` 중앙 카드 사라지고 좌 트리로만 탐색, 컨테이너 선택 시 메인 개요. ② 변전소 워크스페이스 = `[현황][평면도][연결]`, 현황 기본(요약 칩 + 자산 리스트). ③ 현황에서 자산 편집·커밋·필터·내보내기 정상(그리드 기능 유지). ④ 인스펙터 = 핵심 먼저 + 사진·유지보수·연결 접힘(펼치면 동작). ⑤ 평면도·연결·도면 점프·공유선택 회귀 없음.

## 6. 성공 기준
1. 중앙 카드 제거 — 좌 트리가 단일 네비, 홈 메인 = 개요.
2. 워크스페이스 = `[현황][평면도][연결]`, 현황 = 요약+리스트 한 뷰(표 탭 제거).
3. 인스펙터 핵심 먼저 + 사진·유지보수·연결 접이식(밀도↓).
4. 기존 그리드 기능(편집·커밋·필터)·평면도·연결·공유선택 회귀 없음.

## 7. 이후
- **C4 연결→계통도**: 전원계통도·접지계통도 SLD + 네트워크 토폴로지 자동생성(연결 모델 기반 = 원래 단계 C). 최대 시각 가치.
- ③ 글로벌 검색, 브레드크럼 컨테이너 반영.
