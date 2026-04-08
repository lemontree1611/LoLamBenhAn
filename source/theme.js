(function () {
  const STORAGE_KEY = "lolambenhan-theme";
  const root = document.documentElement;

  function normalizeTheme(value) {
    return value === "dark" ? "dark" : "light";
  }

  function readStoredTheme() {
    try {
      return normalizeTheme(localStorage.getItem(STORAGE_KEY) || "light");
    } catch (_) {
      return "light";
    }
  }

  function updateToggleButtons(theme) {
    const isDark = theme === "dark";
    const nextLabel = isDark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối";
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.setAttribute("aria-pressed", String(isDark));
      button.setAttribute("aria-label", nextLabel);
      button.setAttribute("title", nextLabel);
    });
  }

  function applyTheme(theme, persist) {
    const nextTheme = normalizeTheme(theme);
    root.setAttribute("data-theme", nextTheme);
    root.style.colorScheme = nextTheme;
    updateToggleButtons(nextTheme);
    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, nextTheme);
      } catch (_) {}
    }
    return nextTheme;
  }

  function toggleTheme() {
    const current = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
    return applyTheme(current === "dark" ? "light" : "dark", true);
  }

  applyTheme(readStoredTheme(), false);

  document.addEventListener("DOMContentLoaded", () => {
    updateToggleButtons(root.getAttribute("data-theme") || "light");
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.addEventListener("click", toggleTheme);
    });
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    applyTheme(normalizeTheme(event.newValue || "light"), false);
  });

  window.LoLamTheme = {
    applyTheme,
    toggleTheme,
    getTheme: () => normalizeTheme(root.getAttribute("data-theme") || "light"),
  };
})();
