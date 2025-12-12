import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { Resvg } from '@resvg/resvg-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');

const assetsDir = path.join(repoRoot, 'assets');

// Prefer the latest transparent PNGs from the project root (user-generated).
// Fallback to legacy filenames if they exist.
const rootColorPngCandidates = [
  path.join(repoRoot, 'icon-solid.png'),
];
const rootSilhouettePngCandidates = [
  path.join(repoRoot, 'icon-silhouette.png'),
];

// Alpha threshold (0-255). Higher => trims more aggressively (ignores faint glow/shadow).
const ALPHA_CROP_THRESHOLD = 24;

// Background removal thresholds (RGB distance ~0-441)
// Note: your generated PNGs are fully opaque (no alpha) with a light background.
// We remove the background by sampling corner color and converting close colors to alpha=0.
// These are tuned for:
// - App icon (colorful): keep slightly more detail
// - Tray icon (silhouette): aggressively remove background
const BG_REMOVE_START_APP = 32;
const BG_REMOVE_END_APP = 78;
const BG_REMOVE_START_TRAY = 70;
const BG_REMOVE_END_TRAY = 140;

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writePngFromSvg({ svgPath, outPath, width, height, background }) {
  const svg = readText(svgPath);
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: width,
    },
    background,
  });

  const rendered = resvg.render();
  const png = rendered.asPng();

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, png);

  // resvg.fitTo by width; enforce exact height via viewBox in SVG.
  // We still accept height param for call-site clarity.
  void height;
}

