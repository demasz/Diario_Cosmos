import assert from "node:assert/strict";
import { test } from "node:test";
import { ApodError, fetchApod, validateApodDate } from "../src/server/apod.ts";

const today = new Date("2026-11-14T12:00:00.000Z");
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

test("accepts the first APOD date and the current UTC date", () => {
  assert.equal(validateApodDate("1995-06-16", today), "1995-06-16");
  assert.equal(validateApodDate(validDate, today), validDate);
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
      () => validateApodDate(date, today),
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
    today,
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
    url: "https://images.example.test/apod.jpg",
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
    today,
  );

  assert.equal(apod.mediaType, "video");
  assert.equal(apod.url, "https://www.youtube.com/watch?v=abcdefghijk");
  assert.equal(
    apod.thumbnailUrl,
    "https://images.example.test/video-preview.jpg",
  );
  assert.equal("hdurl" in apod, true);
});

test("does not call NASA when the date or server key is invalid", async () => {
  let requestCount = 0;
  const fetcher = async () => {
    requestCount += 1;
    return jsonResponse(imageResponse);
  };

  await assert.rejects(
    fetchApod("2026-02-30", testKey, fetcher, today),
    assertApodError(400),
  );
  await assert.rejects(
    fetchApod(validDate, "", fetcher, today),
    assertApodError(503),
  );
  assert.equal(requestCount, 0);
});

test("returns sanitized errors for upstream failures and invalid payloads", async () => {
  await assert.rejects(
    fetchApod(validDate, testKey, async () => jsonResponse({}, 429), today),
    (error) => {
      assertApodError(502)(error);
      assert.doesNotMatch(error.message, /unit-test-key-only/);
      return true;
    },
  );

  await assert.rejects(
    fetchApod(
      validDate,
      testKey,
      async () => new Response("{invalid json"),
      today,
    ),
    assertApodError(502),
  );

  await assert.rejects(
    fetchApod(
      validDate,
      testKey,
      async () => jsonResponse({ ...imageResponse, media_type: "iframe" }),
      today,
    ),
    assertApodError(502),
  );

  await assert.rejects(
    fetchApod(
      validDate,
      testKey,
      async () =>
        jsonResponse({ ...imageResponse, url: "http://insecure.example.test" }),
      today,
    ),
    assertApodError(502),
  );
});

test("maps upstream timeouts to a gateway timeout", async () => {
  await assert.rejects(
    fetchApod(
      validDate,
      testKey,
      async () => {
        throw new DOMException("Request timed out", "TimeoutError");
      },
      today,
    ),
    assertApodError(504),
  );
});
