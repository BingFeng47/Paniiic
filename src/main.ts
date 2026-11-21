// Entry point. Scenes are added by the specs in .kiro/specs/.
const screenEl = document.getElementById('screen');
if (!screenEl) throw new Error('Missing #screen element in index.html');
screenEl.textContent = 'Kiroween: scaffold ready.';

export {};