async function prepareSquarePngBuffer(inputPath, size, options = {}) {
  let image = await alphaCropByTransparency(inputPath, ALPHA_CROP_THRESHOLD, options);

  // For tray icons, the silhouette is often too thin after downscaling.
  // We binarize alpha and do a tiny dilation on an intermediate size to keep it readable at 16/32px.
  if (options.trayEnhance) {
    const intermediate = options.intermediateSize ?? 256;
    const { data, info } = await image
      .resize(intermediate, intermediate, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = info.width;
    const h = info.height;
    const out = Buffer.from(data);

    const alphaCut = options.alphaCut ?? 6;

    // 1) alpha binarize
    for (let i = 3; i < out.length; i += 4) {
      out[i] = out[i] > alphaCut ? 255 : 0;
    }

    // 2) dilate alpha (1-2 iterations)
    const iters = options.dilate ?? 1;
    for (let iter = 0; iter < iters; iter++) {
      const src = Buffer.from(out);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4 + 3;
          if (src[idx] === 255) continue;
          let on = false;
          for (let dy = -1; dy <= 1 && !on; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= h) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx;
              if (xx < 0 || xx >= w) continue;
              const nidx = (yy * w + xx) * 4 + 3;
              if (src[nidx] === 255) {
                on = true;
                break;
              }
            }
          }
          if (on) out[idx] = 255;
        }
      }
    }

    // 3) set RGB to monochrome color for visible pixels
    const [mr, mg, mb] = options.monochromeColor ?? [255, 255, 255];
    for (let i = 0; i < out.length; i += 4) {
      if (out[i + 3] > 0) {
        out[i] = mr;
        out[i + 1] = mg;
        out[i + 2] = mb;
      } else {
        out[i] = 0;
        out[i + 1] = 0;
        out[i + 2] = 0;
      }
    }

    image = sharp(out, { raw: { width: w, height: h, channels: 4 } });
  }

  // Force monochrome foreground (keep alpha). Useful for tray silhouette.
  if (options.monochromeColor) {
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const out = Buffer.from(data);
    const [r, g, b] = options.monochromeColor;
    for (let i = 0; i < out.length; i += 4) {
      // keep alpha as-is
      if (out[i + 3] > 0) {
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = b;
      }
    }
    image = sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } });
  }

  // Add transparent padding AFTER cropping, BEFORE final resize.
  // This makes the visible glyph smaller and avoids touching edges.
  if (typeof options.paddingRatio === 'number' && options.paddingRatio > 0) {
    // Compute padding in output pixels so iconset sizes stay correct.
    const pad = Math.max(1, Math.round(size * options.paddingRatio));

    const innerSize = Math.max(1, size - pad * 2);
    image = image
      .resize(innerSize, innerSize, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .extend({
        top: pad,
        bottom: pad,
        left: pad,
        right: pad,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      });

    return await image.png().toBuffer();
  }

  return await image
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

async function alphaCropByTransparency(inputPath, alphaThreshold, options = {}) {
  // Ensure the input has transparency; if not, try to remove solid-ish background first.
  const prepared = await ensureHasTransparency(inputPath, options);

  const { data, info } = await sharp(prepared)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  // RGBA, alpha at index+3
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      const a = data[rowOffset + x * 4 + 3];
      if (a > alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  // If image is fully transparent (or threshold too high), fall back to original.
  if (maxX < 0 || maxY < 0) {
    return sharp(prepared).ensureAlpha();
  }

  // Expand by 1px safety margin to avoid cutting antialiasing.
  const margin = 1;
  const left = Math.max(0, minX - margin);
  const top = Math.max(0, minY - margin);
  const right = Math.min(width - 1, maxX + margin);
  const bottom = Math.min(height - 1, maxY + margin);

  const extractWidth = right - left + 1;
  const extractHeight = bottom - top + 1;

  return sharp(prepared).ensureAlpha().extract({ left, top, width: extractWidth, height: extractHeight });
}

async function ensureHasTransparency(inputPath, options = {}) {
  const meta = await sharp(inputPath).metadata();
  if (meta.hasAlpha) return inputPath;

  // No alpha at all: usually a light background. Remove it by sampling corner color.
  const buf = await removeBackgroundByCornerColor(inputPath, {
    start: options.bgStart ?? BG_REMOVE_START_APP,
    end: options.bgEnd ?? BG_REMOVE_END_APP,
    forceMonochrome: options.forceMonochrome ?? false,
  });

  // Return as in-memory buffer to avoid concurrent temp file races.
  return buf;
}

async function removeBackgroundByCornerColor(inputPath, { start, end, forceMonochrome }) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;

  const corners = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ].map(([x, y]) => {
    const idx = (y * w + x) * 4;
    return [data[idx], data[idx + 1], data[idx + 2]];
  });

  const bg = corners
    .reduce((acc, c) => [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]], [0, 0, 0])
    .map((v) => Math.round(v / corners.length));

  const out = Buffer.from(data);

  const start2 = start * start;
  const end2 = end * end;

  for (let i = 0; i < out.length; i += 4) {
    const dr = out[i] - bg[0];
    const dg = out[i + 1] - bg[1];
    const db = out[i + 2] - bg[2];
    const d2 = dr * dr + dg * dg + db * db;

    // Map distance to alpha.
    let a;
    if (d2 <= start2) a = 0;
    else if (d2 >= end2) a = 255;
    else {
      const t = (d2 - start2) / (end2 - start2);
      a = Math.round(t * 255);
    }

    out[i + 3] = a;

    if (forceMonochrome) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
    }
  }

  return await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    // Slight blur on alpha edge to reduce jaggies on hard-threshold backgrounds.
    .png()
    .toBuffer();
}

async function writePngFromPng({ inputPath, outPath, size, ...options }) {
  const buf = await prepareSquarePngBuffer(inputPath, size, options);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
}

async function writeIcoFromPng({ inputPath, outPath, ...options }) {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const buffers = await Promise.all(sizes.map((s) => prepareSquarePngBuffer(inputPath, s, options)));
  const ico = await pngToIco(buffers);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, ico);
}

