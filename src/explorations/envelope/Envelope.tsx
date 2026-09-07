import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from 'motion/react';
import { DialRoot, useDialKitController } from 'dialkit';
import 'dialkit/styles.css';
import './envelope.css';

const HANDLE = 48;

const dialConfig = {
  paper: {
    tint: { type: 'color' as const, default: '#efe6d4' },
    seal: { type: 'color' as const, default: '#7a2d2d' },
  },
  actions: {
    reseal: { type: 'action' as const, label: 'Reseal' },
  },
};

export default function Envelope() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [travel, setTravel] = useState(280);
  const x = useMotionValue(0);

  const reseal = useCallback(() => {
    animate(x, 0, { type: 'spring', stiffness: 260, damping: 30 });
  }, [x]);

  const controller = useDialKitController('Envelope', dialConfig, {
    id: 'envelope',
    onAction: (path: string) => {
      if (path.endsWith('reseal')) reseal();
    },
  });

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const measure = () => {
      const next = Math.max(0, el.clientWidth - HANDLE);
      setTravel(next);
      if (x.get() > next) x.set(next);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [x]);

  const open = useTransform(x, [0, travel || 1], [0, 1]);
  const flapRotate = useTransform(open, [0, 1], [0, -168]);
  const letterY = useTransform(open, [0, 1], [42, -78]);
  const sealOpacity = useTransform(open, [0, 0.28], [1, 0]);
  const sealScale = useTransform(open, [0, 0.28], [1, 0.7]);

  const [hint, setHint] = useState('slide the blade');
  useMotionValueEvent(open, 'change', (value) => {
    setHint(value > 0.92 ? 'opened' : value > 0.08 ? 'opening…' : 'slide the blade');
  });

  const snapTo = useCallback(
    (openAll: boolean) => {
      animate(x, openAll ? travel : 0, { type: 'spring', stiffness: 280, damping: 28 });
    },
    [travel, x],
  );

  const snap = useCallback(
    (_event: unknown, info: { velocity: { x: number } }) => {
      const projected = x.get() + info.velocity.x * 0.18;
      snapTo(projected > travel * 0.38 || info.velocity.x > 700);
    },
    [snapTo, travel, x],
  );

  const paper = controller.values.paper.tint as string;
  const seal = controller.values.paper.seal as string;
  const flap = shade(paper, -8);

  return (
    <div
      className="envelope-scene"
      style={{ '--paper': paper, '--paper-flap': flap, '--seal': seal } as CSSProperties}
    >
      <div className="envelope-desk">
        <div className="envelope-stage" style={{ perspective: 1400 }}>
          <motion.div className="letter" style={{ y: letterY }}>
            <p className="letter-date">15 august 2026</p>
            <p className="letter-body">a folded thing, finally unsealed.</p>
          </motion.div>

          <div
            className="envelope"
            role="button"
            tabIndex={0}
            onClick={() => snapTo(x.get() <= travel * 0.5)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                snapTo(x.get() <= travel * 0.5);
              }
            }}
          >
            <div className="envelope-back">
              <span className="stamp" />
              <span className="addr-line" />
              <span className="addr-line short" />
              <span className="addr-line shorter" />
            </div>
            <div className="envelope-pocket" />

            <motion.div className="flap" style={{ rotateX: flapRotate }}>
              <div className="flap-face" />
              <div className="flap-back" />
            </motion.div>

            <motion.div className="seal" style={{ opacity: sealOpacity, scale: sealScale }} />
          </div>

          <div className="opener-track" ref={trackRef}>
            <motion.button
              type="button"
              className="opener"
              aria-label="Letter opener"
              drag="x"
              dragConstraints={{ left: 0, right: travel }}
              dragElastic={0.04}
              dragMomentum={false}
              style={{ x }}
              onDragEnd={snap}
            >
              <span className="opener-handle" />
              <span className="opener-blade" />
            </motion.button>
          </div>
        </div>

        <p className="envelope-hint">{hint}</p>
      </div>

      <DialRoot position="top-right" defaultOpen theme="light" productionEnabled />
    </div>
  );
}

function shade(hex: string, amount: number) {
  const raw = hex.replace('#', '');
  if (raw.length !== 6) return hex;
  const n = parseInt(raw, 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) + amount));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) + amount));
  const b = Math.min(255, Math.max(0, (n & 255) + amount));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
