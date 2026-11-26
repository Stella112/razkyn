//! Shared MagicSVM helpers: a full lobby → delegate → TEE permissions → VRF → crates → start
//! flow, plus small actions (move, walk, open, shoot, tick) used by the milestone suites.
#![allow(dead_code)]

pub use {
    anchor_lang::{prelude::Pubkey, system_program, AccountDeserialize, Id, InstructionData, ToAccountMetas},
    ephemeral_rollups_sdk::{
        access_control::structs::EphemeralPermission,
        anchor::DelegationProgram,
        consts::{
            ASSOCIATED_TOKEN_PROGRAM_ID, EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
        },
        pda::{
            delegate_buffer_pda_from_delegated_account_and_owner_program,
            delegation_metadata_pda_from_delegated_account, delegation_record_pda_from_delegated_account,
        },
        vrf::consts::{DEFAULT_EPHEMERAL_QUEUE, VRF_PROGRAM_ID},
    },
    magicsvm::{MagicSVM, TransactionTarget},
    razkyn::{
        accounts, constants::*, instruction,
        instructions::{PickBook, RaidAccount},
        state::{crate_state, mode, status, ClaimRecord, Crate, District, Raid, RaiderPrivate, RaiderPublic, Results, Settlement, View},
    },
    solana_address::Address,
    solana_clock::Clock,
    solana_instruction::{error::InstructionError, AccountMeta, Instruction},
    solana_keypair::Keypair,
    solana_message::Message,
    solana_native_token::LAMPORTS_PER_SOL,
    solana_signer::Signer,
    solana_system_interface::instruction as system_instruction,
    solana_transaction::Transaction,
    solana_transaction_error::TransactionError,
};

pub const RAID_ID: u64 = 1;
const ERR_BASE: u32 = 6000;
// RazkynError discriminants (enum order in programs/razkyn/src/errors.rs).
pub const E_WRONG_RAID_KEY: u32 = ERR_BASE + 9;
pub const E_RAIDER_DEAD: u32 = ERR_BASE + 10;
pub const E_RAID_OVER: u32 = ERR_BASE + 12;
pub const E_TOO_FAST: u32 = ERR_BASE + 13;
pub const E_OUT_OF_BOUNDS: u32 = ERR_BASE + 14;
pub const E_FAUCET_CAP: u32 = ERR_BASE + 15;
pub const E_BAD_STATUS: u32 = ERR_BASE + 2;
pub const E_CRATE_NOT_OPENABLE: u32 = ERR_BASE + 24;
pub const E_CRATE_DORMANT: u32 = ERR_BASE + 25;
pub const E_OUT_OF_RANGE: u32 = ERR_BASE + 26;
pub const E_NO_CHANNEL: u32 = ERR_BASE + 27;
pub const E_CHANNEL_NOT_DONE: u32 = ERR_BASE + 28;
pub const E_COOLDOWN: u32 = ERR_BASE + 30;
pub const E_CRATES_NOT_PLACED: u32 = ERR_BASE + 31;
pub const E_BAD_CHUNK: u32 = ERR_BASE + 32;
pub const E_SLICE_NOT_LOADED: u32 = ERR_BASE + 33;
pub const E_BAD_PROOF: u32 = ERR_BASE + 34;
pub const E_SLICE_NOT_VERIFIED: u32 = ERR_BASE + 35;
pub const E_NOT_AT_TERMINAL: u32 = ERR_BASE + 36;
pub const E_TRADING: u32 = ERR_BASE + 37;
pub const E_INSUFFICIENT_UNITS: u32 = ERR_BASE + 39;
pub const E_EXIT_CLOSED: u32 = ERR_BASE + 41;
pub const E_NOT_ENDED: u32 = ERR_BASE + 42;
pub const E_NOT_SETTLED: u32 = ERR_BASE + 45;
pub const E_ALREADY_SETTLED: u32 = ERR_BASE + 46;
pub const E_UNAUTHORIZED: u32 = ERR_BASE + 1;
pub const E_TOO_EARLY: u32 = ERR_BASE + 48;
pub const E_NOT_COMMITTED: u32 = ERR_BASE + 49;
pub const E_TRADING_HALTED: u32 = ERR_BASE + 51;
pub const E_PICKS_CLOSED: u32 = ERR_BASE + 53;
pub const E_NOT_SPECTATOR: u32 = ERR_BASE + 56;
pub const E_ALREADY_PICKED: u32 = ERR_BASE + 57;
pub const E_NO_CREDITS: u32 = ERR_BASE + 58;
pub const E_PICKS_OPEN: u32 = ERR_BASE + 59;
pub const E_NO_BADGE: u32 = ERR_BASE + 60;
pub const E_ALREADY_CLAIMED: u32 = ERR_BASE + 47;
pub const E_BAD_FEED: u32 = ERR_BASE + 40;
const MINT_SIZE: usize = 82;

