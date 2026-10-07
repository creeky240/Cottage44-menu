"use strict";

const statusElement = document.querySelector("#status");
const signInPanel = document.querySelector("#sign-in-panel");
const signInForm = document.querySelector("#sign-in-form");
const dashboard = document.querySelector("#dashboard");
const signOutButton = document.querySelector("#sign-out");
const plateForm = document.querySelector("#plate-form");
const plateIdInput = document.querySelector("#plate-id");
const nameInput = document.querySelector("#plate-name");
const descriptionInput = document.querySelector("#plate-description");
const priceInput = document.querySelector("#plate-price");
const imageInput = document.querySelector("#plate-image");
const imageNote = document.querySelector("#image-note");
const plateList = document.querySelector("#plate-list");
const historyList = document.querySelector("#history-list");
const todaySelect = document.querySelector("#today-select");
const todaySummary = document.querySelector("#today-summary");
const serviceDate = document.querySelector("#service-date");
const setTodayButton = document.querySelector("#set-today");
const newPlateButton = document.querySelector("#new-plate");
const cancelEditButton = document.querySelector("#cancel-edit");

let plates = [];
let history = [];
let todayPlateId = null;
let savedImageUrl = null;

function setStatus(message, kind = "") {
  statusElement.textContent = message;
  statusElement.dataset.kind = kind;
}

async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error("The server could not be reached. Check your connection and try again.");
  }

  let body = {};
  try {
    body = await response.json();
  } catch {
    throw new Error("The server returned an unreadable response.");
  }
  if (!response.ok) {
    if (response.status === 401) {
      showSignedOut();
      throw new Error("Your session expired. Please sign in again.");
    }
    throw new Error(body.error || "The request could not be completed.");
  }
  return body;
}

function showSignedOut() {
  dashboard.hidden = true;
  signOutButton.hidden = true;
  signInPanel.hidden = false;
}

async function showDashboard() {
  signInPanel.hidden = true;
  dashboard.hidden = false;
  signOutButton.hidden = false;
  await loadDashboard();
}

function formatPrice(priceCents) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
  }).format(priceCents / 100);
}

function updateTodaySummary() {
  const selected = plates.find((plate) => plate.id === todayPlateId);
  todaySummary.textContent = selected
    ? `${selected.name} — ${formatPrice(selected.priceCents)}`
    : "No plate has been selected for today.";
}

function renderPlateList() {
  plateList.replaceChildren();
  todaySelect.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = plates.length ? "Select a saved plate" : "Save a plate first";
  todaySelect.append(placeholder);

  for (const plate of plates) {
    const option = document.createElement("option");
    option.value = plate.id;
    option.textContent = plate.name;
    option.selected = plate.id === todayPlateId;
    todaySelect.append(option);

    const item = document.createElement("li");
    item.className = "plate-item";
    const details = document.createElement("div");
    details.className = "plate-item__details";
    const name = document.createElement("span");
    name.className = "plate-item__name";
    name.textContent = `${plate.name} — ${formatPrice(plate.priceCents)}`;
    const description = document.createElement("span");
    description.className = "plate-item__description";
    description.textContent = plate.description || "No description";
    details.append(name, description);

    const actions = document.createElement("div");
    actions.className = "plate-item__actions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "button button--quiet";
    editButton.textContent = "Edit";
    editButton.setAttribute("aria-label", `Edit ${plate.name}`);
    editButton.addEventListener("click", () => editPlate(plate));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "button button--quiet";
    deleteButton.textContent = "Delete";
    deleteButton.setAttribute("aria-label", `Delete ${plate.name}`);
    deleteButton.addEventListener("click", () => deletePlate(plate));
    actions.append(editButton, deleteButton);
    item.append(details, actions);
    plateList.append(item);
  }
  setTodayButton.disabled = plates.length === 0;
  updateTodaySummary();
}

function renderHistory() {
  historyList.replaceChildren();
  for (const item of history) {
    const row = document.createElement("li");
    row.className = "history-item";
    const details = document.createElement("div");
    details.className = "history-item__details";
    const date = document.createElement("span");
    date.className = "eyebrow";
    date.textContent = item.serviceDate;
    const name = document.createElement("span");
    name.className = "history-item__name";
    name.textContent = item.plate.name;
    details.append(date, name);
    row.append(details);
    historyList.append(row);
  }
  if (history.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No saved history yet.";
    historyList.append(empty);
  }
}

