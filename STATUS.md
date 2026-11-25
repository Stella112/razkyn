# STATUS.md

_Last updated: 2026-11-25 — M6 THE WIRE built and run on devnet (template path; model path waits for ANTHROPIC_API_KEY). Next: M7 (client)._

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

## M3 — market (done)
- Program upgraded (`4eZ86xt1…`, fix `iVcNFivo…`), 661,576 bytes. New: `load_slice` (5 × 720 B into RaidSecret on the TEE), `verify_slice` (hash(slice) → leaf → Merkle proof at the VRF index vs `Raid.day_root`; Mystery raids cannot start unverified), market step per second in `tick` (Mystery: slice; Live: Pricing Oracle with full validation, stale → price held), `start_trade` / `finish_trade` / `cancel_trade` (terminal, 3 s, position public while channelling, no spread, moving blocked).
- Mystery data (`scripts/build-mystery.ts`): 23 days from Binance 1-minute spot klines (SOL/BTC/ETH → Tower/Factory/Harbor), root `1169ada7…` in `data/mystery/merkle.json`; slices + preimages private (DECISIONS #17).
- MagicSVM (all suites, 10/10):
```
m1: test3 ok · test4 ok · m1_tick_fog_privacy_and_faucet ok
m2: test1_partial ok · test2 ok
m3: test6_verify_slice_rejects_wrong_slice_and_wrong_leaf ok · m3_market_steps_wake_and_hazards ok · m3_trade_at_terminal_with_exposure ok
    m3_live_mode_holds_price_without_valid_feed ok · m3_late_first_tick_keeps_start_at_step0 ok
```
  Hazards (10 HP/s at level 2 → death → drop_backpack, idempotent) and dormant wake at +2% are tested here with a designed slice; the devnet day did not cross the thresholds in 30 s.
- Devnet `scripts/m3-devnet.ts` (evidence `spikes/results/m3-devnet.json`): Mystery raid `3kcJcNLb…`, VRF leaf 5/23; start before verify rejected (0x1793), a real but non-chosen day rejected (0x1792); load `33EVd1EW…` → verify `3aGfDr6r…` (TS Merkle and on-chain verifier agree) → start `2RF5Fepn…`; at step 30 all 3 districts = slice exactly, start 1,000,000. Spoiler check: stranger reads 6 public accounts, 0 dates/tickers; secret null for stranger and no token. Trade `31gSNT3j…` → `3z9tJwup…`: 307,538 Tower → 305,088 Factory at current prices; raider B saw A exposed at the terminal. Live raid `7FJcP2eW…` (start `245PcDhN…`): 12 ticks read SOL/BTC/ETH oracle feeds on the TEE, indexes 999,728–1,000,275 around 100.0000.
- Bug found on devnet and fixed: start price was "first price seen" (the first tick lands seconds after start) → now always 100.0000; regression test added.

## M4 — settlement (done except spectator pools)
- Program upgraded (`4W1XnG62…`), 919,824 bytes. New: `start_extract` / `finish_extract` (open exit window, ≤ 1 tile, 5 s), `create_settlement`, `end_raid` (Results with Option A payouts, conservation asserted, commit-and-undelegate Raid + Results with a post-commit `finalize_raid` action), `reveal_after_end`, `finalize_raid` (#[action]: escrow signer + source_program checks, hash-checked Results, ops → treasury, backing → reserve, idempotent), `settle_stuck_raid` (≥ 120 s, raid undelegated, not settled), `claim` (dUSD protected + pro-rata share, mints scaled backpack units, ClaimRecord makes a second claim fail), `post_report_hash`, admin `set_test_flags`.
- MagicSVM (all suites, 15/15):
```
m1: test3 ok · test4 ok · m1_tick_fog_privacy_and_faucet ok
m2: test1_partial ok · test2 ok
m3: test6 ok · market_steps_wake_and_hazards ok · trade_at_terminal ok · live_mode_holds_price ok · late_first_tick ok
m4: test1_full_raid_settles_and_claims_sum_to_escrow_test5_guards ok · option_a_no_extraction ok · option_a_rally_scales ok · option_a_fall ok · option_a_randomized_conservation ok
```
- Devnet `scripts/m4-devnet.ts` (evidence `spikes/results/m4-devnet.json`): R1 `5nFy4cyw…` end_raid `9YVGSTPj…` → base commit `5EgrhiDX…` → settled via finalize_raid action (~6 s). **§9 test 11**: R2 `8cL2ZkMY…` with fail_finalize set: commit `XfWXRscD…` landed, Raid + Results back to the program, not settled; settle_stuck before 120 s rejected (0x17a0); settle_stuck `2meZ67YL…` → settled via 2. Claims: 4 × 9.5 dUSD = expected, escrow 0 after, second claims rejected; ops treasury +2 dUSD.
- Devnet `scripts/m4-extract-devnet.ts` (evidence `spikes/results/m4-extract-devnet.json`): loot 485,489 Harbor units → pipelined walk to exit (54 moves, 13.4 s) → extract (`4nUFVTZH…`, `3zkpw9Z3…`) in window 1 → end at 300 s → end_raid `5EGGixnT…` → settled via action → claim `5ycECs2Y…` minted exactly 485,489 dHRB; reserve 487,953 = value at final price 100.5076; payouts 18,512,047 + reserve 487,953 + ops 1,000,000 = 20,000,000.
- Findings: (1) devnet-tee requires an action's escrow authority to sign the tx (PDA via invoke_signed rejected) → caller is escrow authority (DECISIONS #24). (2) An account that is both committed and escrow authority was not undelegated (MagicSVM). (3) end_raid needs a raised CU limit (~1.4M requested). (4) Clients must pipeline moves at ~10 Hz: one RTT per move (~0.7 s) gave 0.85 tiles/s and missed 30 s exit windows; pipelined ≈ 4.5 tiles/s. (5) The 920 KB program makes each upgrade need ~4.7 SOL of temporary buffer.
- Not built: spectator pools (`place_bet`, SpecPool, test 7) — scope decision pending.

## M5 — keeper (done)
- `keeper/src/`: `ticker.ts` (10 Hz pipelined tick + fog driver with latency/gap stats), `bots.ts` (BOT raiders with their own raid keys: loot the nearest public unopened crate, wander, random trades at terminals, extract in the last window; labelled BOT, `join_raid` co-signed by the keeper sets `is_bot`), `claimer.ts` (claims for every raider; also a CLI for a settled raid), `report.ts` (canonical JSON → sha256 → `post_report_hash`, file in `app/public/reports/<raidId>.json`), `raid.ts` (orchestrator: create → humans/BOTs join → delegate → permissions → VRF → crates → Mystery load + verify → start → ticks + bots → end_raid → action or settle_stuck fallback → claims → report), `index.ts` (CLI: `--mode --slots --humans --human-wait --hz`).
- Devnet: full Mystery raid, 8 BOTs, no manual steps — raid `2bPPQAKN…` (id 1795620791461, leaf 16/23). end_raid `5BNezeCn…` → base commit `3HVArVcs…` → settled via finalize_raid action; 8/8 claims; report hash `37bd8cad…` posted `4oLSfpbz…` and recomputes to the same value. 7/8 BOTs extracted. Conservation: dUSD 50,137,514 + reserve 25,862,486 + ops 4,000,000 = stakes 80,000,000. Evidence `spikes/results/keeper-raid-1795620791461.json`.
- **§9 test 12 (load, 8 raiders at 10 Hz for 300 s, no stall > 1 s):** run 2 `2bPPQAKN…`: 2,867/2,867 ticks landed, p50 574 / p95 1,089 ms, max gap 1,103 ms, **1 stall > 1 s → narrow FAIL**. Earlier run `9AbuRy5D…`: 2,862/2,862, max gap 791 ms, 0 stalls → PASS. The gap is this machine's link to the Singapore TEE (S2 baseline RTT ~450 ms); re-run from the Singapore keeper host in M8.
- Fixed during M5: `sendTee` now checks the signature status when confirmation expires (end_raid landed but confirmation timed out once; that raid was finished with `claimer.ts`).
- Report change after this run: Mystery reports now carry the full verified slice (300 steps) as `pricePath` (`pricePathSource`); the committed report for 1795620791461 predates this and keeps keeper samples (its hash is unchanged).
- Open: VRF callback signature still not discoverable (report says so); in-game events (`event_plan_hash`, WIRE EVENTS) not implemented; spectator pools deferred (DECISIONS #25).

## M6 — THE WIRE (done on the template path; model path not yet exercised)
- `keeper/wire/`: `facts.ts` (public fact feed: polls Raid, Districts, RaiderPublic and Crates once per second through a TEE token for a freshly generated key that is never a permission member; every fact is rebuilt from a whitelist by `sanitizeFact`), `filter.ts` (post-filter: length, tickers, coin/company names, months, years, `# STATUS.md

_Last updated: 2026-11-25 — M6 THE WIRE built and run on devnet (template path; model path waits for ANTHROPIC_API_KEY). Next: M7 (client)._

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

## M3 — market (done)
- Program upgraded (`4eZ86xt1…`, fix `iVcNFivo…`), 661,576 bytes. New: `load_slice` (5 × 720 B into RaidSecret on the TEE), `verify_slice` (hash(slice) → leaf → Merkle proof at the VRF index vs `Raid.day_root`; Mystery raids cannot start unverified), market step per second in `tick` (Mystery: slice; Live: Pricing Oracle with full validation, stale → price held), `start_trade` / `finish_trade` / `cancel_trade` (terminal, 3 s, position public while channelling, no spread, moving blocked).
- Mystery data (`scripts/build-mystery.ts`): 23 days from Binance 1-minute spot klines (SOL/BTC/ETH → Tower/Factory/Harbor), root `1169ada7…` in `data/mystery/merkle.json`; slices + preimages private (DECISIONS #17).
- MagicSVM (all suites, 10/10):
```
m1: test3 ok · test4 ok · m1_tick_fog_privacy_and_faucet ok
m2: test1_partial ok · test2 ok
m3: test6_verify_slice_rejects_wrong_slice_and_wrong_leaf ok · m3_market_steps_wake_and_hazards ok · m3_trade_at_terminal_with_exposure ok
    m3_live_mode_holds_price_without_valid_feed ok · m3_late_first_tick_keeps_start_at_step0 ok
```
  Hazards (10 HP/s at level 2 → death → drop_backpack, idempotent) and dormant wake at +2% are tested here with a designed slice; the devnet day did not cross the thresholds in 30 s.
- Devnet `scripts/m3-devnet.ts` (evidence `spikes/results/m3-devnet.json`): Mystery raid `3kcJcNLb…`, VRF leaf 5/23; start before verify rejected (0x1793), a real but non-chosen day rejected (0x1792); load `33EVd1EW…` → verify `3aGfDr6r…` (TS Merkle and on-chain verifier agree) → start `2RF5Fepn…`; at step 30 all 3 districts = slice exactly, start 1,000,000. Spoiler check: stranger reads 6 public accounts, 0 dates/tickers; secret null for stranger and no token. Trade `31gSNT3j…` → `3z9tJwup…`: 307,538 Tower → 305,088 Factory at current prices; raider B saw A exposed at the terminal. Live raid `7FJcP2eW…` (start `245PcDhN…`): 12 ticks read SOL/BTC/ETH oracle feeds on the TEE, indexes 999,728–1,000,275 around 100.0000.
- Bug found on devnet and fixed: start price was "first price seen" (the first tick lands seconds after start) → now always 100.0000; regression test added.

## M4 — settlement (done except spectator pools)
- Program upgraded (`4W1XnG62…`), 919,824 bytes. New: `start_extract` / `finish_extract` (open exit window, ≤ 1 tile, 5 s), `create_settlement`, `end_raid` (Results with Option A payouts, conservation asserted, commit-and-undelegate Raid + Results with a post-commit `finalize_raid` action), `reveal_after_end`, `finalize_raid` (#[action]: escrow signer + source_program checks, hash-checked Results, ops → treasury, backing → reserve, idempotent), `settle_stuck_raid` (≥ 120 s, raid undelegated, not settled), `claim` (dUSD protected + pro-rata share, mints scaled backpack units, ClaimRecord makes a second claim fail), `post_report_hash`, admin `set_test_flags`.
- MagicSVM (all suites, 15/15):
```
m1: test3 ok · test4 ok · m1_tick_fog_privacy_and_faucet ok
m2: test1_partial ok · test2 ok
m3: test6 ok · market_steps_wake_and_hazards ok · trade_at_terminal ok · live_mode_holds_price ok · late_first_tick ok
m4: test1_full_raid_settles_and_claims_sum_to_escrow_test5_guards ok · option_a_no_extraction ok · option_a_rally_scales ok · option_a_fall ok · option_a_randomized_conservation ok
```
- Devnet `scripts/m4-devnet.ts` (evidence `spikes/results/m4-devnet.json`): R1 `5nFy4cyw…` end_raid `9YVGSTPj…` → base commit `5EgrhiDX…` → settled via finalize_raid action (~6 s). **§9 test 11**: R2 `8cL2ZkMY…` with fail_finalize set: commit `XfWXRscD…` landed, Raid + Results back to the program, not settled; settle_stuck before 120 s rejected (0x17a0); settle_stuck `2meZ67YL…` → settled via 2. Claims: 4 × 9.5 dUSD = expected, escrow 0 after, second claims rejected; ops treasury +2 dUSD.
- Devnet `scripts/m4-extract-devnet.ts` (evidence `spikes/results/m4-extract-devnet.json`): loot 485,489 Harbor units → pipelined walk to exit (54 moves, 13.4 s) → extract (`4nUFVTZH…`, `3zkpw9Z3…`) in window 1 → end at 300 s → end_raid `5EGGixnT…` → settled via action → claim `5ycECs2Y…` minted exactly 485,489 dHRB; reserve 487,953 = value at final price 100.5076; payouts 18,512,047 + reserve 487,953 + ops 1,000,000 = 20,000,000.
- Findings: (1) devnet-tee requires an action's escrow authority to sign the tx (PDA via invoke_signed rejected) → caller is escrow authority (DECISIONS #24). (2) An account that is both committed and escrow authority was not undelegated (MagicSVM). (3) end_raid needs a raised CU limit (~1.4M requested). (4) Clients must pipeline moves at ~10 Hz: one RTT per move (~0.7 s) gave 0.85 tiles/s and missed 30 s exit windows; pipelined ≈ 4.5 tiles/s. (5) The 920 KB program makes each upgrade need ~4.7 SOL of temporary buffer.
- Not built: spectator pools (`place_bet`, SpecPool, test 7) — scope decision pending.

## M5 — keeper (done)
- `keeper/src/`: `ticker.ts` (10 Hz pipelined tick + fog driver with latency/gap stats), `bots.ts` (BOT raiders with their own raid keys: loot the nearest public unopened crate, wander, random trades at terminals, extract in the last window; labelled BOT, `join_raid` co-signed by the keeper sets `is_bot`), `claimer.ts` (claims for every raider; also a CLI for a settled raid), `report.ts` (canonical JSON → sha256 → `post_report_hash`, file in `app/public/reports/<raidId>.json`), `raid.ts` (orchestrator: create → humans/BOTs join → delegate → permissions → VRF → crates → Mystery load + verify → start → ticks + bots → end_raid → action or settle_stuck fallback → claims → report), `index.ts` (CLI: `--mode --slots --humans --human-wait --hz`).
- Devnet: full Mystery raid, 8 BOTs, no manual steps — raid `2bPPQAKN…` (id 1795620791461, leaf 16/23). end_raid `5BNezeCn…` → base commit `3HVArVcs…` → settled via finalize_raid action; 8/8 claims; report hash `37bd8cad…` posted `4oLSfpbz…` and recomputes to the same value. 7/8 BOTs extracted. Conservation: dUSD 50,137,514 + reserve 25,862,486 + ops 4,000,000 = stakes 80,000,000. Evidence `spikes/results/keeper-raid-1795620791461.json`.
- **§9 test 12 (load, 8 raiders at 10 Hz for 300 s, no stall > 1 s):** run 2 `2bPPQAKN…`: 2,867/2,867 ticks landed, p50 574 / p95 1,089 ms, max gap 1,103 ms, **1 stall > 1 s → narrow FAIL**. Earlier run `9AbuRy5D…`: 2,862/2,862, max gap 791 ms, 0 stalls → PASS. The gap is this machine's link to the Singapore TEE (S2 baseline RTT ~450 ms); re-run from the Singapore keeper host in M8.
- Fixed during M5: `sendTee` now checks the signature status when confirmation expires (end_raid landed but confirmation timed out once; that raid was finished with `claimer.ts`).
- Report change after this run: Mystery reports now carry the full verified slice (300 steps) as `pricePath` (`pricePathSource`); the committed report for 1795620791461 predates this and keeps keeper samples (its hash is unchanged).
- Open: VRF callback signature still not discoverable (report says so); in-game events (`event_plan_hash`, WIRE EVENTS) not implemented; spectator pools deferred (DECISIONS #25).

, 4+ digit numbers, URLs before reveal; quotes must be listed headlines; Live mode: no company names or `# STATUS.md

_Last updated: 2026-11-25 — M6 THE WIRE built and run on devnet (template path; model path waits for ANTHROPIC_API_KEY). Next: M7 (client)._

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

## M3 — market (done)
- Program upgraded (`4eZ86xt1…`, fix `iVcNFivo…`), 661,576 bytes. New: `load_slice` (5 × 720 B into RaidSecret on the TEE), `verify_slice` (hash(slice) → leaf → Merkle proof at the VRF index vs `Raid.day_root`; Mystery raids cannot start unverified), market step per second in `tick` (Mystery: slice; Live: Pricing Oracle with full validation, stale → price held), `start_trade` / `finish_trade` / `cancel_trade` (terminal, 3 s, position public while channelling, no spread, moving blocked).
- Mystery data (`scripts/build-mystery.ts`): 23 days from Binance 1-minute spot klines (SOL/BTC/ETH → Tower/Factory/Harbor), root `1169ada7…` in `data/mystery/merkle.json`; slices + preimages private (DECISIONS #17).
- MagicSVM (all suites, 10/10):
```
m1: test3 ok · test4 ok · m1_tick_fog_privacy_and_faucet ok
m2: test1_partial ok · test2 ok
m3: test6_verify_slice_rejects_wrong_slice_and_wrong_leaf ok · m3_market_steps_wake_and_hazards ok · m3_trade_at_terminal_with_exposure ok
    m3_live_mode_holds_price_without_valid_feed ok · m3_late_first_tick_keeps_start_at_step0 ok
```
  Hazards (10 HP/s at level 2 → death → drop_backpack, idempotent) and dormant wake at +2% are tested here with a designed slice; the devnet day did not cross the thresholds in 30 s.
- Devnet `scripts/m3-devnet.ts` (evidence `spikes/results/m3-devnet.json`): Mystery raid `3kcJcNLb…`, VRF leaf 5/23; start before verify rejected (0x1793), a real but non-chosen day rejected (0x1792); load `33EVd1EW…` → verify `3aGfDr6r…` (TS Merkle and on-chain verifier agree) → start `2RF5Fepn…`; at step 30 all 3 districts = slice exactly, start 1,000,000. Spoiler check: stranger reads 6 public accounts, 0 dates/tickers; secret null for stranger and no token. Trade `31gSNT3j…` → `3z9tJwup…`: 307,538 Tower → 305,088 Factory at current prices; raider B saw A exposed at the terminal. Live raid `7FJcP2eW…` (start `245PcDhN…`): 12 ticks read SOL/BTC/ETH oracle feeds on the TEE, indexes 999,728–1,000,275 around 100.0000.
- Bug found on devnet and fixed: start price was "first price seen" (the first tick lands seconds after start) → now always 100.0000; regression test added.

## M4 — settlement (done except spectator pools)
- Program upgraded (`4W1XnG62…`), 919,824 bytes. New: `start_extract` / `finish_extract` (open exit window, ≤ 1 tile, 5 s), `create_settlement`, `end_raid` (Results with Option A payouts, conservation asserted, commit-and-undelegate Raid + Results with a post-commit `finalize_raid` action), `reveal_after_end`, `finalize_raid` (#[action]: escrow signer + source_program checks, hash-checked Results, ops → treasury, backing → reserve, idempotent), `settle_stuck_raid` (≥ 120 s, raid undelegated, not settled), `claim` (dUSD protected + pro-rata share, mints scaled backpack units, ClaimRecord makes a second claim fail), `post_report_hash`, admin `set_test_flags`.
- MagicSVM (all suites, 15/15):
```
m1: test3 ok · test4 ok · m1_tick_fog_privacy_and_faucet ok
m2: test1_partial ok · test2 ok
m3: test6 ok · market_steps_wake_and_hazards ok · trade_at_terminal ok · live_mode_holds_price ok · late_first_tick ok
m4: test1_full_raid_settles_and_claims_sum_to_escrow_test5_guards ok · option_a_no_extraction ok · option_a_rally_scales ok · option_a_fall ok · option_a_randomized_conservation ok
```
- Devnet `scripts/m4-devnet.ts` (evidence `spikes/results/m4-devnet.json`): R1 `5nFy4cyw…` end_raid `9YVGSTPj…` → base commit `5EgrhiDX…` → settled via finalize_raid action (~6 s). **§9 test 11**: R2 `8cL2ZkMY…` with fail_finalize set: commit `XfWXRscD…` landed, Raid + Results back to the program, not settled; settle_stuck before 120 s rejected (0x17a0); settle_stuck `2meZ67YL…` → settled via 2. Claims: 4 × 9.5 dUSD = expected, escrow 0 after, second claims rejected; ops treasury +2 dUSD.
- Devnet `scripts/m4-extract-devnet.ts` (evidence `spikes/results/m4-extract-devnet.json`): loot 485,489 Harbor units → pipelined walk to exit (54 moves, 13.4 s) → extract (`4nUFVTZH…`, `3zkpw9Z3…`) in window 1 → end at 300 s → end_raid `5EGGixnT…` → settled via action → claim `5ycECs2Y…` minted exactly 485,489 dHRB; reserve 487,953 = value at final price 100.5076; payouts 18,512,047 + reserve 487,953 + ops 1,000,000 = 20,000,000.
- Findings: (1) devnet-tee requires an action's escrow authority to sign the tx (PDA via invoke_signed rejected) → caller is escrow authority (DECISIONS #24). (2) An account that is both committed and escrow authority was not undelegated (MagicSVM). (3) end_raid needs a raised CU limit (~1.4M requested). (4) Clients must pipeline moves at ~10 Hz: one RTT per move (~0.7 s) gave 0.85 tiles/s and missed 30 s exit windows; pipelined ≈ 4.5 tiles/s. (5) The 920 KB program makes each upgrade need ~4.7 SOL of temporary buffer.
- Not built: spectator pools (`place_bet`, SpecPool, test 7) — scope decision pending.

## M5 — keeper (done)
- `keeper/src/`: `ticker.ts` (10 Hz pipelined tick + fog driver with latency/gap stats), `bots.ts` (BOT raiders with their own raid keys: loot the nearest public unopened crate, wander, random trades at terminals, extract in the last window; labelled BOT, `join_raid` co-signed by the keeper sets `is_bot`), `claimer.ts` (claims for every raider; also a CLI for a settled raid), `report.ts` (canonical JSON → sha256 → `post_report_hash`, file in `app/public/reports/<raidId>.json`), `raid.ts` (orchestrator: create → humans/BOTs join → delegate → permissions → VRF → crates → Mystery load + verify → start → ticks + bots → end_raid → action or settle_stuck fallback → claims → report), `index.ts` (CLI: `--mode --slots --humans --human-wait --hz`).
- Devnet: full Mystery raid, 8 BOTs, no manual steps — raid `2bPPQAKN…` (id 1795620791461, leaf 16/23). end_raid `5BNezeCn…` → base commit `3HVArVcs…` → settled via finalize_raid action; 8/8 claims; report hash `37bd8cad…` posted `4oLSfpbz…` and recomputes to the same value. 7/8 BOTs extracted. Conservation: dUSD 50,137,514 + reserve 25,862,486 + ops 4,000,000 = stakes 80,000,000. Evidence `spikes/results/keeper-raid-1795620791461.json`.
- **§9 test 12 (load, 8 raiders at 10 Hz for 300 s, no stall > 1 s):** run 2 `2bPPQAKN…`: 2,867/2,867 ticks landed, p50 574 / p95 1,089 ms, max gap 1,103 ms, **1 stall > 1 s → narrow FAIL**. Earlier run `9AbuRy5D…`: 2,862/2,862, max gap 791 ms, 0 stalls → PASS. The gap is this machine's link to the Singapore TEE (S2 baseline RTT ~450 ms); re-run from the Singapore keeper host in M8.
- Fixed during M5: `sendTee` now checks the signature status when confirmation expires (end_raid landed but confirmation timed out once; that raid was finished with `claimer.ts`).
- Report change after this run: Mystery reports now carry the full verified slice (300 steps) as `pricePath` (`pricePathSource`); the committed report for 1795620791461 predates this and keeps keeper samples (its hash is unchanged).
- Open: VRF callback signature still not discoverable (report says so); in-game events (`event_plan_hash`, WIRE EVENTS) not implemented; spectator pools deferred (DECISIONS #25).

), `templates.ts`, `prompt.md` (system prompt), `llm.ts` (`claude-sonnet-5-5`, 1.5 s abort, no retries; timeout/error/refusal/filtered → template), `wire.ts` (LIVE batched every 3 s, IN-GAME EVENT lines for hazards / wakes / exit windows with a 30 s repeat cooldown, DEBRIEF ≤ 120 words per raider after end_raid with cited headline URLs), `server.ts` (`GET /wire/:raidId` JSON, `/wire/:raidId/stream` SSE, port 8787). Wired into the keeper; lines + debriefs go into the report (`wire`). `@anthropic-ai/sdk` pinned 1.14.0. Decisions #26–#28.
- **§9 test 10 PASS** (`tests/devnet/test10-wire-leak.ts`, evidence `spikes/results/test10-wire-leak.json`): a log with a live private backpack, private positions, crate contents and a VRF seed → sanitizer keeps 6/8 records with no private value; a hostile model that tries to leak and spoil → 3 prompts with 0 private values, 3/3 outputs replaced by templates; spoiler filter rejects 11/11 bad lines, passes 4/4 clean ones; all 12 template kinds + debrief pass the filter. Real-model part skipped (no key).
```
hostile model: 3 prompts, 0 private values in prompts; 3 lines, all replaced by templates
spoiler filter: 11/11 spoilers rejected, 4/4 clean lines pass
templates: 12/12 lines + debrief pass the filter
TEST 10 PASS: no private value reached a prompt or an output
```
- Devnet keeper raid with THE WIRE: `aKz9Gb2H…` (id 1795623238646, Mystery, 8 BOTs, leaf 2): 58 WIRE lines from the public feed (prices, crates, exposed trades, hazards, wakes, exit window, 8 knockouts) + 8 debriefs; settled via action; report `883940a3…` posted `2QmtLsnz…`. **Test 12 PASS on this run**: 1,340/1,340 ticks, p95 1,024 ms, max gap 719 ms, 0 stalls (the raid ended at ~235 s because every BOT died in hazards on a falling day).
- Earlier run `2o5oJu26…` (id 1795622319302): the feed decoded with the wrong coder and produced no live lines (fixed; `scripts/debug-wire-feed.ts`); that run also had a degraded link (setup 318 s, a 21 s tick gap, base tx expiry), so it is not used for test 12.
- Bug fixed: the report read `RaiderPublic` alive/kills from the stale base copy (the accounts stay delegated); it now reads the TEE (`scripts/check-rpub-tee.ts`: TEE alive=false for all 8, base alive=true). The two reports above predate the fix and show alive=true; their on-chain hashes are unchanged, so they stay as they are.
- Not verified: the model path (no `ANTHROPIC_API_KEY`): latency vs the 1.5 s budget and output quality are unknown. Every line so far is a template.

## Blocked
- (nothing)

## Stubbed / not real yet
- In-game events: no scripted event plan; WIRE EVENTS narrate rule-driven events (DECISIONS #26, pending). `event_plan_hash` stays zero.
- THE WIRE model path: not run yet (needs `ANTHROPIC_API_KEY` in `.env`); demo lines are templates until then.
- Spectator pools (`place_bet`, SpecPool, test 7): not built (deferred until after the client, DECISIONS #25).
- `data/mystery/headlines.json` does not exist: debriefs quote no headlines and cite none. Adding it changes every leaf's `headlines_hash`, so the Merkle root must be rebuilt before the demo raids.
- BOTs do not avoid hazard tiles: on a falling day all 8 died (raid 1795623238646).

## Next
- M7: client (Vite + React + Phaser: landing, lobby, raid HUD with THE WIRE ticker over SSE, Try to peek, watch mode, reveal + debrief, report page). Tests 8, 9, 13.
