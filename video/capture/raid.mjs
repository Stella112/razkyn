// Record one full raid on the LIVE site as a player (fresh dev wallet), logging when each moment happens.
// Clips: lobby.webm (deploy → join → ready), raid.webm (drop → end screen), report.webm, explorer-*.webm.
// Event offsets (seconds into raid.webm) go to public/clips/events.json for the edit.
import { writeFileSync } from 'fs'
import { open, record, sleep, SITE, clickText, hasText, waitText, RAID_HELPERS } from './lib.mjs'

const EXITS = [[1, 20], [32, 1], [32, 38], [62, 20]].map(([x, y]) => [x * 100 + 50, y * 100 + 50])
const TERMINALS = [[5, 12], [15, 28], [27, 12], [37, 28], [49, 12], [59, 28]].map(([x, y]) => [x * 100 + 50, y * 100 + 50])
const profile = process.argv[2] ?? 'a'
const mode = process.argv[3] ?? 'mystery'
const { browser, page } = await open(profile)
const events = []
let raidT0 = 0
const mark = (name, extra = {}) => { const t = raidT0 ? (Date.now() - raidT0) / 1000 : 0; events.push({ name, t: +t.toFixed(2), ...extra }); console.log(`[${t.toFixed(1)}s] ${name} ${JSON.stringify(extra)}`) }
const save = () => writeFileSync('C:/magicblock/video/public/clips/events.json', JSON.stringify({ raidId, events }, null, 1))
let raidId = ''

// ---- Title screen ----
await page.goto(SITE + '/', { waitUntil: 'load' }); await sleep(4000)
await record(page, 'title', async () => { await sleep(9000) })

// ---- Lobby ----
await page.goto(SITE + '/play', { waitUntil: 'load' }); await sleep(3000)
if (await hasText(page, 'PICK YOUR RAID')) {
  await record(page, 'lobby', async () => {
    await sleep(1500)
    await clickText(page, 'OPEN RAID', { nth: mode === 'live' ? 1 : mode === 'live-markets' ? 2 : 0 })
    await waitText(page, 'DROPS IN', 240000); await sleep(2500)
    if (await hasText(page, 'Use a dev wallet')) { await clickText(page, 'Use a dev wallet'); await sleep(2000) }
    await page.evaluate(() => { const g = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent.trim() === 'Gunner'); g?.click() }); await sleep(1500)
    await clickText(page, 'JOIN AS');
    await waitText(page, "YOU'RE IN", 90000); await sleep(3000)
    await clickText(page, 'READY', { exact: true }).catch(() => {}); await sleep(4000)
  })
}
raidId = (await page.evaluate(() => /raid (\d{13})/.exec(document.body.innerText)?.[1] ?? '')) || ''
console.log('raid', raidId)
await page.waitForFunction(() => location.pathname.startsWith('/raid/'), { timeout: 400000, polling: 1000 })
raidId = raidId || (await page.evaluate(() => location.pathname.split('/')[2]))

