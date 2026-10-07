import {
  authenticateAdmin,
  readRequestText,
  type AdminDependencies,
  type AdminSession,
} from "./admin.ts";
import {
  ConfigurationError,
  readSupabaseConfig,
  type Env,
  type SupabaseConfig,
} from "./config.ts";
import { jsonResponse, serviceUnavailable } from "./http.ts";

export type AdminApiContext = {
  config: SupabaseConfig;
  session: AdminSession;
  cookie?: string;
};

export type AdminApiResult =
  | { context: AdminApiContext }
  | { response: Response; cookie?: string };

export async function getAdminApiContext(
  request: Request,
  env: Env,
  dependencies: AdminDependencies,
): Promise<AdminApiResult> {
  const auth = await authenticateAdmin(request, env, dependencies);
  if (auth.response) {
    return { response: auth.response, cookie: auth.cookie };
  }
  if (!auth.session) {
    return {
      response: jsonResponse({ error: "Unauthorized." }, 401),
      cookie: auth.cookie,
    };
  }

  try {
    return {
      context: {
        config: readSupabaseConfig(env),
        session: auth.session,
        cookie: auth.cookie,
      },
    };
  } catch (error) {
    if (!(error instanceof ConfigurationError)) {
      throw error;
    }
    (dependencies.logger ?? console).error(
      "[admin] Supabase configuration is missing or invalid.",
    );
    return { response: serviceUnavailable(), cookie: auth.cookie };
  }
}

export async function adminSupabaseFetch(
  context: AdminApiContext,
  path: string,
  init: RequestInit,
  dependencies: AdminDependencies,
): Promise<Response | null> {
  const headers = new Headers(init.headers);
  headers.set("apikey", context.config.publishableKey);
  headers.set("Authorization", `Bearer ${context.session.accessToken}`);
  headers.set("Accept", "application/json");
  try {
    return await (dependencies.fetchImpl ?? fetch)(
      `${context.config.url}${path}`,
      {
        ...init,
        headers,
        signal: AbortSignal.timeout(10000),
      },
    );
  } catch {
    (dependencies.logger ?? console).error("[admin] Supabase request failed.");
    return null;
  }
}

export async function readJsonBody(
  request: Request,
  maxBytes = 20_000,
): Promise<unknown | null> {
  const text = await readRequestText(request, maxBytes);
  if (text === null) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function validImageUrl(value: unknown, config: SupabaseConfig): value is string | null {
  if (value === null) {
    return true;
  }
  if (typeof value !== "string") {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.origin === config.url &&
      url.pathname.startsWith("/storage/v1/object/public/cottage44-plates/") &&
      /^\/storage\/v1\/object\/public\/cottage44-plates\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i.test(
        url.pathname,
      ) &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function adminFailure(
  logger: Pick<Console, "error">,
  message: string,
): Response {
  logger.error(`[admin] ${message}`);
  return jsonResponse(
    { error: "The admin request could not be completed." },
    502,
  );
}