pub fn a(p: Pubkey) -> Address {
    Address::new_from_array(p.to_bytes())
}
pub fn p(a: &Address) -> Pubkey {
    Pubkey::new_from_array(a.to_bytes())
}
pub fn kp(k: &Keypair) -> Pubkey {
    p(&k.pubkey())
}
pub fn pid() -> Pubkey {
    razkyn::ID
}
pub fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &pid()).0
}
pub fn ix(data: impl InstructionData, accs: impl ToAccountMetas) -> Instruction {
    Instruction {
        program_id: a(pid()),
        accounts: accs
            .to_account_metas(None)
            .into_iter()
            .map(|m| AccountMeta { pubkey: a(m.pubkey), is_signer: m.is_signer, is_writable: m.is_writable })
            .collect(),
        data: data.data(),
    }
}
pub fn ata(owner: Pubkey, mint: Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[owner.as_ref(), TOKEN_PROGRAM_ID.as_ref(), mint.as_ref()], &ASSOCIATED_TOKEN_PROGRAM_ID).0
}
pub fn id_bytes() -> [u8; 8] {
    RAID_ID.to_le_bytes()
}
pub fn raid_pda() -> Pubkey {
    pda(&[RAID_SEED, &id_bytes()])
}
pub fn secret_pda() -> Pubkey {
    pda(&[SECRET_SEED, &id_bytes()])
}
pub fn slot_pda(seed: &[u8], slot: u8) -> Pubkey {
    pda(&[seed, &id_bytes(), &[slot]])
}
pub fn crate_pda(idx: u8) -> Pubkey {
    slot_pda(CRATE_SEED, idx)
}
pub fn config_pda() -> Pubkey {
    pda(&[CONFIG_SEED])
}
pub fn mint_auth() -> Pubkey {
    pda(&[MINT_AUTH_SEED])
}
pub fn escrow_auth() -> Pubkey {
    pda(&[ESCROW_SEED, &id_bytes()])
}
pub fn results_pda() -> Pubkey {
    pda(&[RESULTS_SEED, &id_bytes()])
}
pub fn settle_pda() -> Pubkey {
    pda(&[SETTLE_SEED, &id_bytes()])
}
pub fn reserve_auth() -> Pubkey {
    pda(&[RESERVE_SEED, &id_bytes()])
}
pub fn picks_pda() -> Pubkey {
    pda(&[b"picks", &id_bytes()])
}
pub fn badge_mint_pda() -> Pubkey {
    pda(&[b"badge_mint"])
}
pub fn test_flags_pda() -> Pubkey {
    pda(&[b"test_flags"])
}

pub struct Raider {
    pub wallet: Keypair,
    pub raid_key: Keypair,
}

pub struct World {
    pub svm: MagicSVM,
    pub keeper: Keypair,
    pub admin: Keypair,
    pub mints: Vec<Pubkey>,
    pub raiders: Vec<Raider>,
    pub dusd: Pubkey,
    pub n: u8,
}

pub type SendResult = Result<(), (TransactionError, Vec<String>)>;

