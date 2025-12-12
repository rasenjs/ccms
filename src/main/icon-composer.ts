import fs from 'fs';
import path from 'path';
import { nativeImage, type NativeImage } from 'electron';
import { PNG } from 'pngjs';

type Rgba = { r: number; g: number; b: number; a: number };
type RgbaBuf = Uint8Array<ArrayBufferLike>;

function readPngFile(filePath: string): PNG {
  const buf = fs.readFileSync(filePath);
  return PNG.sync.read(buf);
}

function toPngBuffer(png: PNG): Buffer {
  return PNG.sync.write(png);
}

function resizeRgbaBilinear(src: Uint8Array, srcW: number, srcH: number, dstW: number, dstH: number): Uint8Array {
  if (dstW === srcW && dstH === srcH) return Uint8Array.from(src);

  const dst = new Uint8Array(dstW * dstH * 4);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;

  for (let y = 0; y < dstH; y++) {
    const sy = (y + 0.5) * yRatio - 0.5;
    const y0 = Math.max(0, Math.min(srcH - 1, Math.floor(sy)));
    const y1 = Math.max(0, Math.min(srcH - 1, y0 + 1));
    const wy = sy - y0;

    for (let x = 0; x < dstW; x++) {
      const sx = (x + 0.5) * xRatio - 0.5;
      const x0 = Math.max(0, Math.min(srcW - 1, Math.floor(sx)));
      const x1 = Math.max(0, Math.min(srcW - 1, x0 + 1));
      const wx = sx - x0;

      const i00 = (y0 * srcW + x0) * 4;
      const i10 = (y0 * srcW + x1) * 4;
      const i01 = (y1 * srcW + x0) * 4;
      const i11 = (y1 * srcW + x1) * 4;

      const di = (y * dstW + x) * 4;

      for (let c = 0; c < 4; c++) {
        const v00 = src[i00 + c];
        const v10 = src[i10 + c];
        const v01 = src[i01 + c];
        const v11 = src[i11 + c];

        const v0 = v00 + (v10 - v00) * wx;
        const v1 = v01 + (v11 - v01) * wx;
        const v = v0 + (v1 - v0) * wy;
        dst[di + c] = Math.max(0, Math.min(255, Math.round(v)));
      }
    }
  }

  return dst;
}

function resizeRgbaContainSquare(
  src: Uint8Array,
  srcW: number,
  srcH: number,
  dstSize: number
): Uint8Array {
  const size = Math.max(1, Math.round(dstSize));
  const out = new Uint8Array(size * size * 4);
  out.fill(0);

  if (srcW <= 0 || srcH <= 0) return out;

  const scale = Math.min(size / srcW, size / srcH);
  const dw = Math.max(1, Math.round(srcW * scale));
  const dh = Math.max(1, Math.round(srcH * scale));
  const dx = Math.round((size - dw) / 2);
  const dy = Math.round((size - dh) / 2);

  const resized = resizeRgbaBilinear(src, srcW, srcH, dw, dh);
  // Copy (no blending needed; destination is empty)
  for (let y = 0; y < dh; y++) {
    const oy = dy + y;
    if (oy < 0 || oy >= size) continue;
    for (let x = 0; x < dw; x++) {
      const ox = dx + x;
      if (ox < 0 || ox >= size) continue;
      const si = (y * dw + x) * 4;
      const di = (oy * size + ox) * 4;
      out[di] = resized[si];
      out[di + 1] = resized[si + 1];
      out[di + 2] = resized[si + 2];
      out[di + 3] = resized[si + 3];
    }
  }

  return out;
}

function boxBlurAlpha(rgba: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const r = Math.max(0, Math.floor(radius));
  if (r === 0) return rgba;

  // Horizontal pass
  const tmp = new Uint8Array(rgba.length);
  tmp.set(rgba);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let count = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= w) continue;
        sum += rgba[(y * w + xx) * 4 + 3];
        count++;
      }
      const i = (y * w + x) * 4;
      tmp[i + 3] = Math.round(sum / Math.max(1, count));
      // keep RGB as-is
      tmp[i] = rgba[i];
      tmp[i + 1] = rgba[i + 1];
      tmp[i + 2] = rgba[i + 2];
    }
  }

  // Vertical pass
  const out = new Uint8Array(rgba.length);
  out.set(tmp);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let count = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= h) continue;
        sum += tmp[(yy * w + x) * 4 + 3];
        count++;
      }
      const i = (y * w + x) * 4;
      out[i + 3] = Math.round(sum / Math.max(1, count));
      out[i] = tmp[i];
      out[i + 1] = tmp[i + 1];
      out[i + 2] = tmp[i + 2];
    }
  }

  return out;
}

