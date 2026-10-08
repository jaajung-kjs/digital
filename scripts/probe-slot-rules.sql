-- 배포 전 확인 — 접속 설비 슬롯 규칙(core validateState ⑨)을 이미 어긴 줄을 센다.
--
-- 저장 판정(클라이언트·서버의 validateState)은 **닿은 국 전체**를 본다. 그래서 운영 DB 에 이 규칙을 이미 어긴
-- 줄이 하나라도 있으면, 그 국을 건드리는 저장은 (그 줄과 상관없어도) 모두 막힌다. 배포 전에 0 줄인지 본다.
-- 0 줄이 아니면 배포하기 전에 그 광선로의 슬롯·시작번호를 고친다(선번장).
--
--   podman exec -i ict-twin-postgres psql -U postgres -d digital_next < scripts/probe-slot-rules.sql
--
-- 규칙(packages/core/src/model/validate.ts ⑨와 같다):
--   LINE_SLOT_RANGE   — 광선로 끝의 슬롯 번호가 접속 설비의 슬롯 수(panelCount)를 넘는다.
--   LINE_SLOT_OVERLAP — 같은 설비·같은 슬롯에서 두 광선로의 어댑터 범위(시작번호 … 시작번호+코어 수−1)가 겹친다.
-- 읽기만 한다.

WITH ends AS (
  SELECT l.id AS line_id, COALESCE(l.name, l.id) AS line_name, l."coreCount" AS cores,
         l."aEquipmentId" AS eq_id, l."aPanel" AS panel, l."aStartNo" AS start_no
    FROM "FiberLine" l WHERE l."aEquipmentId" IS NOT NULL AND l."aPanel" IS NOT NULL
  UNION ALL
  SELECT l.id, COALESCE(l.name, l.id), l."coreCount", l."bEquipmentId", l."bPanel", l."bStartNo"
    FROM "FiberLine" l WHERE l."bEquipmentId" IS NOT NULL AND l."bPanel" IS NOT NULL
)
SELECT 'LINE_SLOT_RANGE' AS rule, s.name AS substation, e.name AS equipment, en.panel AS slot,
       format('슬롯 수 %s', e."panelCount") AS detail, en.line_name AS line, NULL::text AS other_line
  FROM ends en
  JOIN "Equipment" e ON e.id = en.eq_id
  JOIN "Substation" s ON s.id = e."substationId"
 WHERE e."panelCount" IS NOT NULL AND en.panel > e."panelCount"
UNION ALL
SELECT 'LINE_SLOT_OVERLAP', s.name, e.name, x.panel,
       format('%s–%s ↔ %s–%s', x.start_no, x.start_no + x.cores - 1, y.start_no, y.start_no + y.cores - 1),
       x.line_name, y.line_name
  FROM ends x
  JOIN ends y ON y.eq_id = x.eq_id AND y.panel = x.panel AND x.line_id < y.line_id
             AND x.start_no <= y.start_no + y.cores - 1 AND y.start_no <= x.start_no + x.cores - 1
  JOIN "Equipment" e ON e.id = x.eq_id
  JOIN "Substation" s ON s.id = e."substationId"
ORDER BY 1, 2, 3, 4;