impl World {
    pub fn try_send(&mut self, target: TransactionTarget, signers: &[&Keypair], ixs: &[Instruction]) -> SendResult {
        let tx = Transaction::new(signers, Message::new(ixs, Some(&signers[0].pubkey())), self.svm.latest_blockhash_for(target));
        let r = self.svm.send_transaction_to(target, tx);
        self.svm.expire_blockhash_for(target);
        r.map(|_| ()).map_err(|f| (f.err, f.meta.logs))
    }
    pub fn send(&mut self, target: TransactionTarget, signers: &[&Keypair], ixs: &[Instruction], label: &str) {
        if let Err((e, logs)) = self.try_send(target, signers, ixs) {
            panic!("{label} failed on {target:?}: {e:?}\n{logs:#?}");
        }
    }
    pub fn er_slot(&self) -> u64 {
        self.svm.ephemeral().get_sysvar::<Clock>().slot
    }
    pub fn warp_er(&mut self, slots: u64) {
        let s = self.er_slot();
        self.svm.warp_to_slot(s + slots);
    }
    /// Move both ledgers' unix clock forward (slots unchanged).
    pub fn advance_secs(&mut self, secs: i64) {
        let mut c = self.svm.ephemeral().get_sysvar::<Clock>();
        c.unix_timestamp += secs;
        self.svm.set_sysvar(&c);
    }
    pub fn read<T: AccountDeserialize>(&self, target: TransactionTarget, key: Pubkey) -> Option<T> {
        self.svm.get_account_for(target, &a(key)).map(|acc| T::try_deserialize(&mut acc.data.as_slice()).expect("decode"))
    }
    /// Read an ER account as `who` (None = unauthorized viewer).
    pub fn read_as<T: AccountDeserialize>(&mut self, who: Option<Address>, key: Pubkey) -> Option<T> {
        self.svm.set_authorized_user(who);
        let r = self.read(TransactionTarget::Ephemeral, key);
        self.svm.set_authorized_user(None);
        r
    }
    pub fn raid(&self) -> Raid {
        self.read(TransactionTarget::Ephemeral, raid_pda()).expect("raid on ER")
    }
    pub fn rprv(&mut self, slot: u8) -> RaiderPrivate {
        let who = self.keeper.pubkey();
        self.read_as(Some(who), slot_pda(RPRV_SEED, slot)).expect("rprv visible to keeper")
    }
    pub fn rpub(&self, slot: u8) -> RaiderPublic {
        self.read(TransactionTarget::Ephemeral, slot_pda(RPUB_SEED, slot)).expect("rpub public")
    }
    pub fn crate_acc(&mut self, idx: u8) -> Crate {
        let who = self.keeper.pubkey();
        self.read_as(Some(who), crate_pda(idx)).expect("crate visible to keeper")
    }
    pub fn rk(&self, slot: u8) -> Keypair {
        self.raiders[slot as usize].raid_key.insecure_clone()
    }

