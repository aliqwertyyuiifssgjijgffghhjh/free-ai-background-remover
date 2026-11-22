import "./style.css";

const $ = (id) => document.getElementById(id);
const input = $("file-input"), drop = $("drop-zone"), run = $("remove-button");
const download = $("download-button"), reset = $("reset-button"), grid = $("preview-grid");
const original = $("original-preview"), result = $("result-preview"), progress = $("progress-wrap");
const bar = $("progress-bar"), status = $("status"), modelSelect = $("model-select"), percentLabel = $("progress-percent");
const MAX_FILE_BYTES = 15 * 1024 * 1024, MAX_PIXELS = 18000000, MAX_EDGE = 3072;
let file = null, resultUrl = null, originalUrl = null, busy = false, enginePromise = null;

const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const apiUrl = (apiBase || window.location.origin) + "/api/remove";

async function getEngine() {
  if (!enginePromise) enginePromise = import("@imgly/background-removal").catch((error) => {
    enginePromise = null;
    throw error;
  });
  return enginePromise;
}
function setStatus(message, percent, state = "info") {
  status.textContent = message;
  status.dataset.state = state;
  if (percent !== undefined && percent !== null) {
    const value = Math.max(0, Math.min(100, percent));
    bar.style.width = value + "%";
    if (percentLabel) percentLabel.textContent = Math.round(value) + "%";
  }
}
function clearResult() {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = null;
  result.removeAttribute("src");
  download.removeAttribute("href");
  download.classList.add("disabled");
  download.setAttribute("aria-disabled", "true");
}
function clearPreview() {
  clearResult();
  if (originalUrl) URL.revokeObjectURL(originalUrl);
  originalUrl = null;
  original.removeAttribute("src");
}
async function prepareImage(source) {
  const bitmap = await createImageBitmap(source);
  try {
    const pixels = bitmap.width * bitmap.height;
    if (pixels <= MAX_PIXELS && Math.max(bitmap.width, bitmap.height) <= 5000) return source;
    const scale = Math.min(MAX_EDGE / bitmap.width, MAX_EDGE / bitmap.height, 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Your browser could not prepare this image.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const resized = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image optimization failed.")), "image/png");
    });
    setStatus("Large image optimized to protect your device memory.", 4);
    return resized;
  } finally { bitmap.close(); }
}
function selectFile(candidate) {
  if (!candidate || busy) return;
  if (!["image/png", "image/jpeg", "image/webp"].includes(candidate.type)) {
    progress.hidden = false;
    setStatus("Please choose a PNG, JPG, or WebP image.", 0, "error");
    return;
  }
  if (candidate.size > MAX_FILE_BYTES) {
    progress.hidden = false;
    setStatus("This image is larger than 15 MB. Choose a smaller file.", 0, "error");
    return;
  }
  file = candidate;
  progress.hidden = true;
  clearPreview();
  originalUrl = URL.createObjectURL(candidate);
  original.src = originalUrl;
  original.onerror = () => setStatus("The selected image could not be previewed. Try another file.", 0, "error");
  grid.hidden = false;
  drop.classList.add("compact");
  run.disabled = false;
  reset.hidden = false;
  progress.hidden = true;
}
input.addEventListener("change", (event) => selectFile(event.target.files?.[0]));
drop.addEventListener("keydown", (event) => {
  if (event.target !== drop || busy) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    input.click();
  }
});
["dragenter", "dragover"].forEach((name) => drop.addEventListener(name, (event) => {
  event.preventDefault();
  if (!busy) drop.classList.add("dragging");
}));
["dragleave", "drop"].forEach((name) => drop.addEventListener(name, (event) => {
  event.preventDefault();
  drop.classList.remove("dragging");
}));
drop.addEventListener("drop", (event) => selectFile(event.dataTransfer.files?.[0]));

