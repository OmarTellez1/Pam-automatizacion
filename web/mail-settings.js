const form = document.querySelector("#mail-settings-form");
const editor = document.querySelector("#mailContent");
const saveButton = document.querySelector("#save-mail-settings");
const resultElement = document.querySelector("#mail-settings-result");
const markerButton = document.querySelector("#insert-request-ids-marker");
const requestIdsMarker = "{{REQUEST_IDS}}";

function showResult(type, message) {
  resultElement.hidden = false;
  resultElement.dataset.type = type;
  resultElement.textContent = message;
}

function applySettings(settings) {
  form.elements.to.value = settings.to ?? "";
  form.elements.cc.value = settings.cc ?? "";
  form.elements.subject.value = settings.subject ?? "";
  editor.innerHTML = settings.contentHtml ?? "";
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result), { once: true });
    reader.addEventListener("error", reject, { once: true });
    reader.readAsDataURL(file);
  });
}

function insertHtmlAtSelection(html) {
  editor.focus();
  const selection = window.getSelection();
  if (!selection.rangeCount || !editor.contains(selection.anchorNode)) {
    editor.insertAdjacentHTML("beforeend", html);
    return;
  }
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const template = document.createElement("template");
  template.innerHTML = html;
  const fragment = template.content;
  const lastNode = fragment.lastChild;
  range.insertNode(fragment);
  if (lastNode) {
    range.setStartAfter(lastNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

markerButton.addEventListener("click", () => {
  if (editor.innerHTML.includes(requestIdsMarker)) {
    showResult("error", `El contenido ya incluye ${requestIdsMarker}.`);
    editor.focus();
    return;
  }
  insertHtmlAtSelection(requestIdsMarker);
});

editor.addEventListener("paste", async (event) => {
  const clipboard = event.clipboardData;
  const html = clipboard?.getData("text/html") ?? "";
  const imageFiles = [...(clipboard?.items ?? [])]
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter(Boolean);

  if (!html && imageFiles.length === 0) return;
  event.preventDefault();

  const dataUrls = await Promise.all(imageFiles.map(fileAsDataUrl));
  if (!html) {
    insertHtmlAtSelection(dataUrls.map((src) => `<img src="${src}" alt="Imagen pegada">`).join(""));
    return;
  }

  const template = document.createElement("template");
  template.innerHTML = html;
  const unresolvedImages = [...template.content.querySelectorAll("img")]
    .filter((image) => !image.src.startsWith("data:image/"));
  unresolvedImages.forEach((image, index) => {
    if (dataUrls[index]) image.src = dataUrls[index];
    else image.remove();
  });
  const remainingImages = dataUrls.slice(unresolvedImages.length)
    .map((src) => `<img src="${src}" alt="Imagen pegada">`)
    .join("");
  insertHtmlAtSelection(`${template.innerHTML}${remainingImages}`);
});

async function loadSettings() {
  try {
    const response = await fetch("/api/mail-settings", { cache: "no-store" });
    if (!response.ok) throw new Error("mail settings unavailable");
    const result = await response.json();
    applySettings(result.settings);
  } catch {
    showResult("error", "No fue posible cargar la configuración de correo.");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  if (!editor.textContent.trim() && !editor.querySelector("img")) {
    showResult("error", "El contenido del correo es obligatorio.");
    editor.focus();
    return;
  }
  const markerCount = editor.innerHTML.split(requestIdsMarker).length - 1;
  if (markerCount !== 1) {
    showResult("error", `Incluya ${requestIdsMarker} exactamente una vez en el contenido.`);
    editor.focus();
    return;
  }

  saveButton.disabled = true;
  saveButton.querySelector("span:first-child").textContent = "Guardando…";
  resultElement.hidden = true;

  try {
    const response = await fetch("/api/mail-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: form.elements.to.value,
        cc: form.elements.cc.value,
        subject: form.elements.subject.value,
        contentHtml: editor.innerHTML,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      showResult("error", result.message);
      return;
    }
    applySettings(result.settings);
    showResult("success", result.message);
  } catch {
    showResult("error", "Se perdió la conexión con la interfaz local. Vuelva a intentarlo.");
  } finally {
    saveButton.disabled = false;
    saveButton.querySelector("span:first-child").textContent = "Guardar configuración";
  }
});

loadSettings();
