/**
 * Desktop icon art: original pixel-style icons, drawn for this game (Req 14.6).
 *
 * Each icon is a constant pixel grid (16 × 16 or 32 × 32 characters) that is turned into a
 * 32 × 32 viewBox SVG string once, when this module loads. The output depends only on the
 * constants in this file, so `ICON_SVG` is our own compile-time constant markup and `iconEl()`
 * is the one place in `src/` allowed to assign it as markup (tech steering, Req 14.4).
 *
 * Colours: every pixel colour is a `--c-icon-*` custom property from `src/styles/theme.css`,
 * applied through `style="fill:var(...)"`, so the art can be re-tuned from the theme file and no
 * colour literal lives outside it. Without the stylesheet the icons render as black silhouettes.
 *
 * 16 × 16 grids are used for the icons shown at 16 px (start, speaker, speakerMuted, file), so
 * every art pixel lands on a whole screen pixel there. The others are drawn at 32 × 32.
 */

export type IconName =
  | 'dialer'
  | 'text'
  | 'wastebasket'
  | 'file'
  | 'start'
  | 'speaker'
  | 'speakerMuted'
  | 'computer'
  | 'browser';

export const ICON_NAMES: readonly IconName[] = [
  'dialer',
  'text',
  'wastebasket',
  'file',
  'start',
  'speaker',
  'speakerMuted',
  'computer',
  'browser',
];

/** Grid character → theme custom property. `.` is transparent. Order = paint order. */
const PALETTE: Readonly<Record<string, string>> = {
  w: '--c-icon-white',
  l: '--c-icon-light',
  g: '--c-icon-mid',
  d: '--c-icon-dark',
  b: '--c-icon-case',
  B: '--c-icon-case-shade',
  t: '--c-icon-screen',
  T: '--c-icon-screen-glare',
  G: '--c-icon-glow',
  p: '--c-icon-purple',
  P: '--c-icon-lilac',
  y: '--c-icon-moon',
  r: '--c-icon-red',
  k: '--c-icon-ink',
};

const VIEW = 32;

/* ---- Pixel grids ------------------------------------------------------------------------------ */

/** Beige CRT monitor on a stand; used by the dialer progress view (computer, line, computer). */
const COMPUTER = [
  '................................',
  '................................',
  '................................',
  '....kkkkkkkkkkkkkkkkkkkkkkkk....',
  '....kwwwwwwwwwwwwwwwwwwwwwwk....',
  '....kwbbbbbbbbbbbbbbbbbbbbBk....',
  '....kwbkkkkkkkkkkkkkkkkkkbBk....',
  '....kwbkTTTtttttttttttttkbBk....',
  '....kwbkTTttttttttttttttkbBk....',
  '....kwbkTtttttttttttttttkbBk....',
  '....kwbkttGGGGGGttttttttkbBk....',
  '....kwbkttttttttttttttttkbBk....',
  '....kwbkttGGGGttttttttttkbBk....',
  '....kwbkttttttttttttttttkbBk....',
  '....kwbkttGtttttttttttttkbBk....',
  '....kwbkttttttttttttttttkbBk....',
  '....kwbkttttttttttttttttkbBk....',
  '....kwbkkkkkkkkkkkkkkkkkkbBk....',
  '....kwbbbbbbbbbbbbbbbbbGbbBk....',
  '....kwbbbbbbbbbbbbbbbbbbbbBk....',
  '....kBBBBBBBBBBBBBBBBBBBBBBk....',
  '....kkkkkkkkkkkkkkkkkkkkkkkk....',
  '............kBBBBBBk............',
  '............kBBBBBBk............',
  '........kkkkkkkkkkkkkkkk........',
  '........kwbbbbbbbbbbbbBk........',
  '........kBBBBBBBBBBBBBBk........',
  '........kkkkkkkkkkkkkkkk........',
  '................................',
  '................................',
  '................................',
  '................................',
] as const;

