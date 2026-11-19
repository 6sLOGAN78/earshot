import './style.css';
import { AudioEngine, type MicState } from './audio';
import { encode, toWav, type Encoded } from './sstv/encoder';
import { MODES, type Mode, modeById, totalMs } from './sstv/modes';
import { TEST_CARDS } from './testcards';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const engine = new AudioEngine();

// ---------- elements ----------
const modeSel = $<HTMLSelectElement>('mode');
const outputSel = $<HTMLSelectElement>('output');
const txCanvas = $<HTMLCanvasElement>('tx-canvas');
const txSheet = $('tx-sheet');
const txVeil = $('tx-veil');
const txRule = $('tx-rule');
const txHz = $<HTMLOutputElement>('tx-hz');
const sendBtn = $<HTMLButtonElement>('send');
const rxCanvas = $<HTMLCanvasElement>('rx-canvas');
const rxSheet = $('rx-sheet');
const rxRule = $('rx-rule');
const rxHz = $<HTMLOutputElement>('rx-hz');
const rxEmpty = $('rx-empty');
const listenBtn = $<HTMLButtonElement>('listen');
const saveBtn = $<HTMLButtonElement>('save');
const stopBtn = $<HTMLButtonElement>('stop');
const forceBtn = $<HTMLButtonElement>('force');
const stationDot = document.querySelector<HTMLElement>('.dot')!;
const stationText = $('station-text');
const logList = $<HTMLOListElement>('log');
const logEmpty = $('log-empty');

// ---------- state ----------
let mode: Mode = MODES[0];
let source: HTMLCanvasElement | HTMLImageElement | ImageBitmap = document.createElement('canvas');
let sourceName = 'Test card';
let encoded: Encoded | null = null;
let txStart = 0;
let txActive = false;
let rxMode: Mode | null = null;
let rxLines = 0;
let rxStarted: Date | null = null;
let rxHasPicture = false;
let listening = false;

for (const m of MODES) modeSel.add(new Option(`${m.name}`, m.id));

const fmtLen = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
};
const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function setSheetShape(sheet: HTMLElement, canvas: HTMLCanvasElement, m: Mode) {
  canvas.width = m.width;
  canvas.height = m.height;
  sheet.style.setProperty('--ar', `${m.width} / ${m.height}`);
  sheet.style.setProperty('--arn', String(m.width / m.height));
}

// ---------- transmit ----------
function renderSource() {
  setSheetShape(txSheet, txCanvas, mode);
  const g = txCanvas.getContext('2d')!;
  const sw = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const sh = 'naturalHeight' in source ? source.naturalHeight : source.height;
  // cover-crop to the mode's frame
  const scale = Math.max(mode.width / sw, mode.height / sh);
  const w = sw * scale, h = sh * scale;
  g.imageSmoothingQuality = 'high';
  g.drawImage(source, (mode.width - w) / 2, (mode.height - h) / 2, w, h);
  encoded = null;
  $('tx-frame').textContent = `${mode.width}×${mode.height}`;
  $('tx-length').textContent = fmtLen(totalMs(mode));
}

function drawCard(i: number) {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 512;
  TEST_CARDS[i].draw(c.getContext('2d')!, c.width, c.height);
  source = c;
  sourceName = TEST_CARDS[i].name;
  document.querySelectorAll('.sample').forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
  renderSource();
}

function buildSamples() {
  const row = $('samples');
  TEST_CARDS.forEach((card, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sample';
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', `Sample picture: ${card.name}`);
    b.title = card.name;
    const c = document.createElement('canvas');
    c.width = 112; c.height = 84;
    card.draw(c.getContext('2d')!, c.width, c.height);
    b.append(c);
    b.onclick = () => { if (!txActive) drawCard(i); };
    row.append(b);
  });
}

async function useFile(file: File) {
  if (!file.type.startsWith('image/')) return;
  try {
    source = await createImageBitmap(file);
    sourceName = file.name;
    document.querySelectorAll('.sample').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    renderSource();
  } catch {
    stationText.textContent = `Couldn't read ${file.name}. Try a JPEG or PNG.`;
  }
}

