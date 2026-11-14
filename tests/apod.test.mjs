import assert from "node:assert/strict";
import { test } from "node:test";
import { ApodError, fetchApod, validateApodDate } from "../src/server/apod.ts";
import { getApodCurrentDate } from "../src/shared/apod-date.ts";

const now = new Date("2026-11-14T12:00:00.000Z");
const validDate = "2026-11-14";
const testKey = "unit-test-key-only";

const imageResponse = {
  date: validDate,
  title: "Nebulosa de teste",
  explanation: "Descrição do conteúdo astronômico.",
  media_type: "image",
  url: "https://images.example.test/apod.jpg",
  hdurl: "https://images.example.test/apod-hd.jpg",
};

const fallbackImagePost = {
  date: `${validDate}T00:00:00`,
  slug: "apod-2026-november-14-nebula-test",
  content: {
    rendered: `
      <h1>APOD da NASA Science</h1>
      <div class="media-detail-hero__media">
        <figure>
          <a href="https://assets.science.nasa.gov/apod-full.jpg">
            <img src="https://assets.science.nasa.gov/apod.jpg" alt="Nebulosa distante">
          </a>
        </figure>
      </div>
      <div class="media-detail-hero__description">
        <p>Explanation: Uma nebulosa distante observada pelo telescópio. Tomorrow’s picture: outra imagem.</p>
      </div>
    `,
  },
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function assertApodError(statusCode) {
  return (error) => {
    assert.ok(error instanceof ApodError);
    assert.equal(error.statusCode, statusCode);
    return true;
  };
}

test("accepts the first APOD date and the current APOD date", () => {
  assert.equal(validateApodDate("1995-06-16", now), "1995-06-16");
  assert.equal(validateApodDate(validDate, now), validDate);
});

test("uses the NASA publication date across the New York midnight boundary", () => {
  const beforeMidnightInNewYork = new Date("2026-11-14T04:59:59.000Z");
  const afterMidnightInNewYork = new Date("2026-11-14T05:00:00.000Z");

  assert.equal(getApodCurrentDate(beforeMidnightInNewYork), "2026-11-13");
  assert.equal(getApodCurrentDate(afterMidnightInNewYork), "2026-11-14");
  assert.equal(
    validateApodDate("2026-11-13", beforeMidnightInNewYork),
    "2026-11-13",
  );
  assert.throws(
    () => validateApodDate("2026-11-14", beforeMidnightInNewYork),
    assertApodError(400),
  );
});

test("rejects malformed, impossible, pre-APOD, and future dates", () => {
  for (const date of [
    "2026-2-14",
    "2026-02-30",
    "1995-06-15",
    "2026-11-15",
    "",
    undefined,
  ]) {
    assert.throws(
      () => validateApodDate(date, now),
      assertApodError(400),
      `expected ${String(date)} to be rejected`,
    );
  }
});

test("requests a dated APOD with thumbnails and returns normalized image data", async () => {
  let requestUrl;
  let requestOptions;
  const apod = await fetchApod(
    validDate,
    testKey,
    async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return jsonResponse(imageResponse);
    },
    now,
  );

  assert.equal(requestUrl.origin, "https://api.nasa.gov");
  assert.equal(requestUrl.pathname, "/planetary/apod");
  assert.equal(requestUrl.searchParams.get("date"), validDate);
  assert.equal(requestUrl.searchParams.get("thumbs"), "true");
  assert.equal(requestUrl.searchParams.get("api_key"), testKey);
  assert.ok(requestOptions.signal instanceof AbortSignal);
  assert.deepEqual(apod, {
    date: validDate,
    title: "Nebulosa de teste",
    explanation: "Descrição do conteúdo astronômico.",
    mediaType: "image",
    url: "https://images.example.test/apod-hd.jpg",
    hdurl: "https://images.example.test/apod-hd.jpg",
  });
});

test("normalizes video data and preserves its optional thumbnail", async () => {
  const apod = await fetchApod(
    validDate,
    testKey,
    async () =>
      jsonResponse({
        ...imageResponse,
        media_type: "video",
        url: "https://www.youtube.com/watch?v=abcdefghijk",
        thumbnail_url: "https://images.example.test/video-preview.jpg",
      }),
    now,
  );

  assert.equal(apod.mediaType, "video");
  assert.equal(apod.url, "https://www.youtube.com/watch?v=abcdefghijk");
  assert.equal(
    apod.thumbnailUrl,
    "https://images.example.test/video-preview.jpg",
  );
  assert.equal("hdurl" in apod, true);
});

test("uses the HD image URL when provided", async () => {
  const apod = await fetchApod(
    validDate,
    testKey,
    async () =>
      jsonResponse({
        ...imageResponse,
        url: "https://science.nasa.gov/apod/permalink",
      }),
    now,
  );

  assert.equal(apod.url, "https://images.example.test/apod-hd.jpg");
});

