import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminHtml = await readFile(path.join(root, "docs/admin/index.html"), "utf8");
const adminScript = await readFile(path.join(root, "docs/admin/admin.js"), "utf8");

class Element {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.hidden = false;
    this.value = "";
    this.files = [];
    this.listeners = {};
  }

  append(...elements) {
    this.children.push(...elements);
  }

  replaceChildren(...elements) {
    this.children = [...elements];
  }

  addEventListener(event, callback) {
    this.listeners[event] = callback;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  focus() {}

  reset() {}
}

test("admin UI remembers by default and completes sign-in, upload, save, and today's assignment", async () => {
  assert.match(adminHtml, /id="remember-me"[^>]*type="checkbox"[^>]*checked/);
  assert.match(adminHtml, /Remember me for 30 days/);
  assert.doesNotMatch(adminScript, /localStorage|sessionStorage/);

  const selectors = [
    "#status",
    "#sign-in-panel",
    "#sign-in-form",
    "#dashboard",
    "#sign-out",
    "#plate-form",
    "#plate-id",
    "#plate-name",
    "#plate-description",
    "#plate-price",
    "#plate-image",
    "#image-note",
    "#plate-list",
    "#history-list",
    "#today-select",
    "#today-summary",
    "#service-date",
    "#set-today",
    "#new-plate",
    "#cancel-edit",
    "#editor-title",
    "#email",
  ];
  const elements = Object.fromEntries(selectors.map((selector) => [selector, new Element()]));
  const calls = [];
  let savedPlates = [];
  let todaysPlate = null;
  const imageUrl =
    "https://cottage44-test.supabase.co/storage/v1/object/public/cottage44-plates/123e4567-e89b-42d3-a456-426614174000.jpg";

  async function fetchMock(url, options = {}) {
    calls.push({ url, options });
    if (url === "/api/admin/session" && !options.method) {
      return Response.json({ authenticated: false });
    }
    if (url === "/api/admin/session" && options.method === "POST") {
      return Response.json({ authenticated: true, email: "corne.dawson@gmail.com" });
    }
    if (url === "/api/admin/plates" && !options.method) {
      return Response.json({ plates: savedPlates });
    }
    if (url === "/api/admin/plates/today" && !options.method) {
      return Response.json({
        serviceDate: "2026-10-07",
        today: todaysPlate,
        history: [],
      });
    }
    if (url === "/api/admin/images") {
      return Response.json({ imageUrl });
    }
    if (url === "/api/admin/plates" && options.method === "POST") {
      const input = JSON.parse(options.body);
      const plate = {
        id: "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0",
        ...input,
      };
      savedPlates = [plate];
      return Response.json({ plate }, { status: 201 });
    }
    if (url === "/api/admin/plates/today" && options.method === "POST") {
      const { plateId } = JSON.parse(options.body);
      todaysPlate = savedPlates.find((plate) => plate.id === plateId);
      return Response.json({
        today: {
          serviceDate: "2026-10-07",
          plate: todaysPlate,
        },
      });
    }
    throw new Error(`Unexpected fake API request: ${options.method ?? "GET"} ${url}`);
  }

  class FakeFormData {
    get(name) {
      return {
        email: "corne.dawson@gmail.com",
        password: "test-password",
        rememberMe: "on",
      }[name] ?? null;
    }
  }

  const document = {
    querySelector: (selector) => elements[selector],
    createElement: () => new Element(),
  };
  const context = vm.createContext({
    document,
    fetch: fetchMock,
    FormData: FakeFormData,
    window: { confirm: () => true },
    console,
  });
  vm.runInContext(adminScript, context, { filename: "docs/admin/admin.js" });

  await elements["#sign-in-form"].listeners.submit({ preventDefault() {} });
  const signInCall = calls.find(
    ({ url, options }) => url === "/api/admin/session" && options.method === "POST",
  );
  assert.equal(JSON.parse(signInCall.options.body).rememberMe, true);
  assert.equal(elements["#dashboard"].hidden, false);

  elements["#plate-name"].value = "Cottage burger";
  elements["#plate-description"].value = "Beef and chips";
  elements["#plate-price"].value = "125";
  elements["#plate-image"].files = [{ type: "image/jpeg", size: 3 }];
  await elements["#plate-form"].listeners.submit({ preventDefault() {} });

  const uploadCall = calls.find(({ url }) => url === "/api/admin/images");
  const saveCall = calls.find(
    ({ url, options }) => url === "/api/admin/plates" && options.method === "POST",
  );
  assert.ok(uploadCall);
  assert.equal(uploadCall.options.headers["Content-Type"], "image/jpeg");
  assert.deepEqual(JSON.parse(saveCall.options.body), {
    name: "Cottage burger",
    description: "Beef and chips",
    priceCents: 12500,
    imageUrl,
  });

  elements["#today-select"].value = savedPlates[0].id;
  await elements["#set-today"].listeners.click();
  const assignmentCall = calls.find(
    ({ url, options }) => url === "/api/admin/plates/today" && options.method === "POST",
  );
  assert.deepEqual(JSON.parse(assignmentCall.options.body), {
    plateId: savedPlates[0].id,
  });
  assert.match(elements["#today-summary"].textContent, /Cottage burger/);
});