function getEncoded(fs: number) {
  if (!encoded || encoded.sampleRate !== fs) {
    const g = txCanvas.getContext('2d')!;
    encoded = encode(mode, g.getImageData(0, 0, mode.width, mode.height), fs);
  }
  return encoded;
}

function setTxUi(active: boolean) {
  txActive = active;
  sendBtn.textContent = active ? 'Stop sending' : 'Send out loud';
  sendBtn.classList.toggle('live', active);
  modeSel.disabled = active;
  txVeil.hidden = txRule.hidden = !active;
  if (!active) { txHz.textContent = '---- Hz'; txHz.toggleAttribute('data-idle', true); }
}

async function send() {
  if (txActive) { engine.stopTx(); setTxUi(false); return; }
  const ctx = await engine.ready();
  if (!listening && engine.source === 'loopback') startListening();
  const enc = getEncoded(ctx.sampleRate);
  txStart = engine.play(enc, outputSel.value === 'speaker', () => setTxUi(false));
  setTxUi(true);
  txHz.toggleAttribute('data-idle', false);
}

function tickTx() {
  if (!txActive || !encoded || !engine.ctx) return;
  const ms = (engine.ctx.currentTime - txStart) * 1000;
  const hz = ms < 0 ? 0 : encoded.hzPerMs[Math.min(encoded.hzPerMs.length - 1, Math.floor(ms))];
  txHz.textContent = `${Math.round(hz).toString().padStart(4, ' ')} Hz`;
  // which line is on air
  const starts = encoded.lineStartMs;
  let lo = 0, hi = starts.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (starts[mid] <= ms) lo = mid + 1; else hi = mid; }
  const pct = (lo / mode.height) * 100;
  txRule.style.top = `${pct}%`;
  txVeil.style.top = `${pct}%`;
}

function saveWav() {
  const fs = engine.ctx?.sampleRate ?? 48000;
  const enc = getEncoded(fs);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(toWav(enc.samples, fs));
  a.download = `earshot-${mode.id}-${sourceName.replace(/\W+/g, '-').toLowerCase()}.wav`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- receive ----------
function station(state: 'off' | 'on' | 'warn', text: string) {
  stationDot.dataset.state = state;
  stationText.textContent = text;
}

function showEmpty(title: string, body: string, button: string | null) {
  $('empty-title').textContent = title;
  $('empty-body').textContent = body;
  listenBtn.hidden = !button;
  if (button) listenBtn.textContent = button;
  rxEmpty.hidden = false;
}

function refreshStation() {
  const fs = engine.sampleRate ? ` · ${(engine.sampleRate / 1000).toFixed(1)} kHz` : '';
  if (engine.source === 'loopback') {
    station(listening ? 'on' : 'off', listening ? `Listening to this tab${fs}` : 'Not listening');
    if (!rxHasPicture && listening) showEmpty('Waiting for a picture', 'Press Send out loud. In this-tab mode the sound goes straight into the receiver, so nothing needs a microphone.', null);
    return;
  }
  const s: MicState = engine.micState;
  if (s === 'on') {
    station('on', `Microphone open${fs}`);
    if (!rxHasPicture) showEmpty('Waiting for a picture', 'Play a transmission near this device. A picture starts drawing as soon as its header tone is heard.', null);
  } else if (s === 'asking') station('warn', 'Asking for the microphone…');
  else if (s === 'blocked') {
    station('warn', 'Microphone blocked');
    showEmpty('The microphone is blocked', 'Allow it from the icon in the address bar and try again, or switch Listen to “This tab” to send and receive inside this page.', 'Try again');
  } else if (s === 'unsupported') {
    station('warn', 'No microphone access');
    showEmpty('This page can’t reach a microphone', 'Browsers only allow it over HTTPS or on localhost. Open the hosted version, or switch Listen to “This tab”.', null);
  } else station('off', 'Not listening');
}

async function startListening() {
  await engine.ready();
  listening = true;
  if (engine.source === 'mic') await engine.setSource('mic');
  refreshStation();
}

engine.onMicState = () => refreshStation();

function resetRxBoxes() {
  $('rx-line').textContent = '—';
}

function onStart(modeId: string, how: 'vis' | 'manual') {
  rxMode = modeById(modeId);
  rxLines = 0;
  rxStarted = new Date();
  rxHasPicture = true;
  setSheetShape(rxSheet, rxCanvas, rxMode);
  const g = rxCanvas.getContext('2d')!;
  g.fillStyle = '#e5d7b2';
  g.fillRect(0, 0, rxCanvas.width, rxCanvas.height);
  rxEmpty.hidden = true;
  rxRule.hidden = false;
  rxRule.style.top = '0%';
  $('rx-mode').textContent = rxMode.name + (how === 'manual' ? '*' : '');
  $('rx-mode').title = how === 'manual' ? 'Started without a header tone' : '';
  $('rx-started').textContent = fmtTime(rxStarted);
  $('rx-line').textContent = `0 / ${rxMode.height}`;
  saveBtn.disabled = true;
  stopBtn.disabled = false;
  forceBtn.disabled = true;
}

function onLine(y: number, rgba: Uint8ClampedArray) {
  if (!rxMode) return;
  const g = rxCanvas.getContext('2d')!;
  g.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, rxMode.width, 1), 0, y);
  rxLines = y + 1;
  rxRule.style.top = `${(rxLines / rxMode.height) * 100}%`;
  $('rx-line').textContent = `${rxLines} / ${rxMode.height}`;
}

