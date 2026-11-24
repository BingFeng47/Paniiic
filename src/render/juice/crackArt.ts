/**
 * Constant inline SVG for the three Crack_Stages (Requirements 2.1, 2.3, 8.3).
 *
 * The SVG covers the whole Screen (1024 × 768, Screen pixels). Every crack is a hand-placed
 * polyline. Stage N draws every crack of stages 1..N, so each stage is a superset of the one
 * before. All cracks keep clear of KEEP_CLEAR (the Real_Link rect and the middle half of the
 * Lane_Dock); `CRACKS` exports the points and bounding boxes so a test can check this.
 *
 * Compile-time constant markup only. No game or ad text goes into it.
 */

export interface CrackBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Crack {
  /** First Crack_Stage that shows this crack. */
  readonly stage: 1 | 2 | 3;
  readonly points: readonly (readonly [number, number])[];
  /** SVG path data built from `points`. */
  readonly d: string;
  /** Axis-aligned bounding box of `points`. */
  readonly box: CrackBox;
}

export type CrackStage = 1 | 2 | 3;

export const CRACK_VIEW_W = 1024;
export const CRACK_VIEW_H = 768;

/**
 * Rects the cracks must not touch, in Screen pixels. The Real_Link matches
 * `DEFAULT_AD_BALANCE.realLink`; the Lane_Dock sits above the 28 px Taskbar and is 260 px tall
 * (y 480..740), and its middle half is x 256..768.
 */
export const KEEP_CLEAR: Readonly<Record<'realLink' | 'laneDockCentre', CrackBox>> = {
  realLink: { x: 412, y: 300, w: 200, h: 16 },
  laneDockCentre: { x: 256, y: 480, w: 512, h: 260 },
};

type Pts = readonly (readonly [number, number])[];

function crack(stage: CrackStage, points: Pts): Crack {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    stage,
    points,
    d: points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]} ${p[1]}`).join(' '),
    box: { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y },
  };
}

export const CRACKS: readonly Crack[] = [
  // Stage 1: an impact in the top-left and one in the bottom-right corner.
  crack(1, [[0, 18], [46, 40], [92, 58], [150, 96], [214, 150]]),
  crack(1, [[46, 40], [70, 0]]),
  crack(1, [[92, 58], [60, 118], [40, 160]]),
  crack(1, [[1024, 612], [960, 640], [910, 690], [846, 730], [804, 768]]),
  crack(1, [[960, 640], [930, 580]]),
  // Stage 2: the top-right corner and the left edge give way.
  crack(2, [[1024, 30], [968, 64], [930, 120], [880, 150], [824, 196]]),
  crack(2, [[968, 64], [940, 0]]),
  crack(2, [[0, 300], [52, 340], [96, 400], [130, 452], [176, 518]]),
  crack(2, [[96, 400], [30, 430]]),
  crack(2, [[150, 96], [226, 118], [300, 112]]),
  // Stage 3: the glass is spider-webbed from every edge.
  crack(3, [[0, 612], [62, 640], [120, 690], [180, 726], [238, 768]]),
  crack(3, [[120, 690], [90, 768]]),
  crack(3, [[456, 0], [494, 40], [530, 72], [600, 110]]),
  crack(3, [[1024, 262], [972, 310], [930, 368], [884, 456]]),
  crack(3, [[930, 120], [1000, 190], [1024, 226]]),
  crack(3, [[300, 112], [348, 170], [372, 236], [394, 286]]),
  crack(3, [[176, 518], [214, 590], [236, 640]]),
  crack(3, [[884, 456], [820, 470], [790, 520], [800, 600]]),
];

const PATH_ATTRS = 'fill="none" stroke-linecap="round" stroke-linejoin="round"';

function svgFor(stage: CrackStage): string {
  const paths = CRACKS.filter((c) => c.stage <= stage)
    .map(
      (c) =>
        `<path class="crack-shadow" d="${c.d}" ${PATH_ATTRS}/>` +
        `<path class="crack-line" d="${c.d}" ${PATH_ATTRS}/>`,
    )
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CRACK_VIEW_W} ${CRACK_VIEW_H}" ` +
    `width="${CRACK_VIEW_W}" height="${CRACK_VIEW_H}" aria-hidden="true" focusable="false">` +
    paths +
    `</svg>`
  );
}

/** Constant SVG markup per Crack_Stage, built once at module load from constant data. */
export const CRACK_SVG: Readonly<Record<CrackStage, string>> = {
  1: svgFor(1),
  2: svgFor(2),
  3: svgFor(3),
};
