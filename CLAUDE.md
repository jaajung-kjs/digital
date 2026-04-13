# 개발 환경 규칙

## 개발 시 (코드 수정/디버깅/기능 개발)
- DB: `docker compose -f docker-compose.dev.yml up -d`
- 서버: `npm run dev` (백엔드 tsx watch + 프론트 Vite HMR)
- 절대 `docker compose build`, `docker compose up` (기본 docker-compose.yml)을 개발 중에 사용하지 않는다
- 코드 변경 확인은 dev 서버의 자동 반영(HMR/watch)으로 한다

## 프로덕션 배포 시에만
- `docker compose up --build` 사용 (기본 docker-compose.yml)
- 사용자가 명시적으로 "배포", "프로덕션", "docker 빌드" 요청할 때만

## 빌드 확인이 필요할 때
- `npm run build` 로 로컬에서 타입체크 + 빌드 검증
- Docker 이미지 빌드는 하지 않는다