// ---- Raid (one continuous clip) ----
await record(page, 'raid', async () => {
  raidT0 = Date.now()
  await sleep(2500)
  await page.keyboard.press('Escape').catch(() => {}); await sleep(500)
  await page.evaluate(RAID_HELPERS)
  // Sound on (first gesture), voice narration on.
  await page.mouse.click(960, 540).catch(() => {})
  mark('drop')
  const alive = () => page.evaluate(() => !document.body.innerText.includes('KNOCKED OUT') && !/\b0 HP\b/.test(document.querySelector('.hud')?.innerText ?? ''))
  const me = () => page.evaluate(() => window.__rz.me())
  const go = (x, y, ms = 20000, near = 70) => page.evaluate((x, y, ms, near) => window.__rz.go(x, y, ms, near), x, y, ms, near)
  await sleep(4000)

  // 1. Crack the nearest sealed crate.
  for (let k = 0; k < 1 && (await alive()); k++) {
    const m = await me()
    const crates = await page.evaluate(() => window.__rz.crates())
    const c = crates.filter((c) => !c.opened).sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y))[0]
    if (!c) break
    mark('walk_crate', { crate: c.i })
    await go(c.x, c.y, 25000, 45)
    mark('open_crate', { crate: c.i })
    await page.keyboard.down('KeyE'); await sleep(120); await page.keyboard.up('KeyE')
    await sleep(3200)
    if (await hasText(page, '+')) mark('crate_loot')
  }
  // 2. Try to Peek: the TEE refuses.
  if (await alive()) { mark('peek'); await clickText(page, 'TRY TO PEEK').catch(() => {}); await sleep(5000) }
  // 3. Trade at the nearest terminal (position exposed).
  if (await alive()) {
    const m = await me()
    const t = TERMINALS.sort((a, b) => Math.hypot(a[0] - m.x, a[1] - m.y) - Math.hypot(b[0] - m.x, b[1] - m.y))[0]
    mark('walk_terminal'); await go(t[0], t[1], 25000, 45)
    await page.keyboard.down('KeyE'); await sleep(120); await page.keyboard.up('KeyE'); await sleep(1500)
    const traded = await page.evaluate(() => { const b = [...document.querySelectorAll('.term-btn')].find((x) => !x.disabled); b?.click(); return !!b })
    mark('trade', { traded }); await sleep(4500)
    await page.keyboard.press('Escape').catch(() => {})
  }
  // 4. Fight until the first exit window: shoot any raider in view (same handler as a click), hunt towards the middle.
  let shots = 0
  for (;;) {
    if (!(await alive())) { mark('knocked_out'); break }
    const st = await page.evaluate(() => { const p = window.__rz.props(); return { win: p?.pub?.raid?.exitWindow ?? 0, open: p?.pub?.raid?.openExits ?? [], me: p?.me, vis: (p?.visible ?? []).filter((v) => v.slot !== p.mySlot) } })
    if (st.win > 0 && st.open.some((e) => e !== 255)) break
    const target = st.vis.map((v) => ({ ...v, d: Math.hypot(v.x - st.me.x, v.y - st.me.y) })).filter((v) => v.d <= 680).sort((a, b) => a.d - b.d)[0]
    if (target) {
      if (!shots) mark('first_shot', { target: target.slot })
      await page.evaluate((x, y) => window.__razkyn3d?.onShootAt?.(x, y), target.x, target.y); shots++
      await sleep(550)
    } else {
      // drift towards the centre (where raiders meet), a few steps at a time
      await go(3200, 2000, 1500, 300)
    }
  }
  mark('fight_end', { shots })
  // 5. Extract at the first open exit we can reach.
  if (await alive()) {
    const st = await page.evaluate(() => { const p = window.__rz.props(); return { open: p.pub.raid.openExits, me: p.me } })
    const ex = st.open.filter((e) => e !== 255).map((e) => ({ e, x: EXITS[e][0], y: EXITS[e][1], d: Math.hypot(EXITS[e][0] - st.me.x, EXITS[e][1] - st.me.y) })).sort((a, b) => a.d - b.d)[0]
    if (ex) {
      mark('walk_exit', { exit: ex.e }); await go(ex.x, ex.y, 30000, 40)
      mark('extract_hold'); await page.keyboard.down('Space'); await sleep(5800); await page.keyboard.up('Space')
      await sleep(2000); mark('extract_done')
    }
  }
  // 6. Wait for the end screen (raid end + settlement), keep recording a little after.
  await page.waitForFunction(() => /PRICE DATA VERIFIED|SETTLED/.test(document.body.innerText), { timeout: 420000, polling: 1000 }).catch(() => {})
  mark('end_screen'); await sleep(6000)
  await page.waitForFunction(() => /✓ PAID/.test(document.body.innerText), { timeout: 120000, polling: 1000 }).catch(() => {})
  mark('paid'); await sleep(8000)
  // slow scroll through the end card
  await page.evaluate(async () => { const el = [...document.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 40 && getComputedStyle(e).overflowY !== 'visible'); for (let i = 0; i < 40; i++) { (el ?? document.scrollingElement).scrollBy(0, 12); await new Promise((r) => setTimeout(r, 120)) } })
  await sleep(3000); mark('end_scrolled')
})
save()
const links = await page.evaluate(() => [...document.querySelectorAll('a[href*="explorer.solana.com/tx/"]')].map((a) => ({ text: a.parentElement?.innerText?.slice(0, 60), href: a.href })))
writeFileSync('C:/magicblock/video/public/clips/links.json', JSON.stringify({ raidId, links }, null, 1))
console.log(JSON.stringify(links, null, 1))
await browser.close()
