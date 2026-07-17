# soccer ball path — dialkit

A **realistic 3D soccer ball** travels from **A → B** along a curved path.
No pitch — dark studio backdrop, soft contact shadow, spinning ball with
clearcoat leather + panel texture.

Path modes (DialKit):

| Mode | Behavior |
|------|----------|
| **physics** | Live Magnus + drag + wind curve |
| **draw** | Sketch A → B; ball follows on Kick |
| **edit** | Drag handles; **Copy Path** exports SVG |

Click the orange path (clip hit-target) to enter edit mode.

```bash
bun install
bun run dev
```

Controls kept: wind, kick (power / aim / spin / loft), time scale, path mode,
Kick / Reset / Randomize Wind / Copy Path / Edit Path. `Space` / `R`.
