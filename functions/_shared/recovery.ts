import {
  ConfigurationError,
  readAdminSiteOrigin,
  readSupabaseConfig,
  type Env,
} from "./config.ts";
import {
  isSameOriginMutation,
  OWNER_EMAIL,
  readRequestText,
  type AdminDependencies,
} from "./admin.ts";
import { jsonResponse, serviceUnavailable } from "./http.ts";

const RECOVERY_COOKIE = "c44_recovery";
const RECOVERY_MAX_AGE = 60 * 10;
const GENERIC_REQUEST_MESSAGE =
  "If the address belongs to the owner account, a password reset email will arrive shortly. Check the inbox and spam folder.";

type RecoverySession = {
  accessToken: string;
  refreshToken: string;
};

function ownerUser(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "email" in value &&
    typeof value.email === "string" &&
    value.email.toLowerCase() === OWNER_EMAIL
  );
}

function validRecoverySession(value: unknown): RecoverySession | null {
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
    !ownerUser(value.user)
  ) {
    return null;
  }

  const session = {
    accessToken: value.access_token,
    refreshToken: value.refresh_token,
  };
  const encoded = btoa(JSON.stringify(session))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return encoded.length <= 3800 ? session : null;
}

function encodeSession(session: RecoverySession): string {
  return btoa(JSON.stringify(session))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function readRecoverySession(request: Request): RecoverySession | null {
  const raw = request.headers.get("Cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${RECOVERY_COOKIE}=`))
    ?.slice(RECOVERY_COOKIE.length + 1);
  if (!raw || raw.length > 3800) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(
      atob(raw.replaceAll("-", "+").replaceAll("_", "/")),
    );
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
      };
    }
  } catch {
    return null;
  }
  return null;
}

