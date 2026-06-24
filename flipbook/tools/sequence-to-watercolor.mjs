#!/usr/bin/env node
// Re-render an existing flipbook sequence with watercolor texture.
// Pigment absorbance is derived from each source frame's colours, then
// diffused and displayed with the same wash logic as the watercolor demo.
//
// Requires `sharp` (npm install sharp from repo root if needed).
//
// Usage:
//   node flipbook/tools/sequence-to-watercolor.mjs <source-id> [--out <id>] [--label "Name"]
//
// Example (lebron reel):
//   node flipbook/tools/sequence-to-watercolor.mjs lebron
//   node flipbook/tools/sequence-to-watercolor.mjs lebron --out lebron-watercolor --label "lebron watercolor"

import { parseStylizeArgs, stylizeSequence } from './lib/sequence-stylize.mjs';

const args = parseStylizeArgs('watercolor', 'watercolor');
if (args.error) {
  console.error(args.error);
  process.exit(1);
}

try {
  await stylizeSequence({ ...args, style: 'watercolor' });
  console.log(`\nDone: reload the flipbook and pick "${args.outId}" from the source dropdown.`);
} catch (err) {
  console.error('\nFailed:', err.message);
  process.exit(1);
}
