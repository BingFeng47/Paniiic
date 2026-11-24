/** Camera clock: 11-23-98 11:59:00 PM at tick 0, one second per 60 ticks. Pure. */

const BASE_SECONDS = 23 * 3600 + 59 * 60;
const DAY_SECONDS = 86_400;
const TICKS_PER_SECOND = 60;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "11-23-98 11:59:07 PM" for tick 420; "11-24-98 12:00:00 AM" for tick 3600. */
export function cameraTimestamp(tick: number): string {
  const total = BASE_SECONDS + Math.floor(Math.max(0, tick) / TICKS_PER_SECOND);
  const day = 23 + Math.floor(total / DAY_SECONDS);
  const secOfDay = total % DAY_SECONDS;
  const h24 = Math.floor(secOfDay / 3600);
  const m = Math.floor((secOfDay % 3600) / 60);
  const s = secOfDay % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const ampm = h24 < 12 ? 'AM' : 'PM';
  return `11-${pad2(day)}-98 ${pad2(h12)}:${pad2(m)}:${pad2(s)} ${ampm}`;
}
