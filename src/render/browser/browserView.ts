/**
 * Browser_View: the Session_View for the browser front (browser-front Req 5.1, 5.4–5.7, 13.1,
 * 13.3, 14.3).
 *
 * - mount: the Ad_Layer goes into `ctx.overlayHost` (falls back to the lane host's parent with
 *   one warning for older fixtures). Nothing else appears until `connected`.
 * - `connected`: minimize the Dialer and open the NetSurfer_Window at Screen (0, 0). Closing it
 *   is refused with the busy text in the status bar for BUSY_TICKS.
 * - The Real_Link sends one `startDownload`, and only while the phase is `connected`.
 * - `downloadStarted`: the link becomes the "started" line and the Download_Panel appears.
 * - update: panel, penalty flash, Ad_Layer reconcile and sounds. The view never writes state;
 *   `ctx.send` is its only way to change the Run.
 * - unmount: close the window, remove the layer, stop every voice.
 */
import type { SessionContext, SessionView } from '../../dialup/session';
import { DEFAULT_AD_BALANCE } from '../../game/balance/ads';
import type { GameEvent, GameState } from '../../game/types';
import { BROWSER_WINDOW } from '../../ui/browserCopy';
import { createAdLayer, type AdLayer } from './adLayer';
import { createBrowserSoundPlayer, type BrowserSoundPlayer } from './browserSounds';
import { createDownloadPanel, type DownloadPanel } from './downloadPanel';
import { createNetsurferContent, type NetsurferContent } from './netsurferWindow';

export const NETSURFER_WINDOW_ID = 'netsurfer';
/** How long the busy text stays after a refused close (Req 5.6). */
export const BUSY_TICKS = 180;
/** How long the panel flashes after a fake-button penalty (Req 6.4). */
export const PENALTY_TICKS = 30;

export function createBrowserView(): SessionView {
  let ctx: SessionContext | null = null;
  let layer: AdLayer | null = null;
  let sounds: BrowserSoundPlayer | null = null;
  let content: NetsurferContent | null = null;
  let panel: DownloadPanel | null = null;
  let opened = false;
  let sentStart = false;
  let phase: GameState['phase'] = 'dialing';
  let tick = 0;
  let busyUntil = -1;
  let penaltyUntil = -1;

  const onRealLink = (): void => {
    if (!ctx || sentStart || phase !== 'connected') return;
    sentStart = true;
    ctx.send({ type: 'startDownload' });
  };

  const openWindow = (state: GameState): void => {
    if (!ctx) return;
    const windows = ctx.windows;
    try {
      windows.minimize('dialer');
    } catch {
      // No Dialer (fixtures): nothing to minimize.
    }
    if (opened && windows.isOpen(NETSURFER_WINDOW_ID)) {
      windows.focus(NETSURFER_WINDOW_ID);
      return;
    }
    const balance = state.ads?.balance ?? DEFAULT_AD_BALANCE;
    content = createNetsurferContent(balance, onRealLink);
    panel = createDownloadPanel();
    panel.root.hidden = true;
    content.panelSlot.append(panel.root);
    try {
      if (windows.isOpen(NETSURFER_WINDOW_ID)) {
        windows.focus(NETSURFER_WINDOW_ID);
      } else {
        windows.open({
          id: NETSURFER_WINDOW_ID,
          title: BROWSER_WINDOW.title,
          icon: 'browser',
          content: content.root,
          size: { w: 1024, h: 480 },
          position: { x: 0, y: 0 },
          onCloseRequest: () => {
            busyUntil = tick + BUSY_TICKS;
            content?.setStatus(BROWSER_WINDOW.statusBusy);
            return false;
          },
        });
      }
      opened = true;
    } catch (error) {
      console.error('Browser_View: could not open the NetSurfer window', error);
    }
  };

  return {
    mount(context) {
      ctx = context;
      let host: HTMLElement | null = context.overlayHost ?? null;
      if (!host) {
        console.warn('Browser_View: no overlayHost; mounting the Ad_Layer next to the lane');
        host = context.laneHost.parentElement ?? context.laneHost;
      }
      layer = createAdLayer((cmd) => ctx?.send(cmd));
      layer.mount(host);
      sounds = createBrowserSoundPlayer(context.audio);
    },

    update(state: GameState, events: readonly GameEvent[]) {
      if (!ctx) return;
      phase = state.phase;
      tick = state.tick;
      for (const event of events) {
        if (event.type === 'connected') openWindow(state);
        else if (event.type === 'downloadStarted') {
          content?.showStarted();
          if (panel) panel.root.hidden = false;
        } else if (event.type === 'downloadPenalty') penaltyUntil = event.tick + PENALTY_TICKS;
      }
      if (content && busyUntil >= 0 && tick >= busyUntil) {
        busyUntil = -1;
        content.setStatus(null);
      }
      if (panel) {
        panel.update(state);
        panel.setPenalty(tick < penaltyUntil);
      }
      layer?.update(state);
      sounds?.play(events);
    },

    unmount() {
      if (ctx && opened) {
        try {
          ctx.windows.close(NETSURFER_WINDOW_ID);
        } catch (error) {
          console.error('Browser_View: could not close the NetSurfer window', error);
        }
      }
      layer?.unmount();
      sounds?.stopAll();
      layer = null;
      sounds = null;
      content = null;
      panel = null;
      opened = false;
      ctx = null;
    },
  };
}
