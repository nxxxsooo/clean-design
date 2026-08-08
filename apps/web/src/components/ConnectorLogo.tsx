import type { ConnectorDetail } from '@open-design/contracts';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

export function useResolvedTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export function ConnectorLogo({
  connector,
  size = 'sm',
}: {
  connector: ConnectorDetail;
  theme: 'light' | 'dark';
  size?: 'sm' | 'lg';
}) {
  return (
    <span className={`connector-logo size-${size} is-fallback`} aria-hidden="true">
      <span className="connector-logo-fallback">{initials(connector.name)}</span>
    </span>
  );
}
