#!/usr/bin/env node
// Re-render an existing flipbook sequence with oil-pastel texture.
// Colours are sampled from each source frame (same frames produced by
// instagram-to-frames / youtube-to-frames).
//
// Requires `sharp` (npm install sharp from repo root if needed).
//
// Usage:
//   node flipbook/tools/sequence-to-oil-pastel.mjs <source-id> [--out <id>] [--label "Name"]
//
// Example (lebron reel):
//   node flipbook/tools/sequence-to-oil-pastel.mjs lebron
//   node flipbook/tools/sequence-to-oil-pastel.mjs lebron --out lebron-oil-pastel --label "lebron oil pastel"

import { parseStylizeArgs, stylizeSequence } from './lib/sequence-stylize.mjs';

const args = parseStylizeArgs('oil-pastel', 'oil-pastel');
if (args.error) {
  console.error(args.error);
  process.exit(1);
}

try {
  await stylizeSequence({ ...args, style: 'oil-pastel' });
  console.log(`\nDone: reload the flipbook and pick "${args.outId}" from the source dropdown.`);
} catch (err) {
  console.error('\nFailed:', err.message);
  process.exit(1);
}
