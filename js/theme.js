// VI: Lưu lựa chọn màu sắc riêng trên trình duyệt. EN: Store the user's theme choice locally.
(() => {
  const STORAGE_KEY = "onluyencpp_theme";
  const allowedThemes = new Set(["a", "b", "c", "d"]);
  const themeLabels = { a: "Kem ấm", b: "Sage", c: "Xanh xám", d: "Tối dịu" };
  let selectedTheme = "b";

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (allowedThemes.has(saved)) selectedTheme = saved;
  } catch (_) {
    // VI: Nếu bộ nhớ bị chặn, giao diện vẫn dùng màu mặc định B.
    // EN: If storage is unavailable, keep the default B palette.
  }
  document.documentElement.dataset.theme = selectedTheme;

  const syncButtons = () => {
    document.querySelectorAll("[data-theme-choice]").forEach((button) => {
      const active = button.dataset.themeChoice === selectedTheme;
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("selected", active);
    });
    const trigger = document.getElementById("themeTrigger");
    const label = trigger?.querySelector(".theme-trigger-label");
    if (label) label.textContent = themeLabels[selectedTheme];
    if (trigger) trigger.setAttribute("aria-label", `Giao diện hiện tại: ${themeLabels[selectedTheme]}`);
  };

  const closePicker = () => {
    const options = document.getElementById("themeOptions");
    const trigger = document.getElementById("themeTrigger");
    if (!options || !trigger) return;
    options.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  };

  const init = () => {
    const welcome = document.getElementById("welcomeScreen");
    const welcomeEnter = document.getElementById("welcomeEnter");
    welcomeEnter?.addEventListener("click", () => {
      if (!welcome || welcome.hidden) return;
      welcome.classList.add("is-leaving");
      window.setTimeout(() => {
        welcome.hidden = true;
        welcome.classList.remove("is-leaving");
      }, 240);
    });

    const picker = document.getElementById("themePicker");
    const trigger = document.getElementById("themeTrigger");
    const options = document.getElementById("themeOptions");
    if (!picker || !trigger || !options) return;

    syncButtons();
    trigger.addEventListener("click", () => {
      const open = options.hidden;
      options.hidden = !open;
      trigger.setAttribute("aria-expanded", String(open));
    });

    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-theme-choice]");
      const theme = button?.dataset.themeChoice;
      if (!allowedThemes.has(theme)) return;
      selectedTheme = theme;
      const root = document.documentElement;
      const bounds = button.getBoundingClientRect();
      root.style.setProperty("--theme-ripple-x", `${((bounds.left + bounds.width / 2) / innerWidth) * 100}%`);
      root.style.setProperty("--theme-ripple-y", `${((bounds.top + bounds.height / 2) / innerHeight) * 100}%`);
      const applyTheme = () => { root.dataset.theme = theme; syncButtons(); };
      const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (document.startViewTransition && !reducedMotion) {
        const transition = document.startViewTransition(applyTheme);
        const clearRipple = () => {
          root.style.removeProperty("--theme-ripple-x");
          root.style.removeProperty("--theme-ripple-y");
        };
        transition.finished.then(clearRipple, clearRipple);
      } else {
        applyTheme();
        root.style.removeProperty("--theme-ripple-x");
        root.style.removeProperty("--theme-ripple-y");
      }
      try { localStorage.setItem(STORAGE_KEY, theme); } catch (_) {}
      if (options.contains(button)) { closePicker(); trigger.focus(); }
    });

    document.addEventListener("click", (event) => {
      if (!picker.contains(event.target)) closePicker();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closePicker();
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
