/**
 * Session_Registry: the one place later features plug into a Session (Req 10.10, 10.12).
 *
 * Milestone 3 (connection lane, Req 9.5): the Lane_View factory, which mounts into `ctx.laneHost`,
 * and the default Lane_Systems (`ensureLane`, `hammerSystem`, `mobSystem`, `scheduleSpawner`).
 * Importing this module loads no images: the lane view asks for the Sprite_Atlas only on mount.
 *
 * Milestone 4 (browser front, Req 14.2): the Browser_View factory, which opens the "NetSurfer"
 * window through `ctx.windows` on the `connected` event, and the Ad_Systems
 * (`ensureAds`, `adInputSystem`, `scheduleAds`, `adExpirySystem`), which run after the lane systems.
 */
import { createGameSystems } from '../game/systems';
import { createBrowserView } from '../render/browser/browserView';
import { createFlashBudget, type FlashBudget } from '../render/flashBudget';
import { createJuiceView } from '../render/juice/juiceView';
import { createLaneView } from '../render/laneView';
import { createHintView } from '../ui/hints/hintView';
import type { SessionRegistry } from './session';

/** Flash budget of the Session whose views are being made (see `views` below). */
let sessionFlashBudget: FlashBudget | null = null;
/** Later milestones add their Session_Views and game-core systems here. */
export const SESSION_REGISTRY: SessionRegistry = {
  // player-guide Req 3: the Hint_View mounts after the Browser_View so its layer sits above the Ad_Layer.
  // juice-and-endings Req 8.1: the Session calls these factories in order, once per Session, so
  // the Lane_View factory makes that Session's flash budget and the Juice_View shares it.
  views: [
    () => {
      sessionFlashBudget = createFlashBudget();
      const budget = sessionFlashBudget;
      return createLaneView({ flashBudget: () => budget });
    },
    () => createBrowserView(),
    () => createHintView(),
    () => createJuiceView({ flashBudget: sessionFlashBudget ?? createFlashBudget() }),
  ],
  // Milestones 5 and 6 (Director, Weapon_System, Wallet_System) and ad-pressure Req 1.2: the
  // Game_Systems come from the shared list the zombie-sim bots also run.
  systems: createGameSystems(),
};
