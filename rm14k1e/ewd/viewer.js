(function () {
  "use strict";

  var CONTENT_BASE = new URL("ewd/contents/", window.location.href);
  var EWD_BASE = new URL("ewd/", window.location.href);
  var REPAIR_TOP = new URL("../viewer.html", window.location.href).href;
  var g_flgPopup = false;
  var activeMenu = "system";
  var titlesMounted = false;
  var pagesMounted = false;
  var diagramsMounted = false;
  var lastPageKey = null;
  var lastDiagramKey = null;
  var connSort = "name";

  var PAGE_BASE = {
    location: "ewd/contents/menu/location/title/title.html",
    gp: "ewd/contents/menu/gp/title/title.html",
    "intro-top": "ewd/intro/top.html",
    "intro-intro": "ewd/intro/contents/intro.html",
    "intro-trouble": "ewd/intro/contents/trouble.html",
    "intro-abbre": "ewd/intro/contents/abbre.html",
    "intro-glossary": "ewd/intro/contents/glossary.html",
    "ps-capacity": "ewd/contents/loads/ps_capacity.html",
    "ps-name": "ewd/contents/loads/ps_name.html",
    "conn-search": "ewd/contents/connector/search.html",
    "conn-list-name": "ewd/contents/connector/list/list_name.html",
    "conn-list-code": "ewd/contents/connector/list/list_code.html"
  };

  function contentUrl(rel) {
    return new URL(rel, CONTENT_BASE).href;
  }

  function absFromViewer(rel) {
    return new URL(rel, window.location.href).href;
  }

  function mainFrameEl() {
    return document.getElementById("winMain");
  }

  function setMode(mode) {
    document.body.classList.remove(
      "mode-menu",
      "mode-page",
      "mode-conn",
      "mode-frame",
      "mode-diagram"
    );
    document.body.classList.add("mode-" + mode);
  }

  function decodeB64(b64) {
    var bin = atob(b64);
    if (typeof TextDecoder !== "undefined") {
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
      }
      return new TextDecoder("utf-8").decode(bytes);
    }
    try {
      return decodeURIComponent(escape(bin));
    } catch (e) {
      return bin;
    }
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
      ["object", "data"],
      ["input", "src"]
    ];
    attrs.forEach(function (pair) {
      root.querySelectorAll(pair[0] + "[" + pair[1] + "]").forEach(function (el) {
        var val = el.getAttribute(pair[1]);
        if (!val || val.charAt(0) === "#" || /^(javascript:|mailto:|tel:|data:)/i.test(val)) {
          return;
        }
        if (val.indexOf("://") !== -1 || val.indexOf("//") === 0) {
          return;
        }
        try {
          el.setAttribute(pair[1], new URL(val, base).href);
        } catch (e) {
          /* keep */
        }
      });
    });
  }

  function openMain(relOrAbs) {
    var raw = String(relOrAbs || "");
    // Prefer native diagram chrome over legacy framesets inside an iframe.
    var m = raw.match(/(?:^|\/)(system|routing|relay)\/main\/([^\/\?#]+)\.html/i);
    if (m) {
      openDiagram(m[1].toLowerCase(), m[2]);
      return;
    }
    var url = /^(https?:|file:|blob:|about:)/i.test(raw)
      ? raw
      : contentUrl(raw);
    var el = mainFrameEl();
    if (el) {
      el.src = url;
    } else {
      window.open(url, "winMain");
    }
    setMode("frame");
  }

  function hidePopup() {
    document.querySelectorAll(".ewd-popup.is-open").forEach(function (p) {
      p.classList.remove("is-open");
    });
    g_flgPopup = false;
  }

  function showPopup(id) {
    hidePopup();
    var el = document.getElementById(id);
    if (el) {
      el.classList.add("is-open");
    }
    g_flgPopup = true;
  }

  function clearCategoryActive() {
    document.querySelectorAll(".ewd-cat-item.is-active").forEach(function (btn) {
      btn.classList.remove("is-active");
    });
  }

  function setCategoryActive(btn) {
    clearCategoryActive();
    if (btn) {
      btn.classList.add("is-active");
    }
  }

  function hideAllTitlePanels() {
    document.querySelectorAll(".ewd-title-panel.is-visible").forEach(function (p) {
      p.classList.remove("is-visible");
    });
  }

  function hideAllPagePanels() {
    document.querySelectorAll(".ewd-page-panel.is-visible").forEach(function (p) {
      p.classList.remove("is-visible");
    });
  }

  function showHint(on) {
    var hint = document.getElementById("ewd-list-hint");
    if (hint) {
      hint.hidden = !on;
    }
  }

  function stampTitleTargets(panel, htmlSource) {
    var tmp = document.createElement("div");
    tmp.innerHTML = htmlSource;
    var srcItems = tmp.querySelectorAll("td.titlelist-item, a.titlelist-item");
    var dstItems = panel.querySelectorAll("td.titlelist-item, a.titlelist-item");
    for (var i = 0; i < dstItems.length && i < srcItems.length; i++) {
      var onclick = srcItems[i].getAttribute("onclick") || "";
      var m3 = onclick.match(
        /call_onClickItemProc\s*\(\s*event\s*,\s*['\"]([^'\"]+)['\"]\s*,\s*['\"]([^'\"]+)['\"]/
      );
      var m2 = onclick.match(
        /call_onClickItemProc\s*\(\s*event\s*,\s*['\"]([^'\"]+)['\"]/
      );
      if (m3) {
        dstItems[i].setAttribute("data-ewd-code", m3[1]);
        dstItems[i].setAttribute("data-ewd-map", m3[2]);
      } else if (m2) {
        dstItems[i].setAttribute("data-ewd-code", m2[1]);
        dstItems[i].setAttribute("data-ewd-map", "intro");
      }
    }
    panel.querySelectorAll("[onclick],[onmouseover],[onmouseout]").forEach(function (el) {
      el.removeAttribute("onclick");
      el.removeAttribute("onmouseover");
      el.removeAttribute("onmouseout");
    });
  }

  function openTitleTarget(code, map) {
    if (map === "overall") {
      openMain("overall/pdf/" + code + ".pdf");
      return;
    }
    if (map === "intro") {
      openIntroSection(code);
      return;
    }
    if (map === "system" || map === "routing" || map === "relay") {
      openDiagram(map, code);
      return;
    }
    openMain(map + "/main/" + code + ".html");
  }

  function mountDiagramAssets() {
    if (diagramsMounted) {
      return;
    }
    var listsRoot = document.getElementById("ewd-diag-lists");
    var titlesRoot = document.getElementById("ewd-diag-titles");
    var infoRoot = document.getElementById("ewd-diag-info");
    var lists = window.__EWD_DIAG_LISTS__ || {};
    var titles = window.__EWD_DIAG_TITLES__ || {};
    var infos = window.__EWD_CONN_INFO__ || {};

    Object.keys(lists).forEach(function (key) {
      // key: list_system/SYS001
      var kind = key.indexOf("list_relay/") === 0 ? "relay" : "info";
      var html = decodeB64(lists[key]);
      var panel = document.createElement("div");
      panel.className = "ewd-diag-list";
      panel.setAttribute("data-key", key);
      panel.setAttribute("data-kind", kind);
      panel.innerHTML = html;
      rewriteUrls(panel, absFromViewer("ewd/contents/connector/" + key + ".html"));
      stampDiagList(panel, html, kind);
      panel.addEventListener("click", onDiagListClick);
      if (listsRoot) {
        listsRoot.appendChild(panel);
      }
    });

    Object.keys(titles).forEach(function (key) {
      var html = decodeB64(titles[key]);
      var panel = document.createElement("div");
      panel.className = "ewd-diag-title";
      panel.setAttribute("data-key", key);
      panel.innerHTML = html;
      var map = key.split("/")[0];
      rewriteUrls(panel, absFromViewer("ewd/contents/" + map + "/title/" + key.split("/")[1] + ".html"));
      panel.querySelectorAll("[onclick],[onmouseup]").forEach(function (el) {
        el.removeAttribute("onclick");
        el.removeAttribute("onmouseup");
      });
      if (titlesRoot) {
        titlesRoot.appendChild(panel);
      }
    });

    Object.keys(infos).forEach(function (code) {
      var html = decodeB64(infos[code]);
      var panel = document.createElement("div");
      panel.className = "ewd-diag-infopanel";
      panel.setAttribute("data-key", code);
      panel.innerHTML = html;
      rewriteUrls(panel, absFromViewer("ewd/contents/connector/info/all/" + code + ".html"));
      panel.querySelectorAll("[onclick]").forEach(function (el) {
        el.removeAttribute("onclick");
      });
      // Location links inside connector info should open diagrams in this shell.
      panel.querySelectorAll("a[href]").forEach(function (a) {
        var href = a.getAttribute("href") || "";
        if (/(system|routing|relay)\/main\//i.test(href)) {
          a.addEventListener("click", function (evt) {
            evt.preventDefault();
            openMain(href);
          });
        }
      });
      if (infoRoot) {
        infoRoot.appendChild(panel);
      }
    });

    diagramsMounted = true;
  }

  function stampDiagList(panel, htmlSource, kind) {
    var tmp = document.createElement("div");
    tmp.innerHTML = htmlSource;
    var srcItems = tmp.querySelectorAll("td.list-item, a.list-item");
    var dstItems = panel.querySelectorAll("td.list-item, a.list-item");
    for (var i = 0; i < dstItems.length && i < srcItems.length; i++) {
      var onclick = srcItems[i].getAttribute("onclick") || "";
      var m = onclick.match(
        /call_onClickItemProc\s*\(\s*event\s*,\s*['\"]([^'\"]+)['\"]/
      );
      if (m) {
        dstItems[i].setAttribute("data-diag-code", m[1]);
        dstItems[i].setAttribute("data-diag-action", kind);
      }
    }
    panel.querySelectorAll("[onclick],[onmouseover],[onmouseout]").forEach(function (el) {
      el.removeAttribute("onclick");
      el.removeAttribute("onmouseover");
      el.removeAttribute("onmouseout");
    });
  }

  function onDiagListClick(evt) {
    var node = evt.target.closest("[data-diag-code]");
    if (!node) {
      return;
    }
    evt.preventDefault();
    var code = node.getAttribute("data-diag-code");
    var action = node.getAttribute("data-diag-action") || "info";
    var list = node.closest(".ewd-diag-list");
    if (list) {
      list.querySelectorAll(".list-item-active").forEach(function (el) {
        el.className = "list-item";
      });
      node.className = node.tagName === "A" ? "list-item-active" : "list-item-active";
      var td = node.closest("td");
      var a = node.tagName === "A" ? node : node.querySelector("a");
      if (td) {
        td.className = "list-item-active";
      }
      if (a) {
        a.className = "list-item-active";
      }
    }
    if (action === "relay") {
      openDiagram("relay", code);
      return;
    }
    showDiagInfo(code);
  }

  function hideDiagLists() {
    document.querySelectorAll(".ewd-diag-list.is-visible").forEach(function (p) {
      p.classList.remove("is-visible");
    });
  }

  function hideDiagTitles() {
    document.querySelectorAll(".ewd-diag-title.is-visible").forEach(function (p) {
      p.classList.remove("is-visible");
    });
  }

  function hideDiagInfos() {
    document.querySelectorAll(".ewd-diag-infopanel.is-visible").forEach(function (p) {
      p.classList.remove("is-visible");
    });
    var empty = document.getElementById("ewd-diag-info-empty");
    if (empty) {
      empty.hidden = false;
    }
  }

  function showDiagInfo(code) {
    mountDiagramAssets();
    hideDiagInfos();
    var empty = document.getElementById("ewd-diag-info-empty");
    var panel = document.querySelector('.ewd-diag-infopanel[data-key="' + code + '"]');
    if (panel) {
      panel.classList.add("is-visible");
      if (empty) {
        empty.hidden = true;
      }
    } else if (empty) {
      empty.hidden = false;
      empty.textContent = "No connector details for " + code;
    }
  }

  function openDiagram(map, code) {
    mountDiagramAssets();
    var key = map + "/" + code;
    var meta = (window.__EWD_DIAG_META__ || {})[key];
    if (!meta) {
      // Fallback to legacy frameset if meta is missing.
      var el = mainFrameEl();
      if (el) {
        el.src = contentUrl(map + "/main/" + code + ".html");
      }
      setMode("frame");
      return;
    }

    lastDiagramKey = key;
    setMode("diagram");
    hideDiagLists();
    hideDiagTitles();
    hideDiagInfos();

    // meta.list like connector/list_system/SYS001.html → list_system/SYS001
    var listKey = meta.list
      ? meta.list.replace(/^connector\//, "").replace(/\.html$/i, "")
      : null;

    var listPanel = listKey
      ? document.querySelector('.ewd-diag-list[data-key="' + listKey + '"]')
      : null;
    if (listPanel) {
      listPanel.classList.add("is-visible");
    }

    var titlePanel = document.querySelector('.ewd-diag-title[data-key="' + key + '"]');
    if (titlePanel) {
      titlePanel.classList.add("is-visible");
    }

    var fig = document.getElementById("winFig");
    if (fig && meta.fig) {
      fig.src = contentUrl(meta.fig);
    }

    // Relay diagrams have no connector-info pane content by default.
    var empty = document.getElementById("ewd-diag-info-empty");
    if (empty) {
      empty.hidden = false;
      empty.textContent = meta.hasInfo
        ? "Select a connector on the list."
        : "Select an item on the list.";
    }
  }

  function openIntroSection(code) {
    if (code === "help") {
      openMain(absFromViewer("ewd/howto/index.html"));
      return;
    }
    if (code === "wh-help") {
      openMain(absFromViewer("ewd/intro-wh/howto/index.html"));
      return;
    }
    var key = "intro-" + code;
    if (window.__EWD_PAGES__ && window.__EWD_PAGES__[key]) {
      showPagePanel(key);
      return;
    }
    openMain(absFromViewer("ewd/intro/" + code + ".html"));
  }

  function mountAllTitlePanels() {
    if (titlesMounted) {
      return;
    }
    var root = document.getElementById("ewd-list");
    var map = window.__EWD_TITLES__;
    if (!root || !map) {
      return;
    }
    Object.keys(map).forEach(function (key) {
      var html = decodeB64(map[key]);
      var panel = document.createElement("div");
      panel.className = "ewd-title-panel";
      panel.setAttribute("data-key", key);
      panel.innerHTML = html;
      stampTitleTargets(panel, html);
      panel.addEventListener("click", onTitlePanelClick);
      root.appendChild(panel);
    });
    titlesMounted = true;
  }

  function onTitlePanelClick(evt) {
    var node = evt.target.closest("[data-ewd-code]");
    if (!node) {
      return;
    }
    evt.preventDefault();
    openTitleTarget(
      node.getAttribute("data-ewd-code"),
      node.getAttribute("data-ewd-map") || activeMenu
    );
  }

  function mountAllPagePanels() {
    if (pagesMounted) {
      return;
    }
    var pages = window.__EWD_PAGES__;
    if (!pages) {
      return;
    }

    var listRoot = document.getElementById("ewd-list");
    var connSearch = document.getElementById("ewd-conn-search");
    var connLists = document.getElementById("ewd-conn-lists");

    Object.keys(PAGE_BASE).forEach(function (key) {
      if (!pages[key]) {
        return;
      }
      var html = decodeB64(pages[key]);
      var base = absFromViewer(PAGE_BASE[key]);

      if (key === "conn-search") {
        if (connSearch) {
          connSearch.innerHTML = html;
          rewriteUrls(connSearch, base);
          wireConnSearch(connSearch);
        }
        return;
      }

      if (key === "conn-list-name" || key === "conn-list-code") {
        if (!connLists) {
          return;
        }
        var clist = document.createElement("div");
        clist.className = "ewd-conn-list";
        clist.setAttribute("data-key", key);
        clist.innerHTML = html;
        rewriteUrls(clist, base);
        stampConnList(clist, html);
        clist.addEventListener("click", onConnListClick);
        connLists.appendChild(clist);
        return;
      }

      if (!listRoot) {
        return;
      }
      var panel = document.createElement("div");
      panel.className = "ewd-page-panel";
      panel.setAttribute("data-key", key);
      panel.innerHTML = html;
      rewriteUrls(panel, base);
      stampTitleTargets(panel, html);
      wirePagePanel(panel, key);
      listRoot.appendChild(panel);
    });

    pagesMounted = true;
  }

  function stampConnList(panel, htmlSource) {
    var tmp = document.createElement("div");
    tmp.innerHTML = htmlSource;
    var srcItems = tmp.querySelectorAll("td.list-item, a.list-item");
    var dstItems = panel.querySelectorAll("td.list-item, a.list-item");
    for (var i = 0; i < dstItems.length && i < srcItems.length; i++) {
      var onclick = srcItems[i].getAttribute("onclick") || "";
      var m = onclick.match(
        /call_onClickItemProc\s*\(\s*event\s*,\s*['\"]([^'\"]+)['\"]/
      );
      if (m) {
        dstItems[i].setAttribute("data-conn-code", m[1]);
      }
    }
    panel.querySelectorAll("[onclick],[onmouseover],[onmouseout]").forEach(function (el) {
      el.removeAttribute("onclick");
      el.removeAttribute("onmouseover");
      el.removeAttribute("onmouseout");
    });
  }

  function onConnListClick(evt) {
    var node = evt.target.closest("[data-conn-code]");
    if (!node) {
      return;
    }
    evt.preventDefault();
    var code = node.getAttribute("data-conn-code");
    // Keep connector chrome; only navigate the detail iframe.
    var el = mainFrameEl();
    if (el) {
      el.src = contentUrl("connector/info/all/" + code + ".html");
    }
    setMode("conn");
    showConnSort(connSort);
  }

  function wireConnSearch(root) {
    root.querySelectorAll("[onclick]").forEach(function (el) {
      el.removeAttribute("onclick");
    });
    var name = root.querySelector("#name_list");
    var code = root.querySelector("#code_list");
    if (name) {
      name.addEventListener("change", function () {
        if (name.checked) {
          showConnSort("name");
        }
      });
      name.addEventListener("click", function () {
        showConnSort("name");
      });
    }
    if (code) {
      code.addEventListener("change", function () {
        if (code.checked) {
          showConnSort("code");
        }
      });
      code.addEventListener("click", function () {
        showConnSort("code");
      });
    }
  }

  function showConnSort(sort) {
    connSort = sort;
    document.querySelectorAll(".ewd-conn-list").forEach(function (p) {
      p.classList.remove("is-visible");
    });
    var key = sort === "code" ? "conn-list-code" : "conn-list-name";
    var panel = document.querySelector('.ewd-conn-list[data-key="' + key + '"]');
    if (panel) {
      panel.classList.add("is-visible");
    }
    var name = document.querySelector("#ewd-conn-search #name_list");
    var code = document.querySelector("#ewd-conn-search #code_list");
    if (name) {
      name.checked = sort === "name";
    }
    if (code) {
      code.checked = sort === "code";
    }
  }

  function wirePagePanel(panel, key) {
    panel.addEventListener("click", function (evt) {
      // Title-list style links (Location, Intro top, GP)
      var title = evt.target.closest("[data-ewd-code]");
      if (title && panel.contains(title)) {
        evt.preventDefault();
        openTitleTarget(
          title.getAttribute("data-ewd-code"),
          title.getAttribute("data-ewd-map") || "system"
        );
        return;
      }

      // Power Source matrix refs / block buttons
      if (key === "ps-capacity" || key === "ps-name") {
        var ref = evt.target.closest("a.loads-ref");
        if (ref && panel.contains(ref)) {
          evt.preventDefault();
          openMain(ref.href);
          return;
        }
        var btn = evt.target.closest("input[type='button'][id]");
        if (btn && panel.contains(btn)) {
          evt.preventDefault();
          var code = btn.id;
          if (code.indexOf("C:") === 0) {
            var parts = code.split("+");
            openMain("routing/main/" + parts[1] + ".html");
          } else {
            openMain("relay/main/" + code + ".html");
          }
          return;
        }
        var cap = evt.target.closest("#optCapacity");
        var nam = evt.target.closest("#optName");
        if (cap) {
          evt.preventDefault();
          showPagePanel("ps-capacity");
          return;
        }
        if (nam) {
          evt.preventDefault();
          showPagePanel("ps-name");
        }
      }
    });
  }

  function showPagePanel(key) {
    mountAllPagePanels();
    mountAllTitlePanels();
    hideAllTitlePanels();
    hideAllPagePanels();
    showHint(false);
    lastPageKey = key;
    setMode("page");
    var panel = document.querySelector('.ewd-page-panel[data-key="' + key + '"]');
    if (panel) {
      panel.classList.add("is-visible");
    }
  }

  function showConnector() {
    mountAllPagePanels();
    setMode("conn");
    showConnSort(connSort);
    var el = mainFrameEl();
    if (el && (!el.src || el.src === "about:blank" || /connector\/info\//i.test(el.src) === false)) {
      el.src = contentUrl("connector/info_empty/empty.html");
    }
  }

  function showMenuShell(kind) {
    activeMenu = kind;
    setMode("menu");
    clearCategoryActive();
    hideAllTitlePanels();
    hideAllPagePanels();
    showHint(true);
    mountAllTitlePanels();
    mountAllPagePanels();
  }

  function showTitleList(code) {
    mountAllTitlePanels();
    setMode("menu");
    hideAllPagePanels();
    hideAllTitlePanels();
    showHint(false);
    var key = activeMenu + "/" + code;
    var panel = document.querySelector('.ewd-title-panel[data-key="' + key + '"]');
    if (panel) {
      panel.classList.add("is-visible");
    } else {
      showHint(true);
    }
  }

  function showMenu(strMenuID) {
    switch (strMenuID) {
      case "location":
        showPagePanel("location");
        break;
      case "system":
        showMenuShell("system");
        break;
      case "overall":
        showMenuShell("overall");
        break;
      case "gp":
        showMap("GP", "system");
        break;
      case "ps":
        showPagePanel("ps-capacity");
        break;
      case "intro":
        showPagePanel("intro-top");
        break;
    }
  }

  function showMap(code, map) {
    if (map === "system" || map === "routing" || map === "relay") {
      openDiagram(map, code);
      return;
    }
    openMain(map + "/main/" + code + ".html");
  }

  function showPS() {
    var objForm = document.forms.namedItem("ewd-codes") || document.forms[0];
    var code = objForm && objForm.elements["ps-code"]
      ? objForm.elements["ps-code"].value
      : "";
    if (code) {
      showMap(code, "system");
    } else {
      showPagePanel("ps-capacity");
    }
  }

  function showGP() {
    var objForm = document.forms.namedItem("ewd-codes") || document.forms[0];
    var code = objForm && objForm.elements["gp-code"]
      ? objForm.elements["gp-code"].value
      : "GP";
    showMap(code || "GP", "system");
  }

  function showListConn() {
    showConnector();
  }

  function showListPS() {
    showPagePanel("ps-capacity");
  }

  window.call_runOnClickTop = function () {
    window.open(REPAIR_TOP, "_top");
    hidePopup();
  };

  window.call_runOnClickBack = function () {
    if (document.body.classList.contains("mode-diagram") || document.body.classList.contains("mode-frame")) {
      if (lastPageKey === "location") {
        showPagePanel("location");
      } else if (lastPageKey && lastPageKey.indexOf("ps-") === 0) {
        showPagePanel(lastPageKey);
      } else if (lastPageKey && lastPageKey.indexOf("conn-") === 0) {
        showConnector();
      } else if (lastPageKey && lastPageKey.indexOf("intro-") === 0) {
        showPagePanel(lastPageKey === "intro-top" ? "intro-top" : lastPageKey);
      } else {
        showMenuShell(activeMenu || "system");
      }
      hidePopup();
      return;
    }
    if (document.body.classList.contains("mode-page") && lastPageKey && lastPageKey.indexOf("intro-") === 0 && lastPageKey !== "intro-top") {
      showPagePanel("intro-top");
      hidePopup();
      return;
    }
    showMenuShell(activeMenu || "system");
    hidePopup();
  };

  window.call_runOnClickNew = function () {
    window.open(window.location.href, "_blank");
    hidePopup();
  };

  window.call_runOnClickPrint = function () {
    hidePopup();
  };

  window.call_runOnClickLocation = function () {
    showMenu("location");
    hidePopup();
  };

  window.call_runOnClickDiagram = function () {
    if (g_flgPopup) {
      hidePopup();
    } else {
      showPopup("d_divPopupDiagram");
    }
  };

  window.call_runOnClickList = function () {
    if (g_flgPopup) {
      hidePopup();
    } else {
      showPopup("d_divPopupList");
    }
  };

  window.call_runOnClickIntro = function () {
    showMenu("intro");
    hidePopup();
  };

  window.call_runOnClickPopupItem = function (code) {
    switch (code) {
      case "diag_system":
        showMenu("system");
        break;
      case "diag_ps":
        showPS();
        break;
      case "diag_gp":
        showGP();
        break;
      case "diag_overall":
        showMenu("overall");
        break;
      case "list_conn":
        showListConn();
        break;
      case "list_ps":
        showListPS();
        break;
    }
    hidePopup();
  };

  window.call_onClickItemProc = function (evt, code, map) {
    openTitleTarget(code, map || activeMenu);
  };

  window.showMenu = showMenu;
  window.showPS = showPS;
  window.showGP = showGP;
  window.showMap = showMap;
  window.showListConn = showListConn;
  window.showListPS = showListPS;
  window.hidePopup = hidePopup;

  document.addEventListener("click", function (evt) {
    if (!g_flgPopup) {
      return;
    }
    var t = evt.target;
    if (
      t &&
      (t.closest("#d_divPopupDiagram") ||
        t.closest("#d_divPopupList") ||
        t.closest("[data-ewd-popup-toggle]"))
    ) {
      return;
    }
    hidePopup();
  });

  var cat = document.getElementById("ewd-category");
  if (cat) {
    cat.addEventListener("click", function (evt) {
      var btn = evt.target.closest(".ewd-cat-item");
      if (!btn) {
        return;
      }
      setCategoryActive(btn);
      showTitleList(btn.getAttribute("data-code"));
    });
  }

  mountAllTitlePanels();
  mountAllPagePanels();
  // Mount diagram lists/titles/info up front so Translate can see them.
  mountDiagramAssets();
  showMenuShell("system");
})();
