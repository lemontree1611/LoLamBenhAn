(function () {
  var modal = null;
  var previousFocus = null;

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

  function createModal() {
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "exportFormatModal";
    modal.className = "export-format-backdrop";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = [
      '<div class="export-format-sheet" role="dialog" aria-modal="true" aria-labelledby="exportFormatTitle">',
      '<button class="export-format-close" type="button" aria-label="Đóng">×</button>',
      '<p class="export-format-kicker">Xuất bệnh án</p>',
      '<h2 id="exportFormatTitle">Chọn định dạng xuất</h2>',
      '<div class="export-format-actions">',
      '<button class="export-format-choice" type="button" data-export-format="pdf">',
      iconPdf(),
      '<span>PDF</span>',
      '</button>',
      '<button class="export-format-choice" type="button" data-export-format="docx">',
      iconDocx(),
      '<span>DOCX</span>',
      '</button>',
      '</div>',
      '</div>',
    ].join("");

    document.body.appendChild(modal);
    modal.addEventListener("click", onModalClick);
    return modal;
  }

  function openModal() {
    previousFocus = document.activeElement;
    createModal();
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("export-format-open");

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        modal.classList.add("show");
        setTimeout(function () {
          modal.querySelector(".export-format-choice")?.focus();
        }, 80);
      });
    });
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("export-format-open");
    if (previousFocus && typeof previousFocus.focus === "function") {
      previousFocus.focus();
    }
  }

  function onModalClick(event) {
    if (event.target === modal || event.target.closest(".export-format-close")) {
      closeModal();
      return;
    }

    var choice = event.target.closest("[data-export-format]");
    if (!choice) return;

    var format = choice.getAttribute("data-export-format");
    closeModal();

    if (format === "docx") {
      window.generateDocx?.();
      return;
    }

    if (format === "pdf") {
      window.exportPdfFromPreview?.();
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

  function getConvertApiUrl() {
    if (window.DOCX_TO_PDF_API_URL) return window.DOCX_TO_PDF_API_URL;
    var host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:10000/convert/docx-to-pdf";
    }
    return "https://lolambenhan-0be9.onrender.com/convert/docx-to-pdf";
  }

  function downloadBlob(blob, fileName) {
    if (typeof window.saveAs === "function") {
      window.saveAs(blob, fileName);
      return;
    }

    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  async function createDocxBlobForPdf() {
    if (typeof window.generateDocx !== "function") {
      throw new Error("Chưa có hàm tạo DOCX.");
    }

    var originalSaveAs = window.saveAs;
    var captured = null;

    window.saveAs = function (blob, fileName) {
      captured = { blob: blob, fileName: fileName };
    };

    try {
      await window.generateDocx();
    } finally {
      window.saveAs = originalSaveAs;
    }

    if (!captured?.blob) {
      throw new Error("Không tạo được file DOCX để chuyển PDF.");
    }

    return captured;
  }

  function toPt(value) {
    var text = String(value || "").trim();
    var number = parseFloat(text);
    if (!number) return 0;
    if (text.endsWith("cm")) return number * 28.34646;
    if (text.endsWith("px")) return number * 0.75;
    return number;
  }

  function compactText(text) {
    return String(text || "").replace(/\s+/g, " ");
  }

  function isSmartBulletSpan(node) {
    if (!node || node.nodeType !== 1 || node.tagName !== "SPAN") return false;
    var first = node.children?.[0];
    var marker = compactText(first?.textContent || "");
    return (marker === "-" || marker === "+") && node.children.length >= 2;
  }

  function smartBulletFromSpan(node) {
    var marker = compactText(node.children[0]?.textContent || "-");
    var value = compactText(node.children[1]?.textContent || "");
    var level = marker === "+" ? 1 : 0;
    return {
      text: marker + " " + value,
      margin: [level === 0 ? 14 : 28, 0, 0, 0],
      lineHeight: 1.5,
    };
  }

  function hasOnlyWhitespaceAfter(items, index) {
    for (var i = index + 1; i < items.length; i += 1) {
      var item = items[i];
      if (item.nodeType === 3 && !String(item.textContent || "").trim()) continue;
      return false;
    }
    return true;
  }

  function appendInline(node, target, marks) {
    if (!node) return;

    if (node.nodeType === 3) {
      var text = compactText(node.textContent);
      if (text) target.push({ text: text, ...marks });
      return;
    }

    if (node.nodeType !== 1) return;

    var tag = node.tagName;
    if (tag === "BR") {
      target.push({ text: "\n" });
      return;
    }

    if (isSmartBulletSpan(node)) {
      var bullet = smartBulletFromSpan(node);
      target.push({ text: bullet.text, ...marks });
      return;
    }

    var nextMarks = { ...marks };
    if (tag === "B" || tag === "STRONG") nextMarks.bold = true;
    if (tag === "I" || tag === "EM") nextMarks.italics = true;

    Array.from(node.childNodes).forEach(function (child) {
      appendInline(child, target, nextMarks);
    });
  }

  function paragraphTextFromNode(node) {
    var runs = [];
    Array.from(node.childNodes).forEach(function (child) {
      appendInline(child, runs, {});
    });

    var cleaned = [];
    runs.forEach(function (run) {
      if (run.text === "\n") {
        if (cleaned.length && cleaned[cleaned.length - 1].text !== "\n") cleaned.push(run);
        return;
      }

      var text = String(run.text || "").trim();
      if (!text) return;

      if (cleaned.length && cleaned[cleaned.length - 1].text !== "\n") {
        text = " " + text;
      }
      cleaned.push({ ...run, text: text });
    });

    while (cleaned.length && cleaned[0].text === "\n") cleaned.shift();
    while (cleaned.length && cleaned[cleaned.length - 1].text === "\n") cleaned.pop();

    return cleaned.length ? cleaned : [{ text: "" }];
  }

  function splitParagraphOnLineBreaks(runs, base) {
    var out = [];
    var current = [];

    function textOf(runs) {
      return runs.map(function (run) {
        return run.text || "";
      }).join("").trim();
    }

    function flush() {
      var plain = textOf(current);
      if (plain) {
        var parsed = plain.match(/^([+-])\s+(.*)$/);
        if (parsed) {
          out.push({
            ...base,
            text: parsed[1] + " " + parsed[2],
            margin: [parsed[1] === "+" ? 28 : 14, base.margin?.[1] || 0, 0, 0],
          });
        } else {
          out.push({ ...base, text: current });
        }
      }
      current = [];
    }

    runs.forEach(function (run) {
      String(run.text || "").split("\n").forEach(function (part, index, parts) {
        if (index > 0) flush();
        if (part) current.push({ ...run, text: part });
        if (index === parts.length - 1 && !part && parts.length > 1) flush();
      });
    });
    flush();

    return out;
  }

  function paragraphFromElement(node) {
    var tag = node.tagName;
    var marginTop = toPt(node.style?.marginTop);
    var base = {
      margin: [0, marginTop, 0, 0],
      lineHeight: 1.5,
    };

    if (tag === "H1") {
      return [{
        ...base,
        text: compactText(node.textContent),
        alignment: "center",
        bold: true,
        fontSize: 20,
        margin: [0, 0, 0, 8],
      }];
    }

    var childNodes = Array.from(node.childNodes);
    var firstRealNode = childNodes.find(function (child) {
      return !(child.nodeType === 3 && !String(child.textContent || "").trim());
    });
    if (isSmartBulletSpan(firstRealNode) && childNodes.every(function (child, index) {
      return child === firstRealNode || child.tagName === "BR" || (child.nodeType === 3 && !String(child.textContent || "").trim()) || hasOnlyWhitespaceAfter(childNodes, index);
    })) {
      return [{ ...smartBulletFromSpan(firstRealNode), margin: [smartBulletFromSpan(firstRealNode).margin[0], marginTop, 0, 0] }];
    }

    return splitParagraphOnLineBreaks(paragraphTextFromNode(node), base);
  }

  function tableFromElement(table) {
    var rows = Array.from(table.querySelectorAll("tr")).map(function (tr) {
      return Array.from(tr.children).map(function (cell) {
        return {
          text: paragraphTextFromNode(cell),
          bold: cell.tagName === "TH",
          lineHeight: 1.3,
          margin: [2, 2, 2, 2],
        };
      });
    }).filter(function (row) {
      return row.length;
    });

    if (!rows.length) return null;
    return {
      table: {
        widths: rows[0].map(function () { return "*"; }),
        body: rows,
      },
      layout: {
        hLineWidth: function () { return 0.5; },
        vLineWidth: function () { return 0.5; },
      },
      margin: [0, 4, 0, 4],
    };
  }

  function pdfContentFromBody(body) {
    var content = [];
    Array.from(body.children).forEach(function (node) {
      if (node.tagName === "TABLE") {
        var table = tableFromElement(node);
        if (table) content.push(table);
        return;
      }

      if (node.tagName === "P" || node.tagName === "H1" || node.tagName === "H2" || node.tagName === "H3") {
        content.push(...paragraphFromElement(node));
      }
    });
    return content;
  }

  function exportPdfFromPreview() {
    if (exportPdfFromPreview.busy) {
      return;
    }

    exportPdfFromPreview.busy = true;
    createDocxBlobForPdf()
      .then(function (docx) {
        return fetch(getConvertApiUrl(), {
          method: "POST",
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          },
          body: docx.blob
        });
      })
      .then(async function (response) {
        if (!response.ok) {
          var detail = "";
          try {
            var payload = await response.json();
            detail = payload?.detail || payload?.error || "";
          } catch (_) {
            detail = await response.text().catch(function () { return ""; });
          }
          throw new Error(detail || "Server không chuyển được DOCX sang PDF.");
        }
        return response.blob();
      })
      .then(function (pdfBlob) {
        downloadBlob(pdfBlob, getExportBaseName() + ".pdf");
      })
      .catch(function (err) {
        alert("Không thể xuất PDF: " + (err?.message || err));
      })
      .finally(function () {
        exportPdfFromPreview.busy = false;
      });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && modal?.classList.contains("show")) {
      closeModal();
    }
  });

  window.openExportFormatPopup = openModal;
  window.closeExportFormatPopup = closeModal;
  window.exportPdfFromPreview = exportPdfFromPreview;
})();
