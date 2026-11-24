// Mission_Note (player-guide Req 1.1-1.3).
import { describe, expect, it } from 'vitest';
import { createMissionNote } from '../../src/desktop/missionNote';
import { GUIDE_COPY } from '../../src/ui/guideCopy';

describe('createMissionNote', () => {
  it('shows the objective text as plain text', () => {
    const note = createMissionNote();
    expect(note.className).toBe('mission-note');
    expect(GUIDE_COPY.missionNote).toBe(
      "Get online. Download HOMEWORK.ZIP before midnight. Don't let anything eat the modem.",
    );
    expect(note.querySelector('.mission-note-text')?.textContent).toBe(GUIDE_COPY.missionNote);
    expect(note.querySelector('.mission-note-pin')).not.toBeNull();
  });
});