    // ---- gameplay instructions ----
    pub fn move_ix(&self, slot: u8, signer: Pubkey, dx: i16, dy: i16) -> Instruction {
        ix(instruction::MoveTo { slot, dx, dy }, accounts::MoveTo { raid: raid_pda(), rprv: slot_pda(RPRV_SEED, slot), raid_key: signer })
    }
    pub fn try_move(&mut self, slot: u8, dx: i16, dy: i16) -> SendResult {
        let k = self.rk(slot);
        let i = self.move_ix(slot, kp(&k), dx, dy);
        self.try_send(TransactionTarget::Ephemeral, &[&k], &[i])
    }
    /// Walk at legal speed until within `within` units of (x, y).
    pub fn walk_to(&mut self, slot: u8, x: u16, y: u16, within: u64) {
        for _ in 0..2000 {
            let me = self.rprv(slot);
            let (dx, dy) = (x as i64 - me.x as i64, y as i64 - me.y as i64);
            let d2 = (dx * dx + dy * dy) as u64;
            if d2 <= within * within {
                return;
            }
            let d = (d2 as f64).sqrt();
            let step = 59.0_f64.min(d);
            let (sx, sy) = ((dx as f64 * step / d).round() as i16, (dy as f64 * step / d).round() as i16);
            self.warp_er(TICK_SLOTS);
            self.try_move(slot, sx, sy).unwrap_or_else(|e| panic!("walk move: {e:?}"));
        }
        panic!("walk_to did not arrive");
    }
    pub fn open_ix(&self, slot: u8, idx: u8, district: u8) -> Instruction {
        ix(
            instruction::OpenCrate { slot, idx },
            accounts::OpenCrate {
                raid: raid_pda(), rprv: slot_pda(RPRV_SEED, slot), crate_acc: crate_pda(idx),
                district: slot_pda(DISTRICT_SEED, district), raid_key: kp(&self.raiders[slot as usize].raid_key),
            },
        )
    }
    pub fn try_open(&mut self, slot: u8, idx: u8) -> SendResult {
        let c = self.crate_acc(idx);
        let k = self.rk(slot);
        let i = self.open_ix(slot, idx, c.district);
        self.try_send(TransactionTarget::Ephemeral, &[&k], &[i])
    }
    pub fn try_finish(&mut self, slot: u8, idx: u8) -> SendResult {
        let k = self.rk(slot);
        let c = crate_pda(idx);
        let i = ix(
            instruction::FinishOpen { slot, idx },
            accounts::FinishOpen {
                raid: raid_pda(), rprv: slot_pda(RPRV_SEED, slot), crate_acc: c,
                crate_permission: if (idx as usize) < NUM_CRATES { Some(EphemeralPermission::find_pda(&c).0) } else { None },
                raid_key: kp(&k),
                permission_program: PERMISSION_PROGRAM_ID, ephemeral_vault: EPHEMERAL_VAULT_ID, magic_program: MAGIC_PROGRAM_ID,
            },
        );
        self.try_send(TransactionTarget::Ephemeral, &[&k], &[i])
    }
    pub fn try_shoot(&mut self, slot: u8, target: u8) -> SendResult {
        let k = self.rk(slot);
        let i = ix(
            instruction::Shoot { slot, target },
            accounts::Shoot {
                raid: raid_pda(), shooter_prv: slot_pda(RPRV_SEED, slot), shooter_pub: slot_pda(RPUB_SEED, slot),
                target_prv: slot_pda(RPRV_SEED, target), target_pub: slot_pda(RPUB_SEED, target),
                drop_crate: crate_pda(DROP_CRATE_BASE + target), raid_key: kp(&k),
            },
        );
        self.try_send(TransactionTarget::Ephemeral, &[&k], &[i])
    }
    pub fn tick_ixs(&self) -> Vec<Instruction> {
        let d = |i: u8| slot_pda(DISTRICT_SEED, i);
        let tick = ix(
            instruction::Tick {},
            accounts::Tick { raid: raid_pda(), secret: secret_pda(), district0: d(0), district1: d(1), district2: d(2), feed0: None, feed1: None, feed2: None },
        );
        let mut fog = ix(instruction::TickRaiders {}, accounts::TickRaiders { raid: raid_pda(), district0: d(0), district1: d(1), district2: d(2) });
        for s in 0..self.n {
            fog.accounts.push(AccountMeta::new_readonly(a(slot_pda(RPRV_SEED, s)), false));
            fog.accounts.push(AccountMeta::new(a(slot_pda(VIEW_SEED, s)), false));
            fog.accounts.push(AccountMeta::new(a(slot_pda(RPUB_SEED, s)), false));
        }
        vec![tick, fog]
    }
    /// Sum of all loot units still in crates plus every backpack (conservation check).
    pub fn total_units(&mut self) -> u64 {
        let mut t = 0u64;
        for idx in 0..(NUM_CRATES as u8 + self.n) {
            t += self.crate_acc(idx).units.iter().sum::<u64>();
        }
        for s in 0..self.n {
            t += self.rprv(s).backpack.iter().sum::<u64>();
        }
        t
    }
}

fn create_mint_ixs(svm: &MagicSVM, payer: &Address, mint: &Address, decimals: u8) -> Vec<Instruction> {
    let mut init = vec![0u8, decimals];
    init.extend_from_slice(mint_auth().as_ref());
    init.push(0); // no freeze authority
    vec![
        system_instruction::create_account(payer, mint, svm.minimum_balance_for_rent_exemption(MINT_SIZE), MINT_SIZE as u64, &a(TOKEN_PROGRAM_ID)),
        Instruction {
            program_id: a(TOKEN_PROGRAM_ID),
            accounts: vec![AccountMeta::new(*mint, false), AccountMeta::new_readonly(solana_sdk_ids::sysvar::rent::id(), false)],
            data: init,
        },
    ]
}

pub fn faucet_accounts(user: Pubkey, mint: Pubkey) -> accounts::Faucet {
    accounts::Faucet {
        config: config_pda(), ledger: pda(&[FAUCET_SEED, user.as_ref()]), mint_auth: mint_auth(), mint,
        user_ata: ata(user, mint), user, token_program: TOKEN_PROGRAM_ID,
        associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID, system_program: system_program::ID,
    }
}

