import assert from "node:assert/strict";
import test from "node:test";
import { OWNER_EMAIL, sessionCookie } from "../functions/_shared/admin.ts";
import { handleImageUpload } from "../functions/api/admin/images.ts";
import { handlePlateRequest } from "../functions/api/admin/plates/[id].ts";
import { handlePlatesRequest } from "../functions/api/admin/plates.ts";
import { handleSessionRequest } from "../functions/api/admin/session.ts";
import { handleTodayAdminRequest } from "../functions/api/admin/plates/today.ts";
import type { Env } from "../functions/_shared/config.ts";

const env: Env = {
  SUPABASE_URL: "https://cottage44-test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fake_for_tests",
};

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function readCookiePayload(setCookie: string): Record<string, unknown> {
  const encoded = setCookie.split(";")[0].split("=")[1];
  const normalized = encoded.replaceAll("-", "+").replaceAll("_", "/");
  return JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
}

function sessionRequest(
  rememberMe: boolean,
  url = "https://menu.example/api/admin/session",
): Request {
  const cookie = sessionCookie(new Request(url), {
    accessToken: "access-test-token",
    refreshToken: "refresh-test-token",
    rememberMe,
  });
  return new Request(url, {
    headers: { Cookie: cookie.split(";")[0] },
  });
}

test("password sign-in sets a secure HttpOnly cookie for the selected duration, never returns tokens", async () => {
  for (const [rememberMe, expectedAge] of [
    [true, "2592000"],
    [false, null],
  ] as const) {
    const request = new Request("https://menu.example/api/admin/session", {
      method: "POST",
      headers: {
        Origin: "https://menu.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: OWNER_EMAIL,
        password: "test-password",
        rememberMe,
      }),
    });
    const response = await handleSessionRequest(request, env, {
      fetchImpl: async () =>
        jsonResponse({
          access_token: "access-secret-test",
          refresh_token: "refresh-secret-test",
          user: { email: OWNER_EMAIL },
        }),
    });
    const cookie = response.headers.get("Set-Cookie") ?? "";
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      authenticated: true,
      email: OWNER_EMAIL,
    });
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Path=\/api\/admin/);
    if (expectedAge) {
      assert.match(cookie, new RegExp(`Max-Age=${expectedAge}`));
    } else {
      assert.doesNotMatch(cookie, /Max-Age=/);
    }
    assert.doesNotMatch(cookie, /; ?(access|refresh)-token=/i);
    assert.deepEqual(readCookiePayload(cookie), {
      accessToken: "access-secret-test",
      refreshToken: "refresh-secret-test",
      rememberMe,
    });
    assert.doesNotMatch(JSON.stringify(body), /access-secret|refresh-secret/);
  }
});

test("sign-in rejects non-owner emails and cross-origin requests before contacting Supabase", async () => {
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return jsonResponse({});
  };
  const wrongEmail = await handleSessionRequest(
    new Request("https://menu.example/api/admin/session", {
      method: "POST",
      headers: {
        Origin: "https://menu.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "attacker@example.com",
        password: "not-a-password",
      }),
    }),
    env,
    { fetchImpl },
  );
  const crossOrigin = await handleSessionRequest(
    new Request("https://menu.example/api/admin/session", {
      method: "POST",
      headers: {
        Origin: "https://attacker.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: OWNER_EMAIL,
        password: "not-a-password",
      }),
    }),
    env,
    { fetchImpl },
  );

  assert.equal(wrongEmail.status, 401);
  assert.equal(crossOrigin.status, 403);
  assert.equal(fetchCalls, 0);
});

