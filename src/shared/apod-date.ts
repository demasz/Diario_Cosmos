export const FIRST_APOD_DATE = "1995-06-16";

const APOD_TIME_ZONE = "America/New_York";
const apodDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APOD_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const apodDisplayDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

export function formatApodDate(date: string): string {
  return apodDisplayDateFormatter.format(new Date(`${date}T00:00:00.000Z`));
}

export function parseBrazilianApodDate(value: string): string | undefined {
  const match = /^([0-9]{2})\/([0-9]{2})\/([0-9]{4})$/.exec(value);
  if (!match) {
    return undefined;
  }

  const day = match[1];
  const month = match[2];
  const year = match[3];
  if (!day || !month || !year) {
    return undefined;
  }

  const isoDate = `${year}-${month}-${day}`;
  const timestamp = Date.parse(`${isoDate}T00:00:00.000Z`);
  if (
    Number.isNaN(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== isoDate
  ) {
    return undefined;
  }

  return isoDate;
}

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
