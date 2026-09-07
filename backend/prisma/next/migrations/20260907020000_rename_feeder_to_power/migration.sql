-- 「피더」를 「전원」으로 — 자료가 부르는 대로.
--
-- `FEEDER` 는 사내 자료에도 나오지만(강릉 조서 17회) 거기서는 「2층 AC FEEDER PANEL」처럼
-- **먹이는 판(盤)**을 가리키는 말이지, 분전반 안의 계통별 부스바가 아니다. 자료는 그
-- 덩어리를 **무엇을 나르는가로** 부른다 — SCADA 조서의 칸 이름이 「상용전원」·「UPS #1」이고
-- 강릉은 「DC 48V #1」이다. 유형을 가리키는 낱말(피더·모선·계통)은 아예 쓰지 않는다.
--
-- 시드는 「있는 키는 안 건드린다」이므로 이미 돌고 있는 DB 는 여기서 옮긴다.
-- 이름만 바뀐다 — 키·배선·값은 그대로다.
UPDATE "AssetType"    SET name = 'AC 전원'  WHERE key = 'AC-FEEDER' AND name = 'AC 피더';
UPDATE "AssetType"    SET name = 'DC 전원'  WHERE key = 'DC-FEEDER' AND name = 'DC 피더';

UPDATE "AssemblyItem" SET name = '상용전원' WHERE name = '상용 피더';
UPDATE "AssemblyItem" SET name = 'UPS 전원' WHERE name = 'UPS 피더';
UPDATE "AssemblyItem" SET name = '직류전원' WHERE name = '직류 피더';
UPDATE "AssemblyItem" SET name = '소내전원' WHERE name = '소내 피더';

-- 놓인 장비도 함께 — 현장에서 따로 고쳐 둔 이름은 건드리지 않는다(정확히 옛 이름일 때만).
UPDATE "Asset" SET name = '상용전원' WHERE name = '상용 피더';
UPDATE "Asset" SET name = 'UPS 전원' WHERE name = 'UPS 피더';
UPDATE "Asset" SET name = '직류전원' WHERE name = '직류 피더';
UPDATE "Asset" SET name = '소내전원' WHERE name = '소내 피더';
