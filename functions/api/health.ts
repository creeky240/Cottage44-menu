import { jsonResponse, methodNotAllowed, type PagesHandler } from "../_shared/http.ts";
import type { Env } from "../_shared/config.ts";

export const onRequest: PagesHandler<Env> = ({ request }) => {
  if (request.method !== "GET") {
    return methodNotAllowed();
  }

  return jsonResponse({ status: "ok" });
};
