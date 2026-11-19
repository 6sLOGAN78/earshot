import type { DecoderEvent } from './sstv/decoder';
import type { ToWorker } from './decoder.worker';
import type { Encoded } from './sstv/encoder';

export type InputSource = 'mic' | 'loopback';
export type MicState = 'off' | 'asking' | 'on' | 'blocked' | 'unsupported';

/**
 * Owns the audio graph:
 *   mic ──► micGain ─┐
 *                    ├─► bus ─► tap worklet ─► decoder worker
 *   tx  ──► loopGain ┘     └─► analyser (waterfall)
 *   tx  ──► speaker ─► destination
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  analyser!: AnalyserNode;
  private bus!: GainNode;
  private micGain!: GainNode;
  private loopGain!: GainNode;
  private speaker!: GainNode;
  private micStream: MediaStream | null = null;
  private micNode: MediaStreamAudioSourceNode | null = null;
  private worker: Worker;
  private tx: AudioBufferSourceNode | null = null;
  private feedingFile = false;
  private fileTimer = 0;
  source: InputSource = 'mic';
  micState: MicState = 'off';
  onEvent: (e: DecoderEvent) => void = () => {};
  onMicState: (s: MicState) => void = () => {};

  constructor() {
    this.worker = new Worker(new URL('./decoder.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<DecoderEvent>) => this.onEvent(ev.data);
  }

  private send(m: ToWorker, transfer: Transferable[] = []) { this.worker.postMessage(m, transfer); }

  /** Must run inside a user gesture the first time. */
  async ready(): Promise<AudioContext> {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return this.ctx;
    }
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}tap-worklet.js`);
    this.bus = ctx.createGain();
    this.micGain = ctx.createGain();
    this.loopGain = ctx.createGain();
    this.speaker = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 4096;
    this.analyser.smoothingTimeConstant = 0.2;
    this.analyser.minDecibels = -78;
    this.analyser.maxDecibels = -18;
    const tap = new AudioWorkletNode(ctx, 'earshot-tap', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
    tap.port.onmessage = (ev: MessageEvent<Float32Array>) => {
      if (!this.feedingFile) this.send({ type: 'audio', data: ev.data }, [ev.data.buffer]);
    };
    const sink = ctx.createGain();
    sink.gain.value = 0; // keeps the tap pulled by the graph without making sound
    this.micGain.connect(this.bus);
    this.loopGain.connect(this.bus);
    this.bus.connect(tap).connect(sink).connect(ctx.destination);
    this.bus.connect(this.analyser);
    this.speaker.connect(ctx.destination);
    this.send({ type: 'init', sampleRate: ctx.sampleRate });
    this.applySource();
    return ctx;
  }

  get sampleRate() { return this.ctx?.sampleRate ?? 0; }

  private setMic(s: MicState) { this.micState = s; this.onMicState(s); }

  async setSource(src: InputSource) {
    this.source = src;
    await this.ready();
    if (src === 'mic' && !this.micStream) await this.openMic();
    this.applySource();
  }

  private applySource() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.micGain.gain.setValueAtTime(this.source === 'mic' ? 1 : 0, t);
    this.loopGain.gain.setValueAtTime(this.source === 'loopback' ? 1 : 0, t);
  }

  async openMic() {
    if (!navigator.mediaDevices?.getUserMedia) { this.setMic('unsupported'); return; }
    this.setMic('asking');
    try {
      // Voice processing would flatten the tones, so all of it is off.
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      });
      this.micNode = this.ctx!.createMediaStreamSource(this.micStream);
      this.micNode.connect(this.micGain);
      this.setMic('on');
    } catch {
      this.setMic('blocked');
    }
  }

  play(enc: Encoded, speakerOn: boolean, onEnd: () => void): number {
    const ctx = this.ctx!;
    this.stopTx();
    const buf = ctx.createBuffer(1, enc.samples.length, enc.sampleRate);
    buf.copyToChannel(enc.samples as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    this.speaker.gain.setValueAtTime(speakerOn ? 1 : 0, ctx.currentTime);
    src.connect(this.speaker);
    src.connect(this.loopGain);
    src.onended = () => { if (this.tx === src) this.tx = null; onEnd(); };
    const at = ctx.currentTime + 0.05;
    src.start(at);
    this.tx = src;
    return at;
  }

  stopTx() {
    const t = this.tx;
    this.tx = null;
    if (t) { t.onended = null; try { t.stop(); } catch { /* already stopped */ } }
  }

  manualStart(modeId: string) { this.send({ type: 'manual', modeId }); }
  stopRx() { this.send({ type: 'stop' }); }

  /** Feeds a recording to the decoder at `speed`× real time, pausing live input meanwhile. */
  async decodeFile(file: File, speed: number, onDone: () => void) {
    const ctx = await this.ready();
    const audio = await ctx.decodeAudioData(await file.arrayBuffer());
    const data = audio.getChannelData(0);
    this.cancelFile();
    this.feedingFile = true;
    let pos = 0;
    const tickMs = 25;
    const per = Math.round((ctx.sampleRate * tickMs * speed) / 1000);
    this.fileTimer = window.setInterval(() => {
      const end = Math.min(data.length, pos + per);
      const chunk = data.slice(pos, end);
      this.send({ type: 'audio', data: chunk }, [chunk.buffer]);
      pos = end;
      if (pos >= data.length) {
        // a second of silence flushes the last line through the decoder
        const tail = new Float32Array(ctx.sampleRate);
        this.send({ type: 'audio', data: tail }, [tail.buffer]);
        this.cancelFile();
        onDone();
      }
    }, tickMs);
  }

  cancelFile() {
    if (this.fileTimer) clearInterval(this.fileTimer);
    this.fileTimer = 0;
    this.feedingFile = false;
  }

  get decodingFile() { return this.feedingFile; }
}
