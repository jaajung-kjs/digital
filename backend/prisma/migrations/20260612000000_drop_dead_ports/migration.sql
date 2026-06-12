-- Port 개념은 fiberPath 에서 파생(fiberPortNumber)으로만 쓰이고 ports 테이블은 미사용(0행, 프론트 호출/FK 참조 없음).
-- 자산 소유 기록 자동 인식(스키마-구동)에서 연결점(Port)을 기록과 혼동하지 않도록 죽은 테이블/타입 제거.
DROP TABLE IF EXISTS "ports";
DROP TYPE IF EXISTS "PortType";
