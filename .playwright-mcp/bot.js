async (page) => {
  const g = JSON.parse(await page.evaluate(() => window.__ptg || 'null')) || { retry: true, t0: Date.now(), log: [], done: {}, fakeDone: false, sweepX: 0 };
  const now = () => (Date.now() - g.t0) / 1000;
  const snap = () => page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const ads = [...document.querySelectorAll('[data-ad-id]')].map((e) => ({
      id: e.dataset.adId, cls: e.className, stage: e.dataset.stage,
      controls: [...e.querySelectorAll('[data-control]')].map((c) => c.dataset.control + ':' + c.textContent.trim()),
      text: e.textContent.trim().slice(0, 90),
    }));
    return {
      pct: q('.dl-percent')?.textContent ?? null, rate: q('.dl-rate')?.textContent ?? null,
      status: q('.ns-status-text')?.textContent ?? null, real: !!(q('.ns-real-link') && !q('.ns-real-link').hidden), started: !!(q('.ns-started') && !q('.ns-started').hidden),
      hud: q('.lane-hud')?.textContent ?? null, ads,
      balloons: [...document.querySelectorAll('[class*=balloon],[class*=hint]')].map((e) => e.textContent.trim().slice(0, 80)),
      dialog: [...document.querySelectorAll('.title-bar-text')].map((e) => e.textContent).join('|'),
    };
  });
  const clickEl = async (loc) => { const b = await loc.boundingBox({ timeout: 300 }).catch(() => null); if (!b) return false; await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); return true; };
  if (g.retry) { g.retry = false; await page.getByRole('button', { name: 'Retry' }).click(); g.t0 = Date.now(); g.realClicked = false; }
  const end = Date.now() + (g.chunk || 50000);
  while (Date.now() < end) {
    const s = await snap();
    if (s.real && !s.started && !g.realClicked) {
      g.log.push({ t: now(), ev: 'clickReal', before: s.pct });
      await clickEl(page.locator('.ns-real-link').first()); g.realClicked = true; continue;
    }
    let acted = false;
    s.ads.sort((a, b) => (/interrupter/.test(b.cls) ? 1 : 0) - (/interrupter/.test(a.cls) ? 1 : 0));
    for (const ad of s.ads) {
      g.tries ||= {}; if ((g.tries[ad.id] || 0) >= 4 && !/interrupter/.test(ad.cls)) continue;
      const m = ad.cls.match(/ad-pattern-(\w+)/); const pat = m ? m[1] : null;
      const kind = (ad.cls.match(/ad-(clutter|interrupter|fake)/) || [])[1];
      const sel = `[data-ad-id="${ad.id}"]`;
      if (!pat) { // fake button
        if (!g.fakeDone && s.started) {
          g.fakeDone = true;
          await page.screenshot({ path: 'docs/playtests/2026-11-22-browser-front/20-fake-before.png' });
          const b = await snap();
          await clickEl(page.locator(`${sel} [data-control="fakeButton"]`));
          await page.waitForTimeout(400);
          const a = await snap();
          await page.screenshot({ path: 'docs/playtests/2026-11-22-browser-front/21-fake-after.png' });
          g.log.push({ t: now(), ev: 'FAKE', before: { pct: b.pct, hud: b.hud }, after: { pct: a.pct, hud: a.hud, ads: a.ads.length } });
          acted = true; break;
        }
        continue;
      }
      const key = kind + ':' + pat;
      let ctl = { plain: 'close', decoy: 'close', runaway: 'close', hidden: 'tinyClose', swapped: 'noThanks', countdown: 'skip' }[pat];
      if (pat === 'confirm') ctl = ad.stage === 'confirm' ? 'confirmYes' : 'close';
      if (pat === 'countdown' && ad.controls.some((c) => c.startsWith('skip:') && /\d/.test(c))) {
        if (!g.cdTried?.[ad.id]) { (g.cdTried ||= {})[ad.id] = 1; await clickEl(page.locator(`${sel} [data-control="skip"]`)); const a = await snap(); g.log.push({ t: now(), ev: 'countdownEarlyClick', stillOpen: a.ads.some((x) => x.id === ad.id) }); }
        continue;
      }
      const first = !g.done[key];
      if (first) { g.done[key] = 1; await page.screenshot({ path: `docs/playtests/2026-11-22-browser-front/30-${kind}-${pat}${ad.stage === 'confirm' ? '-confirm' : ''}.png` }); }
      const before = s;
      g.tries[ad.id] = (g.tries[ad.id] || 0) + 1;
      const ok = await clickEl(page.locator(`${sel} [data-control="${ctl}"]`).first());
      await page.waitForTimeout(250);
      const a = await snap();
      g.log.push({ t: now(), ev: 'close', key, stage: ad.stage, ctl, ok, text: first ? ad.text : undefined, controls: first ? ad.controls : undefined,
        closed: !a.ads.some((x) => x.id === ad.id), hudB: before.hud, hudA: a.hud, pctB: before.pct, pctA: a.pct, rate: before.rate });
      acted = true; break;
    }
    if (acted) continue;
    // lane sweep
    const c = page.locator('canvas').first(); const b = await c.boundingBox({ timeout: 300 }).catch(() => null);
    if (b) {
      const k = b.height / 260; const y = b.y + b.height - 40 * k;
      g.sweepX = (g.sweepX + 60) % 800;
      await page.mouse.click(b.x + (112 + g.sweepX) * k, y);
      await page.mouse.move(b.x + (112 + ((g.sweepX + 30) % 800)) * k, b.y + b.height - 30 * k);
    }
    if (g.log.length === 0 || Date.now() - (g.lastSnapLog || 0) > 3000) { g.lastSnapLog = Date.now(); g.log.push({ t: now(), ev: 'state', pct: s.pct, rate: s.rate, status: s.status, hud: s.hud, nAds: s.ads.map((x) => x.cls.replace(/ad /, '')).join(','), balloons: s.balloons, dialog: s.dialog }); }
    await page.waitForTimeout(60);
  }
  const out = g.log; g.log = []; await page.evaluate((x) => { window.__ptg = x; }, JSON.stringify(g)); return JSON.stringify(out);
}
