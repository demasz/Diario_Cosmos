import "./styles.css";

interface Apod {
  date: string;
  title: string;
  explanation: string;
  mediaType: "image" | "video";
  url: string;
  hdurl?: string;
  thumbnailUrl?: string;
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Elemento obrigatório não encontrado: ${selector}`);
  }
  return element;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseApod(value: unknown, requestedDate: string): Apod {
  if (!isRecord(value)) {
    throw new Error("A resposta do servidor não está no formato esperado.");
  }

  const record = value;
  if (
    record.date !== requestedDate ||
    typeof record.title !== "string" ||
    typeof record.explanation !== "string" ||
    (record.mediaType !== "image" && record.mediaType !== "video") ||
    typeof record.url !== "string" ||
    (record.hdurl !== undefined && typeof record.hdurl !== "string") ||
    (record.thumbnailUrl !== undefined &&
      typeof record.thumbnailUrl !== "string")
  ) {
    throw new Error("A resposta do servidor não está no formato esperado.");
  }

  return {
    date: record.date,
    title: record.title,
    explanation: record.explanation,
    mediaType: record.mediaType,
    url: record.url,
    ...(record.hdurl ? { hdurl: record.hdurl } : {}),
    ...(record.thumbnailUrl ? { thumbnailUrl: record.thumbnailUrl } : {}),
  };
}

const apodSection = requiredElement<HTMLElement>("#apod");
const mediaContent = requiredElement<HTMLElement>("#media-content");
const mediaCaption = requiredElement<HTMLElement>("#media-caption");
const titleElement = requiredElement<HTMLHeadingElement>("#apod-title");
const dateLabel = requiredElement<HTMLTimeElement>("#apod-date-label");
const explanationPanel = requiredElement<HTMLElement>("#explicacao");
const explanationElement = requiredElement<HTMLElement>("#apod-explanation");
const loadingState = requiredElement<HTMLElement>("#loading-state");
const errorState = requiredElement<HTMLElement>("#error-state");
const dateForm = requiredElement<HTMLFormElement>("#date-form");
const dateInput = requiredElement<HTMLInputElement>("#apod-date");
const submitButton = requiredElement<HTMLButtonElement>(
  "#date-form button[type='submit']",
);

const firstApodDate = "1995-06-16";
const today = new Date().toISOString().slice(0, 10);
dateInput.min = firstApodDate;
dateInput.max = today;
dateInput.value = today;

let activeController: AbortController | undefined;

function createImage(url: string, title: string): HTMLImageElement {
  const image = document.createElement("img");
  image.src = url;
  image.alt = title;
  image.decoding = "async";
  return image;
}

function createVideoEmbedUrl(source: string): string | undefined {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    return undefined;
  }

  const youtubeHosts = new Set([
    "youtu.be",
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
  ]);
  if (youtubeHosts.has(url.hostname)) {
    const segments = url.pathname.split("/").filter(Boolean);
    const videoId =
      url.hostname === "youtu.be"
        ? segments[0]
        : url.searchParams.get("v") ??
          (segments[0] === "embed" || segments[0] === "shorts"
            ? segments[1]
            : undefined);
    if (videoId && /^[\w-]{11}$/.test(videoId)) {
      return `https://www.youtube-nocookie.com/embed/${videoId}`;
    }
    return undefined;
  }

  const vimeoHosts = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);
  if (vimeoHosts.has(url.hostname)) {
    const segments = url.pathname.split("/").filter(Boolean);
    const videoId =
      url.hostname === "player.vimeo.com" && segments[0] === "video"
        ? segments[1]
        : segments[0];
    if (videoId && /^\d+$/.test(videoId)) {
      return `https://player.vimeo.com/video/${videoId}`;
    }
  }

  return undefined;
}

function createVideoFrame(source: string, title: string): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.src = source;
  frame.title = `Vídeo: ${title}`;
  frame.loading = "lazy";
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.allow =
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  frame.allowFullscreen = true;
  return frame;
}

