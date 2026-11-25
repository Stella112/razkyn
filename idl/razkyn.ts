/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/razkyn.json`.
 */
export type Razkyn = {
  "address": "CTJGR8bj7HAzFja1YGjvkc9wP2JrFnachqMLeoniox97",
  "metadata": {
    "name": "razkyn",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "RAZKYN — a market-driven multiplayer extraction game on Solana."
  },
  "instructions": [
    {
      "name": "createCrates",
      "discriminator": [
        255,
        109,
        66,
        105,
        187,
        210,
        1,
        27
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "raid",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "raid.raid_id",
                "account": "raid"
              }
            ]
          }
        },
        {
          "name": "keeper",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "first",
          "type": "u8"
        },
        {
          "name": "count",
          "type": "u8"
        }
      ]
    },
    {
      "name": "createDistricts",
      "discriminator": [
        16,
        158,
        171,
        147,
        175,
        190,
        111,
        230
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "raid",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "raid.raid_id",
                "account": "raid"
              }
            ]
          }
        },
        {
          "name": "district0",
          "writable": true
        },
        {
          "name": "district1",
          "writable": true
        },
        {
          "name": "district2",
          "writable": true
        },
        {
          "name": "keeper",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "createRaid",
      "discriminator": [
        5,
        110,
        56,
        100,
        4,
        141,
        251,
        190
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "raid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  105,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "raidId"
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
                "path": "raidId"
              }
            ]
          }
        },
        {
          "name": "escrowAuth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "arg",
                "path": "raidId"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "escrowAuth"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "dusdMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "dusdMint"
        },
        {
          "name": "keeper",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "raidId",
          "type": "u64"
        },
        {
          "name": "mode",
          "type": "u8"
        },
        {
          "name": "leafCount",
          "type": "u32"
        },
        {
          "name": "dayRoot",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "eventPlanHash",
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
      "name": "createSlot",
      "discriminator": [
        176,
        223,
        119,
        65,
        9,
        168,
        136,
        59
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "raid",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "raid.raid_id",
                "account": "raid"
              }
            ]
          }
        },
        {
          "name": "rpub",
          "writable": true
        },
        {
          "name": "rprv",
          "writable": true
        },
        {
          "name": "view",
          "writable": true
        },
        {
          "name": "keeper",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "slot",
          "type": "u8"
        }
      ]
    },
    {
      "name": "delegatePda",
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
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
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
                170,
                45,
                46,
                2,
                55,
                192,
                18,
                65,
                230,
                10,
                227,
                56,
                23,
                239,
                30,
                114,
                69,
                170,
                181,
                168,
                189,
                155,
                59,
                197,
                125,
                187,
                204,
                196,
                198,
                219,
                251,
                114
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
          "name": "keeper",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "validator",
          "optional": true
        },
        {
          "name": "ownerProgram",
          "address": "CTJGR8bj7HAzFja1YGjvkc9wP2JrFnachqMLeoniox97"
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
          "name": "raidId",
          "type": "u64"
        },
        {
          "name": "account",
          "type": {
            "defined": {
              "name": "raidAccount"
            }
          }
        }
      ]
    },
    {
      "name": "dropBackpack",
      "discriminator": [
        174,
        116,
        108,
        199,
        241,
        234,
        124,
        150
      ],
      "accounts": [
        {
          "name": "raid",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "raid.raid_id",
                "account": "raid"
              }
            ]
          }
        },
        {
          "name": "rpub",
          "writable": true
        },
        {
          "name": "rprv",
          "writable": true
        },
        {
          "name": "dropCrate",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "slot",
          "type": "u8"
        }
      ]
    },
    {
      "name": "faucetDusd",
      "discriminator": [
        186,
        16,
        215,
        215,
        230,
        208,
        135,
        160
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "ledger",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  97,
                  117,
                  99,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "mintAuth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104
                ]
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "userAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "user"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "faucetPlay",
      "discriminator": [
        138,
        253,
        167,
        43,
        53,
        187,
        111,
        77
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "ledger",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  97,
                  117,
                  99,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "mintAuth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104
                ]
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "userAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "user"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "finishOpen",
      "discriminator": [
        218,
        195,
        118,
        58,
        217,
        243,
        55,
        64
      ],
      "accounts": [
        {
          "name": "raid",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "raid.raid_id",
                "account": "raid"
              }
            ]
          }
        },
        {
          "name": "rprv",
          "writable": true
        },
        {
          "name": "crateAcc",
          "writable": true
        },
        {
          "name": "cratePermission",
          "docs": [
            "public drop crates (they have no permission, and the TEE rejects a tx that lists a",
            "non-delegated account as writable)."
          ],
          "writable": true,
          "optional": true
        },
        {
          "name": "raidKey",
          "signer": true
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
          "name": "slot",
          "type": "u8"
        },
        {
          "name": "idx",
          "type": "u8"
        }
      ]
    },
    {
      "name": "initConfig",
      "discriminator": [
        23,
        235,
        115,
        232,
        168,
        96,
        1,
        231
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mintAuth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104
                ]
              }
            ]
          }
        },
        {
          "name": "dusdMint"
        },
        {
          "name": "twrMint"
        },
        {
          "name": "facMint"
        },
        {
          "name": "hrbMint"
        },
        {
          "name": "playMint"
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "keeper",
          "type": "pubkey"
        },
        {
          "name": "opsTreasury",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "joinRaid",
      "discriminator": [
        254,
        133,
        239,
        75,
        116,
        28,
        122,
        208
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "raid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "raid.raid_id",
                "account": "raid"
              }
            ]
          }
        },
        {
          "name": "rpub",
          "writable": true
        },
        {
          "name": "rprv",
          "writable": true
        },
        {
          "name": "walletAta",
          "writable": true
        },
        {
          "name": "escrowAuth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "raid.raid_id",
                "account": "raid"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "escrowAuth"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "dusdMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "dusdMint"
        },
        {
          "name": "wallet",
          "signer": true
        },
        {
          "name": "keeper",
          "docs": [
            "Present (and signing) only when the keeper registers a labelled BOT."
          ],
          "signer": true,
          "optional": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "slot",
          "type": "u8"
        },
        {
          "name": "raidKey",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "moveTo",
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
          "name": "raid",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "raid.raid_id",
                "account": "raid"
              }
            ]
          }
        },
        {
          "name": "rprv",
          "writable": true
        },
        {
          "name": "raidKey",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "slot",
          "type": "u8"
        },
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
      "name": "openCrate",
      "discriminator": [
        37,
        90,
        248,
        78,
        84,
        234,
        171,
        121
      ],
      "accounts": [
        {
          "name": "raid",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "raid.raid_id",
                "account": "raid"
              }
            ]
          }
        },
        {
          "name": "rprv",
          "writable": true
        },
        {
          "name": "crateAcc"
        },
        {
          "name": "district"
        },
        {
          "name": "raidKey",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "slot",
          "type": "u8"
        },
        {
          "name": "idx",
          "type": "u8"
        }
      ]
    },
    {
      "name": "placeCrates",
      "discriminator": [
        89,
        150,
        162,
        58,
        184,
        41,
        147,
        188
      ],
      "accounts": [
        {
          "name": "raid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "raid.raid_id",
                "account": "raid"
              }
            ]
          }
        },
        {
          "name": "secret",
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
                "path": "raid.raid_id",
                "account": "raid"
              }
            ]
          }
        },
        {
          "name": "keeper",
          "writable": true,
          "signer": true,
          "relations": [
            "raid"
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
          "name": "first",
          "type": "u8"
        },
        {
          "name": "count",
          "type": "u8"
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
      "name": "requestRaidVrf",
      "discriminator": [
        188,
        133,
        84,
        191,
        213,
        165,
        104,
        105
      ],
      "accounts": [
        {
          "name": "keeper",
          "writable": true,
          "signer": true,
          "relations": [
            "raid"
          ]
        },
        {
          "name": "raid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "raid.raid_id",
                "account": "raid"
              }
            ]
          }
        },
        {
          "name": "oracleQueue",
          "writable": true,
          "address": "5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc"
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
      "args": []
    },
    {
      "name": "setupSecretPermission",
      "discriminator": [
        35,
        129,
        243,
        44,
        146,
        154,
        26,
        196
      ],
      "accounts": [
        {
          "name": "raid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "raid.raid_id",
                "account": "raid"
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
                "kind": "account",
                "path": "raid.raid_id",
                "account": "raid"
              }
            ]
          }
        },
        {
          "name": "secretPermission",
          "writable": true
        },
        {
          "name": "keeper",
          "writable": true,
          "signer": true,
          "relations": [
            "raid"
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
      "args": []
    },
    {
      "name": "setupSlotPermissions",
      "discriminator": [
        225,
        217,
        131,
        47,
        5,
        53,
        72,
        235
      ],
      "accounts": [
        {
          "name": "raid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "raid.raid_id",
                "account": "raid"
              }
            ]
          }
        },
        {
          "name": "rprv",
          "writable": true
        },
        {
          "name": "view",
          "writable": true
        },
        {
          "name": "rprvPermission",
          "writable": true
        },
        {
          "name": "viewPermission",
          "writable": true
        },
        {
          "name": "keeper",
          "writable": true,
          "signer": true,
          "relations": [
            "raid"
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
          "name": "slot",
          "type": "u8"
        }
      ]
    },
    {
      "name": "shoot",
      "discriminator": [
        41,
        43,
        22,
        19,
        8,
        30,
        7,
        103
      ],
      "accounts": [
        {
          "name": "raid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "raid.raid_id",
                "account": "raid"
              }
            ]
          }
        },
        {
          "name": "shooterPrv",
          "writable": true
        },
        {
          "name": "shooterPub",
          "writable": true
        },
        {
          "name": "targetPrv",
          "writable": true
        },
        {
          "name": "targetPub",
          "writable": true
        },
        {
          "name": "dropCrate",
          "writable": true
        },
        {
          "name": "raidKey",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "slot",
          "type": "u8"
        },
        {
          "name": "target",
          "type": "u8"
        }
      ]
    },
    {
      "name": "startRaid",
      "discriminator": [
        75,
        15,
        167,
        23,
        186,
        132,
        225,
        50
      ],
      "accounts": [
        {
          "name": "raid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "raid.raid_id",
                "account": "raid"
              }
            ]
          }
        },
        {
          "name": "keeper",
          "signer": true,
          "relations": [
            "raid"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "tick",
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
          "name": "raid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "raid.raid_id",
                "account": "raid"
              }
            ]
          }
        },
        {
          "name": "secret",
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
                "path": "raid.raid_id",
                "account": "raid"
              }
            ]
          }
        },
        {
          "name": "district0",
          "writable": true
        },
        {
          "name": "district1",
          "writable": true
        },
        {
          "name": "district2",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "tickRaiders",
      "discriminator": [
        84,
        179,
        199,
        119,
        93,
        142,
        99,
        231
      ],
      "accounts": [
        {
          "name": "raid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "raid.raid_id",
                "account": "raid"
              }
            ]
          }
        },
        {
          "name": "district0"
        },
        {
          "name": "district1"
        },
        {
          "name": "district2"
        }
      ],
      "args": []
    },
    {
      "name": "vrfCallbackRaid",
      "discriminator": [
        203,
        195,
        160,
        52,
        207,
        233,
        142,
        137
      ],
      "accounts": [
        {
          "name": "vrfProgramIdentity",
          "docs": [
            "Scoped VRF identity signer: proves the VRF program issued this callback for us."
          ],
          "signer": true,
          "address": "8Ja5F74mAAFivdgxuVfKRzDDjdxgzT6G2okWdfXcsq5k"
        },
        {
          "name": "raid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "raid.raid_id",
                "account": "raid"
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
                "kind": "account",
                "path": "raid.raid_id",
                "account": "raid"
              }
            ]
          }
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
        },
        {
          "name": "nonce",
          "type": "u32"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "crate",
      "discriminator": [
        241,
        175,
        117,
        138,
        154,
        62,
        170,
        24
      ]
    },
    {
      "name": "district",
      "discriminator": [
        169,
        182,
        200,
        137,
        136,
        181,
        119,
        198
      ]
    },
    {
      "name": "faucetLedger",
      "discriminator": [
        43,
        139,
        192,
        104,
        3,
        186,
        103,
        195
      ]
    },
    {
      "name": "raid",
      "discriminator": [
        247,
        50,
        237,
        152,
        225,
        69,
        138,
        211
      ]
    },
    {
      "name": "raidSecret",
      "discriminator": [
        180,
        51,
        79,
        98,
        64,
        160,
        82,
        36
      ]
    },
    {
      "name": "raiderPrivate",
      "discriminator": [
        168,
        194,
        224,
        212,
        69,
        11,
        106,
        63
      ]
    },
    {
      "name": "raiderPublic",
      "discriminator": [
        170,
        97,
        117,
        163,
        122,
        114,
        121,
        178
      ]
    },
    {
      "name": "view",
      "discriminator": [
        192,
        146,
        8,
        125,
        102,
        221,
        182,
        219
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
      "name": "unauthorized",
      "msg": "signer is not authorized for this action"
    },
    {
      "code": 6002,
      "name": "badStatus",
      "msg": "raid is not in the required status"
    },
    {
      "code": 6003,
      "name": "badSlot",
      "msg": "slot index out of range"
    },
    {
      "code": 6004,
      "name": "slotTaken",
      "msg": "slot already taken"
    },
    {
      "code": 6005,
      "name": "alreadyJoined",
      "msg": "wallet already joined this raid"
    },
    {
      "code": 6006,
      "name": "badRaidKey",
      "msg": "raid key is invalid or reused"
    },
    {
      "code": 6007,
      "name": "slotNotJoined",
      "msg": "slot is not joined"
    },
    {
      "code": 6008,
      "name": "notEnoughRaiders",
      "msg": "not enough raiders"
    },
    {
      "code": 6009,
      "name": "wrongRaidKey",
      "msg": "signer is not the registered raid key for this slot"
    },
    {
      "code": 6010,
      "name": "raiderDead",
      "msg": "raider is dead"
    },
    {
      "code": 6011,
      "name": "raiderExtracted",
      "msg": "raider has extracted"
    },
    {
      "code": 6012,
      "name": "raidOver",
      "msg": "raid time is over"
    },
    {
      "code": 6013,
      "name": "tooFast",
      "msg": "move exceeds the speed limit"
    },
    {
      "code": 6014,
      "name": "outOfBounds",
      "msg": "move leaves the map"
    },
    {
      "code": 6015,
      "name": "faucetCap",
      "msg": "faucet daily cap reached"
    },
    {
      "code": 6016,
      "name": "permissionsMissing",
      "msg": "permissions are not set up"
    },
    {
      "code": 6017,
      "name": "vrfPending",
      "msg": "a VRF request is already pending"
    },
    {
      "code": 6018,
      "name": "vrfMismatch",
      "msg": "VRF callback does not match the pending request"
    },
    {
      "code": 6019,
      "name": "notSeeded",
      "msg": "raid is not seeded yet"
    },
    {
      "code": 6020,
      "name": "badAccount",
      "msg": "account does not match the expected PDA"
    },
    {
      "code": 6021,
      "name": "tooManyMembers",
      "msg": "too many permission members"
    },
    {
      "code": 6022,
      "name": "badMint",
      "msg": "bad mint"
    },
    {
      "code": 6023,
      "name": "badMode",
      "msg": "bad mode"
    },
    {
      "code": 6024,
      "name": "crateNotOpenable",
      "msg": "crate is not placed or already opened"
    },
    {
      "code": 6025,
      "name": "crateDormant",
      "msg": "crate is dormant until its district wakes"
    },
    {
      "code": 6026,
      "name": "outOfRange",
      "msg": "out of range"
    },
    {
      "code": 6027,
      "name": "noChannel",
      "msg": "no matching channel in progress"
    },
    {
      "code": 6028,
      "name": "channelNotDone",
      "msg": "channel not finished yet"
    },
    {
      "code": 6029,
      "name": "badTarget",
      "msg": "bad target"
    },
    {
      "code": 6030,
      "name": "cooldown",
      "msg": "weapon cooling down"
    },
    {
      "code": 6031,
      "name": "cratesNotPlaced",
      "msg": "crates are not all placed"
    }
  ],
  "types": [
    {
      "name": "config",
      "docs": [
        "`[\"config\"]`, base, public. Size: 8 + 260."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "keeper",
            "type": "pubkey"
          },
          {
            "name": "dusdMint",
            "type": "pubkey"
          },
          {
            "name": "assetMints",
            "docs": [
              "dTWR, dFAC, dHRB (one per district)."
            ],
            "type": {
              "array": [
                "pubkey",
                3
              ]
            }
          },
          {
            "name": "playMint",
            "type": "pubkey"
          },
          {
            "name": "opsTreasury",
            "type": "pubkey"
          },
          {
            "name": "tokenProgram",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "mintAuthBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "crate",
      "docs": [
        "`[\"crate\", raid_id, idx]`, TEE. idx 0..36: private (keeper) until opened, then public.",
        "idx 36+slot: that raider's drop crate, public. Size: 8 + 71."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "raidId",
            "type": "u64"
          },
          {
            "name": "idx",
            "type": "u8"
          },
          {
            "name": "district",
            "type": "u8"
          },
          {
            "name": "dormant",
            "type": "bool"
          },
          {
            "name": "placed",
            "type": "bool"
          },
          {
            "name": "state",
            "type": "u8"
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
            "name": "units",
            "docs": [
              "Units per asset (dTWR, dFAC, dHRB). Regular crates hold one asset; drop crates hold a",
              "whole backpack."
            ],
            "type": {
              "array": [
                "u64",
                3
              ]
            }
          },
          {
            "name": "openedUnits",
            "docs": [
              "What the crate held when opened (public afterwards, for the report and THE WIRE)."
            ],
            "type": {
              "array": [
                "u64",
                3
              ]
            }
          },
          {
            "name": "openedBy",
            "docs": [
              "Slot that opened it (255 = nobody)."
            ],
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "cratePos",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "x",
            "type": "u16"
          },
          {
            "name": "y",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "district",
      "docs": [
        "`[\"district\", raid_id, i]`, TEE, public. Size: 8 + 511."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "raidId",
            "type": "u64"
          },
          {
            "name": "index",
            "type": "u8"
          },
          {
            "name": "asset",
            "type": "u8"
          },
          {
            "name": "hazardLevel",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "startPrice",
            "type": "u64"
          },
          {
            "name": "currentPrice",
            "type": "u64"
          },
          {
            "name": "history",
            "docs": [
              "Ring of the last 60 prices (one per market step)."
            ],
            "type": {
              "array": [
                "u64",
                60
              ]
            }
          },
          {
            "name": "histLen",
            "type": "u8"
          },
          {
            "name": "histPos",
            "type": "u8"
          },
          {
            "name": "awakeMask",
            "docs": [
              "Bit per dormant crate woken in this district."
            ],
            "type": "u16"
          },
          {
            "name": "awake",
            "docs": [
              "District reached +2% vs start at least once: its dormant crates can be opened."
            ],
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "faucetLedger",
      "docs": [
        "`[\"faucet\", wallet]`, base. Enforces the 100 dUSD / wallet / day cap. Size: 8 + 57."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "day",
            "type": "i64"
          },
          {
            "name": "dusdToday",
            "type": "u64"
          },
          {
            "name": "dusdTotal",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "raid",
      "docs": [
        "`[\"raid\", raid_id]`, base → TEE, public. Size: 8 + 1080."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "raidId",
            "type": "u64"
          },
          {
            "name": "keeper",
            "type": "pubkey"
          },
          {
            "name": "mode",
            "type": "u8"
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "joinedCount",
            "type": "u8"
          },
          {
            "name": "permMask",
            "docs": [
              "bit i = slot i permissions created; SECRET_PERM_BIT = RaidSecret permission created."
            ],
            "type": "u16"
          },
          {
            "name": "vrfState",
            "type": "u8"
          },
          {
            "name": "vrfNonce",
            "type": "u32"
          },
          {
            "name": "vrfRequestedTs",
            "type": "i64"
          },
          {
            "name": "leafCount",
            "docs": [
              "Number of Merkle leaves (Mystery mode); 0 in Live mode."
            ],
            "type": "u32"
          },
          {
            "name": "createdTs",
            "type": "i64"
          },
          {
            "name": "startTs",
            "type": "i64"
          },
          {
            "name": "startSlot",
            "type": "u64"
          },
          {
            "name": "endTs",
            "type": "i64"
          },
          {
            "name": "tickNo",
            "type": "u64"
          },
          {
            "name": "lastTickSlot",
            "type": "u64"
          },
          {
            "name": "marketStep",
            "type": "u16"
          },
          {
            "name": "prevTickSlot",
            "docs": [
              "Slot of the tick before last_tick_slot (hazard damage uses the gap)."
            ],
            "type": "u64"
          },
          {
            "name": "cratesPlaced",
            "docs": [
              "Bit i = crate i placed by place_crates (all 36 required to start)."
            ],
            "type": "u64"
          },
          {
            "name": "cratePos",
            "docs": [
              "Public crate positions (units), written by place_crates. Contents stay private until a",
              "crate is opened; district = idx / 12, dormant = idx % 12 >= 8. DECISIONS.md #16."
            ],
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "cratePos"
                  }
                },
                36
              ]
            }
          },
          {
            "name": "exitWindow",
            "docs": [
              "0 = no window open, 1..=3 = that window is open."
            ],
            "type": "u8"
          },
          {
            "name": "openExits",
            "docs": [
              "Exit indices open right now (NO_EXIT when closed). Copied from RaidSecret when a",
              "window opens, so the plan stays private until then."
            ],
            "type": {
              "array": [
                "u8",
                2
              ]
            }
          },
          {
            "name": "raiders",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "raiderSlot"
                  }
                },
                8
              ]
            }
          },
          {
            "name": "dayRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "eventPlanHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "settled",
            "type": "bool"
          },
          {
            "name": "reportHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "raidAccount",
      "docs": [
        "Which raid account to delegate. The escrow is not here: it never leaves the base layer."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "raid"
          },
          {
            "name": "secret"
          },
          {
            "name": "district",
            "fields": [
              {
                "name": "index",
                "type": "u8"
              }
            ]
          },
          {
            "name": "raiderPublic",
            "fields": [
              {
                "name": "slot",
                "type": "u8"
              }
            ]
          },
          {
            "name": "raiderPrivate",
            "fields": [
              {
                "name": "slot",
                "type": "u8"
              }
            ]
          },
          {
            "name": "view",
            "fields": [
              {
                "name": "slot",
                "type": "u8"
              }
            ]
          },
          {
            "name": "crate",
            "fields": [
              {
                "name": "idx",
                "type": "u8"
              }
            ]
          }
        ]
      }
    },
    {
      "name": "raidSecret",
      "docs": [
        "`[\"secret\", raid_id]`, TEE, private (keeper). Zero-copy. Size: 8 + 3,696.",
        "Base-layer data is public, so nothing secret is written here until the account is on the",
        "TEE and its permission exists (CLAUDE.md §4.4)."
      ],
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "raidId",
            "type": "u64"
          },
          {
            "name": "seed",
            "docs": [
              "VRF seed (32 bytes) from the authenticated callback."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "sliceHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "leafIndex",
            "type": "u32"
          },
          {
            "name": "loadedChunks",
            "type": "u32"
          },
          {
            "name": "exitPlan",
            "docs": [
              "Exit plan: window w uses exits [2w], [2w+1]; NO_EXIT when unused."
            ],
            "type": {
              "array": [
                "u8",
                8
              ]
            }
          },
          {
            "name": "seeded",
            "type": "u8"
          },
          {
            "name": "verified",
            "type": "u8"
          },
          {
            "name": "pad",
            "type": {
              "array": [
                "u8",
                6
              ]
            }
          },
          {
            "name": "slice",
            "docs": [
              "Mystery price slice: 300 steps × 3 assets, rebased ×10^4 (M3)."
            ],
            "type": {
              "array": [
                "u32",
                900
              ]
            }
          }
        ]
      }
    },
    {
      "name": "raiderPrivate",
      "docs": [
        "`[\"rprv\", raid_id, slot]`, TEE, private (raid key + keeper). Size: 8 + 109."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "raidId",
            "type": "u64"
          },
          {
            "name": "slot",
            "type": "u8"
          },
          {
            "name": "raidKey",
            "type": "pubkey"
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
            "name": "lastMoveSlot",
            "type": "u64"
          },
          {
            "name": "backpack",
            "docs": [
              "Units per asset (dTWR, dFAC, dHRB), 6 decimals."
            ],
            "type": {
              "array": [
                "u64",
                3
              ]
            }
          },
          {
            "name": "channelKind",
            "type": "u8"
          },
          {
            "name": "channelArg",
            "type": "u8"
          },
          {
            "name": "channelStartSlot",
            "type": "u64"
          },
          {
            "name": "channelUnits",
            "type": "u64"
          },
          {
            "name": "lastShotSlot",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "raiderPublic",
      "docs": [
        "`[\"rpub\", raid_id, slot]`, TEE, public. Size: 8 + 21."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "raidId",
            "type": "u64"
          },
          {
            "name": "slot",
            "type": "u8"
          },
          {
            "name": "hp",
            "type": "u8"
          },
          {
            "name": "alive",
            "type": "bool"
          },
          {
            "name": "extracted",
            "type": "bool"
          },
          {
            "name": "exposed",
            "docs": [
              "Position is public only while trading, after death or after extraction."
            ],
            "type": "bool"
          },
          {
            "name": "isBot",
            "type": "bool"
          },
          {
            "name": "kills",
            "type": "u8"
          },
          {
            "name": "pubX",
            "type": "u16"
          },
          {
            "name": "pubY",
            "type": "u16"
          },
          {
            "name": "pendingDrop",
            "docs": [
              "Died to a hazard; `drop_backpack` still has to move the backpack into the drop crate."
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "raiderSlot",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "raidKey",
            "type": "pubkey"
          },
          {
            "name": "stake",
            "type": "u64"
          },
          {
            "name": "joined",
            "type": "bool"
          },
          {
            "name": "alive",
            "type": "bool"
          },
          {
            "name": "extracted",
            "type": "bool"
          },
          {
            "name": "isBot",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "view",
      "docs": [
        "`[\"view\", raid_id, slot]`, TEE, private (raid key). Size: 8 + 54."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "raidId",
            "type": "u64"
          },
          {
            "name": "slot",
            "type": "u8"
          },
          {
            "name": "tickNo",
            "type": "u64"
          },
          {
            "name": "count",
            "type": "u8"
          },
          {
            "name": "entries",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "viewEntry"
                  }
                },
                7
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "viewEntry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "slot",
            "type": "u8"
          },
          {
            "name": "x",
            "type": "u16"
          },
          {
            "name": "y",
            "type": "u16"
          }
        ]
      }
    }
  ]
};
