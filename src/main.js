import removeBackground from "@imgly/background-removal";
import "./style.css";

const $ = (id) => document.getElementById(id);
const input = $("file-input");
const dropZone = $("drop-zone");
const removeButton = $("remove-button");
const downloadButton = $("download-button");
const resetButton = $("reset-button");
const previewGrid = $("preview-grid");
const originalPreview = $("original-preview");
const resultPreview = $("result-preview");
const progressWrap = $("progress-wrap");
const progressBar = $("progress-bar");
const status = $("status");

let selectedFile = null;
let resultUrl = null;
let busy = false;

function setStatus(message, progress = null) {
  status.textContent = message;
  if (progress !== null) progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
}

function clearResult() {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = null;
  resultPreview.removeAttribute("src");
  downloadButton.removeAttribute("href");
  downloadButton.classList.add("disabled");
  downloadButton.setAttribute("aria-disabled", "true");
}

function chooseFile(file) {
  if (!file) return;
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    alert("Please choose a PNG, JPG, or WebP image.");
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    alert("Please choose an image smaller than 15 MB.");
    return;
  }
  selectedFile = file;
  clearResult();
  originalPreview.src = URL.createObjectURL(file);
  previewGrid.hidden = false;
  dropZone.classList.add("compact");
  removeButton.disabled = false;
  removeButton.textContent = "Remove background";
  resetButton.hidden = false;
  progressWrap.hidden = true;
}

input.addEventListener("change", (event) => chooseFile(event.target.files?.[0]));
for (const eventName of ["dragenter", "dragover"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  });
}
dropZone.addEventListener("drop", (event) => chooseFile(event.dataTransfer.files?.[0]));

removeButton.addEventListener("click", async () => {
  if (!selectedFile || busy) return;
  busy = true;
  removeButton.disabled = true;
  progressWrap.hidden = false;
  setStatus("Loading AI model. The first run may take a little longer…", 8);
  try {
    const blob = await removeBackground(selectedFile, {
      progress: (key, current, total) => {
        const percent = total > 0 ? Math.round((current / total) * 85) : 20;
        setStatus(`Processing: ${key}`, Math.max(8, percent));
      }
    });
    clearResult();
    resultUrl = URL.createObjectURL(blob);
    resultPreview.src = resultUrl;
    downloadButton.href = resultUrl;
    downloadButton.download = `${selectedFile.name.replace(/\.[^.]+$/, "")}-no-background.png`;
    downloadButton.classList.remove("disabled");
    downloadButton.setAttribute("aria-disabled", "false");
    setStatus("Done! Your transparent PNG is ready.", 100);
  } catch (error) {
    console.error("Background removal failed:", error);
    setStatus("Could not process this image. Try a smaller image or a supported browser.", 0);
  } finally {
    busy = false;
    removeButton.disabled = !selectedFile;
  }
});

resetButton.addEventListener("click", () => {
  selectedFile = null;
  input.value = "";
  clearResult();
  originalPreview.removeAttribute("src");
  previewGrid.hidden = true;
  dropZone.classList.remove("compact");
  removeButton.disabled = true;
  resetButton.hidden = true;
  progressWrap.hidden = true;
  progressBar.style.width = "0%";
});

async function checkApi() {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (!base) return;
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/api/health`);
    if (response.ok) $("api-status").textContent = "Optional API online · AI runs locally";
  } catch {
    $("api-status").textContent = "Local processing · optional API unavailable";
  }
}
checkApi();
