# STATUS.md

_Last updated: 2026-11-25 — M2 done (local + devnet). Next: M3._

## Done
- §4.1 setup: MagicBlock dev skill v0.5.1 (commit `88f6719`, 2026-11-24) installed; references read. `vendor/` cloned (examples `3376663`, starter-kits, SDK tag `v0.18.0`).
- §4.2 toolchain (WSL Debian, `source scripts/env.sh`): rustc 1.89.0 · solana-cli 3.1.9 · anchor-cli 1.0.2 · node v24.22.3.
- §5 layout, `.gitignore`, `rust-toolchain.toml`, `DECISIONS.md`, root `package.json` (exact pins: @coral-xyz/anchor 0.32.1, @magicblock-labs/ephemeral-rollups-sdk 0.18.0).
- Platform: devnet-tee `getVersion` → `magicblock-core 1.1.1` / `8886db2`; status API devnet/tee er, pricing_oracle, vrf_oracle live.
- Spike program `razkyn_spike` = `AQ9D9GCfwopEQCRjqFzykJgxG3QnWEZrxSDz3WjZKTj6` (devnet). Deploy `3m2q6j25UnFkuHWi2i2XB8ihbhB2acdJXUtwYrJrwnqwR1FCWgw7wPcWGKeUic8nkWE8KRvWxS8hSnbgTtULtxVt`, upgrade `5sJBfAsknyD1dmLZhrhfUMkF9zzsainYcoqq9KTkjZuPUQVQFvZc9AgPVcB9BWnurypEeqTiRJTbVanys3r3w3qs`.

## M0 spike results (evidence JSON in `spikes/results/`)
| Spike | Result | Key evidence |
|---|---|---|
| S1 PER | **PASS** | Secret `5uKbN3NK…` delegated to MTEWGuqx…; `create_permission` TEE sig `5hvxozeJ…`. Member A reads value 424242; B, keeper (not a member) and no-token reads return null. Permission record: A reads, B null. |
| S2 Tick 10 Hz | **FAIL on p95** (landing passes) | 600/600 ticks landed (100%), 600 counted on-chain, max gap 416 ms; 120/120 raid-key moves landed (unfunded raid key works as ER fee payer). Latency p50 453 / p95 476 / p99 2433 ms. Baseline `getSlot` RTT from this machine p50 444 / p95 457 ms → TEE execution adds ~10–20 ms; the rest is network to the Singapore TEE. |
| S3 Oracle on TEE | **PASS** | `read_oracle` with full validation on TEE: SOL `aftwT1BR…`, BTC `5davWzzf…`, ETH `27pCbcGa…`; age 0 s, posted_slot > 0, stored exponent +8 (feed-list −8 used). |
| S4 VRF on TEE | **PASS** (after fix) | 5/5 callbacks via `DEFAULT_EPHEMERAL_QUEUE`, 1–2 TEE slots (10–21 ms) after request. First attempt failed: SDK `#[vrf_callback]` evaluates the "const" identity PDA at runtime (~261k CU) → workaround, see DECISIONS #3. Oracle stops retrying a failed fulfilment after ~75 s. |
| S5 Magic Action | **PASS** + failure observed | OK: TEE `2xcQmfYW…` → base `5ZjVsDNj…`, probe undelegated, flag set, committed tick_no 3. Forced fail: action tx `3oBzcX1c…` reverted (6013), committor retried commit **without** the action → base `4jmRUvyx…`; state landed, flag not set. At action time the committed account is still owned by the Delegation Program. |
| S6 Crank | **PASS** | `ScheduleCrankCpi` 100 ms × 100: all 100 fired, ~10.8/s observed; TEE sig `4zDbA4ZK…`. |

## Design facts learned (feed into M1+)
- `finalize_raid` must read committed `Results`/`Raid` as raw data (owner = Delegation Program at action time), not `Account<…>`.
- VRF requests need a timeout + re-request path (failed fulfilments stop after ~75 s).
- Raid keys need no SOL to send TEE txs.
- Program builds use `opt-level = "z"` to fit deploy rent; watch CU.

## M1 — program core (done)
- Program `CTJGR8bj7HAzFja1YGjvkc9wP2JrFnachqMLeoniox97` deployed to devnet (`LxaerxdZeuRwZh5y9ZSzy8RfbMtrNgi2WVRCsLXvgK1gDRMwDw1NnRsjUmHJ8sPZb8srHujwdmKP9ptD6VoVNvG`), 489,840 bytes, Anchor 1.0.2 pinned, SDK 0.18.0.
  init_config, faucet_dusd (100/day cap), faucet_play, create_raid / create_slot / create_districts, join_raid (10 dUSD → escrow ATA), delegate_pda, setup_slot_permissions / setup_secret_permission, request_raid_vrf / vrf_callback_raid (spawns, exit plan, leaf index), start_raid, move_to, tick, tick_raiders (fog).
