import { describe, expect, it } from 'vitest';
import { DESKTOP_COPY } from '../../src/desktop/copy';
import { readmeContent, wastebasketContent } from '../../src/desktop/textWindow';

/** True when every child node of `el` is a Text node (no element was parsed from the string). */
const onlyText = (el: Element) =>
  [...el.childNodes].every((n) => n.nodeType === Node.TEXT_NODE) && el.children.length === 0;

describe('readmeContent', () => {
  // Req 5.7
  it('is a pre.text-doc with the README text', () => {
    const el = readmeContent();
    expect(el.tagName).toBe('PRE');
    expect(el.className).toBe('text-doc');
    expect(el.textContent).toBe(DESKTOP_COPY.readme);
  });

  it('keeps line breaks, blank lines and indentation exactly', () => {
    const text = readmeContent().textContent!;
    expect(text.split('\n')).toEqual(DESKTOP_COPY.readme.split('\n'));
    expect(text).toContain('\n\n');
    expect(text).toContain('\n  1. Double-click "Connect to MidnightNet".');
    expect(text.startsWith('Welcome to Phantom 98!')).toBe(true);
  });

  // Req 14.4: text is set through textContent, never parsed as markup
  it('holds a single text node and no element children', () => {
    const el = readmeContent();
    expect(el.children).toHaveLength(0);
    expect(el.childNodes).toHaveLength(1);
    expect(el.firstChild?.nodeType).toBe(Node.TEXT_NODE);
  });

  it('returns a fresh element on every call', () => {
    expect(readmeContent()).not.toBe(readmeContent());
  });
});

describe('wastebasketContent', () => {
  // Req 5.8
  it('lists the files in copy order with a file icon each and the status bar', () => {
    const el = wastebasketContent();
    expect(el.className).toBe('file-view');
    const rows = [...el.querySelectorAll('.file-list > .file-row')];
    expect(rows).toHaveLength(DESKTOP_COPY.wastebasket.files.length);
    expect(rows.map((r) => r.querySelector('.file-name')?.textContent)).toEqual(
      DESKTOP_COPY.wastebasket.files,
    );
    expect(rows.map((r) => r.querySelector('.file-name')?.textContent)).toEqual([
      'resume_FINAL_final.doc',
      'old_modem_drv.zip',
      'DO_NOT_DIAL.TXT',
      'manhole_cover.bmp',
    ]);
    for (const r of rows) {
      expect(r.querySelectorAll(':scope > span.icon')).toHaveLength(1);
      expect(r.querySelector(':scope > span.icon[data-icon="file"]')).not.toBeNull();
      // Icon comes before the name.
      expect(r.firstElementChild?.classList.contains('icon')).toBe(true);
    }
    const status = el.querySelector('.status-bar > .status-bar-field');
    expect(status?.textContent).toBe(DESKTOP_COPY.wastebasket.status);
    expect(status?.textContent).toBe('4 object(s)');
  });

  // Req 14.4
  it('sets file names and the status through text nodes only', () => {
    const el = wastebasketContent();
    const names = [...el.querySelectorAll('.file-name')];
    expect(names.length).toBeGreaterThan(0);
    expect(names.every(onlyText)).toBe(true);
    expect(onlyText(el.querySelector('.status-bar-field')!)).toBe(true);
  });
});
