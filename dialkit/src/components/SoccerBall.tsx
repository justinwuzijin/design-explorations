import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BALL_R, type BallState3D } from '../sim/physics3d';

function createBallMaps() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Warm leather base
  const base = ctx.createRadialGradient(
    size * 0.32,
    size * 0.28,
    size * 0.05,
    size * 0.5,
    size * 0.5,
    size * 0.72
  );
  base.addColorStop(0, '#ffffff');
  base.addColorStop(0.45, '#f4f1ea');
  base.addColorStop(0.85, '#d8d2c6');
  base.addColorStop(1, '#b8b0a2');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Micro grain
  for (let i = 0; i < 9000; i++) {
    const a = Math.random() * 0.07;
    ctx.fillStyle = Math.random() > 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.2, 1.2);
  }

  const drawPent = (cx: number, cy: number, r: number, rot = 0) => {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = rot + (i * 2 * Math.PI) / 5 - Math.PI / 2;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };

  // Classic black panels
  const panels: Array<[number, number, number, number]> = [
    [0.5, 0.5, 0.095, 0],
    [0.5, 0.2, 0.07, 0.15],
    [0.78, 0.35, 0.068, 0.4],
    [0.72, 0.7, 0.066, -0.25],
    [0.28, 0.7, 0.066, 0.35],
    [0.22, 0.35, 0.068, -0.5],
    [0.5, 0.82, 0.055, 0.1],
    [0.12, 0.55, 0.05, 0.6],
    [0.88, 0.55, 0.05, -0.6],
  ];

  for (const [u, v, s, rot] of panels) {
    drawPent(u * size, v * size, s * size, rot);
    const g = ctx.createRadialGradient(
      u * size - s * size * 0.2,
      v * size - s * size * 0.25,
      0,
      u * size,
      v * size,
      s * size
    );
    g.addColorStop(0, '#2a2a2a');
    g.addColorStop(0.7, '#111111');
    g.addColorStop(1, '#050505');
    ctx.fillStyle = g;
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // Seam network
  ctx.strokeStyle = 'rgba(25,22,18,0.45)';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(size * 0.5, size * 0.5, size * 0.26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(size * 0.5, size * 0.5, size * 0.4, 0.35, Math.PI * 1.55);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(size * 0.5, size * 0.5, size * 0.46, size * 0.22, 0.4, 0, Math.PI * 2);
  ctx.stroke();

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 16;

  // Roughness variation
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = 512;
  roughCanvas.height = 512;
  const rctx = roughCanvas.getContext('2d')!;
  rctx.fillStyle = '#6a6a6a';
  rctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4000; i++) {
    rctx.fillStyle = Math.random() > 0.5 ? '#7a7a7a' : '#555555';
    rctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);

  return { map, roughnessMap };
}

interface SoccerBallProps {
  ball: BallState3D;
}

export default function SoccerBall({ ball }: SoccerBallProps) {
  const group = useRef<THREE.Group>(null);
  const maps = useMemo(() => createBallMaps(), []);
  const q = useRef(new THREE.Quaternion());
  const omegaAxis = useRef(new THREE.Vector3());

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;

    g.position.set(ball.position.x, ball.position.y, ball.position.z);

    const ox = ball.omega.x;
    const oy = ball.omega.y;
    const oz = ball.omega.z;
    const w = Math.hypot(ox, oy, oz);
    if (w > 1e-4) {
      omegaAxis.current.set(ox, oy, oz).normalize();
      const dq = new THREE.Quaternion().setFromAxisAngle(omegaAxis.current, w * dt);
      q.current.premultiply(dq);
      g.quaternion.copy(q.current);
    }
  });

  return (
    <group ref={group}>
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[BALL_R, 96, 96]} />
        <meshPhysicalMaterial
          map={maps.map}
          roughnessMap={maps.roughnessMap}
          roughness={0.4}
          metalness={0.02}
          clearcoat={0.45}
          clearcoatRoughness={0.35}
          envMapIntensity={0.85}
        />
      </mesh>
    </group>
  );
}
