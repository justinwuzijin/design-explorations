import { useMemo } from 'react';
import * as THREE from 'three';
import { PITCH } from '../sim/physics3d';

function createGrassTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#2f6b32';
  ctx.fillRect(0, 0, size, size);

  // Mowed stripes
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#356f38' : '#2a5f2d';
    ctx.fillRect(0, (i / 16) * size, size, size / 16);
  }

  // Noise
  for (let i = 0; i < 12000; i++) {
    const a = Math.random() * 0.12;
    ctx.fillStyle = Math.random() > 0.5 ? `rgba(20,60,25,${a})` : `rgba(180,220,120,${a})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 12);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export default function Pitch() {
  const grass = useMemo(() => createGrassTexture(), []);
  const halfL = PITCH.length * 0.5;
  const halfW = PITCH.width * 0.5;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[PITCH.width + 8, PITCH.length + 10]} />
        <meshStandardMaterial map={grass} roughness={0.95} metalness={0} />
      </mesh>

      {/* Touch / goal lines */}
      <LineRect
        width={PITCH.width}
        depth={PITCH.length}
        y={0.01}
        color="#f5f5f0"
      />

      {/* Halfway */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <planeGeometry args={[PITCH.width, 0.08]} />
        <meshBasicMaterial color="#f5f5f0" />
      </mesh>

      {/* Center circle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[3.55, 3.7, 64]} />
        <meshBasicMaterial color="#f5f5f0" side={THREE.DoubleSide} />
      </mesh>

      {/* Penalty box near goal */}
      <LineRect
        width={16.5}
        depth={5.5}
        y={0.012}
        z={PITCH.goalZ - 2.75}
        color="#f5f5f0"
      />

      {/* Outer apron / dirt edge fade via dark plane under */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[80, 90]} />
        <meshBasicMaterial color="#1a2418" />
      </mesh>

      {/* Soft side boards for depth */}
      <mesh position={[-halfW - 0.4, 0.35, 0]}>
        <boxGeometry args={[0.15, 0.7, PITCH.length]} />
        <meshStandardMaterial color="#c9c2b0" roughness={0.85} />
      </mesh>
      <mesh position={[halfW + 0.4, 0.35, 0]}>
        <boxGeometry args={[0.15, 0.7, PITCH.length]} />
        <meshStandardMaterial color="#c9c2b0" roughness={0.85} />
      </mesh>

      {/* Far stands suggestion */}
      <mesh position={[0, 2.4, halfL + 5]}>
        <boxGeometry args={[PITCH.width + 14, 4.8, 2.2]} />
        <meshStandardMaterial color="#5a6570" roughness={0.92} metalness={0.05} />
      </mesh>
      <mesh position={[0, 4.6, halfL + 5.2]}>
        <boxGeometry args={[PITCH.width + 16, 0.35, 2.6]} />
        <meshStandardMaterial color="#8b93a0" roughness={0.85} />
      </mesh>
    </group>
  );
}

function LineRect({
  width,
  depth,
  y,
  z = 0,
  color,
}: {
  width: number;
  depth: number;
  y: number;
  z?: number;
  color: string;
}) {
  const hw = width / 2;
  const hd = depth / 2;
  const t = 0.07;
  return (
    <group position={[0, y, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -hd]}>
        <planeGeometry args={[width, t]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, hd]}>
        <planeGeometry args={[width, t]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-hw, 0, 0]}>
        <planeGeometry args={[t, depth]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[hw, 0, 0]}>
        <planeGeometry args={[t, depth]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}
