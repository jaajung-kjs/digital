/**
 * 강원본부 직할 국의 **통신실 설비** — 랙·설비·회로·연결. 데이터 파일이다(가드레일 허용 목록).
 *
 * 연결 끝: 설비는 이름(+표기), 회로는 [설비 이름, 번호], 코어는 [선번장 판 번호, 코어 번호] —
 * 코어 끝의 국은 그 국 자신이다(시드가 판 → 광선로·끝으로 푼다).
 */
export interface InvCircuit { no: number; label: string | null; current: 'AC' | 'DC' | null; capacity: string | null }
export interface InvEquipment { name: string; type: string; circuits?: InvCircuit[] }
export interface InvRack { name: string; rackType: string; equipment: InvEquipment[] }
export type InvEnd =
  | { equipment: string; label?: string }
  | { circuit: readonly [equipment: string, no: number] }
  | { core: readonly [plate: number, core: number] };
export interface InvLink { cable: string; a: InvEnd; b: InvEnd }
export interface StationInventory { racks: InvRack[]; links: InvLink[] }

/* 생성: 옛 STATION_KITS 에서 한 번(2026-10-06) — 이제 이 파일이 원본이다. */
export const JIKHAL_INVENTORY: Record<string, StationInventory> = {
  "guchuncheon": {
    "racks": [
      {
        "name": "소내전원반",
        "rackType": "RACK-PANEL",
        "equipment": [
          {
            "name": "소내전원반",
            "type": "AC-HOUSE",
            "circuits": [
              {
                "no": 1,
                "label": "A.C L4",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 2,
                "label": "A.C L6",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 3,
                "label": "A.C L17",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 4,
                "label": "A.C L18",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 5,
                "label": "A.C L21",
                "current": "AC",
                "capacity": null
              }
            ]
          }
        ]
      },
      {
        "name": "통신용 분전반",
        "rackType": "RACK-PANEL",
        "equipment": [
          {
            "name": "통신용 분전반",
            "type": "PWR-PANEL",
            "circuits": [
              {
                "no": 1,
                "label": "정류기#2",
                "current": "AC",
                "capacity": "50A"
              },
              {
                "no": 2,
                "label": "UPS 입력",
                "current": "AC",
                "capacity": "50A"
              },
              {
                "no": 3,
                "label": "IP급전랙",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 4,
                "label": "LAN랙 AC(UPS)",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 5,
                "label": "통합단말(PTP) AC",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 6,
                "label": "ECSU랙 AC",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 7,
                "label": "SPARE",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 8,
                "label": "SPARE",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 9,
                "label": "SPARE",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 10,
                "label": "SPARE",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 11,
                "label": "SPARE",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 12,
                "label": "ICT실 분전반#1 UPS전원",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 13,
                "label": "SPARE",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 14,
                "label": "SPARE",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 15,
                "label": "SPARE",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 16,
                "label": "SPARE",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 17,
                "label": "ECSU랙 DC(B)",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 18,
                "label": "통합단말(주)",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 19,
                "label": "통합단말(예비)",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 20,
                "label": "PIA",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 21,
                "label": "IP급전 DC",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 22,
                "label": "광단국(본부계)#B",
                "current": "DC",
                "capacity": "30A"
              }
            ]
          }
        ]
      },
      {
        "name": "충전기 #1",
        "rackType": "RACK-CHARGER",
        "equipment": [
          {
            "name": "충전기 #1",
            "type": "CHARGER"
          },
          {
            "name": "충전기 #1 축전지",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "충전기 #2",
        "rackType": "RACK-CHARGER",
        "equipment": [
          {
            "name": "충전기 #2",
            "type": "CHARGER",
            "circuits": [
              {
                "no": 1,
                "label": "SID-125 1",
                "current": "DC",
                "capacity": null
              }
            ]
          },
          {
            "name": "충전기 #2 축전지",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "UPS(5kVA)",
        "rackType": "RACK-UPS",
        "equipment": [
          {
            "name": "UPS(5kVA)",
            "type": "UPS",
            "circuits": [
              {
                "no": 1,
                "label": "소형 UPS 1",
                "current": "AC",
                "capacity": null
              }
            ]
          }
        ]
      },
      {
        "name": "UPS(5kVA) 축전지반",
        "rackType": "RACK-BATTERY",
        "equipment": [
          {
            "name": "UPS(5kVA) 축전지반",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "관제소 UPS",
        "rackType": "RACK-UPS",
        "equipment": [
          {
            "name": "관제소 UPS",
            "type": "UPS"
          }
        ]
      },
      {
        "name": "관제소 UPS 축전지반",
        "rackType": "RACK-BATTERY",
        "equipment": [
          {
            "name": "관제소 UPS 축전지반",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "SCADA UPS(40kVA)",
        "rackType": "RACK-UPS",
        "equipment": [
          {
            "name": "SCADA UPS(40kVA)",
            "type": "UPS"
          }
        ]
      },
      {
        "name": "SCADA UPS(40kVA) 축전지반",
        "rackType": "RACK-BATTERY",
        "equipment": [
          {
            "name": "SCADA UPS(40kVA) 축전지반",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "SCADA UPS(20kVA)",
        "rackType": "RACK-UPS",
        "equipment": [
          {
            "name": "SCADA UPS(20kVA)",
            "type": "UPS"
          }
        ]
      },
      {
        "name": "SCADA UPS(20kVA) 축전지반",
        "rackType": "RACK-BATTERY",
        "equipment": [
          {
            "name": "SCADA UPS(20kVA) 축전지반",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "냉난방기",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "냉난방기",
            "type": "HVAC-AC"
          }
        ]
      },
      {
        "name": "에어컨(계통 DLP실)",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "에어컨(계통 DLP실)",
            "type": "HVAC-AC"
          }
        ]
      },
      {
        "name": "에어컨(관제소 DLP실)",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "에어컨(관제소 DLP실)",
            "type": "HVAC-AC"
          }
        ]
      },
      {
        "name": "에어컨(1층 SCADA실 입구)",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "에어컨(1층 SCADA실 입구)",
            "type": "HVAC-AC"
          }
        ]
      },
      {
        "name": "에어컨(1층 SCADA실 창가)",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "에어컨(1층 SCADA실 창가)",
            "type": "HVAC-AC"
          }
        ]
      },
      {
        "name": "통합단말장치",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "통합단말장치",
            "type": "CT1000"
          }
        ]
      },
      {
        "name": "PITR-5000(북춘천계)",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "PITR-5000(북춘천계)",
            "type": "PITR"
          }
        ]
      },
      {
        "name": "PITR-5000(남춘천계)",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "PITR-5000(남춘천계)",
            "type": "PITR"
          }
        ]
      },
      {
        "name": "PITR-5000(소양계)",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "PITR-5000(소양계)",
            "type": "PITR"
          }
        ]
      },
      {
        "name": "소형광단국(홍천계)",
        "rackType": "RACK-MINI-OPT",
        "equipment": [
          {
            "name": "송광치 PTPU 춘천-홍천",
            "type": "PTPU"
          },
          {
            "name": "OMS-Plus 춘천-홍천",
            "type": "OMS"
          },
          {
            "name": "송광치 PTPU 춘천-소양",
            "type": "PTPU"
          }
        ]
      },
      {
        "name": "소형광단국(본부계)",
        "rackType": "RACK-MINI-OPT",
        "equipment": [
          {
            "name": "송광치 PTP 춘천-본부",
            "type": "PTPU"
          },
          {
            "name": "통합PTP 본부-춘천 #1",
            "type": "PTPU"
          },
          {
            "name": "통합PTP 본부-춘천 #2",
            "type": "PTPU"
          },
          {
            "name": "PTP 본부-춘천",
            "type": "PTPU"
          },
          {
            "name": "PTP 춘천-북춘천",
            "type": "PTPU"
          },
          {
            "name": "PTP 춘천-남춘천",
            "type": "PTPU"
          },
          {
            "name": "통합PTP 신춘천-구춘천 #1",
            "type": "PTPU"
          },
          {
            "name": "통합PTP 신춘천-구춘천 #2",
            "type": "PTPU"
          }
        ]
      },
      {
        "name": "통신랙 1",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "L3 스위치(OA)",
            "type": "SW-L3"
          },
          {
            "name": "L3 스위치(POCN)",
            "type": "SW-L3"
          },
          {
            "name": "L3 스위치(계통운영통신 #1)",
            "type": "SW-L3"
          },
          {
            "name": "L3 스위치(계통운영통신 #2)",
            "type": "SW-L3"
          },
          {
            "name": "L2 스위치((구)DLP실)",
            "type": "SW-L2"
          },
          {
            "name": "L2 스위치((구)OA망 #1)",
            "type": "SW-L2"
          },
          {
            "name": "L2 스위치((구)OA망 #2)",
            "type": "SW-L2"
          },
          {
            "name": "L2 스위치((구)PDAS)",
            "type": "SW-L2"
          },
          {
            "name": "L2 스위치((신)IP급전용)",
            "type": "SW-L2"
          },
          {
            "name": "L2 스위치((신)업무용)",
            "type": "SW-L2"
          },
          {
            "name": "L2 스위치(OA)",
            "type": "SW-L2"
          },
          {
            "name": "L2 스위치(POCN)",
            "type": "SW-L2"
          },
          {
            "name": "L2 스위치(SCADA)",
            "type": "SW-L2"
          },
          {
            "name": "L2 스위치(인터넷망)",
            "type": "SW-L2"
          },
          {
            "name": "L2 스위치(계통운영통신 #1)",
            "type": "SW-L2"
          },
          {
            "name": "L2 스위치(계통운영통신 #2)",
            "type": "SW-L2"
          }
        ]
      },
      {
        "name": "통신랙 2",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "PoE 스위치",
            "type": "SW-POE"
          },
          {
            "name": "PIA",
            "type": "PIA"
          },
          {
            "name": "CSU/DSU #1",
            "type": "CSU-DSU"
          },
          {
            "name": "CSU/DSU #2",
            "type": "CSU-DSU"
          },
          {
            "name": "CSU/DSU #3",
            "type": "CSU-DSU"
          },
          {
            "name": "RTU 광스위치",
            "type": "OPT-SW"
          },
          {
            "name": "광컨버터(차세대SCADA 본사-주)",
            "type": "MEDIA-CONV"
          },
          {
            "name": "광컨버터(차세대SCADA 본사-예비)",
            "type": "MEDIA-CONV"
          },
          {
            "name": "광컨버터(차세대SCADA 동해-주)",
            "type": "MEDIA-CONV"
          },
          {
            "name": "광컨버터(차세대SCADA 동해-예비)",
            "type": "MEDIA-CONV"
          },
          {
            "name": "광컨버터(SCADA-DAS 자료연계)",
            "type": "MEDIA-CONV"
          }
        ]
      },
      {
        "name": "ICT관제소 서버랙",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "DAS 서버",
            "type": "SERVER"
          },
          {
            "name": "KepCIT 서버",
            "type": "SERVER"
          },
          {
            "name": "PMS-5000 서버",
            "type": "SERVER"
          },
          {
            "name": "TRMS 운영콘솔",
            "type": "SERVER"
          },
          {
            "name": "광단국 서버",
            "type": "SERVER"
          },
          {
            "name": "송변전광단말 서버",
            "type": "SERVER"
          },
          {
            "name": "통합감시·Web SCADA 서버",
            "type": "SERVER"
          },
          {
            "name": "통합단말 서버",
            "type": "SERVER"
          }
        ]
      },
      {
        "name": "IP급전랙",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "IP급전랙",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "ECSU랙",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "ECSU랙",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "ICT실 분전반#1",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "ICT실 분전반#1",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "접지함체",
        "rackType": "RACK-WALL",
        "equipment": [
          {
            "name": "접지함체",
            "type": "GROUND-BOX"
          }
        ]
      }
    ],
    "links": [
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "소내전원반",
            4
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            1
          ]
        },
        "b": {
          "equipment": "충전기 #2"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            2
          ]
        },
        "b": {
          "equipment": "UPS(5kVA)"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            3
          ]
        },
        "b": {
          "equipment": "IP급전랙"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            5
          ]
        },
        "b": {
          "equipment": "통합단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            6
          ]
        },
        "b": {
          "equipment": "ECSU랙"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            12
          ]
        },
        "b": {
          "equipment": "ICT실 분전반#1"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            17
          ]
        },
        "b": {
          "equipment": "ECSU랙"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            18
          ]
        },
        "b": {
          "equipment": "통합단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            19
          ]
        },
        "b": {
          "equipment": "통합단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            20
          ]
        },
        "b": {
          "equipment": "PIA"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            21
          ]
        },
        "b": {
          "equipment": "IP급전랙"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "충전기 #2",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "UPS(5kVA)",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "equipment": "UPS(5kVA)"
        },
        "b": {
          "equipment": "UPS(5kVA) 축전지반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "equipment": "관제소 UPS"
        },
        "b": {
          "equipment": "관제소 UPS 축전지반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "equipment": "SCADA UPS(40kVA)"
        },
        "b": {
          "equipment": "SCADA UPS(40kVA) 축전지반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "equipment": "SCADA UPS(20kVA)"
        },
        "b": {
          "equipment": "SCADA UPS(20kVA) 축전지반"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            3
          ]
        },
        "b": {
          "equipment": "PTP 춘천-북춘천",
          "label": "EAST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            4
          ]
        },
        "b": {
          "equipment": "PTP 춘천-북춘천",
          "label": "WEST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            10,
            1
          ]
        },
        "b": {
          "equipment": "통합PTP 신춘천-구춘천 #1",
          "label": "EAST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            10,
            2
          ]
        },
        "b": {
          "equipment": "통합PTP 신춘천-구춘천 #1",
          "label": "WEST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            10,
            5
          ]
        },
        "b": {
          "equipment": "통합PTP 신춘천-구춘천 #2",
          "label": "EAST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            10,
            6
          ]
        },
        "b": {
          "equipment": "통합PTP 신춘천-구춘천 #2",
          "label": "WEST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            10,
            7
          ]
        },
        "b": {
          "equipment": "RTU 광스위치",
          "label": "FX-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            15
          ]
        },
        "b": {
          "core": [
            10,
            19
          ]
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            16
          ]
        },
        "b": {
          "core": [
            10,
            20
          ]
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            13
          ]
        },
        "b": {
          "core": [
            10,
            22
          ]
        }
      }
    ]
  },
  "sinchuncheon": {
    "racks": [
      {
        "name": "소내전원반",
        "rackType": "RACK-PANEL",
        "equipment": [
          {
            "name": "소내전원반",
            "type": "AC-HOUSE",
            "circuits": [
              {
                "no": 1,
                "label": "2층 AC소내분전반",
                "current": "AC",
                "capacity": null
              }
            ]
          }
        ]
      },
      {
        "name": "통신용 분전반",
        "rackType": "RACK-PANEL",
        "equipment": [
          {
            "name": "통신용 분전반",
            "type": "PWR-PANEL",
            "circuits": [
              {
                "no": 1,
                "label": "SPARE",
                "current": "AC",
                "capacity": "50A"
              },
              {
                "no": 2,
                "label": "SPARE",
                "current": "AC",
                "capacity": "50A"
              },
              {
                "no": 3,
                "label": "송광치 상용전원",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 4,
                "label": "축전지 팬",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 5,
                "label": "통합단말장치 랙전원",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 6,
                "label": "통합단말장치랙-1 PTPU-1",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 7,
                "label": "ICT L2 S/W 랙전원",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 8,
                "label": "송광치 UPS AC전원",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 9,
                "label": "SCADA MPD 랙",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 10,
                "label": "감시정보 RT함체",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 11,
                "label": "감시정보 랙전원",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 12,
                "label": "송광치 DC",
                "current": "DC",
                "capacity": "30A"
              }
            ]
          }
        ]
      },
      {
        "name": "충전기 #1",
        "rackType": "RACK-CHARGER",
        "equipment": [
          {
            "name": "충전기 #1",
            "type": "CHARGER",
            "circuits": [
              {
                "no": 1,
                "label": "SID-125 1",
                "current": "DC",
                "capacity": null
              }
            ]
          },
          {
            "name": "충전기 #1 축전지",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "UPS",
        "rackType": "RACK-UPS",
        "equipment": [
          {
            "name": "UPS",
            "type": "UPS",
            "circuits": [
              {
                "no": 1,
                "label": "소형 UPS 1",
                "current": "AC",
                "capacity": null
              }
            ]
          }
        ]
      },
      {
        "name": "UPS 축전지반",
        "rackType": "RACK-BATTERY",
        "equipment": [
          {
            "name": "UPS 축전지반",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "SCADA UPS #1",
        "rackType": "RACK-UPS",
        "equipment": [
          {
            "name": "SCADA UPS #1",
            "type": "UPS"
          }
        ]
      },
      {
        "name": "SCADA UPS #1 축전지반",
        "rackType": "RACK-BATTERY",
        "equipment": [
          {
            "name": "SCADA UPS #1 축전지반",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "SCADA UPS #2",
        "rackType": "RACK-UPS",
        "equipment": [
          {
            "name": "SCADA UPS #2",
            "type": "UPS"
          }
        ]
      },
      {
        "name": "SCADA UPS #2 축전지반",
        "rackType": "RACK-BATTERY",
        "equipment": [
          {
            "name": "SCADA UPS #2 축전지반",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "송변전광단말장치",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "송변전광단말장치",
            "type": "OTE"
          }
        ]
      },
      {
        "name": "통합단말장치",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "통합단말장치",
            "type": "CT1000"
          }
        ]
      },
      {
        "name": "PITR-5000 #1",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "PITR-5000 #1",
            "type": "PITR"
          }
        ]
      },
      {
        "name": "PITR-5000 #2",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "PITR-5000 #2",
            "type": "PITR"
          }
        ]
      },
      {
        "name": "PITR-5000 #3",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "PITR-5000 #3",
            "type": "PITR"
          }
        ]
      },
      {
        "name": "소형광단국",
        "rackType": "RACK-MINI-OPT",
        "equipment": [
          {
            "name": "통합PTP 신춘천-구춘천 #1",
            "type": "PTPU"
          },
          {
            "name": "통합PTP 신춘천-구춘천 #2",
            "type": "PTPU"
          }
        ]
      },
      {
        "name": "통신랙",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "급전분소 L3 스위치 #1",
            "type": "SW-L3"
          },
          {
            "name": "급전분소 L3 스위치 #2",
            "type": "SW-L3"
          },
          {
            "name": "직할급전분소 UTM",
            "type": "UTM"
          },
          {
            "name": "ICT L2 스위치",
            "type": "SW-L2"
          },
          {
            "name": "RTU 광스위치",
            "type": "OPT-SW"
          },
          {
            "name": "광컨버터(계통운영센터 직결 콘솔)",
            "type": "MEDIA-CONV"
          }
        ]
      },
      {
        "name": "SCADA MPD 랙",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "SCADA MPD 랙",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "감시정보",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "감시정보",
            "type": "EXT"
          }
        ]
      }
    ],
    "links": [
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "소내전원반",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            6
          ]
        },
        "b": {
          "equipment": "통합단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            8
          ]
        },
        "b": {
          "equipment": "송변전광단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            9
          ]
        },
        "b": {
          "equipment": "SCADA MPD 랙"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            10
          ]
        },
        "b": {
          "equipment": "감시정보"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            12
          ]
        },
        "b": {
          "equipment": "송변전광단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "충전기 #1",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "UPS",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "equipment": "UPS"
        },
        "b": {
          "equipment": "UPS 축전지반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "equipment": "SCADA UPS #1"
        },
        "b": {
          "equipment": "SCADA UPS #1 축전지반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "equipment": "SCADA UPS #2"
        },
        "b": {
          "equipment": "SCADA UPS #2 축전지반"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            1
          ]
        },
        "b": {
          "equipment": "통합PTP 신춘천-구춘천 #1",
          "label": "EAST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            2
          ]
        },
        "b": {
          "equipment": "통합PTP 신춘천-구춘천 #1",
          "label": "WEST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            5
          ]
        },
        "b": {
          "equipment": "통합PTP 신춘천-구춘천 #2",
          "label": "EAST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            6
          ]
        },
        "b": {
          "equipment": "통합PTP 신춘천-구춘천 #2",
          "label": "WEST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            7
          ]
        },
        "b": {
          "equipment": "RTU 광스위치",
          "label": "FX-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            22
          ]
        },
        "b": {
          "equipment": "RTU 광스위치",
          "label": "FX-TX:2"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            8
          ]
        },
        "b": {
          "equipment": "광컨버터(계통운영센터 직결 콘솔)",
          "label": "TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            19
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(A) FIBER:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            20
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(A) FIBER:2"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            8
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(B) FIBER:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            9
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(B) FIBER:2"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            19
          ]
        },
        "b": {
          "equipment": "급전분소 L3 스위치 #1",
          "label": "SFP:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            20
          ]
        },
        "b": {
          "equipment": "급전분소 L3 스위치 #1",
          "label": "SFP:2"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            21
          ]
        },
        "b": {
          "equipment": "급전분소 L3 스위치 #2",
          "label": "SFP:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            22
          ]
        },
        "b": {
          "equipment": "급전분소 L3 스위치 #2",
          "label": "SFP:2"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            18
          ]
        },
        "b": {
          "equipment": "급전분소 L3 스위치 #2",
          "label": "SFP:3"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            14
          ]
        },
        "b": {
          "equipment": "직할급전분소 UTM",
          "label": "SFP:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            15
          ]
        },
        "b": {
          "equipment": "직할급전분소 UTM",
          "label": "SFP:2"
        }
      }
    ]
  },
  "bukchuncheon": {
    "racks": [
      {
        "name": "소내전원반",
        "rackType": "RACK-PANEL",
        "equipment": [
          {
            "name": "소내전원반",
            "type": "AC-HOUSE",
            "circuits": [
              {
                "no": 1,
                "label": "소내전원반 9번",
                "current": "AC",
                "capacity": null
              }
            ]
          }
        ]
      },
      {
        "name": "통신용 분전반",
        "rackType": "RACK-PANEL",
        "equipment": [
          {
            "name": "통신용 분전반",
            "type": "PWR-PANEL",
            "circuits": [
              {
                "no": 1,
                "label": "SPARE",
                "current": "AC",
                "capacity": "100A"
              },
              {
                "no": 2,
                "label": "상용AC메인",
                "current": "AC",
                "capacity": "100A"
              },
              {
                "no": 3,
                "label": "충전기",
                "current": "AC",
                "capacity": "100A"
              },
              {
                "no": 4,
                "label": "감시UPS",
                "current": "AC",
                "capacity": "100A"
              },
              {
                "no": 5,
                "label": "통합단말장치",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 6,
                "label": "PIA AC",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 7,
                "label": "소형광단국",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 8,
                "label": "ACU주장치",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 9,
                "label": "배전전력구",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 10,
                "label": "전력구주장치",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 11,
                "label": "송광치",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 12,
                "label": "SPARE",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 13,
                "label": "SPARE",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 14,
                "label": "SPARE",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 15,
                "label": "SPARE",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 16,
                "label": "SPARE",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 17,
                "label": "SPARE",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 18,
                "label": "SPARE",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 19,
                "label": "SPARE",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 20,
                "label": "SPARE",
                "current": "DC",
                "capacity": "50A"
              },
              {
                "no": 21,
                "label": "SPARE",
                "current": "DC",
                "capacity": "50A"
              },
              {
                "no": 22,
                "label": "통합단말A",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 23,
                "label": "통합단말B",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 24,
                "label": "SPARE",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 25,
                "label": "PIA DC",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 26,
                "label": "소형광단국",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 27,
                "label": "송광치",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 28,
                "label": "PIA",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 29,
                "label": "PCM",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 30,
                "label": "OMS",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 31,
                "label": "SPARE",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 32,
                "label": "SPARE",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 33,
                "label": "SPARE",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 34,
                "label": "SPARE",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 35,
                "label": "SPARE",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 36,
                "label": "SPARE",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 37,
                "label": "SPARE",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 38,
                "label": "SPARE",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 39,
                "label": "SPARE",
                "current": "DC",
                "capacity": "20A"
              }
            ]
          }
        ]
      },
      {
        "name": "충전기 #1",
        "rackType": "RACK-CHARGER",
        "equipment": [
          {
            "name": "충전기 #1",
            "type": "CHARGER",
            "circuits": [
              {
                "no": 1,
                "label": "SID-125 1",
                "current": "DC",
                "capacity": null
              }
            ]
          },
          {
            "name": "충전기 #1 축전지",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "UPS",
        "rackType": "RACK-UPS",
        "equipment": [
          {
            "name": "UPS",
            "type": "UPS",
            "circuits": [
              {
                "no": 1,
                "label": "소형 UPS 1",
                "current": "AC",
                "capacity": null
              }
            ]
          }
        ]
      },
      {
        "name": "UPS 축전지반",
        "rackType": "RACK-BATTERY",
        "equipment": [
          {
            "name": "UPS 축전지반",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "송변전광단말장치",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "송변전광단말장치",
            "type": "OTE"
          }
        ]
      },
      {
        "name": "통합단말장치",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "통합단말장치",
            "type": "CT1000"
          }
        ]
      },
      {
        "name": "PITR-5000(춘천계)",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "PITR-5000(춘천계)",
            "type": "PITR"
          }
        ]
      },
      {
        "name": "소형광단국",
        "rackType": "RACK-MINI-OPT",
        "equipment": [
          {
            "name": "PTP 춘천-북춘천",
            "type": "PTPU"
          },
          {
            "name": "송광PTP 북춘천-화천H/P",
            "type": "PTPU"
          },
          {
            "name": "통합PTP 북춘천-가평",
            "type": "PTPU"
          },
          {
            "name": "통합PTP 북춘천-춘천H/P",
            "type": "PTPU"
          },
          {
            "name": "I-MUX(A)",
            "type": "I-MUX"
          },
          {
            "name": "I-MUX(B)",
            "type": "I-MUX"
          },
          {
            "name": "OMS",
            "type": "OMS"
          },
          {
            "name": "PCM",
            "type": "PCM"
          }
        ]
      },
      {
        "name": "통신랙",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "L3 스위치",
            "type": "SW-L3"
          },
          {
            "name": "L2 스위치",
            "type": "SW-L2"
          },
          {
            "name": "PoE 스위치",
            "type": "SW-POE"
          },
          {
            "name": "PIA",
            "type": "PIA"
          },
          {
            "name": "RTU 광스위치",
            "type": "OPT-SW"
          }
        ]
      },
      {
        "name": "냉난방기(3층)",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "냉난방기(3층)",
            "type": "HVAC-AC"
          }
        ]
      },
      {
        "name": "에어컨(1층)",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "에어컨(1층)",
            "type": "HVAC-AC"
          }
        ]
      },
      {
        "name": "ACU 주장치",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "ACU 주장치",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "배전전력구 통합감시",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "배전전력구 통합감시",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "전력구 주장치",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "전력구 주장치",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "접지함체",
        "rackType": "RACK-WALL",
        "equipment": [
          {
            "name": "접지함체",
            "type": "GROUND-BOX"
          }
        ]
      }
    ],
    "links": [
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "소내전원반",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            3
          ]
        },
        "b": {
          "equipment": "충전기 #1"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            4
          ]
        },
        "b": {
          "equipment": "UPS"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            5
          ]
        },
        "b": {
          "equipment": "통합단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            8
          ]
        },
        "b": {
          "equipment": "ACU 주장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            9
          ]
        },
        "b": {
          "equipment": "배전전력구 통합감시"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            10
          ]
        },
        "b": {
          "equipment": "전력구 주장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            11
          ]
        },
        "b": {
          "equipment": "송변전광단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            22
          ]
        },
        "b": {
          "equipment": "통합단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            23
          ]
        },
        "b": {
          "equipment": "통합단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            25
          ]
        },
        "b": {
          "equipment": "PIA"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            27
          ]
        },
        "b": {
          "equipment": "송변전광단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            29
          ]
        },
        "b": {
          "equipment": "PCM"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            30
          ]
        },
        "b": {
          "equipment": "OMS"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "충전기 #1",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "equipment": "UPS"
        },
        "b": {
          "equipment": "UPS 축전지반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "UPS",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            3
          ]
        },
        "b": {
          "equipment": "PTP 춘천-북춘천",
          "label": "WEST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            4
          ]
        },
        "b": {
          "equipment": "PTP 춘천-북춘천",
          "label": "EAST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            13
          ]
        },
        "b": {
          "equipment": "RTU 광스위치",
          "label": "FX-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            9
          ]
        },
        "b": {
          "equipment": "RTU 광스위치",
          "label": "FX-TX:2"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            15
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(A) FIBER:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            16
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(A) FIBER:2"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            1
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(B) FIBER:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            4
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(B) FIBER:2"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            2
          ]
        },
        "b": {
          "equipment": "통합PTP 북춘천-춘천H/P",
          "label": "WEST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            1
          ]
        },
        "b": {
          "equipment": "통합PTP 북춘천-춘천H/P",
          "label": "WEST-RX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            7
          ]
        },
        "b": {
          "equipment": "통합PTP 북춘천-춘천H/P",
          "label": "EAST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            8
          ]
        },
        "b": {
          "equipment": "통합PTP 북춘천-춘천H/P",
          "label": "EAST-RX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            3
          ]
        },
        "b": {
          "equipment": "송광PTP 북춘천-화천H/P",
          "label": "EAST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            4
          ]
        },
        "b": {
          "equipment": "송광PTP 북춘천-화천H/P",
          "label": "WEST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            5
          ]
        },
        "b": {
          "equipment": "I-MUX(B)",
          "label": "TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            6
          ]
        },
        "b": {
          "equipment": "I-MUX(B)",
          "label": "RX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            17
          ]
        },
        "b": {
          "equipment": "I-MUX(A)",
          "label": "TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            18
          ]
        },
        "b": {
          "equipment": "I-MUX(A)",
          "label": "RX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            16
          ]
        },
        "b": {
          "equipment": "통합PTP 북춘천-가평",
          "label": "WEST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            15
          ]
        },
        "b": {
          "equipment": "통합PTP 북춘천-가평",
          "label": "WEST-RX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            10
          ]
        },
        "b": {
          "equipment": "통합PTP 북춘천-가평",
          "label": "EAST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            9
          ]
        },
        "b": {
          "equipment": "통합PTP 북춘천-가평",
          "label": "EAST-RX:1"
        }
      }
    ]
  },
  "namchuncheon": {
    "racks": [
      {
        "name": "소내전원반",
        "rackType": "RACK-PANEL",
        "equipment": [
          {
            "name": "소내전원반",
            "type": "AC-HOUSE",
            "circuits": [
              {
                "no": 1,
                "label": "AC MAIN A-4",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 2,
                "label": "AC FEEDER A-A29",
                "current": "AC",
                "capacity": null
              }
            ]
          }
        ]
      },
      {
        "name": "통신용 분전반",
        "rackType": "RACK-PANEL",
        "equipment": [
          {
            "name": "통신용 분전반",
            "type": "PWR-PANEL",
            "circuits": [
              {
                "no": 1,
                "label": "정류기(A)전원",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 2,
                "label": "정류기(B)전원",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 3,
                "label": "감시정보 UPS",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 4,
                "label": "상용AC 메인",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 5,
                "label": "소형광(홍천계)",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 6,
                "label": "SPARE",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 7,
                "label": "SPARE",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 8,
                "label": "파워콤정류기",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 9,
                "label": "SPARE",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 10,
                "label": "SPARE",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 11,
                "label": "SPARE",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 12,
                "label": "SPARE",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 13,
                "label": "SPARE",
                "current": "DC",
                "capacity": "50A"
              },
              {
                "no": 14,
                "label": "SPARE",
                "current": "DC",
                "capacity": "50A"
              },
              {
                "no": 15,
                "label": "SPARE",
                "current": "DC",
                "capacity": "50A"
              },
              {
                "no": 16,
                "label": "서홍천소형광",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 17,
                "label": "홍천계소형광",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 18,
                "label": "PIA",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 19,
                "label": "파워콤PDPA",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 20,
                "label": "1층SCADA MPD랙",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 21,
                "label": "통합단말A",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 22,
                "label": "SPARE",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 23,
                "label": "남춘천-열병합 PITR(주)",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 24,
                "label": "남춘천-열병합 PITR(예비)",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 25,
                "label": "SPARE",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 26,
                "label": "SPARE",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 27,
                "label": "SPARE",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 28,
                "label": "SPARE",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 29,
                "label": "SPARE",
                "current": "DC",
                "capacity": "20A"
              }
            ]
          }
        ]
      },
      {
        "name": "충전기 #1",
        "rackType": "RACK-CHARGER",
        "equipment": [
          {
            "name": "충전기 #1",
            "type": "CHARGER",
            "circuits": [
              {
                "no": 1,
                "label": "SID-125 1",
                "current": "DC",
                "capacity": null
              }
            ]
          },
          {
            "name": "충전기 #1 축전지",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "충전기 #2",
        "rackType": "RACK-CHARGER",
        "equipment": [
          {
            "name": "충전기 #2",
            "type": "CHARGER"
          },
          {
            "name": "충전기 #2 축전지",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "UPS",
        "rackType": "RACK-UPS",
        "equipment": [
          {
            "name": "UPS",
            "type": "UPS",
            "circuits": [
              {
                "no": 1,
                "label": "소형 UPS 1",
                "current": "AC",
                "capacity": null
              }
            ]
          }
        ]
      },
      {
        "name": "UPS 축전지반",
        "rackType": "RACK-BATTERY",
        "equipment": [
          {
            "name": "UPS 축전지반",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "송변전광단말장치",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "송변전광단말장치",
            "type": "OTE"
          }
        ]
      },
      {
        "name": "통합단말장치",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "통합단말장치",
            "type": "CT1000"
          }
        ]
      },
      {
        "name": "PITR-5000(청평PP계)",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "PITR-5000(청평PP계)",
            "type": "PITR"
          }
        ]
      },
      {
        "name": "PITR-5000(춘천계)",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "PITR-5000(춘천계)",
            "type": "PITR"
          }
        ]
      },
      {
        "name": "PITR-5000(홍천계)",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "PITR-5000(홍천계)",
            "type": "PITR"
          }
        ]
      },
      {
        "name": "PITR-5000(열병합계)",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "PITR-5000(열병합계)",
            "type": "PITR"
          }
        ]
      },
      {
        "name": "소형광단국(홍천계)",
        "rackType": "RACK-MINI-OPT",
        "equipment": [
          {
            "name": "송광치 PTPU 남춘천-홍천",
            "type": "PTPU"
          },
          {
            "name": "OMS-Plus 춘천-홍천",
            "type": "OMS"
          },
          {
            "name": "통합PTP 홍천-남춘천",
            "type": "PTPU"
          }
        ]
      },
      {
        "name": "소형광단국(청평PP계)",
        "rackType": "RACK-MINI-OPT",
        "equipment": [
          {
            "name": "통합PTP 남춘천-열병합",
            "type": "PTPU"
          },
          {
            "name": "PTP 춘천-남춘천",
            "type": "PTPU"
          }
        ]
      },
      {
        "name": "통신랙",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "L3 스위치",
            "type": "SW-L3"
          },
          {
            "name": "L2 스위치",
            "type": "SW-L2"
          },
          {
            "name": "PoE 스위치",
            "type": "SW-POE"
          },
          {
            "name": "PIA",
            "type": "PIA"
          },
          {
            "name": "RTU 광스위치",
            "type": "OPT-SW"
          }
        ]
      },
      {
        "name": "냉난방기",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "냉난방기",
            "type": "HVAC-AC"
          }
        ]
      },
      {
        "name": "파워콤",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "파워콤",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "1층 SCADA MPD랙",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "1층 SCADA MPD랙",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "접지함체",
        "rackType": "RACK-WALL",
        "equipment": [
          {
            "name": "접지함체",
            "type": "GROUND-BOX"
          }
        ]
      }
    ],
    "links": [
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "소내전원반",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            1
          ]
        },
        "b": {
          "equipment": "충전기 #1"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            2
          ]
        },
        "b": {
          "equipment": "충전기 #2"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            3
          ]
        },
        "b": {
          "equipment": "UPS"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            8
          ]
        },
        "b": {
          "equipment": "파워콤"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            17
          ]
        },
        "b": {
          "equipment": "OMS-Plus 춘천-홍천"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            18
          ]
        },
        "b": {
          "equipment": "PIA"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            19
          ]
        },
        "b": {
          "equipment": "파워콤"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            20
          ]
        },
        "b": {
          "equipment": "1층 SCADA MPD랙"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            21
          ]
        },
        "b": {
          "equipment": "통합단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            23
          ]
        },
        "b": {
          "equipment": "PITR-5000(열병합계)"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            24
          ]
        },
        "b": {
          "equipment": "PITR-5000(열병합계)"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "충전기 #1",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "equipment": "UPS"
        },
        "b": {
          "equipment": "UPS 축전지반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "UPS",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            2
          ]
        },
        "b": {
          "equipment": "통합PTP 남춘천-열병합",
          "label": "WEST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            1
          ]
        },
        "b": {
          "equipment": "통합PTP 남춘천-열병합",
          "label": "WEST-RX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            6
          ]
        },
        "b": {
          "equipment": "통합PTP 남춘천-열병합",
          "label": "EAST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            5
          ]
        },
        "b": {
          "equipment": "통합PTP 남춘천-열병합",
          "label": "EAST-RX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            3
          ]
        },
        "b": {
          "equipment": "RTU 광스위치",
          "label": "FX-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            7
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(B) FIBER:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            8
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(B) FIBER:2"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            4,
            17
          ]
        },
        "b": {
          "equipment": "통합PTP 홍천-남춘천",
          "label": "WEST-TX:1"
        }
      }
    ]
  },
  "seohongcheon": {
    "racks": [
      {
        "name": "소내전원반",
        "rackType": "RACK-PANEL",
        "equipment": [
          {
            "name": "소내전원반",
            "type": "AC-HOUSE",
            "circuits": [
              {
                "no": 1,
                "label": "AC소내분전반 L18",
                "current": "AC",
                "capacity": null
              }
            ]
          }
        ]
      },
      {
        "name": "통신용 분전반",
        "rackType": "RACK-PANEL",
        "equipment": [
          {
            "name": "통신용 분전반",
            "type": "PWR-PANEL",
            "circuits": [
              {
                "no": 1,
                "label": "L1 #2충전기 입력",
                "current": "AC",
                "capacity": "100A"
              },
              {
                "no": 2,
                "label": "L2 #1충전기 입력",
                "current": "AC",
                "capacity": "100A"
              },
              {
                "no": 3,
                "label": "L3",
                "current": "AC",
                "capacity": "50A"
              },
              {
                "no": 4,
                "label": "L4 UPS 입력",
                "current": "AC",
                "capacity": "50A"
              },
              {
                "no": 5,
                "label": "L5",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 6,
                "label": "L6",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 7,
                "label": "L7",
                "current": "AC",
                "capacity": "20A"
              },
              {
                "no": 8,
                "label": "L8",
                "current": "AC",
                "capacity": "20A"
              },
              {
                "no": 9,
                "label": "L9",
                "current": "AC",
                "capacity": "20A"
              },
              {
                "no": 10,
                "label": "L10",
                "current": "AC",
                "capacity": "20A"
              },
              {
                "no": 11,
                "label": "L1 통합단말",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 12,
                "label": "L2 감시정보",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 13,
                "label": "L3 송광치 AC",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 14,
                "label": "L4",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 15,
                "label": "L5 M.Tr#2 감시정보",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 16,
                "label": "L6",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 17,
                "label": "L7",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 18,
                "label": "L8",
                "current": "AC",
                "capacity": "20A"
              },
              {
                "no": 19,
                "label": "L9 송광치 콘센트",
                "current": "AC",
                "capacity": "20A"
              },
              {
                "no": 20,
                "label": "L10 IP기반 유무선 통신교환장치",
                "current": "AC",
                "capacity": "20A"
              },
              {
                "no": 21,
                "label": "L11 배전전력구 감시시스템",
                "current": "AC",
                "capacity": "20A"
              },
              {
                "no": 22,
                "label": "L12 IP급전 사령원콘솔",
                "current": "AC",
                "capacity": "20A"
              },
              {
                "no": 23,
                "label": "L13 IP급전 스위치",
                "current": "AC",
                "capacity": "20A"
              },
              {
                "no": 24,
                "label": "L14 PDAS",
                "current": "AC",
                "capacity": "20A"
              },
              {
                "no": 25,
                "label": "A-L1 통합단말 A",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 26,
                "label": "A-L2 PIA",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 27,
                "label": "A-L3 청평양수T/L PITR(주)",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 28,
                "label": "A-L4",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 29,
                "label": "A-L5",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 30,
                "label": "A-L6",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 31,
                "label": "A-L7 LGU+ PDP(A)",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 32,
                "label": "B-L1 통합단말 B",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 33,
                "label": "B-L2 청평양수 P32T",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 34,
                "label": "B-L3 청평양수T/L PITR(예비)",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 35,
                "label": "B-L4 송광치",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 36,
                "label": "B-L5",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 37,
                "label": "B-L6",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 38,
                "label": "B-L7 LGU+ PDP(B)",
                "current": "DC",
                "capacity": "20A"
              }
            ]
          }
        ]
      },
      {
        "name": "충전기 #1",
        "rackType": "RACK-CHARGER",
        "equipment": [
          {
            "name": "충전기 #1",
            "type": "CHARGER",
            "circuits": [
              {
                "no": 1,
                "label": "SID-125 1",
                "current": "DC",
                "capacity": null
              }
            ]
          },
          {
            "name": "충전기 #1 축전지",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "충전기 #2",
        "rackType": "RACK-CHARGER",
        "equipment": [
          {
            "name": "충전기 #2",
            "type": "CHARGER"
          },
          {
            "name": "충전기 #2 축전지",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "UPS",
        "rackType": "RACK-UPS",
        "equipment": [
          {
            "name": "UPS",
            "type": "UPS",
            "circuits": [
              {
                "no": 1,
                "label": "UPS 절체 스위치 1",
                "current": "AC",
                "capacity": null
              }
            ]
          }
        ]
      },
      {
        "name": "UPS 축전지반",
        "rackType": "RACK-BATTERY",
        "equipment": [
          {
            "name": "UPS 축전지반",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "송변전광단말장치",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "송변전광단말장치",
            "type": "OTE"
          }
        ]
      },
      {
        "name": "통합단말장치",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "통합단말장치",
            "type": "CT1000"
          }
        ]
      },
      {
        "name": "PITR-2000(열병합계)",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "PITR-2000(열병합계)",
            "type": "PITR"
          }
        ]
      },
      {
        "name": "PITR-5000(청평PP계)",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "PITR-5000(청평PP계)",
            "type": "PITR"
          }
        ]
      },
      {
        "name": "KepCIT",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "KepCIT",
            "type": "KEPCIT"
          }
        ]
      },
      {
        "name": "소형광단국",
        "rackType": "RACK-MINI-OPT",
        "equipment": [
          {
            "name": "송광치 PTPU 서홍천-열병합",
            "type": "PTPU"
          },
          {
            "name": "청평계 PTPU",
            "type": "PTPU"
          },
          {
            "name": "P32T(서홍천-청평양수)",
            "type": "PCM"
          }
        ]
      },
      {
        "name": "통신랙",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "L3 스위치",
            "type": "SW-L3"
          },
          {
            "name": "PoE 스위치",
            "type": "SW-POE"
          },
          {
            "name": "PIA",
            "type": "PIA"
          },
          {
            "name": "RTU 광스위치",
            "type": "OPT-SW"
          }
        ]
      },
      {
        "name": "냉난방기(3층)",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "냉난방기(3층)",
            "type": "HVAC-AC"
          }
        ]
      },
      {
        "name": "에어컨(1층)",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "에어컨(1층)",
            "type": "HVAC-AC"
          }
        ]
      },
      {
        "name": "감시정보",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "감시정보",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "M.Tr#2 감시정보",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "M.Tr#2 감시정보",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "IP기반 유무선 통신교환장치",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "IP기반 유무선 통신교환장치",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "배전전력구 감시시스템",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "배전전력구 감시시스템",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "IP급전 사령원콘솔",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "IP급전 사령원콘솔",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "IP급전 스위치",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "IP급전 스위치",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "PDAS",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "PDAS",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "LGU+ PDP",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "LGU+ PDP",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "접지함체",
        "rackType": "RACK-WALL",
        "equipment": [
          {
            "name": "접지함체",
            "type": "GROUND-BOX"
          }
        ]
      }
    ],
    "links": [
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "소내전원반",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            1
          ]
        },
        "b": {
          "equipment": "충전기 #2"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            2
          ]
        },
        "b": {
          "equipment": "충전기 #1"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            4
          ]
        },
        "b": {
          "equipment": "UPS"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            11
          ]
        },
        "b": {
          "equipment": "통합단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            12
          ]
        },
        "b": {
          "equipment": "감시정보"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            13
          ]
        },
        "b": {
          "equipment": "송변전광단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            15
          ]
        },
        "b": {
          "equipment": "M.Tr#2 감시정보"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            20
          ]
        },
        "b": {
          "equipment": "IP기반 유무선 통신교환장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            21
          ]
        },
        "b": {
          "equipment": "배전전력구 감시시스템"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            22
          ]
        },
        "b": {
          "equipment": "IP급전 사령원콘솔"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            23
          ]
        },
        "b": {
          "equipment": "IP급전 스위치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            24
          ]
        },
        "b": {
          "equipment": "PDAS"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            25
          ]
        },
        "b": {
          "equipment": "통합단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            26
          ]
        },
        "b": {
          "equipment": "PIA"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            27
          ]
        },
        "b": {
          "equipment": "PITR-5000(청평PP계)"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            31
          ]
        },
        "b": {
          "equipment": "LGU+ PDP"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            32
          ]
        },
        "b": {
          "equipment": "통합단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            33
          ]
        },
        "b": {
          "equipment": "P32T(서홍천-청평양수)"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            34
          ]
        },
        "b": {
          "equipment": "PITR-5000(청평PP계)"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            35
          ]
        },
        "b": {
          "equipment": "송변전광단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "충전기 #1",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "UPS",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "equipment": "UPS"
        },
        "b": {
          "equipment": "UPS 축전지반"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            2
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(A) FIBER:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            1
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(A) FIBER:2"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            7
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(B) FIBER:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            8
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(B) FIBER:2"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            3
          ]
        },
        "b": {
          "equipment": "송광치 PTPU 서홍천-열병합",
          "label": "WEST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            5
          ]
        },
        "b": {
          "equipment": "송광치 PTPU 서홍천-열병합",
          "label": "EAST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            11
          ]
        },
        "b": {
          "equipment": "RTU 광스위치",
          "label": "FX-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            12
          ]
        },
        "b": {
          "equipment": "RTU 광스위치",
          "label": "FX-TX:2"
        }
      }
    ]
  },
  "yeolbyeonghap": {
    "racks": [
      {
        "name": "소내전원반",
        "rackType": "RACK-PANEL",
        "equipment": [
          {
            "name": "소내전원반",
            "type": "AC-HOUSE",
            "circuits": [
              {
                "no": 1,
                "label": "통신실",
                "current": "AC",
                "capacity": null
              }
            ]
          }
        ]
      },
      {
        "name": "통신용 분전반",
        "rackType": "RACK-PANEL",
        "equipment": [
          {
            "name": "통신용 분전반",
            "type": "PWR-PANEL"
          }
        ]
      },
      {
        "name": "충전기 #1",
        "rackType": "RACK-CHARGER",
        "equipment": [
          {
            "name": "충전기 #1",
            "type": "CHARGER",
            "circuits": [
              {
                "no": 1,
                "label": "SID-125 1",
                "current": "DC",
                "capacity": null
              }
            ]
          },
          {
            "name": "충전기 #1 축전지",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "UPS",
        "rackType": "RACK-UPS",
        "equipment": [
          {
            "name": "UPS",
            "type": "UPS",
            "circuits": [
              {
                "no": 1,
                "label": "UPS 절체 스위치 1",
                "current": "AC",
                "capacity": null
              }
            ]
          }
        ]
      },
      {
        "name": "UPS 축전지반",
        "rackType": "RACK-BATTERY",
        "equipment": [
          {
            "name": "UPS 축전지반",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "항온항습기",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "항온항습기",
            "type": "HVAC-CRAC"
          }
        ]
      },
      {
        "name": "송변전광단말장치",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "송변전광단말장치",
            "type": "OTE"
          }
        ]
      },
      {
        "name": "통합단말장치",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "통합단말장치",
            "type": "CT1000"
          }
        ]
      },
      {
        "name": "PITR-5000(남춘천·청평PP)",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "PITR-5000(남춘천·청평PP)",
            "type": "PITR"
          }
        ]
      },
      {
        "name": "PITR-2000(서홍천)",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "PITR-2000(서홍천)",
            "type": "PITR"
          }
        ]
      },
      {
        "name": "소형광단국",
        "rackType": "RACK-MINI-OPT",
        "equipment": [
          {
            "name": "통합PTP 남춘천-열병합",
            "type": "PTPU"
          },
          {
            "name": "통합PTP 청평PP-열병합",
            "type": "PTPU"
          },
          {
            "name": "통합PTP 홍천-남춘천",
            "type": "PTPU"
          },
          {
            "name": "송광치 PTPU 서홍천-열병합",
            "type": "PTPU"
          },
          {
            "name": "OMS(서홍천계)",
            "type": "OMS"
          }
        ]
      },
      {
        "name": "통신랙",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "L3 스위치(IP급전용)",
            "type": "SW-L3"
          },
          {
            "name": "L2 스위치(OA #1)",
            "type": "SW-L2"
          },
          {
            "name": "L2 스위치(OA #2)",
            "type": "SW-L2"
          },
          {
            "name": "PoE 스위치",
            "type": "SW-POE"
          },
          {
            "name": "EPIA",
            "type": "PIA"
          },
          {
            "name": "E-CSU",
            "type": "CSU-DSU"
          },
          {
            "name": "RTU 광스위치",
            "type": "OPT-SW"
          }
        ]
      },
      {
        "name": "C-MUX(파워콤)",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "C-MUX(파워콤)",
            "type": "EXT"
          }
        ]
      }
    ],
    "links": [
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "소내전원반",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "충전기 #1",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "UPS",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "equipment": "UPS"
        },
        "b": {
          "equipment": "UPS 축전지반"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            2
          ]
        },
        "b": {
          "equipment": "통합PTP 남춘천-열병합",
          "label": "WEST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            1
          ]
        },
        "b": {
          "equipment": "통합PTP 남춘천-열병합",
          "label": "WEST-RX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            6
          ]
        },
        "b": {
          "equipment": "통합PTP 남춘천-열병합",
          "label": "EAST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            5
          ]
        },
        "b": {
          "equipment": "통합PTP 남춘천-열병합",
          "label": "EAST-RX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            3
          ]
        },
        "b": {
          "equipment": "RTU 광스위치",
          "label": "FX-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            11
          ]
        },
        "b": {
          "equipment": "RTU 광스위치",
          "label": "FX-TX:2"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            8
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(A) FIBER:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            7
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(A) FIBER:2"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            1
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(B) FIBER:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            2
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(B) FIBER:2"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            3
          ]
        },
        "b": {
          "equipment": "송광치 PTPU 서홍천-열병합",
          "label": "EAST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            5
          ]
        },
        "b": {
          "equipment": "송광치 PTPU 서홍천-열병합",
          "label": "WEST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            7
          ]
        },
        "b": {
          "core": [
            4,
            11
          ]
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            8
          ]
        },
        "b": {
          "core": [
            4,
            12
          ]
        }
      }
    ]
  },
  "inje": {
    "racks": [
      {
        "name": "소내전원반",
        "rackType": "RACK-PANEL",
        "equipment": [
          {
            "name": "소내전원반",
            "type": "AC-HOUSE",
            "circuits": [
              {
                "no": 1,
                "label": "2층 소내분전반 29번",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 2,
                "label": "2층 소내분전반 31번",
                "current": "AC",
                "capacity": null
              }
            ]
          }
        ]
      },
      {
        "name": "통신용 분전반",
        "rackType": "RACK-PANEL",
        "equipment": [
          {
            "name": "통신용 분전반",
            "type": "PWR-PANEL",
            "circuits": [
              {
                "no": 1,
                "label": "충전기#1",
                "current": "AC",
                "capacity": "100A"
              },
              {
                "no": 2,
                "label": "SPARE",
                "current": "AC",
                "capacity": "100A"
              },
              {
                "no": 3,
                "label": "감시UPS",
                "current": "AC",
                "capacity": "100A"
              },
              {
                "no": 4,
                "label": "AC MAIN",
                "current": "AC",
                "capacity": "100A"
              },
              {
                "no": 5,
                "label": "소형광 랙",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 6,
                "label": "PCM 랙",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 7,
                "label": "VDF 랙",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 8,
                "label": "SPARE",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 9,
                "label": "통합단말 랙",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 10,
                "label": "배전전력구감시",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 11,
                "label": "IP기반유무선통신",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 12,
                "label": "송광치AC",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 13,
                "label": "송광치 콘센트",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 14,
                "label": "SPARE",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 15,
                "label": "SPARE",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 16,
                "label": "SPARE",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 17,
                "label": "SPARE",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 18,
                "label": "SPARE",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 19,
                "label": "SPARE",
                "current": "AC",
                "capacity": "15A"
              },
              {
                "no": 20,
                "label": "SPARE",
                "current": "DC",
                "capacity": "50A"
              },
              {
                "no": 21,
                "label": "SPARE",
                "current": "DC",
                "capacity": "50A"
              },
              {
                "no": 22,
                "label": "SPARE",
                "current": "DC",
                "capacity": "50A"
              },
              {
                "no": 23,
                "label": "통합단말A",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 24,
                "label": "통합단말B",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 25,
                "label": "SPARE",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 26,
                "label": "SPARE",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 27,
                "label": "PITR5000랙#A",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 28,
                "label": "PIA",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 29,
                "label": "PCM",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 30,
                "label": "OMS",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 31,
                "label": "통합PTP DC",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 32,
                "label": "송광치 DC#A",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 33,
                "label": "SPARE",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 34,
                "label": "SPARE",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 35,
                "label": "SPARE",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 36,
                "label": "KT",
                "current": "DC",
                "capacity": "20A"
              }
            ]
          }
        ]
      },
      {
        "name": "소형 AC 분전반",
        "rackType": "RACK-PANEL",
        "equipment": [
          {
            "name": "소형 AC 분전반",
            "type": "PWR-PANEL",
            "circuits": [
              {
                "no": 1,
                "label": "1 항온항습기",
                "current": "AC",
                "capacity": "60A"
              },
              {
                "no": 2,
                "label": "2 SPARE",
                "current": "AC",
                "capacity": "60A"
              },
              {
                "no": 3,
                "label": "3 SPARE",
                "current": "AC",
                "capacity": "60A"
              },
              {
                "no": 4,
                "label": "4 SPARE",
                "current": "AC",
                "capacity": "60A"
              },
              {
                "no": 5,
                "label": "5 SPARE",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 6,
                "label": "6 SPARE",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 7,
                "label": "7 SPARE",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 8,
                "label": "8 SPARE",
                "current": "AC",
                "capacity": "30A"
              }
            ]
          }
        ]
      },
      {
        "name": "충전기 #1",
        "rackType": "RACK-CHARGER",
        "equipment": [
          {
            "name": "충전기 #1",
            "type": "CHARGER",
            "circuits": [
              {
                "no": 1,
                "label": "SID-125 1",
                "current": "DC",
                "capacity": null
              }
            ]
          },
          {
            "name": "충전기 #1 축전지",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "충전기 #2",
        "rackType": "RACK-CHARGER",
        "equipment": [
          {
            "name": "충전기 #2",
            "type": "CHARGER"
          },
          {
            "name": "충전기 #2 축전지",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "UPS",
        "rackType": "RACK-UPS",
        "equipment": [
          {
            "name": "UPS",
            "type": "UPS",
            "circuits": [
              {
                "no": 1,
                "label": "소형 UPS 1",
                "current": "AC",
                "capacity": null
              }
            ]
          }
        ]
      },
      {
        "name": "UPS 축전지반",
        "rackType": "RACK-BATTERY",
        "equipment": [
          {
            "name": "UPS 축전지반",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "송변전광단말장치",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "송변전광단말장치",
            "type": "OTE"
          }
        ]
      },
      {
        "name": "통합단말장치",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "통합단말장치",
            "type": "CT1000"
          }
        ]
      },
      {
        "name": "PITR-5000",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "PITR-5000",
            "type": "PITR"
          }
        ]
      },
      {
        "name": "KepCIT(MSPP 2.5G)",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "KepCIT(MSPP 2.5G)",
            "type": "KEPCIT"
          }
        ]
      },
      {
        "name": "소형광단국 #1",
        "rackType": "RACK-MINI-OPT",
        "equipment": [
          {
            "name": "PTPU 인제-간성",
            "type": "PTPU"
          },
          {
            "name": "통합PTP 상남-인제",
            "type": "PTPU"
          },
          {
            "name": "통합PTP 인제-신양양",
            "type": "PTPU"
          }
        ]
      },
      {
        "name": "소형광단국 #2",
        "rackType": "RACK-MINI-OPT",
        "equipment": [
          {
            "name": "송광치 PTPU 인제-양구",
            "type": "PTPU"
          },
          {
            "name": "OMS-5116 인제-상남",
            "type": "OMS"
          },
          {
            "name": "PCM",
            "type": "PCM"
          }
        ]
      },
      {
        "name": "통신랙",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "L3 스위치",
            "type": "SW-L3"
          },
          {
            "name": "L2 스위치",
            "type": "SW-L2"
          },
          {
            "name": "PoE 스위치",
            "type": "SW-POE"
          },
          {
            "name": "PIA",
            "type": "PIA"
          },
          {
            "name": "RTU 광스위치",
            "type": "OPT-SW"
          }
        ]
      },
      {
        "name": "냉난방기",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "냉난방기",
            "type": "HVAC-AC"
          }
        ]
      },
      {
        "name": "KT 장비",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "KT 장비",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "배전전력구 감시",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "배전전력구 감시",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "IP기반 유무선통신",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "IP기반 유무선통신",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "접지함체",
        "rackType": "RACK-WALL",
        "equipment": [
          {
            "name": "접지함체",
            "type": "GROUND-BOX"
          }
        ]
      }
    ],
    "links": [
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "소내전원반",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "소내전원반",
            2
          ]
        },
        "b": {
          "equipment": "소형 AC 분전반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            1
          ]
        },
        "b": {
          "equipment": "충전기 #1"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            3
          ]
        },
        "b": {
          "equipment": "UPS"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            10
          ]
        },
        "b": {
          "equipment": "배전전력구 감시"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            11
          ]
        },
        "b": {
          "equipment": "IP기반 유무선통신"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            12
          ]
        },
        "b": {
          "equipment": "송변전광단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            23
          ]
        },
        "b": {
          "equipment": "통합단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            24
          ]
        },
        "b": {
          "equipment": "통합단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            27
          ]
        },
        "b": {
          "equipment": "PITR-5000"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            28
          ]
        },
        "b": {
          "equipment": "PIA"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            29
          ]
        },
        "b": {
          "equipment": "PCM"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            30
          ]
        },
        "b": {
          "equipment": "OMS-5116 인제-상남"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            32
          ]
        },
        "b": {
          "equipment": "송변전광단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            36
          ]
        },
        "b": {
          "equipment": "KT 장비"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "충전기 #1",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "equipment": "UPS"
        },
        "b": {
          "equipment": "UPS 축전지반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "UPS",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            4,
            1
          ]
        },
        "b": {
          "equipment": "송광치 PTPU 인제-양구",
          "label": "EAST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            4,
            2
          ]
        },
        "b": {
          "equipment": "송광치 PTPU 인제-양구",
          "label": "WEST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            4,
            3
          ]
        },
        "b": {
          "equipment": "RTU 광스위치",
          "label": "FX-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            4,
            17
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(A) FIBER:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            4,
            18
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(A) FIBER:2"
        }
      }
    ]
  },
  "yanggu": {
    "racks": [
      {
        "name": "소내전원반",
        "rackType": "RACK-PANEL",
        "equipment": [
          {
            "name": "소내전원반",
            "type": "AC-HOUSE",
            "circuits": [
              {
                "no": 1,
                "label": "2층 소내분전반 9번",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 2,
                "label": "2층 소내분전반 16번",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 3,
                "label": "2층 소내분전반 27번",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 4,
                "label": "2층 소내분전반 34번",
                "current": "AC",
                "capacity": null
              }
            ]
          }
        ]
      },
      {
        "name": "통신용 분전반",
        "rackType": "RACK-PANEL",
        "equipment": [
          {
            "name": "통신용 분전반",
            "type": "PWR-PANEL",
            "circuits": [
              {
                "no": 1,
                "label": "충전기(상용)",
                "current": "AC",
                "capacity": "50A"
              },
              {
                "no": 2,
                "label": "SPARE(상용)",
                "current": "AC",
                "capacity": "50A"
              },
              {
                "no": 3,
                "label": "SPARE",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 4,
                "label": "SPARE",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 5,
                "label": "소형광랙",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 6,
                "label": "PCM랙",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 7,
                "label": "VDP랙",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 8,
                "label": "LAN,급전",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 9,
                "label": "급전 1층",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 10,
                "label": "송광치",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 11,
                "label": "감시정보",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 12,
                "label": "통합단말",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 13,
                "label": "소형광",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 14,
                "label": "PIA",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 15,
                "label": "EPIA",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 16,
                "label": "SPARE",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 17,
                "label": "SPARE",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 18,
                "label": "SPARE",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 19,
                "label": "SPARE",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 20,
                "label": "SPARE",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 21,
                "label": "SPARE",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 22,
                "label": "LG파워콤",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 23,
                "label": "통합단말 #A",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 24,
                "label": "통합단말 #B",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 25,
                "label": "송광치",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 26,
                "label": "PITR5000",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 27,
                "label": "PITR5000",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 28,
                "label": "SPARE",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 29,
                "label": "SPARE",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 30,
                "label": "SPARE",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 31,
                "label": "SPARE",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 32,
                "label": "LG파워콤",
                "current": "DC",
                "capacity": "30A"
              }
            ]
          }
        ]
      },
      {
        "name": "소형 AC 분전반",
        "rackType": "RACK-PANEL",
        "equipment": [
          {
            "name": "소형 AC 분전반",
            "type": "PWR-PANEL",
            "circuits": [
              {
                "no": 1,
                "label": "1 SPARE",
                "current": "AC",
                "capacity": "60A"
              },
              {
                "no": 2,
                "label": "2 SPARE",
                "current": "AC",
                "capacity": "60A"
              },
              {
                "no": 3,
                "label": "3 SPARE",
                "current": "AC",
                "capacity": "60A"
              },
              {
                "no": 4,
                "label": "4 SPARE",
                "current": "AC",
                "capacity": "60A"
              },
              {
                "no": 5,
                "label": "5 VDF",
                "current": "AC",
                "capacity": "20A"
              },
              {
                "no": 6,
                "label": "6 LAN 랙",
                "current": "AC",
                "capacity": "20A"
              },
              {
                "no": 7,
                "label": "7 KT 광단국",
                "current": "AC",
                "capacity": "20A"
              },
              {
                "no": 8,
                "label": "8 SPARE",
                "current": "AC",
                "capacity": "20A"
              }
            ]
          }
        ]
      },
      {
        "name": "충전기 #1",
        "rackType": "RACK-CHARGER",
        "equipment": [
          {
            "name": "충전기 #1",
            "type": "CHARGER",
            "circuits": [
              {
                "no": 1,
                "label": "SID-125 1",
                "current": "DC",
                "capacity": null
              }
            ]
          },
          {
            "name": "충전기 #1 축전지",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "UPS",
        "rackType": "RACK-UPS",
        "equipment": [
          {
            "name": "UPS",
            "type": "UPS",
            "circuits": [
              {
                "no": 1,
                "label": "소형 UPS 1",
                "current": "AC",
                "capacity": null
              }
            ]
          }
        ]
      },
      {
        "name": "UPS 축전지반",
        "rackType": "RACK-BATTERY",
        "equipment": [
          {
            "name": "UPS 축전지반",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "송변전광단말장치",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "송변전광단말장치",
            "type": "OTE"
          }
        ]
      },
      {
        "name": "통합단말장치",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "통합단말장치",
            "type": "CT1000"
          }
        ]
      },
      {
        "name": "PITR-5000(양구-인제계)",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "PITR-5000(양구-인제계)",
            "type": "PITR"
          }
        ]
      },
      {
        "name": "PITR-2000D(인제계)",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "PITR-2000D(인제계)",
            "type": "PITR"
          }
        ]
      },
      {
        "name": "소형광단국",
        "rackType": "RACK-MINI-OPT",
        "equipment": [
          {
            "name": "송광치 PTPU 인제-양구",
            "type": "PTPU"
          },
          {
            "name": "PTPU 양구-상남",
            "type": "PTPU"
          },
          {
            "name": "화천계 PTPU",
            "type": "PTPU"
          },
          {
            "name": "OMS 5116 양구-상남",
            "type": "OMS"
          },
          {
            "name": "PCM",
            "type": "PCM"
          }
        ]
      },
      {
        "name": "통신랙",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "L3 스위치",
            "type": "SW-L3"
          },
          {
            "name": "L2 스위치",
            "type": "SW-L2"
          },
          {
            "name": "PoE 스위치",
            "type": "SW-POE"
          },
          {
            "name": "PIA",
            "type": "PIA"
          },
          {
            "name": "EPIA",
            "type": "PIA"
          },
          {
            "name": "RTU 광스위치",
            "type": "OPT-SW"
          }
        ]
      },
      {
        "name": "냉난방기",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "냉난방기",
            "type": "HVAC-AC"
          }
        ]
      },
      {
        "name": "KT 광단국",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "KT 광단국",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "감시정보",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "감시정보",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "LG파워콤",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "LG파워콤",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "IP급전(1층)",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "IP급전(1층)",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "접지함체",
        "rackType": "RACK-WALL",
        "equipment": [
          {
            "name": "접지함체",
            "type": "GROUND-BOX"
          }
        ]
      }
    ],
    "links": [
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "소내전원반",
            3
          ]
        },
        "b": {
          "equipment": "소형 AC 분전반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "소내전원반",
            4
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "소형 AC 분전반",
            7
          ]
        },
        "b": {
          "equipment": "KT 광단국"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            1
          ]
        },
        "b": {
          "equipment": "충전기 #1"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            9
          ]
        },
        "b": {
          "equipment": "IP급전(1층)"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            10
          ]
        },
        "b": {
          "equipment": "송변전광단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            11
          ]
        },
        "b": {
          "equipment": "감시정보"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            12
          ]
        },
        "b": {
          "equipment": "통합단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            22
          ]
        },
        "b": {
          "equipment": "LG파워콤"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            23
          ]
        },
        "b": {
          "equipment": "통합단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            24
          ]
        },
        "b": {
          "equipment": "통합단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            25
          ]
        },
        "b": {
          "equipment": "송변전광단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            26
          ]
        },
        "b": {
          "equipment": "PITR-5000(양구-인제계)"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            27
          ]
        },
        "b": {
          "equipment": "PITR-5000(양구-인제계)"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            32
          ]
        },
        "b": {
          "equipment": "LG파워콤"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "충전기 #1",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "equipment": "UPS"
        },
        "b": {
          "equipment": "UPS 축전지반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "UPS",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            1
          ]
        },
        "b": {
          "equipment": "송광치 PTPU 인제-양구",
          "label": "EAST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            2
          ]
        },
        "b": {
          "equipment": "송광치 PTPU 인제-양구",
          "label": "WEST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            3
          ]
        },
        "b": {
          "equipment": "RTU 광스위치",
          "label": "FX-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            3
          ]
        },
        "b": {
          "equipment": "RTU 광스위치",
          "label": "FX-TX:2"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            18
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(B) FIBER:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            17
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(B) FIBER:2"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            1
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(A) FIBER:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            2
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(A) FIBER:2"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            5
          ]
        },
        "b": {
          "equipment": "화천계 PTPU",
          "label": "WEST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            6
          ]
        },
        "b": {
          "equipment": "화천계 PTPU",
          "label": "EAST-TX:1"
        }
      }
    ]
  },
  "cheorwon": {
    "racks": [
      {
        "name": "소내전원반",
        "rackType": "RACK-PANEL",
        "equipment": [
          {
            "name": "소내전원반",
            "type": "AC-HOUSE",
            "circuits": [
              {
                "no": 1,
                "label": "1층 AC소내MAIN전원반 좌측 5번",
                "current": "AC",
                "capacity": null
              }
            ]
          }
        ]
      },
      {
        "name": "통신용 분전반",
        "rackType": "RACK-PANEL",
        "equipment": [
          {
            "name": "통신용 분전반",
            "type": "PWR-PANEL",
            "circuits": [
              {
                "no": 1,
                "label": "UPS입력",
                "current": "AC",
                "capacity": "50A"
              },
              {
                "no": 2,
                "label": "SPARE",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 3,
                "label": "SPARE",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 4,
                "label": "SPARE",
                "current": "AC",
                "capacity": "50A"
              },
              {
                "no": 5,
                "label": "신 UPS",
                "current": "AC",
                "capacity": "50A"
              },
              {
                "no": 6,
                "label": "신충전기",
                "current": "AC",
                "capacity": "50A"
              },
              {
                "no": 7,
                "label": "충전기입력",
                "current": "AC",
                "capacity": "50A"
              },
              {
                "no": 8,
                "label": "기상정보",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 9,
                "label": "소형광단국-3",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 10,
                "label": "통합단말AC",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 11,
                "label": "소형광단국-2",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 12,
                "label": "소형광단국-1",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 13,
                "label": "네트워크랙",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 14,
                "label": "RTU PNL",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 15,
                "label": "PITR5000 A/D 컨버터",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 16,
                "label": "AIU",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 17,
                "label": "EMC2000",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 18,
                "label": "원격취득",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 19,
                "label": "감시정보",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 20,
                "label": "PIA 랙",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 21,
                "label": "통합단말DC",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 22,
                "label": "SPARE",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 23,
                "label": "소형광단국1",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 24,
                "label": "SPARE",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 25,
                "label": "SPARE",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 26,
                "label": "(사용중)",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 27,
                "label": "SPARE",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 28,
                "label": "PITR-5000",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 29,
                "label": "PIA 전원감시",
                "current": "DC",
                "capacity": "20A"
              },
              {
                "no": 30,
                "label": "SPARE",
                "current": "DC",
                "capacity": "20A"
              }
            ]
          }
        ]
      },
      {
        "name": "충전기 #1",
        "rackType": "RACK-CHARGER",
        "equipment": [
          {
            "name": "충전기 #1",
            "type": "CHARGER",
            "circuits": [
              {
                "no": 1,
                "label": "SID-125 1",
                "current": "DC",
                "capacity": null
              }
            ]
          },
          {
            "name": "충전기 #1 축전지",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "UPS",
        "rackType": "RACK-UPS",
        "equipment": [
          {
            "name": "UPS",
            "type": "UPS",
            "circuits": [
              {
                "no": 1,
                "label": "소형 UPS 1",
                "current": "AC",
                "capacity": null
              }
            ]
          }
        ]
      },
      {
        "name": "UPS 축전지반",
        "rackType": "RACK-BATTERY",
        "equipment": [
          {
            "name": "UPS 축전지반",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "송변전광단말장치",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "송변전광단말장치",
            "type": "OTE"
          }
        ]
      },
      {
        "name": "통합단말장치",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "통합단말장치",
            "type": "CT1000"
          }
        ]
      },
      {
        "name": "PITR-5000",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "PITR-5000",
            "type": "PITR"
          }
        ]
      },
      {
        "name": "소형광단국-1",
        "rackType": "RACK-MINI-OPT",
        "equipment": [
          {
            "name": "운천계 OMS",
            "type": "OMS"
          },
          {
            "name": "통합PTP 철원-화천",
            "type": "PTPU"
          }
        ]
      },
      {
        "name": "소형광단국-2",
        "rackType": "RACK-MINI-OPT",
        "equipment": []
      },
      {
        "name": "소형광단국-3",
        "rackType": "RACK-MINI-OPT",
        "equipment": []
      },
      {
        "name": "통신랙",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "L3 스위치",
            "type": "SW-L3"
          },
          {
            "name": "L2 스위치",
            "type": "SW-L2"
          },
          {
            "name": "PoE 스위치",
            "type": "SW-POE"
          },
          {
            "name": "PIA",
            "type": "PIA"
          },
          {
            "name": "RTU 광스위치",
            "type": "OPT-SW"
          }
        ]
      },
      {
        "name": "냉난방기",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "냉난방기",
            "type": "HVAC-AC"
          }
        ]
      },
      {
        "name": "기상정보",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "기상정보",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "RTU PNL",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "RTU PNL",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "AIU",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "AIU",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "EMC2000",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "EMC2000",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "원격취득",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "원격취득",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "감시정보",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "감시정보",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "접지함체",
        "rackType": "RACK-WALL",
        "equipment": [
          {
            "name": "접지함체",
            "type": "GROUND-BOX"
          }
        ]
      }
    ],
    "links": [
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "소내전원반",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            1
          ]
        },
        "b": {
          "equipment": "UPS"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            7
          ]
        },
        "b": {
          "equipment": "충전기 #1"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            8
          ]
        },
        "b": {
          "equipment": "기상정보"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            10
          ]
        },
        "b": {
          "equipment": "통합단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            14
          ]
        },
        "b": {
          "equipment": "RTU PNL"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            16
          ]
        },
        "b": {
          "equipment": "AIU"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            17
          ]
        },
        "b": {
          "equipment": "EMC2000"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            18
          ]
        },
        "b": {
          "equipment": "원격취득"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            19
          ]
        },
        "b": {
          "equipment": "감시정보"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            21
          ]
        },
        "b": {
          "equipment": "통합단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            23
          ]
        },
        "b": {
          "equipment": "운천계 OMS"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            28
          ]
        },
        "b": {
          "equipment": "PITR-5000"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            29
          ]
        },
        "b": {
          "equipment": "PIA"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "충전기 #1",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "equipment": "UPS"
        },
        "b": {
          "equipment": "UPS 축전지반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "UPS",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            7
          ]
        },
        "b": {
          "equipment": "RTU 광스위치",
          "label": "FX-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            13
          ]
        },
        "b": {
          "equipment": "RTU 광스위치",
          "label": "FX-TX:2"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            10
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(B) FIBER:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            9
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(B) FIBER:2"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            17
          ]
        },
        "b": {
          "equipment": "통합PTP 철원-화천",
          "label": "EAST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            18
          ]
        },
        "b": {
          "equipment": "통합PTP 철원-화천",
          "label": "WEST-TX:1"
        }
      }
    ]
  },
  "hwacheon": {
    "racks": [
      {
        "name": "소내전원반",
        "rackType": "RACK-PANEL",
        "equipment": [
          {
            "name": "소내전원반",
            "type": "AC-HOUSE",
            "circuits": [
              {
                "no": 1,
                "label": "소내전원반 1번",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 2,
                "label": "소내전원반 11번",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 3,
                "label": "소내전원반 34번",
                "current": "AC",
                "capacity": null
              },
              {
                "no": 4,
                "label": "소내분전반#1-24",
                "current": "AC",
                "capacity": null
              }
            ]
          }
        ]
      },
      {
        "name": "통신용 분전반",
        "rackType": "RACK-PANEL",
        "equipment": [
          {
            "name": "통신용 분전반",
            "type": "PWR-PANEL",
            "circuits": [
              {
                "no": 1,
                "label": "정류기#1",
                "current": "AC",
                "capacity": "50A"
              },
              {
                "no": 2,
                "label": "정류기#2",
                "current": "AC",
                "capacity": "50A"
              },
              {
                "no": 3,
                "label": "통단AC",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 4,
                "label": "배전전력구 AC",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 5,
                "label": "IP기반 유무선통신장치",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 6,
                "label": "송광치 상용",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 7,
                "label": "SPARE",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 8,
                "label": "감시정보",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 9,
                "label": "IP급전콘솔 전원(1층)",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 10,
                "label": "LAN,IP급전 S/W",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 11,
                "label": "SCADA RTU AC Main",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 12,
                "label": "송광 UPS AC",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 13,
                "label": "광단국",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 14,
                "label": "PIA",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 15,
                "label": "SPARE",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 16,
                "label": "MSPP(주)",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 17,
                "label": "송광 DC",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 18,
                "label": "SPARE",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 19,
                "label": "SPARE",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 20,
                "label": "SPARE",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 21,
                "label": "SPARE",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 22,
                "label": "SPARE",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 23,
                "label": "통단DC#B",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 24,
                "label": "SPARE",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 25,
                "label": "SPARE",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 26,
                "label": "SPARE",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 27,
                "label": "SPARE",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 28,
                "label": "SPARE",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 29,
                "label": "SPARE",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 30,
                "label": "SPARE",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 31,
                "label": "SPARE",
                "current": "DC",
                "capacity": "30A"
              },
              {
                "no": 32,
                "label": "SPARE",
                "current": "DC",
                "capacity": "30A"
              }
            ]
          }
        ]
      },
      {
        "name": "소형 AC 분전반",
        "rackType": "RACK-PANEL",
        "equipment": [
          {
            "name": "소형 AC 분전반",
            "type": "PWR-PANEL",
            "circuits": [
              {
                "no": 1,
                "label": "1 항온항습기",
                "current": "AC",
                "capacity": "60A"
              },
              {
                "no": 2,
                "label": "2 감시정보 UPS",
                "current": "AC",
                "capacity": "60A"
              },
              {
                "no": 3,
                "label": "3 SPARE",
                "current": "AC",
                "capacity": "60A"
              },
              {
                "no": 4,
                "label": "4 SPARE",
                "current": "AC",
                "capacity": "60A"
              },
              {
                "no": 5,
                "label": "5 SPARE",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 6,
                "label": "6 SPARE",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 7,
                "label": "7 파워콤장비",
                "current": "AC",
                "capacity": "30A"
              },
              {
                "no": 8,
                "label": "8 SPARE",
                "current": "AC",
                "capacity": "30A"
              }
            ]
          }
        ]
      },
      {
        "name": "충전기 #1",
        "rackType": "RACK-CHARGER",
        "equipment": [
          {
            "name": "충전기 #1",
            "type": "CHARGER",
            "circuits": [
              {
                "no": 1,
                "label": "SID-125 1",
                "current": "DC",
                "capacity": null
              }
            ]
          },
          {
            "name": "충전기 #1 축전지",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "충전기 #2",
        "rackType": "RACK-CHARGER",
        "equipment": [
          {
            "name": "충전기 #2",
            "type": "CHARGER"
          },
          {
            "name": "충전기 #2 축전지",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "충전기 #3",
        "rackType": "RACK-CHARGER",
        "equipment": [
          {
            "name": "충전기 #3",
            "type": "CHARGER"
          },
          {
            "name": "충전기 #3 축전지",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "UPS",
        "rackType": "RACK-UPS",
        "equipment": [
          {
            "name": "UPS",
            "type": "UPS",
            "circuits": [
              {
                "no": 1,
                "label": "소형 UPS 1",
                "current": "AC",
                "capacity": null
              }
            ]
          }
        ]
      },
      {
        "name": "UPS 축전지반",
        "rackType": "RACK-BATTERY",
        "equipment": [
          {
            "name": "UPS 축전지반",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "송변전광단말장치",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "송변전광단말장치",
            "type": "OTE"
          }
        ]
      },
      {
        "name": "통합단말장치",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "통합단말장치",
            "type": "CT1000"
          }
        ]
      },
      {
        "name": "PITR-5000(화천H/P계)",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "PITR-5000(화천H/P계)",
            "type": "PITR"
          }
        ]
      },
      {
        "name": "PITR-5000(철원계)",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "PITR-5000(철원계)",
            "type": "PITR"
          }
        ]
      },
      {
        "name": "KepCIT",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "KepCIT",
            "type": "KEPCIT"
          }
        ]
      },
      {
        "name": "KepCIT(MSPP)",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "KepCIT(MSPP)",
            "type": "KEPCIT"
          }
        ]
      },
      {
        "name": "소형광단국",
        "rackType": "RACK-MINI-OPT",
        "equipment": [
          {
            "name": "통합PTP 철원-화천",
            "type": "PTPU"
          },
          {
            "name": "통합PTP 화천-화천H/P",
            "type": "PTPU"
          }
        ]
      },
      {
        "name": "통신랙",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "L3 스위치",
            "type": "SW-L3"
          },
          {
            "name": "L2 스위치",
            "type": "SW-L2"
          },
          {
            "name": "PoE 스위치",
            "type": "SW-POE"
          },
          {
            "name": "PIA",
            "type": "PIA"
          },
          {
            "name": "CSU/DSU(화천H/P용) #1",
            "type": "CSU-DSU"
          },
          {
            "name": "CSU/DSU(화천H/P용) #2",
            "type": "CSU-DSU"
          },
          {
            "name": "RTU 광스위치",
            "type": "OPT-SW"
          }
        ]
      },
      {
        "name": "냉난방기",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "냉난방기",
            "type": "HVAC-AC"
          }
        ]
      },
      {
        "name": "배전전력구 감시",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "배전전력구 감시",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "IP기반 유무선통신장치",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "IP기반 유무선통신장치",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "감시정보",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "감시정보",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "IP급전",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "IP급전",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "SCADA RTU",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "SCADA RTU",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "파워콤",
        "rackType": "RACK-STANDALONE",
        "equipment": [
          {
            "name": "파워콤",
            "type": "EXT"
          }
        ]
      },
      {
        "name": "접지함체",
        "rackType": "RACK-WALL",
        "equipment": [
          {
            "name": "접지함체",
            "type": "GROUND-BOX"
          }
        ]
      }
    ],
    "links": [
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "소내전원반",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "소내전원반",
            2
          ]
        },
        "b": {
          "equipment": "소형 AC 분전반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "소형 AC 분전반",
            2
          ]
        },
        "b": {
          "equipment": "UPS"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "소형 AC 분전반",
            7
          ]
        },
        "b": {
          "equipment": "파워콤"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            1
          ]
        },
        "b": {
          "equipment": "충전기 #1"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            2
          ]
        },
        "b": {
          "equipment": "충전기 #2"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            3
          ]
        },
        "b": {
          "equipment": "통합단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            4
          ]
        },
        "b": {
          "equipment": "배전전력구 감시"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            5
          ]
        },
        "b": {
          "equipment": "IP기반 유무선통신장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            8
          ]
        },
        "b": {
          "equipment": "감시정보"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            9
          ]
        },
        "b": {
          "equipment": "IP급전"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            11
          ]
        },
        "b": {
          "equipment": "SCADA RTU"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            12
          ]
        },
        "b": {
          "equipment": "송변전광단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "통신용 분전반",
            23
          ]
        },
        "b": {
          "equipment": "통합단말장치"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "충전기 #1",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "equipment": "UPS"
        },
        "b": {
          "equipment": "UPS 축전지반"
        }
      },
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "UPS",
            1
          ]
        },
        "b": {
          "equipment": "통신용 분전반"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            2
          ]
        },
        "b": {
          "equipment": "RTU 광스위치",
          "label": "FX-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            7
          ]
        },
        "b": {
          "equipment": "RTU 광스위치",
          "label": "FX-TX:2"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            13
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(A) FIBER:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            14
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(A) FIBER:2"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            10
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(B) FIBER:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            9
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(B) FIBER:2"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            3
          ]
        },
        "b": {
          "equipment": "통합PTP 화천-화천H/P",
          "label": "WEST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            4
          ]
        },
        "b": {
          "equipment": "통합PTP 화천-화천H/P",
          "label": "WEST-RX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            17
          ]
        },
        "b": {
          "equipment": "통합PTP 철원-화천",
          "label": "EAST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            18
          ]
        },
        "b": {
          "equipment": "통합PTP 철원-화천",
          "label": "EAST-RX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            12
          ]
        },
        "b": {
          "core": [
            2,
            1
          ]
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            11
          ]
        },
        "b": {
          "core": [
            2,
            2
          ]
        }
      }
    ]
  },
  "hwacheonhp": {
    "racks": [
      {
        "name": "충전기 #1",
        "rackType": "RACK-CHARGER",
        "equipment": [
          {
            "name": "충전기 #1",
            "type": "CHARGER"
          },
          {
            "name": "충전기 #1 축전지",
            "type": "BATTERY"
          }
        ]
      },
      {
        "name": "송변전광단말장치",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "송변전광단말장치",
            "type": "OTE"
          }
        ]
      },
      {
        "name": "소형광단국",
        "rackType": "RACK-MINI-OPT",
        "equipment": [
          {
            "name": "양구계 PTPU",
            "type": "PTPU"
          },
          {
            "name": "통합PTP 북춘천-화천H/P",
            "type": "PTPU"
          },
          {
            "name": "통합PTP 화천-화천H/P",
            "type": "PTPU"
          },
          {
            "name": "송광PTP 화천H/P-북춘천",
            "type": "PTPU"
          },
          {
            "name": "I-MUX",
            "type": "I-MUX"
          },
          {
            "name": "P-32T",
            "type": "PCM"
          },
          {
            "name": "소형 UPS",
            "type": "UPS",
            "circuits": [
              {
                "no": 1,
                "label": "소형 UPS 1",
                "current": "AC",
                "capacity": null
              }
            ]
          }
        ]
      },
      {
        "name": "한전 LAN랙",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "L2 스위치",
            "type": "SW-L2"
          },
          {
            "name": "FA망 방화벽",
            "type": "UTM"
          }
        ]
      }
    ],
    "links": [
      {
        "cable": "F-CV",
        "a": {
          "circuit": [
            "소형 UPS",
            1
          ]
        },
        "b": {
          "equipment": "양구계 PTPU"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            1
          ]
        },
        "b": {
          "equipment": "송광PTP 화천H/P-북춘천",
          "label": "EAST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            2
          ]
        },
        "b": {
          "equipment": "송광PTP 화천H/P-북춘천",
          "label": "WEST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            12
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(A) FIBER:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            11
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(A) FIBER:2"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            1
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(B) FIBER:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            2
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(B) FIBER:2"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            4
          ]
        },
        "b": {
          "equipment": "통합PTP 화천-화천H/P",
          "label": "EAST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            3
          ]
        },
        "b": {
          "equipment": "통합PTP 화천-화천H/P",
          "label": "EAST-RX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            5
          ]
        },
        "b": {
          "equipment": "양구계 PTPU",
          "label": "EAST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            6
          ]
        },
        "b": {
          "equipment": "양구계 PTPU",
          "label": "WEST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            9
          ]
        },
        "b": {
          "core": [
            2,
            13
          ]
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            10
          ]
        },
        "b": {
          "core": [
            2,
            14
          ]
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            13
          ]
        },
        "b": {
          "core": [
            2,
            15
          ]
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            14
          ]
        },
        "b": {
          "core": [
            2,
            16
          ]
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            7
          ]
        },
        "b": {
          "core": [
            2,
            23
          ]
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            8
          ]
        },
        "b": {
          "core": [
            2,
            24
          ]
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            1,
            20
          ]
        },
        "b": {
          "core": [
            2,
            1
          ]
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            2
          ]
        },
        "b": {
          "core": [
            3,
            3
          ]
        }
      }
    ]
  },
  "chuncheonhp": {
    "racks": [
      {
        "name": "송변전광단말장치",
        "rackType": "RACK-19",
        "equipment": [
          {
            "name": "송변전광단말장치",
            "type": "OTE"
          }
        ]
      },
      {
        "name": "소형광단국",
        "rackType": "RACK-MINI-OPT",
        "equipment": [
          {
            "name": "통합PTP 북춘천-가평",
            "type": "PTPU"
          },
          {
            "name": "통합PTP 북춘천-춘천H/P",
            "type": "PTPU"
          },
          {
            "name": "통합PTP 북춘천-화천H/P",
            "type": "PTPU"
          },
          {
            "name": "송광PTP 화천H/P-북춘천",
            "type": "PTPU"
          },
          {
            "name": "OMS-5116 춘천H/P-가평",
            "type": "OMS"
          },
          {
            "name": "I-MUX(북춘천-춘천H/P)",
            "type": "I-MUX"
          }
        ]
      }
    ],
    "links": [
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            5
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(A) FIBER:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            6
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(A) FIBER:2"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            4,
            4
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(B) FIBER:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            4,
            1
          ]
        },
        "b": {
          "equipment": "송변전광단말장치",
          "label": "CTRU(B) FIBER:2"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            1
          ]
        },
        "b": {
          "equipment": "송광PTP 화천H/P-북춘천",
          "label": "EAST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            2
          ]
        },
        "b": {
          "equipment": "송광PTP 화천H/P-북춘천",
          "label": "WEST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            1
          ]
        },
        "b": {
          "equipment": "통합PTP 북춘천-춘천H/P",
          "label": "EAST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            2
          ]
        },
        "b": {
          "equipment": "통합PTP 북춘천-춘천H/P",
          "label": "EAST-RX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            7
          ]
        },
        "b": {
          "equipment": "통합PTP 북춘천-춘천H/P",
          "label": "WEST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            8
          ]
        },
        "b": {
          "equipment": "통합PTP 북춘천-춘천H/P",
          "label": "WEST-RX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            3
          ]
        },
        "b": {
          "equipment": "통합PTP 북춘천-화천H/P",
          "label": "EAST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            4
          ]
        },
        "b": {
          "equipment": "통합PTP 북춘천-화천H/P",
          "label": "EAST-RX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            5
          ]
        },
        "b": {
          "equipment": "I-MUX(북춘천-춘천H/P)",
          "label": "TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            6
          ]
        },
        "b": {
          "equipment": "I-MUX(북춘천-춘천H/P)",
          "label": "RX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            15
          ]
        },
        "b": {
          "equipment": "통합PTP 북춘천-가평",
          "label": "EAST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            3,
            16
          ]
        },
        "b": {
          "equipment": "통합PTP 북춘천-가평",
          "label": "EAST-RX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            4,
            9
          ]
        },
        "b": {
          "equipment": "통합PTP 북춘천-가평",
          "label": "WEST-TX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            4,
            10
          ]
        },
        "b": {
          "equipment": "통합PTP 북춘천-가평",
          "label": "WEST-RX:1"
        }
      },
      {
        "cable": "FIBER-JUMPER",
        "a": {
          "core": [
            2,
            20
          ]
        },
        "b": {
          "core": [
            3,
            9
          ]
        }
      }
    ]
  }
};
