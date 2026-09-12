import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { PAGE_W, PAGE_H, SEQ_DIR, parseFlag } from './video-to-frames.mjs';
import { regenerateManifest } from './manifest.mjs';
import { renderOilPastelFrame, renderWatercolorFrame } from './image-stylize.mjs';

const RENDERERS = {
  'oil-pastel': { fn: renderOilPastelFrame, style: 'oil-pastel' },
  watercolor:   { fn: renderWatercolorFrame, style: 'watercolor' },
};

export function listSourceFrames(sourceId) {
  const dir = join(SEQ_DIR, sourceId);
  return readdirSync(dir)
    .filter((f) => /^frame_\d+\.png$/.test(f))
    .sort();
}

export async function stylizeSequence({
  sourceId,
  outId,
  style,
  label,
}) {
  const renderer = RENDERERS[style];
  if (!renderer) throw new Error(`Unknown style "${style}"`);

  const srcDir = join(SEQ_DIR, sourceId);
  const outDir = join(SEQ_DIR, outId);
  mkdirSync(outDir, { recursive: true });

  const files = listSourceFrames(sourceId);
  if (files.length === 0) {
    throw new Error(`No frames found in sequences/${sourceId}/`);
  }

  console.log(`Stylizing ${files.length} frames: ${sourceId} -> ${outId} (${style})`);

  for (let fi = 0; fi < files.length; fi++) {
    const file = files[fi];
    const { data, info } = await sharp(join(srcDir, file))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let w = info.width;
    let h = info.height;
    let rgba = data;

    if (w !== PAGE_W || h !== PAGE_H) {
      const resized = await sharp(join(srcDir, file))
        .resize(PAGE_W, PAGE_H, { fit: 'contain', background: '#fbfaf5' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      rgba = resized.data;
      w = resized.info.width;
      h = resized.info.height;
    }

    const out = renderer.fn(rgba, w, h);
    await sharp(out, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toFile(join(outDir, file));

    if ((fi + 1) % 10 === 0 || fi + 1 === files.length) {
      console.log(`  ${fi + 1}/${files.length}`);
    }
  }

  regenerateManifest(outId, label, { raw: true, style: renderer.style });
  console.log(`Wrote sequences/${outId}/ (${files.length} frames)`);
}

export function parseStylizeArgs(style, defaultOutSuffix) {
  const sourceId = process.argv[2];
  if (!sourceId || sourceId.startsWith('--')) {
    return { error: `Usage: node sequence-to-${style}.mjs <source-id> [--out <id>] [--label "Name"]` };
  }
  const outId = parseFlag('--out', `${sourceId}-${defaultOutSuffix}`);
  const label = parseFlag('--label', `${sourceId} (${style.replace('-', ' ')})`);
  return { sourceId, outId, label };
}
