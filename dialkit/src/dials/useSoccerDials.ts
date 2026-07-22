import { useCallback, useMemo, useRef } from 'react';
import { useDialKitController } from 'dialkit';

export interface SoccerDials {
  shot: {
    power: number;
    loftDeg: number;
    aimX: number;
    curve: number;
    varyDirections: boolean;
    autoReplay: boolean;
  };
  cam: {
    distance: number;
    height: number;
    lag: number;
  };
  time: {
    timeScale: number;
    freeze: boolean;
  };
  actions: {
    kick: () => void;
    reset: () => void;
  };
}

const soccerDialConfig = {
  shot: {
    power: [22, 8, 40, 1] as [number, number, number, number],
    loftDeg: [18, 4, 45, 1] as [number, number, number, number],
    aimX: [0, -3.5, 3.5, 0.1] as [number, number, number, number],
    curve: [16, -40, 40, 1] as [number, number, number, number],
    varyDirections: true,
    autoReplay: true,
  },
  cam: {
    distance: [4.8, 2.5, 10, 0.1] as [number, number, number, number],
    height: [1.6, 0.6, 4, 0.05] as [number, number, number, number],
    lag: [0.08, 0.02, 0.25, 0.01] as [number, number, number, number],
  },
  time: {
    timeScale: [1, 0.15, 2, 0.05] as [number, number, number, number],
    freeze: false,
  },
  actions: {
    kick: { type: 'action' as const, label: 'Kick / Replay' },
    reset: { type: 'action' as const, label: 'Reset' },
  },
};

export function useSoccerDials(): SoccerDials {
  const kickCallback = useCallback(() => {
    window.dispatchEvent(new CustomEvent('soccer:kick'));
  }, []);

  const resetCallback = useCallback(() => {
    window.dispatchEvent(new CustomEvent('soccer:reset'));
  }, []);

  const controller = useDialKitController('Soccer Curve', soccerDialConfig, {
    id: 'soccer-curve-3d',
    onAction: (path: string) => {
      if (path.endsWith('kick')) kickCallback();
      else if (path.endsWith('reset')) resetCallback();
    },
  });

  const values = controller.values;
  const valuesRef = useRef(values);
  valuesRef.current = values;

  return useMemo(
    () => ({
      shot: {
        power: values.shot.power,
        loftDeg: values.shot.loftDeg,
        aimX: values.shot.aimX,
        curve: values.shot.curve,
        varyDirections: values.shot.varyDirections,
        autoReplay: values.shot.autoReplay,
      },
      cam: {
        distance: values.cam.distance,
        height: values.cam.height,
        lag: values.cam.lag,
      },
      time: {
        timeScale: values.time.timeScale,
        freeze: values.time.freeze,
      },
      actions: {
        kick: kickCallback,
        reset: resetCallback,
      },
    }),
    [values, kickCallback, resetCallback]
  );
}
