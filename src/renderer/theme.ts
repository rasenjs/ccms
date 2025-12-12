export type ThemePreference = 'system' | 'light' | 'dark';

export function normalizeThemePreference(value: unknown): ThemePreference {
  if (value === 'light' || value === 'dark' || value === 'system') return value;
  return 'system';
}

export function loadThemePreference(): ThemePreference {
  try {
    return normalizeThemePreference(localStorage.getItem('ccms.theme'));
  } catch {
    return 'system';
  }
}

export function saveThemePreference(pref: ThemePreference): void {
  try {
    localStorage.setItem('ccms.theme', pref);
  } catch {
    // ignore
  }
}

export function applyThemePreference(pref: ThemePreference): void {
  const root = document.documentElement;
  if (pref === 'system') {
    root.removeAttribute('data-theme');
    return;
  }
  root.setAttribute('data-theme', pref);
}
