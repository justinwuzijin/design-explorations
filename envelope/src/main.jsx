import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Envelope from './embed.jsx'

// Standalone entry (`cd envelope && bun dev`). The .stage-envelope wrapper
// matches what the shell's Stage renders, so the scoped CSS applies either way.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <div className="stage-envelope">
      <Envelope />
    </div>
  </StrictMode>,
)
