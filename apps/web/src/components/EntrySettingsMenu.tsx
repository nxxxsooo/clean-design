import { useEffect, useRef, useState } from 'react';

import { LOCALE_LABEL, LOCALES, useI18n, useT, type Locale } from '../i18n';
import type { AppConfig, AppTheme } from '../types';
import { Icon } from './Icon';

export type EntrySettingsSection =
  | 'execution'
  | 'media'
  | 'language'
  | 'appearance'
  | 'notifications'
  | 'pet'
  | 'projectLocations'
  | 'library'
  | 'about'
  | 'memory'
  | 'designSystems';

const THEME_OPTIONS: Array<{
  value: AppTheme;
  icon: 'sun-moon' | 'sun' | 'moon';
  labelKey: 'settings.themeSystem' | 'settings.themeLight' | 'settings.themeDark';
}> = [
  { value: 'system', icon: 'sun-moon', labelKey: 'settings.themeSystem' },
  { value: 'light', icon: 'sun', labelKey: 'settings.themeLight' },
  { value: 'dark', icon: 'moon', labelKey: 'settings.themeDark' },
];

interface Props {
  config: AppConfig;
  onThemeChange: (theme: AppTheme) => void;
  onOpenSettings: (section?: EntrySettingsSection) => void;
  onTrackTriggerClick?: () => void;
  trackingPageName?: 'home' | 'artifact';
}

export function EntrySettingsMenu({
  config,
  onThemeChange,
  onOpenSettings,
  onTrackTriggerClick,
}: Props) {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
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
    <div className="entry-settings-menu" ref={wrapRef}>
      <button
        type="button"
        className="settings-icon-btn od-tooltip"
        onClick={() => {
          onTrackTriggerClick?.();
          setOpen((value) => !value);
        }}
        title={t('entry.openSettingsTitle')}
        aria-label={t('entry.openSettingsAria')}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="entry-settings-menu-trigger"
      >
        <Icon name="settings" size={17} />
      </button>
      {open ? (
        <div className="entry-settings-menu__popover" role="menu" data-testid="entry-settings-menu">
          <section className="entry-settings-menu__section">
            <div className="entry-settings-menu__section-title">
              <Icon name="languages" size={13} />
              <span>{t('settings.language')}</span>
            </div>
            <button
              type="button"
              role="menuitem"
              className="entry-settings-menu__select-trigger"
              aria-haspopup="menu"
              aria-expanded={languageOpen}
              onClick={() => setLanguageOpen((value) => !value)}
            >
              <span>{LOCALE_LABEL[locale]}</span>
              <Icon name="chevron-down" size={14} />
            </button>
            {languageOpen ? (
              <div className="entry-settings-menu__select-panel" role="menu">
                {LOCALES.map((code) => (
                  <button
                    key={code}
                    type="button"
                    role="menuitemradio"
                    aria-checked={locale === code}
                    className={`entry-settings-menu__option${locale === code ? ' is-active' : ''}`}
                    onClick={() => {
                      setLocale(code as Locale);
                      setLanguageOpen(false);
                    }}
                  >
                    <span>{LOCALE_LABEL[code]}</span>
                    {locale === code ? <Icon name="check" size={12} /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          <section className="entry-settings-menu__section">
            <div className="entry-settings-menu__section-title">
              <Icon name="palette" size={13} />
              <span>{t('settings.appearance')}</span>
            </div>
            <div className="entry-settings-menu__theme-row">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={(config.theme ?? 'system') === option.value}
                  className={`entry-settings-menu__theme${(config.theme ?? 'system') === option.value ? ' is-active' : ''}`}
                  onClick={() => onThemeChange(option.value)}
                >
                  <Icon name={option.icon} size={13} />
                  <span>{t(option.labelKey)}</span>
                </button>
              ))}
            </div>
          </section>

          <div className="entry-settings-menu__divider" aria-hidden />
          <button
            type="button"
            className="entry-settings-menu__item entry-settings-menu__item--primary"
            data-testid="entry-settings-open-details"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
          >
            <span className="entry-settings-menu__item-icon" aria-hidden>
              <Icon name="settings" size={14} />
            </span>
            <span>{t('avatar.settings')}</span>
            <span className="entry-settings-menu__item-meta">{t('homeHero.details')}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
