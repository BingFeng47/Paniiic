/**
 * Every string the connection lane shows (Req 12.4). Dry modem-status wording with the horror
 * leaking through, per the `retro-copy` steering file. Set only through `textContent`.
 */
export const LANE_COPY = {
  integrityLabel: 'MODEM',
  percentSuffix: '%',
  criticalNote: 'Line noise detected. Something is chewing the cable.',
  canvasLabel: 'Phone line',
  /** Label rising from a collected data packet (juice-and-endings Req 4.3). */
  kbLabel: (kb: number): string => `+${kb} KB`,
  /** Security-camera on-screen display (lane-cctv Req 2.6). */
  cctv: {
    label: 'CAM 01  LINE TAP',
    rec: '● REC',
    connecting: 'CONNECTING CAMERA...',
    signalWeak: 'SIGNAL WEAK',
    motion: 'MOTION',
    /** Feed cut when the modem dies (juice-and-endings Req 7.1). */
    noSignal: 'NO SIGNAL',
    /** Kill chain on the OSD (pacing-and-economy Req 5.5), e.g. "COMBO x3 +1 KB". */
    combo: (count: number, bonusKb: number): string => `COMBO x${count} +${bonusKb} KB`,
  },
} as const;