function alphaBlendOver(base: PNG, overlayRgba: Uint8Array, overlayW: number, overlayH: number, dx: number, dy: number) {
  const bw = base.width;
  const bh = base.height;

  for (let y = 0; y < overlayH; y++) {
    const by = dy + y;
    if (by < 0 || by >= bh) continue;

    for (let x = 0; x < overlayW; x++) {
      const bx = dx + x;
      if (bx < 0 || bx >= bw) continue;

      const oi = (y * overlayW + x) * 4;
      const bi = (by * bw + bx) * 4;

      const or = overlayRgba[oi];
      const og = overlayRgba[oi + 1];
      const ob = overlayRgba[oi + 2];
      const oa = overlayRgba[oi + 3] / 255;
      if (oa <= 0) continue;

      const br = base.data[bi];
      const bg = base.data[bi + 1];
      const bb = base.data[bi + 2];
      const ba = base.data[bi + 3] / 255;

      const outA = oa + ba * (1 - oa);
      const outR = (or * oa + br * ba * (1 - oa)) / (outA || 1);
      const outG = (og * oa + bg * ba * (1 - oa)) / (outA || 1);
      const outB = (ob * oa + bb * ba * (1 - oa)) / (outA || 1);

      base.data[bi] = Math.round(outR);
      base.data[bi + 1] = Math.round(outG);
      base.data[bi + 2] = Math.round(outB);
      base.data[bi + 3] = Math.round(outA * 255);
    }
  }
}

function clamp255(n: number) {
  return Math.max(0, Math.min(255, n));
}

function colorDistSq(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function estimateBackgroundColor(rgba: Uint8Array, w: number, h: number): { r: number; g: number; b: number } {
  const samples: Array<{ r: number; g: number; b: number }> = [];
  const points = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
    [Math.floor(w / 2), 0],
    [Math.floor(w / 2), h - 1],
    [0, Math.floor(h / 2)],
    [w - 1, Math.floor(h / 2)],
  ];
  for (const [x, y] of points) {
    const i = (y * w + x) * 4;
    samples.push({ r: rgba[i], g: rgba[i + 1], b: rgba[i + 2] });
  }
  const sum = samples.reduce(
    (acc, c) => ({ r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b }),
    { r: 0, g: 0, b: 0 }
  );
  const n = samples.length || 1;
  return { r: Math.round(sum.r / n), g: Math.round(sum.g / n), b: Math.round(sum.b / n) };
}

function toLuma(r: number, g: number, b: number) {
  // Perceived luminance (rough sRGB luma)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function quantizeToSteps(value01: number, steps: number) {
  const v = Math.max(0, Math.min(1, value01));
  if (steps <= 1) return 0;
  return Math.round(v * (steps - 1)) / (steps - 1);
}

function hasAnyTransparency(rgba: Uint8Array) {
  for (let i = 3; i < rgba.length; i += 4) {
    const a = rgba[i];
    if (a !== 255) return true;
  }
  return false;
}

function trimToAlpha(rgba: RgbaBuf, w: number, h: number, alphaThreshold: number): { rgba: RgbaBuf; w: number; h: number } {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = rgba[(y * w + x) * 4 + 3];
      if (a > alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { rgba, w, h };
  }

  // pad by 1px to avoid shaving edges
  minX = Math.max(0, minX - 1);
  minY = Math.max(0, minY - 1);
  maxX = Math.min(w - 1, maxX + 1);
  maxY = Math.min(h - 1, maxY + 1);

  const nw = maxX - minX + 1;
  const nh = maxY - minY + 1;
  const out = new Uint8Array(nw * nh * 4) as RgbaBuf;
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const si = ((minY + y) * w + (minX + x)) * 4;
      const di = (y * nw + x) * 4;
      out[di] = rgba[si];
      out[di + 1] = rgba[si + 1];
      out[di + 2] = rgba[si + 2];
      out[di + 3] = rgba[si + 3];
    }
  }
  return { rgba: out, w: nw, h: nh };
}

