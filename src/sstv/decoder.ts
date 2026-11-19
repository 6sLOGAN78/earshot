import { yccToRgb } from './color';
import {
  F_LEADER, F_SYNC, F_VIS_ONE, F_VIS_ZERO, type Mode, hzToPixel, lineMs, modeById, modeByVis,
  preambleMs,
} from './modes';

export type DecoderEvent =
  | { type: 'start'; modeId: string; how: 'vis' | 'manual' }
  | { type: 'line'; y: number; rgba: Uint8ClampedArray; synced: boolean }
  | { type: 'end'; reason: 'complete' | 'lost' | 'stopped' | 'interrupted'; lines: number; quality: number }
  | { type: 'level'; hz: number; rms: number; state: 'listening' | 'seeking' | 'receiving' };

const RING = 1 << 20; // ~21 s at 48 kHz
const MASK = RING - 1;
const FC = 1900;

/** Complex-mix to baseband, low-pass, and read instantaneous frequency from the phase step. */
export class FmDemod {
  private taps: Float32Array;
  private bi: Float32Array;
  private bq: Float32Array;
  private pos = 0;
  private phase = 0;
  private step: number;
  private prevI = 0;
  private prevQ = 0;
  readonly delay: number;
  static windowMs = 1.2;
  static cutoffHz = 1500;
  constructor(private fs: number) {
    const n = Math.round(fs * FmDemod.windowMs / 1000) | 1;
    const cut = FmDemod.cutoffHz / fs;
    this.taps = new Float32Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const k = i - (n - 1) / 2;
      const sinc = k === 0 ? 2 * cut : Math.sin(2 * Math.PI * cut * k) / (Math.PI * k);
      const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
      this.taps[i] = sinc * win;
      sum += this.taps[i];
    }
    for (let i = 0; i < n; i++) this.taps[i] /= sum;
    this.bi = new Float32Array(n * 2);
    this.bq = new Float32Array(n * 2);
    this.delay = (n - 1) / 2;
    this.step = (2 * Math.PI * FC) / fs;
  }
  /** Returns [frequency Hz, magnitude] for one input sample. */
  push(x: number): [number, number] {
    const n = this.taps.length;
    this.phase += this.step;
    if (this.phase > Math.PI * 2) this.phase -= Math.PI * 2;
    const i0 = x * Math.cos(this.phase);
    const q0 = -x * Math.sin(this.phase);
    // Double-written circular buffer: a contiguous window always lives at [pos, pos+n).
    this.bi[this.pos] = this.bi[this.pos + n] = i0;
    this.bq[this.pos] = this.bq[this.pos + n] = q0;
    this.pos = (this.pos + 1) % n;
    let si = 0, sq = 0;
    const t = this.taps, bi = this.bi, bq = this.bq, p = this.pos;
    for (let k = 0; k < n; k++) { si += t[k] * bi[p + k]; sq += t[k] * bq[p + k]; }
    // arg(z[n] * conj(z[n-1]))
    const re = si * this.prevI + sq * this.prevQ;
    const im = sq * this.prevI - si * this.prevQ;
    this.prevI = si; this.prevQ = sq;
    const hz = FC + (Math.atan2(im, re) * this.fs) / (2 * Math.PI);
    return [hz, Math.hypot(si, sq)];
  }
}

interface Rx {
  mode: Mode;
  how: 'vis' | 'manual';
  t0: number; // sample index of line 0 start (estimate)
  line: number;
  fitI: number[];
  fitP: number[];
  missed: number;
  synced: number;
  chromaCr: Float32Array;
  chromaCb: Float32Array;
}

export class Decoder {
  private demod: FmDemod;
  private freq = new Float32Array(RING);
  private sync = new Uint8Array(RING); // 1 where the smoothed tone sits in the sync band
  private smAcc = 0;
  private smLen: number;
  private n = 0; // number of demodulated samples (aligned to input time)
  private inCount = 0;
  private spm: number; // samples per ms
  // VIS detector: per-millisecond mean frequency
  private bins = new Float32Array(1 << 12);
  private binCount = 0;
  private binAcc = 0;
  private binN = 0;
  private visBest: { score: number; bin: number; code: number; left: number } | null = null;
  private visHold = 0; // ignore VIS candidates until this bin (the same header matches for several ms)
  private rx: Rx | null = null;
  private seek: { mode: Mode; from: number } | null = null;
  private levelAcc = 0;
  private levelN = 0;

