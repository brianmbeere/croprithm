import { createContext, type ComponentChildren } from "preact";
import { useContext, useState } from "preact/hooks";
import { defaultMeasurementSystem, type MeasurementSystem } from "../utils/measurements";

const MeasurementContext = createContext<{
  system: MeasurementSystem;
  setSystem?: (system: MeasurementSystem) => void;
  storageError?: boolean;
}>({ system: defaultMeasurementSystem });

export const useMeasurementPreferences = () => useContext(MeasurementContext);

export function MeasurementPreferences({ uid, children }: { uid: string; children: ComponentChildren }) {
  const storageKey = `croprithm:measurement-system:${uid}`;
  const [preference, setPreference] = useState<{ system: MeasurementSystem; storageError?: boolean }>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return { system: saved === "metric" ? saved : defaultMeasurementSystem };
    } catch (error) {
      console.warn("Could not read the measurement preference", error);
      return { system: defaultMeasurementSystem, storageError: true };
    }
  });
  const setSystem = (system: MeasurementSystem) => {
    try {
      localStorage.setItem(storageKey, system);
      setPreference({ system });
    } catch (error) {
      console.warn("Could not save the measurement preference", error);
      setPreference({ system, storageError: true });
    }
  };
  return <MeasurementContext.Provider value={{ ...preference, setSystem }}>{children}</MeasurementContext.Provider>;
}
