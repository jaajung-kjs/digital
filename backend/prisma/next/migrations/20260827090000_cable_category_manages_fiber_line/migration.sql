-- 이 종류가 광 선로인가(OPGW 처럼 송전선로를 타고 오는 다심 인입).
-- 이름으로 「OPGW」를 찾지 않기 위한 선언 — 이름은 본부마다 다르고 바뀐다.
ALTER TABLE "CableCategory" ADD COLUMN "managesFiberLine" BOOLEAN NOT NULL DEFAULT false;
