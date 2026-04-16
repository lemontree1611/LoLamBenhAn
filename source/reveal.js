(function () {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const selectors = [
    "[data-reveal]",
    ".topbar",
    "body > h1",
    "body > .small",
    "#share-notice",
    "#benhanForm",
    ".loginScreen .homeBtnLogin",
    ".loginCard",
    ".loginHighlight",
    ".chatShell > .messages",
    ".chatShell > .composer"
  ];

  let observer = null;

  function cleanup(el) {
    el.classList.add("reveal-done");
    el.classList.remove("reveal-item");
    el.classList.remove("reveal-fade-item");
    el.classList.remove("reveal-visible");
    el.style.removeProperty("--reveal-delay");
    el.style.willChange = "auto";
    if (observer) observer.unobserve(el);
  }

  function reveal(el) {
    if (el.classList.contains("reveal-visible")) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.classList.add("reveal-visible");
        el.addEventListener("transitionend", () => cleanup(el), { once: true });
      });
    });
  }

  function collectRevealItems(scope = document) {
    const items = [];
    const seen = new Set();

    selectors.forEach((selector) => {
      scope.querySelectorAll(selector).forEach((el) => {
        if (seen.has(el) || el.classList.contains("reveal-done")) return;
        seen.add(el);
        items.push(el);
      });
    });

    items.forEach((el, index) => {
      const isTopbar = el.matches(".topbar");
      el.classList.add(isTopbar ? "reveal-fade-item" : "reveal-item");
      el.style.setProperty("--reveal-delay", el.id === "benhanForm" || isTopbar ? "0ms" : `${Math.min(index, 5) * 38}ms`);
    });

    return items;
  }

  function isInViewport(el) {
    const rect = el.getBoundingClientRect();
    return rect.top < window.innerHeight && rect.bottom > 0;
  }

  function initReveal() {
    root.classList.add("reveal-enabled");

    const items = collectRevealItems();
    if (!items.length) return;

    if (reduceMotion.matches || !("IntersectionObserver" in window)) {
      items.forEach(cleanup);
      return;
    }

    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) reveal(entry.target);
      });
    }, {
      root: null,
      rootMargin: "0px 0px -8% 0px",
      threshold: 0.08
    });

    items.forEach((el) => {
      if (el.id === "benhanForm" && isInViewport(el)) {
        reveal(el);
      } else {
        observer.observe(el);
      }
    });
  }

  window.LoLamReveal = {
    refresh(scope) {
      if (!observer || reduceMotion.matches) return;
      collectRevealItems(scope).forEach((el) => observer.observe(el));
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initReveal, { once: true });
  } else {
    initReveal();
  }
})();