/** "Connect to MidnightNet": a purple desk telephone under a crescent moon. */
const DIALER = [
  '................................',
  '................................',
  '.......................kkk......',
  '.....................kkyyk......',
  '....................kyyk........',
  '....................kyk....y....',
  '....................kyk.........',
  '....................kyyk........',
  '.....................kkyyk......',
  '.......................kkk......',
  '....kkkkkkkkkkkkkkkkkkkkkkkk....',
  '...kPPPPPPPPPPPPPPPPPPPPPPPPk...',
  '..kppppppppppppppppppppppppppk..',
  '..kppppkkkkkkkkkkkkkkkkkkppppk..',
  '..kppppk..kk........kk..kppppk..',
  '..kkkkkk..kk........kk..kkkkkk..',
  '........kkkkkkkkkkkkkkkk........',
  '.......kPPPPPPPPPPPPPPPPk.......',
  '......kppppppppppppppppppk......',
  '.....kppppppppkkkkppppppppk.....',
  '.....kpppppppkldllkpppppppk.....',
  '.....kppppppkdlllldkppppppk.....',
  '.....kppppppkllkkllkppppppk.....',
  '.....kppppppkllkkllkppppppk.....',
  '.....kppppppkdlllldkppppppk.....',
  '.....kpppppppkldllkpppppppk.....',
  '.....kppppppppkkkkppppppppk.....',
  '.....kppppppppppppppppppppk.....',
  '.....kkkkkkkkkkkkkkkkkkkkkk.....',
  '................................',
  '................................',
  '................................',
] as const;

/** README.TXT: a page with a dog-ear, text lines and three faint scratch marks. */
const TEXT = [
  '................................',
  '................................',
  '......kkkkkkkkkkkkkkk...........',
  '......kwwwwwwwwwwwwwkk..........',
  '......kwwwwwwwwwwwwwklk.........',
  '......kwwgggggggwwwwkllk........',
  '......kwwwwwwwwwwwwwklllk.......',
  '......kwwwwwwwwwwwwwkkkkkk......',
  '......kwwwwwwwwwwwwwwwwwwkg.....',
  '......kwwwwwwwwwwwwwwwwwwkg.....',
  '......kwwggggggggggwwwwwwkg.....',
  '......kwwwwwwwwwwwwwwwwwwkg.....',
  '......kwwggggggggggggggwwkg.....',
  '......kwwwwwwwwwwwwwwwwwwkg.....',
  '......kwwggggggggggggwwwwkg.....',
  '......kwwwwwwwwwwwwwwwwwwkg.....',
  '......kwwggggggggggggggwwkg.....',
  '......kwwwwwwwwwwwwwwwwwwkg.....',
  '......kwwgggggggggwwwwwwwkg.....',
  '......kwwwwwwwwwwwwwwwwwwkg.....',
  '......kwwggggggggggggggwwkg.....',
  '......kwwwwwwwwwwwwwwwwwwkg.....',
  '......kwwgggggggggggggwwwkg.....',
  '......kwwwwwwwwwwwwwwwwwwkg.....',
  '......kwwggggggwwwwwwwwwwkg.....',
  '......kwwwwwwwwwwwwdwdwdwkg.....',
  '......kwwwwwwwwwwwdwdwdwwkg.....',
  '......kwwwwwwwwwwdwdwdwwwkg.....',
  '......kwwwwwwwwwwwwwwwwwwkg.....',
  '......kkkkkkkkkkkkkkkkkkkkg.....',
  '.......gggggggggggggggggggg.....',
  '................................',
] as const;