async function writeIcnsFromPng({ inputPath, outPath, ...options }) {
  if (process.platform !== 'darwin') {
    console.warn('[gen:icons] Skip .icns generation (not macOS)');
    return;
  }

  const iconsetDir = path.join(assetsDir, 'icon.iconset');
  fs.rmSync(iconsetDir, { recursive: true, force: true });
  fs.mkdirSync(iconsetDir, { recursive: true });

  const entries = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024],
  ];

  for (const [name, size] of entries) {
    const buf = await prepareSquarePngBuffer(inputPath, size, options);
    fs.writeFileSync(path.join(iconsetDir, name), buf);
  }

  execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', outPath], { stdio: 'inherit' });
  fs.rmSync(iconsetDir, { recursive: true, force: true });
}

async function main() {
  const appSvg = path.join(assetsDir, 'icon.svg');
  const traySvg = path.join(assetsDir, 'tray-icon.svg');

  const appPngInput = rootColorPngCandidates.find((p) => fs.existsSync(p)) ?? null;
  const trayPngInput = rootSilhouettePngCandidates.find((p) => fs.existsSync(p)) ?? null;

  // 1) App icon outputs
  if (appPngInput) {
    await writePngFromPng({ inputPath: appPngInput, outPath: path.join(assetsDir, 'icon.png'), size: 512, bgStart: BG_REMOVE_START_APP, bgEnd: BG_REMOVE_END_APP, paddingRatio: 0.10 });
    await writePngFromPng({ inputPath: appPngInput, outPath: path.join(assetsDir, 'icon@1024.png'), size: 1024, bgStart: BG_REMOVE_START_APP, bgEnd: BG_REMOVE_END_APP, paddingRatio: 0.10 });
    await writeIcoFromPng({ inputPath: appPngInput, outPath: path.join(assetsDir, 'icon.ico'), bgStart: BG_REMOVE_START_APP, bgEnd: BG_REMOVE_END_APP, paddingRatio: 0.10 });
    await writeIcnsFromPng({ inputPath: appPngInput, outPath: path.join(assetsDir, 'icon.icns'), bgStart: BG_REMOVE_START_APP, bgEnd: BG_REMOVE_END_APP, paddingRatio: 0.10 });
  } else {
    if (!fs.existsSync(appSvg)) throw new Error(`Missing ${appSvg}`);
    writePngFromSvg({ svgPath: appSvg, outPath: path.join(assetsDir, 'icon.png'), width: 512, height: 512, background: null });
    writePngFromSvg({ svgPath: appSvg, outPath: path.join(assetsDir, 'icon@1024.png'), width: 1024, height: 1024, background: null });
  }

  // 2) Tray icon outputs
  if (trayPngInput) {
    await writePngFromPng({
      inputPath: trayPngInput,
      outPath: path.join(assetsDir, 'tray-icon.png'),
      size: 18,
      bgStart: BG_REMOVE_START_TRAY,
      bgEnd: BG_REMOVE_END_TRAY,
      // White foreground silhouette
      monochromeColor: [255, 255, 255],
      trayEnhance: true,
      alphaCut: 6,
      dilate: 1,
      paddingRatio: 0.05,
    });
    await writePngFromPng({
      inputPath: trayPngInput,
      outPath: path.join(assetsDir, 'tray-icon@2x.png'),
      size: 36,
      bgStart: BG_REMOVE_START_TRAY,
      bgEnd: BG_REMOVE_END_TRAY,
      monochromeColor: [255, 255, 255],
      trayEnhance: true,
      alphaCut: 6,
      dilate: 1,
      paddingRatio: 0.05,
    });
  } else {
    if (!fs.existsSync(traySvg)) throw new Error(`Missing ${traySvg}`);
    writePngFromSvg({ svgPath: traySvg, outPath: path.join(assetsDir, 'tray-icon.png'), width: 18, height: 18, background: null });
    writePngFromSvg({ svgPath: traySvg, outPath: path.join(assetsDir, 'tray-icon@2x.png'), width: 36, height: 36, background: null });
  }

  console.log('[gen:icons] Done');
}

main().catch((err) => {
  console.error('[gen:icons] Failed:', err);
  process.exitCode = 1;
});