async function loadDashboard() {
  setStatus("Loading saved plates and history…");
  try {
    const catalog = await apiRequest("/api/admin/plates");
    const daily = await apiRequest("/api/admin/plates/today");
    plates = catalog.plates;
    history = daily.history;
    todayPlateId = daily.today?.id ?? null;
    serviceDate.textContent = daily.serviceDate;
    renderPlateList();
    renderHistory();
    setStatus("");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function resetForm() {
  plateForm.reset();
  plateIdInput.value = "";
  savedImageUrl = null;
  imageNote.textContent = "No photo selected. Choosing a new image replaces the saved photo.";
  cancelEditButton.hidden = true;
  document.querySelector("#editor-title").textContent = "Plate details";
}

function editPlate(plate) {
  plateIdInput.value = plate.id;
  nameInput.value = plate.name;
  descriptionInput.value = plate.description;
  priceInput.value = (plate.priceCents / 100).toFixed(2);
  imageInput.value = "";
  savedImageUrl = plate.imageUrl;
  imageNote.textContent = savedImageUrl
    ? "A saved photo will be kept unless you choose a replacement."
    : "No saved photo. Add one if you want a photo with this plate.";
  cancelEditButton.hidden = false;
  document.querySelector("#editor-title").textContent = `Edit ${plate.name}`;
  nameInput.focus();
}

async function uploadSelectedImage() {
  const image = imageInput.files[0];
  if (!image) {
    return savedImageUrl;
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(image.type)) {
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  }
  if (image.size < 1 || image.size > 5 * 1024 * 1024) {
    throw new Error("The image must be no larger than 5 MB.");
  }
  const response = await fetch("/api/admin/images", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": image.type },
    body: image,
  });
  let body = {};
  try {
    body = await response.json();
  } catch {
    throw new Error("The image upload returned an unreadable response.");
  }
  if (!response.ok) {
    if (response.status === 401) {
      showSignedOut();
    }
    throw new Error(body.error || "The image could not be uploaded.");
  }
  return body.imageUrl;
}

async function deletePlate(plate) {
  if (!window.confirm(`Delete “${plate.name}”? Saved history will prevent deletion.`)) {
    return;
  }
  setStatus(`Deleting ${plate.name}…`);
  try {
    await apiRequest(`/api/admin/plates/${encodeURIComponent(plate.id)}`, {
      method: "DELETE",
    });
    plates = plates.filter((item) => item.id !== plate.id);
    if (todayPlateId === plate.id) {
      todayPlateId = null;
    }
    renderPlateList();
    setStatus("Plate deleted.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

signInForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Signing in…");
  const formData = new FormData(signInForm);
  try {
    await apiRequest("/api/admin/session", {
      method: "POST",
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password"),
        rememberMe: formData.get("rememberMe") === "on",
      }),
    });
    signInForm.reset();
    setStatus("Signed in.", "success");
    await showDashboard();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

signOutButton.addEventListener("click", async () => {
  try {
    await apiRequest("/api/admin/session", { method: "DELETE" });
    showSignedOut();
    setStatus("Signed out.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

plateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const price = Number(priceInput.value);
  const priceCents = Math.round(price * 100);
  if (!Number.isFinite(price) || price < 0 || Math.abs(priceCents / 100 - price) > 0.000001) {
    setStatus("Enter a valid price with no more than two decimal places.", "error");
    priceInput.focus();
    return;
  }

  setStatus("Saving plate…");
  try {
    const imageUrl = await uploadSelectedImage();
    const payload = {
      name: nameInput.value,
      description: descriptionInput.value,
      priceCents,
      imageUrl: imageUrl || null,
    };
    const id = plateIdInput.value;
    const saved = await apiRequest(
      id ? `/api/admin/plates/${encodeURIComponent(id)}` : "/api/admin/plates",
      {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      },
    );
    resetForm();
    await loadDashboard();
    setStatus(`${saved.plate.name} saved.`, "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

setTodayButton.addEventListener("click", async () => {
  if (!todaySelect.value) {
    setStatus("Choose a saved plate first.", "error");
    todaySelect.focus();
    return;
  }
  setStatus("Setting today’s plate…");
  try {
    const result = await apiRequest("/api/admin/plates/today", {
      method: "POST",
      body: JSON.stringify({ plateId: todaySelect.value }),
    });
    todayPlateId = result.today.plate.id;
    updateTodaySummary();
    setStatus(`Today’s plate is now ${result.today.plate.name}.`, "success");
    await loadDashboard();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

todaySelect.addEventListener("change", updateTodaySummary);
newPlateButton.addEventListener("click", () => {
  resetForm();
  nameInput.focus();
});
cancelEditButton.addEventListener("click", resetForm);

async function initialize() {
  document.querySelector("#email").value = "corne.dawson@gmail.com";
  try {
    const session = await apiRequest("/api/admin/session");
    if (session.authenticated) {
      await showDashboard();
      return;
    }
  } catch (error) {
    setStatus(error.message, "error");
  }
}

initialize();
