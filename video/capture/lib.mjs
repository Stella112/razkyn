// Capture helpers: drive the LIVE site (https://razkyn.vercel.app) in Chrome and record real footage.
import puppeteer from 'puppeteer-core'
export const SITE = 'https://razkyn.vercel.app'
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function open(profile = 'a', { w = 1920, h = 1080, headless = true } = {}) {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless,
    userDataDir: `C:/magicblock/video/capture/.profile-${profile}`,
    args: ['--hide-scrollbars', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required', `--window-size=${w},${h}`],
    defaultViewport: { width: w, height: h, deviceScaleFactor: 1 },
  })
  const page = (await browser.pages())[0] ?? (await browser.newPage())
  page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 160)))
  return { browser, page }
}

/** Record `fn` as a webm clip into public/clips/<name>.webm. */
export async function record(page, name, fn) {
  const rec = await page.screencast({ path: `C:/magicblock/video/public/clips/${name}.webm` })
  const t0 = Date.now()
  try { await fn() } finally { await rec.stop() }
  console.log(`clip ${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s`)
}

export async function clickText(page, text, { exact = false, nth = 0 } = {}) {
  const ok = await page.evaluate((text, exact, nth) => {
    const T = text.toUpperCase(); const els = [...document.querySelectorAll('button,a,[role=button],.mode-card,.go')].filter((e) => { const t = e.innerText.trim().toUpperCase(); return exact ? t === T : t.includes(T) })
    const el = els[nth]; if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true
  }, text, exact, nth)
  if (!ok) throw new Error('no clickable: ' + text)
}
export const hasText = (page, t) => page.evaluate((t) => document.body.innerText.toUpperCase().includes(t.toUpperCase()), t)
export async function waitText(page, t, ms = 240000) {
  await page.waitForFunction((t) => document.body.innerText.toUpperCase().includes(t.toUpperCase()), { timeout: ms, polling: 500 }, t)
}

/** In-raid helpers, installed into the page: position from the minimap's props, WASD steering. */
export const RAID_HELPERS = `window.__rz = {
  props(){ const c=document.querySelector('.minimap canvas'); if(!c) return null; const k=Object.keys(c).find(k=>k.startsWith('__reactFiber')); let f=c[k]; while(f && !(f.memoizedProps && 'pub' in f.memoizedProps && 'me' in f.memoizedProps)) f=f.return; return f && f.memoizedProps; },
  me(){ return this.props()?.me; },
  key(k,down){ const code = k===' '?'Space':'Key'+k.toUpperCase(); window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{key:k,code,bubbles:true})); },
  async go(tx,ty,ms=20000,near=70){ const t0=Date.now(); const held=new Set(); const set=(k,on)=>{ if(on&&!held.has(k)){this.key(k,true);held.add(k);} if(!on&&held.has(k)){this.key(k,false);held.delete(k);} }; let m; while(Date.now()-t0<ms){ m=this.me(); if(!m) break; const dx=tx-m.x, dy=ty-m.y; if(Math.hypot(dx,dy)<near) break; set('d',dx>35); set('a',dx<-35); set('s',dy>35); set('w',dy<-35); await new Promise(r=>setTimeout(r,100)); } for(const k of [...held]) this.key(k,false); return this.me(); },
  crates(){ const p=this.props(); return p.pub.raid.cratePos.slice(0,36).map((c,i)=>({i,x:c.x,y:c.y,opened:p.pub.crates?.[i]?.state===1})).filter(c=>c.x||c.y); },
  raid(){ return this.props()?.pub?.raid; },
};`
