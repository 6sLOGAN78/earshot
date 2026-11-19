import { Decoder, type DecoderEvent } from './sstv/decoder';

export type ToWorker =
  | { type: 'init'; sampleRate: number }
  | { type: 'audio'; data: Float32Array }
  | { type: 'manual'; modeId: string }
  | { type: 'stop' };

let dec: Decoder | null = null;
const post = (e: DecoderEvent) => {
  if (e.type === 'line') (self as unknown as Worker).postMessage(e, [e.rgba.buffer]);
  else (self as unknown as Worker).postMessage(e);
};

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  if (m.type === 'init') dec = new Decoder(m.sampleRate, post);
  else if (!dec) return;
  else if (m.type === 'audio') dec.push(m.data);
  else if (m.type === 'manual') dec.startManual(m.modeId);
  else if (m.type === 'stop') dec.stop();
};
