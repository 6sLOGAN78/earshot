// SSTV mode definitions. All durations in milliseconds, frequencies in Hz.

export const F_SYNC = 1200;
export const F_BLACK = 1500;
export const F_WHITE = 2300;
export const F_LEADER = 1900;
export const F_VIS_ONE = 1100;
export const F_VIS_ZERO = 1300;

export type Channel = 'R' | 'G' | 'B' | 'Y' | 'C'; // C = Robot chroma (R-Y or B-Y, chosen by separator)

export type Segment =
  | { kind: 'tone'; ms: number; hz: number; role?: 'sync' | 'sep' }
  | { kind: 'scan'; ms: number; ch: Channel; px: number };

export interface Mode {
  id: string;
  name: string;
  vis: number;
  width: number;
  height: number;
  /** Tones sent once between the VIS stop bit and the first line. */
  preamble: { ms: number; hz: number }[];
  /** One line (for Robot 36, the separator tone is decided per line). */
  line: Segment[];
  /** Offset (ms) from line start to the leading edge of the sync pulse. */
  syncOffsetMs: number;
  syncMs: number;
  color: 'rgb' | 'robot';
}

const martin = (id: string, name: string, vis: number, scanMs: number): Mode => ({
  id, name, vis, width: 320, height: 256, preamble: [],
  line: [
    { kind: 'tone', ms: 4.862, hz: F_SYNC, role: 'sync' },
    { kind: 'tone', ms: 0.572, hz: F_BLACK },
    { kind: 'scan', ms: scanMs, ch: 'G', px: 320 },
    { kind: 'tone', ms: 0.572, hz: F_BLACK, role: 'sep' },
    { kind: 'scan', ms: scanMs, ch: 'B', px: 320 },
    { kind: 'tone', ms: 0.572, hz: F_BLACK, role: 'sep' },
    { kind: 'scan', ms: scanMs, ch: 'R', px: 320 },
    { kind: 'tone', ms: 0.572, hz: F_BLACK, role: 'sep' },
  ],
  syncOffsetMs: 0, syncMs: 4.862, color: 'rgb',
});

const scottie = (id: string, name: string, vis: number, scanMs: number): Mode => ({
  id, name, vis, width: 320, height: 256,
  preamble: [{ ms: 9, hz: F_SYNC }],
  line: [
    { kind: 'tone', ms: 1.5, hz: F_BLACK, role: 'sep' },
    { kind: 'scan', ms: scanMs, ch: 'G', px: 320 },
    { kind: 'tone', ms: 1.5, hz: F_BLACK, role: 'sep' },
    { kind: 'scan', ms: scanMs, ch: 'B', px: 320 },
    { kind: 'tone', ms: 9, hz: F_SYNC, role: 'sync' },
    { kind: 'tone', ms: 1.5, hz: F_BLACK },
    { kind: 'scan', ms: scanMs, ch: 'R', px: 320 },
  ],
  syncOffsetMs: 1.5 + scanMs + 1.5 + scanMs, syncMs: 9, color: 'rgb',
});

export const ROBOT36: Mode = {
  id: 'robot36', name: 'Robot 36', vis: 8, width: 320, height: 240, preamble: [],
  line: [
    { kind: 'tone', ms: 9, hz: F_SYNC, role: 'sync' },
    { kind: 'tone', ms: 3, hz: F_BLACK },
    { kind: 'scan', ms: 88, ch: 'Y', px: 320 },
    { kind: 'tone', ms: 4.5, hz: F_BLACK, role: 'sep' }, // 1500 = R-Y line, 2300 = B-Y line
    { kind: 'tone', ms: 1.5, hz: F_LEADER },
    { kind: 'scan', ms: 44, ch: 'C', px: 160 },
  ],
  syncOffsetMs: 0, syncMs: 9, color: 'robot',
};

export const MODES: Mode[] = [
  ROBOT36,
  martin('martin2', 'Martin M2', 40, 73.216),
  scottie('scottie2', 'Scottie S2', 56, 88.064),
  martin('martin1', 'Martin M1', 44, 146.432),
  scottie('scottie1', 'Scottie S1', 60, 138.24),
];

export const modeById = (id: string) => MODES.find((m) => m.id === id) ?? ROBOT36;
export const modeByVis = (vis: number) => MODES.find((m) => m.vis === vis);

export const lineMs = (m: Mode) => m.line.reduce((s, seg) => s + seg.ms, 0);
export const VIS_MS = 300 + 10 + 300 + 30 * 10;
export const preambleMs = (m: Mode) => m.preamble.reduce((s, p) => s + p.ms, 0);
export const totalMs = (m: Mode) => VIS_MS + preambleMs(m) + lineMs(m) * m.height;

export const pixelToHz = (v: number) => F_BLACK + (v / 255) * (F_WHITE - F_BLACK);
export const hzToPixel = (hz: number) => {
  const v = ((hz - F_BLACK) / (F_WHITE - F_BLACK)) * 255;
  return v < 0 ? 0 : v > 255 ? 255 : v;
};
