import { useCallback, useState } from 'react';
import { useSoccerDials } from './dials/useSoccerDials';
import { useCurveSim } from './sim/useCurveSim';
import BallStage from './components/BallStage';
import PathOverlay from './components/PathOverlay';

export default function App() {
  const dials = useSoccerDials();
  const sim = useCurveSim(dials);
  const [toast, setToast] = useState<string | null>(null);

  const onCopyFeedback = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  return (
    <div className="app-stage">
      <BallStage dials={dials} ball={sim.ball} path={sim.path} />
      <PathOverlay
        dials={dials}
        path={sim.path}
        setPath={sim.setPath}
        onCopyFeedback={onCopyFeedback}
      />

      <div className="controls-hint">
        <div>
          <kbd>Space</kbd> Kick / Replay &nbsp; <kbd>R</kbd> Reset
        </div>
        <div className="hint-modes">
          Mode: <strong>{dials.path.mode}</strong>
          {dials.path.mode === 'physics' && ' — Magnus curve A → B'}
          {dials.path.mode === 'draw' && ' — sketch path A → B'}
          {dials.path.mode === 'edit' && ' — drag handles · Copy Path'}
        </div>
        <div className="hint-sub">Click the orange path to enter edit mode</div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
