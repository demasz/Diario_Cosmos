import { parse } from "node-html-parser";
import {
  FIRST_APOD_DATE,
  formatApodDate,
  getApodCurrentDate,
} from "../shared/apod-date.ts";

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

  constructor(message: string, statusCode: ApodErrorStatus) {
    super(message);
    this.name = "ApodError";
    this.statusCode = statusCode;
  }
}

const NASA_API_TIMEOUT_MS = 10_000;
const NASA_SCIENCE_TIMEOUT_MS = 8_000;

export function validateApodDate(input: unknown, now = new Date()): string {
  if (
    typeof input !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input) ||
    Number.isNaN(Date.parse(`${input}T00:00:00.000Z`)) ||
    new Date(`${input}T00:00:00.000Z`).toISOString().slice(0, 10) !== input
  ) {
    throw new ApodError("Informe uma data válida.", 400);
  }

  const today = getApodCurrentDate(now);
  if (input < FIRST_APOD_DATE || input > today) {
    throw new ApodError(
      `A data deve estar entre ${formatApodDate(FIRST_APOD_DATE)} e ${formatApodDate(today)}.`,
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
    throw new ApodError(
      "A NASA retornou dados incompletos para esta imagem do dia.",
      502,
    );
  }
  return value;
}

function secureUrl(value: unknown, required: true): string;
function secureUrl(value: unknown, required: false): string | undefined;
function secureUrl(value: unknown, required: boolean): string | undefined {
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

function isGenericNasaPlaceholder(value: string): boolean {
  const url = new URL(value);
  return (
    url.hostname === "science.nasa.gov" &&
    url.pathname.endsWith("/nasa-logo@2x.png")
  );
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

  const sourceUrl = secureUrl(value.url, true);
  const hdurl = secureUrl(value.hdurl, false);
  const thumbnailUrl = secureUrl(value.thumbnail_url, false);
  const mediaUrl = mediaType === "image" && hdurl ? hdurl : sourceUrl;

  if (mediaType === "image" && isGenericNasaPlaceholder(mediaUrl)) {
    throw new ApodError(
      "A NASA retornou uma imagem indisponível para esta data.",
      502,
    );
  }

  return {
    date,
    title: requiredString(value, "title"),
    explanation: requiredString(value, "explanation"),
    mediaType,
    url: mediaUrl,
    ...(hdurl ? { hdurl } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
  };
}

function getArticleSlugPrefix(date: string): string {
  const month = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  })
    .format(new Date(`${date}T00:00:00.000Z`))
    .toLowerCase();
  return `apod-${date.slice(0, 4)}-${month}-${Number(date.slice(8, 10))}`;
}

function getWordPressPost(value: unknown, date: string): string {
  if (!Array.isArray(value)) {
    throw new ApodError("A NASA Science retornou uma resposta inválida.", 502);
  }

  const slugPrefix = getArticleSlugPrefix(date);
  const post = value.find(
    (item): item is Record<string, unknown> =>
      isRecord(item) &&
      typeof item.slug === "string" &&
      (item.slug === slugPrefix || item.slug.startsWith(`${slugPrefix}-`)) &&
      typeof item.date === "string" &&
      item.date.slice(0, 10) === date,
  );

  if (!post) {
    throw new ApodError(
      `A imagem do dia de ${formatApodDate(date)} não foi encontrada no catálogo oficial da NASA.`,
      502,
    );
  }

  if (!isRecord(post.content)) {
    throw new ApodError("A NASA Science retornou dados incompletos.", 502);
  }
  const rendered = post.content.rendered;
  if (typeof rendered !== "string" || rendered.trim() === "") {
    throw new ApodError("A NASA Science retornou dados incompletos.", 502);
  }
  return rendered;
}

