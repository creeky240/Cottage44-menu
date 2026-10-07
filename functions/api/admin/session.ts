import {
  authenticateAdmin,
  clearSessionCookie,
  isSameOriginMutation,
  signInAdmin,
  withCookie,
  type AdminDependencies,
} from "../../_shared/admin.ts";
import type { Env } from "../../_shared/config.ts";
import { jsonResponse, type PagesHandler } from "../../_shared/http.ts";

export async function handleSessionRequest(
  request: Request,
  env: Env,
  dependencies: AdminDependencies = {},
): Promise<Response> {
  if (request.method === "POST") {
    return signInAdmin(request, env, dependencies);
  }
  if (request.method === "GET") {
    const auth = await authenticateAdmin(request, env, dependencies);
    if (auth.response) {
      return withCookie(auth.response, auth.cookie);
    }
    return withCookie(
      jsonResponse(
        auth.session
          ? { authenticated: true, email: "corne.dawson@gmail.com" }
          : { authenticated: false },
      ),
      auth.cookie,
    );
  }
  if (request.method === "DELETE") {
    if (!isSameOriginMutation(request)) {
      return jsonResponse({ error: "Forbidden." }, 403);
    }
    return withCookie(
      jsonResponse({ authenticated: false }),
      clearSessionCookie(request),
    );
  }
  return jsonResponse({ error: "Method not allowed." }, 405);
}

export const onRequest: PagesHandler<Env> = ({ request, env }) =>
  handleSessionRequest(request, env);