- MagicSVM (`scripts/test-magicsvm.sh`, `tests/magicsvm-rs/tests/m1_core.rs`):
```
test m1_tick_fog_privacy_and_faucet ... ok
test test3_movement_cheat_rejected ... ok
test test4_wrong_signer_rejected ... ok
test result: ok. 3 passed; 0 failed
```
- Mints (Token-2022, metadata in name, authority = PDA `9WPyyGkT…`): `config/devnet.json` — dUSD `42S5iBrH…`, dTWR `9SPhR2uf…`, dFAC `BycRy1zK…`, dHRB `EKJA3eBB…`, dPLAY `418Y8pTc…`.
- Devnet run `scripts/m1-devnet.ts` (raid `Gq1AdFRd…`, evidence `spikes/results/m1-devnet.json`): init_config `2MAyD9CH…`, faucets, create raid `3fU7d512…`, joins `3K4cS9G6…` / `5ETARxjr…` (escrow 20 dUSD), delegate `4F6sbveq…`, permissions `3PrK9MJw…` / `5aUvMH7q…` / `4wMeSpuA…`, VRF request `2pE3oFjq…` → seeded in 1.74 s, start `47LrTvwd…`, 10 tick+fog txs → tick_no 10, legal move `pd85LW75…`. Rejected on TEE: 200-unit jump (0x177d TooFast), raider B moving slot 0 (0x1779 WrongRaidKey).
- Devnet privacy reads: rprv0 → A raid key ✓ data, keeper ✓ data, B raid key null, no token null; view0 → A data, B null, keeper null; secret → keeper data, A null; rpub0 public. Members with TX_LOGS_FLAG only can read (DECISIONS #11 confirmed).
- Finding: txs that touch private accounts are hidden from signature lists/logs, even for the keeper. The VRF callback signature is not discoverable (not under raid, secret, or the VRF queue). Needed for the report (§8) and SUBMISSION (§11): solve in M5.

## M2 — loot and combat (done)
- Program upgraded on devnet (`43mXfVp4…`, then `yMdyKi4p…`), 603,112 bytes. New: `create_crates`, `place_crates` (VRF-seed-derived positions + contents, keeper-only permission first), `open_crate` / `finish_open` (2 s channel, ≤ 1 tile, crate made public), `shoot` (500 ms cooldown, 6 tiles, 34 dmg; kill → dead + exposed + backpack into the public drop crate), `drop_backpack` (hazard deaths), hazards (10 HP/s on hazard rows of a falling district) and dormant wake in `tick` / `tick_raiders`.
- MagicSVM (all suites):
```
m1_core:        test3_movement_cheat_rejected ok · test4_wrong_signer_rejected ok · m1_tick_fog_privacy_and_faucet ok
m2_loot_combat: test1_partial_eight_raiders_loot_conserved ok · test2_same_seed_same_outcome ok
test result: ok. 5 passed; 0 failed
```
  Test 1 (partial): 8 raiders, 36 crates = 12/district, last 4 dormant, inside their district, sum = 44 dUSD exactly; open/finish rules, shoot cooldown/range, kill → drop crate → loot; loot conserved after every step; raid ENDED at 300 s. Test 2: same seed → identical spawns, crates, event log, end state; another seed → different layout.
- Devnet run `scripts/m2-devnet.ts` (raid `CXSon4Rb…`, evidence `spikes/results/m2-devnet.json`): create `4CRdEDyU…`, join `4MzCvDT8…`, 49 delegations (`2PwwZgtK…`), place crates `4vBPLypg…`, start `47P5Lswc…`, open `3uAh9w4N…` → finish `2vDcXQH4…` (313,523 units), shots `5XgSox1S…` ×3 → kill, drop open `5XGBgpQq…` → finish `fFvvukCF…`, ticks `35szRdfQ…`. Rejected on TEE: finish before 2 s (0x178c), second shot inside 500 ms (0x178e). Loot 11,000,000 before = after. Privacy: sealed crate null for raider B, raider A and no token; opened and drop crates public.
- Findings: (1) the TEE rejects a tx that lists a non-delegated account as writable even if unused → `finish_open` takes the crate permission as an optional account (drop crates have none); MagicSVM did not catch this. (2) `ExtendProgram` needs ≥ 10,240 bytes per call (`scripts/deploy.sh` handles it). (3) A confirmed TEE round trip from this machine is ~4–5 s; gameplay sends use preflight-on `sendRawTransaction` (~0.45 s), and "too early" checks must be tested inside one tx.
- Public crate positions (DECISIONS #16): `Raid.crate_pos`, upgrade `36wYbMkJ…`. Devnet check `scripts/m2-public-positions.ts` (raid `JBhwMQjF…`): stranger and no-token reads of Raid succeed, 72/72 positions match the private crates, 72/72 crate reads return null.
- Not yet exercised: hazard damage and dormant wake need moving prices (M3); tested there.

## Blocked
- (nothing)

## Stubbed / not real yet
- `start_raid` does not yet require a verified Mystery slice (`verify_slice` lands in M3). M1 devnet runs use Live mode.
- `tick` sets `market_step` but applies no prices yet (M3), so hazards and dormant waking never trigger on devnet before M3.

## Next
- M3: Mystery slice pipeline + verify_slice + data build + Merkle; Live oracle path; trades with exposure; hazard/wake tests with real price steps. Test 6.
