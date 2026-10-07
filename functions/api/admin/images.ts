import {
  adminFailure,
  adminSupabaseFetch,
  getAdminApiContext,
} from "../../_shared/admin-api.ts";
import {
  isSameOriginMutation,
  withCookie,
  type AdminDependencies,
} from "../../_shared/admin.ts";
import type { Env } from "../../_shared/config.ts";
import { jsonResponse } from "../../_shared/http.ts";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function readImage(request: Request): Promise<Uint8Array | null> {
  const contentLengthHeader = request.headers.get("Content-Length");
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (
      !Number.isSafeInteger(contentLength) ||
      contentLength < 1 ||
      contentLength > MAX_IMAGE_BYTES
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
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > MAX_IMAGE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  if (size === 0) {
    return null;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function hasExpectedSignature(bytes: Uint8Array, mime: string): boolean {
  if (mime === "image/jpeg") {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
      return false;
    }
    for (let index = 3; index < bytes.length - 1; index += 1) {
      if (bytes[index] === 0xff && bytes[index + 1] === 0xd9) {
        return true;
      }
    }
    return false;
  }
  if (mime === "image/png") {
    return (
      bytes.length >= 33 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a &&
      bytes[12] === 0 &&
      bytes[13] === 0 &&
      bytes[14] === 0 &&
      bytes[15] === 13 &&
      String.fromCharCode(...bytes.slice(16, 20)) === "IHDR" &&
      bytes.some((byte, index) =>
        index >= 8 &&
        index + 8 <= bytes.length &&
        String.fromCharCode(...bytes.slice(index + 4, index + 8)) === "IEND",
      )
    );
  }
  if (mime !== "image/webp" || bytes.length < 20) {
    return false;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  const chunkLength = view.getUint32(16, true);
  return (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    view.getUint32(4, true) <= bytes.length - 8 &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP" &&
    ["VP8 ", "VP8L", "VP8X"].includes(chunk) &&
    chunkLength > 0 &&
    chunkLength <= bytes.length - 20
  );
}

export async function handleImageUpload(
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
  const mime = request.headers.get("Content-Type")?.toLowerCase();
  if (!mime || !(mime in MIME_EXTENSIONS)) {
    return jsonResponse({ error: "Upload a JPEG, PNG, or WebP image." }, 415);
  }

  const result = await getAdminApiContext(request, env, dependencies);
  if ("response" in result) {
    return withCookie(result.response, result.cookie);
  }
  const { context } = result;
  let bytes: Uint8Array | null;
  try {
    bytes = await readImage(request);
  } catch {
    bytes = null;
  }
  if (!bytes || !hasExpectedSignature(bytes, mime)) {
    return withCookie(
      jsonResponse({ error: "The image is empty, too large, or does not match its file type." }, 400),
      context.cookie,
    );
  }

  const key = `${crypto.randomUUID()}.${MIME_EXTENSIONS[mime]}`;
  const imageBody = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(imageBody).set(bytes);
  const response = await adminSupabaseFetch(
    context,
    `/storage/v1/object/cottage44-plates/${key}`,
    {
      method: "POST",
      headers: {
        "Content-Type": mime,
        "Cache-Control": "max-age=31536000",
        "x-upsert": "false",
      },
      body: imageBody,
    },
    dependencies,
  );
  if (!response?.ok) {
    return withCookie(
      adminFailure(dependencies.logger ?? console, "Image storage upload failed."),
      context.cookie,
    );
  }
  return withCookie(
    jsonResponse({
      imageUrl: `${context.config.url}/storage/v1/object/public/cottage44-plates/${key}`,
    }),
    context.cookie,
  );
}

export const onRequest = ({ request, env }: { request: Request; env: Env }) =>
  handleImageUpload(request, env);
