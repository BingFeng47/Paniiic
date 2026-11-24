async (page) => {
  // Ad-pressure smoke bot (2026-11-23). Adapted from juicebot.js. Needs adpressure-observer.js.
  // Times are game seconds (tick / 60) = seconds from clicking Connect / Retry.
  const D = 'docs/playtests/2026-11-23-ad-pressure-smoke/';
  const g = JSON.parse(await page.evaluate(() => window.__ab || 'null')) || { log: [], shots: {}, c3: { step: 'wait' } };
  if (g.start) { g.start = false; await page.getByRole('button', { name: 'Connect', exact: true }).click(); }
  if (g.retry) { g.retry = false; await page.getByRole('button', { name: 'Retry' }).click(); }
  const L = (o) => g.log.push(o);
  const obs = () => page.evaluate(() => window.__obs?.last ?? null);
  const evs = (from) => page.evaluate((f) => (window.__obs?.ev ?? []).slice(f), from);
  const shot = async (name0, t) => { const name = (g.prefix || '') + name0.replace(g.prefix || '\u0000', ''); if (g.shots[name]) return; g.shots[name] = t ?? true; await page.screenshot({ path: D + name + '.png', scale: 'css' }); L({ t, shot: name }); };
  await page.waitForTimeout(300);
  const bbox = () => page.evaluate(() => { const c = document.querySelector('canvas.lane-canvas'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  let cb = null; for (let i = 0; i < 50 && !cb; i++) { cb = await bbox(); if (!cb) await page.waitForTimeout(100); }
  if (!cb) return JSON.stringify([{ err: 'no lane canvas' }]);
  let k = cb.width / 1024;
  // canvas px -> client px
  const cc = (x, y) => ({ x: cb.x + x * k, y: cb.y + y * k });
  const onCanvas = (p) => page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.classList.contains('lane-canvas') ?? false, [p.x, p.y]);
  const H = { default: [44, 72], fast: [34, 48], tank: [72, 96], ranged: [48, 76], boss: [112, 150], glob: [22, 22] };
  const hitPoints = (m) => { const [w, h] = H[m.kind]; const X = 112 + m.x; const yTop = 232 - h; const pts = []; for (const fy of [0.5, 0.85, 0.2]) for (const fx of [0, -0.35, 0.35]) pts.push({ x: X + fx * w, y: yTop + fy * h }); if (m.kind === 'glob') return [{ x: X, y: 232 - 12 }]; return pts; };
  const clickMob = async (m) => { for (const p of hitPoints(m)) { const c = cc(p.x, p.y); if (await onCanvas(c)) { await page.mouse.click(c.x, c.y); return p; } } return null; };
  const adRectCanvas = (a) => ({ l: a.rect.x, r: a.rect.x + a.rect.w, t: a.rect.y - 480, b: a.rect.y - 480 + a.rect.h });
  const clickCtl = async (id, ctl) => { const loc = page.locator(`[data-ad-id="${id}"] [data-control="${ctl}"]`).first(); const b = await loc.boundingBox({ timeout: 200 }).catch(() => null); if (!b) return false; const x = b.x + b.width / 2, y = b.y + b.height / 2; const ok = await page.evaluate(([x, y, id, ctl]) => { const e = document.elementFromPoint(x, y)?.closest('[data-control]'); return !!e && e.dataset.control === ctl && e.closest('[data-ad-id]')?.dataset.adId === id; }, [x, y, String(id), ctl]); if (!ok) return false; await page.mouse.click(x, y); return true; };
  // Click an ad's own body (a wrong control) where the ad is topmost.
  const clickBody = async (id) => {
    const loc = page.locator(`[data-ad-id="${id}"] .ad-text`).first(); const b = await loc.boundingBox({ timeout: 200 }).catch(() => null); if (!b) return false;
    for (const f of [0.5, 0.2, 0.8]) { const x = b.x + b.width * f, y = b.y + b.height / 2; const ok = await page.evaluate(([x, y, id]) => { const e = document.elementFromPoint(x, y); const ad = e?.closest('[data-ad-id]'); return ad?.dataset.adId === id && (e.closest('[data-control]') === ad); }, [x, y, String(id)]); if (ok) { await page.mouse.click(x, y); return true; } }
    return false;
  };
  const correct = (a) => { if (a.pattern === 'confirm') return a.stage === 'confirm' ? 'confirmYes' : 'close'; return { plain: 'close', decoy: 'close', runaway: 'close', hidden: 'tinyClose', swapped: 'noThanks', countdown: 'skip' }[a.pattern]; };
  let evIdx = g.evIdx || 0;
  const end = Date.now() + (g.chunk || 55000);
  while (Date.now() < end) {
    const s = await obs(); if (!s) { await page.waitForTimeout(100); continue; }
    const t = +s.t.toFixed(2);
    { const nb = await bbox(); if (nb) { cb = nb; k = cb.width / 1024; } }
    // new events
    const ne = await evs(evIdx); evIdx += ne.length;
    for (const e of ne) {
      if (['adOpened', 'adClosed', 'adMistake', 'adSkipped', 'adHatched', 'won', 'lost', 'connected', 'downloadStarted', 'packetCollected'].includes(e.type) || (e.type === 'mobSpawned')) L({ t: +e.t.toFixed(2), e: e.type, id: e.id, kind: e.kind, src: e.source, pattern: e.pattern, laneCover: e.laneCover, mobId: e.mobId, control: e.control, clutter: s.clutter });
      if (e.type === 'adHatched' && !g.firstHatch) { g.firstHatch = e.t; }
    }
    if (s.phase === 'won' || s.phase === 'lost' || t > 5 && /Retry/.test(await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent).join('|')))) { L({ t, end: s.phase, dl: s.download, integ: s.integrity }); await page.waitForTimeout(2500); await shot((g.prefix || '') + '90-result', t); g.done = true; break; }
    // screenshots by condition
    if (s.phase === 'downloading' && s.clutter === 0 && s.download > 0.3 && !s.paused) await shot('10-rate-0-clutter', t);
    if (s.clutter === 1 && s.download > 0.3 && t > 26.5) await shot('11-rate-1-clutter', t);
    if (s.clutter === 3 && t > 42) await shot('12-rate-3-clutter', t);
    if (s.clutter >= 4 && t > 45.5 && g.shots[(g.prefix || '') + '12-rate-3-clutter']) await shot('13-rate-floor', t);
    if (s.integrity < 100 && g.shots[(g.prefix || '') + '10-rate-0-clutter']) await shot('14-line-noise', t);
    const hatchingOn = await page.evaluate(() => document.querySelectorAll('.ad.is-hatching').length);
    if (hatchingOn && !g.shots[(g.prefix || '') + '20-hatch-warning'] && t > 33) await shot('20-hatch-warning', t);
    if (g.firstHatch && t > g.firstHatch + 0.25) await shot('21-hatch-after', t);
    if (g.firstHatch && t > g.firstHatch + 1.2) await shot('22-hatch-after-1s', t);
    if (s.clutter >= 8) await shot('40-cap-8', t);
    if (s.clutter >= 8 && s.inter > 0) await shot('41-cap-8-interrupter', t);
    if (s.clutter >= 8 && s.fake > 0) await shot('42-cap-8-fake', t);
    // real link
    if (!g.real) { const vis = await page.evaluate(() => { const e = document.querySelector('.ns-real-link'); return !!e && !e.hidden && e.getBoundingClientRect().width > 0; }); if (vis) { const b = await page.locator('.ns-real-link').first().boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); g.real = true; L({ t, act: 'realLink' }); continue; } }
    // ---- check 3: lane cover ----
    const lcs = s.ads.filter((a) => a.laneCover);
    const lc = g.edge ? (lcs.find((a) => a.id === g.c3.adLock) || lcs.filter((a) => a.rect.y - 480 + a.rect.h > 226 && a.rect.x > 60).sort((a, b) => b.rect.y - a.rect.y)[0] || null) : lcs[0];
    if (g.edge && lc && g.c3.step === 'wait' && g.c3.ad !== lc.id) { g.c3.ad = null; }
    if (g.edge && lc && g.c3.step !== 'wait') g.c3.adLock = lc.id; else if (g.c3) g.c3.adLock = null;
    const c3 = g.c3;
    let busy3 = false;
    if (lc && c3.step !== 'done' && g.do3 !== false) {
      busy3 = true;
      const R = adRectCanvas(lc);
      if (!c3.ad) { c3.ad = lc.id; c3.rect = R; L({ t, c3: 'laneCoverSeen', id: lc.id, rect: lc.rect, pattern: lc.pattern }); await shot('30-lane-cover', t); }
      const tm = c3.mob != null ? s.mobs.find((m) => m.id === c3.mob) : null;
      const topAt = (c) => page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e?.closest('[data-ad-id]')?.dataset.adId ?? e?.className ?? null; }, [c.x, c.y]);
      if (g.c3v2) {
        if (c3.step === 'wait') {
          const cand = s.mobs.filter((m) => m.kind === 'default' && m.hp === 2 && 112 + m.x > R.l + 25 && 112 + m.x < R.r - 25 && R.b > (g.edge ? 226 : 165)).sort((a, b) => a.x - b.x)[0];
          if (cand) {
            const X = 112 + cand.x; const y = Math.min(R.b, 232) - 5; const c = cc(X, y); const top = await topAt(c);
            if (top === String(lc.id)) {
              const before = s.clutter; await page.mouse.click(c.x, c.y); await page.waitForTimeout(200); const o2 = await obs(); const after = o2.mobs.find((m) => m.id === cand.id);
              L({ t, c3: 'underClick', mob: cand.id, cx: X, cy: y, topElement: top, hpBefore: cand.hp, hpAfter: after?.hp ?? 'dead', clutterBefore: before, clutterAfter: o2.clutter });
              await shot((g.prefix || '') + '31-under-click', t);
              c3.mob = cand.id; c3.step = 'beside';
            }
          }
        } else if (c3.step === 'beside' && tm && g.edge) {
          // run 4: hit the part of the mob that sticks out of the ad's left edge while its centre
          // (where the packet will drop) is still under the ad.
          const X = 112 + tm.x;
          if (X < R.l + 4) { L({ t, c3: 'missedEdge', mob: tm.id, cx: X, hp: tm.hp }); c3.step = 'wait'; c3.mob = null; c3.edgeClicks = 0; }
          else if (X <= R.l + 25 && (c3.lastEdge || 0) < Date.now() - 310) {
            const c = cc(R.l - 3, 175); if (await onCanvas(c)) {
              await page.mouse.click(c.x, c.y); c3.lastEdge = Date.now(); c3.edgeClicks = (c3.edgeClicks || 0) + 1; const away = cc(512, -200); await page.mouse.move(away.x, away.y);
              L({ t, c3: 'edgeClick', mob: tm.id, cx: X, clickX: R.l - 3, hpBefore: tm.hp });
            }
          }
        } else if (c3.step === 'beside' && !tm && g.edge && c3.edgeClicks) {
          const info = await page.evaluate((id) => { const k = window.__obs.ev.find((e) => e.type === 'mobKilled' && e.id === id); if (!k) return null; const d = window.__obs.ev.find((e) => e.type === 'packetDropped' && e.tick === k.tick && Math.abs(e.x - k.x) < 0.01); return { t: k.t, x: k.x, packet: d ? d.id : null }; }, c3.mob);
          const pkNow = info && info.packet != null ? s.packets.find((q) => q.id === info.packet) : null;
          L({ t, c3: 'killed', mob: c3.mob, info, packetStillOnLine: !!pkNow, packetUnderAd: info ? (112 + info.x > R.l + 2 && R.b > 222) : null });
          if (info && pkNow && 112 + info.x > R.l + 2) { c3.packet = info.packet; c3.packetX = 112 + info.x; c3.step = 'packet'; } else { c3.step = 'wait'; c3.mob = null; c3.edgeClicks = 0; }
        } else if (c3.step === 'beside' && tm) {
          const p = await clickMob(tm);
          if (p) { await page.waitForTimeout(150); const o2 = await obs(); const after = o2.mobs.find((m) => m.id === tm.id); L({ t, c3: 'besideClick', mob: tm.id, cx: 112 + tm.x, at: p, hpBefore: tm.hp, hpAfter: after?.hp ?? 'dead' }); await shot((g.prefix || '') + '33-beside-click', t); if (!after) c3.step = 'done'; else if (after.hp < tm.hp) { c3.step = 'kill'; await page.waitForTimeout(250); } }
        } else if (c3.step === 'kill' && tm) {
          // keep the pointer away from the packet spot: click, then park the pointer in the browser area
          const X = 112 + tm.x; const cand = [];
          if (R.b < 236) cand.push({ x: X - 26, y: R.b + 2 }, { x: X + 26, y: R.b + 2 });
          if (X >= R.l && X <= R.l + 24) cand.push({ x: R.l - 3, y: 175 });
          if (X < R.l) cand.push({ x: X, y: 175 });
          let p = null;
          for (const q of cand) { if (Math.hypot(q.x - X, q.y - 220) <= 29) continue; const c = cc(q.x, q.y); if (await onCanvas(c)) { await page.mouse.click(c.x, c.y); p = q; break; } }
          const away = cc(512, -200); await page.mouse.move(away.x, away.y);
          if (p) { await page.waitForTimeout(150); const o2 = await obs(); const after = o2.mobs.find((m) => m.id === tm.id); if (!after) { const X = 112 + tm.x; const pk = o2.packets.filter((q) => Math.abs(112 + q.x - X) < 6).pop(); L({ t, c3: 'killed', mob: tm.id, cx: X, packet: pk ?? null, collectedAlready: !pk }); if (pk) { c3.packet = pk.id; c3.packetX = 112 + pk.x; c3.step = 'packet'; } else c3.step = 'done'; } }
        } else if ((c3.step === 'beside' || c3.step === 'kill') && !tm) { L({ t, c3: 'testMobGone', step: c3.step }); c3.step = 'wait'; c3.mob = null; }
        else if (c3.step === 'packet') {
          const py = Math.min(R.b - 4, 220); const px = Math.min(Math.max(c3.packetX, R.l + 4), R.r - 8); const inAd = cc(px, py); const top = await topAt(inAd);
          await page.mouse.move(inAd.x, inAd.y);
          // wiggle strictly inside the ad: only to the right and up, never across its left edge
          for (let i = 0; i < 12; i++) { await page.mouse.move(inAd.x + (i % 3) * 3 * k, inAd.y - (i % 2) * 6 * k, { steps: 2 }); await page.waitForTimeout(80); }
          const evC = await page.evaluate((id) => window.__obs.ev.filter((e) => e.type === 'packetCollected' && e.id === id).map((e) => e.t), c3.packet);
          L({ t, c3: 'pointerInAdPoint', px, py, collectedEventsSoFar: evC });
          await shot((g.prefix || '') + '32-pointer-in-ad-over-packet', t);
          let o2 = await obs(); const stillAfterAd = o2.packets.some((q) => q.id === c3.packet);
          L({ t, c3: 'packetHoverThroughAd', packet: c3.packet, packetCanvasX: c3.packetX, pointerCanvasY: py, distanceToPacket: 220 - py, topElement: top, stillOnLine: stillAfterAd, economyPointer: o2.pointer });
          // positive control: the packet spot itself, if visible on the canvas
          let onPk = cc(c3.packetX, 220); let vis = await onCanvas(onPk);
          if (!vis && g.edge) { onPk = cc(R.l - 3, 220); vis = await onCanvas(onPk); L({ t, c3: 'positiveControlPoint', x: R.l - 3, distance: c3.packetX - (R.l - 3), vis }); }
          if (vis && stillAfterAd) { await page.mouse.move(onPk.x, onPk.y, { steps: 3 }); await page.waitForTimeout(150); o2 = await obs(); L({ t, c3: 'packetHoverOnCanvas', packet: c3.packet, stillOnLine: o2.packets.some((q) => q.id === c3.packet) }); }
          else if (stillAfterAd && g.edge) {
            // positive control: close the lane-cover ad with its correct control, then hover the same spot
            const ok = await clickCtl(lc.id, correct(lc)); await page.waitForTimeout(120);
            const vis2 = await onCanvas(onPk); if (vis2) { await page.mouse.move(onPk.x, onPk.y, { steps: 3 }); await page.waitForTimeout(150); }
            o2 = await obs(); L({ t, c3: 'packetAfterAdClosed', closedAd: ok, spotVisible: vis2, stillOnLine: o2.packets.some((q) => q.id === c3.packet) });
            await shot('34-packet-after-ad-closed', t);
          } else L({ t, c3: 'packetSpotNotVisible', vis });
          c3.step = 'done';
        }
      } else if (c3.step === 'wait') {
        const cand = s.mobs.filter((m) => m.kind === 'default' && m.hp === 2 && 112 + m.x > R.r + 30 && 112 + m.x < R.r + 200).sort((a, b) => a.x - b.x)[0];
        if (cand) { const p = await clickMob(cand); await page.waitForTimeout(120); const after = (await obs()).mobs.find((m) => m.id === cand.id); L({ t, c3: 'besideClick', mob: cand.id, cx: 112 + cand.x, at: p, hpBefore: cand.hp, hpAfter: after?.hp ?? 'dead' }); if (after && after.hp < cand.hp) { c3.mob = cand.id; c3.step = 'under'; c3.under = 0; } }
      } else if (c3.step === 'under' && tm) {
        const X = 112 + tm.x;
        if (X > R.l + 30 && X < R.r - 30 && (c3.lastUnder || 0) < Date.now() - 450 && c3.under < 2) {
          const y = Math.min(Math.max(R.t + 10, 232 - 60), Math.min(R.b - 10, 230)); const c = cc(X, y);
          const top = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e?.closest('[data-ad-id]')?.dataset.adId ?? e?.className ?? null; }, [c.x, c.y]);
          const before = s.clutter; await page.mouse.click(c.x, c.y); c3.lastUnder = Date.now(); c3.under++;
          await page.waitForTimeout(150); const o2 = await obs(); const after = o2.mobs.find((m) => m.id === tm.id);
          L({ t, c3: 'underClick', mob: tm.id, cx: X, cy: y, topElement: top, hpBefore: tm.hp, hpAfter: after?.hp ?? 'dead', clutterBefore: before, clutterAfter: o2.clutter });
          if (c3.under === 1) await shot('31-under-click', t);
        } else if (X <= R.l + 18 && X >= R.l + 4) {
          const c = cc(R.l - 4, 232 - 40); const okc = await onCanvas(c);
          if (okc) { await page.mouse.click(c.x, c.y); await page.waitForTimeout(120); const o2 = await obs(); const after = o2.mobs.find((m) => m.id === tm.id); L({ t, c3: 'edgeKill', mob: tm.id, cx: X, hpAfter: after?.hp ?? 'dead', packets: o2.packets }); if (!after) { const pk = o2.packets.filter((p) => Math.abs(112 + p.x - X) < 3).pop(); c3.packet = pk?.id; c3.packetX = pk ? 112 + pk.x : null; c3.step = 'packet'; } }
        } else if (X < R.l + 4) { L({ t, c3: 'missedEdge', cx: X }); c3.step = 'packetFallback'; }
      } else if (c3.step === 'under' && !tm) { L({ t, c3: 'testMobGone' }); c3.step = 'wait'; c3.mob = null; }
      else if (c3.step === 'packet') {
        // leave the lane (pointer to the browser area), then teleport into the ad over the packet and wiggle
        const away = cc(512, -200); await page.mouse.move(away.x, away.y); await page.waitForTimeout(100);
        const py = 232 - 12; const inside = py > R.t && py < R.b;
        const p = cc(c3.packetX, py); const top = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e?.closest('[data-ad-id]')?.dataset.adId ?? e?.className ?? null; }, [p.x, p.y]);
        await page.mouse.move(p.x, p.y);
        for (let i = 0; i < 12; i++) { await page.mouse.move(p.x + ((i % 3) - 1) * 8 * k, p.y + ((i % 2) ? 4 : -4) * k, { steps: 2 }); await page.waitForTimeout(80); }
        await shot('32-packet-under-ad', t);
        const o2 = await obs(); const still = o2.packets.some((q) => q.id === c3.packet);
        const coll = (await page.evaluate(() => window.__obs.ev.filter((e) => e.type === 'packetCollected').map((e) => e.id)));
        L({ t, c3: 'packetHover', packet: c3.packet, packetCanvasX: c3.packetX, packetCoveredVertically: inside, topElement: top, stillOnLine: still, collected: coll.includes(c3.packet), pointerState: o2.pointer });
        // positive control: drag along the visible canvas from the ad edge outward? Just move away and finish.
        c3.step = 'done';
      } else if (c3.step === 'packetFallback') { c3.step = 'done'; }
    }
    // ---- ads ----
    let acted = false;
    const mode = (g.closeFrom != null && t >= g.closeFrom) ? 'close' : (g.pileFrom != null && t >= g.pileFrom ? 'pile' : 'leave');
    if (mode === 'close') {
      const order = [...s.ads].filter((a) => a.kind !== 'fake' && !(a.laneCover && g.c3.step !== 'done' && (!g.edge || (lc && a.id === lc.id)))).sort((a, b) => (b.kind === 'interrupter') - (a.kind === 'interrupter'));
      for (const a of order) { g.tries ||= {}; if ((g.tries[a.id] || 0) > 6) continue; const ctl = correct(a); if (a.pattern === 'countdown') { const txt = await page.locator(`[data-ad-id="${a.id}"] [data-control="skip"]`).first().textContent({ timeout: 200 }).catch(() => ''); if (/\d/.test(txt)) continue; } g.tries[a.id] = (g.tries[a.id] || 0) + 1; if (await clickCtl(a.id, ctl)) { acted = true; break; } }
    } else if (mode === 'pile' && s.clutter < 8 && !busy3 && (g.lastPile || 0) < Date.now() - 250) {
      const a = s.ads.filter((x) => x.kind === 'clutter' && !x.laneCover).pop();
      if (a && await clickBody(a.id)) { g.lastPile = Date.now(); acted = true; L({ t, act: 'bodyClick', id: a.id, clutterBefore: s.clutter }); }
    }
    // interrupters: close them correctly only in close mode; otherwise leave (they pause the download)
    if (acted) { await page.waitForTimeout(60); continue; }
    // ---- lane defence ----
    const protect = c3.step !== 'done' && c3.mob != null ? c3.mob : null;
    let sacrificing = false;
    if (g.sacFrom != null && t >= g.sacFrom && !g.sacDone) { if (s.integrity <= g.sacTo) { g.sacDone = t; L({ t, sac: 'done', integ: s.integrity }); } else sacrificing = true; }
    if (g.sacDone && s.clutter === 0 && !s.paused && t > g.sacDone + 1.5) await shot((g.prefix || '') + '15-line-noise-rate', t);
    const holdR = lc && c3.step === 'wait' && g.c3v2 ? adRectCanvas(lc) : null;
    const targets = s.mobs.filter((m) => m.x < 120 || (m.id !== protect && !(holdR && 112 + m.x > holdR.l - 30 && m.kind === 'default'))).sort((a, b) => a.x - b.x);
    const quiet = g.edge && lc && (c3.step === 'beside' || c3.step === 'packet');
    if (targets.length && c3.step !== 'packet' && !sacrificing && !(quiet && targets[0].x >= 120)) { for (const m of targets.slice(0, 3)) { const p = await clickMob(m); if (p) break; } }
    if (Date.now() - (g.ls || 0) > 2000) { g.ls = Date.now(); L({ t, st: 1, dl: +s.download.toFixed(2), bw: s.bandwidth, integ: s.integrity, clutter: s.clutter, inter: s.inter, fake: s.fake, mobs: s.mobs.length, kb: s.wallet }); }
    await page.waitForTimeout(40);
  }
  g.evIdx = evIdx; const out = g.log; g.log = []; await page.evaluate((x) => { window.__ab = x; }, JSON.stringify(g)); return JSON.stringify(out);
}
