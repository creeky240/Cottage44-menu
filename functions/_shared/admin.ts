import {
  ConfigurationError,
  readSupabaseConfig,
  type Env,
} from "./config.ts";
import { jsonResponse, serviceUnavailable } from "./http.ts";

export const OWNER_EMAIL = "corne.dawson@gmail.com";
const COOKIE_NAME = "c44_admin";
const SESSION_MAX_AGE = 60 * 60 * 8;
const REMEMBERED_MAX_AGE = 60 * 60 * 24 * 30;

export type AdminSession = {
  accessToken: string;
  refreshToken: string;
  rememberMe: boolean;
};

export type AdminDependencies = {
  fetchImpl?: typeof fetch;
  logger?: Pick<Console, "error">;
};

export type AuthenticatedRequest = {
  session: AdminSession | null;
  cookie?: string;
  response?: Response;
};

function cookieAttributes(request: Request): string[] {
  return [
    "Path=/api/admin",
    "HttpOnly",
    "SameSite=Strict",
    ...(new URL(request.url).protocol === "https:" ? ["Secure"] : []),
  ];
}

export function sessionCookie(request: Request, session: AdminSession): string {
  const encoded = btoa(JSON.stringify(session))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `${COOKIE_NAME}=${encoded}; ${[
    ...cookieAttributes(request),
    `Max-Age=${session.rememberMe ? REMEMBERED_MAX_AGE : SESSION_MAX_AGE}`,
  ].join("; ")}`;
}

export function clearSessionCookie(request: Request): string {
  return `${COOKIE_NAME}=; ${[
    ...cookieAttributes(request),
    "Max-Age=0",
  ].join("; ")}`;
}

export function withCookie(response: Response, cookie?: string): Response {
  if (!cookie) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", cookie);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function readRequestText(
  request: Request,
  maxBytes: number,
): Promise<string | null> {
  const contentLengthHeader = request.headers.get("Content-Length");
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (
      !Number.isSafeInteger(contentLength) ||
      contentLength < 0 ||
      contentLength > maxBytes
    ) {
      return null;
    }
  }
  if (!request.body) {
    return null;
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function readCookie(request: Request): AdminSession | null {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) {
    return null;
  }

  const raw = cookieHeader.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  if (!raw || raw.length > 3800) {
    return null;
  }

  try {
    const normalized = raw.replaceAll("-", "+").replaceAll("_", "/");
    const parsed: unknown = JSON.parse(atob(normalized));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "accessToken" in parsed &&
      "refreshToken" in parsed &&
      typeof parsed.accessToken === "string" &&
      parsed.accessToken.length > 0 &&
      parsed.accessToken.length <= 6000 &&
      typeof parsed.refreshToken === "string" &&
      parsed.refreshToken.length > 0 &&
      parsed.refreshToken.length <= 6000
    ) {
      return {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        rememberMe: "rememberMe" in parsed && parsed.rememberMe === true,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function validUser(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "email" in value &&
    typeof value.email === "string" &&
    value.email.toLowerCase() === OWNER_EMAIL
  );
}

function validSession(value: unknown, rememberMe = false): AdminSession | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("access_token" in value) ||
    !("refresh_token" in value) ||
    typeof value.access_token !== "string" ||
    value.access_token.length === 0 ||
    value.access_token.length > 6000 ||
    typeof value.refresh_token !== "string" ||
    value.refresh_token.length === 0 ||
    value.refresh_token.length > 6000 ||
    !("user" in value) ||
    !validUser(value.user)
  ) {
    return null;
  }
  const session = {
    accessToken: value.access_token,
    refreshToken: value.refresh_token,
    rememberMe,
  };
  return btoa(JSON.stringify(session)).length <= 3800 ? session : null;
}

function authHeaders(publishableKey: string, accessToken?: string): Headers {
  const headers = new Headers({
    apikey: publishableKey,
    Accept: "application/json",
  });
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  return headers;
}

