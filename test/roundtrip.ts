// Encode a synthetic image in every mode, damage the audio, decode it, and measure the result.
declare const process: { exit(code: number): never };
import { encode } from '../src/sstv/encoder';
import { Decoder, type DecoderEvent } from '../src/sstv/decoder';
import { MODES } from '../src/sstv/modes';

function testImage(w: number, h: number) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const bar = Math.floor((x / w) * 8);
    const top = y < h / 2;
    data[i] = top ? (bar & 1 ? 230 : 30) : (x / w) * 255;
    data[i + 1] = top ? (bar & 2 ? 230 : 30) : (y / h) * 255;
    data[i + 2] = top ? (bar & 4 ? 230 : 30) : 128;
    data[i + 3] = 255;
  }
  return { width: w, height: h, data };
}

function run(fs: number, noise: number, rateSkew: number, lead: number, minPsnr: number) {
  let failures = 0;
  for (const mode of MODES) {
    const img = testImage(mode.width, mode.height);
    const enc = encode(mode, img, fs);
    // simulate a sound card running slightly fast/slow: resample by rateSkew
    const n = Math.floor(enc.samples.length / rateSkew);
    const audio = new Float32Array(n + lead + fs);
    let seed = 1;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
    for (let i = 0; i < audio.length; i++) audio[i] = rnd() * noise;
    for (let i = 0; i < n; i++) {
      const t = i * rateSkew, i0 = Math.floor(t), fr = t - i0;
      audio[lead + i] += 0.5 * ((enc.samples[i0] ?? 0) * (1 - fr) + (enc.samples[i0 + 1] ?? 0) * fr);
    }
    const out = new Uint8ClampedArray(mode.width * mode.height * 4);
    const events: DecoderEvent[] = [];
    const dec = new Decoder(fs, (e) => {
      if (e.type === 'line') out.set(e.rgba, e.y * mode.width * 4);
      if (e.type !== 'level' && e.type !== 'line') events.push(e);
    });
    for (let i = 0; i < audio.length; i += 2048) dec.push(audio.subarray(i, i + 2048));
    let err = 0;
    for (let i = 0; i < out.length; i++) if (i % 4 !== 3) err += (out[i] - img.data[i]) ** 2;
    const mse = err / (mode.width * mode.height * 3);
    const psnr = 10 * Math.log10((255 * 255) / mse);
    const start = events.find((e) => e.type === 'start');
    const end = events.find((e) => e.type === 'end');
    const ok = start && 'modeId' in start && start.modeId === mode.id && end && 'reason' in end && end.reason === 'complete' && psnr > minPsnr;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${mode.name.padEnd(11)} fs=${fs} noise=${noise} skew=${rateSkew} psnr=${psnr.toFixed(1)}dB end=${end && 'reason' in end ? end.reason : '-'} sync=${end && 'quality' in end ? (end.quality * 100).toFixed(0) : '-'}%`);
  }
  return failures;
}

let f = 0;
f += run(48000, 0.0, 1, 4000, 25);
f += run(44100, 0.15, 1.0005, 12345, 15);
f += run(48000, 0.35, 0.9995, 777, 10);
process.exit(f ? 1 : 0);