function recoveryCookie(request: Request, session: RecoverySession): string {
  return `${RECOVERY_COOKIE}=${encodeSession(session)}; Path=/api/admin/password-recovery; HttpOnly; SameSite=Strict; Max-Age=${RECOVERY_MAX_AGE}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}

function clearRecoveryCookie(request: Request): string {
  return `${RECOVERY_COOKIE}=; Path=/api/admin/password-recovery; HttpOnly; SameSite=Strict; Max-Age=0${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}

function withRecoveryCookie(response: Response, cookie: string): Response {
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", cookie);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function redirectToAdmin(siteOrigin: string, result: "ready" | "invalid"): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL(`/admin/?recovery=${result}`, siteOrigin).href,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function readConfig(env: Env, dependencies: AdminDependencies) {
  try {
    return {
      supabase: readSupabaseConfig(env),
      siteOrigin: readAdminSiteOrigin(env),
    };
  } catch (error) {
    if (!(error instanceof ConfigurationError)) {
      throw error;
    }
    (dependencies.logger ?? console).error(
      "[admin] Password recovery configuration is missing or invalid.",
    );
    return null;
  }
}

export async function handlePasswordRecoveryRequest(
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
  const config = readConfig(env, dependencies);
  if (!config) {
    return serviceUnavailable();
  }
  if (new URL(request.url).origin !== config.siteOrigin) {
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
  const email =
    typeof body === "object" && body !== null && "email" in body &&
      typeof body.email === "string"
      ? body.email.trim().toLowerCase()
      : "";

  if (email === OWNER_EMAIL) {
    const logger = dependencies.logger ?? console;
    const redirectTo = new URL(
      "/api/admin/password-recovery/verify",
      config.siteOrigin,
    );
    try {
      const response = await (dependencies.fetchImpl ?? fetch)(
        `${config.supabase.url}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo.href)}`,
        {
          method: "POST",
          headers: new Headers({
            apikey: config.supabase.publishableKey,
            Accept: "application/json",
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({ email: OWNER_EMAIL }),
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!response.ok) {
        logger.error(`[admin] Supabase recovery request returned HTTP ${response.status}.`);
      }
    } catch {
      logger.error("[admin] Supabase recovery request failed.");
    }
  }

  return jsonResponse({ message: GENERIC_REQUEST_MESSAGE });
}

export async function handlePasswordRecoveryVerification(
  request: Request,
  env: Env,
  dependencies: AdminDependencies = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  const config = readConfig(env, dependencies);
  if (!config) {
    return serviceUnavailable();
  }
  if (new URL(request.url).origin !== config.siteOrigin) {
    return jsonResponse({ error: "Forbidden." }, 403);
  }

  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  if (
    url.searchParams.get("type") !== "recovery" ||
    !tokenHash ||
    tokenHash.length > 1024 ||
    !/^[A-Za-z0-9._~-]+$/.test(tokenHash)
  ) {
    return redirectToAdmin(config.siteOrigin, "invalid");
  }

  let response: Response;
  try {
    response = await (dependencies.fetchImpl ?? fetch)(
      `${config.supabase.url}/auth/v1/verify`,
      {
        method: "POST",
        headers: new Headers({
          apikey: config.supabase.publishableKey,
          Accept: "application/json",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ token_hash: tokenHash, type: "recovery" }),
        signal: AbortSignal.timeout(5000),
      },
    );
  } catch {
    (dependencies.logger ?? console).error("[admin] Supabase recovery verification failed.");
    return serviceUnavailable();
  }
  if (!response.ok) {
    return redirectToAdmin(config.siteOrigin, "invalid");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    (dependencies.logger ?? console).error(
      "[admin] Supabase recovery verification returned invalid JSON.",
    );
    return serviceUnavailable();
  }
  const session = validRecoverySession(payload);
  if (!session) {
    return redirectToAdmin(config.siteOrigin, "invalid");
  }

  return withRecoveryCookie(
    redirectToAdmin(config.siteOrigin, "ready"),
    recoveryCookie(request, session),
  );
}

export async function handlePasswordRecoveryUpdate(
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

  const config = readConfig(env, dependencies);
  if (!config) {
    return serviceUnavailable();
  }
  if (new URL(request.url).origin !== config.siteOrigin) {
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
    !("password" in body) ||
    typeof body.password !== "string" ||
    body.password.length < 8 ||
    body.password.length > 256
  ) {
    return jsonResponse(
      { error: "Choose a password with at least 8 characters." },
      400,
    );
  }

  const session = readRecoverySession(request);
  if (!session) {
    return withRecoveryCookie(
      jsonResponse(
        { error: "Your reset link has expired. Request a new password reset email." },
        401,
      ),
      clearRecoveryCookie(request),
    );
  }

  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const authHeaders = new Headers({
    apikey: config.supabase.publishableKey,
    Accept: "application/json",
    Authorization: `Bearer ${session.accessToken}`,
  });
  let userResponse: Response;
  try {
    userResponse = await fetchImpl(`${config.supabase.url}/auth/v1/user`, {
      headers: authHeaders,
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    (dependencies.logger ?? console).error("[admin] Recovery session validation failed.");
    return serviceUnavailable();
  }
  if (!userResponse.ok) {
    if (userResponse.status !== 401) {
      (dependencies.logger ?? console).error(
        `[admin] Recovery session validation returned HTTP ${userResponse.status}.`,
      );
      return serviceUnavailable();
    }
    return withRecoveryCookie(
      jsonResponse(
        { error: "Your reset link has expired. Request a new password reset email." },
        401,
      ),
      clearRecoveryCookie(request),
    );
  }

  let user: unknown;
  try {
    user = await userResponse.json();
  } catch {
    (dependencies.logger ?? console).error(
      "[admin] Recovery session validation returned invalid JSON.",
    );
    return serviceUnavailable();
  }
  if (!ownerUser(user)) {
    return withRecoveryCookie(
      jsonResponse({ error: "This reset link is not valid for the owner account." }, 401),
      clearRecoveryCookie(request),
    );
  }

  let updateResponse: Response;
  try {
    updateResponse = await fetchImpl(`${config.supabase.url}/auth/v1/user`, {
      method: "PUT",
      headers: new Headers({
        ...Object.fromEntries(authHeaders.entries()),
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ password: body.password }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    (dependencies.logger ?? console).error("[admin] Password update request failed.");
    return serviceUnavailable();
  }
  if (!updateResponse.ok) {
    (dependencies.logger ?? console).error(
      `[admin] Supabase password update returned HTTP ${updateResponse.status}.`,
    );
    return jsonResponse(
      { error: "The password could not be updated. Request a new reset link and try again." },
      updateResponse.status === 401 ? 401 : 400,
    );
  }

  return withRecoveryCookie(
    jsonResponse({ updated: true }),
    clearRecoveryCookie(request),
  );
}
