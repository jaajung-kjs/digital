"""병합 → 최종 시드 JSON 3종 (backend/prisma/seed/data/jikhal/).

입력(out/): ofd_cores.json, ofd_blocks.json(슬롯), equipment.json(송변전광단말장치).
산출:
  substations.json  = 13 직할 국소.
  assets.json       = 국소별 OFD + 케이블(슬롯)별 OFD-SLOT + 송변전광단말장치(OPT-TERM).
  fiberCables.json  = OUT 코어(슬롯→설비/OFD) + OPGW(직할쌍 슬롯↔슬롯).

모델: 슬롯 = 한 변전소 입장의 케이블 1가닥(상대국+코어수). 직할쌍은 양측 슬롯을 OPGW 로 연결.
송광치 코어만 송변전광단말장치에 연결, 나머지는 OFD 에(메타전용).
"""
import json
import os
import re
import collections
from normalize import DIRECT, is_direct, pair_key

OUT = os.path.join(os.path.dirname(__file__), "out")
DST = os.path.join(os.path.dirname(__file__), "..", "..", "backend", "prisma", "seed", "data", "jikhal")


def clean(s):
    return re.sub(r"\s+", " ", (s or "").replace("\n", " ")).strip()


def cable_idx(peer_raw):
    """상대국 표기의 케이블 번호(#N) — 없으면 0."""
    m = re.search(r"#(\d+)", peer_raw or "")
    return int(m.group(1)) if m else 0


def slot_key(sub, block):
    return f"slot-{sub}-b{block}"


def main():
    os.makedirs(DST, exist_ok=True)
    cores = json.load(open(os.path.join(OUT, "ofd_cores.json")))
    blocks = json.load(open(os.path.join(OUT, "ofd_blocks.json")))
    equipment = json.load(open(os.path.join(OUT, "equipment.json")))

    # ── substations: 13 직할 ──
    subs = [{"key": k, "name": v, "isExternal": False} for k, v in DIRECT.items()]

    # ── assets: OFD + 슬롯 + 송변전광단말장치 ──
    assets = []
    for k, v in DIRECT.items():
        assets.append({"key": f"ofd-{k}", "subKey": k, "typeCode": "OFD",
                       "name": "OFD", "parentKey": None, "attributes": {}})
    for b in blocks:
        peer = clean(b["peerRaw"])
        assets.append({"key": slot_key(b["subKey"], b["block"]), "subKey": b["subKey"],
                       "typeCode": "OFD-SLOT", "name": f"{peer} ({b['cores']}C)",
                       "parentKey": f"ofd-{b['subKey']}", "attributes": {"cores": b["cores"]}})
    dev_by_sub = {}  # subKey → device key (OPT-TERM)
    for d in equipment:
        assets.append({"key": d["key"], "subKey": d["subKey"], "typeCode": d["typeCode"],
                       "name": d["name"], "parentKey": None, "attributes": {}})
        dev_by_sub[d["subKey"]] = d["key"]

    # ── fiberCables: OUT 코어 ──
    cables = []
    for c in cores:
        sub, blk = c["subKey"], c["block"]
        src = slot_key(sub, blk)
        if c["purpose"] == "송광치" and sub in dev_by_sub:
            tgt = dev_by_sub[sub]
        else:
            tgt = f"ofd-{sub}"  # 메타전용 — OFD 자체에
        sp = {kk: c[kk] for kk in ("purpose", "circuitText", "spliceType", "usageOverride",
                                   "loss1310", "loss1550", "dist1310", "dist1550", "inspectResult")
              if c.get(kk) is not None}
        sp["peer"] = clean(c["peerRaw"])
        cables.append({"key": f"core-{sub}-b{blk}-{c['core']}", "kind": "CORE",
                       "sourceKey": src, "targetKey": tgt, "sourceRole": "OUT", "targetRole": None,
                       "number": c["core"], "categoryCode": "CBL-OPJ", "specParams": sp})

    # ── fiberCables: OPGW (직할쌍 슬롯↔슬롯) ──
    # 직할 대국 블록을 (sub,peer) 별로 모아, 양방향을 케이블번호(#N)/순서로 짝지어 연결.
    direct_blocks = [b for b in blocks if is_direct(b["peerKey"])]
    by_dir = collections.defaultdict(list)  # (sub, peer) → [block...]
    for b in direct_blocks:
        by_dir[(b["subKey"], b["peerKey"])].append(b)
    opgw_seen = set()
    opgw_n = 0
    unmatched = 0
    for (a, bsub), ablocks in by_dir.items():
        pk = pair_key(a, bsub)
        if pk in opgw_seen:
            continue
        bblocks = by_dir.get((bsub, a), [])
        # #N(없으면 block 순) 으로 정렬해 zip
        ablocks_s = sorted(ablocks, key=lambda x: (cable_idx(x["peerRaw"]), x["block"]))
        bblocks_s = sorted(bblocks, key=lambda x: (cable_idx(x["peerRaw"]), x["block"]))
        for ab, bb in zip(ablocks_s, bblocks_s):
            opgw_n += 1
            cables.append({"key": f"opgw-{a}-{bsub}-{opgw_n}", "kind": "OPGW",
                           "sourceKey": slot_key(a, ab["block"]), "targetKey": slot_key(bsub, bb["block"]),
                           "sourceRole": "IN", "targetRole": "IN", "number": None,
                           "categoryCode": "CBL-OPT", "specParams": {"cores": ab["cores"]}})
        unmatched += abs(len(ablocks_s) - len(bblocks_s))
        opgw_seen.add(pk)

    json.dump(subs, open(os.path.join(DST, "substations.json"), "w"), ensure_ascii=False, indent=1)
    json.dump(assets, open(os.path.join(DST, "assets.json"), "w"), ensure_ascii=False, indent=1)
    json.dump(cables, open(os.path.join(DST, "fiberCables.json"), "w"), ensure_ascii=False, indent=1)
    n_core = sum(1 for x in cables if x["kind"] == "CORE")
    n_opgw = sum(1 for x in cables if x["kind"] == "OPGW")
    print(f"subs {len(subs)}  assets {len(assets)} (OFD {len(DIRECT)} + slot {len(blocks)} + dev {len(equipment)})")
    print(f"cables {len(cables)} (CORE {n_core} + OPGW {n_opgw})  OPGW 양측 불일치 슬롯 {unmatched}")


if __name__ == "__main__":
    main()
