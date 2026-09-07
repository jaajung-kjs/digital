-- 전압에서 **상(φ)을 떼어** 제 칸으로 옮긴다.
--
-- 한 값으로 묶어 두는 동안 두 가지를 적을 수 없었다: 3φ 가 3상3선인지 3상4선인지, 그리고
-- 현장에서 가장 흔한 3상4선 380/220V(선간 380·상전압 220 을 한 값으로 못 쓴다).
-- 이제 전압은 전압만, 상·선식은 `wiring` 이다(교류 갈래에만 있는 칸).
--
-- 이미 적혀 있던 값은 뜻이 정해져 있으므로 그대로 옮긴다. 3φ 는 **3상4선**으로 읽는다 —
-- 국내 저압 배전의 3상은 3상4선이 표준이고, 아니라면 화면에서 고친다.
UPDATE "Port"
SET "fieldValues" = jsonb_set(
      jsonb_set("fieldValues"::jsonb, '{voltage}', to_jsonb(split_part("fieldValues"::jsonb->>'voltage', ' ', 1) || ' ' || split_part("fieldValues"::jsonb->>'voltage', ' ', 2))),
      '{wiring}',
      to_jsonb(CASE WHEN "fieldValues"::jsonb->>'voltage' LIKE '%3φ' THEN '3상4선' ELSE '1상2선' END)
    )
WHERE medium = 'power' AND "fieldValues"::jsonb->>'voltage' LIKE 'AC %φ';
