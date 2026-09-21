export const themes = {
  light: { background: '#ffffff', foreground: '#000000', highlight: '#ff0000', accent: '#000000', scheme: 'light' },
  nord: { background: '#2e3440', foreground: '#eceff4', highlight: '#bf616a', accent: '#88c0d0', scheme: 'dark' },
};

export function applyTheme(name) {
  const theme = themes[name];
  const root = document.documentElement;
  root.dataset.theme = name;
  root.style.colorScheme = theme.scheme;
  for (const property of ['background', 'foreground', 'highlight', 'accent']) {
    root.style.setProperty(`--${property}`, theme[property]);
  }
}