function parseWordPressApod(html: string, date: string): Apod {
  const article = parse(html);
  const title = article.querySelector("h1")?.text.trim();
  const description =
    article.querySelector(".media-detail-hero__description")?.text.trim();
  if (!title || !description) {
    throw new ApodError("A NASA Science retornou dados incompletos.", 502);
  }

  const media = article.querySelector(".media-detail-hero__media") ?? article;
  const image = media.querySelector("img");
  const iframe = media.querySelector("iframe");
  const video = media.querySelector("video");

  let mediaType: Apod["mediaType"];
  let url: string;
  if (iframe) {
    mediaType = "video";
    url = secureUrl(iframe.getAttribute("src"), true);
  } else if (video) {
    mediaType = "video";
    const source =
      video.getAttribute("src") ??
      video.querySelector("source")?.getAttribute("src");
    url = secureUrl(source, true);
  } else if (image) {
    mediaType = "image";
    url = secureUrl(image.getAttribute("src"), true);
  } else {
    throw new ApodError(
      "A NASA Science não retornou mídia para esta data.",
      502,
    );
  }

  const hdurl =
    mediaType === "image" && image
      ? secureUrl(image.closest("a")?.getAttribute("href"), false)
      : undefined;
  const thumbnailUrl =
    mediaType === "video" && image
      ? secureUrl(image.getAttribute("src"), false)
      : undefined;
  const explanation = description
    .replace(/^Explanation:\s*/i, "")
    .replace(/\s*Tomorrow(?:'|’|&rsquo;)s picture:[\s\S]*$/i, "")
    .trim();

  if (!explanation) {
    throw new ApodError("A NASA Science retornou dados incompletos.", 502);
  }

  return {
    date,
    title,
    explanation,
    mediaType,
    url,
    ...(hdurl ? { hdurl } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
  };
}

async function fetchPrimaryApod(
  date: string,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<Apod> {
  const url = new URL("https://api.nasa.gov/planetary/apod");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("date", date);
  url.searchParams.set("thumbs", "true");

  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(NASA_API_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ApodError("A consulta à API da NASA excedeu o tempo limite.", 504);
    }
    throw new ApodError("Não foi possível conectar à API da NASA.", 502);
  }

  if (!response.ok) {
    throw new ApodError(
      "A API da NASA não conseguiu fornecer a imagem desta data.",
      502,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApodError("A API da NASA retornou uma resposta inválida.", 502);
  }

  return parseApod(payload, date);
}

async function fetchNasaScienceApod(
  date: string,
  fetcher: typeof fetch,
): Promise<Apod> {
  const url = new URL(
    "https://science.nasa.gov/wp-json/wp/v2/image-article",
  );
  url.searchParams.set("search", getArticleSlugPrefix(date));
  url.searchParams.set("per_page", "5");
  url.searchParams.set("_fields", "date,slug,content");

  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(NASA_SCIENCE_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ApodError(
        "A consulta alternativa da NASA excedeu o tempo limite.",
        504,
      );
    }
    throw new ApodError("Não foi possível conectar à NASA Science.", 502);
  }

  if (!response.ok) {
    throw new ApodError(
      "A NASA Science não conseguiu fornecer a imagem desta data.",
      502,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApodError("A NASA Science retornou uma resposta inválida.", 502);
  }

  return parseWordPressApod(getWordPressPost(payload, date), date);
}

export async function fetchApod(
  inputDate: unknown,
  apiKey = process.env.NASA_API_KEY,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<Apod> {
  const date = validateApodDate(inputDate, now);
  if (!apiKey?.trim()) {
    throw new ApodError(
      "Configure NASA_API_KEY no arquivo .env local para consultar a NASA.",
      503,
    );
  }

  try {
    return await fetchPrimaryApod(date, apiKey, fetcher);
  } catch (primaryError) {
    if (
      primaryError instanceof ApodError &&
      primaryError.statusCode === 400
    ) {
      throw primaryError;
    }
  }

  return fetchNasaScienceApod(date, fetcher);
}
