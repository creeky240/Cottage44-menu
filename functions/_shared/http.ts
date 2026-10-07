export type PagesContext<Env> = {
  request: Request;
  env: Env;
};

export type PagesHandler<Env> = (
  context: PagesContext<Env>,
) => Response | Promise<Response>;

export function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function methodNotAllowed(): Response {
  return jsonResponse(
    { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } },
    405,
  );
}

export function serviceUnavailable(): Response {
  return jsonResponse(
    {
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "The service is temporarily unavailable.",
      },
    },
    503,
  );
}

export function upstreamFailure(): Response {
  return jsonResponse(
    {
      error: {
        code: "UPSTREAM_ERROR",
        message: "Today's plate is temporarily unavailable.",
      },
    },
    502,
  );
}
