import {
  existsSync, readFileSync, readdirSync, statSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { SEQ_DIR } from './video-to-frames.mjs';

// Rescan sequences/ and rewrite manifest.json, preserving labels and extra fields.
export function regenerateManifest(currentId, currentLabel, extra = {}) {
  const manifestPath = join(SEQ_DIR, 'manifest.json');
  let prev = [];
  if (existsSync(manifestPath)) {
    try { prev = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { /* ignore */ }
  }
  const prevEntry = Object.fromEntries((prev || []).map((e) => [e.id, e]));

  const entries = [];
  for (const name of readdirSync(SEQ_DIR)) {
    const dir = join(SEQ_DIR, name);
    if (!statSync(dir).isDirectory()) continue;
    const count = readdirSync(dir).filter((f) => /^frame_\d+\.png$/.test(f)).length;
    if (count === 0) continue;

    const saved = prevEntry[name] || {};
    const entry = {
      id: name,
      label: name === currentId ? currentLabel : (saved.label || name),
      count,
      ext: 'png',
    };
    if (saved.raw) entry.raw = true;
    if (saved.style) entry.style = saved.style;
    if (name === currentId) Object.assign(entry, extra);
    entries.push(entry);
  }
  writeFileSync(manifestPath, JSON.stringify(entries, null, 2) + '\n');
}
