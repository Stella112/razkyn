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
      "name": "cancelPicks",
      "discriminator": [
        237,
        77,
        202,
        131,
        158,
        212,
        52,
        222
      ],
      "accounts": [
        {
          "name": "book",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  105,
                  99,
                  107,
                  115
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
          "signer": true,
          "relations": [
            "raid"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "cancelTrade",
      "discriminator": [
        124,
        66,
        91,
        59,
        175,
        107,
        208,
        120
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
          "name": "rpub",
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
        }
      ]
    },
    {
      "name": "claim",
      "discriminator": [
        62,
        198,
        214,
        193,
        213,
        159,
        108,
        210
      ],
      "accounts": [
        {
          "name": "settlement",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  116,
                  116,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "settlement.raid_id",
                "account": "settlement"
              }
            ]
          }
        },
        {
          "name": "results",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  117,
                  108,
                  116,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "settlement.raid_id",
                "account": "settlement"
              }
            ]
          }
        },
        {
          "name": "claimRecord",
          "writable": true
        },
        {
          "name": "wallet"
        },
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
          "name": "vaultAuth",
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
                "path": "settlement.raid_id",
                "account": "settlement"
              }
            ]
          }
        },
        {
          "name": "stakeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vaultAuth"
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
          "name": "walletDusd",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "wallet"
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
          "name": "twrMint",
          "writable": true
        },
        {
          "name": "facMint",
          "writable": true
        },
        {
          "name": "hrbMint",
          "writable": true
        },
        {
          "name": "walletTwr",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "wallet"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "twrMint"
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
          "name": "walletFac",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "wallet"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "facMint"
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
          "name": "walletHrb",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "wallet"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "hrbMint"
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
          "name": "payer",
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
          "name": "slot",
          "type": "u8"
        }
      ]
    },
    {
      "name": "claimBadge",
      "discriminator": [
        111,
        30,
        18,
        17,
        228,
        252,
        239,
        102
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
          "name": "book",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  105,
                  99,
                  107,
                  115
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
          "name": "badgeMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  100,
                  103,
                  101,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "wallet"
        },
        {
          "name": "walletAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "wallet"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "badgeMint"
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
          "name": "payer",
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
          "name": "raidId",
          "type": "u64"
        },
        {
          "name": "spec",
          "type": "u8"
        }
      ]
    },
    {
      "name": "closePicks",
      "discriminator": [
        133,
        191,
        18,
        220,
        7,
        60,
        144,
        173
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "book",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  105,
                  99,
                  107,
                  115
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
          "docs": [
            "Read only for the VRF seed (badge variants), after every pick has resolved."
          ],
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
          "name": "raidId",
          "type": "u64"
        }
      ]
    },
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
      "name": "createPickBook",
      "discriminator": [
        20,
        244,
        235,
        131,
        222,
        209,
        41,
        144
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
                "kind": "arg",
                "path": "raidId"
              }
            ]
          }
        },
        {
          "name": "book",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  105,
                  99,
                  107,
                  115
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
          "name": "raidId",
          "type": "u64"
        }
      ]
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
      "name": "createSettlement",
      "discriminator": [
        109,
        119,
        255,
        55,
        76,
        73,
        106,
        126
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
          "name": "results",
          "docs": [
            "Delegated with the raid; committed back by end_raid."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  117,
                  108,
                  116,
                  115
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
          "name": "settlement",
          "docs": [
            "Base only: the `settled` flag and claim accounting."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  116,
                  116,
                  108,
                  101
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
          "name": "reserveAuth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101
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
          "name": "reserve",
          "docs": [
            "dUSD backing for the dTWR/dFAC/dHRB units minted at claim."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "reserveAuth"
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
          "name": "treasuryOwner"
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "treasuryOwner"
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
      "args": []
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
      "name": "endRaid",
      "discriminator": [
        61,
        140,
        182,
        70,
        56,
        39,
        24,
        109
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
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
          "name": "results",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  117,
                  108,
                  116,
                  115
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
          "name": "district0"
        },
        {
          "name": "district1"
        },
        {
          "name": "district2"
        },
        {
          "name": "programId",
          "address": "CTJGR8bj7HAzFja1YGjvkc9wP2JrFnachqMLeoniox97"
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
      "args": []
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
      "name": "finalizeRaid",
      "discriminator": [
        149,
        188,
        177,
        247,
        200,
        129,
        0,
        166
      ],
      "accounts": [
        {
          "name": "settle",
          "accounts": [
            {
              "name": "settlement",
              "writable": true,
              "pda": {
                "seeds": [
                  {
                    "kind": "const",
                    "value": [
                      115,
                      101,
                      116,
                      116,
                      108,
                      101
                    ]
                  },
                  {
                    "kind": "account",
                    "path": "settlement.raid_id",
                    "account": "settlement"
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
                    "path": "settlement.raid_id",
                    "account": "settlement"
                  }
                ]
              }
            },
            {
              "name": "results",
              "pda": {
                "seeds": [
                  {
                    "kind": "const",
                    "value": [
                      114,
                      101,
                      115,
                      117,
                      108,
                      116,
                      115
                    ]
                  },
                  {
                    "kind": "account",
                    "path": "settlement.raid_id",
                    "account": "settlement"
                  }
                ]
              }
            },
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
              "name": "testFlags",
              "pda": {
                "seeds": [
                  {
                    "kind": "const",
                    "value": [
                      116,
                      101,
                      115,
                      116,
                      95,
                      102,
                      108,
                      97,
                      103,
                      115
                    ]
                  }
                ]
              }
            },
            {
              "name": "vaultAuth",
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
                    "path": "settlement.raid_id",
                    "account": "settlement"
                  }
                ]
              }
            },
            {
              "name": "stakeVault",
              "writable": true,
              "pda": {
                "seeds": [
                  {
                    "kind": "account",
                    "path": "vaultAuth"
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
              "name": "treasury",
              "writable": true,
              "pda": {
                "seeds": [
                  {
                    "kind": "account",
                    "path": "config.ops_treasury",
                    "account": "config"
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
              "name": "reserve",
              "writable": true
            },
            {
              "name": "dusdMint"
            },
            {
              "name": "tokenProgram"
            }
          ]
        },
        {
          "name": "sourceProgram",
          "docs": [
            "escrow signer below (only the Delegation Program can produce it), this proves the call is",
            "a post-commit action scheduled by this program, i.e. by end_raid. The outcome does not",
            "depend on who called end_raid: settlement re-reads the committed, hash-checked Results."
          ],
          "address": "CTJGR8bj7HAzFja1YGjvkc9wP2JrFnachqMLeoniox97"
        },
        {
          "name": "escrowAuth"
        },
        {
          "name": "escrow",
          "docs": [
            "through the real post-commit path (skill magic-actions.md)."
          ],
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "finishExtract",
      "discriminator": [
        77,
        76,
        73,
        207,
        119,
        225,
        102,
        51
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
          "name": "rpub",
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
      "name": "finishTrade",
      "discriminator": [
        145,
        239,
        16,
        243,
        140,
        44,
        65,
        42
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
          "name": "rpub",
          "writable": true
        },
        {
          "name": "district0"
        },
        {
          "name": "district1"
        },
        {
          "name": "district2"
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
        }
      ]
    },
    {
      "name": "initBadgeMint",
      "discriminator": [
        52,
        183,
        75,
        202,
        1,
        209,
        59,
        101
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
          "name": "badgeMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  100,
                  103,
                  101,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
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
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
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
        },
        {
          "name": "class",
          "type": "u8"
        }
      ]
    },
    {
      "name": "loadSlice",
      "discriminator": [
        131,
        242,
        193,
        172,
        9,
        136,
        126,
        122
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
          "name": "keeper",
          "signer": true,
          "relations": [
            "raid"
          ]
        }
      ],
      "args": [
        {
          "name": "chunk",
          "type": "u8"
        },
        {
          "name": "bytes",
          "type": "bytes"
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
      "name": "placePick",
      "discriminator": [
        3,
        215,
        3,
        176,
        155,
        59,
        179,
        108
      ],
      "accounts": [
        {
          "name": "book",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  105,
                  99,
                  107,
                  115
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
          "name": "session",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "pool",
          "type": "u8"
        },
        {
          "name": "choice",
          "type": "u8"
        },
        {
          "name": "amount",
          "type": "u16"
        }
      ]
    },
    {
      "name": "postReportHash",
      "discriminator": [
        2,
        66,
        70,
        245,
        230,
        133,
        206,
        234
      ],
      "accounts": [
        {
          "name": "settlement",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  116,
                  116,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "settlement.raid_id",
                "account": "settlement"
              }
            ]
          }
        },
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
          "name": "keeper",
          "signer": true,
          "relations": [
            "config"
          ]
        }
      ],
      "args": [
        {
          "name": "hash",
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
      "name": "registerSpectator",
      "discriminator": [
        164,
        80,
        7,
        165,
        202,
        31,
        236,
        213
      ],
      "accounts": [
        {
          "name": "book",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  105,
                  99,
                  107,
                  115
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
          "name": "wallet",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "session",
          "type": "pubkey"
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
      "name": "resolvePicks",
      "discriminator": [
        237,
        254,
        169,
        5,
        79,
        202,
        48,
        245
      ],
      "accounts": [
        {
          "name": "book",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  105,
                  99,
                  107,
                  115
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
          "name": "district0"
        },
        {
          "name": "district1"
        },
        {
          "name": "district2"
        },
        {
          "name": "rpub0"
        },
        {
          "name": "rpub1"
        },
        {
          "name": "rpub2"
        },
        {
          "name": "rpub3"
        },
        {
          "name": "rpub4"
        },
        {
          "name": "rpub5"
        },
        {
          "name": "rpub6"
        },
        {
          "name": "rpub7"
        }
      ],
      "args": []
    },
    {
      "name": "revealAfterEnd",
      "discriminator": [
        4,
        29,
        243,
        75,
        57,
        212,
        204,
        226
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
          "name": "items",
          "type": "bytes"
        }
      ]
    },
    {
      "name": "schedulePickCrank",
      "discriminator": [
        158,
        186,
        97,
        250,
        109,
        255,
        118,
        39
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
          "name": "book",
          "writable": true
        },
        {
          "name": "raid"
        },
        {
          "name": "district0"
        },
        {
          "name": "district1"
        },
        {
          "name": "district2"
        },
        {
          "name": "rpub0"
        },
        {
          "name": "rpub1"
        },
        {
          "name": "rpub2"
        },
        {
          "name": "rpub3"
        },
        {
          "name": "rpub4"
        },
        {
          "name": "rpub5"
        },
        {
          "name": "rpub6"
        },
        {
          "name": "rpub7"
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
      "name": "setTestFlags",
      "discriminator": [
        48,
        80,
        253,
        169,
        34,
        44,
        219,
        90
      ],
      "accounts": [
        {
          "name": "testFlags",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  101,
                  115,
                  116,
                  95,
                  102,
                  108,
                  97,
                  103,
                  115
                ]
              }
            ]
          }
        },
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
          "name": "admin",
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
          "name": "failFinalize",
          "type": "bool"
        }
      ]
    },
    {
      "name": "settleStuckRaid",
      "discriminator": [
        89,
        58,
        253,
        79,
        174,
        119,
        254,
        113
      ],
      "accounts": [
        {
          "name": "settle",
          "accounts": [
            {
              "name": "settlement",
              "writable": true,
              "pda": {
                "seeds": [
                  {
                    "kind": "const",
                    "value": [
                      115,
                      101,
                      116,
                      116,
                      108,
                      101
                    ]
                  },
                  {
                    "kind": "account",
                    "path": "settlement.raid_id",
                    "account": "settlement"
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
                    "path": "settlement.raid_id",
                    "account": "settlement"
                  }
                ]
              }
            },
            {
              "name": "results",
              "pda": {
                "seeds": [
                  {
                    "kind": "const",
                    "value": [
                      114,
                      101,
                      115,
                      117,
                      108,
                      116,
                      115
                    ]
                  },
                  {
                    "kind": "account",
                    "path": "settlement.raid_id",
                    "account": "settlement"
                  }
                ]
              }
            },
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
              "name": "testFlags",
              "pda": {
                "seeds": [
                  {
                    "kind": "const",
                    "value": [
                      116,
                      101,
                      115,
                      116,
                      95,
                      102,
                      108,
                      97,
                      103,
                      115
                    ]
                  }
                ]
              }
            },
            {
              "name": "vaultAuth",
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
                    "path": "settlement.raid_id",
                    "account": "settlement"
                  }
                ]
              }
            },
            {
              "name": "stakeVault",
              "writable": true,
              "pda": {
                "seeds": [
                  {
                    "kind": "account",
                    "path": "vaultAuth"
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
              "name": "treasury",
              "writable": true,
              "pda": {
                "seeds": [
                  {
                    "kind": "account",
                    "path": "config.ops_treasury",
                    "account": "config"
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
              "name": "reserve",
              "writable": true
            },
            {
              "name": "dusdMint"
            },
            {
              "name": "tokenProgram"
            }
          ]
        },
        {
          "name": "payer",
          "signer": true
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
      "name": "startExtract",
      "discriminator": [
        95,
        24,
        108,
        68,
        98,
        159,
        115,
        130
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
          "name": "exit",
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
          "signer": true,
          "relations": [
            "raid"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "startTrade",
      "discriminator": [
        70,
        121,
        62,
        113,
        254,
        13,
        7,
        66
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
          "name": "rpub",
          "writable": true
        },
        {
          "name": "district",
          "docs": [
            "v2: the district the terminal stands in (halt checks)."
          ]
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
          "name": "fromAsset",
          "type": "u8"
        },
        {
          "name": "toAsset",
          "type": "u8"
        },
        {
          "name": "units",
          "type": "u64"
        }
      ]
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
        },
        {
          "name": "feed0",
          "optional": true
        },
        {
          "name": "feed1",
          "optional": true
        },
        {
          "name": "feed2",
          "optional": true
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
      "name": "verifySlice",
      "discriminator": [
        195,
        35,
        206,
        240,
        137,
        245,
        115,
        112
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
          "name": "keeper",
          "signer": true,
          "relations": [
            "raid"
          ]
        }
      ],
      "args": [
        {
          "name": "dayId",
          "type": {
            "array": [
              "u8",
              10
            ]
          }
        },
        {
          "name": "sliceStart",
          "type": "u32"
        },
        {
          "name": "headlinesHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "proof",
          "type": {
            "vec": {
              "array": [
                "u8",
                32
              ]
            }
          }
        }
      ]
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
      "name": "claimRecord",
      "discriminator": [
        57,
        229,
        0,
        9,
        65,
        62,
        96,
        7
      ]
    },
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
      "name": "pickBook",
      "discriminator": [
        8,
        242,
        193,
        118,
        76,
        54,
        74,
        80
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
      "name": "results",
      "discriminator": [
        158,
        56,
        160,
        177,
        25,
        255,
        13,
        136
      ]
    },
    {
      "name": "settlement",
      "discriminator": [
        55,
        11,
        219,
        33,
        36,
        136,
        40,
        182
      ]
    },
    {
      "name": "testFlags",
      "discriminator": [
        123,
        179,
        129,
        53,
        20,
        202,
        211,
        82
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
    },
    {
      "code": 6032,
      "name": "badChunk",
      "msg": "bad slice chunk"
    },
    {
      "code": 6033,
      "name": "sliceNotLoaded",
      "msg": "slice not fully loaded"
    },
    {
      "code": 6034,
      "name": "badProof",
      "msg": "slice or Merkle proof does not match the committed day root"
    },
    {
      "code": 6035,
      "name": "sliceNotVerified",
      "msg": "mystery slice not verified"
    },
    {
      "code": 6036,
      "name": "notAtTerminal",
      "msg": "not at a trading terminal"
    },
    {
      "code": 6037,
      "name": "trading",
      "msg": "action blocked while trading"
    },
    {
      "code": 6038,
      "name": "badTrade",
      "msg": "bad trade"
    },
    {
      "code": 6039,
      "name": "insufficientUnits",
      "msg": "not enough units"
    },
    {
      "code": 6040,
      "name": "badFeed",
      "msg": "bad price feed"
    },
    {
      "code": 6041,
      "name": "exitClosed",
      "msg": "no open exit there"
    },
    {
      "code": 6042,
      "name": "notEnded",
      "msg": "raid has not ended"
    },
    {
      "code": 6043,
      "name": "alreadyComputed",
      "msg": "results already computed"
    },
    {
      "code": 6044,
      "name": "conservation",
      "msg": "conservation check failed"
    },
    {
      "code": 6045,
      "name": "notSettled",
      "msg": "raid is not settled"
    },
    {
      "code": 6046,
      "name": "alreadySettled",
      "msg": "raid already settled"
    },
    {
      "code": 6047,
      "name": "alreadyClaimed",
      "msg": "already claimed"
    },
    {
      "code": 6048,
      "name": "tooEarly",
      "msg": "too early for settle_stuck_raid"
    },
    {
      "code": 6049,
      "name": "notCommitted",
      "msg": "results not committed to base yet"
    },
    {
      "code": 6050,
      "name": "forcedFailure",
      "msg": "forced finalize failure (test flag)"
    },
    {
      "code": 6051,
      "name": "tradingHalted",
      "msg": "trading halted at this terminal"
    },
    {
      "code": 6052,
      "name": "badClass",
      "msg": "unknown raider class"
    },
    {
      "code": 6053,
      "name": "picksClosed",
      "msg": "picks for this pool are closed"
    },
    {
      "code": 6054,
      "name": "bookFull",
      "msg": "pick book is full"
    },
    {
      "code": 6055,
      "name": "badPick",
      "msg": "bad pick (pool, choice or amount)"
    },
    {
      "code": 6056,
      "name": "notSpectator",
      "msg": "session key is not a registered spectator"
    },
    {
      "code": 6057,
      "name": "alreadyPicked",
      "msg": "one choice per spectator per pick"
    },
    {
      "code": 6058,
      "name": "noCredits",
      "msg": "not enough play credits"
    },
    {
      "code": 6059,
      "name": "picksOpen",
      "msg": "picks still open"
    },
    {
      "code": 6060,
      "name": "noBadge",
      "msg": "no badge to claim"
    },
    {
      "code": 6061,
      "name": "blocked",
      "msg": "blocked by cover"
    },
    {
      "code": 6062,
      "name": "noLineOfSight",
      "msg": "no line of sight (cover in the way)"
    }
  ],
  "types": [
    {
      "name": "claimRecord",
      "docs": [
        "`[\"claim\", raid_id, slot]`, base only. Exists once claimed (idempotency). Size: 8 + 11."
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
            "name": "claimed",
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
        "`[\"district\", raid_id, i]`, TEE, public. Size: 8 + 519."
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
            "docs": [
              "Price index ×10^4 (100.0000 = 1_000_000 at raid start) in both modes."
            ],
            "type": "u64"
          },
          {
            "name": "currentPrice",
            "type": "u64"
          },
          {
            "name": "startRaw",
            "docs": [
              "Live mode: raw oracle price at the first step (index = PRICE_ONE × raw / start_raw)."
            ],
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
      "name": "pickBet",
      "docs": [
        "6 bytes, 2-aligned, no padding."
      ],
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "spec",
            "type": "u8"
          },
          {
            "name": "pool",
            "type": "u8"
          },
          {
            "name": "choice",
            "type": "u8"
          },
          {
            "name": "pad",
            "type": "u8"
          },
          {
            "name": "amount",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "pickBook",
      "docs": [
        "`[\"picks\", raid_id]`, base → TEE (public). Zero-copy (too large for the 4 KB stack as Borsh).",
        "Size: 8 + 3_208 bytes (< 10,240). Fields ordered by alignment so there is no implicit padding."
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
            "name": "startTs",
            "type": "i64"
          },
          {
            "name": "totals",
            "type": {
              "array": [
                {
                  "array": [
                    "u32",
                    4
                  ]
                },
                23
              ]
            }
          },
          {
            "name": "spectators",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "spectator"
                  }
                },
                24
              ]
            }
          },
          {
            "name": "bets",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "pickBet"
                  }
                },
                160
              ]
            }
          },
          {
            "name": "nBets",
            "type": "u16"
          },
          {
            "name": "outcome",
            "type": {
              "array": [
                "u8",
                23
              ]
            }
          },
          {
            "name": "prevHazard",
            "docs": [
              "Snapshot of public state at the previous resolve (to detect new cracks / knockouts)."
            ],
            "type": {
              "array": [
                "u8",
                3
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "nSpec",
            "type": "u8"
          },
          {
            "name": "prevAlive",
            "type": "u8"
          },
          {
            "name": "inited",
            "docs": [
              "1 once resolve_picks has taken its first public-state snapshot after the start."
            ],
            "type": "u8"
          },
          {
            "name": "pad",
            "type": {
              "array": [
                "u8",
                7
              ]
            }
          }
        ]
      }
    },
    {
      "name": "raid",
      "docs": [
        "`[\"raid\", raid_id]`, base → TEE, public. Size: 8 + 981 = 989 bytes (measured on devnet)."
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
          },
          {
            "name": "classes",
            "docs": [
              "Class per slot (CLASS_*), chosen at join_raid."
            ],
            "type": {
              "array": [
                "u8",
                8
              ]
            }
          },
          {
            "name": "eventKind",
            "docs": [
              "Active market event (EVENT_*; EVENT_NONE when none), its district and end (unix s)."
            ],
            "type": "u8"
          },
          {
            "name": "eventDistrict",
            "type": "u8"
          },
          {
            "name": "eventUntil",
            "type": "i64"
          },
          {
            "name": "eventsFired",
            "docs": [
              "Bit i = planned event i has fired."
            ],
            "type": "u8"
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
          },
          {
            "name": "results"
          },
          {
            "name": "picks"
          }
        ]
      }
    },
    {
      "name": "raidSecret",
      "docs": [
        "`[\"secret\", raid_id]`, TEE, private (keeper). Zero-copy. Size: 8 + 3,712.",
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
                2
              ]
            }
          },
          {
            "name": "sliceStart",
            "docs": [
              "Minute of day where the slice starts (set by verify_slice; revealed at the end)."
            ],
            "type": "u32"
          },
          {
            "name": "dayId",
            "docs": [
              "\"YYYY-MM-DD\" of the mystery day (first 10 bytes; set by verify_slice)."
            ],
            "type": {
              "array": [
                "u8",
                16
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
          },
          {
            "name": "events",
            "docs": [
              "v2: market event plan, NUM_EVENTS × [kind, district, second lo, second hi] (private)."
            ],
            "type": {
              "array": [
                "u8",
                8
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
      "name": "raiderResult",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "joined",
            "type": "bool"
          },
          {
            "name": "extracted",
            "type": "bool"
          },
          {
            "name": "alive",
            "type": "bool"
          },
          {
            "name": "backpack",
            "docs": [
              "Backpack at the end (units per asset)."
            ],
            "type": {
              "array": [
                "u64",
                3
              ]
            }
          },
          {
            "name": "mintUnits",
            "docs": [
              "Units minted at claim (backpack, scaled when extracted value > loot pool)."
            ],
            "type": {
              "array": [
                "u64",
                3
              ]
            }
          },
          {
            "name": "mintValue",
            "docs": [
              "dUSD value of mint_units at final prices (moved to the reserve as backing)."
            ],
            "type": "u64"
          },
          {
            "name": "dusdPayout",
            "docs": [
              "dUSD paid at claim: protected slot + pro-rata leftover (+ dust for the lowest slot)."
            ],
            "type": "u64"
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
      "name": "results",
      "docs": [
        "`[\"results\", raid_id]`, TEE → base (committed by end_raid), public. Size: 8 + 896."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "raidId",
            "type": "u64"
          },
          {
            "name": "computed",
            "type": "bool"
          },
          {
            "name": "endedTs",
            "type": "i64"
          },
          {
            "name": "finalPrices",
            "type": {
              "array": [
                "u64",
                3
              ]
            }
          },
          {
            "name": "stakesTotal",
            "type": "u64"
          },
          {
            "name": "ops",
            "type": "u64"
          },
          {
            "name": "lootPool",
            "type": "u64"
          },
          {
            "name": "extractedValue",
            "docs": [
              "Σ extracted backpack value at final prices before any scaling."
            ],
            "type": "u64"
          },
          {
            "name": "scaled",
            "docs": [
              "true when extracted value exceeded the loot pool and backpacks were scaled."
            ],
            "type": "bool"
          },
          {
            "name": "leftover",
            "docs": [
              "Loot pool left after extracted payouts; shared pro rata by stake."
            ],
            "type": "u64"
          },
          {
            "name": "reserveTotal",
            "type": "u64"
          },
          {
            "name": "dusdTotal",
            "type": "u64"
          },
          {
            "name": "raiders",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "raiderResult"
                  }
                },
                8
              ]
            }
          },
          {
            "name": "resultsHash",
            "type": {
              "array": [
                "u8",
                32
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
      "name": "settlement",
      "docs": [
        "`[\"settle\", raid_id]`, base only, public. The `settled` flag (finalize_raid or",
        "settle_stuck_raid) and claim accounting. Size: 8 + 92."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "raidId",
            "type": "u64"
          },
          {
            "name": "settled",
            "type": "bool"
          },
          {
            "name": "settledVia",
            "docs": [
              "1 = finalize_raid (Magic Action), 2 = settle_stuck_raid."
            ],
            "type": "u8"
          },
          {
            "name": "resultsHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "dusdPaid",
            "type": "u64"
          },
          {
            "name": "unitsMintedValue",
            "type": "u64"
          },
          {
            "name": "claims",
            "type": "u8"
          },
          {
            "name": "reportHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "reportPosted",
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
      "name": "spectator",
      "docs": [
        "76 bytes, 4-aligned, no padding."
      ],
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "session",
            "docs": [
              "Session key that signs picks for this wallet (scoped: it can only call place_pick on this book)."
            ],
            "type": "pubkey"
          },
          {
            "name": "credits",
            "type": "u32"
          },
          {
            "name": "picks",
            "type": "u8"
          },
          {
            "name": "correct",
            "type": "u8"
          },
          {
            "name": "streak",
            "type": "u8"
          },
          {
            "name": "bestStreak",
            "type": "u8"
          },
          {
            "name": "badge",
            "docs": [
              "0 none; 1..=4 streak badge variant (from the raid's VRF seed)."
            ],
            "type": "u8"
          },
          {
            "name": "badgeClaimed",
            "type": "u8"
          },
          {
            "name": "pad",
            "type": {
              "array": [
                "u8",
                2
              ]
            }
          }
        ]
      }
    },
    {
      "name": "testFlags",
      "docs": [
        "`[\"test_flags\"]`, base, admin-set. Only used by devnet test 11. Size: 8 + 2."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "failFinalize",
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
