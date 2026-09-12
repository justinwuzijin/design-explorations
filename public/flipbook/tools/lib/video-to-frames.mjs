// Shared video -> flipbook frame-sequence extraction (yt-dlp + ffmpeg).
// Used by youtube-to-frames.mjs and instagram-to-frames.mjs.
//
// Requires `yt-dlp` and `ffmpeg` on PATH (macOS: brew install yt-dlp ffmpeg).

import { execFileSync } from 'node:child_process';
import {
  mkdtempSync, rmSync, mkdirSync, readdirSync,
} from 'node:fs';
import { regenerateManifest } from './manifest.mjs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SEQ_DIR = resolve(__dirname, '..', '..', 'sequences');

// The flipbook page (and each frame canvas) is this size.
export const PAGE_W = 400;
export const PAGE_H = 550;

export function parseFlag(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

function run(cmd, args) {
  console.log('>', cmd, args.join(' '));
  execFileSync(cmd, args, { stdio: 'inherit' });
}

// fit: 'contain' letterboxes with white bars (good for landscape video);
//      'cover'   crops to fill the page, preserving aspect (good for reels).
function videoFilter(fit, fps) {
  if (fit === 'cover') {
    return `fps=${fps},scale=${PAGE_W}:${PAGE_H}:force_original_aspect_ratio=increase,crop=${PAGE_W}:${PAGE_H}`;
  }
  return `fps=${fps},scale=${PAGE_W}:${PAGE_H}:force_original_aspect_ratio=decrease,`
       + `pad=${PAGE_W}:${PAGE_H}:(ow-iw)/2:(oh-ih)/2:color=white`;
}

export function extractToFrames({
  url, id, fps = '4', max = '120', label = id, fit = 'contain', ytdlpArgs = [],
}) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error('<id> must be alphanumeric (plus - and _); it becomes a folder name.');
  }

  const outDir = join(SEQ_DIR, id);
  mkdirSync(outDir, { recursive: true });

  const work = mkdtempSync(join(tmpdir(), 'flipbook-'));
  const video = join(work, 'video.mp4');
  try {
    run('yt-dlp', [...ytdlpArgs, '-o', video, url]);
    run('ffmpeg', [
      '-y', '-i', video,
      '-vf', videoFilter(fit, fps),
      '-frames:v', String(max),
      join(outDir, 'frame_%03d.png'),
    ]);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  regenerateManifest(id, label);
}