export async function authenticateAdmin(
  request: Request,
  env: Env,
  dependencies: AdminDependencies = {},
): Promise<AuthenticatedRequest> {
  const logger = dependencies.logger ?? console;
  const tokens = readCookie(request);
  if (!tokens) {
    return { session: null };
  }

  let config;
  try {
    config = readSupabaseConfig(env);
  } catch (error) {
    if (!(error instanceof ConfigurationError)) {
      throw error;
    }
    logger.error("[admin] Supabase configuration is missing or invalid.");
    return { session: null, response: serviceUnavailable() };
  }

  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const userUrl = `${config.url}/auth/v1/user`;
  let userResponse: Response;
  try {
    userResponse = await fetchImpl(userUrl, {
      headers: authHeaders(config.publishableKey, tokens.accessToken),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    logger.error("[admin] Supabase auth request failed.");
    return { session: null, response: serviceUnavailable() };
  }

  if (userResponse.ok) {
    let user: unknown;
    try {
      user = await userResponse.json();
    } catch {
      logger.error("[admin] Supabase auth returned invalid JSON.");
      return { session: null, response: serviceUnavailable() };
    }
    if (validUser(user)) {
      return { session: tokens };
    }
    return {
      session: null,
      cookie: clearSessionCookie(request),
      response: jsonResponse({ error: "Unauthorized." }, 401),
    };
  }
  if (userResponse.status !== 401) {
    logger.error(`[admin] Supabase auth returned HTTP ${userResponse.status}.`);
    return { session: null, response: serviceUnavailable() };
  }

  let refreshResponse: Response;
  try {
    refreshResponse = await fetchImpl(
      `${config.url}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: new Headers({
          apikey: config.publishableKey,
          Accept: "application/json",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ refresh_token: tokens.refreshToken }),
        signal: AbortSignal.timeout(5000),
      },
    );
  } catch {
    logger.error("[admin] Supabase session refresh failed.");
    return { session: null, response: serviceUnavailable() };
  }
  if (!refreshResponse.ok) {
    return {
      session: null,
      cookie: clearSessionCookie(request),
      response: jsonResponse({ error: "Unauthorized." }, 401),
    };
  }

  let refreshed: unknown;
  try {
    refreshed = await refreshResponse.json();
  } catch {
    logger.error("[admin] Supabase session refresh returned invalid JSON.");
    return { session: null, response: serviceUnavailable() };
  }
  const session = validSession(refreshed, tokens.rememberMe);
  if (!session) {
    return {
      session: null,
      cookie: clearSessionCookie(request),
      response: jsonResponse({ error: "Unauthorized." }, 401),
    };
  }
  return { session, cookie: sessionCookie(request, session) };
}

export function isSameOriginMutation(request: Request): boolean {
  const origin = request.headers.get("Origin");
  return !!origin && origin === new URL(request.url).origin;
}

export async function signInAdmin(
  request: Request,
  env: Env,
  dependencies: AdminDependencies = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  if (!isSameOriginMutation(request)) {
    return jsonResponse({ error: "Forbidden." }, 403);
  }
  let body: unknown;
  try {
    const text = await readRequestText(request, 8192);
    if (!text) {
      return jsonResponse({ error: "Invalid request." }, 400);
    }
    body = JSON.parse(text);
  } catch {
    return jsonResponse({ error: "Invalid request." }, 400);
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("email" in body) ||
    !("password" in body) ||
    typeof body.email !== "string" ||
    typeof body.password !== "string" ||
    body.email.trim().toLowerCase() !== OWNER_EMAIL ||
    body.password.length < 1 ||
    body.password.length > 256 ||
    ("rememberMe" in body &&
      body.rememberMe !== undefined &&
      typeof body.rememberMe !== "boolean")
  ) {
    return jsonResponse({ error: "Email or password is incorrect." }, 401);
  }

  const logger = dependencies.logger ?? console;
  let config;
  try {
    config = readSupabaseConfig(env);
  } catch (error) {
    if (!(error instanceof ConfigurationError)) {
      throw error;
    }
    logger.error("[admin] Supabase configuration is missing or invalid.");
    return serviceUnavailable();
  }

  let response: Response;
  try {
    response = await (dependencies.fetchImpl ?? fetch)(
      `${config.url}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: new Headers({
          apikey: config.publishableKey,
          Accept: "application/json",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          email: OWNER_EMAIL,
          password: body.password,
        }),
        signal: AbortSignal.timeout(5000),
      },
    );
  } catch {
    logger.error("[admin] Supabase sign-in request failed.");
    return serviceUnavailable();
  }
  if (!response.ok) {
    return jsonResponse({ error: "Email or password is incorrect." }, 401);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    logger.error("[admin] Supabase sign-in returned invalid JSON.");
    return serviceUnavailable();
  }
  const rememberMe = "rememberMe" in body && body.rememberMe === true;
  const session = validSession(payload, rememberMe);
  if (!session) {
    return jsonResponse({ error: "Email or password is incorrect." }, 401);
  }
  return withCookie(
    jsonResponse({ authenticated: true, email: OWNER_EMAIL }),
    sessionCookie(request, session),
  );
}
