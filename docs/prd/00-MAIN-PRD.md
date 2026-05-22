# ICT실 디지털 트윈 시스템 - Product Requirements Document

## 1. 개요

### 1.1 프로젝트 명
**ICT Digital Twin System** (ICT실 설비 디지털 트윈 시스템)

### 1.2 프로젝트 목적
변전소 내 ICT실 설비의 원격 시각화 및 관리 시스템 구축. 관리자는 웹 기반 CAD 스타일 에디터로 설비를 배치/관리하고, 일반 사용자는 직접 방문 없이 설비 현황을 확인할 수 있다.

### 1.3 핵심 가치
- **원격 가시성**: 현장 방문 없이 설비 배치 및 연결 상태 확인
- **정확한 문서화**: 물리적 배선 및 설비 정보의 디지털화
- **유지보수 효율화**: 설비 이력 관리 및 신속한 정보 접근

---

## 2. 시스템 범위

### 2.1 대상 사용자
| 역할 | 설명 | 권한 |
|------|------|------|
| **관리자** | ICT실 설비 관리 담당자 | 모든 편집 기능, 사용자 관리 |
| **일반 사용자** | 설비 현황 조회가 필요한 직원 | 읽기 전용 (뷰어 모드) |

### 2.2 관리 대상
- **변전소**: 약 10개
- **ICT실**: 변전소당 1개 (층 단위)
- **서버 랙**: ICT실당 10~15개 (총 100~150개)
- **설비**: 랙당 평균 10개 (총 ~1,500개)
- **케이블 연결**: AC전원, DC전원, LAN, 광케이블

### 2.3 계층 구조
```
본부 (Headquarters)
└── 지사/직할 (Branch)
    └── 변전소 (Substation)
        └── 층/통신실 (Floor)  ← 층이 곧 도면(캔버스) 단위
            ├── 도면 객체 (Equipment, 5종):
            │   RACK / OFD / DISTRIBUTION / GROUNDING / HVAC
            │   ├── RACK → 랙 모듈 (RackModule)
            │   ├── DISTRIBUTION → 분전반 회로 (DistributionCircuit)
            │   └── OFD → 포트 (Port)
            └── 케이블 연결 (Cable, 다형 endpoint)
                └── 광경로 (FiberPath, OFD↔OFD 단위)
```

---

## 3. 기능 요구사항

### 3.1 기능 목록

| ID | 기능명 | 우선순위 | 상세 PRD |
|----|--------|----------|----------|
| F01 | 인증 시스템 | P0 | [01-AUTH.md](./01-AUTH.md) |
| F02 | 조직/변전소/층 관리 | P0 | [02-SUBSTATION.md](./02-SUBSTATION.md) |
| F03 | 평면도 에디터 | P0 | [03-FLOOR-PLAN-EDITOR.md](./03-FLOOR-PLAN-EDITOR.md) |
| F04 | 랙 상세 에디터 | P0 | [04-RACK-EDITOR.md](./04-RACK-EDITOR.md) |
| F05 | 설비/포트 관리 | P0 | [05-EQUIPMENT-PORT.md](./05-EQUIPMENT-PORT.md) |
| F06 | 배선 관리 | P0 | [06-CABLE-MANAGEMENT.md](./06-CABLE-MANAGEMENT.md) |
| F07 | 뷰어 모드 | P1 | [07-VIEWER-MODE.md](./07-VIEWER-MODE.md) |
| F08 | 이력 관리 | P1 | [08-AUDIT-LOG.md](./08-AUDIT-LOG.md) |
| F09 | 검색 기능 | P2 | 추후 작성 |
| F10 | 데이터 내보내기 | P2 | 추후 작성 |

### 3.2 핵심 기능 요약

#### 평면도 에디터 (CAD 스타일)
- 그리드 기반 캔버스
- DWG/DXF 도면 배경 임포트 (파싱 후 JSON 저장)
- 도면 객체 5종 배치: RACK, OFD, DISTRIBUTION, GROUNDING, HVAC
- 케이블 경로 표시
- 그리드 스냅, 줌/팬, git-like 버전 저장

#### 랙 상세 에디터
- 슬롯 기반 모듈 배치 (RackModule, 12종 카테고리)
- 모듈 단위 케이블 연결
- 랙 사진 첨부 (정면/후면, EquipmentPhoto)

#### 분전반 관리
- 분전반(DISTRIBUTION) 회로 단위 관리 (DistributionCircuit)
- feederName(전원 계통) + branchName(분기) 구조

#### 광경로(OFD) 관리
- OFD 간 FiberPath (24/48 포트) 정의
- 케이블에 fiberPathId + fiberPortNumber로 개별 심선 추적

#### 배선 관리
- 다형 endpoint: Equipment / RackModule / DistributionCircuit
- 케이블 카테고리 16종, BOM 자재 34종
- 케이블 종류(AC/DC/LAN/FIBER/GROUND) 필터링

---

## 4. 비기능 요구사항

