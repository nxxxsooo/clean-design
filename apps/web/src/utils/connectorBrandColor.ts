const PALETTE = ['#1f6feb', '#b5360f', '#2e7d32', '#6a4fb6', '#b0337a', '#0f766e'];

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
  _theme: BrandTheme = 'light',
): string {
  return PALETTE[hashIndex(connector.id || connector.name)]!;
}

export function resolveBrandTheme(): BrandTheme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}
