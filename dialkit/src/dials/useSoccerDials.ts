import { useRef, useMemo, useCallback, useEffect } from 'react';
import { useDialKitController } from 'dialkit';

export type PathMode = 'physics' | 'draw' | 'edit';

export interface SoccerDials {
  wind: {
    strength: number;
    directionDeg: number;
    gust: boolean;
  };
  kick: {
    power: number;
    launchAngleDeg: number;
    aimX: number;
    sideSpin: number;
  };
  time: {
    timeScale: number;
    freeze: boolean;
  };
  path: {
    mode: PathMode;
    smoothExport: boolean;
  };
  actions: {
    kick: () => void;
    reset: () => void;
    randomizeWind: () => void;
    copyPath: () => void;
    enterEdit: () => void;
  };
  setMode: (mode: PathMode) => void;
}

const soccerDialConfig = {
  wind: {
    strength: [4, 0, 20, 0.5] as [number, number, number, number],
    directionDeg: [45, -180, 180, 1] as [number, number, number, number],
    gust: false,
  },
  kick: {
    power: [25, 5, 50, 1] as [number, number, number, number],
    launchAngleDeg: [25, 5, 60, 1] as [number, number, number, number],
    aimX: [0, -5, 5, 0.1] as [number, number, number, number],
    sideSpin: [12, -50, 50, 1] as [number, number, number, number],
  },
  time: {
    timeScale: [1, 0.05, 3, 0.05] as [number, number, number, number],
    freeze: false,
  },
  path: {
    mode: {
      type: 'select' as const,
      options: ['physics', 'draw', 'edit'],
      default: 'physics',
    },
    smoothExport: true,
  },
  actions: {
    kick: { type: 'action' as const, label: 'Kick / Replay' },
    reset: { type: 'action' as const, label: 'Reset' },
    randomizeWind: { type: 'action' as const, label: 'Randomize Wind' },
    copyPath: { type: 'action' as const, label: 'Copy Path' },
    enterEdit: { type: 'action' as const, label: 'Edit Path' },
  },
};

export function useSoccerDials(): SoccerDials {
  const controllerRef = useRef<any>(null);

  const kickCallback = useCallback(() => {
    window.dispatchEvent(new CustomEvent('soccer:kick'));
  }, []);

  const resetCallback = useCallback(() => {
    window.dispatchEvent(new CustomEvent('soccer:reset'));
  }, []);

  const randomizeWindCallback = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.setValues({
        wind: {
          strength: Math.round(Math.random() * 200) / 10,
          directionDeg: Math.round(Math.random() * 360 - 180),
          gust: Math.random() > 0.5,
        },
      });
    }
  }, []);

  const copyPathCallback = useCallback(() => {
    window.dispatchEvent(new CustomEvent('soccer:copy-path'));
  }, []);

  const enterEditCallback = useCallback(() => {
    window.dispatchEvent(new CustomEvent('soccer:enter-edit'));
  }, []);

  const setMode = useCallback((mode: PathMode) => {
    const cur = controllerRef.current?.values?.path;
    controllerRef.current?.setValues({
      path: {
        mode,
        smoothExport: cur?.smoothExport ?? true,
      },
    });
  }, []);

  const controller = useDialKitController('Soccer Ball Path', soccerDialConfig, {
    id: 'soccer-ball-path',
    onAction: (path: string) => {
      if (path.endsWith('kick')) kickCallback();
      else if (path.endsWith('reset')) resetCallback();
      else if (path.endsWith('randomizeWind')) randomizeWindCallback();
      else if (path.endsWith('copyPath')) copyPathCallback();
      else if (path.endsWith('enterEdit')) enterEditCallback();
    },
  });

  controllerRef.current = controller;
  const values = controller.values;

  useEffect(() => {
    const onSetEdit = () => setMode('edit');
    window.addEventListener('soccer:set-edit-mode', onSetEdit);
    return () => window.removeEventListener('soccer:set-edit-mode', onSetEdit);
  }, [setMode]);

  return useMemo(
    () => ({
      wind: {
        strength: values.wind.strength,
        directionDeg: values.wind.directionDeg,
        gust: values.wind.gust,
      },
      kick: {
        power: values.kick.power,
        launchAngleDeg: values.kick.launchAngleDeg,
        aimX: values.kick.aimX,
        sideSpin: values.kick.sideSpin,
      },
      time: {
        timeScale: values.time.timeScale,
        freeze: values.time.freeze,
      },
      path: {
        mode: values.path.mode as PathMode,
        smoothExport: values.path.smoothExport,
      },
      actions: {
        kick: kickCallback,
        reset: resetCallback,
        randomizeWind: randomizeWindCallback,
        copyPath: copyPathCallback,
        enterEdit: enterEditCallback,
      },
      setMode,
    }),
    [
      values,
      kickCallback,
      resetCallback,
      randomizeWindCallback,
      copyPathCallback,
      enterEditCallback,
      setMode,
    ]
  );
}
