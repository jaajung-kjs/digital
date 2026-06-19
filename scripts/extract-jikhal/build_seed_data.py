"""병합 → 최종 시드 JSON 3종 (backend/prisma/seed/data/jikhal/).

규칙(사용자 확정):
  - 실제 DB에 있는 변전소(직할 13)끼리만 연결. 외부/비변전소(강원D/D·사택계·홍천 등) 슬롯·코어 제외.
  - 슬롯 = 한 변전소 입장의 케이블 1가닥(상대국+코어수). 직할쌍은 양측 슬롯을 OPGW 로 연결.
  - 송광치 코어만 송변전광단말장치(OPT-TERM)에 연결, 나머지는 OFD 에(메타전용).
  - 임시 배치: 컨테이너(OFD·RACK)는 60×60 으로 도면에 배치, 그 자식(슬롯·장치)은 slotIndex.
    OFD(60×60) 안에 경로슬롯, RACK(60×60) 안에 송변전광단말장치.
"""
import json
import os
import re
import collections
from normalize import DIRECT, is_direct, pair_key

OUT = os.path.join(os.path.dirname(__file__), "out")
DST = os.path.join(os.path.dirname(__file__), "..", "..", "backend", "prisma", "seed", "data", "jikhal")
BOX = 60  # 임시 배치 컨테이너 크기


def clean(s):
    return re.sub(r"\s+", " ", (s or "").replace("\n", " ")).strip()


def cable_idx(peer_raw):
    m = re.search(r"#(\d+)", peer_raw or "")
    return int(m.group(1)) if m else 0


def slot_key(sub, block):
    return f"slot-{sub}-b{block}"


def main():
    os.makedirs(DST, exist_ok=True)
    cores = json.load(open(os.path.join(OUT, "ofd_cores.json")))
    blocks = json.load(open(os.path.join(OUT, "ofd_blocks.json")))

    # ── 직할 13 끼리만 ──
    blocks = [b for b in blocks if is_direct(b["peerKey"])]
    keep = {(b["subKey"], b["block"]) for b in blocks}
    cores = [c for c in cores if (c["subKey"], c["block"]) in keep]

    subs = [{"key": k, "name": v, "isExternal": False} for k, v in DIRECT.items()]

    # ── assets: OFD(60×60) + RACK(60×60) + 슬롯(slotIndex) + 송변전광단말(slotIndex) ──
    assets = []
    for k in DIRECT:
        assets.append({"key": f"ofd-{k}", "subKey": k, "typeCode": "OFD", "name": "OFD",
                       "parentKey": None, "attributes": {}, "posX": 200, "posY": 200, "w": BOX, "h": BOX})
        assets.append({"key": f"rack-{k}", "subKey": k, "typeCode": "RACK", "name": "통신랙",
                       "parentKey": None, "attributes": {}, "posX": 320, "posY": 200, "w": BOX, "h": BOX})
    slot_i = collections.defaultdict(int)
    for b in blocks:
        si = slot_i[b["subKey"]]; slot_i[b["subKey"]] += 1
        peer = clean(b["peerRaw"])
        assets.append({"key": slot_key(b["subKey"], b["block"]), "subKey": b["subKey"], "typeCode": "OFD-SLOT",
                       "name": f"{peer} ({b['cores']}C)", "parentKey": f"ofd-{b['subKey']}",
                       "attributes": {"cores": b["cores"]}, "slotIndex": si})
    # 송변전광단말장치 — 송광치 코어 있는 국소에만, 랙 안 slotIndex 0
    dev_subs = sorted({c["subKey"] for c in cores if c["purpose"] == "송광치"})
    dev_by_sub = {}
    for sub in dev_subs:
        key = f"dev-OPT-TERM-{sub}"
        assets.append({"key": key, "subKey": sub, "typeCode": "OPT-TERM", "name": "송변전광단말장치",
                       "parentKey": f"rack-{sub}", "attributes": {}, "slotIndex": 0})
        dev_by_sub[sub] = key

    # ── fiberCables: OUT 코어 ──
    cables = []
    for c in cores:
        sub, blk = c["subKey"], c["block"]
        tgt = dev_by_sub[sub] if (c["purpose"] == "송광치" and sub in dev_by_sub) else f"ofd-{sub}"
        sp = {kk: c[kk] for kk in ("purpose", "circuitText", "spliceType", "usageOverride",
                                   "loss1310", "loss1550", "dist1310", "dist1550", "inspectResult")
              if c.get(kk) is not None}
        sp["peer"] = clean(c["peerRaw"])
        cables.append({"key": f"core-{sub}-b{blk}-{c['core']}", "kind": "CORE",
                       "sourceKey": slot_key(sub, blk), "targetKey": tgt, "sourceRole": "OUT", "targetRole": None,
                       "number": c["core"], "categoryCode": "CBL-OPJ", "specParams": sp})

    # ── fiberCables: OPGW (직할쌍 슬롯↔슬롯) ──
    by_dir = collections.defaultdict(list)
    for b in blocks:
        by_dir[(b["subKey"], b["peerKey"])].append(b)
    seen, opgw_n, unmatched = set(), 0, 0
    for (a, bsub), ablocks in by_dir.items():
        pk = pair_key(a, bsub)
        if pk in seen:
            continue
        seen.add(pk)
        bblocks = by_dir.get((bsub, a), [])
        asort = sorted(ablocks, key=lambda x: (cable_idx(x["peerRaw"]), x["block"]))
        bsort = sorted(bblocks, key=lambda x: (cable_idx(x["peerRaw"]), x["block"]))
        for ab, bb in zip(asort, bsort):
            opgw_n += 1
            cables.append({"key": f"opgw-{a}-{bsub}-{opgw_n}", "kind": "OPGW",
                           "sourceKey": slot_key(a, ab["block"]), "targetKey": slot_key(bsub, bb["block"]),
                           "sourceRole": "IN", "targetRole": "IN", "number": None,
                           "categoryCode": "CBL-OPT", "specParams": {"cores": ab["cores"]}})
        unmatched += abs(len(asort) - len(bsort))

    json.dump(subs, open(os.path.join(DST, "substations.json"), "w"), ensure_ascii=False, indent=1)
    json.dump(assets, open(os.path.join(DST, "assets.json"), "w"), ensure_ascii=False, indent=1)
    json.dump(cables, open(os.path.join(DST, "fiberCables.json"), "w"), ensure_ascii=False, indent=1)
    nslot = sum(1 for a in assets if a["typeCode"] == "OFD-SLOT")
    print(f"subs {len(subs)}  assets {len(assets)} (OFD {len(DIRECT)} + RACK {len(DIRECT)} + slot {nslot} + dev {len(dev_by_sub)})")
    print(f"cables {len(cables)} (CORE {sum(1 for x in cables if x['kind']=='CORE')} + OPGW {opgw_n})  양측불일치 {unmatched}")


if __name__ == "__main__":
    main()
