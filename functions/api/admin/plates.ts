import {
  adminFailure,
  adminSupabaseFetch,
  getAdminApiContext,
  readJsonBody,
  validImageUrl,
} from "../../_shared/admin-api.ts";
import {
  isSameOriginMutation,
  withCookie,
  type AdminDependencies,
} from "../../_shared/admin.ts";
import type { Env, SupabaseConfig } from "../../_shared/config.ts";
import { jsonResponse } from "../../_shared/http.ts";

type Plate = {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  image_url: string | null;
  created_at: string;
  updated_at: string;
};

export function isPlate(value: unknown, config: SupabaseConfig): value is Plate {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const plate = value as Record<string, unknown>;
  return (
    typeof plate.id === "string" &&
    /^[0-9a-f-]{36}$/i.test(plate.id) &&
    typeof plate.name === "string" &&
    plate.name.trim().length > 0 &&
    plate.name.length <= 120 &&
    typeof plate.description === "string" &&
    plate.description.length <= 1000 &&
    typeof plate.price_cents === "number" &&
    Number.isSafeInteger(plate.price_cents) &&
    plate.price_cents >= 0 &&
    validImageUrl(plate.image_url, config) &&
    typeof plate.created_at === "string" &&
    typeof plate.updated_at === "string"
  );
}

export function plateFields(
  value: unknown,
  imageValidator: (value: unknown) => value is string | null,
): Omit<Plate, "id" | "created_at" | "updated_at"> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const fields = value as Record<string, unknown>;
  if (
    typeof fields.name !== "string" ||
    fields.name.trim().length < 1 ||
    fields.name.trim().length > 120 ||
    typeof fields.description !== "string" ||
    fields.description.length > 1000 ||
    typeof fields.priceCents !== "number" ||
    !Number.isSafeInteger(fields.priceCents) ||
    fields.priceCents < 0 ||
    fields.priceCents > 100_000_000 ||
    !imageValidator(fields.imageUrl)
  ) {
    return null;
  }
  return {
    name: fields.name.trim(),
    description: fields.description.trim(),
    price_cents: fields.priceCents,
    image_url: fields.imageUrl,
  };
}

export async function handlePlatesRequest(
  request: Request,
  env: Env,
  dependencies: AdminDependencies = {},
): Promise<Response> {
  if (!["GET", "POST"].includes(request.method)) {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  if (request.method === "POST" && !isSameOriginMutation(request)) {
    return jsonResponse({ error: "Forbidden." }, 403);
  }

  const result = await getAdminApiContext(request, env, dependencies);
  if ("response" in result) {
    return withCookie(result.response, result.cookie);
  }
  const { context } = result;

  if (request.method === "GET") {
    const response = await adminSupabaseFetch(
      context,
      "/rest/v1/plates?select=id,name,description,price_cents,image_url,created_at,updated_at&order=updated_at.desc&limit=500",
      { method: "GET" },
      dependencies,
    );
    if (!response?.ok) {
      return withCookie(
        adminFailure(dependencies.logger ?? console, "Plate catalog request failed."),
        context.cookie,
      );
    }
    let rows: unknown;
    try {
      rows = await response.json();
    } catch {
      rows = null;
    }
    if (!Array.isArray(rows) || rows.length > 500 || !rows.every((row) => isPlate(row, context.config))) {
      return withCookie(
        adminFailure(dependencies.logger ?? console, "Plate catalog response was invalid."),
        context.cookie,
      );
    }
    return withCookie(
      jsonResponse({
        plates: rows.map((plate) => ({
          id: plate.id,
          name: plate.name,
          description: plate.description,
          priceCents: plate.price_cents,
          imageUrl: plate.image_url,
          updatedAt: plate.updated_at,
        })),
      }),
      context.cookie,
    );
  }

  const body = await readJsonBody(request);
  const fields = plateFields(body, (imageUrl) => validImageUrl(imageUrl, context.config));
  if (!fields) {
    return withCookie(
      jsonResponse({ error: "Plate details are invalid." }, 400),
      context.cookie,
    );
  }
  const response = await adminSupabaseFetch(
    context,
    "/rest/v1/plates?select=id,name,description,price_cents,image_url,created_at,updated_at",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(fields),
    },
    dependencies,
  );
  if (!response?.ok) {
    return withCookie(
      adminFailure(dependencies.logger ?? console, "Plate creation failed."),
      context.cookie,
    );
  }
  let rows: unknown;
  try {
    rows = await response.json();
  } catch {
    rows = null;
  }
  if (!Array.isArray(rows) || rows.length !== 1 || !isPlate(rows[0], context.config)) {
    return withCookie(
      adminFailure(dependencies.logger ?? console, "Plate creation response was invalid."),
      context.cookie,
    );
  }
  const plate = rows[0];
  return withCookie(
    jsonResponse(
      {
        plate: {
          id: plate.id,
          name: plate.name,
          description: plate.description,
          priceCents: plate.price_cents,
          imageUrl: plate.image_url,
          updatedAt: plate.updated_at,
        },
      },
      201,
    ),
    context.cookie,
  );
}

export const onRequest = ({ request, env }: { request: Request; env: Env }) =>
  handlePlatesRequest(request, env);