function removeSolidBackgroundByFloodFill(rgba: RgbaBuf, w: number, h: number, threshold: number): RgbaBuf {
  // Only makes sense for (mostly) opaque images; caller should check.
  const bg = estimateBackgroundColor(rgba, w, h);
  const thrSq = threshold * threshold;

  const visited = new Uint8Array(w * h);
  const queueX = new Int32Array(w * h);
  const queueY = new Int32Array(w * h);
  let qh = 0;
  let qt = 0;

  const push = (x: number, y: number) => {
    const idx = y * w + x;
    if (visited[idx]) return;
    visited[idx] = 1;
    queueX[qt] = x;
    queueY[qt] = y;
    qt++;
  };

  // Seed from borders
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }

  const out = new Uint8Array(rgba.length) as RgbaBuf;
  out.set(rgba);

  while (qh < qt) {
    const x = queueX[qh];
    const y = queueY[qh];
    qh++;

    const i = (y * w + x) * 4;
    const a = out[i + 3];
    if (a === 0) continue;

    const c = { r: out[i], g: out[i + 1], b: out[i + 2] };
    if (colorDistSq(c, bg) > thrSq) continue;

    // Mark as background
    out[i + 3] = 0;

    // Flood neighbors
    if (x > 0) push(x - 1, y);
    if (x + 1 < w) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y + 1 < h) push(x, y + 1);
  }

  return out;
}

function toSilhouetteRgba(png: PNG): { rgba: RgbaBuf; w: number; h: number } {
  const w = png.width;
  const h = png.height;

  let rgba: RgbaBuf = new Uint8Array(png.data.length) as RgbaBuf;
  rgba.set(png.data);

  // If the image has no transparency at all, try to remove a solid background by flood-fill.
  if (!hasAnyTransparency(rgba)) {
    rgba = removeSolidBackgroundByFloodFill(rgba, w, h, 26);
  }

  // Convert to grayscale mask and quantize to a few levels.
  // We map (1 - luma) to alpha so darker pixels become more opaque.
  const levels = 4; // keep small to avoid muddy output
  const alphaFloor = 0.10; // suppress very faint noise

  // Before quantization, stretch the mask range so it reaches both ends.
  // This avoids the common "everything is mid-gray" look when the source has low contrast.
  const maskSamples: number[] = [];
  for (let i = 0; i < rgba.length; i += 4) {
    const srcA = rgba[i + 3] / 255;
    if (srcA <= 0) continue;
    const luma01 = toLuma(rgba[i], rgba[i + 1], rgba[i + 2]) / 255;
    maskSamples.push(1 - luma01);
  }

  let maskLo = 0;
  let maskHi = 1;
  if (maskSamples.length > 0) {
    maskSamples.sort((a, b) => a - b);
    const n = maskSamples.length;
    const p = (q: number) => maskSamples[Math.max(0, Math.min(n - 1, Math.round((n - 1) * q)))];
    // Use percentiles to reduce the impact of tiny outliers.
    maskLo = p(0.05);
    maskHi = p(0.95);
    // If range is still too narrow, fall back to full min/max.
    if (maskHi - maskLo < 0.02) {
      maskLo = maskSamples[0];
      maskHi = maskSamples[n - 1];
    }
    // Avoid divide-by-zero.
    if (maskHi - maskLo < 1e-6) {
      maskLo = 0;
      maskHi = 1;
    }
  }

  for (let i = 0; i < rgba.length; i += 4) {
    const srcA = rgba[i + 3] / 255;
    if (srcA <= 0) continue;

    const luma01 = toLuma(rgba[i], rgba[i + 1], rgba[i + 2]) / 255;
    let mask = 1 - luma01;
    // Stretch into [0, 1] using the observed range.
    mask = (mask - maskLo) / (maskHi - maskLo);
    mask = Math.max(0, Math.min(1, mask));
    mask = quantizeToSteps(mask, levels);
    if (mask < alphaFloor) {
      rgba[i + 3] = 0;
      continue;
    }

    const outA = Math.round(255 * srcA * mask);
    rgba[i] = 255;
    rgba[i + 1] = 255;
    rgba[i + 2] = 255;
    rgba[i + 3] = clamp255(outA);
  }

  // Trim transparent padding to avoid shrinking the actual glyph.
  const trimmed = trimToAlpha(rgba, w, h, 8);
  return trimmed;
}

