#!/usr/bin/env node
// Convert a YouTube (or any yt-dlp-supported) URL into a flipbook frame sequence.
//
// Requires `yt-dlp` and `ffmpeg` on your PATH:
//   macOS:  brew install yt-dlp ffmpeg
//
// Usage:
//   node flipbook/tools/youtube-to-frames.mjs "<url>" <id> [--fps 4] [--max 120] [--label "Name"]
//
// Example:
//   node flipbook/tools/youtube-to-frames.mjs "https://youtu.be/XXXX" dunk --fps 5 --label "dunk"
//
// Landscape video is letterboxed (white bars) to fit the page. For vertical
// clips that should fill the page, use instagram-to-frames.mjs (cover crop).
//
//   --fps  frames sampled per second of video (the "time chunk")
//   --max  cap on total frames kept (~0.9 MB of canvas memory each at runtime)

import { parseFlag, extractToFrames } from './lib/video-to-frames.mjs';

const url = process.argv[2];
const id = process.argv[3];
if (!url || !id || url.startsWith('--') || id.startsWith('--')) {
  console.error('Usage: node youtube-to-frames.mjs "<url>" <id> [--fps 4] [--max 120] [--label "Name"]');
  process.exit(1);
}

const fps = parseFlag('--fps', '4');
const max = parseFlag('--max', '120');
const label = parseFlag('--label', id);

try {
  extractToFrames({ url, id, fps, max, label, fit: 'contain', ytdlpArgs: ['-f', 'mp4/bestvideo'] });
  console.log(`\nDone: sequence "${id}" added. Reload the flipbook and pick it from the source dropdown.`);
} catch (err) {
  console.error('\nFailed:', err.message);
  console.error('Make sure yt-dlp and ffmpeg are installed (brew install yt-dlp ffmpeg).');
  process.exit(1);
}
