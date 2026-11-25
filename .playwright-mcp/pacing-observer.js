async (page) => {
  // Read-only instrumentation for the pacing-and-economy playtest (2026-11-24).
  // Adapted from adpressure-observer.js. Appends one extra Session_View factory to the live
  // SESSION_REGISTRY that only reads the state each frame and copies a summary to window.__obs.
  // It never sends commands. It also wraps AudioParam setters to log the frequencies of sounds
  // that are played (to check the combo blip), without changing what is played.
  return await page.evaluate(async () => {
    if (window.__obsInstalled) return 'already installed';
    window.__obsInstalled = true;
    if (!window.__audioWrapped) {
    window.__audioWrapped = true;
    window.__freq = [];
    const P = AudioParam.prototype;
    for (const name of ['setValueAtTime']) {
      const orig = P[name];
      P[name] = function (v, t) { try { if (window.__freq.length < 200000) window.__freq.push([performance.now(), v]); } catch {} return orig.call(this, v, t); };
    }
    const desc = Object.getOwnPropertyDescriptor(P, 'value');
    Object.defineProperty(P, 'value', { configurable: true, get() { return desc.get.call(this); }, set(v) { try { window.__freq.push([performance.now(), v, 'v']); } catch {} desc.set.call(this, v); } });
    }
    // Vite may serve the app's copy with an HMR timestamp (?t=...); import the same instance.
    const urls = performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /\/src\/dialup\/sessionRegistry\.ts/.test(n));
    const stamped = urls.filter((u) => /\?t=/.test(u)).sort().pop();
    const mod = await import(stamped ? new URL(stamped).pathname + new URL(stamped).search : '/src/dialup/sessionRegistry.ts');
    const KEEP = new Set(['adOpened', 'adClosed', 'adMistake', 'adSkipped', 'adHatched', 'mobSpawned', 'mobArrived',
      'mobKilled', 'packetDropped', 'packetCollected', 'packetExpired', 'connected', 'downloadStarted', 'downloadHalfway',
      'integrityCritical', 'won', 'lost', 'popupBurst', 'downloadPenalty', 'fakeButtonClicked', 'combo',
      'itemBought', 'buyRejected', 'weaponSwitched', 'kbChanged', 'bossSummoned']);
    mod.SESSION_REGISTRY.views.push(() => ({
      mount() { window.__obs = { ev: [], samples: [], last: null, minInteg: 100, runs: (window.__obs?.runs ?? 0) + 1, mountPerf: performance.now() }; },
      update(state, events) {
        const O = window.__obs; if (!O) return;
        const t = state.tick / 60;
        const ads = state.ads?.ads ?? [];
        const enemies = state.lane?.enemies ?? [];
        const eco = state.economy;
        O.last = {
          t, tick: state.tick, phase: state.phase, download: state.download, integrity: state.integrity,
          paused: state.pauseSources?.length ?? 0,
          ads: ads.map((a) => ({ id: a.id, kind: a.kind, pattern: a.pattern, rect: a.rect, laneCover: a.laneCover, stage: a.stage })),
          mobs: enemies.map((e) => ({ id: e.id, kind: e.kind, x: e.x, hp: e.hp })),
          packets: (eco?.packets ?? []).map((p) => ({ id: p.id, x: p.x })),
          wallet: eco?.wallet, gained: eco?.gained, spent: eco?.spent, owned: eco?.owned, active: eco?.active, fuel: eco?.fuel,
          combo: eco?.comboCount, bestCombo: eco?.bestCombo,
        };
        if (state.integrity < O.minInteg) { O.minInteg = state.integrity; O.minIntegT = t; }
        for (const e of events) {
          if (!KEEP.has(e.type)) continue;
          const r = { t, perf: performance.now(), ...e };
          if (e.type === 'mobSpawned' && e.kind === 'boss') { const b = enemies.find((m) => m.id === e.id); r.bossHp = b?.hp; r.dl = state.download; r.integ = state.integrity; }
          if (e.type === 'mobArrived' && e.kind === 'boss') { r.dl = state.download; r.integ = state.integrity; }
          if (e.type === 'combo' || e.type === 'kbChanged' || e.type === 'itemBought') { r.wallet = eco?.wallet; r.gained = eco?.gained; }
          O.ev.push(r);
        }
        // boss position samples for speed
        const boss = enemies.find((m) => m.kind === 'boss');
        if (boss && state.tick % 6 === 0) O.samples.push({ t, bossX: boss.x, bossHp: boss.hp });
        if (state.tick % 60 === 0) O.samples.push({ t, dl: +state.download.toFixed(2), integ: state.integrity, wallet: eco?.wallet, gained: eco?.gained, mobs: enemies.length, ads: ads.length });
      },
      unmount() {},
    }));
    return 'installed; views=' + mod.SESSION_REGISTRY.views.length;
  });
}
