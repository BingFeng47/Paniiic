/**
 * Constant inline SVG for the Hatch_Warning on a clutter Ad (ad-pressure Req 7.2): a crack across
 * the pop-up and a zombie hand pushing out of a hole near its left edge.
 *
 * The crack is drawn in a 300 × 180 box (the default clutter size) and stretched to the Ad with
 * `preserveAspectRatio="none"`; its strokes keep their width through `non-scaling-stroke`. The
 * hand sits on the left edge, clear of the centred buttons and every corner ✕.
 *
 * Compile-time constant markup only. No game or ad text goes into it.
 */

const CRACK_PATHS: readonly string[] = [
  // Main split from the hole on the left edge across the body.
  'M0 104 L28 98 L58 108 L92 92 L128 100 L170 82 L214 90 L252 70 L300 62',
  // Branches.
  'M58 108 L70 136 L64 180',
  'M92 92 L104 60 L96 22',
  'M170 82 L186 118 L220 140',
  'M252 70 L268 30 L262 0',
  'M28 98 L18 70',
];

const STROKE = 'fill="none" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"';

export const HATCH_CRACK_SVG: string =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 180" preserveAspectRatio="none" ' +
  'aria-hidden="true" focusable="false">' +
  CRACK_PATHS.map(
    (d) =>
      `<path d="${d}" stroke="#fff" stroke-opacity="0.7" stroke-width="3" ${STROKE}/>` +
      `<path d="${d}" stroke="#1a1a1a" stroke-width="1.5" ${STROKE}/>`,
  ).join('') +
  '</svg>';

/** A grey-green hand with a forearm, four fingers, a thumb and pale nails, out of a dark hole. */
export const HATCH_HAND_SVG: string =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 60" aria-hidden="true" focusable="false">' +
  // The hole it climbs out of.
  '<path d="M2 50 L8 44 L14 47 L20 42 L27 46 L34 43 L38 50 L33 57 L24 55 L16 58 L7 56 Z" fill="#0d0d0d"/>' +
  '<g stroke="#1f2a14" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">' +
  // Forearm with a torn sleeve.
  '<path d="M13 52 L15 34 L25 34 L27 52 Z" fill="#5e7d45"/>' +
  '<path d="M12 46 L16 42 L19 46 L23 41 L26 45 L28 49 L12 50 Z" fill="#4a3b2a"/>' +
  // Palm.
  '<path d="M11 34 Q10 24 14 20 L27 20 Q31 25 29 34 Z" fill="#6b8f4e"/>' +
  // Fingers, reaching up and out.
  '<path d="M13 21 L9 9 L12 8 L16 20" fill="#6b8f4e"/>' +
  '<path d="M17 20 L16 4 L19.5 4 L20.5 20" fill="#6b8f4e"/>' +
  '<path d="M21 20 L23 5 L26.5 6 L24.5 21" fill="#6b8f4e"/>' +
  '<path d="M25 21 L30 10 L33 12 L28 23" fill="#6b8f4e"/>' +
  // Thumb.
  '<path d="M28 30 L36 25 L37.5 28 L29 34" fill="#6b8f4e"/>' +
  '</g>' +
  // Nails.
  '<g fill="#d8d0b0">' +
  '<path d="M9 9 L10 6 L12 8 Z"/>' +
  '<path d="M16 4 L17.8 1 L19.5 4 Z"/>' +
  '<path d="M23 5 L25.5 2.5 L26.5 6 Z"/>' +
  '<path d="M30 10 L33.5 8.5 L33 12 Z"/>' +
  '<path d="M36 25 L39 24.5 L37.5 28 Z"/>' +
  '</g>' +
  '</svg>';