### 4.1 성능
| 항목 | 요구사항 |
|------|----------|
| 페이지 로딩 | < 3초 |
| 에디터 렌더링 | 60fps (100개 객체 기준) |
| API 응답 | < 500ms |
| 동시 사용자 | 10명 이하 (단일 편집) |

### 4.2 보안
- HTTPS 통신
- JWT 기반 인증
- 비밀번호 암호화 (bcrypt)
- 권한 기반 접근 제어

### 4.3 가용성
- 사내 클라우드 배포
- Docker 컨테이너 기반
- 데이터 백업 (일 1회)

### 4.4 브라우저 지원
- Chrome 90+
- Edge 90+
- Firefox 90+

---

## 5. 기술 스택

### 5.1 Frontend
| 기술 | 용도 |
|------|------|
| React 18 | UI 프레임워크 |
| TypeScript | 타입 안정성 |
| @xyflow/react | 네트워크 토폴로지 뷰 |
| Zustand | 상태 관리 |
| @tanstack/react-query | 서버 상태 관리 |
| React Router v6 | 라우팅 |
| Axios | HTTP 클라이언트 |
| TailwindCSS | 스타일링 |
| date-fns | 날짜 처리 |

### 5.2 Backend
| 기술 | 용도 |
|------|------|
| Node.js 20 | 런타임 |
| Express | 웹 프레임워크 |
| TypeScript | 타입 안정성 |
| Prisma 5 | ORM |
| JWT (jsonwebtoken) | 인증 토큰 |
| Multer | 파일 업로드 (DWG/DXF, 최대 30MB) |
| Zod | 입력 검증 |
| @mlightcad/libredwg-web | DWG 파싱 |
| bcryptjs | 비밀번호 해시 |

### 5.3 Database
| 기술 | 용도 |
|------|------|
| PostgreSQL 15 | 메인 데이터베이스 |
| JSON 컬럼 | 좌표/경로 데이터 저장 |

### 5.4 Infrastructure
| 기술 | 용도 |
|------|------|
| Docker | 컨테이너화 |
| Docker Compose | 멀티 컨테이너 관리 |
| Nginx | 리버스 프록시 |

---

## 6. 데이터 모델

### 6.1 ERD 개요
```
┌─────────────────┐
│  Headquarters   │  (본부, 15개 시드)
└────────┬────────┘
         │
    ┌────▼────┐
    │ Branch  │  (지사/직할)
    └────┬────┘
         │
  ┌──────▼──────┐
  │ Substation  │  (변전소, code 필드 없음)
  └──────┬──────┘
         │
    ┌────▼────┐
    │  Floor  │  (층 = 도면 캔버스)
    └────┬────┘
         │ (floor_id)
  ┌──────▼──────┐
  │  Equipment  │  (5종: RACK/OFD/DISTRIBUTION/GROUNDING/HVAC)
  └──────┬──────┘
         ├──────────────────────────────────┐
   ┌─────▼─────┐                    ┌───────▼────────┐
   │ RackModule│                    │DistributionCircuit│
   └─────┬─────┘                    └───────┬────────┘
         │                                  │
         └──────────┬───────────────────────┘
                    │ (다형 endpoint: source/target)
              ┌─────▼─────┐
              │   Cable   │──── CableCategory
              └─────┬─────┘
                    │ (fiber_path_id)
              ┌─────▼─────┐
              │ FiberPath │  (OFD A ↔ OFD B)
              └───────────┘

  Equipment(OFD 전용) ──── Port

  ┌─────────┐   ┌──────────────┐   ┌──────────────────┐
  │  User   │   │  AuditLog    │   │ RackModuleCategory│
  └─────────┘   └──────────────┘   └──────────────────┘
  ┌──────────────────┐  ┌───────────────┐  ┌──────────┐
  │  EquipmentPhoto  │  │MaintenanceLog │  │BomMaterial│
  └──────────────────┘  └───────────────┘  └──────────┘
```

### 6.2 주요 테이블
- **headquarters**: 본부 (15개 한전 본부 시드)
- **branches**: 지사/직할 (본부 하위)
- **substations**: 변전소 (Branch 하위, `code` 필드 없음)
- **floors**: 층 = 도면 캔버스 (canvasWidth/Height, gridSize, backgroundDrawing JSON 등 도면 속성 포함)
- **equipment**: 도면 객체 5종 (RACK/OFD/DISTRIBUTION/GROUNDING/HVAC), 2D 좌표 필수
- **rack_modules**: 랙 모듈 (slotIndex/slotSpan 구조, 12종 카테고리)
- **distribution_circuits**: 분전반 회로 (feederName + branchName)
- **ports**: 포트 (OFD 전용, 7종 PortType: AC/DC/LAN/FIBER/CONSOLE/USB/OTHER)
- **cables**: 케이블 (다형 endpoint: Equipment/RackModule/DistributionCircuit 각 side)
- **fiber_paths**: 광경로 (OFD A ↔ OFD B, 24/48 포트)
- **cable_categories**: 케이블 카테고리 (16종 시드)
- **rack_module_categories**: 랙 모듈 카테고리 (12종 시드)
- **rack_presets**: 랙 프리셋
- **bom_materials**: BOM 자재 (34종 시드, parent-child 트리)
- **equipment_photos**: 설비 사진 (front/rear)
- **maintenance_logs**: 유지보수 이력
- **users**: 사용자 (인증 정보, UserRole: ADMIN/VIEWER)
- **refresh_tokens**: 리프레시 토큰
- **audit_logs**: 변경 이력

