# Breadboard

Interactive web breadboard simulator with CircuitJS schematic import/export, logic ICs, and a runnable Arduino Uno.

Built by [Justin Wu](https://www.justinzwu.com/) for ECE 192L prelab.

## Run locally

Static files only — no build step.

```bash
# from this folder
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080).

## Deploy

Drop this folder onto [Vercel](https://vercel.com), Netlify, or GitHub Pages (serve from repo root).

Or with Vercel CLI:

```bash
npx vercel
```

## Features

- Drag-and-drop parts: resistors, LEDs, switches, 74xx / CD4013 logic, battery, Arduino Uno
- Wire on the breadboard; live circuit simulation
- **Circuit** panel: Falstad CircuitJS schematic ↔ breadboard convert
- Arduino sketches (see `ARDUINO_README.md` and the `.ino` examples)
- Sample Lab 4 circuits: `lab4-counter.txt`, `lab4-traffic.txt`

## Project layout

```
index.html      UI shell
main.js         placement, wiring, UI
board.js        breadboard geometry
parts.js        part catalog + drawing
sim.js          circuit simulation
arduino.js      Arduino runtime
bridge.js       schematic ↔ breadboard conversion
style.css
img/            part photos
circuitjs/      embedded CircuitJS
examples/       sample circuits / sketches
```

## Note on CircuitJS

The `circuitjs/` directory is Paul Falstad / Iain Sharp’s CircuitJS1 (GPL). Keep attribution if you redistribute.
