#!/usr/bin/env node
// Convert an Instagram reel into a flipbook frame sequence.
//
// The WHOLE reel frame is fit onto each page (aspect ratio preserved); a tall
// reel gets thin side bars so nothing is cropped — the full reel shows on every
// flipped page.
//
// Requires `yt-dlp` and `ffmpeg` on your PATH:
//   macOS:  brew install yt-dlp ffmpeg
//
// Usage:
//   node flipbook/tools/instagram-to-frames.mjs "<reel-url>" <id> [--fps 6] [--max 120] [--label "Name"] [--cookies-from-browser chrome]
//
// Example:
//   node flipbook/tools/instagram-to-frames.mjs "https://www.instagram.com/reel/XXXX/" myreel --fps 6
//
// Notes:
//   - Public reels usually download directly. Private/age-gated/rate-limited
//     reels need your login, passed through to yt-dlp:
//       --cookies-from-browser chrome   (or safari, firefox, edge, brave)
//   - --fps  frames sampled per second (the "time chunk")
//   - --max  cap on total frames kept (~0.9 MB of canvas memory each at runtime)

import { parseFlag, extractToFrames } from './lib/video-to-frames.mjs';

const url = process.argv[2];
const id = process.argv[3];
if (!url || !id || url.startsWith('--') || id.startsWith('--')) {
  console.error('Usage: node instagram-to-frames.mjs "<reel-url>" <id> [--fps 6] [--max 120] [--label "Name"] [--cookies-from-browser chrome]');
  process.exit(1);
}

const fps = parseFlag('--fps', '6');
const max = parseFlag('--max', '120');
const label = parseFlag('--label', id);
const cookiesBrowser = parseFlag('--cookies-from-browser', '');

const ytdlpArgs = ['-f', 'best[ext=mp4]/bestvideo*+bestaudio/best'];
if (cookiesBrowser) ytdlpArgs.push('--cookies-from-browser', cookiesBrowser);

try {
  // fit: 'contain' fits the entire reel onto the page (no cropping)
  extractToFrames({ url, id, fps, max, label, fit: 'contain', ytdlpArgs });
  console.log(`\nDone: sequence "${id}" added (whole reel fit to the page). Reload the flipbook and pick it from the source dropdown.`);
} catch (err) {
  console.error('\nFailed:', err.message);
  console.error('Instagram often requires a login. Retry with --cookies-from-browser chrome (or safari/firefox/edge).');
  console.error('Also ensure yt-dlp and ffmpeg are installed (brew install yt-dlp ffmpeg).');
  process.exit(1);
}
