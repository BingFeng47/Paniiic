async (page) => {
  const D = 'docs/playtests/2026-11-23-juice-and-endings/';
  const g = JSON.parse(await page.evaluate(() => window.__jb || 'null')) || { log: [], shots: {}, mode: 'defend', t0: null };
  // In-page instrumentation (idempotent)
  await page.evaluate(() => {
    if (window.__inst) return; window.__inst = { frames: [], flashes: [], stages: [], levels: [] };
    const I = window.__inst; const loop = (t) => { I.frames.push(t); if (I.frames.length > 20000) I.frames.splice(0, 5000); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
    new MutationObserver((ms) => { for (const m of ms) { const e = m.target; if (!(e instanceof HTMLElement)) continue;
      if (m.attributeName === 'data-flash' && e.dataset.flash) I.flashes.push([performance.now(), e.dataset.flash]);
      if (m.attributeName === 'data-stage' && e.classList.contains('crack-overlay')) I.stages.push([performance.now(), e.dataset.stage]);
      if (m.attributeName === 'data-level' && e.classList.contains('corruption-overlay')) I.levels.push([performance.now(), e.dataset.level, e.dataset.front]);
    } }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-flash', 'data-stage', 'data-level'] });
  });
  if (g.retry) { g.retry = false; await page.getByRole('button', { name: 'Retry' }).click(); g.t0 = Date.now(); await page.evaluate(() => { const I = window.__inst; I.frames = []; I.flashes = []; I.stages = []; I.levels = []; I.t0 = performance.now(); }); }
  if (g.start) { g.start = false; await page.getByRole('button', { name: 'Connect', exact: true }).click(); g.t0 = Date.now(); await page.evaluate(() => { window.__inst.t0 = performance.now(); }); }
  const now = () => (Date.now() - g.t0) / 1000;
  const snap = () => page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const hud = q('.lane-hud')?.textContent ?? '';
    const m = hud.match(/(\d+)\s*%/);
    return {
      integ: m ? +m[1] : null, hud, pct: q('.dl-percent')?.textContent ?? null,
      real: !!(q('.ns-real-link') && !q('.ns-real-link').hidden), started: !!(q('.ns-started') && !q('.ns-started').hidden),
      stage: q('.crack-overlay')?.dataset.stage ?? null, level: q('.corruption-overlay')?.dataset.level ?? null,
      result: /Retry/.test(document.body.innerText) && !!document.querySelector('button') && [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Retry'),
      ads: [...document.querySelectorAll('[data-ad-id]')].map((e) => ({ id: e.dataset.adId, cls: e.className, stage: e.dataset.stage, controls: [...e.querySelectorAll('[data-control]')].map((c) => c.dataset.control + ':' + c.textContent.trim()) })),
    };
  });
  const clickEl = async (loc) => { const b = await loc.boundingBox({ timeout: 300 }).catch(() => null); if (!b) return false; await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); return true; };
  const shot = async (name) => { if (g.shots[name]) return; g.shots[name] = now(); await page.screenshot({ path: D + name + '.png' }); g.log.push({ t: now(), ev: 'shot', name }); };
  const end = Date.now() + (g.chunk || 50000);
  while (Date.now() < end) {
    const s = await snap();
    if (g.sacAt && now() > g.sacAt) g.mode = 'sacrifice';
    if (g.mode === 'defend' && g.buy && Date.now() - (g.lb || 0) > 2000) { g.lb = Date.now(); for (const k of ['1', '5']) await page.keyboard.press(k); }
    if (s.result) { await shot(g.prefix + 'result'); g.log.push({ t: now(), ev: 'result', hud: s.hud, pct: s.pct }); g.done = true; break; }
    if (!g.noShots && s.stage && +s.stage >= 1) await shot(g.prefix + 'crack-stage1-integ' + s.integ);
    if (!g.noShots && s.stage && +s.stage >= 2) await shot(g.prefix + 'crack-stage2-integ' + s.integ);
    if (!g.noShots && s.stage && +s.stage >= 3) await shot(g.prefix + 'crack-stage3-integ' + s.integ);
    if (s.level === '1') await shot(g.prefix + 'corruption-level1');
    if (!g.noShots && s.level === '2') await shot(g.prefix + 'corruption-level2');
    if (g.mode === 'sacrifice' && s.integ !== null && s.integ <= (g.endAt || 6)) {
      // tight capture loop for the NO SIGNAL cut
      for (let i = 0; i < 60; i++) { const t = now(); await page.screenshot({ path: D + `${g.prefix}end-${String(i).padStart(2, '0')}.png`, scale: 'css' }); const r = await snap(); g.log.push({ t, ev: 'endshot', i, integ: r.integ, result: r.result }); if (r.result) break; }
      continue;
    }
    if (s.real && !s.started && !g.realClicked) { g.realClicked = true; await clickEl(page.locator('.ns-real-link').first()); g.log.push({ t: now(), ev: 'real' }); continue; }
    let acted = false;
    s.ads.sort((a, b) => (/interrupter/.test(b.cls) ? 1 : 0) - (/interrupter/.test(a.cls) ? 1 : 0));
    for (const ad of s.ads) {
      g.tries ||= {}; if ((g.tries[ad.id] || 0) >= 6) continue;
      const m = ad.cls.match(/ad-pattern-(\w+)/); const pat = m ? m[1] : null; if (!pat) continue;
      let ctl = { plain: 'close', decoy: 'close', runaway: 'close', hidden: 'tinyClose', swapped: 'noThanks', countdown: 'skip' }[pat];
      if (pat === 'confirm') ctl = ad.stage === 'confirm' ? 'confirmYes' : 'close';
      if (pat === 'countdown' && ad.controls.some((c) => c.startsWith('skip:') && /\d/.test(c))) continue;
      g.tries[ad.id] = (g.tries[ad.id] || 0) + 1;
      if (await clickEl(page.locator(`[data-ad-id="${ad.id}"] [data-control="${ctl}"]`).first())) { acted = true; break; }
    }
    if (acted) { await page.waitForTimeout(80); continue; }
    if (g.mode === 'defend') {
      const c = page.locator('canvas').first(); const b = await c.boundingBox({ timeout: 300 }).catch(() => null);
      if (b) { const k = b.height / 260; g.sx = ((g.sx || 0) + 45) % 450; await page.mouse.click(b.x + (112 + g.sx) * k, b.y + b.height - 40 * k); await page.mouse.move(b.x + (112 + ((g.sx + 30) % 800)) * k, b.y + b.height - 30 * k); }
    }
    if (Date.now() - (g.ls || 0) > 3000) { g.ls = Date.now(); g.log.push({ t: now(), ev: 'state', integ: s.integ, pct: s.pct, stage: s.stage, level: s.level, ads: s.ads.length }); }
    await page.waitForTimeout(50);
  }
  const out = g.log; g.log = []; await page.evaluate((x) => { window.__jb = x; }, JSON.stringify(g)); return JSON.stringify(out);
}
