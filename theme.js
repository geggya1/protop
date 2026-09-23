(function () {
  var root = document.documentElement;
  var toggle = document.querySelector("[data-theme-toggle]");
  var media = window.matchMedia("(prefers-color-scheme: dark)");

  function storedTheme() {
    try {
      return localStorage.getItem("protop-theme");
    } catch (e) {
      return null;
    }
  }

  function currentTheme() {
    var set = root.getAttribute("data-theme");
    if (set === "light" || set === "dark") return set;
    return media.matches ? "dark" : "light";
  }

  function syncLogoA11y(theme) {
    var dark = theme === "dark";
    document.querySelectorAll(".logo--on-light").forEach(function (img) {
      img.setAttribute("aria-hidden", dark ? "true" : "false");
    });
    document.querySelectorAll(".logo--on-dark").forEach(function (img) {
      img.setAttribute("aria-hidden", dark ? "false" : "true");
      if (!dark) img.setAttribute("alt", "");
      else img.setAttribute("alt", "ProTop. Digitale løsninger for bygg og anlegg.");
    });
  }

  function paintToggle(theme) {
    if (!toggle) return;
    var label = theme === "dark" ? "Lys visning" : "Mørk visning";
    toggle.textContent = label;
    toggle.setAttribute("aria-label", label);
    toggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    syncLogoA11y(theme);
  }

  function applyTheme(theme, persist) {
    root.setAttribute("data-theme", theme);
    if (persist) {
      try {
        localStorage.setItem("protop-theme", theme);
      } catch (e) {}
    }
    paintToggle(theme);
  }

  var stored = storedTheme();
  if (stored === "light" || stored === "dark") {
    applyTheme(stored, false);
  } else {
    paintToggle(currentTheme());
  }

  if (toggle) {
    toggle.addEventListener("click", function () {
      applyTheme(currentTheme() === "dark" ? "light" : "dark", true);
    });
  }

  media.addEventListener("change", function () {
    var saved = storedTheme();
    if (saved === "light" || saved === "dark") return;
    root.removeAttribute("data-theme");
    paintToggle(currentTheme());
  });

  fetch("brand/manifest.json")
    .then(function (response) {
      if (!response.ok) throw new Error("manifest");
      return response.json();
    })
    .then(function (manifest) {
      var colors = manifest.colors || {};
      if (colors.navy) root.style.setProperty("--navy", colors.navy);
      if (colors.digitalBlue) root.style.setProperty("--blue", colors.digitalBlue);
      if (colors.white) root.style.setProperty("--white", colors.white);

      var usage = manifest.usage || {};
      document.querySelectorAll("[data-brand]").forEach(function (img) {
        var path = usage[img.getAttribute("data-brand")];
        if (path && img.getAttribute("src") !== path) img.setAttribute("src", path);
      });

      if (usage.favicon) {
        var icon = document.querySelector("link[data-brand-icon]");
        if (icon && icon.getAttribute("href") !== usage.favicon) {
          icon.setAttribute("href", usage.favicon);
        }
      }
    })
    .catch(function () {});
})();
