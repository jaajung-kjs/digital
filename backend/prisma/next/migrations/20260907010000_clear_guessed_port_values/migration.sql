-- 포트가 생길 때 실리던 **추측값**을 비운다.
--
-- 갈래의 예사 전압을 포트 생성 시점에 저장하고 있었다(`instantiatePorts`). 편했지만 그것은
-- 아무도 확인한 적 없는 값이 자료로 굳는 일이었다 — 강릉 조서에는 「220V 3상」까지만 적혀
-- 있는데 우리가 「1상2선」을 채워 넣으면 화면이 없는 사실을 말한다.
--
-- 이제 안 적힌 것은 안 적힌 채로 두고, 빈자리는 **읽을 때 그 반의 모선에서 물려받는다**
-- (`ValueDef.inherited`). 그러니 이미 들어간 추측값도 함께 비운다 — 실사에서 모선 한 줄만
-- 적으면 그 반의 회로가 다 따라온다.
UPDATE "Port"
SET "fieldValues" = ("fieldValues"::jsonb - 'voltage' - 'wiring')
WHERE medium = 'power' AND ("fieldValues"::jsonb ? 'voltage' OR "fieldValues"::jsonb ? 'wiring');
