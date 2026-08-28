-- 이미 있는 전원 포트 선언에 전압을 한 번 채운다 — 갈래가 정한 예사값으로.
-- (새 DB 는 시드가 채운다. 이미 돌고 있는 DB 는 이 자리에서 채워야 화면이 「—」로 비지 않는다.)
-- 자료로 다른 값이 확인되면 장비 관리의 포트 선언에서 고친다 — 적는 자리는 거기 하나다.
UPDATE "AssetPortTemplate" SET "voltage" = 'AC 220V 1φ' WHERE "variant" = 'AC' AND "voltage" IS NULL;
UPDATE "AssetPortTemplate" SET "voltage" = 'DC 48V'     WHERE "variant" = 'DC' AND "voltage" IS NULL;
