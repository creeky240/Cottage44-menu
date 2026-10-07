export interface Env {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  ADMIN_SITE_URL?: string;
}

export interface SupabaseConfig {
  url: string;
  publishableKey: string;
}

export class ConfigurationError extends Error {
  constructor() {
    super("Required service configuration is missing or invalid.");
    this.name = "ConfigurationError";
  }
}

export class OriginValidationError extends Error {
  constructor() {
    super("The request origin is not an approved admin site.");
    this.name = "OriginValidationError";
  }
}

export function readSupabaseConfig(env: Env): SupabaseConfig {
  const rawUrl = env.SUPABASE_URL?.trim();
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!rawUrl || !publishableKey?.startsWith("sb_publishable_")) {
    throw new ConfigurationError();
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ConfigurationError();
  }

  const isLocalHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (
    (url.protocol !== "https:" && !isLocalHttp) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new ConfigurationError();
  }

  return {
    url: url.origin,
    publishableKey,
  };
}

export function readAdminSiteOrigin(env: Env, requestUrl: string): string {
  const requestedUrl = new URL(requestUrl);
  const isLocalHttp =
    requestedUrl.protocol === "http:" &&
    (requestedUrl.hostname === "localhost" ||
      requestedUrl.hostname === "127.0.0.1");
  const isCottage44PagesHost =
    requestedUrl.protocol === "https:" &&
    !requestedUrl.port &&
    (requestedUrl.hostname === "cottage44-menu-pages.pages.dev" ||
      requestedUrl.hostname.endsWith(".cottage44-menu-pages.pages.dev"));
  const rawConfiguredUrl = env.ADMIN_SITE_URL?.trim();

  if (!rawConfiguredUrl) {
    if (isCottage44PagesHost) {
      return requestedUrl.origin;
    }
    throw new OriginValidationError();
  }

  let configuredUrl: URL;
  try {
    configuredUrl = new URL(rawConfiguredUrl);
  } catch {
    throw new ConfigurationError();
  }
  const configuredIsLocalHttp =
    configuredUrl.protocol === "http:" &&
    (configuredUrl.hostname === "localhost" ||
      configuredUrl.hostname === "127.0.0.1");
  if (
    (configuredUrl.protocol !== "https:" && !configuredIsLocalHttp) ||
    configuredUrl.username ||
    configuredUrl.password ||
    configuredUrl.search ||
    configuredUrl.hash ||
    (configuredUrl.pathname !== "/" && configuredUrl.pathname !== "")
  ) {
    throw new ConfigurationError();
  }

  if (requestedUrl.origin === configuredUrl.origin) {
    return requestedUrl.origin;
  }
  if (isCottage44PagesHost && !isLocalHttp) {
    return requestedUrl.origin;
  }
  throw new OriginValidationError();
}
