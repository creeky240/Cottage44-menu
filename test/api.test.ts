import assert from "node:assert/strict";
import test from "node:test";
import { getBusinessDate } from "../functions/_shared/business-date.ts";
import {
  readSupabaseConfig,
  type Env,
} from "../functions/_shared/config.ts";
import { onRequest as healthHandler } from "../functions/api/health.ts";
import { handleTodayRequest } from "../functions/api/plates/today.ts";

const env: Env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_value",
};

function request(method = "GET"): Request {
  return new Request("https://menu.example/api/plates/today", { method });
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

test("health handler returns a no-store success response", async () => {
  const response = await healthHandler({
    request: new Request("https://menu.example/api/health"),
    env: {},
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("health and plate handlers reject non-GET requests", async () => {
  const healthResponse = await healthHandler({
    request: new Request("https://menu.example/api/health", { method: "POST" }),
    env: {},
  });
  const plateResponse = await handleTodayRequest(request("POST"), env);

  assert.equal(healthResponse.status, 405);
  assert.equal(plateResponse.status, 405);
  assert.deepEqual(await plateResponse.json(), {
    error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." },
  });
});

test("business date follows South African midnight, not UTC midnight", () => {
  assert.equal(getBusinessDate(new Date("2026-10-06T21:59:59.000Z")), "2026-10-06");
  assert.equal(getBusinessDate(new Date("2026-10-06T22:00:00.000Z")), "2026-10-07");
  assert.throws(() => getBusinessDate(new Date("invalid")), RangeError);
});

test("configuration accepts only HTTPS URLs and publishable keys", () => {
  assert.deepEqual(readSupabaseConfig(env), {
    url: "https://example.supabase.co",
    publishableKey: "sb_publishable_test_value",
  });
  assert.throws(
    () =>
      readSupabaseConfig({
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "service_role_secret",
      }),
    /missing or invalid/,
  );
  assert.throws(
      () =>
        readSupabaseConfig({
          SUPABASE_URL: "not a URL",
          SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY,
        }),
      /missing or invalid/,
  );
  assert.throws(
    () =>
      readSupabaseConfig({
        SUPABASE_URL: "http://example.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY,
      }),
    /missing or invalid/,
  );
});

test("today query scopes Supabase to the Johannesburg date and returns null when empty", async () => {
  let requestedUrl: URL | undefined;
  let requestedHeaders: Headers | undefined;
  const response = await handleTodayRequest(request(), env, {
    now: new Date("2026-10-06T22:00:00.000Z"),
    fetchImpl: async (input, init) => {
      requestedUrl = new URL(input.toString());
      requestedHeaders = new Headers(init?.headers);
      return jsonResponse([]);
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { plate: null });
  assert.equal(
    requestedUrl?.searchParams.get("service_date"),
    "eq.2026-10-07",
  );
  assert.equal(requestedUrl?.searchParams.get("limit"), "1");
  assert.equal(
    requestedUrl?.searchParams.get("select"),
    "service_date,plate:plates(id,name,description,price_cents,image_url)",
  );
  assert.equal(requestedHeaders?.get("apikey"), env.SUPABASE_PUBLISHABLE_KEY);
  assert.equal(requestedHeaders?.has("authorization"), false);
});

test("today handler allow-lists and sanitizes a valid database plate", async () => {
  const serviceDate = "2026-10-07";
  const response = await handleTodayRequest(request(), env, {
    now: new Date("2026-10-06T22:00:00.000Z"),
    fetchImpl: async () =>
      jsonResponse([
        {
          service_date: serviceDate,
          private_column: "must not escape",
          plate: {
            id: "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0",
            name: "  Cottage burger  ",
            description: "Beef, cheese and chips",
            price_cents: 12500,
            image_url: "https://images.example/plate.jpg",
            private_column: "must not escape",
          },
        },
      ]),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    plate: {
      id: "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0",
      serviceDate,
      name: "Cottage burger",
      description: "Beef, cheese and chips",
      priceCents: 12500,
      imageUrl: "https://images.example/plate.jpg",
    },
  });
});

test("today handler returns a safe error for invalid database data", async () => {
  const logs: unknown[][] = [];
  const response = await handleTodayRequest(request(), env, {
    now: new Date("2026-10-06T22:00:00.000Z"),
    logger: { error: (...values) => logs.push(values) },
    fetchImpl: async () =>
      jsonResponse([
        {
          service_date: "2026-10-07",
          plate: {
            id: "not-a-uuid",
            name: "<script>unsafe</script>",
            description: "invalid",
            price_cents: -1,
            image_url: "javascript:alert(1)",
          },
        },
      ]),
  });
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.deepEqual(body, {
    error: {
      code: "UPSTREAM_ERROR",
      message: "Today's plate is temporarily unavailable.",
    },
  });
  assert.match(String(logs[0]?.[0]), /invalid schema/);
});

test("today handler rejects duplicate results and malformed JSON", async () => {
  const duplicateResponse = await handleTodayRequest(request(), env, {
    now: new Date("2026-10-06T22:00:00.000Z"),
    logger: { error: () => {} },
    fetchImpl: async () => jsonResponse([{}, {}]),
  });
  const malformedJsonResponse = await handleTodayRequest(request(), env, {
    logger: { error: () => {} },
    fetchImpl: async () => new Response("not JSON"),
  });

  assert.equal(duplicateResponse.status, 502);
  assert.equal(malformedJsonResponse.status, 502);
  assert.deepEqual(await duplicateResponse.json(), {
    error: {
      code: "UPSTREAM_ERROR",
      message: "Today's plate is temporarily unavailable.",
    },
  });
});

test("missing configuration is logged without exposing values", async () => {
  const logs: unknown[][] = [];
  const response = await handleTodayRequest(request(), {
    SUPABASE_URL: "https://example.supabase.co",
  }, {
    logger: { error: (...values) => logs.push(values) },
  });

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: {
      code: "SERVICE_UNAVAILABLE",
      message: "The service is temporarily unavailable.",
    },
  });
  assert.doesNotMatch(JSON.stringify(logs), /example\.supabase\.co|sb_publishable/);
});

test("upstream and network failures return safe errors without leaking details", async () => {
  for (const fetchImpl of [
    async () => jsonResponse({ secret: "response body" }, 500),
    async () => {
      throw new Error("request failed with sb_publishable_sensitive");
    },
    async () => {
      throw "unknown transport failure";
    },
  ]) {
    const logs: unknown[][] = [];
    const response = await handleTodayRequest(request(), env, {
      fetchImpl,
      logger: { error: (...values) => logs.push(values) },
    });

    assert.equal(response.status, 502);
    assert.doesNotMatch(JSON.stringify(await response.json()), /secret|publishable/);
    assert.doesNotMatch(JSON.stringify(logs), /secret|publishable/);
  }
});
