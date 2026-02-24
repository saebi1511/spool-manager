// --- Service Worker (offline) ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
}

// --- Helpers ---
function uid() {
  return "sp_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
}

function normalize(s) {
  return (s || "").toString().trim();
}

function blobToObjectURL(blob) {
  if (!blob) return "";
  return URL.createObjectURL(blob);
}

function downloadFile(filename, text, mime = "application/json") {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function stateLabel(v) {
  return v === "new" ? "neu" : "offen";
}

function stateBadgeHTML(v) {
  const dotClass = v === "new" ? "dot--new" : "dot--open";
  const label = stateLabel(v);
  return `<span class="badge"><span class="dot ${dotClass}"></span>${label}</span>`;
}

function escapeHtml(s) {
  return (s || "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// --- State ---
let all = [];
let photoObjectURLs = new Map(); // id -> objectURL for cleanup

// --- DOM ---
const $ = (id) => document.getElementById(id);

const listEl = $("list");
const emptyEl = $("empty");
const statsEl = $("stats");

const dlg = $("dlg");
const dlgTitle = $("dlgTitle");

const btnAdd = $("btnAdd");
const btnBackup = $("btnBackup");

const q = $("q");
const fMaterial = $("fMaterial");
const fVariant = $("fVariant");
const fColorGroup = $("fColorGroup");
const fBrand = $("fBrand");
const fState = $("fState");
const sortBy = $("sortBy");
const onlyWithPhoto = $("onlyWithPhoto");
const btnClearFilters = $("btnClearFilters");

const editingId = $("editingId");
const material = $("material");
const variant = $("variant");
const color = $("color");
const colorGroup = $("colorGroup");
const brand = $("brand");
const state = $("state");
const weight = $("weight");
const profile = $("profile");
const notes = $("notes");

const photoInput = $("photoInput");
const photoPreview = $("photoPreview");
const btnRemovePhoto = $("btnRemovePhoto");

const labelInput = $("labelInput");
const ocrProg = $("ocrProg");
const ocrStatus = $("ocrStatus");
const ocrText = $("ocrText");

const dlgBackup = $("dlgBackup");
const btnExport = $("btnExport");
const importInput = $("importInput");

// --- Load / Render ---
async function load() {
  all = await dbGetAllSpools();
  render();
}

function cleanupThumbURLs() {
  for (const url of photoObjectURLs.values()) URL.revokeObjectURL(url);
  photoObjectURLs.clear();
}

function applyFilters(items) {
  const query = normalize(q.value).toLowerCase();
  const mat = normalize(fMaterial.value);
  const varQ = normalize(fVariant.value).toLowerCase();
  const cg = normalize(fColorGroup.value);
  const br = normalize(fBrand.value).toLowerCase();
  const st = normalize(fState.value);
  const withPhoto = !!onlyWithPhoto.checked;

  return items.filter((it) => {
    if (mat && it.material !== mat) return false;
    if (varQ && !((it.variant || "").toLowerCase().includes(varQ))) return false;
    if (cg && (it.colorGroup || "") !== cg) return false;
    if (st && it.state !== st) return false;
    if (br && !(it.brand || "").toLowerCase().includes(br)) return false;
    if (withPhoto && !it.photoBlob) return false;

    if (query) {
      const hay = [
        it.material, it.variant, it.color, it.colorGroup,
        it.brand, it.profile, it.notes,
        stateLabel(it.state || "new"),
        String(it.weight || "")
      ].join(" ").toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });
}

function applySort(items) {
  const v = sortBy.value;
  const [key, dir] = v.split("_");
  const sign = dir === "desc" ? -1 : 1;

  return [...items].sort((a, b) => {
    if (key === "createdAt") return (a.createdAt - b.createdAt) * sign;
    if (key === "weight") return ((a.weight || 0) - (b.weight || 0)) * sign;

    const av = (a[key] || "").toString().toLowerCase();
    const bv = (b[key] || "").toString().toLowerCase();
    return av.localeCompare(bv) * sign;
  });
}

function render() {
  cleanupThumbURLs();

  const filtered = applySort(applyFilters(all));
  listEl.innerHTML = "";

  emptyEl.style.display = filtered.length ? "none" : "block";
  statsEl.textContent = `${filtered.length} / ${all.length} Spulen`;

  for (const it of filtered) {
    const row = document.createElement("div");
    row.className = "item";

    const thumb = document.createElement("div");
    thumb.className = "thumb";
    if (it.photoBlob) {
      const url = blobToObjectURL(it.photoBlob);
      photoObjectURLs.set(it.id, url);
      const img = document.createElement("img");
      img.src = url;
      img.alt = "Spulenfoto";
      thumb.appendChild(img);
    } else {
      thumb.innerHTML = `<span class="muted">kein Foto</span>`;
    }

    const main = document.createElement("div");

    const title = document.createElement("div");
    title.className = "title";
    const varTxt = it.variant ? ` ${it.variant}` : "";
    title.textContent = `${it.material}${varTxt} • ${it.color}`;

    const meta = document.createElement("div");
    meta.className = "meta";

    const badges = [
      it.brand ? `<span class="badge">Hersteller: ${escapeHtml(it.brand)}</span>` : "",
      it.colorGroup ? `<span class="badge">Farbgruppe: ${escapeHtml(it.colorGroup)}</span>` : "",
      it.profile ? `<span class="badge">Profil: ${escapeHtml(it.profile)}</span>` : "",
      stateBadgeHTML(it.state || "new"),
      it.weight ? `<span class="badge">${it.weight} g</span>` : ""
    ].filter(Boolean);

    meta.innerHTML = badges.join("");

    const note = document.createElement("div");
    note.className = "muted";
    note.style.marginTop = "6px";
    note.textContent = it.notes || "";

    main.appendChild(title);
    main.appendChild(meta);
    if (it.notes) main.appendChild(note);

    const actions = document.createElement("div");
    actions.className = "actions";

    const edit = document.createElement("button");
    edit.className = "btn";
    edit.textContent = "Bearbeiten";
    edit.onclick = () => openEditor(it);

    const del = document.createElement("button");
    del.className = "btn";
    del.textContent = "Löschen";
    del.onclick = async () => {
      if (!confirm("Spule wirklich löschen?")) return;
      await dbDeleteSpool(it.id);
      await load();
    };

    actions.appendChild(edit);
    actions.appendChild(del);

    row.appendChild(thumb);
    row.appendChild(main);
    row.appendChild(actions);

    listEl.appendChild(row);
  }
}

// --- Editor ---
function resetEditor() {
  editingId.value = "";
  material.value = "";
  variant.value = "";
  color.value = "";
  colorGroup.value = "";
  brand.value = "";
  state.value = "new";
  weight.value = "1000";
  profile.value = "";
  notes.value = "";

  photoInput.value = "";
  labelInput.value = "";
  photoPreview.src = "";
  photoPreview.style.display = "none";

  dlg._pendingPhotoBlob = null;
  dlg._removePhoto = false;

  ocrProg.style.display = "none";
  ocrProg.value = 0;
  ocrStatus.textContent = "";
  ocrText.textContent = "";
}

function openEditor(it = null) {
  resetEditor();

  if (it) {
    dlgTitle.textContent = "Spule bearbeiten";
    editingId.value = it.id;
    material.value = it.material || "";
    variant.value = it.variant || "";
    color.value = it.color || "";
    colorGroup.value = it.colorGroup || "";
    brand.value = it.brand || "";
    state.value = it.state || "new";
    weight.value = String(it.weight || 1000);
    profile.value = it.profile || "";
    notes.value = it.notes || "";

    if (it.photoBlob) {
      const url = blobToObjectURL(it.photoBlob);
      photoPreview.src = url;
      photoPreview.style.display = "block";
    }
  } else {
    dlgTitle.textContent = "Neue Spule";
  }

  dlg.showModal();
}

// Foto aufnehmen (Farbfoto)
photoInput.addEventListener("change", async () => {
  const file = photoInput.files?.[0];
  if (!file) return;
  const blob = file.slice(0, file.size, file.type);
  dlg._pendingPhotoBlob = blob;

  const url = blobToObjectURL(blob);
  photoPreview.src = url;
  photoPreview.style.display = "block";
});

btnRemovePhoto.addEventListener("click", () => {
  dlg._pendingPhotoBlob = null;
  dlg._removePhoto = true;
  photoPreview.src = "";
  photoPreview.style.display = "none";
});

// Dialog schließen -> wenn "save", speichern
dlg.addEventListener("close", async () => {
  if (dlg.returnValue !== "save") return;

  const id = editingId.value || uid();
  const existing = all.find(x => x.id === id);

  const spool = {
    id,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),

    material: normalize(material.value),
    variant: normalize(variant.value),
    color: normalize(color.value),
    colorGroup: normalize(colorGroup.value),

    brand: normalize(brand.value),
    state: state.value,

    weight: Number(weight.value || 0),
    profile: normalize(profile.value),
    notes: normalize(notes.value),

    photoBlob: existing?.photoBlob || null
  };

  if (!spool.material || !spool.color) {
    alert("Bitte mindestens Material und Farbe ausfüllen.");
    return;
  }

  // Foto
  if (dlg._pendingPhotoBlob) {
    spool.photoBlob = dlg._pendingPhotoBlob;
  } else if (dlg._removePhoto) {
    spool.photoBlob = null;
  }

  dlg._pendingPhotoBlob = null;
  dlg._removePhoto = false;

  await dbUpsertSpool(spool);
  await load();
});

// --- Filters ---
for (const el of [q, fMaterial, fVariant, fColorGroup, fBrand, fState, sortBy, onlyWithPhoto]) {
  el.addEventListener("input", render);
  el.addEventListener("change", render);
}
btnClearFilters.addEventListener("click", () => {
  q.value = "";
  fMaterial.value = "";
  fVariant.value = "";
  fColorGroup.value = "";
  fBrand.value = "";
  fState.value = "";
  sortBy.value = "createdAt_desc";
  onlyWithPhoto.checked = false;
  render();
});

// --- Buttons ---
btnAdd.addEventListener("click", () => openEditor(null));
btnBackup.addEventListener("click", () => dlgBackup.showModal());

// --- Backup ---
btnExport.addEventListener("click", async () => {
  const data = await dbGetAllSpools();

  // Foto-Blob kann nicht direkt als JSON -> Base64
  const withImages = [];
  for (const it of data) {
    const copy = { ...it };
    if (it.photoBlob) {
      copy.photoBase64 = await blobToBase64(it.photoBlob);
    }
    delete copy.photoBlob;
    withImages.push(copy);
  }

  const payload = JSON.stringify(
    { version: 1, exportedAt: new Date().toISOString(), spools: withImages },
    null,
    2
  );
  downloadFile(`spools-backup-${new Date().toISOString().slice(0,10)}.json`, payload);
});

importInput.addEventListener("change", async () => {
  const file = importInput.files?.[0];
  if (!file) return;

  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    alert("Import fehlgeschlagen: keine gültige JSON-Datei.");
    return;
  }

  const spools = parsed?.spools;
  if (!Array.isArray(spools)) {
    alert("Import fehlgeschlagen: Format nicht erkannt.");
    return;
  }

  for (const it of spools) {
    const spool = { ...it };

    if (spool.photoBase64) {
      spool.photoBlob = base64ToBlob(spool.photoBase64);
      delete spool.photoBase64;
    } else {
      spool.photoBlob = null;
    }

    if (!spool.id) spool.id = uid();
    if (!spool.createdAt) spool.createdAt = Date.now();

    spool.updatedAt = Date.now();

    // state normalisieren
    if (spool.state !== "new" && spool.state !== "open") spool.state = "new";

    await dbUpsertSpool(spool);
  }

  await load();
  alert("Import abgeschlossen.");
});

// --- Base64 helpers ---
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
function base64ToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(meta)?.[1] || "application/octet-stream";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// --- OCR optional (Label Scan) ---
labelInput.addEventListener("change", async () => {
  const file = labelInput.files?.[0];
  if (!file) return;

  ocrProg.style.display = "block";
  ocrProg.value = 0;
  ocrStatus.textContent = "OCR wird geladen…";
  ocrText.textContent = "";

  // Lazy-load Tesseract.js only when needed
  if (!window.Tesseract) {
    await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js");
  }

  ocrStatus.textContent = "Text wird erkannt…";

  const img = await fileToImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);

  const result = await window.Tesseract.recognize(dataUrl, "eng", {
    logger: (m) => {
      if (m.status === "recognizing text") {
        ocrProg.value = m.progress || 0;
        ocrStatus.textContent = `Erkenne Text… ${(m.progress * 100).toFixed(0)}%`;
      } else {
        ocrStatus.textContent = m.status || "…";
      }
    }
  });

  const text = result?.data?.text || "";
  ocrText.textContent = text;
  ocrStatus.textContent = "Fertig. Vorschläge wurden übernommen (du kannst sie ändern).";

  const guess = parseLabelText(text);

  if (guess.material && !material.value) material.value = guess.material;
  if (guess.variant && !variant.value) variant.value = guess.variant;
  if (guess.brand && !brand.value) brand.value = guess.brand;
  if (guess.color && !color.value) color.value = guess.color;
  if (guess.colorGroup && !colorGroup.value) colorGroup.value = guess.colorGroup;
  if (guess.weight && (!weight.value || Number(weight.value) === 0 || Number(weight.value) === 1000)) {
    weight.value = String(guess.weight);
  }

  ocrProg.style.display = "none";
});

function parseLabelText(text) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  const upper = t.toUpperCase();

  // material
  const mats = ["PLA", "PETG", "ABS", "ASA", "TPU", "NYLON", "PA", "PC"];
  let material = "";
  for (const m of mats) {
    const re = new RegExp(`\\b${m}\\b`, "i");
    if (re.test(upper)) { material = (m === "NYLON" ? "PA / Nylon" : m); break; }
  }

  // variant
  let variant = "";
  const variants = ["SILK","MATTE","GLOSS","GLOSSY","METALLIC","GLITTER","WOOD","CARBON","CF","GF","TRANSPARENT","CLEAR"];
  for (const v of variants) {
    if (upper.includes(v)) {
      if (v === "GLOSS" || v === "GLOSSY") variant = "Glossy";
      else if (v === "CARBON") variant = "CF";
      else if (v === "CLEAR") variant = "Transparent";
      else variant = v[0] + v.slice(1).toLowerCase();
      break;
    }
  }

  // weight
  let weight = null;
  const wMatch = upper.match(/(\d+(?:\.\d+)?)\s*(KG|G)\b/);
  if (wMatch) {
    const val = Number(wMatch[1]);
    const unit = wMatch[2];
    if (unit === "KG") weight = Math.round(val * 1000);
    if (unit === "G") weight = Math.round(val);
  }

  // brand guess
  const brands = ["BAMBU", "PRUSAMENT", "ESUN", "SUNLU", "POLYMAKER", "FIBERLOG", "FILLAMENTUM", "OVERTURE", "DURAMIC"];
  let brand = "";
  for (const b of brands) {
    if (upper.includes(b)) { brand = b[0] + b.slice(1).toLowerCase(); break; }
  }

  // color
  let color = "";
  const cMatch = t.match(/colou?r[:\s-]*([A-Za-z][A-Za-z0-9\s-]{2,})/i);
  if (cMatch) color = cMatch[1].trim().slice(0, 40);

  // colorGroup
  const map = [
    ["BLACK","Schwarz"], ["WHITE","Weiß"], ["GREY","Grau"], ["GRAY","Grau"],
    ["RED","Rot"], ["BLUE","Blau"], ["GREEN","Grün"], ["YELLOW","Gelb"],
    ["ORANGE","Orange"], ["PURPLE","Lila"], ["PINK","Pink"], ["BROWN","Braun"],
    ["BEIGE","Beige"], ["TRANSPARENT","Transparent"], ["CLEAR","Transparent"]
  ];
  let colorGroup = "";
  for (const [k, v] of map) {
    if (upper.includes(k)) { colorGroup = v; break; }
  }

  return { material, variant, brand, color, colorGroup, weight };
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function fileToImageBitmap(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      try {
        const bitmap = await createImageBitmap(img);
        URL.revokeObjectURL(url);
        resolve(bitmap);
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

// --- start ---
load();
