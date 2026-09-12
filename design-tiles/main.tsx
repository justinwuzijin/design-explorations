import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import DesignTilesApp from "./embed";

// Standalone entry (`cd design-tiles && bun dev`). Inside the shell app the
// exploration is mounted as a route instead — see src/App.tsx.
const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

createRoot(rootEl).render(
  <StrictMode>
    <a id="back" href="/">
      ← back
    </a>
    <DesignTilesApp />
  </StrictMode>
);
