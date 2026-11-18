import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultMeasurementSystem, defaultWeightUnit, distanceFromMiles, distanceUnit,
  fuelFromGallons, fuelUnit, weightEquivalent, weightFromKg,
} from "../src/utils/measurements.ts";

test("U.S. customary is the default and metric converts route values", () => {
  assert.equal(defaultMeasurementSystem, "us");
  assert.equal(defaultWeightUnit("us"), "lb");
  assert.equal(defaultWeightUnit("metric"), "kg");
  assert.equal(distanceFromMiles(10, "metric"), 16.09344);
  assert.equal(distanceFromMiles(10, "us"), 10);
  assert.equal(distanceUnit("metric"), "km");
  assert.equal(distanceUnit("us"), "mi");
  assert.equal(fuelFromGallons(1, "metric"), 3.785411784);
  assert.equal(fuelUnit("us"), "US gal");
  assert.equal(weightFromKg(0.45359237, "us"), 1);
});

test("only known weight units get approximate equivalents", () => {
  assert.equal(weightEquivalent(3, " KG ", "us"), "≈ 6.61 lb");
  assert.equal(weightEquivalent(500, "grams", "us"), "≈ 1.1 lb");
  assert.equal(weightEquivalent(10, "lbs", "metric"), "≈ 4.54 kg");
  assert.equal(weightEquivalent(16, "oz", "metric"), "≈ 0.454 kg");
  for (const unit of ["case", "each", "fl oz", "bunch", "kg"]) {
    assert.equal(weightEquivalent(4, unit, "metric"), null);
  }
  assert.equal(weightEquivalent(Infinity, "kg", "us"), null);
  assert.equal(weightEquivalent(0, "kg", "us"), null);
});
