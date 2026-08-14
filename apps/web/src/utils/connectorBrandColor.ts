const PALETTE = ['#1f6feb', '#b5360f', '#2e7d32', '#6a4fb6', '#b0337a', '#0f766e'];
const DARK_PALETTE = ['#58a6ff', '#ff7b72', '#56d364', '#a371f7', '#db61a2', '#2dd4bf'];

export type BrandTheme = 'light' | 'dark';

function hashIndex(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % PALETTE.length;
}

export function connectorBrandColor(
  connector: { id: string; name: string },
  theme: BrandTheme = 'light',
): string {
  const palette = theme === 'dark' ? DARK_PALETTE : PALETTE;
  return palette[hashIndex(connector.id || connector.name)]!;
}

export function resolveBrandTheme(): BrandTheme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}