fn delegate_ix(keeper: Pubkey, validator: Pubkey, target: Pubkey, account: RaidAccount) -> Instruction {
    ix(
        instruction::DelegatePda { raid_id: RAID_ID, account },
        accounts::DelegateRaidPda {
            config: config_pda(),
            buffer_pda: delegate_buffer_pda_from_delegated_account_and_owner_program(&target, &pid()),
            delegation_record_pda: delegation_record_pda_from_delegated_account(&target),
            delegation_metadata_pda: delegation_metadata_pda_from_delegated_account(&target),
            pda: target, keeper, validator: Some(validator), owner_program: pid(),
            delegation_program: DelegationProgram::id(), system_program: system_program::ID,
        },
    )
}

pub fn live_raid(n: u8) -> World {
    live_raid_seeded(n, None)
}

/// Full lobby → live flow with `n` raiders (optionally pinning the VRF output), Live mode.
pub fn live_raid_seeded(n: u8, seed: Option<[u8; 32]>) -> World {
    let mut w = raid_seeded(n, seed, mode::LIVE, 0, [0; 32]);
    w.start();
    w
}

impl World {
    pub fn start_ix(&self) -> Instruction {
        ix(instruction::StartRaid {}, accounts::StartRaid { raid: raid_pda(), secret: secret_pda(), keeper: kp(&self.keeper) })
    }
    pub fn try_start(&mut self) -> SendResult {
        let k = self.keeper.insecure_clone();
        let i = self.start_ix();
        self.try_send(TransactionTarget::Ephemeral, &[&k], &[i])
    }
    pub fn start(&mut self) {
        self.try_start().unwrap_or_else(|e| panic!("start_raid: {e:?}"));
        assert_eq!(self.raid().status, status::LIVE);
    }
}

/// Lobby → delegate → permissions → VRF → crates placed (status SEEDED, not started).
thread_local! {
    /// v2: raider class per slot used by raid_seeded (default 0 = Raider). Set before building a world.
    pub static CLASSES: std::cell::RefCell<Vec<u8>> = std::cell::RefCell::new(Vec::new());
}

