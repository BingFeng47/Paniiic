import { describe, expect, it } from 'vitest';
import { DESKTOP_COPY } from '../../src/desktop/copy';

// Exact strings from .kiro/specs/retro-shell/design.md ("DESKTOP_COPY").
describe('DESKTOP_COPY', () => {
  it('lists the desktop icons in column order (Req 5.2)', () => {
    expect(DESKTOP_COPY.icons).toEqual([
      { id: 'dialer', label: 'Connect to MidnightNet' },
      { id: 'readme', label: 'README.TXT' },
      { id: 'wastebasket', label: 'Wastebasket' },
    ]);
  });

  it('has the window titles (Req 5.7, 5.8)', () => {
    expect(DESKTOP_COPY.titles.readme).toBe('README.TXT - Jotter');
    expect(DESKTOP_COPY.titles.wastebasket).toBe('Wastebasket');
  });

  it('has the README text (Req 5.7, player-guide Req 1.4)', () => {
    expect(DESKTOP_COPY.readme).toBe(
      'Welcome to Phantom 98!\n' +
        '\n' +
        'Your mission:\n' +
        '  Get online and download HOMEWORK.ZIP before midnight.\n' +
        "  Don't let anything eat the modem.\n" +
        '\n' +
        'Controls:\n' +
        '  - Click zombies on the phone line to smash them.\n' +
        '  - Close pop-ups to keep the page clear.\n' +
        '  - Click the small grey link to start the download.\n' +
        '  - Press 1, 2, 3 to switch hammer, saw and flamer. Shift+1-3 buys upgrades.\n' +
        '\n' +
        'Weapons:\n' +
        '  HAMMER  hits hardest, one click at a time.\n' +
        '  E-SAW   hold it on a zombie. Steady, never misses.\n' +
        '  FLAMER  hold and sweep. Roasts crowds. Bosses barely notice.\n' +
        '\n' +
        'To get on the Internet:\n' +
        '  1. Double-click "Connect to MidnightNet".\n' +
        '  2. Click Connect.\n' +
        '  3. Wait while the modem talks to the other modem.\n' +
        '\n' +
        'If you hear scratching on the phone line, that is normal.\n' +
        'Everyone hears it.\n' +
        '\n' +
        '- The MidnightNet Team',
    );
  });

  it('has the wastebasket files and a matching object count (Req 5.8)', () => {
    expect(DESKTOP_COPY.wastebasket.files).toEqual([
      'resume_FINAL_final.doc',
      'old_modem_drv.zip',
      'DO_NOT_DIAL.TXT',
      'manhole_cover.bmp',
    ]);
    expect(DESKTOP_COPY.wastebasket.status).toBe('4 object(s)');
    expect(DESKTOP_COPY.wastebasket.status).toBe(
      `${DESKTOP_COPY.wastebasket.files.length} object(s)`,
    );
  });

  it('has the start menu items in order and the banner (Req 8.2)', () => {
    expect(DESKTOP_COPY.startMenu.banner).toBe('Phantom 98');
    expect(DESKTOP_COPY.startMenu.items.map((i) => i.id)).toEqual([
      'dialer',
      'readme',
      'wastebasket',
      'shutDown',
    ]);
    expect(DESKTOP_COPY.startMenu.items.map((i) => i.label)).toEqual([
      'Connect to MidnightNet',
      'README.TXT',
      'Wastebasket',
      'Shut Down...',
    ]);
  });

  it('has the Start label and the stuck clock (Req 7.5)', () => {
    expect(DESKTOP_COPY.start).toBe('Start');
    expect(DESKTOP_COPY.clock).toBe('11:59 PM');
  });
});