---

## 7. 화면 구성

### 7.1 화면 목록
| ID | 화면명 | 접근 권한 |
|----|--------|----------|
| S01 | 로그인 | 전체 |
| S02 | 대시보드 (변전소 목록) | 전체 |
| S03 | 층 목록 | 전체 |
| S04 | 평면도 뷰어 | 전체 |
| S05 | 평면도 에디터 | 관리자 |
| S06 | 랙 상세 뷰어 | 전체 |
| S07 | 랙 상세 에디터 | 관리자 |
| S08 | 설비 상세 | 전체 |
| S09 | 이력 조회 | 관리자 |
| S10 | 사용자 관리 | 관리자 |

### 7.2 화면 흐름
```
로그인 → 변전소 목록 → 층 목록 → 평면도
                                    ├── [뷰어] 케이블 필터, 랙 클릭
                                    └── [에디터] 구조물/랙 편집
                                           │
                                           ▼
                                    랙 상세 뷰/에디터
                                           │
                                           ▼
                                    설비/포트 상세
```

---

## 8. 구현 일정 (Phase)

### Phase 1: 기반 구축
- 프로젝트 초기 설정
- DB 스키마 설계
- 인증 시스템
- 변전소/층 CRUD

### Phase 2: 평면도 에디터
- 캔버스 기반 에디터 구현
- 벽/문/창문 드로잉
- 랙 배치 기능
- 저장/불러오기

### Phase 3: 랙 상세 에디터
- U슬롯 그리드
- 설비 배치
- 포트 정의
- 사진 업로드

### Phase 4: 배선 관리
- 케이블 연결 정의
- 경로 표시
- 필터링
- 연결 하이라이트

### Phase 5: 뷰어 & 마무리
- 일반 사용자 뷰어
- 이력 조회
- 테스트
- 배포

---

## 9. 제약 사항

### 9.1 기술적 제약
- 실시간 장비 모니터링 미지원 (정적 문서화 용도)
- 동시 편집 미지원 (단일 사용자 편집)
- 3D 시각화 미지원 (2D만 지원)

### 9.2 운영적 제약
- 사내망 전용 (외부 접속 불가)
- 초기 데이터는 수동 입력 필요

---

## 10. 용어 정의

| 용어 | 설명 |
|------|------|
| **변전소 (Substation)** | 전력 설비가 있는 건물/시설 |
| **ICT실** | 서버/네트워크 장비가 설치된 전산실 |
| **랙 (Rack)** | 서버/네트워크 장비를 장착하는 캐비닛 |
| **U (Unit)** | 랙 높이 단위 (1U = 44.45mm) |
| **포트 (Port)** | 장비의 연결 단자 |
| **케이블 (Cable)** | 장비 간 물리적 연결선 |
| **평면도 (Floor Plan)** | ICT실의 2D 배치도 |
| **정면도 (Front View)** | 랙의 전면 모습 |

---

## 부록

### A. 참조 문서
- [01-AUTH.md](./01-AUTH.md) - 인증 시스템
- [02-SUBSTATION.md](./02-SUBSTATION.md) - 변전소/층 관리
- [03-FLOOR-PLAN-EDITOR.md](./03-FLOOR-PLAN-EDITOR.md) - 평면도 에디터
- [04-RACK-EDITOR.md](./04-RACK-EDITOR.md) - 랙 상세 에디터
- [05-EQUIPMENT-PORT.md](./05-EQUIPMENT-PORT.md) - 설비/포트 관리
- [06-CABLE-MANAGEMENT.md](./06-CABLE-MANAGEMENT.md) - 배선 관리
- [07-VIEWER-MODE.md](./07-VIEWER-MODE.md) - 뷰어 모드
- [08-AUDIT-LOG.md](./08-AUDIT-LOG.md) - 이력 관리

### B. 변경 이력
| 버전 | 일자 | 작성자 | 내용 |
|------|------|--------|------|
| 1.0 | 2024-12-08 | - | 초안 작성 |
| 1.1 | 2026-05-22 | - | 현재 코드 기준 갱신: 계층 구조(본부/지사 추가), 기술 스택(Konva→@xyflow, react-query 추가), 데이터 모델(별도 Rack 테이블→Equipment.kind=RACK, RackModule, DistributionCircuit, FiberPath, 다형 Cable endpoint 반영) |