  constructor(private fs: number, private emit: (e: DecoderEvent) => void) {
    this.demod = new FmDemod(fs);
    this.spm = fs / 1000;
    this.smLen = Math.max(4, Math.round(fs * 0.0006));
  }

  get sampleRate() { return this.fs; }

  startManual(modeId: string) {
    this.finish('interrupted');
    this.seek = { mode: modeById(modeId), from: this.n };
  }

  stop() {
    this.seek = null;
    this.finish('stopped');
  }

  push(chunk: Float32Array) {
    const delay = this.demod.delay;
    for (let i = 0; i < chunk.length; i++) {
      const [hz] = this.demod.push(chunk[i]);
      this.inCount++;
      if (this.inCount <= delay) continue;
      this.freq[this.n & MASK] = hz;
      // moving average over ~0.6 ms, centred: mark the sample smLen/2 back
      this.smAcc += hz - (this.n >= this.smLen ? this.freq[(this.n - this.smLen) & MASK] : 0);
      const c = this.n - (this.smLen >> 1);
      if (c >= 0) this.sync[c & MASK] = Decoder.isSync(this.smAcc / this.smLen);
      this.n++;
      this.levelAcc += chunk[i] * chunk[i];
      this.levelN++;
            // per-ms bins for VIS
      this.binAcc += hz;
      this.binN++;
      if (this.n >= Math.floor((this.binCount + 1) * this.spm)) {
        this.bins[this.binCount & 4095] = this.binAcc / this.binN;
        this.binAcc = 0; this.binN = 0;
        this.binCount++;
        this.checkVis();
      }
    }
    if (this.levelN >= this.fs * 0.04) {
      const state = this.rx ? 'receiving' : this.seek ? 'seeking' : 'listening';
      this.emit({ type: 'level', hz: this.medianHz(10), rms: Math.sqrt(this.levelAcc / this.levelN), state });
      this.levelAcc = 0; this.levelN = 0;
    }
    this.runSeek();
    this.runLines();
  }

  private medianHz(ms: number) {
    const k = Math.min(this.binCount, ms);
    if (!k) return 0;
    const arr: number[] = [];
    for (let i = 1; i <= k; i++) arr.push(this.bins[(this.binCount - i) & 4095]);
    arr.sort((a, b) => a - b);
    return arr[arr.length >> 1];
  }

  private binMean(start: number, len: number) {
    let s = 0;
    for (let i = 0; i < len; i++) s += this.bins[(start + i) & 4095];
    return s / len;
  }

  private checkVis() {
    const k = this.binCount - 1; // last complete bin, candidate end of stop bit
    const S = k - 29; // first ms of stop bit
    const leaderStart = S - 270 - 300;
    if (leaderStart - 10 < 0 || k < this.visHold) return;
    let score = 0;
    const stop = this.binMean(S + 5, 20);
    const start = this.binMean(S - 270 + 5, 20);
    if (Math.abs(stop - F_SYNC) > 80 || Math.abs(start - F_SYNC) > 80) return this.visTick();
    score += Math.abs(stop - F_SYNC) + Math.abs(start - F_SYNC);
    let good = 0;
    for (let i = 0; i < 200; i += 10) if (Math.abs(this.binMean(leaderStart + 50 + i, 10) - F_LEADER) < 90) good++;
    if (good < 17) return this.visTick();
    score += Math.abs(this.binMean(leaderStart + 50, 200) - F_LEADER);
    let code = 0, ones = 0;
    for (let b = 0; b < 8; b++) {
      const f = this.binMean(S - (8 - b) * 30 + 5, 20);
      const d1 = Math.abs(f - F_VIS_ONE), d0 = Math.abs(f - F_VIS_ZERO);
      if (Math.min(d1, d0) > 90) return this.visTick();
      score += Math.min(d1, d0);
      const bit = d1 < d0 ? 1 : 0;
      ones += bit;
      if (b < 7) code |= bit << b;
    }
    if (ones % 2 !== 0 || !modeByVis(code)) return this.visTick();
    if (!this.visBest || score < this.visBest.score) this.visBest = { score, bin: k, code, left: this.visBest?.left ?? 15 };
    this.visTick();
  }