/** A wire-mesh bin with crumpled paper; two small eyes glow in the dark opening. */
const WASTEBASKET = [
  '................................',
  '................................',
  '................................',
  '...........kkkk....kkk..........',
  '..........kwwwwk..kwwwk.........',
  '.........kwwlwwwkkwwlwwk........',
  '.........kwwwlwwwwwlwwwk........',
  '........kwwlwwwwwwwwwlwwk.......',
  '......kkkkkkkkkkkkkkkkkkkk......',
  '....kkllllllllllllllllllllkk....',
  '...kllddGdGdddddddddddddddllk...',
  '....kkllllllllllllllllllllkk....',
  '.....kgllgllgllgllgllgllglk.....',
  '.....kgllgllgllgllgllgllglk.....',
  '.....kgllgllgllgllgllgllglk.....',
  '.....kgllgllgllgllgllgllglk.....',
  '.....kgllgllgllgllgllgllglk.....',
  '.....kgllgllgllgllgllgllglk.....',
  '......kllgllgllgllgllgllgk......',
  '......kllgllgllgllgllgllgk......',
  '......kllgllgllgllgllgllgk......',
  '......kllgllgllgllgllgllgk......',
  '......kllgllgllgllgllgllgk......',
  '......kllgllgllgllgllgllgk......',
  '.......klgllgllgllgllgllk.......',
  '.......klgllgllgllgllgllk.......',
  '.......klgllgllgllgllgllk.......',
  '.......klgllgllgllgllgllk.......',
  '.......klgllgllgllgllgllk.......',
  '.......klgllgllgllgllgllk.......',
  '.......kkkkkkkkkkkkkkkkkk.......',
  '................................',
] as const;

/** Generic file for Wastebasket rows (shown at 16 px). */
const FILE = [
  '................',
  '..kkkkkkkk......',
  '..kwwwwwwkk.....',
  '..kwwwwwwklk....',
  '..kwwwwwwkllk...',
  '..kwwwwwwkkkkk..',
  '..kwwwwwwwwwwk..',
  '..kwggggggggwk..',
  '..kwwwwwwwwwwk..',
  '..kwggggggwwwk..',
  '..kwwwwwwwwwwk..',
  '..kwgggggggwwk..',
  '..kwwwwwwwwwwk..',
  '..kwwwwwwwwwwk..',
  '..kkkkkkkkkkkk..',
  '................',
] as const;

/** Phantom 98 start button logo: a small ghost (shown at 16 px). */
const START = [
  '................',
  '......kkkk......',
  '....kkwwwwkk....',
  '...kwwwwwwwwk...',
  '...kwkkwwkkwk...',
  '...kwkkwwkkwk...',
  '...kwwwwwwwPk...',
  '...kwwwkkwwPk...',
  '...kwwwkkwwPk...',
  '...kwwwwwwwPk...',
  '...kwwwwwwPPk...',
  '...kwwwwwwwPk...',
  '...kwwwwwwwPk...',
  '...kwwkwwkwPk...',
  '....kk.kk.kk....',
  '................',
] as const;

/** Tray speaker with three sound waves (shown at 16 px). */
const SPEAKER = [
  '................',
  '................',
  '.......k........',
  '......kk...k....',
  '.....klk....k...',
  '.kkkkllk..k..k..',
  '.kddkllk...k.k..',
  '.kddkllk.k.k.k..',
  '.kddkllk.k.k.k..',
  '.kddkllk...k.k..',
  '.kkkkllk..k..k..',
  '.....klk....k...',
  '......kk...k....',
  '.......k........',
  '................',
  '................',
] as const;

/** Tray speaker, muted: the same speaker with a red cross (shown at 16 px). */
const SPEAKER_MUTED = [
  '................',
  '................',
  '.......k........',
  '......kk........',
  '.....klk........',
  '.kkkkllk.rr..rr.',
  '.kddkllk..rrrr..',
  '.kddkllk...rr...',
  '.kddkllk...rr...',
  '.kddkllk..rrrr..',
  '.kkkkllk.rr..rr.',
  '.....klk........',
  '......kk........',
  '.......k........',
  '................',
  '................',
] as const;

