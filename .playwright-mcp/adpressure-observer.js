async (page) => {
  // Read-only instrumentation for the ad-pressure smoke playtest (2026-11-23).
  // 1. Appends one extra Session_View factory to the live SESSION_REGISTRY. The view only reads
  //    the state it is given each frame (like every other view) and copies a summary to
  //    window.__obs. It never sends commands and never changes state.
  // 2. A MutationObserver logs ad elements added/removed, `is-hatching` toggles and hint balloons.
  return await page.evaluate(async () => {
    if (window.__obsInstalled) return 'already installed';
    window.__obsInstalled = true;
    const mod = await import('/src/dialup/sessionRegistry.ts');
    const KEEP = new Set(['adOpened', 'adClosed', 'adMistake', 'adSkipped', 'adHatched', 'mobSpawned', 'mobHit',
      'mobKilled', 'packetDropped', 'packetCollected', 'packetExpired', 'connected', 'downloadStarted', 'modemHit',
      'integrityCritical', 'won', 'lost', 'popupBurst', 'hammerSwing', 'downloadPenalty', 'fakeButtonClicked']);
    mod.SESSION_REGISTRY.views.push(() => ({
      mount() {
        window.__obs = { ev: [], samples: [], last: null, runs: (window.__obs?.runs ?? 0) + 1 };
      },
      update(state, events) {
        const O = window.__obs; if (!O) return;
        const t = state.tick / 60;
        const ads = state.ads?.ads ?? [];
        const clutter = ads.filter((a) => a.kind === 'clutter').length;
        O.last = {
          t, tick: state.tick, phase: state.phase, download: state.download, integrity: state.integrity,
          bandwidth: state.bandwidth, paused: state.pauseSources.length, clutter,
          inter: ads.filter((a) => a.kind === 'interrupter').length, fake: ads.filter((a) => a.kind === 'fake').length,
          ads: ads.map((a) => ({ id: a.id, kind: a.kind, pattern: a.pattern, rect: a.rect, openTick: a.openTick, laneCover: a.laneCover, stage: a.stage })),
          mobs: (state.lane?.enemies ?? []).map((e) => ({ id: e.id, kind: e.kind, x: e.x, hp: e.hp })),
          packets: (state.economy?.packets ?? []).map((p) => ({ id: p.id, x: p.x })),
          wallet: state.economy?.wallet, pointer: state.economy?.pointer ?? null,
        };
        for (const e of events) if (KEEP.has(e.type)) O.ev.push({ t: e.tick / 60, ...e });
        if (state.tick % 30 === 0) O.samples.push({ t, dl: +state.download.toFixed(3), bw: state.bandwidth, integ: state.integrity, clutter, paused: state.pauseSources.length, rate: document.querySelector('.dl-rate')?.textContent ?? null, cause: (() => { const c = document.querySelector('.dl-cause'); return c && !c.hidden ? c.textContent : ''; })(), pct: document.querySelector('.dl-percent')?.textContent ?? null, time: document.querySelector('.dl-time')?.textContent ?? null });
      },
      unmount() {},
    }));
    window.__dom = [];
    const gt = () => (window.__obs?.last ? +window.__obs.last.t.toFixed(3) : null);
    new MutationObserver((ms) => {
      for (const m of ms) {
        if (m.type === 'childList') {
          for (const n of m.addedNodes) if (n instanceof HTMLElement) {
            const els = [n, ...n.querySelectorAll('[data-ad-id], .hint-balloon')];
            for (const el of els) {
              if (el.dataset?.adId) window.__dom.push({ t: gt(), ev: 'adAdded', id: el.dataset.adId, cls: el.className });
              if (el.classList?.contains('hint-balloon')) window.__dom.push({ t: gt(), ev: 'hint', id: el.dataset.hint, text: el.textContent });
            }
          }
          for (const n of m.removedNodes) if (n instanceof HTMLElement && n.dataset?.adId) window.__dom.push({ t: gt(), ev: 'adRemoved', id: n.dataset.adId });
        } else if (m.type === 'attributes' && m.attributeName === 'class') {
          const el = m.target; if (!(el instanceof HTMLElement) || !el.dataset.adId) continue;
          const was = (m.oldValue || '').split(' ').includes('is-hatching'); const now = el.classList.contains('is-hatching');
          if (was !== now) window.__dom.push({ t: gt(), ev: now ? 'hatchingOn' : 'hatchingOff', id: el.dataset.adId });
        }
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    return 'installed; views=' + mod.SESSION_REGISTRY.views.length;
  });
}
