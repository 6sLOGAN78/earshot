// BT.601 studio-swing YCbCr, the convention Robot 36 encoders use.

export function rgbToYcc(r: number, g: number, b: number): [number, number, number] {
  const y = 16 + (65.481 * r + 128.553 * g + 24.966 * b) / 255;
  const cb = 128 + (-37.797 * r - 74.203 * g + 112.0 * b) / 255;
  const cr = 128 + (112.0 * r - 93.786 * g - 18.214 * b) / 255;
  return [y, cb, cr];
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

export function yccToRgb(y: number, cb: number, cr: number): [number, number, number] {
  const yy = 1.164 * (y - 16);
  const u = cb - 128;
  const v = cr - 128;
  return [clamp(yy + 1.596 * v), clamp(yy - 0.392 * u - 0.813 * v), clamp(yy + 2.017 * u)];
}
