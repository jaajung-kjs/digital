-- 노임 임포트 기록에 남아 있던 `active` 를 내린다.
-- 노임은 판을 갈아 끼우지 않는다 — 값은 LaborRate 가 갖고, 직종마다 가장 최근 행이 쓰인다.
-- 켜진 채로 두면 화면에 「적용 중」이 뜨는데 그 판은 아무것도 정하지 않는다.
UPDATE "LaborStandard" SET "active" = false WHERE "kind" = 'wage';
