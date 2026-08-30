import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import SoccerCurve from './embed';

// Standalone entry (`cd dialkit && bun dev`). Inside the shell app the
// exploration is mounted as a route instead — see src/App.tsx.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SoccerCurve />
  </StrictMode>,
);