function drawFilledCircle(dst: Uint8Array, w: number, h: number, cx: number, cy: number, radius: number, color: Rgba) {
  const r = Math.max(0, radius);
  const rMin = Math.max(0, r - 0.5);
  const rMax = r + 0.5;

  const x0 = Math.max(0, Math.floor(cx - rMax - 1));
  const x1 = Math.min(w - 1, Math.ceil(cx + rMax + 1));
  const y0 = Math.max(0, Math.floor(cy - rMax - 1));
  const y1 = Math.min(h - 1, Math.ceil(cy + rMax + 1));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5) - cx;
      const dy = (y + 0.5) - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let aa = 0;
      if (dist <= rMin) aa = 1;
      else if (dist < rMax) aa = 1 - (dist - rMin) / (rMax - rMin);
      else aa = 0;

      if (aa <= 0) continue;
      const i = (y * w + x) * 4;
      const a = (color.a / 255) * aa;
      // draw into empty buffer; just write
      dst[i] = clamp255(Math.round(color.r));
      dst[i + 1] = clamp255(Math.round(color.g));
      dst[i + 2] = clamp255(Math.round(color.b));
      dst[i + 3] = clamp255(Math.round(a * 255));
    }
  }
}

function drawFilledRoundedRect(dst: Uint8Array, w: number, h: number, x: number, y: number, rw: number, rh: number, radius: number, color: Rgba) {
  const r = Math.max(0, Math.min(radius, Math.min(rw, rh) / 2));
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(w, Math.ceil(x + rw));
  const y1 = Math.min(h, Math.ceil(y + rh));

  const left = x;
  const top = y;
  const right = x + rw;
  const bottom = y + rh;

  const rMin = Math.max(0, r - 0.5);
  const rMax = r + 0.5;

  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const cx = px + 0.5;
      const cy = py + 0.5;

      // Find nearest point on the rectangle's inner box (without corners)
      const nx = Math.max(left + r, Math.min(right - r, cx));
      const ny = Math.max(top + r, Math.min(bottom - r, cy));

      const dx = cx - nx;
      const dy = cy - ny;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // If inside straight edges area, dist==0
      let aa = 0;
      if (dist === 0) {
        aa = 1;
      } else if (dist <= rMin) {
        aa = 1;
      } else if (dist < rMax) {
        aa = 1 - (dist - rMin) / (rMax - rMin);
      } else {
        aa = 0;
      }

      if (aa <= 0) continue;
      const i = (py * w + px) * 4;
      const a = (color.a / 255) * aa;
      dst[i] = clamp255(Math.round(color.r));
      dst[i + 1] = clamp255(Math.round(color.g));
      dst[i + 2] = clamp255(Math.round(color.b));
      dst[i + 3] = clamp255(Math.round(a * 255));
    }
  }
}

export type BadgePlacement = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export type ComposeMode = 'overlay' | 'side-by-side';

export interface ComposeOptions {
  mode?: ComposeMode;
  badgeSizeRatio: number; // relative to base width (e.g. 0.30)
  marginRatio: number; // relative to base width
  placement: BadgePlacement;

  // side-by-side only
  baseSizeRatio?: number; // relative to base width
  gapRatio?: number; // relative to base width
  outputWidthRatio?: number; // relative to base height
}

function computePlacement(baseSize: number, badgeSize: number, margin: number, placement: BadgePlacement) {
  const left = placement.includes('left') ? margin : baseSize - badgeSize - margin;
  const top = placement.includes('top') ? margin : baseSize - badgeSize - margin;
  return { left, top };
}

