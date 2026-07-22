import { StrictMode, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { DialRoot, useDialKitController } from "dialkit";
import "dialkit/styles.css";
import { DesignTiles } from "./engine.js";
import { dialConfig, valuesToSettings } from "./dials.js";

const PANEL_ID = "design-tiles-type";

function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const tilesRef = useRef<DesignTiles | null>(null);

  const controller = useDialKitController("Type Lockup", dialConfig, {
    id: PANEL_ID,
    onAction: (path: string) => {
      const tiles = tilesRef.current;
      if (!tiles) return;
      if (path.endsWith("replay")) tiles.replay();
      else if (path.endsWith("wave")) tiles.advancePhrase();
      else if (path.endsWith("reshuffle")) tiles.reshuffleColors();
    },
  });

  // Mount vanilla lockup
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const tiles = new DesignTiles(
      host,
      valuesToSettings(controller.getValues())
    );
    tilesRef.current = tiles;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduced) tiles.renderStill();
    else requestAnimationFrame(() => tiles.start());

    document.fonts?.ready.then(() => tiles.refreshFont()).catch(() => {});

    return () => {
      tiles.destroy();
      tilesRef.current = null;
    };
    // initial mount only — dial updates handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live-apply dial changes
  useEffect(() => {
    tilesRef.current?.applySettings(valuesToSettings(controller.values));
  }, [controller.values]);

  return (
    <>
      <a id="back" href={import.meta.env.DEV ? "/" : "../../"}>
        ← back
      </a>
      <div id="mount" ref={hostRef} />
      <DialRoot
        position="top-right"
        defaultOpen
        theme="light"
        productionEnabled
      />
    </>
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);
