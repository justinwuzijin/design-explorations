import { useEffect, useRef } from "react";
import { DialRoot, useDialKitController, type DialConfig } from "dialkit";
import "dialkit/styles.css";
import { DesignTiles } from "./engine.js";
import { dialConfig, valuesToSettings } from "./dials.js";

const PANEL_ID = "design-tiles-type";

/**
 * The exploration itself, with no createRoot and no "← back" link — the shell's
 * Stage supplies both. main.tsx wraps this for standalone `bun dev`.
 */
export default function DesignTilesApp() {
  const hostRef = useRef<HTMLDivElement>(null);
  const tilesRef = useRef<DesignTiles | null>(null);

  // dials.js is plain JS, so its ranges infer as number[] rather than the
  // fixed-length tuples DialConfig wants. Runtime shape is correct; this only
  // bridges the untyped-JS boundary.
  const config = dialConfig as unknown as DialConfig;

  const controller = useDialKitController("Type Lockup", config, {
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