  private visTick() {
    if (!this.visBest) return;
    if (--this.visBest.left > 0) return;
    const { bin, code } = this.visBest;
    this.visBest = null;
    this.visHold = bin + 200;
    const mode = modeByVis(code)!;
    this.finish('interrupted');
    this.seek = null;
    const imageStart = (bin + 1) * this.spm + preambleMs(mode) * this.spm;
    this.begin(mode, imageStart, 'vis');
  }

  private begin(mode: Mode, t0: number, how: 'vis' | 'manual') {
    this.rx = {
      mode, how, t0, line: 0, fitI: [], fitP: [], missed: 0, synced: 0,
      chromaCr: new Float32Array(mode.width).fill(128),
      chromaCb: new Float32Array(mode.width).fill(128),
    };
    this.emit({ type: 'start', modeId: mode.id, how });
  }

  private finish(reason: 'complete' | 'lost' | 'stopped' | 'interrupted') {
    if (!this.rx) return;
    const rx = this.rx;
    this.rx = null;
    this.emit({ type: 'end', reason, lines: rx.line, quality: rx.line ? rx.synced / rx.line : 0 });
  }

  /** Is this frequency a sync tone? */
  private static isSync(hz: number) { return hz > 1000 && hz < 1350 ? 1 : 0; }

  /**
   * Best sync pulse of `len` samples starting within [from, to]. Scores both edges, because in
   * Robot and Martin modes the first sync runs straight on from the 1200 Hz VIS stop bit.
   */
  private findSync(from: number, to: number, len: number): { pos: number; q: number } {
    from = Math.floor(from); to = Math.floor(to);
    const lead = Math.round(len / 2);
    const a = from - lead, b = to + len;
    const b2 = b + lead;
    const pre = new Float32Array(b2 - a + 1);
    for (let i = a; i < b2; i++) pre[i - a + 1] = pre[i - a] + this.sync[i & MASK];
    const sum = (s: number, e: number) => pre[e - a] - pre[s - a];
    let best = -Infinity, pos = from;
    for (let p = from; p <= to; p++) {
      const inside = sum(p, p + len);
      const sc = inside - (sum(p + len, p + len + lead) * len) / lead - (0.5 * sum(p - lead, p) * len) / lead;
      if (sc > best) { best = sc; pos = p; }
    }
    return { pos, q: sum(pos, pos + len) / len };
  }

  private runSeek() {
    const s = this.seek;
    if (!s) return;
    const L = lineMs(s.mode) * this.spm;
    const len = Math.round(s.mode.syncMs * this.spm);
    while (this.seek && this.n - s.from > L + len * 2) {
      const r = this.findSync(s.from, s.from + L, len);
      if (r.q > 0.85) {
        this.seek = null;
        this.begin(s.mode, r.pos - s.mode.syncOffsetMs * this.spm, 'manual');
        return;
      }
      s.from += L;
    }
  }

  private fit(rx: Rx): ((i: number) => number) | null {
    const m = rx.fitI.length;
    if (m < 6) return null;
    const solve = (use: number[]) => {
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (const j of use) { const x = rx.fitI[j], y = rx.fitP[j]; sx += x; sy += y; sxx += x * x; sxy += x * y; }
      const k = use.length;
      const b = (k * sxy - sx * sy) / (k * sxx - sx * sx);
      const a = (sy - b * sx) / k;
      return [a, b];
    };
    let [a, b] = solve([...Array(m).keys()]);
    const keep = [...Array(m).keys()].filter((j) => Math.abs(a + b * rx.fitI[j] - rx.fitP[j]) < 1.5 * this.spm);
    if (keep.length >= 4) [a, b] = solve(keep);
    return (i) => a + b * i;
  }

