// Record the proof footage: real Solana Explorer transactions + the Market Raid Report page.
//   node proof.mjs <report_raid_id> <claimSig> <commitSig> [delegationSig]
import { open, record, sleep, SITE } from './lib.mjs'
const [raidId, claimSig, commitSig, delegSig = '3jFMd4D87AgVoqDsbPBbDrrTdSAb7KPsTHjP3rWBBaUPvVRNRjD1mcN5GLC5fpjFoVDqf2u3ufpnYbEZM17mwrF'] = process.argv.slice(2)
const { browser, page } = await open('b')
const ex = (sig) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`

/** Smoothly scroll so the first element whose text starts with `label` sits near the top. */
async function glideTo(label, offset = 140, ms = 1600) {
  await page.evaluate(async (label, offset, ms) => {
    const el = [...document.querySelectorAll('h1,h2,h3,h4,h5,.card-header,.card-header-title,div,span,td')].find((e) => e.children.length < 4 && e.innerText?.trim().toUpperCase().startsWith(label.toUpperCase()))
    if (!el) return
    const start = window.scrollY, end = el.getBoundingClientRect().top + window.scrollY - offset, t0 = performance.now()
    await new Promise((res) => { const step = (t) => { const k = Math.min(1, (t - t0) / ms); const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; window.scrollTo(0, start + (end - start) * e); k < 1 ? requestAnimationFrame(step) : res() }; requestAnimationFrame(step) })
  }, label, offset, ms)
}
async function explorer(name, sig, stops) {
  await page.goto(ex(sig), { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction(() => /Overview|Signature/.test(document.body.innerText), { timeout: 60000 }).catch(() => {})
  await sleep(6000) // explorer loads details progressively
  await record(page, name, async () => {
    await sleep(2500)
    for (const [label, hold] of stops) { await glideTo(label); await sleep(hold) }
  })
}

// 1. The claim: dUSD lands in the player's wallet (Token Balances shows before → after).
await explorer('explorer-claim', claimSig, [['Token Balances', 4500], ['Program Instruction Logs', 3500]])
// 2. The settlement: commit + Magic Action finalize_raid on Solana.
await explorer('explorer-commit', commitSig, [['Program Instruction Logs', 5000]])
// 3. Delegation to MagicBlock's TEE validator.
await explorer('explorer-delegate', delegSig, [['Account Input', 3000], ['Program Instruction Logs', 3000]])

// 4. The Market Raid Report: hash, Merkle proof and event plan verified against the chain; conservation.
await page.goto(`${SITE}/report/${raidId}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForFunction(() => /Verified ✓|Mismatch/.test(document.body.innerText), { timeout: 60000 }).catch(() => {})
await sleep(2500)
await record(page, 'report', async () => {
  await sleep(3500)
  await page.evaluate(async () => { for (let i = 0; i < 90; i++) { window.scrollBy(0, 14); await new Promise((r) => setTimeout(r, 33)) } })
  await sleep(2500)
  await page.evaluate(async () => { for (let i = 0; i < 160; i++) { window.scrollBy(0, 14); await new Promise((r) => setTimeout(r, 33)) } })
  await sleep(3000)
})
await browser.close()
