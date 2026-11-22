/* Sticky bar on standalone article/TOC pages. */
(function () {
  if (window.__techdocFileNav) return;
  window.__techdocFileNav = true;

  function ready(fn) {
    if (document.body) fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    // Script lives at rm14k1e/repair2/js/file-nav.js → manual root is ../..
    var script = document.currentScript;
    var root;
    try {
      root = new URL("../..", script && script.src ? script.src : location.href);
    } catch (e) {
      root = new URL("../../", location.href);
    }
    var homeFrames = new URL("index2_frames.html", root).href;
    var homeViewer = new URL("viewer.html", root).href;
    var isFile = location.protocol === "file:";
    var home = isFile ? homeViewer : homeViewer;
    var homeLabel = "← Back to Repair Manual";

    var bar = document.createElement("div");
    bar.id = "techdoc-file-nav";
    bar.setAttribute("lang", "en");
    bar.style.cssText = [
      "position:fixed",
      "top:0",
      "left:0",
      "right:0",
      "z-index:99999",
      "background:#333",
      "color:#fff",
      "font:12px/1.4 Verdana,sans-serif",
      "padding:8px 12px",
      "box-shadow:0 1px 4px rgba(0,0,0,.35)"
    ].join(";");

    bar.innerHTML =
      '<a href="' + home + '" style="color:#fff;font-weight:bold;text-decoration:none;">' +
      homeLabel +
      "</a>" +
      '<span style="opacity:.7;margin:0 10px;">|</span>' +
      '<span style="opacity:.85;">Tip: right-click → Translate page</span>';

    document.body.style.paddingTop = "40px";
    document.body.insertBefore(bar, document.body.firstChild);
  });
})();
