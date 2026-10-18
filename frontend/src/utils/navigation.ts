export interface NavigationDestination {
  address: string;
  latitude?: number | null;
  longitude?: number | null;
}

export function navigationLinks(destination: NavigationDestination) {
  const { latitude, longitude } = destination;
  const validCoordinates =
    typeof latitude === "number" && Number.isFinite(latitude) && Math.abs(latitude) <= 90 &&
    typeof longitude === "number" && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
  const target = validCoordinates ? `${latitude},${longitude}` : destination.address.trim();
  if (!target) return null;

  const google = new URL("https://www.google.com/maps/dir/");
  google.search = new URLSearchParams({
    api: "1", destination: target, travelmode: "driving", dir_action: "navigate",
  }).toString();
  const apple = new URL("https://maps.apple.com/");
  apple.search = new URLSearchParams({ daddr: target, dirflg: "d" }).toString();
  return { google: google.toString(), apple: apple.toString() };
}
