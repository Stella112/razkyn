/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/razkyn_spike.json`.
 */
export type RazkynSpike = {
  "address": "AQ9D9GCfwopEQCRjqFzykJgxG3QnWEZrxSDz3WjZKTj6",
  "metadata": {
    "name": "razkynSpike",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "RAZKYN M0 devnet spikes (S1-S6). Throwaway; not the game program."
  },
  "instructions": [
    {
      "name": "commitWithAction",
      "docs": [
        "ER: commit + undelegate Probe with one post-commit action `set_flag(fail)` on base."
      ],
      "discriminator": [
        243,
        142,
        64,
        226,
        226,
        129,
        248,
        140
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "probe",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  98,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "probe.id",
                "account": "probe"
              }
            ]
          }
        },
        {
          "name": "flag",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  108,
                  97,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "probe.id",
                "account": "probe"
              }
            ]
          }
        },
        {
          "name": "programId",
          "address": "AQ9D9GCfwopEQCRjqFzykJgxG3QnWEZrxSDz3WjZKTj6"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "fail",
          "type": "bool"
        }
      ]
    },
    {
      "name": "crankTick",
      "docs": [
        "ER: target of the scheduled crank (permissionless counter for the spike)."
      ],
      "discriminator": [
        150,
        187,
        23,
        252,
        153,
        201,
        51,
        133
      ],
      "accounts": [
        {
          "name": "probe",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  98,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "probe.id",
                "account": "probe"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "createPermission",
      "docs": [
        "ER: create the Secret's EphemeralPermission with `member` as the only member.",
        "Idempotent. Only the Secret's authority (keeper) may call it."
      ],
      "discriminator": [
        190,
        182,
        26,
        164,
        156,
        221,
        8,
        0
      ],
      "accounts": [
        {
          "name": "secret",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  99,
                  114,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "secret.id",
                "account": "secret"
              }
            ]
          }
        },
        {
          "name": "permission",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  109,
                  105,
                  115,
                  115,
                  105,
                  111,
                  110,
                  58
                ]
              },
              {
                "kind": "account",
                "path": "secret"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                136,
                161,
                10,
                196,
                33,
                152,
                1,
                214,
                246,
                106,
                29,
                60,
                6,
                152,
                192,
                102,
                169,
                175,
                212,
                217,
                180,
                252,
                231,
                71,
                151,
                141,
                209,
                5,
                168,
                212,
                103,
                82
              ]
            }
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "secret"
          ]
        },
        {
          "name": "permissionProgram",
          "address": "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"
        },
        {
          "name": "ephemeralVault",
          "writable": true,
          "address": "MagicVau1t999999999999999999999999999999999"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "member",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "delegatePda",
      "docs": [
        "Base: delegate Probe or Secret to the validator passed in `validator`."
      ],
      "discriminator": [
        248,
        217,
        193,
        46,
        124,
        191,
        64,
        135
      ],
      "accounts": [
        {
          "name": "bufferPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                139,
                166,
                210,
                195,
                41,
                207,
                4,
                147,
                189,
                156,
                121,
                232,
                215,
                51,
                26,
                140,
                39,
                200,
                174,
                206,
                163,
                107,
                50,
                92,
                137,
                45,
                75,
                208,
                26,
                86,
                11,
                129
              ]
            }
          }
        },
        {
          "name": "delegationRecordPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "pda",
          "writable": true
        },
        {
          "name": "payer",
          "signer": true
        },
        {
          "name": "validator",
          "optional": true
        },
        {
          "name": "ownerProgram",
          "address": "AQ9D9GCfwopEQCRjqFzykJgxG3QnWEZrxSDz3WjZKTj6"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountType",
          "type": {
            "defined": {
              "name": "accountType"
            }
          }
        }
      ]
    },
    {
      "name": "init",
      "docs": [
        "Base: create Probe (public), Secret (to be private; no secret data written here) and",
        "Flag (base only). Pre-funds Secret for its ER permission rent."
      ],
      "discriminator": [
        220,
        59,
        207,
        236,
        108,
        250,
        47,
        100
      ],
      "accounts": [
        {
          "name": "probe",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  98,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "id"
              }
            ]
          }
        },
        {
          "name": "secret",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  99,
                  114,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "id"
              }
            ]
          }
        },
        {
          "name": "flag",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  108,
                  97,
                  103
                ]
              },
              {
                "kind": "arg",
                "path": "id"
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "id",
          "type": "u64"
        },
        {
          "name": "raidKey",
          "type": "pubkey"
        },
        {
          "name": "minTickSlots",
          "type": "u64"
        }
      ]
    },
    {
      "name": "moveTo",
      "docs": [
        "ER: raid-key-signed move with a speed limit (spike: |dx|,|dy| <= 60 units)."
      ],
      "discriminator": [
        203,
        97,
        69,
        158,
        17,
        230,
        3,
        142
      ],
      "accounts": [
        {
          "name": "probe",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  98,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "probe.id",
                "account": "probe"
              }
            ]
          }
        },
        {
          "name": "raidKey",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "dx",
          "type": "i16"
        },
        {
          "name": "dy",
          "type": "i16"
        }
      ]
    },
    {
      "name": "processUndelegation",
      "discriminator": [
        196,
        28,
        41,
        206,
        48,
        37,
        51,
        167
      ],
      "accounts": [
        {
          "name": "baseAccount",
          "writable": true
        },
        {
          "name": "buffer",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  110,
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  101,
                  45,
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "baseAccount"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                181,
                183,
                0,
                225,
                242,
                87,
                58,
                192,
                204,
                6,
                34,
                1,
                52,
                74,
                207,
                151,
                184,
                53,
                6,
                235,
                140,
                229,
                25,
                152,
                204,
                98,
                126,
                24,
                147,
                128,
                167,
                62
              ]
            }
          }
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountSeeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    },
    {
      "name": "readOracle",
      "docs": [
        "ER: read a Pricing Oracle feed with full validation (skill pricing-oracle.md):",
        "canonical PDA, owner PriCems…, unchecked decode, feed_id == account key,",
        "posted_slot > 0, fresh upstream publish_time, positive price. The exponent is",
        "NOT taken from the account (stored +8 is wrong); the caller supplies it from the",
        "feed list and it is only logged here."
      ],
      "discriminator": [
        85,
        207,
        64,
        8,
        80,
        154,
        244,
        212
      ],
      "accounts": [
        {
          "name": "probe",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  98,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "probe.id",
                "account": "probe"
              }
            ]
          }
        },
        {
          "name": "priceFeed"
        }
      ],
      "args": [
        {
          "name": "lazerId",
          "type": "u32"
        },
        {
          "name": "feedListExponent",
          "type": "i32"
        },
        {
          "name": "maxAgeSecs",
          "type": "i64"
        }
      ]
    },
    {
      "name": "requestVrf",
      "docs": [
        "Request randomness. Works on base (DEFAULT_QUEUE) or inside the ER",
        "(DEFAULT_EPHEMERAL_QUEUE). One live request at a time."
      ],
      "discriminator": [
        5,
        87,
        79,
        152,
        164,
        176,
        190,
        226
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "probe",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  98,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "probe.id",
                "account": "probe"
              }
            ]
          }
        },
        {
          "name": "authority",
          "relations": [
            "probe"
          ]
        },
        {
          "name": "oracleQueue",
          "writable": true
        },
        {
          "name": "programIdentity",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  100,
                  101,
                  110,
                  116,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "vrfProgram",
          "address": "Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz"
        },
        {
          "name": "slotHashes",
          "address": "SysvarS1otHashes111111111111111111111111111"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "clientSeed",
          "type": "u8"
        }
      ]
    },
    {
      "name": "scheduleCrank",
      "docs": [
        "ER: schedule `crank_tick` every `interval_ms` for `iterations` runs (1.x ScheduleTask)."
      ],
      "discriminator": [
        208,
        58,
        243,
        213,
        129,
        18,
        68,
        59
      ],
      "accounts": [
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "probe",
          "docs": [
            "Owner + discriminator are checked in the handler (`Probe::try_deserialize`)."
          ],
          "writable": true
        },
        {
          "name": "program",
          "address": "AQ9D9GCfwopEQCRjqFzykJgxG3QnWEZrxSDz3WjZKTj6"
        }
      ],
      "args": [
        {
          "name": "taskId",
          "type": "i64"
        },
        {
          "name": "intervalMs",
          "type": "i64"
        },
        {
          "name": "iterations",
          "type": "i64"
        }
      ]
    },
    {
      "name": "setFlag",
      "docs": [
        "Base: post-commit action target. Authenticated by the escrow signer.",
        "`fail = true` forces an error so we can observe what the committor does."
      ],
      "discriminator": [
        51,
        64,
        64,
        151,
        181,
        15,
        246,
        112
      ],
      "accounts": [
        {
          "name": "flag",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  108,
                  97,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "flag.id",
                "account": "flag"
              }
            ]
          }
        },
        {
          "name": "probe",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  98,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "flag.id",
                "account": "flag"
              }
            ]
          }
        },
        {
          "name": "sourceProgram",
          "address": "AQ9D9GCfwopEQCRjqFzykJgxG3QnWEZrxSDz3WjZKTj6"
        },
        {
          "name": "escrowAuth"
        },
        {
          "name": "escrow",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "fail",
          "type": "bool"
        }
      ]
    },
    {
      "name": "tick",
      "docs": [
        "ER: permissionless, clock-gated tick. Never fails when early: it is a no-op, so the",
        "keeper can call it at a fixed cadence and the program decides whether to advance."
      ],
      "discriminator": [
        92,
        79,
        44,
        8,
        101,
        80,
        63,
        15
      ],
      "accounts": [
        {
          "name": "probe",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  98,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "probe.id",
                "account": "probe"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "vrfCallback",
      "docs": [
        "VRF callback, authenticated by #[vrf_callback] (scoped identity signer)."
      ],
      "discriminator": [
        248,
        224,
        55,
        227,
        56,
        10,
        108,
        36
      ],
      "accounts": [
        {
          "name": "vrfProgramIdentity",
          "docs": [
            "Scoped VRF identity PDA signer: proves the VRF program issued this callback for us."
          ],
          "signer": true,
          "address": "2jXCucciibveGd51ZZH9bU5HjPo6txjvjMi3jDJbAXm9"
        },
        {
          "name": "probe",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "randomness",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "writeSecret",
      "docs": [
        "ER: write the secret value (only after the permission exists)."
      ],
      "discriminator": [
        100,
        179,
        39,
        172,
        184,
        98,
        181,
        130
      ],
      "accounts": [
        {
          "name": "secret",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  99,
                  114,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "secret.id",
                "account": "secret"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "secret"
          ]
        }
      ],
      "args": [
        {
          "name": "value",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "flag",
      "discriminator": [
        156,
        221,
        153,
        134,
        84,
        147,
        165,
        54
      ]
    },
    {
      "name": "probe",
      "discriminator": [
        232,
        175,
        197,
        139,
        241,
        255,
        171,
        87
      ]
    },
    {
      "name": "secret",
      "discriminator": [
        17,
        168,
        51,
        21,
        155,
        143,
        2,
        68
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "overflow",
      "msg": "arithmetic overflow"
    },
    {
      "code": 6001,
      "name": "tooFast",
      "msg": "move exceeds max speed"
    },
    {
      "code": 6002,
      "name": "outOfBounds",
      "msg": "out of map bounds"
    },
    {
      "code": 6003,
      "name": "wrongSigner",
      "msg": "wrong signer"
    },
    {
      "code": 6004,
      "name": "wrongFeed",
      "msg": "wrong price feed account"
    },
    {
      "code": 6005,
      "name": "wrongFeedOwner",
      "msg": "price feed not owned by the Pricing Oracle"
    },
    {
      "code": 6006,
      "name": "feedDecode",
      "msg": "price feed decode failed"
    },
    {
      "code": 6007,
      "name": "notPosted",
      "msg": "price feed never posted (posted_slot == 0)"
    },
    {
      "code": 6008,
      "name": "stalePrice",
      "msg": "stale price"
    },
    {
      "code": 6009,
      "name": "badPrice",
      "msg": "non-positive price"
    },
    {
      "code": 6010,
      "name": "vrfPending",
      "msg": "VRF request already pending"
    },
    {
      "code": 6011,
      "name": "noPendingVrf",
      "msg": "no VRF request pending"
    },
    {
      "code": 6012,
      "name": "wrongQueue",
      "msg": "wrong VRF queue"
    },
    {
      "code": 6013,
      "name": "forcedActionFailure",
      "msg": "forced action failure (S5 failure mode)"
    }
  ],
  "types": [
    {
      "name": "accountType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "probe",
            "fields": [
              {
                "name": "id",
                "type": "u64"
              }
            ]
          },
          {
            "name": "secret",
            "fields": [
              {
                "name": "id",
                "type": "u64"
              }
            ]
          }
        ]
      }
    },
    {
      "name": "flag",
      "docs": [
        "Base-only flag written by the post-commit action (S5). Size: 8 disc + 25 bytes."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "set",
            "type": "bool"
          },
          {
            "name": "count",
            "type": "u64"
          },
          {
            "name": "committedTickNo",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "probe",
      "docs": [
        "Public spike state. Size: 8 disc + Probe::LEN (= 239) bytes."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "raidKey",
            "type": "pubkey"
          },
          {
            "name": "tickNo",
            "type": "u64"
          },
          {
            "name": "tickCalls",
            "type": "u64"
          },
          {
            "name": "lastTickSlot",
            "type": "u64"
          },
          {
            "name": "minTickSlots",
            "type": "u64"
          },
          {
            "name": "x",
            "type": "u16"
          },
          {
            "name": "y",
            "type": "u16"
          },
          {
            "name": "moves",
            "type": "u64"
          },
          {
            "name": "rnd",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "pendingVrf",
            "type": "bool"
          },
          {
            "name": "vrfRequests",
            "type": "u64"
          },
          {
            "name": "vrfFulfilled",
            "type": "u64"
          },
          {
            "name": "price",
            "type": "i64"
          },
          {
            "name": "pricePublishTime",
            "type": "i64"
          },
          {
            "name": "pricePostedSlot",
            "type": "u64"
          },
          {
            "name": "priceReads",
            "type": "u64"
          },
          {
            "name": "crankTicks",
            "type": "u64"
          },
          {
            "name": "lastCrankSlot",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "secret",
      "docs": [
        "Private spike state (S1). Size: 8 disc + 48 bytes."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "value",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
