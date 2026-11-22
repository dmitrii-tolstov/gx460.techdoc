(function () {
  "use strict";

  var CFG = window.TECHDOC_VIEWER || {};
  var MANUAL_TITLE = CFG.title || "Repair Manual";
  var WELCOME_HTML =
    CFG.welcomeHtml ||
    ("<h1>Lexus TechDoc — " +
      MANUAL_TITLE +
      "</h1>" +
      "<p>Select a section on the left. Content is shown in this page so browser translation can work — including offline (file://).</p>");

  var BASE = new URL(".", window.location.href);
  var IS_FILE = location.protocol === "file:";
  var state = {
    tocId: null,
    pageId: null,
    hash: ""
  };

  var groupsPane = null;
  var localPane = null;
  var contentPane = null;
  var mainEl = null;
  var statusEl = null;
  var scriptCache = {};

  function abs(path) {
    return new URL(path, BASE).href;
  }

  function qs(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function parseHtml(text) {
    return new DOMParser().parseFromString(text, "text/html");
  }

  function rewriteUrls(root, pageUrl) {
    var base = new URL(".", pageUrl);
    var attrs = [
      ["img", "src"],
      ["script", "src"],
      ["source", "src"],
      ["a", "href"],
      ["link", "href"],
      ["area", "href"],
      ["iframe", "src"],
      ["embed", "src"],
      ["object", "data"]
    ];

    attrs.forEach(function (pair) {
      var tag = pair[0];
      var attr = pair[1];
      root.querySelectorAll(tag + "[" + attr + "]").forEach(function (el) {
        var val = el.getAttribute(attr);
        if (!val || val.charAt(0) === "#" || /^(javascript:|mailto:|tel:|data:)/i.test(val)) {
          return;
        }
        if (val.indexOf("://") !== -1 || val.indexOf("//") === 0) {
          return;
        }
        try {
          el.setAttribute(attr, new URL(val, base).href);
        } catch (e) {
          /* keep original */
        }
      });
    });
  }

  function extractBody(doc, pageUrl) {
    var wrap = document.createElement("div");
    if (doc.body) {
      if (doc.body.className) {
        wrap.className = doc.body.className;
      }
      var clone = doc.body.cloneNode(true);
      while (clone.firstChild) {
        wrap.appendChild(clone.firstChild);
      }
    }
    rewriteUrls(wrap, pageUrl);
    return wrap;
  }

  function decodeBody(entry) {
    if (entry.body) {
      return entry.body;
    }
    if (!entry.bodyB64) {
      return "";
    }
    var bin = atob(entry.bodyB64);
    if (typeof TextDecoder !== "undefined") {
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
      }
      return new TextDecoder("utf-8").decode(bytes);
    }
    // Fallback for very old engines
    try {
      return decodeURIComponent(escape(bin));
    } catch (e) {
      return bin;
    }
  }

  function extractFromData(entry, fallbackUrl) {
    var wrap = document.createElement("div");
    if (entry.bodyClass) {
      wrap.className = entry.bodyClass;
    }
    wrap.innerHTML = decodeBody(entry);
    var pageUrl = abs(entry.base || fallbackUrl);
    rewriteUrls(wrap, pageUrl);
    return { wrap: wrap, url: pageUrl };
  }

  function loadScriptData(src, key) {
    window.__TD_DATA__ = window.__TD_DATA__ || {};
    if (window.__TD_DATA__[key]) {
      return Promise.resolve(window.__TD_DATA__[key]);
    }
    if (scriptCache[src]) {
      return scriptCache[src].then(function () {
        if (!window.__TD_DATA__[key]) {
          throw new Error("Offline data missing key " + key + " in " + src);
        }
        return window.__TD_DATA__[key];
      });
    }
    scriptCache[src] = new Promise(function (resolve, reject) {
      var done = false;
      var s = document.createElement("script");
      // Absolute URL is more reliable on file:// than a relative src
      s.src = abs(src);
      s.async = true;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error("Timeout loading offline data: " + s.src));
      }, 8000);
      s.onload = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve();
      };
      s.onerror = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(new Error("Failed to load offline data: " + s.src));
      };
      document.head.appendChild(s);
    });
    return scriptCache[src].then(function () {
      if (!window.__TD_DATA__[key]) {
        throw new Error("Offline data missing key " + key);
      }
      return window.__TD_DATA__[key];
    });
  }

  function fetchDoc(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (res) {
      if (!res.ok) {
        throw new Error("HTTP " + res.status + " for " + url);
      }
      return res.text().then(function (text) {
        return { url: url, doc: parseHtml(text), wrap: null };
      });
    });
  }

  function loadDoc(kind, id) {
    id = String(id).toLowerCase();
    if (kind === "toc") {
      var tocRel = "repair2/html/toc/" + id + ".html";
      var tocUrl = abs(tocRel);
      if (IS_FILE) {
        return loadScriptData("repair2/html/toc/" + id + ".data.js", "toc:" + id).then(function (entry) {
          var parsed = extractFromData(entry, tocRel);
          return { url: parsed.url, wrap: parsed.wrap, doc: null };
        }).catch(function (err) {
          // Last resort on file:// — open the real HTML page (still translatable)
          setStatus("Opening TOC page…");
          location.assign(tocUrl);
          return new Promise(function () { /* navigating */ });
        });
      }
      return fetchDoc(tocUrl).then(function (r) {
        return { url: r.url, wrap: extractBody(r.doc, r.url), doc: r.doc };
      });
    }
    if (kind === "page") {
      var pageRel = "repair2/html/contents/" + id + ".html";
      var pageUrl = abs(pageRel);
      if (IS_FILE) {
        return loadScriptData("repair2/html/contents/" + id + ".data.js", "page:" + id).then(function (entry) {
          var parsed = extractFromData(entry, pageRel);
          return { url: parsed.url, wrap: parsed.wrap, doc: null };
        }).catch(function () {
          setStatus("Opening article page…");
          location.assign(pageUrl);
          return new Promise(function () { /* navigating */ });
        });
      }
      return fetchDoc(pageUrl).then(function (r) {
        return { url: r.url, wrap: extractBody(r.doc, r.url), doc: r.doc };
      });
    }
    if (kind === "local") {
      var localId = id.indexOf("local_") === 0 ? id : "local_" + id;
      var localRel = "repair2/html/contents/" + localId + ".html";
      var localUrl = abs(localRel);
      if (IS_FILE) {
        return loadScriptData("repair2/html/contents/" + localId + ".data.js", "local:" + localId).then(function (entry) {
          var parsed = extractFromData(entry, localRel);
          return { url: parsed.url, wrap: parsed.wrap, doc: null };
        });
      }
      return fetchDoc(localUrl).then(function (r) {
        return { url: r.url, wrap: extractBody(r.doc, r.url), doc: r.doc };
      });
    }
    return Promise.reject(new Error("Unknown doc kind"));
  }

  function setStatus(msg) {
    if (statusEl) {
      statusEl.textContent = msg || "";
      statusEl.hidden = !msg;
    }
  }

  function showLocal(show) {
    if (!mainEl) return;
    mainEl.classList.toggle("has-local", !!show);
    if (!show && localPane) {
      localPane.innerHTML = "";
    }
  }

  function scrollToHash(hash) {
    if (!hash) return;
    var id = hash.replace(/^#/, "");
    if (!id || !contentPane) return;
    var target =
      contentPane.querySelector('[id="' + id + '"]') ||
      contentPane.querySelector('[name="' + id + '"]') ||
      contentPane.querySelector('a[name="' + id + '"]');
    if (target && target.scrollIntoView) {
      target.scrollIntoView({ block: "start" });
    }
  }

  function updateHistory(replace) {
    var params = new URLSearchParams();
    if (state.pageId) {
      params.set("page", state.pageId);
    } else if (state.tocId) {
      params.set("toc", state.tocId);
    }
    var url = "viewer.html";
    var q = params.toString();
    if (q) url += "?" + q;
    if (state.hash) url += state.hash;
    try {
      if (replace) {
        history.replaceState({ tocId: state.tocId, pageId: state.pageId, hash: state.hash }, "", url);
      } else {
        history.pushState({ tocId: state.tocId, pageId: state.pageId, hash: state.hash }, "", url);
      }
    } catch (e) {
      /* file:// may restrict history API in some browsers */
    }
  }

  function renderInto(pane, bodyNode) {
    pane.innerHTML = "";
    while (bodyNode.firstChild) {
      pane.appendChild(bodyNode.firstChild);
    }
  }

  function loadGroups() {
    // Groups are inlined in viewer.html for file:// compatibility.
    return Promise.resolve();
  }

  function loadWelcome() {
    state.pageId = null;
    state.tocId = null;
    state.hash = "";
    showLocal(false);
    contentPane.innerHTML = '<div class="viewer-welcome">' + WELCOME_HTML + "</div>";
    setStatus("");
  }

  function loadToc(serId, opts) {
    opts = opts || {};
    var id = String(serId).toLowerCase();
    setStatus("Loading…");
    return loadDoc("toc", id).then(function (result) {
      state.tocId = id;
      state.pageId = null;
      state.hash = "";
      showLocal(false);
      renderInto(contentPane, result.wrap);
      setStatus("");
      if (!opts.silentHistory) {
        updateHistory(!!opts.replace);
      }
      contentPane.scrollTop = 0;
    }).catch(function (err) {
      contentPane.innerHTML = '<div class="viewer-error">' + err.message + "</div>";
      setStatus("");
    });
  }

  function loadLocalNav(pageId) {
    return loadDoc("local", pageId).then(function (result) {
      renderInto(localPane, result.wrap);
      showLocal(true);
    }).catch(function () {
      showLocal(false);
    });
  }

  function loadPage(pageId, hash, opts) {
    opts = opts || {};
    var id = String(pageId).toLowerCase().replace(/\.html$/i, "");
    id = id.replace(/^frame_/, "");
    if (id.indexOf("local_") === 0) {
      id = id.slice(6);
    }
    setStatus("Loading…");
    return loadDoc("page", id).then(function (result) {
      state.pageId = id;
      state.hash = hash || "";
      renderInto(contentPane, result.wrap);
      setStatus("");
      contentPane.scrollTop = 0;
      return loadLocalNav(id).then(function () {
        if (!opts.silentHistory) {
          updateHistory(!!opts.replace);
        }
        scrollToHash(state.hash);
      });
    }).catch(function (err) {
      contentPane.innerHTML = '<div class="viewer-error">' + err.message + "</div>";
      showLocal(false);
      setStatus("");
    });
  }

  function pageIdFromFrameHref(href) {
    try {
      var u = new URL(href, window.location.href);
      var path = u.pathname || "";
      // file:// paths use backslashes in some browsers — normalize
      path = path.replace(/\\/g, "/");
      var m = path.match(/frame_([^/]+?)\.html$/i);
      if (m) return m[1].toLowerCase();
      m = path.match(/\/contents\/(local_)?([^/]+?)\.html$/i);
      if (m) return m[2].toLowerCase();
      // also match relative hrefs that weren't absolutized yet
      m = String(href).replace(/\\/g, "/").match(/frame_([^/?#]+?)\.html/i);
      if (m) return m[1].toLowerCase();
    } catch (e) {
      var m2 = String(href).match(/frame_([^/?#]+?)\.html/i);
      if (m2) return m2[1].toLowerCase();
    }
    return null;
  }

  function isExternalManual(href) {
    try {
      var u = new URL(href, window.location.href);
      var p = (u.pathname || "").toLowerCase().replace(/\\/g, "/");
      return /\/(ncf|ewd|brm|sds)\//.test(p) || /sds\.html$/.test(p);
    } catch (e) {
      return false;
    }
  }

  function handleAnchorClick(ev) {
    var a = ev.target.closest ? ev.target.closest("a") : null;
    if (!a) return;

    var href = a.getAttribute("href");
    if (!href || href === "#") {
      return;
    }

    if (/^(javascript:|mailto:|tel:)/i.test(href)) {
      return;
    }

    if (isExternalManual(href) || a.target === "_blank" || a.target === "_new") {
      return;
    }

    var pageId = pageIdFromFrameHref(href);
    if (pageId) {
      ev.preventDefault();
      var hash = "";
      try {
        hash = new URL(href, window.location.href).hash || "";
      } catch (e) {
        hash = "";
      }
      loadPage(pageId, hash);
      return;
    }

    if (href.charAt(0) === "#") {
      ev.preventDefault();
      state.hash = href;
      updateHistory(true);
      scrollToHash(href);
    }
  }

  window.clickMenu = function (serId) {
    loadToc(serId);
  };

  window.clickPubMenu = function () {};

  window.openSeePage = function (type, id) {
    var xlinks = String(id).toLowerCase().split("_");
    var html;
    if (type === "ppr") {
      html = abs("repair2/html/preparation/ppr_" + xlinks[0] + ".html");
    } else {
      html = abs("repair2/html/contents/" + xlinks[0] + ".html");
    }
    var hash = xlinks.length > 1 ? "#" + id : "";
    if (type === "ppr") {
      window.open(html + hash, "_blank");
      return;
    }
    loadPage(xlinks[0], hash ? "#" + id : "");
  };

  window.seePageAnchor = function () {};

  document.addEventListener(
    "click",
    function (ev) {
      var t = ev.target;
      if (!t) return;
      var node = t;
      while (node && node !== document) {
        if (node.getAttribute && node.getAttribute("onclick")) {
          var oc = node.getAttribute("onclick") || "";
          var menu = oc.match(/clickMenu\s*\(\s*['\"]([^'\"]+)['\"]\s*\)/i);
          if (menu) {
            ev.preventDefault();
            ev.stopPropagation();
            loadToc(menu[1]);
            return;
          }
          var m = oc.match(/parent\.contents\.location\.href\s*=\s*['\"]([^'\"]+)['\"]/i);
          if (m) {
            ev.preventDefault();
            ev.stopPropagation();
            var target = m[1];
            var hashIdx = target.indexOf("#");
            var hash = hashIdx >= 0 ? target.slice(hashIdx) : "";
            var file = hashIdx >= 0 ? target.slice(0, hashIdx) : target;
            var pid = file.replace(/\.html$/i, "").toLowerCase();
            if (state.pageId && (pid === state.pageId || !file)) {
              state.hash = hash;
              updateHistory(true);
              scrollToHash(hash);
            } else if (pid) {
              loadPage(pid, hash);
            }
            return;
          }
        }
        node = node.parentNode;
      }
      handleAnchorClick(ev);
    },
    true
  );

  window.addEventListener("popstate", function (ev) {
    var s = ev.state || {};
    if (s.pageId) {
      loadPage(s.pageId, s.hash || "", { silentHistory: true, replace: true });
    } else if (s.tocId) {
      loadToc(s.tocId, { silentHistory: true, replace: true });
    } else {
      var page = qs("page");
      var toc = qs("toc");
      if (page) loadPage(page, window.location.hash, { silentHistory: true, replace: true });
      else if (toc) loadToc(toc, { silentHistory: true, replace: true });
      else loadWelcome();
    }
  });

  function init() {
    groupsPane = document.getElementById("groups-pane");
    localPane = document.getElementById("local-pane");
    contentPane = document.getElementById("content-pane");
    mainEl = document.getElementById("viewer-main");
    statusEl = document.getElementById("viewer-status");

    loadGroups().then(function () {
      var page = qs("page");
      var toc = qs("toc");
      var hash = window.location.hash || "";
      if (page) {
        loadPage(page, hash, { replace: true });
      } else if (toc) {
        loadToc(toc, { replace: true });
      } else {
        loadWelcome();
        updateHistory(true);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
