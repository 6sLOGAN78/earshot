// Authored sample pictures, drawn in code so the app ships with no stock imagery.

export interface TestCard { id: string; name: string; draw: (g: CanvasRenderingContext2D, w: number, h: number) => void }

const card: TestCard = {
  id: 'card', name: 'Test card',
  draw(g, w, h) {
    const bars = ['#f0f0f0', '#e8e020', '#20d0e0', '#20c040', '#d030c0', '#e03030', '#2040d0', '#101010'];
    const bw = w / bars.length;
    bars.forEach((c, i) => { g.fillStyle = c; g.fillRect(i * bw, 0, Math.ceil(bw), h * 0.58); });
    for (let i = 0; i < 8; i++) {
      const v = Math.round((i / 7) * 255);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(i * bw, h * 0.58, Math.ceil(bw), h * 0.14);
    }
    g.fillStyle = '#1f4e8c';
    g.fillRect(0, h * 0.72, w, h * 0.28);
    g.strokeStyle = '#efe4c8';
    g.lineWidth = Math.max(2, w / 160);
    g.beginPath(); g.arc(w / 2, h * 0.42, h * 0.3, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(w / 2, h * 0.08); g.lineTo(w / 2, h * 0.76); g.moveTo(w * 0.26, h * 0.42); g.lineTo(w * 0.74, h * 0.42); g.stroke();
    g.fillStyle = '#efe4c8';
    g.font = `800 ${Math.round(h * 0.15)}px "Archivo Variable", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('EARSHOT', w / 2, h * 0.865);
  },
};

const dusk: TestCard = {
  id: 'dusk', name: 'Harbour at dusk',
  draw(g, w, h) {
    const horizon = h * 0.62;
    const sky = g.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#1b2350'); sky.addColorStop(0.55, '#b0486a'); sky.addColorStop(1, '#f2a65a');
    g.fillStyle = sky; g.fillRect(0, 0, w, horizon);
    g.fillStyle = '#ffd98a';
    g.beginPath(); g.arc(w * 0.66, horizon, h * 0.11, Math.PI, 0); g.fill();
    const sea = g.createLinearGradient(0, horizon, 0, h);
    sea.addColorStop(0, '#5a3a62'); sea.addColorStop(1, '#141a33');
    g.fillStyle = sea; g.fillRect(0, horizon, w, h - horizon);
    g.fillStyle = '#ffcf7d';
    for (let i = 0; i < 9; i++) {
      const y = horizon + 4 + i * (h * 0.035);
      const half = (w * 0.09) * (1 - i / 11);
      g.fillRect(w * 0.66 - half, y, half * 2, Math.max(1, h * 0.008));
    }
    // breakwater and lighthouse, flat silhouettes
    g.fillStyle = '#0c0f1f';
    g.fillRect(0, horizon - h * 0.02, w * 0.36, h * 0.05);
    g.beginPath();
    g.moveTo(w * 0.17, horizon - h * 0.02); g.lineTo(w * 0.19, horizon - h * 0.36);
    g.lineTo(w * 0.23, horizon - h * 0.36); g.lineTo(w * 0.25, horizon - h * 0.02); g.fill();
    g.fillStyle = '#ffe9a8';
    g.fillRect(w * 0.19, horizon - h * 0.42, w * 0.04, h * 0.06);
    g.fillStyle = '#0c0f1f';
    g.fillRect(w * 0.185, horizon - h * 0.44, w * 0.05, h * 0.02);
  },
};

const flags: TestCard = {
  id: 'flags', name: 'Signal flags',
  draw(g, w, h) {
    g.fillStyle = '#efe4c8'; g.fillRect(0, 0, w, h);
    const cols = 4, rows = 3, pad = w * 0.03;
    const cw = (w - pad * (cols + 1)) / cols, ch = (h - pad * (rows + 1)) / rows;
    const R = '#c8321e', Y = '#f2c230', B = '#1f4e8c', K = '#1b1a17', W = '#fbf7ec';
    const designs: ((x: number, y: number) => void)[] = [
      (x, y) => { g.fillStyle = Y; g.fillRect(x, y, cw, ch); g.fillStyle = R; g.beginPath(); g.moveTo(x, y); g.lineTo(x + cw, y); g.lineTo(x, y + ch); g.fill(); },
      (x, y) => { g.fillStyle = B; g.fillRect(x, y, cw, ch); g.fillStyle = W; g.fillRect(x + cw / 3, y + ch / 3, cw / 3, ch / 3); },
      (x, y) => { for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? W : B; g.fillRect(x, y + (i * ch) / 5, cw, ch / 5 + 1); } },
      (x, y) => { g.fillStyle = W; g.fillRect(x, y, cw, ch); g.fillStyle = R; g.fillRect(x + cw * 0.4, y, cw * 0.2, ch); g.fillRect(x, y + ch * 0.4, cw, ch * 0.2); },
      (x, y) => { g.fillStyle = Y; g.fillRect(x, y, cw, ch); g.fillStyle = K; g.beginPath(); g.arc(x + cw / 2, y + ch / 2, Math.min(cw, ch) * 0.3, 0, 7); g.fill(); },
      (x, y) => { g.fillStyle = R; g.fillRect(x, y, cw / 2, ch); g.fillStyle = W; g.fillRect(x + cw / 2, y, cw / 2, ch); },
      (x, y) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? K : W; g.fillRect(x + (i * cw) / 4, y + (j * ch) / 4, cw / 4 + 1, ch / 4 + 1); } },
      (x, y) => { g.fillStyle = B; g.fillRect(x, y, cw, ch); g.fillStyle = Y; g.beginPath(); g.moveTo(x + cw / 2, y); g.lineTo(x + cw, y + ch / 2); g.lineTo(x + cw / 2, y + ch); g.lineTo(x, y + ch / 2); g.fill(); },
      (x, y) => { g.fillStyle = W; g.fillRect(x, y, cw, ch); g.fillStyle = B; g.fillRect(x + cw * 0.2, y + ch * 0.2, cw * 0.6, ch * 0.6); g.fillStyle = R; g.fillRect(x + cw * 0.4, y + ch * 0.4, cw * 0.2, ch * 0.2); },
      (x, y) => { g.fillStyle = Y; g.fillRect(x, y, cw, ch / 2); g.fillStyle = R; g.fillRect(x, y + ch / 2, cw, ch / 2); },
      (x, y) => { g.fillStyle = K; g.fillRect(x, y, cw, ch); g.fillStyle = Y; g.beginPath(); g.moveTo(x, y); g.lineTo(x + cw, y + ch); g.lineTo(x + cw, y + ch * 0.75); g.lineTo(x + cw * 0.25, y); g.fill(); },
      (x, y) => { g.fillStyle = R; g.fillRect(x, y, cw, ch); g.fillStyle = W; g.beginPath(); g.moveTo(x + cw * 0.15, y + ch * 0.15); g.lineTo(x + cw * 0.85, y + ch * 0.85); g.lineWidth = cw * 0.12; g.strokeStyle = W; g.stroke(); },
    ];
    designs.forEach((d, i) => d(pad + (i % cols) * (cw + pad), pad + Math.floor(i / cols) * (ch + pad)));
  },
};

export const TEST_CARDS = [card, dusk, flags];
