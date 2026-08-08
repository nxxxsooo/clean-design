import { useEffect, useRef, useState } from 'react';

import { Icon } from './Icon';
import { useT } from '../i18n';

const REPO = 'https://github.com/nxxxsooo/clean-design';
const EXTERNAL = { target: '_blank', rel: 'noreferrer noopener' } as const;

export function EntryHelpMenu() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="entry-help-menu" ref={wrapRef}>
      <button
        type="button"
        className="entry-nav-rail__btn entry-help-menu__trigger"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('entry.helpAria')}
        data-testid="entry-help-trigger"
      >
        <Icon name="help-circle" size={18} />
      </button>
      {open ? (
        <div className="entry-help-popover" role="menu" aria-label={t('entry.helpMenuAria')}>
          <a className="entry-help-popover__item" href={`${REPO}#readme`} {...EXTERNAL} role="menuitem">
            <Icon name="external-link" size={14} />
            <span>{t('entry.helpGetHelp')}</span>
          </a>
          <a className="entry-help-popover__item" href={`${REPO}/issues/new`} {...EXTERNAL} role="menuitem">
            <Icon name="comment" size={14} />
            <span>{t('entry.helpSubmitFeature')}</span>
          </a>
        </div>
      ) : null}
    </div>
  );
}
