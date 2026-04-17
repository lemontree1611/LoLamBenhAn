(function () {
  var menu = null;
  var activeButton = null;

  function iconPdf() {
    return [
      '<svg viewBox="0 0 48 48" aria-hidden="true">',
      '<path d="M13 4.5h14.5L38 15v28.5H13z" fill="#fff" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
      '<path d="M27.5 4.5V15H38" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
      '<path d="M10 25h28v13H10z" fill="#ff3b30" rx="3"/>',
      '<path d="M15.5 34v-6h2.4c1.4 0 2.2.7 2.2 1.9s-.9 2-2.3 2h-.9V34zm1.4-3.2h.9c.6 0 .9-.3.9-.8s-.3-.8-.9-.8h-.9zm5 3.2v-6h2.1c1.9 0 3.1 1.1 3.1 3s-1.2 3-3.1 3zm1.4-1.2h.6c1.1 0 1.8-.6 1.8-1.8s-.7-1.8-1.8-1.8h-.6zm5.2 1.2v-6h4.1v1.2h-2.7v1.4h2.4v1.2h-2.4V34z" fill="#fff"/>',
      '</svg>',
    ].join("");
  }

  function iconDocx() {
    return [
      '<svg viewBox="0 0 48 48" aria-hidden="true">',
      '<path d="M13 4.5h14.5L38 15v28.5H13z" fill="#fff" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
      '<path d="M27.5 4.5V15H38" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
      '<path d="M10 25h28v13H10z" fill="#007aff" rx="3"/>',
      '<path d="M14.6 34v-6h2.1c1.9 0 3.1 1.1 3.1 3s-1.2 3-3.1 3zm1.4-1.2h.6c1.1 0 1.8-.6 1.8-1.8s-.7-1.8-1.8-1.8H16zm5.1-1.8c0-1.8 1.2-3.1 3-3.1 1.8 0 3 1.3 3 3.1s-1.2 3.1-3 3.1c-1.8 0-3-1.3-3-3.1zm1.4 0c0 1.1.6 1.9 1.6 1.9s1.6-.8 1.6-1.9-.6-1.9-1.6-1.9-1.6.8-1.6 1.9zm8.8 3.1c-1.8 0-3-1.2-3-3.1 0-1.8 1.2-3.1 3-3.1 1.3 0 2.3.7 2.7 1.8l-1.3.4c-.2-.6-.7-1-1.4-1-1 0-1.6.8-1.6 1.9s.6 1.9 1.6 1.9c.7 0 1.2-.4 1.5-1l1.2.5c-.4 1.1-1.4 1.7-2.7 1.7z" fill="#fff"/>',
      '</svg>',
    ].join("");
  }

  function createMenu() {
    if (menu) return menu;

    menu = document.createElement("div");
    menu.id = "exportFormatMenu";
    menu.className = "export-format-menu";
    menu.setAttribute("aria-hidden", "true");
    menu.setAttribute("role", "menu");
    menu.innerHTML = [
      '<p class="export-format-kicker">Chọn định dạng xuất</p>',
      '<button class="export-format-choice" type="button" role="menuitem" data-export-format="pdf">',
      iconPdf(),
      '<span>PDF</span>',
      '</button>',
      '<button class="export-format-choice" type="button" role="menuitem" data-export-format="docx">',
      iconDocx(),
      '<span>DOCX</span>',
      '</button>',
    ].join("");

    document.body.appendChild(menu);
    menu.addEventListener("click", onMenuClick);
    return menu;
  }

  function findAnchor(event) {
    return event?.currentTarget ||
      event?.target?.closest?.("button") ||
      document.activeElement?.closest?.("button") ||
      document.getElementById("btn-export") ||
      document.getElementById("btnExport");
  }

  function positionMenu(anchor) {
    if (!menu || !anchor?.getBoundingClientRect) return;

    var rect = anchor.getBoundingClientRect();
    var topbarRect = document.getElementById("topbar")?.getBoundingClientRect?.();
    var gap = 10;
    var width = Math.min(208, window.innerWidth - 24);
    var left = rect.left + (rect.width / 2) - (width / 2);
    left = Math.max(12, Math.min(left, window.innerWidth - width - 12));

    menu.style.width = width + "px";
    menu.style.left = left + "px";
    menu.style.top = Math.round((topbarRect?.bottom || rect.bottom) + gap) + "px";
    menu.style.setProperty("--export-menu-arrow-left", Math.round(rect.left + (rect.width / 2) - left) + "px");
  }

  function openMenu(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    var anchor = findAnchor(event);
    createMenu();

    if (menu.classList.contains("show") && activeButton === anchor) {
      closeMenu();
      return;
    }

    if (activeButton && activeButton !== anchor) {
      activeButton.setAttribute?.("aria-expanded", "false");
    }
    activeButton = anchor;
    activeButton?.setAttribute?.("aria-expanded", "true");
    activeButton?.setAttribute?.("aria-controls", "exportFormatMenu");
    positionMenu(activeButton);
    menu.setAttribute("aria-hidden", "false");

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        menu.classList.add("show");
      });
    });
  }

  function closeMenu() {
    if (!menu) return;
    menu.classList.remove("show");
    menu.setAttribute("aria-hidden", "true");
    activeButton?.setAttribute?.("aria-expanded", "false");
  }

  function onMenuClick(event) {
    var choice = event.target.closest("[data-export-format]");
    if (!choice) return;

    var format = choice.getAttribute("data-export-format");
    closeMenu();

    if (format === "docx") {
      window.generateDocx?.();
      return;
    }

    if (format === "pdf") {
      window.exportPdfFromPreview?.();
    }
  }

  function onDocumentClick(event) {
    if (!menu?.classList.contains("show")) return;
    if (menu.contains(event.target) || activeButton?.contains?.(event.target)) return;
    closeMenu();
  }

  function onViewportChange() {
    if (menu?.classList.contains("show")) {
      positionMenu(activeButton);
    }
  }

  function sanitizeFileName(value) {
    return String(value || "benhan")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .slice(0, 120) || "benhan";
  }

  function getExportBaseName() {
    try {
      if (typeof window.getFormData === "function") {
        var data = window.getFormData();
        if (data?.hoten) return sanitizeFileName(data.hoten);
      }
    } catch (_) {}

    return sanitizeFileName(document.getElementById("hoten")?.value || "benhan");
  }

  function preparePrintHtml(html, title) {
    var safeTitle = String(title || "benhan")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    var printCss = [
      "<style>",
      "@media print {",
      "  html, body { width: auto !important; min-height: 0 !important; }",
      "  body { padding: 0 !important; margin: 0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }",
      "}",
      "</style>",
    ].join("");

    var printScript = [
      "<script>",
      "window.addEventListener('load', function () {",
      "  setTimeout(function () { window.focus(); window.print(); }, 150);",
      "});",
      "window.addEventListener('afterprint', function () {",
      "  setTimeout(function () { window.close(); }, 150);",
      "});",
      "<\/script>",
    ].join("");

    var withTitle = /<title>[\s\S]*?<\/title>/i.test(html)
      ? html.replace(/<title>[\s\S]*?<\/title>/i, "<title>" + safeTitle + "</title>")
      : html.replace(/<head[^>]*>/i, function (match) {
          return match + "<title>" + safeTitle + "</title>";
        });

    return withTitle.replace(/<\/head>/i, printCss + printScript + "</head>");
  }

  function exportPdfFromPreview() {
    if (typeof window.buildHTMLDoc !== "function") {
      alert("Không thể xuất PDF: Chưa có nội dung bệnh án để in.");
      return;
    }

    var baseName = getExportBaseName();
    var printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Không thể mở cửa sổ in. Vui lòng cho phép popup trên trình duyệt.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(preparePrintHtml(window.buildHTMLDoc(), baseName));
    printWindow.document.close();
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && menu?.classList.contains("show")) {
      closeMenu();
    }
  });

  document.addEventListener("click", onDocumentClick);
  window.addEventListener("resize", onViewportChange, { passive: true });
  window.addEventListener("scroll", onViewportChange, { passive: true });

  window.openExportFormatPopup = openMenu;
  window.closeExportFormatPopup = closeMenu;
  window.exportPdfFromPreview = exportPdfFromPreview;
})();
