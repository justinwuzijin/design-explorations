import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SoccerDials } from '../dials/useSoccerDials';
import {
  FIELD,
  pointsToPathD,
  pointsToSmoothPathD,
  type Vec2,
} from '../sim/physics2d';

const W = 100;
const H = 140;
const PAD = 8;

function worldToSvg(p: Vec2): Vec2 {
  // x: -halfW..halfW → PAD..W-PAD
  // y: 0..length → H-PAD..PAD (bottom → top)
  const sx = ((p.x + FIELD.halfWidth) / (FIELD.halfWidth * 2)) * (W - PAD * 2) + PAD;
  const sy = (1 - p.y / FIELD.length) * (H - PAD * 2) + PAD;
  return { x: sx, y: sy };
}

function svgToWorld(p: Vec2): Vec2 {
  const x =
    ((p.x - PAD) / (W - PAD * 2)) * FIELD.halfWidth * 2 - FIELD.halfWidth;
  const y = (1 - (p.y - PAD) / (H - PAD * 2)) * FIELD.length;
  return { x, y };
}

interface PathOverlayProps {
  dials: SoccerDials;
  path: Vec2[];
  setPath: (pts: Vec2[]) => void;
  onCopyFeedback: (msg: string) => void;
}

/** Transparent path editor over the 3D stage — no pitch, just the curve. */
export default function PathOverlay({
  dials,
  path,
  setPath,
  onCopyFeedback,
}: PathOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drawing = useRef(false);
  const dragIdx = useRef<number | null>(null);
  const pathRef = useRef(path);
  pathRef.current = path;
  const [hover, setHover] = useState(false);

  const svgPath = useMemo(() => {
    const mapped = path.map(worldToSvg);
    return dials.path.smoothExport
      ? pointsToSmoothPathD(mapped)
      : pointsToPathD(mapped);
  }, [path, dials.path.smoothExport]);

  const clientToWorld = useCallback((clientX: number, clientY: number): Vec2 | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const local = pt.matrixTransform(ctm.inverse());
    return svgToWorld({ x: local.x, y: local.y });
  }, []);

  const copyPath = useCallback(async () => {
    if (!svgPath) {
      onCopyFeedback('No path to copy — kick or draw first');
      return;
    }
    const payload = `<path d="${svgPath}" fill="none" stroke="currentColor" />`;
    try {
      await navigator.clipboard.writeText(payload);
      onCopyFeedback('Path copied to clipboard');
    } catch {
      onCopyFeedback('Clipboard blocked — check console');
      console.log(payload);
    }
  }, [svgPath, onCopyFeedback]);

  useEffect(() => {
    const onCopy = () => void copyPath();
    const onEdit = () => {
      if (pathRef.current.length >= 2) {
        dials.setMode('edit');
        onCopyFeedback('Edit mode — drag handles, then Copy Path');
      } else {
        onCopyFeedback('Need a path first (kick or draw)');
      }
    };
    window.addEventListener('soccer:copy-path', onCopy);
    window.addEventListener('soccer:enter-edit', onEdit);
    return () => {
      window.removeEventListener('soccer:copy-path', onCopy);
      window.removeEventListener('soccer:enter-edit', onEdit);
    };
  }, [copyPath, dials, onCopyFeedback]);

  const interactive = dials.path.mode === 'draw' || dials.path.mode === 'edit';

  const onPointerDown = (e: React.PointerEvent) => {
    if (!interactive) return;
    const w = clientToWorld(e.clientX, e.clientY);
    if (!w) return;

    if (dials.path.mode === 'draw') {
      drawing.current = true;
      svgRef.current?.setPointerCapture(e.pointerId);
      pathRef.current = [w];
      setPath([w]);
      return;
    }

    let best = -1;
    let bestD = FIELD.halfWidth * 0.2;
    path.forEach((p, i) => {
      const d = Math.hypot(p.x - w.x, p.y - w.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0) {
      dragIdx.current = best;
      svgRef.current?.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!interactive) return;
    const w = clientToWorld(e.clientX, e.clientY);
    if (!w) return;

    if (dials.path.mode === 'draw' && drawing.current) {
      const prev = pathRef.current;
      const last = prev[prev.length - 1];
      if (!last || Math.hypot(last.x - w.x, last.y - w.y) > 0.2) {
        const next = [...prev, w];
        pathRef.current = next;
        setPath(next);
      }
      return;
    }

    if (dials.path.mode === 'edit' && dragIdx.current !== null) {
      const i = dragIdx.current;
      const next = pathRef.current.map((p, idx) => (idx === i ? w : p));
      pathRef.current = next;
      setPath(next);
    }
  };

  const onPointerUp = () => {
    drawing.current = false;
    dragIdx.current = null;
  };

  return (
    <svg
      ref={svgRef}
      className={`path-overlay ${interactive ? 'interactive' : ''}`}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <defs>
        <clipPath id="path-clip">
          <rect x={PAD} y={PAD} width={W - PAD * 2} height={H - PAD * 2} rx={2} />
        </clipPath>
      </defs>

      {/* Invisible clip region — click curve to enter edit */}
      <g clipPath="url(#path-clip)">
        {svgPath && (
          <>
            <path
              className="curve-hit"
              d={svgPath}
              fill="none"
              stroke="transparent"
              strokeWidth={8}
              style={{
                cursor: dials.path.mode === 'edit' ? 'default' : 'pointer',
                pointerEvents: 'stroke',
              }}
              onPointerEnter={() => setHover(true)}
              onPointerLeave={() => setHover(false)}
              onClick={(e) => {
                e.stopPropagation();
                if (dials.path.mode !== 'edit' && path.length >= 2) {
                  dials.setMode('edit');
                  onCopyFeedback('Edit mode — drag handles, then Copy Path');
                }
              }}
            />
            <path
              d={svgPath}
              fill="none"
              stroke={
                hover || dials.path.mode === 'edit'
                  ? 'rgba(255,160,80,0.85)'
                  : 'rgba(255,107,53,0.55)'
              }
              strokeWidth={dials.path.mode === 'edit' ? 1.1 : 0.7}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: 'none' }}
            />
          </>
        )}
      </g>

      {dials.path.mode === 'edit' &&
        path.map((p, i) => {
          const s = worldToSvg(p);
          return (
            <circle
              key={i}
              className="edit-handle"
              cx={s.x}
              cy={s.y}
              r={1.6}
              fill="#fff"
              stroke="#ff6b35"
              strokeWidth={0.45}
              style={{ cursor: 'grab', pointerEvents: 'auto' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                dragIdx.current = i;
                svgRef.current?.setPointerCapture(e.pointerId);
              }}
            />
          );
        })}

      {/* A / B markers only — no pitch */}
      <text x={W / 2} y={H - PAD + 4} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={3.2}>
        A
      </text>
      <text x={W / 2} y={PAD - 1.5} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={3.2}>
        B
      </text>

      {dials.path.mode === 'draw' && (
        <text
          x={W / 2}
          y={H / 2}
          textAnchor="middle"
          fill="rgba(255,255,255,0.4)"
          fontSize={3.5}
          style={{ pointerEvents: 'none' }}
        >
          Draw A → B
        </text>
      )}
    </svg>
  );
}
