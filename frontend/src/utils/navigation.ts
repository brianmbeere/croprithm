export interface NavigationDestination {
  address: string;
  latitude?: number | null;
  longitude?: number | null;
}

function locationValue(destination: NavigationDestination) {
  const { latitude, longitude } = destination;
  const validCoordinates =
    typeof latitude === "number" && Number.isFinite(latitude) && Math.abs(latitude) <= 90 &&
    typeof longitude === "number" && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
  return validCoordinates ? `${latitude},${longitude}` : destination.address.trim();
}

export function navigationLinks(destination: NavigationDestination, origin?: NavigationDestination) {
  const target = locationValue(destination);
  if (!target) return null;
  const start = origin && locationValue(origin);

  const google = new URL("https://www.google.com/maps/dir/");
  google.search = new URLSearchParams({
    api: "1", destination: target, travelmode: "driving",
    ...(start ? { origin: start } : { dir_action: "navigate" }),
  }).toString();
  const apple = new URL("https://maps.apple.com/");
  apple.search = new URLSearchParams({ daddr: target, dirflg: "d", ...(start ? { saddr: start } : {}) }).toString();
  return { google: google.toString(), apple: apple.toString() };
}
