import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminHtml = await readFile(path.join(root, "docs/admin/index.html"), "utf8");
const adminCss = await readFile(path.join(root, "docs/admin/admin.css"), "utf8");
const adminScript = await readFile(path.join(root, "docs/admin/admin.js"), "utf8");

function initialAdminTheme(storedTheme = null) {
  const [, script] = adminHtml.match(/<script>\s*([\s\S]*?)\s*<\/script>/) ?? [];
  assert.ok(script, "admin.html contains its inline theme initialization script");
  const meta = { content: "" };
  const document = {
    documentElement: { dataset: {} },
    querySelector: (selector) =>
      selector === 'meta[name="theme-color"]' ? meta : null,
  };
  const context = vm.createContext({
    document,
    localStorage: { getItem: () => storedTheme },
  });
  vm.runInContext(script, context, { filename: "docs/admin/index.html inline theme script" });
  return { theme: document.documentElement.dataset.theme, themeColor: meta.content };
}

const adminSelectors = [
  "#status",
  "#sign-in-panel",
  "#sign-in-form",
  "#recovery-request-panel",
  "#recovery-request-form",
  "#password-reset-panel",
  "#password-reset-form",
  "#forgot-password",
  "#back-to-sign-in",
  "#back-from-password-reset",
  "#recovery-email",
  "#new-password",
  "#confirm-password",
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

test("admin theme defaults to dark and respects a saved shared theme", () => {
  assert.match(adminHtml, /<html lang="en" data-theme="dark">/);
  assert.deepEqual(initialAdminTheme(), { theme: "dark", themeColor: "#1c1a1a" });
  assert.deepEqual(initialAdminTheme("light"), { theme: "light", themeColor: "#f7f5ef" });
  assert.deepEqual(initialAdminTheme("dark"), { theme: "dark", themeColor: "#1c1a1a" });
  assert.match(adminHtml, /localStorage\.getItem\("cottage44-theme"\)/);
});

test("uses the exact Cottage 44 red accent in admin light and dark themes", () => {
  assert.match(adminCss, /--accent:\s*#C12025;/);
  assert.match(adminCss, /:root\[data-theme="light"\][\s\S]*?--accent:\s*#C12025;/);
});

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
  assert.match(adminHtml, /id="forgot-password"/);
  assert.match(adminHtml, /id="password-reset-form"/);

  const elements = Object.fromEntries(
    adminSelectors.map((selector) => [selector, new Element()]),
  );
  for (const selector of [
    "#dashboard",
    "#sign-out",
    "#recovery-request-panel",
    "#password-reset-panel",
  ]) {
    elements[selector].hidden = true;
  }
  const calls = [];
  let savedPlates = [];
  let todaysPlate = null;
  let failSignIn = true;
  const imageUrl =
    "https://cottage44-test.supabase.co/storage/v1/object/public/cottage44-plates/123e4567-e89b-42d3-a456-426614174000.jpg";

  async function fetchMock(url, options = {}) {
    calls.push({ url, options });
    if (url === "/api/admin/session" && !options.method) {
      return Response.json({ authenticated: false });
    }
    if (url === "/api/admin/session" && options.method === "POST") {
      if (failSignIn) {
        return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
      }
      return Response.json({ authenticated: true, email: "corne.dawson@gmail.com" });
    }
    if (url === "/api/admin/password-recovery" && options.method === "POST") {
      return Response.json({
        message: "If the address belongs to the owner account, a password reset email will arrive shortly.",
      });
    }
    if (url === "/api/admin/password-recovery/update" && options.method === "POST") {
      return Response.json({ updated: true });
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
    constructor(form) {
      this.form = form;
    }

    get(name) {
      return {
        email: "corne.dawson@gmail.com",
        password: "test-password",
        rememberMe: "on",
        newPassword: "new-owner-password",
        confirmPassword: "new-owner-password",
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
    URLSearchParams,
    window: {
      confirm: () => true,
      location: { search: "", pathname: "/admin/" },
      history: { replaceState() {} },
    },
    console,
  });
  vm.runInContext(adminScript, context, { filename: "docs/admin/admin.js" });

  await elements["#sign-in-form"].listeners.submit({ preventDefault() {} });
  assert.equal(elements["#status"].textContent, "Email or password is incorrect.");
  assert.equal(elements["#status"].dataset.kind, "error");
  assert.equal(elements["#dashboard"].hidden, true);

  failSignIn = false;
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

  await elements["#sign-out"].listeners.click();
  elements["#forgot-password"].listeners.click();
  assert.equal(elements["#recovery-request-panel"].hidden, false);
  await elements["#recovery-request-form"].listeners.submit({ preventDefault() {} });
  assert.match(elements["#status"].textContent, /If the address belongs to the owner account/);
  const recoveryCall = calls.find(({ url, options }) =>
    url === "/api/admin/password-recovery" && options.method === "POST");
  assert.deepEqual(JSON.parse(recoveryCall.options.body), {
    email: "corne.dawson@gmail.com",
  });
});

test("recovery UI displays nested API errors as human-readable messages", async () => {
  const elements = Object.fromEntries(
    adminSelectors.map((selector) => [selector, new Element()]),
  );
  elements["#dashboard"].hidden = true;
  elements["#sign-out"].hidden = true;
  elements["#recovery-request-panel"].hidden = true;
  elements["#password-reset-panel"].hidden = true;
  const requests = [];
  const document = {
    querySelector: (selector) => elements[selector],
    createElement: () => new Element(),
  };
  const context = vm.createContext({
    document,
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      if (url === "/api/admin/session") {
        return Response.json({ authenticated: false });
      }
      return Response.json(
        {
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "The service is temporarily unavailable.",
          },
        },
        { status: 503 },
      );
    },
    FormData: class {
      get(name) {
        return name === "email" ? "corne.dawson@gmail.com" : null;
      }
    },
    URLSearchParams,
    window: {
      location: { search: "", pathname: "/admin/" },
      history: { replaceState() {} },
    },
    console,
  });

  vm.runInContext(adminScript, context, { filename: "docs/admin/admin.js" });
  await new Promise(setImmediate);
  elements["#forgot-password"].listeners.click();
  await elements["#recovery-request-form"].listeners.submit({ preventDefault() {} });

  assert.equal(elements["#status"].textContent, "The service is temporarily unavailable.");
  assert.doesNotMatch(elements["#status"].textContent, /\[object Object\]/);
  assert.equal(
    requests.filter(({ url }) => url === "/api/admin/password-recovery").length,
    1,
  );
});

test("verified recovery links show the password form and submit the confirmed password", async () => {
  const elements = Object.fromEntries(
    adminSelectors.map((selector) => [selector, new Element()]),
  );
  elements["#dashboard"].hidden = true;
  elements["#sign-out"].hidden = true;
  elements["#recovery-request-panel"].hidden = true;
  elements["#password-reset-panel"].hidden = true;
  const requests = [];
  const document = {
    querySelector: (selector) => elements[selector],
    createElement: () => new Element(),
  };
  const context = vm.createContext({
    document,
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      return Response.json({ updated: true });
    },
    FormData: class {
      get(name) {
        return {
          newPassword: "new-owner-password",
          confirmPassword: "new-owner-password",
        }[name] ?? null;
      }
    },
    URLSearchParams,
    window: {
      location: { search: "?recovery=ready", pathname: "/admin/" },
      history: { replaceState() {} },
    },
    console,
  });

  vm.runInContext(adminScript, context, { filename: "docs/admin/admin.js" });
  assert.equal(elements["#sign-in-panel"].hidden, true);
  assert.equal(elements["#password-reset-panel"].hidden, false);
  assert.match(elements["#status"].textContent, /Reset link verified/);

  await elements["#password-reset-form"].listeners.submit({ preventDefault() {} });
  assert.equal(requests[0].url, "/api/admin/password-recovery/update");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    password: "new-owner-password",
  });
  assert.equal(elements["#password-reset-panel"].hidden, true);
  assert.equal(elements["#sign-in-panel"].hidden, false);
  assert.match(elements["#status"].textContent, /password has been updated/i);
});
