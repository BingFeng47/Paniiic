async (page) => {
  // Pacing-and-economy playtest bot (2026-11-24). Adapted from adpressurebot.js / juicebot.js.
  // Needs pacing-observer.js. Plays with real Playwright mouse and keyboard input only.
  // It starts a background loop in the Playwright process and returns at once, so play does not
  // stop between tool calls. Poll window.__pb (in the page) or globalThis.__pbLog for progress.
  const D = 'docs/playtests/2026-11-24-pacing-and-economy/';
  if (globalThis.__pbRunning) return 'already running';
  globalThis.__pbRunning = true;
  const g = { log: [], shots: {}, buys: {}, tries: {}, real: false, down: false, evIdx: 0, combos: 0, lastSwitch: 0 };
  globalThis.__pbLog = g;
  const L = (o) => { g.log.push(o); };
  const obs = () => page.evaluate(() => window.__obs?.last ?? null);
  const shot = async (name, t) => { if (g.shots[name]) return; g.shots[name] = t ?? true; try { await page.screenshot({ path: D + name + '.png', scale: 'css' }); L({ t, shot: name }); } catch (e) { L({ t, shotErr: name, e: String(e) }); } };
  const bbox = () => page.evaluate(() => { const c = document.querySelector('canvas.lane-canvas'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  const H = { default: [44, 72], fast: [34, 48], tank: [72, 96], ranged: [48, 76], boss: [112, 150], glob: [22, 22] };
  const correct = (a) => { if (a.pattern === 'confirm') return a.stage === 'confirm' ? 'confirmYes' : 'close'; return { plain: 'close', decoy: 'close', runaway: 'close', hidden: 'tinyClose', swapped: 'noThanks', countdown: 'skip' }[a.pattern]; };
  const loop = async () => {
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    g.connectPerf = await page.evaluate(() => performance.now());
    L({ act: 'connectClicked' });
    let cb = null; for (let i = 0; i < 100 && !cb; i++) { cb = await bbox(); if (!cb) await page.waitForTimeout(100); }
    let k = cb.width / 1024;
    const cc = (x, y) => ({ x: cb.x + x * k, y: cb.y + y * k });
    const onCanvas = (p) => page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.classList.contains('lane-canvas') ?? false, [p.x, p.y]);
    const mobPts = (m) => { const [w, h] = H[m.kind]; const X = 112 + m.x; const yTop = 232 - h; if (m.kind === 'glob') return [{ x: X, y: 220 }]; const pts = []; for (const fy of [0.55, 0.85, 0.25]) for (const fx of [0, -0.3, 0.3]) pts.push({ x: X + fx * w, y: yTop + fy * h }); return pts; };
    const visPt = async (m) => { for (const p of mobPts(m)) { const c = cc(p.x, p.y); if (await onCanvas(c)) return c; } return null; };
    const release = async () => { if (g.down) { await page.mouse.up(); g.down = false; } };
    const clickCtl = async (id, ctl) => { const loc = page.locator(`[data-ad-id="${id}"] [data-control="${ctl}"]`).first(); const b = await loc.boundingBox({ timeout: 150 }).catch(() => null); if (!b) return false; const x = b.x + b.width / 2, y = b.y + b.height / 2; const ok = await page.evaluate(([x, y, id, ctl]) => { const e = document.elementFromPoint(x, y)?.closest('[data-control]'); return !!e && e.dataset.control === ctl && e.closest('[data-ad-id]')?.dataset.adId === id; }, [x, y, String(id), ctl]); if (!ok) return false; await release(); await page.mouse.click(x, y); return true; };
    let lastAd = 0;
    while (true) {
      if (await page.evaluate(() => !!window.__pbStop)) { await release(); L({ act: 'stopped' }); break; }
      if (Date.now() - (g.lp || 0) > 1000) { g.lp = Date.now(); await page.evaluate((x) => { window.__pbLog = x; }, JSON.stringify(g)); }
      const s = await obs(); if (!s) { await page.waitForTimeout(50); continue; }
      const t = +s.t.toFixed(2);
      { const nb = await bbox(); if (nb) { cb = nb; k = cb.width / 1024; } }
      // events of interest -> screenshots
      const ne = await page.evaluate((f) => (window.__obs?.ev ?? []).slice(f).filter((e) => ['combo', 'mobSpawned', 'mobArrived', 'itemBought', 'integrityCritical', 'connected', 'won', 'lost'].includes(e.type)).map((e) => ({ type: e.type, kind: e.kind, count: e.count, item: e.item, t: e.t })).concat([{ n: (window.__obs?.ev ?? []).length }]), g.evIdx);
      g.evIdx = ne.pop().n;
      for (const e of ne) {
        if (e.type === 'combo' && g.combos < 2 && e.count >= 3) { g.combos++; await shot('20-combo-x' + e.count + '-' + g.combos, t); }
        if (e.type === 'mobSpawned' && e.kind === 'boss') await shot('40-boss-rise', t);
        if (e.type === 'mobArrived' && e.kind === 'boss') await shot('41-boss-at-modem', t);
        if (e.type === 'itemBought') await shot('30-bought-' + e.item, t);
        if (e.type === 'integrityCritical') await shot('42-integrity-critical', t);
        if (e.type === 'mobSpawned' && e.kind === 'default' && !g.shots['10-first-zombie']) await shot('10-first-zombie', t);
      }
      if (t > 21 && s.phase !== 'dialing') await shot('11-connected', t);
      for (const [sec, name] of [[56, '12-pinch1'], [91, '13-midpoint'], [116, '14-pinch2'], [146, '15-plot-turn2'], [170, '16-late']]) if (t >= sec) await shot(name, t);
      const result = await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Retry'));
      if (s.phase === 'won' || s.phase === 'lost' || result) { await release(); L({ t, end: s.phase, dl: s.download, integ: s.integrity }); await page.waitForTimeout(3500); await shot('90-result', t); g.done = true; break; }
      // real link
      if (!g.real) { const vis = await page.evaluate(() => { const e = document.querySelector('.ns-real-link'); return !!e && !e.hidden && e.getBoundingClientRect().width > 0; }); if (vis) { const b = await page.locator('.ns-real-link').first().boundingBox(); await release(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); g.real = true; L({ t, act: 'realLink' }); continue; } }
      // shop: saw first, then flamethrower
      const owned = s.owned || [];
      if (!owned.includes('saw') && s.wallet >= 75 && !g.buys.saw) { g.buys.saw = t; await page.keyboard.press('2'); L({ t, act: 'press2', wallet: s.wallet, gained: s.gained }); }
      else if (owned.includes('saw') && !owned.includes('flamethrower') && s.wallet >= 150 && !g.buys.flame) { g.buys.flame = t; await page.keyboard.press('3'); L({ t, act: 'press3', wallet: s.wallet, gained: s.gained }); }
      // weapon choice once the flamethrower is owned: flame while fuel lasts, saw while it refills
      if (owned.includes('flamethrower') && Date.now() - g.lastSwitch > 400) {
        if (s.active === 'flamethrower' && s.fuel <= 0.05) { await release(); await page.keyboard.press('q'); g.lastSwitch = Date.now(); }
        else if (s.active === 'saw' && s.fuel >= 3) { await release(); await page.keyboard.press('e'); g.lastSwitch = Date.now(); }
      }
      const mobs = s.mobs.slice().sort((a, b) => a.x - b.x);
      const threat = mobs.length && mobs[0].x < 90;
      // ads: interrupters first, then lane-cover, then clutter. Fake buttons are ignored.
      if (!threat || Date.now() - lastAd > 900) {
        const order = s.ads.filter((a) => a.kind !== 'fake').sort((a, b) => ((b.kind === 'interrupter') * 2 + !!b.laneCover) - ((a.kind === 'interrupter') * 2 + !!a.laneCover));
        let acted = false;
        for (const a of order) {
          const ctl = correct(a); if (!ctl) continue;
          if (a.pattern === 'countdown') { const txt = await page.locator(`[data-ad-id="${a.id}"] [data-control="skip"]`).first().textContent({ timeout: 150 }).catch(() => ''); if (/\d/.test(txt)) continue; }
          if (await clickCtl(a.id, ctl)) { g.tries[a.id] = (g.tries[a.id] || 0) + 1; acted = true; lastAd = Date.now(); break; }
        }
        if (acted) { await page.waitForTimeout(40); continue; }
      }
      // packets: grab any packet on the visible canvas (hover only)
      if (s.packets.length && !(threat && mobs[0].x < 40)) {
        let got = false;
        for (const p of s.packets) { const c = cc(112 + p.x, 232 - 12); if (await onCanvas(c)) { await page.mouse.move(c.x, c.y, { steps: 2 }); got = true; } }
        if (got && s.active === 'hammer') { await page.waitForTimeout(30); }
      }
      // lane
      if (mobs.length) {
        let target = null, pt = null;
        for (const m of mobs.slice(0, 4)) { pt = await visPt(m); if (pt) { target = m; break; } }
        if (target) {
          if (s.active === 'hammer') { await page.mouse.click(pt.x, pt.y); }
          else if (s.active === 'saw') { await page.mouse.move(pt.x, pt.y); if (!g.down) { await page.mouse.down(); g.down = true; } }
          else if (s.active === 'flamethrower') {
            // pointer a bit left of the nearest mob, at body height; the cone points right (+x)
            const X = Math.max(4, 112 + target.x - 40); const c = cc(X, 232 - 30);
            if (await onCanvas(c)) { await page.mouse.move(c.x, c.y); if (!g.down) { await page.mouse.down(); g.down = true; } } else { await page.mouse.move(pt.x, pt.y); if (!g.down) { await page.mouse.down(); g.down = true; } }
          }
        } else await release();
      } else await release();
      if (Date.now() - (g.ls || 0) > 5000) { g.ls = Date.now(); L({ t, st: 1, dl: +s.download.toFixed(1), integ: s.integrity, mobs: s.mobs.length, ads: s.ads.length, kb: s.wallet, gained: s.gained, active: s.active }); }
      await page.waitForTimeout(25);
    }
  };
  globalThis.__pbPromise = loop().catch((e) => { g.err = String(e && e.stack || e); L({ err: g.err }); }).finally(async () => { globalThis.__pbRunning = false; await page.evaluate((x) => { window.__pbLog = x; }, JSON.stringify(g)).catch(() => {}); });
  return 'started';
}
