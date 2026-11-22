(function () {
  "use strict";

  var menuEl = document.getElementById("brm-menu");
  var workEl = document.getElementById("brm-work");
  var frameEl = document.getElementById("brm-pdf");
  var hintEl = document.getElementById("brm-hint");

  function clearActiveItems() {
    if (!menuEl) {
      return;
    }
    menuEl.querySelectorAll(".brm-item.is-active").forEach(function (a) {
      a.classList.remove("is-active");
    });
  }

  function setOpenGroup(id) {
    if (!menuEl) {
      return;
    }
    menuEl.querySelectorAll(".brm-group").forEach(function (g) {
      g.classList.toggle("is-open", g.getAttribute("data-id") === String(id));
    });
  }

  function openPdf(pdf, itemEl) {
    if (!pdf || !frameEl || !workEl) {
      return;
    }
    clearActiveItems();
    if (itemEl) {
      itemEl.classList.add("is-active");
    }
    frameEl.src = new URL("pdf/" + pdf, window.location.href).href;
    workEl.classList.add("has-pdf");
    if (hintEl) {
      hintEl.hidden = true;
    }
  }

  if (!menuEl) {
    return;
  }

  menuEl.addEventListener("click", function (evt) {
    var btn = evt.target.closest(".brm-group-btn");
    if (btn) {
      evt.preventDefault();
      setOpenGroup(btn.getAttribute("data-id"));
      return;
    }
    var item = evt.target.closest(".brm-item");
    if (item) {
      evt.preventDefault();
      var group = item.closest(".brm-group");
      if (group) {
        setOpenGroup(group.getAttribute("data-id"));
      }
      openPdf(item.getAttribute("data-pdf"), item);
    }
  });
})();
