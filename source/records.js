(function initRecordHelpers() {
  function getApiBase() {
    try {
      if (typeof window.API_BASE === "string" && window.API_BASE.trim()) {
        return window.API_BASE.trim();
      }
      if (typeof window.CHAT_API_URL === "string" && window.CHAT_API_URL.trim()) {
        return new URL(window.CHAT_API_URL, window.location.href).origin;
      }
    } catch (_) {}
    return window.location.origin || "";
  }

  function getFormType() {
    return (window.location.pathname || "")
      .replace(/\/index\.html?$/i, "")
      .replace(/^\/+|\/+$/g, "") || "root";
  }

  function getFormPath() {
    const pathname = window.location.pathname || "/";
    return pathname.endsWith("/") ? pathname : pathname.replace(/\/index\.html?$/i, "/");
  }

  function normalizeSearchText(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function getExportBaseName(data, fallbackName) {
    return String(data?.chandoanxacdinh || data?.hoten || fallbackName || "benhan")
      .split(/\s*\/\s*|\s+-\s+/)[0]
      .replace(/[\\:*?"<>|]+/g, " - ")
      .replace(/\s+/g, " ")
      .trim() || fallbackName || "benhan";
  }

  async function saveRecord(options) {
    const data = options?.data && typeof options.data === "object" ? options.data : {};
    const fallbackName = options?.fallbackName || "benhan";
    const apiBase = getApiBase();
    if (!apiBase) return null;

    const payload = {
      formType: getFormType(),
      formPath: getFormPath(),
      title: getExportBaseName(data, fallbackName),
      patientName: String(data.hoten || "").trim(),
      diagnosis: String(data.chandoanxacdinh || "").trim(),
      data
    };

    const response = await fetch(`${apiBase}/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(json.error || "Cannot save record");
    }
    return json.item || null;
  }

  function hydrateFormData(dataObj) {
    if (!dataObj || typeof dataObj !== "object") return false;
    const formEl = document.getElementById("benhanForm");
    if (!formEl) return false;

    const fields = Array.from(formEl.querySelectorAll("input[id], textarea[id], select[id]"));
    for (const el of fields) {
      if (!(el.id in dataObj)) continue;
      const value = dataObj[el.id];

      if (el.type === "checkbox") {
        el.checked = !!value;
      } else if (el.type === "radio") {
        el.checked = String(value) === String(el.value);
      } else {
        el.value = value ?? "";
      }

      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    try { window.tinhBMI?.(); } catch (_) {}
    try { window.loadDienTienFromHidden?.(); } catch (_) {}
    try { window.loadHemFromHidden?.(); } catch (_) {}
    try { window.loadBioFromHidden?.(); } catch (_) {}
    try { window.closePreview?.(); } catch (_) {}
    return true;
  }

  async function loadRecordFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const recordId = params.get("record");
    if (!recordId) return null;

    const apiBase = getApiBase();
    if (!apiBase) return null;

    const response = await fetch(`${apiBase}/records/${encodeURIComponent(recordId)}`, {
      cache: "no-store"
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.item) {
      throw new Error(json.error || "Khong tai duoc benh an da luu");
    }

    hydrateFormData(json.item.data || {});
    return json.item;
  }

  window.__LO_RECORDS__ = {
    getApiBase,
    getFormType,
    getFormPath,
    normalizeSearchText,
    getExportBaseName,
    saveRecord,
    hydrateFormData,
    loadRecordFromQuery
  };
})();
