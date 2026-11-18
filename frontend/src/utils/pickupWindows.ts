export function pickupWindowTimes(startsAt: string, endsAt: string, now = Date.now()) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (!Number.isFinite(+start) || !Number.isFinite(+end)) throw new Error("Enter a start and end time.");
  if (+start <= now) throw new Error("Choose a start time in the future.");
  if (+end <= +start) throw new Error("Choose an end time after the start.");
  return { starts_at: start.toISOString(), ends_at: end.toISOString() };
}

export function pickupWindowEnd(startsAt: string, minutes: number) {
  const end = new Date(new Date(startsAt).getTime() + minutes * 60_000);
  if (!Number.isFinite(+end)) return "";
  return new Date(+end - end.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
const date = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function fulfillmentWindowLabel(start: string, end: string) {
  const first = new Date(start);
  const last = new Date(end);
  if (!Number.isFinite(+first) || !Number.isFinite(+last)) return "Window unavailable";
  return first.toDateString() === last.toDateString()
    ? `${date.format(first)}, ${time.format(first)} – ${time.format(last)}`
    : `${date.format(first)}, ${time.format(first)} – ${date.format(last)}, ${time.format(last)}`;
}