async function removeOnServer(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": source.type },
      body: source,
      signal: controller.signal,
    });
    if (!response.ok) {
      let detail = "";
      try { detail = (await response.json()).error || ""; } catch {}
      const error = new Error(detail || "Server processing is unavailable.");
      error.status = response.status;
      throw error;
    }
    const type = response.headers.get("content-type") || "";
    if (!type.includes("image/png")) throw new Error("Server returned an unexpected image format.");
    const blob = await response.blob();
    if (!blob.size) throw new Error("Server returned an empty image.");
    return blob;
  } finally { clearTimeout(timeout); }
}
async function removeInBrowser(source) {
  if (!("createImageBitmap" in window) || !("WebAssembly" in window)) {
    throw new Error("Your browser does not support the image processing features required by this tool.");
  }
  const prepared = await prepareImage(source);
  setStatus("Loading the browser AI fallback…", 8);
  const { removeBackground } = await getEngine();
  const blob = await removeBackground(prepared, {
    model: modelSelect.value,
    output: { format: "image/png" },
    progress: (key, current, total) => {
      const ratio = total > 0 ? current / total : 0;
      const percent = Math.min(76, 8 + Math.round(ratio * 68));
      const stage = String(key).toLowerCase();
      const label = stage.includes("fetch") || stage.includes("download")
        ? "Downloading and caching browser AI assets…"
        : stage.includes("decode") ? "Preparing image data…" : "Loading browser AI model…";
      setStatus(label + (total > 0 ? " " + Math.round(ratio * 100) + "%" : ""), percent);
    },
  });
  if (!(blob instanceof Blob) || blob.size === 0) throw new Error("The browser AI model returned an empty image.");
  return blob;
}
run.addEventListener("click", async () => {
  if (!file || busy) return;
  busy = true;
  run.disabled = true;
  input.disabled = true;
  modelSelect.disabled = true;
  reset.disabled = true;
  progress.hidden = false;
  clearResult();
  setStatus("Sending image to Cloudflare AI…", 3);
  let blob;
  let processingMode = "Cloudflare server AI";
  try {
    try {
      blob = await removeOnServer(file);
    } catch (serverError) {
      if ([400, 413, 415].includes(serverError.status)) throw serverError;
      console.warn("Server AI unavailable; using browser fallback:", serverError);
      processingMode = "Browser AI fallback";
      setStatus("Server AI is unavailable. Switching to browser AI…", 7);
      blob = await removeInBrowser(file);
    }
    setStatus("Finishing transparent PNG…", 94);
    resultUrl = URL.createObjectURL(blob);
    result.src = resultUrl;
    result.onerror = () => {
      clearResult();
      setStatus("The result preview could not be displayed. Please try again.", 0, "error");
    };
    download.href = resultUrl;
    download.download = file.name.replace(/\.[^.]+$/, "") + "-background-removed.png";
    download.classList.remove("disabled");
    download.setAttribute("aria-disabled", "false");
    setStatus("Background removed with " + processingMode + ". Your transparent PNG is ready.", 100, "success");
  } catch (error) {
    console.error("Background removal failed:", error);
    const message = String(error?.message || error || "");
    let help = "Try a smaller JPG or PNG, switch to Fast mode, close other tabs, and retry.";
    if (/network|fetch|load|http/i.test(message)) help = "The AI service or model could not load. Check your connection and retry.";
    if (/memory|alloc|wasm|webgl|webgpu/i.test(message)) help = "Your browser may be low on memory. Choose Fast mode, use a smaller image, or try a desktop browser.";
    setStatus("Could not remove this background. " + (error.status ? message : help), 0, "error");
  } finally {
    busy = false;
    run.disabled = !file;
    input.disabled = false;
    modelSelect.disabled = false;
    reset.disabled = false;
  }
});
reset.addEventListener("click", () => {
  if (busy) return;
  file = null;
  input.value = "";
  clearPreview();
  grid.hidden = true;
  drop.classList.remove("compact");
  run.disabled = true;
  reset.hidden = true;
  progress.hidden = true;
  bar.style.width = "0%";
  status.textContent = "";
  delete status.dataset.state;
});
$("sample-note").textContent = "Cloudflare server AI is tried first. If unavailable, browser AI takes over; its first model download can take longer.";

fetch((apiBase || window.location.origin) + "/api/health", { cache: "no-store" })
  .then(async (response) => {
    if (!response.ok) throw new Error("API unavailable");
    const health = await response.json();
    $("api-status").textContent = health.serverRemovalReady
      ? "Cloudflare server AI ready · browser fallback available"
      : "Browser AI fallback ready · server AI not configured";
  })
  .catch(() => $("api-status").textContent = "Browser AI fallback available · server status unavailable");
