import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { BallState2D } from '../sim/physics2d';

const R = 0.42;

function createBallTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Base leather
  const g = ctx.createRadialGradient(size * 0.35, size * 0.3, 0, size * 0.5, size * 0.5, size * 0.7);
  g.addColorStop(0, '#fafafa');
  g.addColorStop(0.55, '#ececec');
  g.addColorStop(1, '#cfcfcf');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // Subtle grain
  ctx.globalAlpha = 0.04;
  for (let i = 0; i < 1200; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? '#000' : '#fff';
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;

  const drawPent = (cx: number, cy: number, r: number) => {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  };

  ctx.fillStyle = '#141414';
  drawPent(size / 2, size / 2, size * 0.11);

  const ring = [
    [0.5, 0.22],
    [0.78, 0.38],
    [0.68, 0.72],
    [0.32, 0.72],
    [0.22, 0.38],
  ];
  for (const [u, v] of ring) {
    drawPent(u * size, v * size, size * 0.075);
  }

  // Seam lines
  ctx.strokeStyle = 'rgba(30,30,30,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.42, 0.2, Math.PI * 1.4);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

interface SoccerBallProps {
  ball: BallState2D;
  loft: number;
  fieldLength: number;
}

/** Map path coords → 3D: A at +z, B at -z, slight loft arc on Y. */
export function pathToWorld(x: number, y: number, loftDeg: number, fieldLength: number) {
  const t = Math.min(1, Math.max(0, y / fieldLength));
  const loft = Math.sin(t * Math.PI) * (0.4 + loftDeg * 0.035);
  return new THREE.Vector3(x * 0.55, R + loft, 6 - y * 0.45);
}

export default function SoccerBall({ ball, loft, fieldLength }: SoccerBallProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const tex = useMemo(() => createBallTexture(), []);
  const lastPos = useRef(new THREE.Vector3());
  const qSpin = useRef(new THREE.Quaternion());

  useFrame((_, dt) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const pos = pathToWorld(ball.position.x, ball.position.y, loft, fieldLength);
    mesh.position.copy(pos);

    // Spin around vertical (Magnus) + roll from travel direction
    const delta = pos.clone().sub(lastPos.current);
    const dist = delta.length();
    if (dist > 1e-5) {
      const axis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
      if (axis.lengthSq() > 1e-8) {
        axis.normalize();
        const rollQ = new THREE.Quaternion().setFromAxisAngle(axis, dist / R);
        qSpin.current.premultiply(rollQ);
      }
    }
    // Side spin (yaw)
    const yawQ = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      ball.omega * dt
    );
    qSpin.current.premultiply(yawQ);
    mesh.quaternion.copy(qSpin.current);
    lastPos.current.copy(pos);
  });

  return (
    <mesh ref={meshRef} castShadow>
      <sphereGeometry args={[R, 64, 64]} />
      <meshPhysicalMaterial
        map={tex}
        roughness={0.38}
        metalness={0.02}
        clearcoat={0.65}
        clearcoatRoughness={0.22}
        envMapIntensity={1.1}
      />
    </mesh>
  );
}
