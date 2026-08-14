import type { CSSProperties } from 'react';

interface Props {
  id: string;
  size?: number;
  className?: string;
}

// Public local runtimes that ship a bundled brand asset under
// `apps/web/public/agent-icons/`. BYOK stays provider-branded elsewhere and
// the private BYOK adapter is intentionally not exposed as another CLI.
const ICON_EXT: Record<string, 'svg'> = {
  claude: 'svg',
  codex: 'svg',
  opencode: 'svg',
  pi: 'svg',
  antigravity: 'svg',
};

// SVG marks that are single-color silhouettes (no baked brand colors).
// Rendered as a CSS-masked `<span>` so `background-color: currentColor`
// can paint them in whatever text color the surrounding theme resolves
// to — light text under dark theme, dark text under light theme. The
// SVG file itself uses an explicit dark fill (`#1c1b1a`, baked) instead
// of `currentColor`, so if anything outside this component ever loads
// the asset through `<img>` it still renders as a legible dark mark
// rather than collapsing to the SVG document's default black-on-…-black.
const MONO_ICONS = new Set([
  'opencode',
]);

export function AgentIcon({ id, size = 36, className }: Props) {
  const cls = 'agent-icon' + (className ? ' ' + className : '');
  const ext = ICON_EXT[id];
  if (ext) {
    if (ext === 'svg' && MONO_ICONS.has(id)) {
      const src = `/agent-icons/${id}.svg`;
      const style: CSSProperties = {
        width: size,
        height: size,
        WebkitMaskImage: `url("${src}")`,
        maskImage: `url("${src}")`,
      };
      return (
        <span
          className={cls + ' agent-icon-mono'}
          style={style}
          aria-hidden="true"
        />
      );
    }
    return (
      <img
        src={`/agent-icons/${id}.${ext}`}
        alt=""
        width={size}
        height={size}
        className={cls}
        aria-hidden="true"
        draggable={false}
      />
    );
  }
  // Fallback for brands we don't ship artwork for. A neutral rounded
  // square with the initial letter — reads as "no official mark yet"
  // without inventing brand artwork we can't license.
  const initial = (id.match(/[a-z]/i)?.[0] ?? '?').toUpperCase();
  return (
    <span
      className={cls + ' agent-icon-fallback'}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        lineHeight: 1,
      }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