test("a remembered session keeps its 30-day cookie when Supabase refreshes tokens", async () => {
  const request = sessionRequest(true);
  const response = await handleSessionRequest(request, env, {
    fetchImpl: async (input) => {
      if (String(input).endsWith("/auth/v1/user")) {
        return jsonResponse({ message: "expired" }, 401);
      }
      return jsonResponse({
        access_token: "new-access",
        refresh_token: "new-refresh",
        user: { email: OWNER_EMAIL },
      });
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    authenticated: true,
    email: OWNER_EMAIL,
  });
  assert.match(response.headers.get("Set-Cookie") ?? "", /Max-Age=2592000/);
  assert.equal(readCookiePayload(response.headers.get("Set-Cookie") ?? "").rememberMe, true);
});

test("an unchecked session remains a browser-session cookie when Supabase refreshes tokens", async () => {
  const request = sessionRequest(false);
  const response = await handleSessionRequest(request, env, {
    fetchImpl: async (input) => {
      if (String(input).endsWith("/auth/v1/user")) {
        return jsonResponse({ message: "expired" }, 401);
      }
      return jsonResponse({
        access_token: "new-access",
        refresh_token: "new-refresh",
        user: { email: OWNER_EMAIL },
      });
    },
  });

  assert.equal(response.status, 200);
  assert.doesNotMatch(response.headers.get("Set-Cookie") ?? "", /Max-Age=|Expires=/);
  assert.equal(readCookiePayload(response.headers.get("Set-Cookie") ?? "").rememberMe, false);
});

test("image upload rejects cross-origin, unsupported, and signature-mismatched content", async () => {
  const forged = await handleImageUpload(
    new Request("https://menu.example/api/admin/images", {
      method: "POST",
      headers: {
        Origin: "https://menu.example",
        Cookie: sessionRequest(false).headers.get("Cookie") ?? "",
        "Content-Type": "image/png",
      },
      body: new ArrayBuffer(3),
    }),
    env,
    { fetchImpl: async () => jsonResponse({ email: OWNER_EMAIL }) },
  );
  const crossOrigin = await handleImageUpload(
    new Request("https://menu.example/api/admin/images", {
      method: "POST",
      headers: { Origin: "https://attacker.example", "Content-Type": "image/jpeg" },
      body: new ArrayBuffer(3),
    }),
    env,
  );
  const unsupported = await handleImageUpload(
    new Request("https://menu.example/api/admin/images", {
      method: "POST",
      headers: {
        Origin: "https://menu.example",
        "Content-Type": "image/svg+xml",
      },
      body: new ArrayBuffer(3),
    }),
    env,
  );

  assert.equal(forged.status, 400);
  assert.equal(crossOrigin.status, 403);
  assert.equal(unsupported.status, 415);
});

test("valid image upload uses an opaque generated object key and fixed public bucket URL", async () => {
  const request = sessionRequest(false, "https://menu.example/api/admin/images");
  const body = new ArrayBuffer(6);
  new Uint8Array(body).set([0xff, 0xd8, 0xff, 0x00, 0xff, 0xd9]);
  const uploadRequest = new Request(request.url, {
    method: "POST",
    headers: {
      Origin: "https://menu.example",
      Cookie: request.headers.get("Cookie") ?? "",
      "Content-Type": "image/jpeg",
    },
    body,
  });
  let objectPath = "";
  let uploadedContentType = "";
  const response = await handleImageUpload(uploadRequest, env, {
    fetchImpl: async (input, init) => {
      if (String(input).endsWith("/auth/v1/user")) {
        return jsonResponse({ email: OWNER_EMAIL });
      }
      objectPath = new URL(String(input)).pathname;
      uploadedContentType = new Headers(init?.headers).get("Content-Type") ?? "";
      return jsonResponse({ Key: "not-used" });
    },
  });

  assert.equal(response.status, 200);
  const { imageUrl } = await response.json() as { imageUrl: string };
  assert.match(objectPath, /^\/storage\/v1\/object\/cottage44-plates\/[0-9a-f-]{36}\.jpg$/i);
  assert.equal(uploadedContentType, "image/jpeg");
  assert.match(imageUrl, /^https:\/\/cottage44-test\.supabase\.co\/storage\/v1\/object\/public\/cottage44-plates\/[0-9a-f-]{36}\.jpg$/i);
});

test("image upload enforces the 5 MiB cap even when Content-Length is absent", async () => {
  const cookieRequest = sessionRequest(false, "https://menu.example/api/admin/images");
  const oversizedBody = new ArrayBuffer(5 * 1024 * 1024 + 1);
  const request = new Request(cookieRequest.url, {
    method: "POST",
    headers: {
      Origin: "https://menu.example",
      Cookie: cookieRequest.headers.get("Cookie") ?? "",
      "Content-Type": "image/jpeg",
    },
    body: oversizedBody,
  });
  let storageCalled = false;
  const response = await handleImageUpload(request, env, {
    fetchImpl: async (input) => {
      if (String(input).endsWith("/auth/v1/user")) {
        return jsonResponse({ email: OWNER_EMAIL });
      }
      storageCalled = true;
      return jsonResponse({});
    },
  });

  assert.equal(response.status, 400);
  assert.equal(storageCalled, false);
});

test("setting today's plate uses the server's Johannesburg date and the authenticated token", async () => {
  const cookieRequest = sessionRequest(false, "https://menu.example/api/admin/plates/today");
  const request = new Request(cookieRequest.url, {
    method: "POST",
    headers: {
      Origin: "https://menu.example",
      Cookie: cookieRequest.headers.get("Cookie") ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ plateId: "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0" }),
  });
  let authorization = "";
  let requestPayload: unknown;
  const response = await handleTodayAdminRequest(
    request,
    env,
    {
      fetchImpl: async (input, init) => {
        if (String(input).endsWith("/auth/v1/user")) {
          return jsonResponse({ email: OWNER_EMAIL });
        }
        authorization = new Headers(init?.headers).get("Authorization") ?? "";
        requestPayload = JSON.parse(String(init?.body));
        return jsonResponse([
          {
            service_date: "2026-10-07",
            plate: {
              id: "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0",
              name: "Today's plate",
              description: "Fresh",
              price_cents: 12500,
              image_url: null,
            },
          },
        ]);
      },
    },
    new Date("2026-10-06T22:00:00.000Z"),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(requestPayload, {
    service_date: "2026-10-07",
    plate_id: "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0",
  });
  assert.equal(authorization, "Bearer access-test-token");
  assert.deepEqual(await response.json(), {
    today: {
      serviceDate: "2026-10-07",
      plate: {
        id: "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0",
        name: "Today's plate",
        description: "Fresh",
        priceCents: 12500,
        imageUrl: null,
      },
    },
  });
});

test("owner plate creation forwards validated fields with the Supabase user token", async () => {
  const baseRequest = sessionRequest(false, "https://menu.example/api/admin/plates");
  const request = new Request(baseRequest.url, {
    method: "POST",
    headers: {
      Origin: "https://menu.example",
      Cookie: baseRequest.headers.get("Cookie") ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "  Cottage burger ",
      description: "Beef and chips",
      priceCents: 12500,
      imageUrl: null,
    }),
  });
  let databasePayload: unknown;
  let authorization = "";
  const response = await handlePlatesRequest(request, env, {
    fetchImpl: async (input, init) => {
      if (String(input).endsWith("/auth/v1/user")) {
        return jsonResponse({ email: OWNER_EMAIL });
      }
      databasePayload = JSON.parse(String(init?.body));
      authorization = new Headers(init?.headers).get("Authorization") ?? "";
      return jsonResponse([
        {
          id: "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0",
          name: "Cottage burger",
          description: "Beef and chips",
          price_cents: 12500,
          image_url: null,
          created_at: "2026-10-07T10:00:00.000Z",
          updated_at: "2026-10-07T10:00:00.000Z",
        },
      ]);
    },
  });

  assert.equal(response.status, 201);
  assert.deepEqual(databasePayload, {
    name: "Cottage burger",
    description: "Beef and chips",
    price_cents: 12500,
    image_url: null,
  });
  assert.equal(authorization, "Bearer access-test-token");
  assert.equal((await response.json() as { plate: { name: string } }).plate.name, "Cottage burger");
});

test("admin API does not accept user metadata as owner identity", async () => {
  const request = sessionRequest(false, "https://menu.example/api/admin/plates");
  let databaseCalled = false;
  const response = await handlePlatesRequest(request, env, {
    fetchImpl: async (input) => {
      if (String(input).endsWith("/auth/v1/user")) {
        return jsonResponse({
          email: "attacker@example.com",
          user_metadata: { email: OWNER_EMAIL },
        });
      }
      databaseCalled = true;
      return jsonResponse([]);
    },
  });

  assert.equal(response.status, 401);
  assert.equal(databaseCalled, false);
});

test("plate update and deletion require a same-origin mutation", async () => {
  let fetchCalled = false;
  const request = new Request("https://menu.example/api/admin/plates/8d2b48f2-7932-4ff0-9e80-7ac5efc438f0", {
    method: "DELETE",
    headers: { Origin: "https://attacker.example" },
  });
  const response = await handlePlateRequest(
    request,
    env,
    "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0",
    {
      fetchImpl: async () => {
        fetchCalled = true;
        return jsonResponse({});
      },
    },
  );

  assert.equal(response.status, 403);
  assert.equal(fetchCalled, false);
});
