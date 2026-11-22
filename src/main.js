import { removeBackground } from "@imgly/background-removal";
import "./style.css";

const $ = (id) => document.getElementById(id);
const input = $("file-input"), drop = $("drop-zone"), run = $("remove-button");
const download = $("download-button"), reset = $("reset-button"), grid = $("preview-grid");
const original = $("original-preview"), result = $("result-preview"), progress = $("progress-wrap");
const bar = $("progress-bar"), status = $("status"), modelSelect = $("model-select");
const MAX_FILE_BYTES = 15 * 1024 * 1024, MAX_PIXELS = 18000000, MAX_EDGE = 3072;
let file = null, resultUrl = null, originalUrl = null, busy = false;

function setStatus(message, percent, state = "info") {
  status.textContent = message;
  status.dataset.state = state;
  if (percent !== undefined && percent !== null) bar.style.width = Math.max(0, Math.min(100, percent)) + "%";
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
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Your browser could not prepare this image.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const resized = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image optimization failed.")), "image/jpeg", 0.94);
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
["dragenter", "dragover"].forEach((name) => drop.addEventListener(name, (event) => {
  event.preventDefault();
  if (!busy) drop.classList.add("dragging");
}));
["dragleave", "drop"].forEach((name) => drop.addEventListener(name, (event) => {
  event.preventDefault();
  drop.classList.remove("dragging");
}));
drop.addEventListener("drop", (event) => selectFile(event.dataTransfer.files?.[0]));

run.addEventListener("click", async () => {
  if (!file || busy) return;
  busy = true;
  run.disabled = true;
  input.disabled = true;
  modelSelect.disabled = true;
  reset.disabled = true;
  progress.hidden = false;
  clearResult();
  setStatus("Preparing your image…", 3);
  try {
    const source = await prepareImage(file);
    const model = modelSelect.value;
    setStatus(model === "isnet_quint8" ? "Loading the lightweight AI model. First run can take longer…" : "Loading the high-detail AI model. First run can take longer…", 8);
    const blob = await removeBackground(source, {
      model,
      output: { format: "image/png" },
      progress: (key, current, total) => {
        const ratio = total > 0 ? current / total : 0;
        const percent = Math.min(76, 8 + Math.round(ratio * 68));
        const stage = String(key).toLowerCase();
        const label = stage.includes("fetch") || stage.includes("download") ? "Downloading and caching AI assets…" :
          stage.includes("decode") ? "Preparing image data…" : "Loading AI model…";
        setStatus(label + (total > 0 ? " " + Math.round(ratio * 100) + "%" : ""), percent);
      }
    });
    if (!(blob instanceof Blob) || blob.size === 0) throw new Error("The AI model returned an empty image.");
    setStatus("Finishing transparent PNG…", 90);
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
    setStatus("Background removed. Your transparent PNG is ready to download.", 100, "success");
  } catch (error) {
    console.error("Background removal failed:", error);
    const message = String(error?.message || error || "");
    let help = "Try a smaller JPG or PNG, switch to Fast mode, close other tabs, and retry.";
    if (/network|fetch|load|http/i.test(message)) help = "The AI model could not load. Check your connection, disable content blockers for this site, and retry.";
    if (/memory|alloc|wasm|webgl|webgpu/i.test(message)) help = "Your browser may be low on memory. Choose Fast mode, use a smaller image, or try a desktop browser.";
    setStatus("Could not remove this background. " + help, 0, "error");
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
$("sample-note").textContent = "Tip: the first run downloads AI assets. Your browser caches them for later visits.";
const api = import.meta.env.VITE_API_BASE_URL;
if (api) {
  fetch(api.replace(/\/$/, "") + "/api/health", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error("API unavailable");
      $("api-status").textContent = "Optional API online · image processing stays on your device";
    })
    .catch(() => $("api-status").textContent = "Private on-device processing · optional API offline");
}
