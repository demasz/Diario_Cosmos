export const FIRST_APOD_DATE = "1995-06-16";

const APOD_TIME_ZONE = "America/New_York";
const apodDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APOD_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function getApodCurrentDate(now = new Date()): string {
  let year = "";
  let month = "";
  let day = "";

  for (const part of apodDateFormatter.formatToParts(now)) {
    if (part.type === "year") year = part.value;
    if (part.type === "month") month = part.value;
    if (part.type === "day") day = part.value;
  }

  if (!year || !month || !day) {
    throw new Error("Não foi possível determinar a data atual do APOD.");
  }

  return `${year}-${month}-${day}`;
}
