# DESIGN.md

This document defines the design system for all UI controls and panels across WebGL experiments.

## Color Palette

```css
/* Panel Background */
background: rgba(255, 255, 255, 0.7);
backdrop-filter: blur(10px);

/* Text Colors */
--text-primary: rgba(0, 0, 0, 0.6);      /* Control labels */
--text-secondary: rgba(0, 0, 0, 0.4);    /* Values, panel title */
--text-tertiary: rgba(0, 0, 0, 0.45);    /* Section headers */
--text-hover: rgba(0, 0, 0, 0.85);       /* Button hover */

/* Borders & Backgrounds */
--border-light: rgba(0, 0, 0, 0.08);     /* Panel border */
--bg-button: rgba(0, 0, 0, 0.06);        /* Button background */
--bg-button-hover: rgba(0, 0, 0, 0.12);  /* Button hover */
--bg-slider-track: rgba(0, 0, 0, 0.12);  /* Slider track */

/* Accent Colors */
--accent-primary: #323a5a;               /* Slider thumb */
```

## Typography

```css
/* Font */
font-family: 'Inter', sans-serif;

/* Sizes */
--text-label: 0.7rem;       /* Control labels */
--text-value: 0.66rem;      /* Control values */
--text-title: 0.66rem;      /* Panel title (uppercase) */
--text-button: 0.7rem;      /* Buttons (uppercase) */

/* Letter Spacing */
--spacing-title: 0.12em;    /* Panel title */
--spacing-button: 0.1em;    /* Buttons */
```

## Panel Container

```css
position: fixed;
right: 24px;
bottom: 24px;
background: rgba(255, 255, 255, 0.7);
backdrop-filter: blur(10px);
-webkit-backdrop-filter: blur(10px);
border: 1px solid rgba(0, 0, 0, 0.08);
border-radius: 14px;
padding: 14px 16px 14px;
box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
user-select: none;
width: 216px;
```

## Panel Title

```css
font-size: 0.66rem;
letter-spacing: 0.12em;
text-transform: uppercase;
color: rgba(0, 0, 0, 0.45);
margin-bottom: 12px;
```

## Control Row Structure

Each control follows this HTML structure:

```html
<div class="control">
  <div class="control-row">
    <label for="controlId">control name</label>
    <span class="val" id="controlId-val">value</span>
  </div>
  <input type="range" id="controlId" min="..." max="..." step="..." value="..." />
</div>
```

## Control Styling

```css
/* Control container */
.control {
  margin-bottom: 10px;
}

/* Label + value row */
.control-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 4px;
}

/* Label */
.control label {
  font-size: 0.7rem;
  color: rgba(0, 0, 0, 0.6);
}

/* Value display */
.control .val {
  font-size: 0.66rem;
  color: rgba(0, 0, 0, 0.4);
  font-variant-numeric: tabular-nums;
}
```

## Range Slider Styling

```css
input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 3px;
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.12);
  outline: none;
}

/* Webkit slider thumb */
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #323a5a;
  cursor: pointer;
  border: none;
}

/* Firefox slider thumb */
input[type="range"]::-moz-range-thumb {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #323a5a;
  cursor: pointer;
  border: none;
}
```

## Button Styling

```css
button {
  width: 100%;
  margin-top: 4px;
  padding: 7px 0;
  border: none;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.6);
  font-family: 'Inter', sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

button:hover {
  background: rgba(0, 0, 0, 0.12);
  color: rgba(0, 0, 0, 0.85);
}
```

## Example: Complete Control Panel

Reference implementation from `/watercolor/index.html`:

```html
<div id="panel">
  <div class="panel-title">watercolor</div>

  <div class="control">
    <div class="control-row">
      <label for="brushSize">brush</label>
      <span class="val" id="brushSize-val">46px</span>
    </div>
    <input type="range" id="brushSize" min="10" max="130" step="1" value="46" />
  </div>

  <div class="control">
    <div class="control-row">
      <label for="pigment">ink</label>
      <span class="val" id="pigment-val">0.024</span>
    </div>
    <input type="range" id="pigment" min="0.004" max="0.08" step="0.002" value="0.024" />
  </div>

  <div class="control">
    <div class="control-row">
      <label for="wetness">water</label>
      <span class="val" id="wetness-val">0.16</span>
    </div>
    <input type="range" id="wetness" min="0.04" max="0.4" step="0.01" value="0.16" />
  </div>

  <div class="control">
    <div class="control-row">
      <label for="edge">edge bleed</label>
      <span class="val" id="edge-val">6</span>
    </div>
    <input type="range" id="edge" min="0" max="14" step="0.5" value="6" />
  </div>

  <button id="clear">clear</button>
</div>
```

## Spacing & Layout

```css
/* Panel positioning */
position: fixed;
right: 24px;
bottom: 24px;

/* Panel internal spacing */
padding: 14px 16px 14px;

/* Control spacing */
margin-bottom: 10px;        /* Between controls */
margin-bottom: 4px;         /* Label row to slider */
margin-top: 4px;            /* Button top margin */
margin-bottom: 12px;        /* Title to first control */
```

## Usage Guidelines

1. **Always use this exact styling** for all control panels across experiments
2. **Panel width** should be 216px
3. **Panel title** should reflect the experiment name in lowercase
4. **Control labels** should be concise and lowercase
5. **Values** should use appropriate formatting (e.g., `46px`, `0.024`, `6`)
6. **Tabular nums** must be used for numeric values to prevent layout shift
7. **Button text** should always be uppercase

## Font Loading

Always include Inter font:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap" rel="stylesheet" />
```