function composeOne(basePath: string, badgePath: string, options: ComposeOptions): Buffer {
  const base = readPngFile(basePath);
  const badge = readPngFile(badgePath);

  const baseSize = base.height; // assume square

  if (options.mode === 'side-by-side') {
    const outW = Math.max(1, Math.round(baseSize * (options.outputWidthRatio ?? 1)));
    const out = new PNG({ width: outW, height: baseSize });
    out.data.fill(0);

    const margin = Math.max(0, Math.round(baseSize * options.marginRatio));
    const gap = Math.max(0, Math.round(baseSize * (options.gapRatio ?? 0.12)));

    // We want base and badge to be the same visual size.
    const desiredPart = Math.max(
      1,
      Math.round(baseSize * Math.min(options.baseSizeRatio ?? 1, options.badgeSizeRatio))
    );

    const maxPartByHeight = Math.max(1, baseSize - margin * 2);
    const maxPartByWidth = Math.max(1, Math.floor((outW - margin * 2 - gap) / 2));
    const part = Math.max(1, Math.min(desiredPart, maxPartByHeight, maxPartByWidth));

    const baseX = margin;
    const baseY = Math.round((baseSize - part) / 2);
    const badgeX = margin + part + gap;
    const badgeY = baseY;

    const baseRgba = resizeRgbaBilinear(base.data, base.width, base.height, part, part);

    // Badge: make a real silhouette (auto background removal + trim), then scale.
    const sil = toSilhouetteRgba(badge);
    // Supersample -> blur -> downsample for nicer edges.
    // Use 4x supersampling so the 2x tray/dock assets stay crisp.
    const supersample = 4;
    const hi = Math.max(part, part * supersample);
    let hiRgba = resizeRgbaContainSquare(sil.rgba, sil.w, sil.h, hi);
    // Blur alpha slightly in high-res space; keep it subtle to avoid softness.
    hiRgba = boxBlurAlpha(hiRgba, hi, hi, Math.max(1, Math.round(supersample * 0.25)));
    const badgeRgba = resizeRgbaBilinear(hiRgba, hi, hi, part, part);

    alphaBlendOver(out, baseRgba, part, part, baseX, baseY);
    alphaBlendOver(out, badgeRgba, part, part, badgeX, badgeY);

    return toPngBuffer(out);
  }

  const badgeSize = Math.max(1, Math.round(baseSize * options.badgeSizeRatio));
  const margin = Math.max(0, Math.round(baseSize * options.marginRatio));

  // Overlay badge with a rounded background to avoid hollow / semi-transparent shapes.
  const bgPadding = Math.max(1, Math.round(badgeSize * 0.12));
  const bgSize = badgeSize + bgPadding * 2;
  const badgeBg = new Uint8Array(bgSize * bgSize * 4);
  badgeBg.fill(0);

  // Use an opaque rounded-rect background; on macOS template images, only alpha matters.
  drawFilledRoundedRect(
    badgeBg,
    bgSize,
    bgSize,
    0,
    0,
    bgSize,
    bgSize,
    Math.round(bgSize * 0.28),
    { r: 255, g: 255, b: 255, a: 255 }
  );

  const badgeRgba = resizeRgbaContainSquare(badge.data, badge.width, badge.height, badgeSize);
  // Composite the original badge centered on the circle.
  const innerX = bgPadding;
  const innerY = bgPadding;
  const badgeBgPng = new PNG({ width: bgSize, height: bgSize });
  badgeBgPng.data = Buffer.from(badgeBg);
  alphaBlendOver(badgeBgPng, badgeRgba, badgeSize, badgeSize, innerX, innerY);

  const { left, top } = computePlacement(baseSize, bgSize, margin, options.placement);
  alphaBlendOver(base, badgeBgPng.data, bgSize, bgSize, left, top);

  return toPngBuffer(base);
}

export function buildHiDpiNativeImage(params: {
  base1x: string;
  base2x: string;
  badge?: string | null;
  compose?: ComposeOptions;
}): NativeImage {
  const img = nativeImage.createEmpty();

  const buf1x = params.badge && params.compose
    ? composeOne(params.base1x, params.badge, params.compose)
    : fs.readFileSync(params.base1x);

  const buf2x = params.badge && params.compose
    ? composeOne(params.base2x, params.badge, params.compose)
    : fs.readFileSync(params.base2x);

  img.addRepresentation({ scaleFactor: 1, dataURL: `data:image/png;base64,${buf1x.toString('base64')}` });
  img.addRepresentation({ scaleFactor: 2, dataURL: `data:image/png;base64,${buf2x.toString('base64')}` });

  return img;
}

export function getProviderBadgePath(providerDir: string): string | null {
  const candidates = [
    path.join(providerDir, 'badge.png'),
    path.join(providerDir, 'icon.png'),
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }

  return null;
}
