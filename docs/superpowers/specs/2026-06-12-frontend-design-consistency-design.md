# 프론트엔드 디자인 일관성 표준안

- **날짜**: 2026-06-12
- **범위**: `frontend/` 전역 — 타이포그래피, hover/active(press)/focus 상태, transition, 정렬 헤더 UX
- **목표**: 여러 에이전트가 따로 만든 화면들의 글씨크기·호버·눌림·애니메이션 비일관성을 단일 토큰/규칙으로 통일

## 1. 배경 / 문제

현재 프론트엔드는 Tailwind CSS(v3.4) + 자체 UI 프리미티브(`components/ui/`) + `index.css`의 CSS 변수 토큰으로 구성. 화면별로 제작 주체가 달라 다음 비일관성이 존재한다.

- **Press(active) 상태가 어디에도 없음** — 클릭 시 눌리는 피드백 부재.
- **Hover가 제각각이고 약함** — 예: `DetailTabs`는 `hover:bg-surface-2/50`(50% 투명)이라 거의 안 보임. 행은 `hover:bg-surface-2`, 헤더는 텍스트 색만 변경, 칩은 배경+텍스트 변경 등 패턴 불일치.
- **Transition 누락** — `CollapsibleSection.tsx:12`는 hover 클래스만 있고 transition 유틸이 없어 즉시 전환. (참고: `transition-colors`는 Tailwind 기본 150ms를 포함하므로 `duration-150` 명시 여부는 시각적 차이 없음 — 코드 일관성 차원에서만 정리.)
- **Focus ring 불일치** — 대부분 `focus-visible:ring-2 ring-primary/40`이나 일부 input은 `focus:ring-1`, scope 불일치.
- **타이포 위계 미정립** — 현황 헤더 `text-xs`(12px) vs 본문 `text-sm`(14px), 의미 기반 규칙 없음.
- **현황 정렬 헤더 UX가 비직관적** — 헤더 글자만 클릭 가능, 정렬 아이콘이 hover 시에만 흐릿하게(opacity-0→100) 나타나 정렬 가능/현재 정렬 상태를 인지하기 어려움.

## 2. 결정 사항 (사용자 승인)

1. **정렬 UX**: 업계 표준 테이블 정렬 패턴 채택.
2. **현황 폰트**: 가독성 우선 — 헤더 12→13px, 본문 14px 유지, 정렬 위계 명확화.
3. **적용 범위**: 전역 토큰화 + 전면 적용 (모든 인터랙티브 컴포넌트).

## 3. 인터랙션 토큰 표준

| 토큰 | 표준 값 | 적용 대상 |
|---|---|---|
| Transition | `transition-colors` (Tailwind 기본 150ms). 모든 인터랙티브 요소에 반드시 부여 | transition 누락 보강 |
| Hover (surface) | `hover:bg-surface-2` (불투명) | 리스트 행, 트리 노드, 탭, 헤더 셀 |
| Hover (text) | `hover:text-content` 동반 | muted 텍스트 버튼 |
| Press (button) | `active:scale-[0.97]` | Button, IconButton, Chip 등 버튼류 |
| Press (surface) | `active:bg-surface-3` (hover보다 한 단계 진함) | 행/노드/탭 등 면 기반 |
| Focus | `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40` (위험 동작은 `ring-danger/40`) | 모든 포커스 가능 요소 |

**신규 토큰**: `--surface-3` (press용, `--surface-2`보다 약간 진한 톤) 1개를 `index.css` + `tailwind.config.js`에 추가. 나머지는 기존 토큰 재사용.

## 4. 타이포그래피 위계 (의미 기반)

| 역할 | 표준 | 변경점 |
|---|---|---|
| 패널/섹션 제목 | `text-base font-semibold` | 유지 |
| 본문·테이블 셀 | `text-sm` (14px) | 유지 |
| 컬럼 헤더·라벨 | `text-[13px] font-medium tracking-wide` | 현황 헤더 12→13px |
| 캡션·카운트·메타 | `text-xs text-content-faint` | 유지 |

