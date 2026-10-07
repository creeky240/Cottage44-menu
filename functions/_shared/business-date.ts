const BUSINESS_TIME_ZONE = "Africa/Johannesburg";

export function getBusinessDate(now = new Date()): string {
  if (!Number.isFinite(now.getTime())) {
    throw new RangeError("Invalid date.");
  }

  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    calendar: "iso8601",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const parts = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]));

  return `${parts.year}-${parts.month}-${parts.day}`;
}
