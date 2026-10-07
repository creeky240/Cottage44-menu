import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(path.join(root, "docs/index.html"), "utf8");
const menuScript = await readFile(path.join(root, "docs/menu.js"), "utf8");

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.textContent = "";
  }

  append(...elements) {
    this.children.push(...elements);
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  addEventListener(event, callback) {
    this.listeners ??= {};
    this.listeners[event] = callback;
  }
}

function createPage(theme = "light") {
  const elements = {
    "#category-nav": new Element("div"),
    "#menu-sections": new Element("div"),
    ".theme-toggle": new Element("button"),
    ".theme-toggle__label": new Element("span"),
    'meta[name="theme-color"]': { content: "" },
  };
  const document = {
    documentElement: { dataset: { theme } },
    querySelector: (selector) => elements[selector],
    createElement: (tagName) => new Element(tagName),
  };
  const storedValues = new Map();
  const localStorage = {
    getItem: (key) => storedValues.get(key) ?? null,
    setItem: (key, value) => storedValues.set(key, value),
  };
  const context = vm.createContext({
    document,
    localStorage,
    getComputedStyle: () => ({
      getPropertyValue: (property) =>
        property === "--color-page"
          ? document.documentElement.dataset.theme === "dark"
            ? "#222222"
            : "#ffffff"
          : "",
    }),
  });

  vm.runInContext(menuScript, context, { filename: "docs/menu.js" });
  return { document, elements, localStorage };
}

function runInitialThemeScript({ storedTheme = null, prefersDark = false } = {}) {
  const [, script] = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/) ?? [];
  assert.ok(script, "index.html contains its inline theme initialization script");

  const document = { documentElement: { dataset: {} } };
  const context = vm.createContext({
    document,
    localStorage: { getItem: () => storedTheme },
    window: { matchMedia: () => ({ matches: prefersDark }) },
  });
  vm.runInContext(script, context, { filename: "docs/index.html inline theme script" });
  return document.documentElement.dataset.theme;
}

test("renders every menu category, item, price, and optional description", () => {
  const { elements } = createPage();
  const categories = elements["#menu-sections"].children;
  const navigation = elements["#category-nav"].children;

  assert.deepEqual(
    categories.map((section) => section.children[0].textContent),
    ["Toasties", "Healthy", "Lunch", "Burgers", "Singles", "Breakfast"],
  );
  assert.deepEqual(
    categories.map((section) => section.children[1].children.length),
    [7, 6, 9, 3, 9, 3],
  );
  assert.equal(navigation.length, categories.length);

  let itemCount = 0;
  for (const [index, section] of categories.entries()) {
    const heading = section.children[0];
    const items = section.children[1].children;
    const link = navigation[index];

    assert.equal(section.className, "menu-category");
    assert.equal(section.attributes["aria-labelledby"], heading.id);
    assert.equal(link.textContent, heading.textContent);
    assert.equal(link.href, `#${section.id}`);
    assert.equal(heading.id, `${section.id}-title`);

    for (const item of items) {
      const [details, price] = item.children;
      assert.equal(item.className, "menu-item");
      assert.match(price.textContent, /^R\d+$/);
      assert.ok(details.children[0].textContent.length > 0);
      if (details.children[1]) {
        assert.match(details.children[1].textContent, /^\(.+\)$/);
      }
      itemCount += 1;
    }
  }

  assert.equal(itemCount, 37);
  const lunchItems = categories[2].children[1].children;
  assert.deepEqual(
    lunchItems[4].children[0].children.map((element) => element.textContent),
    ["Loaded fries", "(Chips, cheese sauce, cheese and bacon)"],
  );
  assert.equal(lunchItems[4].children[1].textContent, "R38");
  assert.deepEqual(
    categories[5].children[1].children[2].children[0].children.map(
      (element) => element.textContent,
    ),
    ["Special breakfast", "(2 eggs, 125g chips, 2 bread, 2 bacon, russian, salad)"],
  );
  assert.equal(categories[5].children[1].children[2].children[1].textContent, "R50");
});

test("initializes the theme toggle accessibly from the page theme", () => {
  const { document, elements } = createPage("dark");
  const toggle = elements[".theme-toggle"];

  assert.equal(document.documentElement.dataset.theme, "dark");
  assert.equal(toggle.attributes["aria-pressed"], "true");
  assert.equal(toggle.attributes["aria-label"], "Switch to light theme");
  assert.equal(elements[".theme-toggle__label"].textContent, "Light");
  assert.equal(elements['meta[name="theme-color"]'].content, "#222222");
});

test("switches theme and stores the preference when the toggle is clicked", () => {
  const { document, elements, localStorage } = createPage();
  const toggle = elements[".theme-toggle"];

  toggle.listeners.click();
  assert.equal(document.documentElement.dataset.theme, "dark");
  assert.equal(localStorage.getItem("cottage44-theme"), "dark");
  assert.equal(toggle.attributes["aria-pressed"], "true");
  assert.equal(toggle.attributes["aria-label"], "Switch to light theme");
  assert.equal(elements[".theme-toggle__label"].textContent, "Light");
  assert.equal(elements['meta[name="theme-color"]'].content, "#222222");

  toggle.listeners.click();
  assert.equal(document.documentElement.dataset.theme, "light");
  assert.equal(localStorage.getItem("cottage44-theme"), "light");
  assert.equal(toggle.attributes["aria-pressed"], "false");
  assert.equal(toggle.attributes["aria-label"], "Switch to dark theme");
  assert.equal(elements[".theme-toggle__label"].textContent, "Dark");
  assert.equal(elements['meta[name="theme-color"]'].content, "#ffffff");
});

test("chooses a valid saved theme before the system preference", () => {
  assert.equal(runInitialThemeScript({ storedTheme: "dark" }), "dark");
  assert.equal(runInitialThemeScript({ storedTheme: "light", prefersDark: true }), "light");
  assert.equal(runInitialThemeScript({ storedTheme: "invalid", prefersDark: true }), "dark");
  assert.equal(runInitialThemeScript({ storedTheme: "invalid" }), "light");
});
