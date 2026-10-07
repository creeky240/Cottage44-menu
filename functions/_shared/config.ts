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
    super("Supabase URL or publishable key is missing or invalid.");
    this.name = "ConfigurationError";
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

export function readAdminSiteOrigin(env: Env): string {
  const rawUrl = env.ADMIN_SITE_URL?.trim();
  if (!rawUrl) {
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

  return url.origin;
}