/** NetSurfer: a glowing green-gridded globe under a crescent moon. */
const BROWSER = [
  '................................',
  '...........................y....',
  '.........................yy.....',
  '.........................yy.....',
  '...........kkkkkkkkkk...yyy.....',
  '.........kktGGtTtttttkk..yyy....',
  '........kkttGGtTtttttTkk.yyyyy..',
  '.......ktTttGGGTtttttTttk..y....',
  '......kttTtttGGTtttttTtttk......',
  '.....kkTTTTTTGGTTTTTTTTTTkk.....',
  '.....ktttTtttGGGtttttTttttk.....',
  '....kttttTtttGGGtttttTtttttk....',
  '....kttttTttttGGtttttTtttttk....',
  '....kttttTttttGGtttttTtttttk....',
  '....kttttTttttGGGttttTtttttk....',
  '....kTTTTTTTTTTGGTTTTTTTTTTk....',
  '....kttttTtttttGGttttTtttttk....',
  '....kttttTtttttGGGtttTtttttk....',
  '....kttttTtttttTGGtttTtttttk....',
  '....kttttTtttttTGGtttTtttttk....',
  '....kttttTtttttTGGGttTtttttk....',
  '.....kTTTTTTTTTTGGGTTTTTTTk.....',
  '.....kkttTtttttTtGGttTtttkk.....',
  '......kttTtttttTtGGttTtttk......',
  '.......ktTtttttTtGGGtTttk.......',
  '........kktttttTttGGtTkk........',
  '.........kkttttTttGGtkk.........',
  '...........kkkkkkkkkk...........',
  '................................',
  '................................',
  '................................',
  '................................',
] as const;

const ICON_PIXELS: Readonly<Record<IconName, readonly string[]>> = {
  dialer: DIALER,
  text: TEXT,
  wastebasket: WASTEBASKET,
  file: FILE,
  start: START,
  speaker: SPEAKER,
  speakerMuted: SPEAKER_MUTED,
  computer: COMPUTER,
  browser: BROWSER,
};

/* ---- Grid → SVG ------------------------------------------------------------------------------- */

/** One `<path>` per colour; each horizontal run of equal pixels becomes one rectangle. */
function pixelSvg(name: string, rows: readonly string[]): string {
  const n = rows.length;
  if (n !== 16 && n !== 32) throw new Error(`iconArt: "${name}" must have 16 or 32 rows, got ${n}`);
  const px = VIEW / n;
  const runs = new Map<string, string[]>();

  rows.forEach((row, y) => {
    if (row.length !== n) {
      throw new Error(`iconArt: "${name}" row ${y} has ${row.length} pixels, expected ${n}`);
    }
    let x = 0;
    while (x < n) {
      const c = row.charAt(x);
      let end = x + 1;
      while (end < n && row.charAt(end) === c) end++;
      if (c !== '.') {
        if (!(c in PALETTE)) throw new Error(`iconArt: "${name}" uses unknown pixel "${c}"`);
        const w = (end - x) * px;
        const list = runs.get(c) ?? [];
        list.push(`M${x * px} ${y * px}h${w}v${px}h-${w}z`);
        runs.set(c, list);
      }
      x = end;
    }
  });

  const paths = Object.keys(PALETTE)
    .filter((c) => runs.has(c))
    .map((c) => `<path style="fill:var(${PALETTE[c]})" d="${(runs.get(c) ?? []).join('')}"/>`)
    .join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEW}" height="${VIEW}" ` +
    `viewBox="0 0 ${VIEW} ${VIEW}" shape-rendering="crispEdges" aria-hidden="true" ` +
    `focusable="false">${paths}</svg>`
  );
}

/** Constant SVG markup per icon, 32 × 32 viewBox. */
export const ICON_SVG: Readonly<Record<IconName, string>> = Object.freeze(
  Object.fromEntries(
    ICON_NAMES.map((name) => [name, pixelSvg(name, ICON_PIXELS[name])]),
  ) as Record<IconName, string>,
);

/** A fresh `span.icon` holding the icon's SVG. Sized by `.icon` rules in desktop.css. */
export function iconEl(name: IconName): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'icon';
  span.setAttribute('aria-hidden', 'true');
  span.dataset.icon = name;
  // The only markup assignment in src/: ICON_SVG is built solely from the constants above.
  span.innerHTML = ICON_SVG[name];
  return span;
}
