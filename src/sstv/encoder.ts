import { rgbToYcc } from './color';
import {
  F_BLACK, F_LEADER, F_SYNC, F_VIS_ONE, F_VIS_ZERO, F_WHITE,
  type Mode, pixelToHz,
} from './modes';

export interface Pixels { width: number; height: number; data: Uint8ClampedArray }

export interface Encoded {
  samples: Float32Array;
  sampleRate: number;
  /** Instantaneous tone, one entry per millisecond, for live readouts. */
  hzPerMs: Float32Array;
  /** Start time of every image line, in ms from the start of the audio. */
  lineStartMs: Float64Array;
  durationMs: number;
}

class ToneWriter {
  private out: number[] = [];
  private phase = 0;
  private tMs = 0;
  private hzTrack: number[] = [];
  constructor(private fs: number, private amp: number) {}
  get ms() { return this.tMs; }
  tone(hz: number, ms: number) {
    const end = Math.round(((this.tMs + ms) * this.fs) / 1000);
    const step = (2 * Math.PI * hz) / this.fs;
    for (let i = this.out.length; i < end; i++) {
      this.phase += step;
      if (this.phase > Math.PI * 2) this.phase -= Math.PI * 2;
      this.out.push(Math.sin(this.phase) * this.amp);
    }
    const msEnd = Math.floor(this.tMs + ms);
    for (let m = this.hzTrack.length; m < msEnd; m++) this.hzTrack.push(hz);
    this.tMs += ms;
  }
  finish(): Float32Array {
    const s = Float32Array.from(this.out);
    const fade = Math.round(this.fs * 0.005);
    for (let i = 0; i < fade && i < s.length; i++) {
      s[i] *= i / fade;
      s[s.length - 1 - i] *= i / fade;
    }
    return s;
  }
  track() { return Float32Array.from(this.hzTrack); }
}

export function writeVis(w: ToneWriter, code: number) {
  w.tone(F_LEADER, 300);
  w.tone(F_SYNC, 10);
  w.tone(F_LEADER, 300);
  w.tone(F_SYNC, 30);
  let ones = 0;
  for (let b = 0; b < 7; b++) {
    const bit = (code >> b) & 1;
    ones += bit;
    w.tone(bit ? F_VIS_ONE : F_VIS_ZERO, 30);
  }
  w.tone(ones % 2 ? F_VIS_ONE : F_VIS_ZERO, 30); // even parity
  w.tone(F_SYNC, 30);
}

export function encode(mode: Mode, img: Pixels, sampleRate: number, amplitude = 0.7): Encoded {
  if (img.width !== mode.width || img.height !== mode.height) {
    throw new Error(`Image must be ${mode.width}×${mode.height}`);
  }
  const w = new ToneWriter(sampleRate, amplitude);
  writeVis(w, mode.vis);
  for (const p of mode.preamble) w.tone(p.hz, p.ms);

  const { data, width } = img;
  const px = (x: number, y: number, c: number) => data[(y * width + x) * 4 + c];
  const lineStartMs = new Float64Array(mode.height);

  for (let y = 0; y < mode.height; y++) {
    lineStartMs[y] = w.ms;
    const odd = y % 2 === 1;
    for (const seg of mode.line) {
      if (seg.kind === 'tone') {
        const hz = mode.color === 'robot' && seg.role === 'sep' ? (odd ? F_WHITE : F_BLACK) : seg.hz;
        w.tone(hz, seg.ms);
        continue;
      }
      const dt = seg.ms / seg.px;
      for (let x = 0; x < seg.px; x++) {
        let v: number;
        if (seg.ch === 'R') v = px(x, y, 0);
        else if (seg.ch === 'G') v = px(x, y, 1);
        else if (seg.ch === 'B') v = px(x, y, 2);
        else if (seg.ch === 'Y') v = rgbToYcc(px(x, y, 0), px(x, y, 1), px(x, y, 2))[0];
        else {
          // Robot 36 chroma: 2×2 average; even lines carry Cr, odd lines carry Cb.
          const y0 = odd ? y - 1 : y;
          const y1 = Math.min(y0 + 1, mode.height - 1);
          let acc = 0;
          for (const yy of [y0, y1]) for (const xx of [x * 2, x * 2 + 1]) {
            const ycc = rgbToYcc(px(xx, yy, 0), px(xx, yy, 1), px(xx, yy, 2));
            acc += odd ? ycc[1] : ycc[2];
          }
          v = acc / 4;
        }
        w.tone(pixelToHz(v), dt);
      }
    }
  }
  w.tone(F_BLACK, 20);
  return {
    samples: w.finish(), sampleRate, hzPerMs: w.track(), lineStartMs, durationMs: w.ms,
  };
}

/** 16-bit PCM mono WAV. */
export function toWav(samples: Float32Array, sampleRate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}