function createVideoPreview(apod: Apod, embedUrl: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "video-preview";
  button.type = "button";
  button.setAttribute("aria-label", `Reproduzir vídeo: ${apod.title}`);

  if (apod.thumbnailUrl) {
    const image = createImage(apod.thumbnailUrl, "");
    image.alt = "";
    button.append(image);
  }

  const label = document.createElement("span");
  label.className = "play-label";
  label.textContent = "Reproduzir vídeo";
  button.append(label);
  button.addEventListener("click", () => {
    mediaContent.replaceChildren(createVideoFrame(embedUrl, apod.title));
  });
  return button;
}

function setCaption(apod: Apod): void {
  const captionLink = document.createElement("a");
  captionLink.target = "_blank";
  captionLink.rel = "noopener noreferrer";

  if (apod.mediaType === "image" && apod.hdurl) {
    captionLink.href = apod.hdurl;
    captionLink.textContent = "Ver imagem em alta resolução";
  } else if (apod.mediaType === "video") {
    captionLink.href = apod.url;
    captionLink.textContent = "Abrir vídeo na fonte original";
  } else {
    mediaCaption.hidden = true;
    return;
  }

  mediaCaption.replaceChildren(captionLink);
  mediaCaption.hidden = false;
}

function renderMedia(apod: Apod): void {
  mediaContent.classList.toggle("is-video", apod.mediaType === "video");
  if (apod.mediaType === "image") {
    mediaContent.replaceChildren(createImage(apod.url, apod.title));
  } else {
    const embedUrl = createVideoEmbedUrl(apod.url);
    if (embedUrl) {
      mediaContent.replaceChildren(createVideoPreview(apod, embedUrl));
    } else {
      const elements: HTMLElement[] = [];
      if (apod.thumbnailUrl) {
        elements.push(createImage(apod.thumbnailUrl, `Prévia: ${apod.title}`));
      }
      const link = document.createElement("a");
      link.className = "external-video-link";
      link.href = apod.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Assistir vídeo na fonte original";
      elements.push(link);
      mediaContent.replaceChildren(...elements);
    }
  }
  setCaption(apod);
}

function formatApodDate(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function showApod(apod: Apod): void {
  renderMedia(apod);
  titleElement.textContent = apod.title;
  dateLabel.dateTime = apod.date;
  dateLabel.textContent = formatApodDate(apod.date);
  dateLabel.hidden = false;
  explanationElement.textContent = apod.explanation;
  explanationPanel.hidden = false;
}

function setLoading(isLoading: boolean, date: string): void {
  apodSection.setAttribute("aria-busy", String(isLoading));
  submitButton.disabled = isLoading;
  loadingState.textContent = isLoading
    ? `Carregando o APOD de ${formatApodDate(date)}…`
    : "";
}

async function loadApod(date: string): Promise<void> {
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;

  setLoading(true, date);
  errorState.hidden = true;
  errorState.textContent = "";
  titleElement.textContent = "Carregando APOD…";
  dateLabel.hidden = true;
  explanationElement.textContent = "";
  explanationPanel.hidden = true;
  mediaCaption.hidden = true;
  mediaContent.classList.remove("is-video");
  mediaContent.replaceChildren();

  try {
    const response = await fetch(`/api/apod?date=${encodeURIComponent(date)}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("O servidor retornou uma resposta inválida.");
    }

    if (!response.ok) {
      const serverMessage =
        typeof payload === "object" &&
        payload !== null &&
        !Array.isArray(payload) &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : "Não foi possível carregar esta imagem. Tente novamente.";
      throw new Error(serverMessage);
    }

    if (controller.signal.aborted) {
      return;
    }
    showApod(parseApod(payload, date));
  } catch (error) {
    if (controller.signal.aborted) {
      return;
    }
    titleElement.textContent = "Não foi possível carregar o APOD.";
    errorState.textContent =
      error instanceof TypeError
        ? "Não foi possível conectar ao servidor. Inicie o projeto com npm run dev e tente novamente."
        : error instanceof Error
          ? error.message
          : "Ocorreu um erro inesperado. Tente novamente.";
    errorState.hidden = false;
  } finally {
    if (activeController === controller) {
      setLoading(false, date);
    }
  }
}

dateForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!dateInput.reportValidity() || !dateInput.value) {
    return;
  }
  void loadApod(dateInput.value);
});

void loadApod(today);
