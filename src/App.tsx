import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Gallery from './routes/Gallery';
import Stage from './routes/Stage';

const DesignTiles = lazy(() => import('@design-tiles/embed'));
const Envelope = lazy(() => import('./explorations/envelope/Envelope'));

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Gallery />} />
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