test("falls back to NASA Science when the APOD endpoint returns its generic logo", async () => {
  const requests = [];
  const apod = await fetchApod(
    validDate,
    testKey,
    async (url, options) => {
      requests.push({ url, options });
      if (requests.length === 1) {
        return jsonResponse({
          ...imageResponse,
          title: "NASA Science",
          url: "https://science.nasa.gov/wp-content/themes/nasa-child/assets/images/nasa-logo@2x.png",
          hdurl:
            "https://science.nasa.gov/wp-content/themes/nasa-child/assets/images/nasa-logo@2x.png",
        });
      }
      return jsonResponse([fallbackImagePost]);
    },
    now,
  );

  assert.equal(apod.date, validDate);
  assert.equal(apod.title, "APOD da NASA Science");
  assert.equal(
    apod.explanation,
    "Uma nebulosa distante observada pelo telescópio.",
  );
  assert.equal(apod.mediaType, "image");
  assert.equal(apod.url, "https://assets.science.nasa.gov/apod.jpg");
  assert.equal(apod.hdurl, "https://assets.science.nasa.gov/apod-full.jpg");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url.searchParams.get("api_key"), testKey);
  assert.equal(
    requests[1].url.origin + requests[1].url.pathname,
    "https://science.nasa.gov/wp-json/wp/v2/image-article",
  );
  assert.equal(
    requests[1].url.searchParams.get("search"),
    "apod-2026-november-14",
  );
  assert.equal(requests[1].url.searchParams.has("api_key"), false);
  assert.ok(requests[1].options.signal instanceof AbortSignal);
});

test("falls back to NASA Science after a primary API timeout", async () => {
  let requestCount = 0;
  const apod = await fetchApod(
    validDate,
    testKey,
    async () => {
      requestCount += 1;
      if (requestCount === 1) {
        throw new DOMException("Request timed out", "TimeoutError");
      }
      return jsonResponse([fallbackImagePost]);
    },
    now,
  );

  assert.equal(requestCount, 2);
  assert.equal(apod.title, "APOD da NASA Science");
});

test("supports video media from NASA Science articles", async () => {
  const videoPost = {
    ...fallbackImagePost,
    content: {
      rendered: `
        <h1>Vídeo do APOD</h1>
        <div class="media-detail-hero__media">
          <iframe src="https://www.youtube.com/embed/abcdefghijk"></iframe>
          <img src="https://assets.science.nasa.gov/video-preview.jpg" alt="Prévia">
        </div>
        <div class="media-detail-hero__description">
          <p>Explanation: Um vídeo astronômico de teste.</p>
        </div>
      `,
    },
  };
  let requestCount = 0;
  const apod = await fetchApod(
    validDate,
    testKey,
    async () => {
      requestCount += 1;
      return requestCount === 1
        ? jsonResponse({}, 503)
        : jsonResponse([videoPost]);
    },
    now,
  );

  assert.equal(requestCount, 2);
  assert.equal(apod.mediaType, "video");
  assert.equal(apod.url, "https://www.youtube.com/embed/abcdefghijk");
  assert.equal(
    apod.thumbnailUrl,
    "https://assets.science.nasa.gov/video-preview.jpg",
  );
});

test("does not call NASA when the date or server key is invalid", async () => {
  let requestCount = 0;
  const fetcher = async () => {
    requestCount += 1;
    return jsonResponse(imageResponse);
  };

  await assert.rejects(
    fetchApod("2026-02-30", testKey, fetcher, now),
    assertApodError(400),
  );
  await assert.rejects(
    fetchApod(validDate, "", fetcher, now),
    (error) => {
      assertApodError(503)(error);
      assert.match(error.message, /NASA_API_KEY/);
      return true;
    },
  );
  assert.equal(requestCount, 0);
});

test("rejects unrelated NASA Science articles and insecure media URLs", async () => {
  const invalidPosts = [
    {
      ...fallbackImagePost,
      slug: "apod-2026-november-13-wrong-date",
    },
    {
      ...fallbackImagePost,
      date: "2026-11-13T00:00:00",
    },
    {
      ...fallbackImagePost,
      content: {
        rendered: fallbackImagePost.content.rendered.replace(
          "https://assets.science.nasa.gov/apod.jpg",
          "http://assets.science.nasa.gov/apod.jpg",
        ),
      },
    },
  ];

  for (const invalidPost of invalidPosts) {
    let requestCount = 0;
    await assert.rejects(
      fetchApod(
        validDate,
        testKey,
        async () => {
          requestCount += 1;
          return requestCount === 1
            ? jsonResponse({}, 503)
            : jsonResponse([invalidPost]);
        },
        now,
      ),
      (error) => {
        assertApodError(502)(error);
        assert.doesNotMatch(error.message, /unit-test-key-only/);
        return true;
      },
    );
    assert.equal(requestCount, 2);
  }
});

test("uses the NASA Science fallback for upstream errors and invalid payloads", async () => {
  const invalidPrimaryResponses = [
    jsonResponse({}, 429),
    new Response("{invalid json"),
    jsonResponse({ ...imageResponse, media_type: "iframe" }),
    jsonResponse({
      ...imageResponse,
      url: "http://insecure.example.test",
    }),
  ];

  for (const primaryResponse of invalidPrimaryResponses) {
    let requestCount = 0;
    await assert.rejects(
      fetchApod(
        validDate,
        testKey,
        async () => {
          requestCount += 1;
          return requestCount === 1
            ? primaryResponse
            : jsonResponse([]);
        },
        now,
      ),
      assertApodError(502),
    );
    assert.equal(requestCount, 2);
  }
});

test("maps primary and fallback timeouts to a gateway timeout", async () => {
  let requestCount = 0;
  await assert.rejects(
    fetchApod(
      validDate,
      testKey,
      async () => {
        requestCount += 1;
        throw new DOMException("Request timed out", "TimeoutError");
      },
      now,
    ),
    assertApodError(504),
  );
  assert.equal(requestCount, 2);
});
