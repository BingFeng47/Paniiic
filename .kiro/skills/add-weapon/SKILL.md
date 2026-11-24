---
name: add-weapon
description: Add a new lane weapon (for example a "nail gun") or a shop item or upgrade (for example a "modem fan") end to end, covering the WeaponId and ItemId unions, prices and stats in the economy balance, the shop slot mapping, the firing rule, the cursor sprite, the HUD slot copy, sounds and tests. Use when adding, renaming or changing a weapon, an upgrade, a one-use item or a shop slot.
---

# Add a weapon or item to the shop

The checklist uses a weapon called `nailgun` and an upgrade called `bigMag` as the example.
Replace them with the real names. Each step names the file and the symbol to change.

## 0. Before writing code

- `docs/game-design.md` section 6 is the source of truth: five shop slots, hotkeys 1–5, one
  upgrade level per weapon. A new weapon or slot changes the design. Ask the team first, then
  add its row (cost, how it works, upgrade) to section 6.
- Read `.kiro/steering/game-balance.md`, `.kiro/steering/sprites.md` and
  `.kiro/steering/retro-copy.md`.
- Terms: a **Weapon** is something the cursor fires on the lane (`hammer`, `saw`,
  `flamethrower`). An **Item** is anything sold in the shop: weapons, upgrades (`heavyHead`,
  `highRpm`, `bigTank`) and one-use items (`blocker`, `surge`).

## 1. Unions: `src/game/economy/economyTypes.ts`

1. A weapon goes into `WeaponId`. Every item (weapon or not) goes into `ItemId`.
2. Weapon state (target id, carry, ammo, timers) goes into `EconomyState` as `readonly`
   plain data (numbers, `null`, arrays, records; no `undefined`, no functions). The state must
   survive a JSON round trip.
3. New events go into `EconomyEventBody`. New input commands go into `EconomyCommand`.

## 2. Balance: `src/game/balance/economy.ts`

1. Add the item to `SHOP_ITEMS` (the `ShopItem` type is built from it) and its price to
   `DEFAULT_ECONOMY_BALANCE.prices`. Prices are whole KB.
2. Add each stat (damage per second, multiplier, seconds) to `EconomyBalance` with a doc
   comment, to `DEFAULT_ECONOMY_BALANCE`, and to `SCALAR_RULES` with the right `Rule`
   (`POSITIVE`, `NON_NEGATIVE`, `AT_LEAST_ONE` for multipliers). `resolveEconomyBalance`
   validates from `SCALAR_RULES`, so a stat missing there is never checked.
3. No numbers inline in logic. Logic reads `e.balance`.

## 3. Shop: `src/game/economy/shop.ts`

1. `nextItem`: map the item to a slot. A weapon and its upgrade share a slot
   (`!has('nailgun') ? 'nailgun' : has('bigMag') ? null : 'bigMag'`). One-use items always
   return themselves.
2. `buy`: one-use items set a timer or a held flag instead of joining `owned`. A weapon
   becomes `active` on purchase and emits `weaponSwitched`; add it to that branch and reset
   its state there.
3. `WEAPON_ORDER`: add the weapon so `ownedWeapons` and `switchWeapon` (Q/E, mouse wheel)
   cycle through it.
4. `createEconomyState`: initial values for any new state fields.
5. `ShopSlot` in `economyTypes.ts` and `slotForKey` in `src/render/laneView.ts` only cover
   1–5. A sixth slot is a design change.

## 4. Firing rule: `src/game/economy/weapons.ts`

1. Add a block to `weaponSystem` gated on `e.active === 'nailgun'` and the pointer state
   (`pointer.down`). Use `hitTest` for targets and `applyCarry` for fractional damage per
   tick, like the saw. Clear the weapon's state when it is not firing.
2. Upgrades read `e.owned.includes('bigMag')` and a factor from the balance.
3. The hammer is special: its swing lives in `src/game/hammer.ts`, which returns early when
   `economy.active !== 'hammer'` and reads `heavyHead` there.
4. No DOM, timers, `Date.now()` or `Math.random()`. Randomness only from the seeded RNG.

## 5. Cursor sprite: `src/render/sprites/entities.ts` and `src/render/sprites/placeholder.ts`

1. Add `'nailgun'` to `SpriteEntity` and a row to `ENTITY_LOOKS` with colour, size and the
   `['idle', 'use']` animations.
2. Add a `Body` function and its entry in `BODIES` in `placeholder.ts`. The `use` pose is
   the firing frame.
3. Final frames go to `assets/sprites/nailgun/` and are drawn by the team. Never write there.

## 6. Drawing and input: `src/render/laneView.ts`

1. `weaponFiring` reports which hold-to-fire weapon is firing; add the new one so the cursor
   shows `use` and the sound loop runs.
2. The cursor draw picks the `SpriteEntity` from `economy.active`; add the new weapon there.
3. Pointer input sends `lanePointer` commands for hold weapons; only the hammer sends clicks.
   Rendering only reads state and sends commands.

## 7. HUD copy: `src/ui/economyCopy.ts` and `src/ui/shopTray.ts`

1. `ECONOMY_COPY.items` (typed `Record<ItemId, string>`) and `ECONOMY_COPY.weapons` (typed
   `Record<WeaponId, string>`): short uppercase OSD names. `ownedSlotNames` when a slot fills.
2. `WEAPON_SLOT` in `shopTray.ts` maps each weapon to its slot so the active slot is lit.
   Gauges (fuel, timers) are built in `createShopTray`. Text only through `textContent`.

## 8. Sounds: `src/render/economySounds.ts`

1. One-shot sounds: add an id to `EconomySoundId`, its length to `ECONOMY_SOUND_SEC`, a
   `SoundRecipe`, its entry in `ECONOMY_SOUNDS`, and the event mapping in `EVENT_SOUND` so
   `economySoundsFor` plays it.
2. Hold-to-fire loops: add to `EconomyLoopId` and `ECONOMY_LOOPS` (see `sawWhine`,
   `flameRoar`), driven by `weaponFiring`. All audio is synthesized with Web Audio.

## 9. Tests

- `tests/game/economy/economyExamples.test.ts`: price, purchase, firing damage, upgrade.
- `tests/game/economy/economyProperties.test.ts`: wallet invariants and same seed + same
  inputs ⇒ same state still hold with the new item.
- `tests/game/balance/` for validation rules of new stats.
- `tests/render/laneView.economy.test.ts`: cursor entity and `weaponFiring`.
- `tests/render/sprites/placeholder.test.ts`: the new entity draws every animation.
- Run `npm test` and `npm run typecheck`. The `Record<ItemId, …>` and
  `Record<SpriteEntity, …>` tables make typecheck list every table you missed.
