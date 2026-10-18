import test from "node:test";
import assert from "node:assert/strict";
import { navigationLinks } from "../src/utils/navigation.ts";

test("prefers coordinates in latitude,longitude order including zero", () => {
  const links = navigationLinks({ address: "Farm", latitude: 0, longitude: 36.8 });
  const google = new URL(links.google);
  const apple = new URL(links.apple);
  assert.equal(google.searchParams.get("destination"), "0,36.8");
  assert.equal(google.searchParams.get("api"), "1");
  assert.equal(google.searchParams.get("travelmode"), "driving");
  assert.equal(google.searchParams.get("dir_action"), "navigate");
  assert.equal(google.searchParams.has("origin"), false);
  assert.equal(apple.searchParams.get("daddr"), "0,36.8");
  assert.equal(apple.searchParams.get("dirflg"), "d");
});

test("encodes addresses without allowing query injection", () => {
  const address = "Farm & Market #2, Nairobi?avoid=tolls";
  const links = navigationLinks({ address });
  assert.equal(new URL(links.google).searchParams.get("destination"), address);
  assert.equal(new URL(links.apple).searchParams.get("daddr"), address);
  assert.equal(new URL(links.google).searchParams.has("avoid"), false);
});

test("invalid or incomplete coordinates use address, never half a coordinate pair", () => {
  for (const [latitude, longitude] of [[91, 36], [NaN, 36], [1, 181], [null, 36], [1, Infinity]]) {
    const links = navigationLinks({ address: " Market ", latitude, longitude });
    assert.equal(new URL(links.google).searchParams.get("destination"), "Market");
  }
});

test("missing destinations are unavailable; valid coordinates need no address", () => {
  assert.equal(navigationLinks({ address: " " }), null);
  assert.equal(navigationLinks({ address: "", latitude: 91, longitude: 0 }), null);
  assert.equal(new URL(navigationLinks({ address: "", latitude: -90, longitude: -180 }).apple)
    .searchParams.get("daddr"), "-90,-180");
});
