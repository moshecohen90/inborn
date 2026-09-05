import type { BatterySignal, MemoryPressure, PowerSource, Recommendation, ThermalState } from "@inborn/core";

/** What the shell consumes (spec §8.8): the merged signals plus the one status line / action the policy chose. */
export interface DeviceState {
  battery: BatterySignal;
  thermal: ThermalState;
  memoryPressure: MemoryPressure;
  powerSource: PowerSource;
  recommendation: Recommendation;
}