function onEnd(reason: string, lines: number, quality: number) {
  rxRule.hidden = true;
  stopBtn.disabled = true;
  forceBtn.disabled = false;
  saveBtn.disabled = lines === 0;
  if (!rxMode) return;
  const total = rxMode.height;
  const kind = lines >= total && quality >= 0.5 ? 'received' : lines >= total * 0.1 ? 'partial' : 'void';
  fileStrip(kind, lines, total, reason);
}

function fileStrip(kind: 'received' | 'partial' | 'void', lines: number, total: number, reason: string) {
  const url = rxCanvas.toDataURL('image/png');
  const li = document.createElement('li');
  li.className = 'strip';
  const img = new Image();
  img.src = url; img.alt = `Received picture, ${lines} of ${total} lines`;
  const meta = document.createElement('div');
  meta.className = 'meta';
  const why = reason === 'lost' ? ' · signal lost' : reason === 'stopped' ? ' · stopped' : reason === 'interrupted' ? ' · cut off' : '';
  meta.textContent = `${fmtTime(rxStarted ?? new Date())} · ${rxMode!.name}\n${lines}/${total} lines${why}`;
  meta.style.whiteSpace = 'pre-line';
  const row = document.createElement('div');
  row.className = 'row';
  const stamp = document.createElement('span');
  stamp.className = 'stamp';
  stamp.dataset.s = kind;
  stamp.textContent = kind;
  const a = document.createElement('a');
  a.href = url;
  a.download = `earshot-${(rxStarted ?? new Date()).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
  a.textContent = 'Save';
  row.append(stamp, a);
  li.append(img, meta, row);
  logList.prepend(li);
  logEmpty.hidden = true;
}

function signalWord(rms: number, hz: number, state: string) {
  if (state === 'receiving') return rms > 0.01 ? ['Strong', 'good'] : rms > 0.002 ? ['Fair', 'good'] : ['Faint', 'bad'];
  if (rms < 0.001) return ['Quiet', ''];
  return hz > 1050 && hz < 2400 ? ['Tones', 'good'] : ['Noise', ''];
}

engine.onEvent = (e) => {
  if (e.type === 'line') onLine(e.y, e.rgba);
  else if (e.type === 'start') onStart(e.modeId, e.how);
  else if (e.type === 'end') onEnd(e.reason, e.lines, e.quality);
  else if (e.type === 'level') {
    const [word, tone] = signalWord(e.rms, e.hz, e.state);
    const sig = $('rx-signal');
    sig.textContent = word;
    sig.dataset.tone = tone;
    const audible = e.rms > 0.001 && e.hz > 1000 && e.hz < 2500;
    rxHz.textContent = audible ? `${Math.round(e.hz)} Hz` : '---- Hz';
    rxHz.toggleAttribute('data-idle', !audible);
    if (e.state === 'seeking') $('rx-line').textContent = 'Seeking sync';
  }
};

// ---------- waterfall ----------
const wf = $<HTMLCanvasElement>('wf');
const wfg = wf.getContext('2d', { alpha: false })!;
let wfBins: Uint8Array<ArrayBuffer> | null = null;
function sizeWaterfall() {
  const r = wf.parentElement!.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  wf.width = Math.max(1, Math.round(r.width * dpr));
  wf.height = Math.max(1, Math.round(r.height * dpr));
  wfg.fillStyle = '#efe4c8';
  wfg.fillRect(0, 0, wf.width, wf.height);
}
// paper → form blue → ink, the waterfall is printed rather than lit
const ramp = (() => {
  const stops: [number, number[]][] = [[0, [239, 228, 200]], [0.45, [222, 210, 180]], [0.72, [31, 78, 140]], [1, [27, 26, 23]]];
  const out = new Array<string>(256);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const [t0, c0] = stops[k], [t1, c1] = stops[k + 1];
    const u = (t - t0) / (t1 - t0);
    out[i] = `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * u)).join(',')})`;
  }
  return out;
})();
function drawWaterfall() {
  if (!engine.ctx || !engine.analyser) return;
  const an = engine.analyser;
  if (!wfBins || wfBins.length !== an.frequencyBinCount) wfBins = new Uint8Array(an.frequencyBinCount);
  an.getByteFrequencyData(wfBins);
  const step = Math.max(1, Math.round(window.devicePixelRatio || 1));
  wfg.drawImage(wf, -step, 0);
  const binHz = engine.ctx.sampleRate / an.fftSize;
  const H = wf.height, x = wf.width - step;
  for (let y = 0; y < H; y++) {
    const hz = 2500 - (y / H) * 1500;
    const v = wfBins[Math.round(hz / binHz)];
    wfg.fillStyle = ramp[v];
    wfg.fillRect(x, y, step, 1);
  }
}

// ---------- wiring ----------
modeSel.onchange = () => { mode = modeById(modeSel.value); renderSource(); };
sendBtn.onclick = send;
$('wav').onclick = saveWav;
$<HTMLInputElement>('pick').onchange = (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) useFile(f);
  (e.target as HTMLInputElement).value = '';
};
const drop = $('tx-drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); txSheet.classList.add('dragging'); });
drop.addEventListener('dragleave', () => txSheet.classList.remove('dragging'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  txSheet.classList.remove('dragging');
  const f = e.dataTransfer?.files[0];
  if (f && !txActive) useFile(f);
});
window.addEventListener('paste', (e) => {
  const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
  if (f && !txActive) useFile(f);
});

listenBtn.onclick = startListening;
stopBtn.onclick = () => { engine.cancelFile(); engine.stopRx(); };
forceBtn.onclick = async () => {
  await startListening();
  const m = modeById(modeSel.value);
  engine.manualStart(m.id);
  $('rx-mode').textContent = `${m.name}*`;
  $('rx-line').textContent = 'Seeking sync';
  stopBtn.disabled = false;
};
saveBtn.onclick = () => {
  const a = document.createElement('a');
  a.href = rxCanvas.toDataURL('image/png');
  a.download = `earshot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
  a.click();
};
$<HTMLInputElement>('rec').onchange = async (e) => {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = '';
  if (!f) return;
  try {
    station('on', `Decoding ${f.name}`);
    stopBtn.disabled = false;
    await engine.decodeFile(f, 6, () => refreshStation());
  } catch {
    station('warn', `Couldn't read ${f.name} as audio`);
  }
};

document.querySelectorAll<HTMLButtonElement>('.seg button').forEach((b) => {
  b.onclick = async () => {
    const src = b.dataset.src as 'mic' | 'loopback';
    document.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    listening = true;
    await engine.setSource(src);
    refreshStation();
  };
});

function frame() {
  tickTx();
  drawWaterfall();
  requestAnimationFrame(frame);
}

// ---------- boot ----------
setSheetShape(rxSheet, rxCanvas, mode);
resetRxBoxes();
txHz.toggleAttribute('data-idle', true);
rxHz.toggleAttribute('data-idle', true);
document.fonts.load('800 40px "Archivo Variable"').catch(() => {}).finally(() => { buildSamples(); drawCard(0); });
sizeWaterfall();
new ResizeObserver(sizeWaterfall).observe(wf.parentElement!);
requestAnimationFrame(frame);
