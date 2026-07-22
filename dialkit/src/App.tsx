import { useSoccerDials } from './dials/useSoccerDials';
import { useShotSim } from './sim/useShotSim';
import BallStage from './components/BallStage';

export default function App() {
  const dials = useSoccerDials();
  const sim = useShotSim(dials);

  return (
    <div className="app-stage">
      <BallStage dials={dials} ball={sim.ball} status={sim.status} />

      <div className="controls-hint">
        <div className="hint-title">soccer curve</div>
        <div>
          <kbd>Space</kbd> Kick &nbsp; <kbd>R</kbd> Reset
        </div>
        <div className="hint-sub">
          Third-person chase · ball curves toward the net
          {sim.status === 'goal' && <span className="status goal"> · goal</span>}
          {sim.status === 'miss' && <span className="status miss"> · miss</span>}
        </div>
      </div>
    </div>
  );
}
