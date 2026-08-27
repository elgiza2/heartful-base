// Compatibility helpers retained for older callers. Megsy is dark-only so
// theme state never enters storage or triggers a second document repaint.

export type ThemeMode = "light" | "dark";

export function getThemeMode(): ThemeMode {
  return "dark";
}

export function setThemeMode(_mode: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", "dark");
  document.documentElement.classList.add("dark");
}

export function toggleThemeMode(): ThemeMode {
  setThemeMode("dark");
  return "dark";
}

// Appearance preference: "system" | "light" | "dark".
export type Appearance = "system" | ThemeMode;

export function getAppearance(): Appearance {
  return "dark";
}

export function setAppearance(_mode: Appearance) {
  setThemeMode("dark");
}
