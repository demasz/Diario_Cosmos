export interface Apod {
  date: string;
  title: string;
  explanation: string;
  mediaType: "image" | "video";
  url: string;
  hdurl?: string;
  thumbnailUrl?: string;
}

type ApodErrorStatus = 400 | 502 | 503 | 504;

export class ApodError extends Error {
  readonly statusCode: ApodErrorStatus;

  constructor(
    message: string,
    statusCode: ApodErrorStatus,
  ) {
    super(message);
    this.name = "ApodError";
    this.statusCode = statusCode;
  }
}

const FIRST_APOD_DATE = "1995-06-16";
const REQUEST_TIMEOUT_MS = 10_000;

export function validateApodDate(input: unknown, now = new Date()): string {
  if (
    typeof input !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input) ||
    Number.isNaN(Date.parse(`${input}T00:00:00.000Z`)) ||
    new Date(`${input}T00:00:00.000Z`).toISOString().slice(0, 10) !== input
  ) {
    throw new ApodError("Informe uma data válida no formato AAAA-MM-DD.", 400);
  }

  const today = now.toISOString().slice(0, 10);
  if (input < FIRST_APOD_DATE || input > today) {
    throw new ApodError(
      `A data deve estar entre ${FIRST_APOD_DATE} e ${today}.`,
      400,
    );
  }

  return input;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  record: Record<string, unknown>,
  field: string,
): string {
  const value = record[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApodError("A NASA retornou dados incompletos para este APOD.", 502);
  }
  return value;
}

function secureUrl(value: unknown, required: true): string;
function secureUrl(value: unknown, required: false): string | undefined;
function secureUrl(
  value: unknown,
  required: boolean,
): string | undefined {
  if (value === undefined && !required) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ApodError("A NASA retornou uma URL inválida.", 502);
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      throw new Error("Unsupported protocol");
    }
    return url.href;
  } catch {
    throw new ApodError("A NASA retornou uma URL inválida.", 502);
  }
}

function parseApod(value: unknown, requestedDate: string): Apod {
  if (!isRecord(value)) {
    throw new ApodError("A NASA retornou uma resposta inválida.", 502);
  }

  const date = requiredString(value, "date");
  if (date !== requestedDate) {
    throw new ApodError("A NASA retornou uma data inesperada.", 502);
  }

  const mediaType = value.media_type;
  if (mediaType !== "image" && mediaType !== "video") {
    throw new ApodError("Este tipo de mídia não é suportado.", 502);
  }

  const hdurl = secureUrl(value.hdurl, false);
  const thumbnailUrl = secureUrl(value.thumbnail_url, false);

  return {
    date,
    title: requiredString(value, "title"),
    explanation: requiredString(value, "explanation"),
    mediaType,
    url: secureUrl(value.url, true),
    ...(hdurl ? { hdurl } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
  };
}

export async function fetchApod(
  inputDate: unknown,
  apiKey = process.env.NASA_API_KEY,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<Apod> {
  const date = validateApodDate(inputDate, now);
  if (!apiKey?.trim()) {
    throw new ApodError("A chave da API da NASA não está configurada.", 503);
  }

  const url = new URL("https://api.nasa.gov/planetary/apod");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("date", date);
  url.searchParams.set("thumbs", "true");

  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ApodError("A consulta à NASA excedeu o tempo limite.", 504);
    }
    throw new ApodError("Não foi possível conectar à API da NASA.", 502);
  }

  if (!response.ok) {
    throw new ApodError("A NASA não conseguiu fornecer este APOD.", 502);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApodError("A NASA retornou uma resposta inválida.", 502);
  }

  return parseApod(payload, date);
}
