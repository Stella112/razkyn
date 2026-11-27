// Full-page screenshots of real Solana Explorer transactions + where each section sits (for pans in the edit).
//   node explorer-shots.mjs name:sig name:sig ...
import { writeFileSync, existsSync, readFileSync } from 'fs'
import { open, sleep } from './lib.mjs'
const { browser, page } = await open(process.env.PROFILE ?? 'e', { w: 1600, h: 1000 })
const outFile = 'C:/magicblock/video/src/explorer.json'
const meta = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : {}
for (const arg of process.argv.slice(2)) {
  const [name, sig] = arg.split(':')
  await page.goto(`https://explorer.solana.com/tx/${sig}?cluster=devnet`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction(() => /Program Instruction Logs|Instruction Logs/i.test(document.body.innerText), { timeout: 90000, polling: 1000 }).catch(() => console.log('logs not found', name))
  await sleep(5000)
  // drop the cookie / cluster banners if any, so the page reads cleanly
  const info = await page.evaluate(() => {
    const find = (label) => { const el = [...document.querySelectorAll('h3,h4,.card-header-title,.card-header')].find((e) => e.innerText?.trim().toUpperCase().startsWith(label.toUpperCase())); return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null }
    return { height: document.documentElement.scrollHeight, overview: find('Overview'), accounts: find('Account Input'), balances: find('Token Balances'), logs: find('Program Instruction Logs') ?? find('Instruction Logs'), text: document.body.innerText.slice(0, 400) }
  })
  await page.screenshot({ path: `C:/magicblock/video/public/shots/${name}.png`, fullPage: true })
  meta[name] = { sig, width: 1600, ...info }
  console.log(name, JSON.stringify({ ...info, text: undefined }))
}
writeFileSync(outFile, JSON.stringify(meta, null, 1))
await browser.close()
