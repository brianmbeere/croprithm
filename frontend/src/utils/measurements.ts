export type MeasurementSystem = "us" | "metric";
export const defaultMeasurementSystem: MeasurementSystem = "us";
export const defaultWeightUnit = (system: MeasurementSystem) => system === "metric" ? "kg" : "lb";
export const distanceUnit = (system: MeasurementSystem) => system === "metric" ? "km" : "mi";
export const fuelUnit = (system: MeasurementSystem) => system === "metric" ? "L" : "US gal";
export const distanceFromMiles = (miles: number, system: MeasurementSystem) => system === "metric" ? miles * 1.609344 : miles;
export const fuelFromGallons = (gallons: number, system: MeasurementSystem) => system === "metric" ? gallons * 3.785411784 : gallons;
export const weightFromKg = (kg: number, system: MeasurementSystem) => system === "metric" ? kg : kg / 0.45359237;

export function weightEquivalent(quantity: number, unit: string, system: MeasurementSystem): string | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const source = unit.trim().toLowerCase();
  let converted: number;
  if (system === "us" && /^(kg|kilograms?)$/.test(source)) converted = weightFromKg(quantity, system);
  else if (system === "us" && /^(g|grams?)$/.test(source)) converted = weightFromKg(quantity / 1000, system);
  else if (system === "metric" && /^(lb|lbs|pounds?)$/.test(source)) converted = quantity * 0.45359237;
  else if (system === "metric" && /^(oz|ounces?)$/.test(source)) converted = quantity * 0.45359237 / 16;
  else return null;
  return `≈ ${converted.toLocaleString("en-US", { maximumSignificantDigits: 3 })} ${defaultWeightUnit(system)}`;
}