  private runLines() {
    while (this.rx) {
      const rx = this.rx;
      const m = rx.mode;
      const L = lineMs(m) * this.spm;
      const syncOff = m.syncOffsetMs * this.spm;
      const len = Math.round(m.syncMs * this.spm);
      const fitted = this.fit(rx);
      let predicted: number;
      if (fitted) predicted = fitted(rx.line);
      else if (rx.fitI.length) {
        const j = rx.fitI.length - 1;
        predicted = rx.fitP[j] + (rx.line - rx.fitI[j]) * L;
      } else predicted = rx.t0 + syncOff + rx.line * L;
      const win = (rx.fitI.length < 3 ? 25 : 4) * this.spm;
      if (this.n < predicted + win + L + len) return; // wait for audio
      const r = this.findSync(predicted - win, predicted + win, len);
      const found = r.q > 0.5;
      if (found) {
        rx.fitI.push(rx.line); rx.fitP.push(r.pos);
        rx.synced++; rx.missed = 0;
      } else rx.missed++;
      const refit = this.fit(rx);
      const syncPos = refit && rx.fitI.length >= 8 ? refit(rx.line) : found ? r.pos : predicted;
      this.emit({ type: 'line', y: rx.line, rgba: this.readLine(rx, syncPos - syncOff), synced: found });
      rx.line++;
      if (rx.line >= m.height) this.finish('complete');
      else if (rx.missed >= 12) this.finish('lost');
    }
  }

  private avg(center: number, half: number) {
    const s = Math.round(center - half), e = Math.max(s + 1, Math.round(center + half));
    let acc = 0;
    for (let i = s; i < e; i++) {
      // FM clicks under noise throw single samples far out of band; clip them before averaging
      const f = this.freq[i & MASK];
      acc += f < 1400 ? 1400 : f > 2400 ? 2400 : f;
    }
    return acc / (e - s);
  }

  private readLine(rx: Rx, start: number): Uint8ClampedArray {
    const m = rx.mode;
    const W = m.width;
    const out = new Uint8ClampedArray(W * 4);
    const ch: Record<string, Float32Array> = {};
    let off = 0;
    let isCb = false;
    for (const seg of m.line) {
      const segStart = start + off * this.spm;
      if (seg.kind === 'tone') {
        if (m.color === 'robot' && seg.role === 'sep') isCb = this.avg(segStart + seg.ms * this.spm * 0.5, seg.ms * this.spm * 0.3) > 1900;
      } else {
        const px = seg.ms / seg.px * this.spm;
        const vals = new Float32Array(seg.px);
        for (let x = 0; x < seg.px; x++) vals[x] = hzToPixel(this.avg(segStart + (x + 0.5) * px, Math.max(0.5, px * 0.5)));
        // the next tone bleeds through the demod filter into the last pixel; repeat its neighbour
        if (seg.px > 2 && px < this.spm * 0.5) vals[seg.px - 1] = vals[seg.px - 2];
        ch[seg.ch] = vals;
      }
      off += seg.ms;
    }
    if (m.color === 'rgb') {
      for (let x = 0; x < W; x++) {
        out[x * 4] = ch.R[x]; out[x * 4 + 1] = ch.G[x]; out[x * 4 + 2] = ch.B[x]; out[x * 4 + 3] = 255;
      }
    } else {
      const c = ch.C;
      const target = isCb ? rx.chromaCb : rx.chromaCr;
      for (let x = 0; x < W; x++) target[x] = c[Math.min(c.length - 1, x >> 1)];
      for (let x = 0; x < W; x++) {
        const [r, g, b] = yccToRgb(ch.Y[x], rx.chromaCb[x], rx.chromaCr[x]);
        out[x * 4] = r; out[x * 4 + 1] = g; out[x * 4 + 2] = b; out[x * 4 + 3] = 255;
      }
    }
    return out;
  }
}