pub fn raid_seeded(n: u8, seed: Option<[u8; 32]>, raid_mode: u8, leaf_count: u32, day_root: [u8; 32]) -> World {
    use TransactionTarget::{Base, Ephemeral};
    let mut svm = MagicSVM::new();
    let so = std::env::var("RAZKYN_SO").expect("set RAZKYN_SO to target/deploy/razkyn.so");
    svm.add_program_from_file(a(pid()), so).expect("load program");
    svm.set_vrf_randomness(seed);
    let admin = Keypair::new();
    let keeper = Keypair::new();
    svm.airdrop(&admin.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();
    svm.airdrop(&keeper.pubkey(), 100 * LAMPORTS_PER_SOL).unwrap();
    let mints: Vec<Keypair> = (0..5).map(|_| Keypair::new()).collect();
    let mut w = World { svm, keeper, admin: admin.insecure_clone(), mints: mints.iter().map(kp).collect(), raiders: vec![], dusd: kp(&mints[0]), n };

    let mut mint_ixs = vec![];
    for (i, m) in mints.iter().enumerate() {
        mint_ixs.extend(create_mint_ixs(&w.svm, &admin.pubkey(), &m.pubkey(), if i == 4 { 0 } else { 6 }));
    }
    let signers: Vec<&Keypair> = std::iter::once(&admin).chain(mints.iter()).collect();
    w.send(Base, &signers, &mint_ixs, "create mints");
    w.send(Base, &[&admin], &[ix(
        instruction::InitConfig { keeper: kp(&w.keeper), ops_treasury: kp(&admin) },
        accounts::InitConfig {
            config: config_pda(), mint_auth: mint_auth(),
            dusd_mint: kp(&mints[0]), twr_mint: kp(&mints[1]), fac_mint: kp(&mints[2]), hrb_mint: kp(&mints[3]), play_mint: kp(&mints[4]),
            admin: kp(&admin), token_program: TOKEN_PROGRAM_ID, system_program: system_program::ID,
        },
    )], "init_config");

    let k = kp(&w.keeper);
    let keeper = w.keeper.insecure_clone();
    w.send(Base, &[&keeper], &[ix(
        instruction::CreateRaid { raid_id: RAID_ID, mode: raid_mode, leaf_count, day_root, event_plan_hash: [0; 32] },
        accounts::CreateRaid {
            config: config_pda(), raid: raid_pda(), secret: secret_pda(), escrow_auth: escrow_auth(),
            escrow: ata(escrow_auth(), w.dusd), dusd_mint: w.dusd, keeper: k, token_program: TOKEN_PROGRAM_ID,
            associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID, system_program: system_program::ID,
        },
    )], "create_raid");
    for s in 0..n {
        w.send(Base, &[&keeper], &[ix(
            instruction::CreateSlot { slot: s },
            accounts::CreateSlot {
                config: config_pda(), raid: raid_pda(), rpub: slot_pda(RPUB_SEED, s), rprv: slot_pda(RPRV_SEED, s),
                view: slot_pda(VIEW_SEED, s), keeper: k, system_program: system_program::ID,
            },
        )], "create_slot");
    }
    w.send(Base, &[&keeper], &[ix(
        instruction::CreateDistricts {},
        accounts::CreateDistricts {
            config: config_pda(), raid: raid_pda(),
            district0: slot_pda(DISTRICT_SEED, 0), district1: slot_pda(DISTRICT_SEED, 1), district2: slot_pda(DISTRICT_SEED, 2),
            keeper: k, system_program: system_program::ID,
        },
    )], "create_districts");
    w.send(Base, &[&keeper], &[ix(
        instruction::CreateSettlement {},
        accounts::CreateSettlement {
            config: config_pda(), raid: raid_pda(), results: results_pda(), settlement: settle_pda(), reserve_auth: reserve_auth(),
            reserve: ata(reserve_auth(), w.dusd), treasury_owner: kp(&admin), treasury: ata(kp(&admin), w.dusd), dusd_mint: w.dusd,
            keeper: k, token_program: TOKEN_PROGRAM_ID, associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID, system_program: system_program::ID,
        },
    )], "create_settlement");
    // Crates 0..36 + one drop crate per slot.
    let total = NUM_CRATES as u8 + n;
    let mut first = 0u8;
    while first < total {
        let count = 12.min(total - first);
        let mut i = ix(instruction::CreateCrates { first, count }, accounts::CreateCrates { config: config_pda(), raid: raid_pda(), keeper: k, system_program: system_program::ID });
        for idx in first..first + count {
            i.accounts.push(AccountMeta::new(a(crate_pda(idx)), false));
        }
        w.send(Base, &[&keeper], &[i], "create_crates");
        first += count;
    }

    for s in 0..n {
        let r = Raider { wallet: Keypair::new(), raid_key: Keypair::new() };
        w.svm.airdrop(&r.wallet.pubkey(), LAMPORTS_PER_SOL).unwrap();
        let user = kp(&r.wallet);
        w.send(Base, &[&r.wallet], &[ix(instruction::FaucetDusd { amount: STAKE }, faucet_accounts(user, w.dusd))], "faucet_dusd");
        w.send(Base, &[&r.wallet], &[ix(
            instruction::JoinRaid { slot: s, raid_key: kp(&r.raid_key), class: CLASSES.with(|c| c.borrow().get(s as usize).copied().unwrap_or(0)) },
            accounts::JoinRaid {
                config: config_pda(), raid: raid_pda(), rpub: slot_pda(RPUB_SEED, s), rprv: slot_pda(RPRV_SEED, s),
                wallet_ata: ata(user, w.dusd), escrow_auth: escrow_auth(), escrow: ata(escrow_auth(), w.dusd),
                dusd_mint: w.dusd, wallet: user, keeper: None, token_program: TOKEN_PROGRAM_ID,
            },
        )], "join_raid");
        w.raiders.push(r);
    }
    let escrow = w.svm.get_account_for(Base, &a(ata(escrow_auth(), w.dusd))).unwrap();
    assert_eq!(u64::from_le_bytes(escrow.data[64..72].try_into().unwrap()), STAKE * n as u64, "escrow holds every stake");

    // RAZKYN LIVE pick book (base, while the raid is in the lobby), delegated with the raid.
    w.send(Base, &[&keeper], &[ix(
        instruction::CreatePickBook { raid_id: RAID_ID },
        accounts::CreatePickBook { config: config_pda(), raid: raid_pda(), book: picks_pda(), keeper: k, system_program: system_program::ID },
    )], "create_pick_book");

    // Delegate every TEE account (never the escrow).
    let validator = p(&w.svm.validator_identity());
    let mut targets = vec![(secret_pda(), RaidAccount::Secret)];
    for i in 0..3u8 {
        targets.push((slot_pda(DISTRICT_SEED, i), RaidAccount::District { index: i }));
    }
    for s in 0..n {
        targets.push((slot_pda(RPUB_SEED, s), RaidAccount::RaiderPublic { slot: s }));
        targets.push((slot_pda(RPRV_SEED, s), RaidAccount::RaiderPrivate { slot: s }));
        targets.push((slot_pda(VIEW_SEED, s), RaidAccount::View { slot: s }));
    }
    for idx in 0..total {
        targets.push((crate_pda(idx), RaidAccount::Crate { idx }));
    }
    targets.push((results_pda(), RaidAccount::Results));
    targets.push((picks_pda(), RaidAccount::Picks));
    targets.push((raid_pda(), RaidAccount::Raid));
    for (t, kind) in targets {
        w.send(Base, &[&keeper], &[delegate_ix(k, validator, t, kind)], "delegate_pda");
    }

    // TEE: permissions.
    for s in 0..n {
        let (rprv, view) = (slot_pda(RPRV_SEED, s), slot_pda(VIEW_SEED, s));
        w.send(Ephemeral, &[&keeper], &[ix(
            instruction::SetupSlotPermissions { slot: s },
            accounts::SetupSlotPermissions {
                raid: raid_pda(), rprv, view,
                rprv_permission: EphemeralPermission::find_pda(&rprv).0, view_permission: EphemeralPermission::find_pda(&view).0,
                keeper: k, permission_program: PERMISSION_PROGRAM_ID, ephemeral_vault: EPHEMERAL_VAULT_ID, magic_program: MAGIC_PROGRAM_ID,
            },
        )], "setup_slot_permissions");
    }
    w.send(Ephemeral, &[&keeper], &[ix(
        instruction::SetupSecretPermission {},
        accounts::SetupSecretPermission {
            raid: raid_pda(), secret: secret_pda(), secret_permission: EphemeralPermission::find_pda(&secret_pda()).0,
            keeper: k, permission_program: PERMISSION_PROGRAM_ID, ephemeral_vault: EPHEMERAL_VAULT_ID, magic_program: MAGIC_PROGRAM_ID,
        },
    )], "setup_secret_permission");

    // TEE: VRF on the ephemeral queue; MagicSVM fulfils it one slot later.
    w.send(Ephemeral, &[&keeper], &[ix(
        instruction::RequestRaidVrf {},
        accounts::RequestRaidVrf {
            keeper: k, raid: raid_pda(), oracle_queue: DEFAULT_EPHEMERAL_QUEUE,
            program_identity: Pubkey::find_program_address(&[b"identity"], &pid()).0,
            vrf_program: VRF_PROGRAM_ID, slot_hashes: p(&solana_sdk_ids::sysvar::slot_hashes::id()),
            system_program: system_program::ID,
        },
    )], "request_raid_vrf");
    let results = { let s = w.er_slot(); w.svm.warp_to_slot(s + 1) };
    assert!(results.iter().all(|r| r.is_ok()), "VRF callback failed: {results:?}");
    assert_eq!(w.raid().status, status::SEEDED, "callback seeded the raid");

    // start_raid is refused until every crate is placed.
    expect_err(w.try_start(), E_CRATES_NOT_PLACED, "start before crates");

    // TEE: place crates (permission first, then contents) in batches of 6.
    for first in (0..NUM_CRATES as u8).step_by(6) {
        let mut i = ix(
            instruction::PlaceCrates { first, count: 6 },
            accounts::PlaceCrates {
                raid: raid_pda(), secret: secret_pda(), keeper: k,
                permission_program: PERMISSION_PROGRAM_ID, ephemeral_vault: EPHEMERAL_VAULT_ID, magic_program: MAGIC_PROGRAM_ID,
            },
        );
        for idx in first..first + 6 {
            let c = crate_pda(idx);
            i.accounts.push(AccountMeta::new(a(c), false));
            i.accounts.push(AccountMeta::new(a(EphemeralPermission::find_pda(&c).0), false));
        }
        w.send(Ephemeral, &[&keeper], &[i], "place_crates");
    }
    w
}

pub fn expect_err(r: SendResult, code: u32, what: &str) {
    match r {
        Err((TransactionError::InstructionError(_, InstructionError::Custom(c)), _)) if c == code => {}
        other => panic!("{what}: expected custom error {code}, got {other:?}"),
    }
}

/// Direction that keeps a move of `d` units inside the map.
pub fn inward(x: u16, d: i16) -> i16 {
    if x as i32 > MAX_X as i32 / 2 { -d } else { d }
}

// ---------------- M4 helpers ----------------
impl World {
    pub fn token_balance(&self, account: Pubkey) -> u64 {
        self.svm.get_account_for(TransactionTarget::Base, &a(account)).map(|acc| u64::from_le_bytes(acc.data[64..72].try_into().unwrap())).unwrap_or(0)
    }
    pub fn try_start_extract(&mut self, slot: u8, exit: u8) -> SendResult {
        let k = self.rk(slot);
        let i = ix(instruction::StartExtract { slot, exit }, accounts::StartExtract { raid: raid_pda(), rprv: slot_pda(RPRV_SEED, slot), raid_key: kp(&k) });
        self.try_send(TransactionTarget::Ephemeral, &[&k], &[i])
    }
    pub fn try_finish_extract(&mut self, slot: u8) -> SendResult {
        let k = self.rk(slot);
        let i = ix(instruction::FinishExtract { slot }, accounts::FinishExtract { raid: raid_pda(), rprv: slot_pda(RPRV_SEED, slot), rpub: slot_pda(RPUB_SEED, slot), raid_key: kp(&k) });
        self.try_send(TransactionTarget::Ephemeral, &[&k], &[i])
    }
    pub fn end_raid_ix(&self, payer: Pubkey) -> Instruction {
        let d = |i: u8| slot_pda(DISTRICT_SEED, i);
        let mut i = ix(
            instruction::EndRaid {},
            accounts::EndRaid {
                payer, raid: raid_pda(), results: results_pda(), config: config_pda(),
                district0: d(0), district1: d(1), district2: d(2), program_id: pid(),
                magic_context: ephemeral_rollups_sdk::consts::MAGIC_CONTEXT_ID, magic_program: MAGIC_PROGRAM_ID,
            },
        );
        for s in 0..self.n {
            i.accounts.push(AccountMeta::new_readonly(a(slot_pda(RPRV_SEED, s)), false));
        }
        i
    }
    pub fn settle_accounts(&self) -> accounts::SettleAccounts {
        accounts::SettleAccounts {
            settlement: settle_pda(), raid: raid_pda(), results: results_pda(), config: config_pda(), test_flags: test_flags_pda(),
            vault_auth: escrow_auth(), stake_vault: ata(escrow_auth(), self.dusd), treasury: ata(kp(&self.admin), self.dusd),
            reserve: ata(reserve_auth(), self.dusd), dusd_mint: self.dusd, token_program: TOKEN_PROGRAM_ID,
        }
    }
    pub fn claim_ix(&self, slot: u8, payer: Pubkey) -> Instruction {
        let wallet = kp(&self.raiders[slot as usize].wallet);
        ix(
            instruction::Claim { slot },
            accounts::Claim {
                settlement: settle_pda(), results: results_pda(), claim_record: pda(&[CLAIM_SEED, &id_bytes(), &[slot]]), wallet,
                config: config_pda(), vault_auth: escrow_auth(), stake_vault: ata(escrow_auth(), self.dusd), wallet_dusd: ata(wallet, self.dusd),
                mint_auth: mint_auth(), twr_mint: self.mints[1], fac_mint: self.mints[2], hrb_mint: self.mints[3],
                wallet_twr: ata(wallet, self.mints[1]), wallet_fac: ata(wallet, self.mints[2]), wallet_hrb: ata(wallet, self.mints[3]),
                dusd_mint: self.dusd, payer, token_program: TOKEN_PROGRAM_ID, associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID,
                system_program: system_program::ID,
            },
        )
    }
    pub fn settlement(&self) -> Settlement {
        self.read(TransactionTarget::Base, settle_pda()).expect("settlement on base")
    }
    pub fn results_base(&self) -> Option<Results> {
        self.read(TransactionTarget::Base, results_pda())
    }
}

/// ComputeBudget SetComputeUnitLimit (program ComputeBudget111…, discriminator 2, u32 LE).
pub fn cu_ix(units: u32) -> Instruction {
    let mut data = vec![2u8];
    data.extend_from_slice(&units.to_le_bytes());
    Instruction { program_id: solana_sdk_ids::compute_budget::id(), accounts: vec![], data }
}
