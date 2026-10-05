const menu = [
  {
    category: "Toasties",
    items: [
      ["Bacon, Egg and Cheese", "R27"],
      ["Ham and Cheese", "R23"],
      ["Ham, Cheese and Tomato", "R25"],
      ["Chicken Mayo", "R25"],
      ["Cheese and Tomato", "R20"],
      ["Bacon and Cheese", "R25"],
      ["Egg Mayonnaise", "R20"],
    ],
  },
  {
    category: "Healthy",
    items: [
      ["Chicken salad", "R38"],
      ["Bacon salad", "R38"],
      ["Chicken wrap with salad filling", "R38"],
      ["Tramazinni", "R48"],
      ["Tea or coffee", "R10"],
      ["Cuppachino", "R15"],
    ],
  },
  {
    category: "Lunch",
    items: [
      ["Hotdog roll", "R15"],
      ["Chip roll with white sauce", "R25"],
      ["Russian roll with 125g chips", "R30"],
      ["300g chips", "R20"],
      ["Loaded fries", "R38", "Chips, cheese sauce, cheese and bacon"],
      ["Russian and 300g chips", "R30"],
      ["Nuggets and 300g chips", "R36"],
      ["Skambane", "R35", "Russian, chips, cheese and ¼ bread"],
      ["Strips and 300g chips", "R40"],
    ],
  },
  {
    category: "Burgers",
    items: [
      ["Dagwood with 300g chips", "R50"],
      ["Beef burger with 125g chips", "R40"],
      ["Crumbed chicken burger with 125g chips", "R40"],
    ],
  },
  {
    category: "Singles",
    items: [
      ["Russian", "R12"],
      ["Vienna", "R8"],
      ["6 Nuggets", "R16"],
      ["3 Strips", "R25"],
      ["Fried egg", "R5"],
      ["Rolls", "R5"],
      ["⅓ bread", "R8"],
      ["⅓ bread with butter", "R10"],
      ["Butter", "R4"],
    ],
  },
  {
    category: "Breakfast",
    items: [
      ["All day breakfast", "R35", "2 eggs, 125g chips, bread, 2 bacon"],
      ["Starter pack", "R30", "2 eggs, 125g chips, 2 bread, vienna"],
      ["Special breakfast", "R50", "2 eggs, 125g chips, 2 bread, 2 bacon, russian, salad"],
    ],
  },
];

const categoryNav = document.querySelector("#category-nav");
const menuSections = document.querySelector("#menu-sections");
const themeToggle = document.querySelector(".theme-toggle");
const themeLabel = document.querySelector(".theme-toggle__label");

for (const { category, items } of menu) {
  const sectionId = `category-${category.toLowerCase()}`;
  const link = document.createElement("a");
  link.className = "category-nav__link";
  link.href = `#${sectionId}`;
  link.textContent = category;
  categoryNav.append(link);

  const section = document.createElement("section");
  section.className = "menu-category";
  section.id = sectionId;
  section.setAttribute("aria-labelledby", `${sectionId}-title`);

  const heading = document.createElement("h3");
  heading.className = "menu-category__title";
  heading.id = `${sectionId}-title`;
  heading.textContent = category;
  section.append(heading);

  const list = document.createElement("ul");
  list.className = "menu-list";

  for (const [name, price, contents] of items) {
    const item = document.createElement("li");
    item.className = "menu-item";

    const details = document.createElement("span");
    details.className = "menu-item__details";
    const itemName = document.createElement("span");
    itemName.className = "menu-item__name";
    itemName.textContent = name;
    details.append(itemName);

    if (contents) {
      const itemContents = document.createElement("span");
      itemContents.className = "menu-item__contents";
      itemContents.textContent = `(${contents})`;
      details.append(itemContents);
    }

    const itemPrice = document.createElement("span");
    itemPrice.className = "menu-item__price";
    itemPrice.textContent = price;
    item.append(details, itemPrice);
    list.append(item);
  }

  section.append(list);
  menuSections.append(section);
}

function setTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = theme;
  themeToggle.setAttribute("aria-pressed", String(isDark));
  themeToggle.setAttribute(
    "aria-label",
    `Switch to ${isDark ? "light" : "dark"} theme`,
  );
  themeLabel.textContent = isDark ? "Light" : "Dark";
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(
    document.documentElement,
  )
    .getPropertyValue("--color-page")
    .trim();
}

setTheme(document.documentElement.dataset.theme);
themeToggle.addEventListener("click", () => {
  const nextTheme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("cottage44-theme", nextTheme);
  setTheme(nextTheme);
});