## 5. 현황 정렬 헤더 재설계 (표준 테이블 패턴)

대상: `features/assets/components/NodeStatusView.tsx`

- **헤더 셀 전체가 클릭 영역** — `<th>` 안에 full-size 버튼. `cursor-pointer select-none hover:bg-surface-2 active:bg-surface-3 transition-colors`.
- **정렬 아이콘 항상 표시**:
  - 비활성: `ChevronsUpDown`, `text-content-faint` (opacity-0 제거 — 항상 흐리게 보임).
  - 활성 오름차순: `ChevronUp`, `text-content`.
  - 활성 내림차순: `ChevronDown`, `text-content`.
- **활성 컬럼 강조**: 텍스트 `text-content` + `font-semibold` + 셀 배경 `bg-surface-2`.
- **3단계 순환**: 오름차순 → 내림차순 → 해제(정렬 없음). 현재 동작이 2단계면 3단계로 확장.
- 행 높이 `h-12` 유지(이미 여유). 헤더만 13px로 위계 명확화.

## 6. 적용 맵 (전면)

| 컴포넌트 | 변경 |
|---|---|
| `ui/Button.tsx` | `active:scale-[0.97]` press, focus ring 표준화 |
| `ui/IconButton.tsx` | press 추가, 기존 focus/transition 정렬 |
| `ui/Input.tsx` / `ui/Select.tsx` | focus ring 표준(`ring-2 ring-primary/40`) 통일 |
| `ui/Badge.tsx` | 비인터랙티브 — 변경 없음(폰트 위계만 확인) |
| `ui/Card.tsx` | 클릭형 변형 존재 시 hover/press 부여 |
| `DetailTabs.tsx` | hover 강화(`/50` 제거 → 불투명 `bg-surface-2`), active press, focus ring |
| `DetailPanelHeader.tsx` | delete/close 버튼 transition·focus·press 통일 |
| `NodeStatusView.tsx` | 정렬 헤더 재설계(§5) + 헤더 폰트 13px + 행 hover/press 통일 |
| `StatusSummary.tsx` | 칩 active press, hover 패턴 통일 |
| `TreePanel.tsx` | 노드 hover/press/transition 통일 |
| `CollapsibleSection.tsx` | transition 보강(현재 즉시 전환) + hover/press |
| `Modal.tsx` | 닫기/백드롭 인터랙션 통일 |

## 7. 인코딩 방식

- 기존 코드가 inline Tailwind 위주이므로 동일 패턴 유지.
- 반복 조합(press/focus/row-interactive)은 `index.css @layer components`에 helper 2~3개로 정의해 균일성 보장:
  - `.press-btn` → `active:scale-[0.97]`
  - `.row-interactive` → `transition-colors hover:bg-surface-2 active:bg-surface-3`
  - `.focus-ring` → `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40`
- `tailwind.config.js`: `--surface-3` 토큰 매핑 추가(`surface-3`).
- 새 helper는 강제 사용이 아니라, 동일 조합이 3회 이상 반복되는 곳에 우선 적용. 일회성은 inline 유지.

## 8. 비범위 (Out of scope)

- 색상 팔레트/레이아웃/정보구조 변경 없음 (인터랙션·타이포 위계·정렬 UX에 한정).
- 백엔드 변경 없음 (정렬 로직이 클라이언트 측이면 클라이언트만; 서버 정렬이면 동작 유지).
- 무관한 리팩토링 금지.

## 9. 검증 (E2E)

- 사이드패널 탭: hover 시 배경 변화 가시적, 클릭 시 press 피드백, 활성 탭 밑줄 유지.
- 현황 정렬: 헤더 셀 어디를 눌러도 정렬, 정렬 아이콘 항상 보임, 활성 컬럼 강조, 오름→내림→해제 순환.
- 회귀: 기존 기능(정렬 결과, 선택 상태, 패널 전환) 정상.
- 빌드: `npm run build` 타입체크/빌드 통과.
