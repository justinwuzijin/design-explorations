import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Gallery from './routes/Gallery';
import Stage from './routes/Stage';

// Code-split: three.js / r3f only download when you open the soccer curve.
const SoccerCurve = lazy(() => import('@soccer-curve/embed'));
const DesignTiles = lazy(() => import('@design-tiles/embed'));
const Envelope = lazy(() => import('@envelope/embed'));

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Gallery />} />
      <Route
        path="/soccer-curve"
        element={
          <Stage name="soccer-curve">
            <SoccerCurve />
          </Stage>
        }
      />
      <Route
        path="/design-tiles"
        element={
          <Stage name="design-tiles">
            <DesignTiles />
          </Stage>
        }
      />
      <Route
        path="/envelope"
        element={
          <Stage name="envelope">
            <Envelope />
          </Stage>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
