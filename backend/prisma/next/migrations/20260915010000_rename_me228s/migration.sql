-- 카드 이름은 `MEZ28S` 가 아니라 **`ME228S`** 다 — 사진의 라벨을 잘못 읽었다.
--
-- 키까지 함께 옮긴다. 이름만 고치면 오타가 식별자로 굳고, 시드는 「없는 키만 만든다」이므로
-- 다음 배포에서 `UT8410-ME228S` 를 **하나 더** 만들어 같은 카드가 품목 둘로 갈린다.
--
-- 시드가 넣은 이름 그대로인 것만 고친다 — 현장에서 따로 붙인 이름은 그 사람 뜻이다.
UPDATE "AssetType"    SET key = 'UT8410-ME228S', name = 'ME228S(서비스 카드)'
 WHERE key = 'UT8410-MEZ28S';

UPDATE "AssemblyItem" SET name = 'ME228S #1' WHERE name = 'MEZ28S #1';
UPDATE "AssemblyItem" SET name = 'ME228S #2' WHERE name = 'MEZ28S #2';

-- 이미 놓인 카드도 함께 — 설비를 다시 놓지 않아도 현황·선번장의 이름이 맞는다.
UPDATE "Asset"        SET name = 'ME228S #1' WHERE name = 'MEZ28S #1';
UPDATE "Asset"        SET name = 'ME228S #2' WHERE name = 'MEZ28S #2';
