import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import {
  fetchDesignSystem,
  fetchDesignSystemPreview,
  fetchDesignSystemShowcase,
} from '../providers/registry';
import type { DesignSystemDetail, DesignSystemSummary } from '../types';
import { DesignSpecView } from './DesignSpecView';
import { DesignSystemKitPreview } from './DesignSystemKitPreview';
import { PreviewModal } from './PreviewModal';

interface Props {
  system: DesignSystemSummary;
  onClose: () => void;
  initialViewId?: 'showcase' | 'kit' | 'tokens';
}

function isDesignSystemDetail(system: DesignSystemSummary): system is DesignSystemDetail {
  return typeof (system as { body?: unknown }).body === 'string';
}

// Full DS preview: keep the brand-kit-style module stack as the default view,
// while retaining the lazy showcase/tokens tabs and DESIGN.md side panel from
// the richer modal flow.
export function DesignSystemPreviewModal({ system, onClose, initialViewId = 'kit' }: Props) {
  const t = useT();
  const [showcaseHtml, setShowcaseHtml] = useState<string | null | undefined>(undefined);
  const [tokensHtml, setTokensHtml] = useState<string | null | undefined>(undefined);
  const [specBody, setSpecBody] = useState<string | null | undefined>(undefined);
  const [detail, setDetail] = useState<DesignSystemDetail | null | undefined>(
    () => (isDesignSystemDetail(system) ? system : undefined),
  );
  const detailBody = detail?.body ?? (isDesignSystemDetail(system) ? system.body : undefined);

  useEffect(() => {
    let cancelled = false;
    setDetail(isDesignSystemDetail(system) ? system : undefined);
    void fetchDesignSystem(system.id).then((next) => {
      if (cancelled) return;
      if (next) setDetail(next);
    });
    return () => {
      cancelled = true;
    };
  }, [system]);

  const handleView = useCallback(
    (viewId: string) => {
      if (viewId === 'showcase' && showcaseHtml === undefined) {
        setShowcaseHtml(null);
        void fetchDesignSystemShowcase(system.id).then((html) => setShowcaseHtml(html));
      }
      if (viewId === 'tokens' && tokensHtml === undefined) {
        setTokensHtml(null);
        void fetchDesignSystemPreview(system.id).then((html) => setTokensHtml(html));
      }
    },
    [system.id, showcaseHtml, tokensHtml],
  );

  const handleSidebarToggle = useCallback(
    (open: boolean) => {
      if (!open || specBody !== undefined) return;
      if (detailBody !== undefined) {
        setSpecBody(detailBody);
        return;
      }
      setSpecBody(null);
      void fetchDesignSystem(system.id).then((detail) => setSpecBody(detail?.body ?? null));
    },
    [detailBody, system.id, specBody],
  );

  useEffect(() => {
    setShowcaseHtml(undefined);
    setTokensHtml(undefined);
    setSpecBody(undefined);
  }, [system.id]);

  const modal = (
    <PreviewModal
      title={system.title}
      subtitle={system.summary || system.category}
      views={[
        {
          id: 'kit',
          label: t('ds.kitVisualize'),
          custom: (
            <DesignSystemKitPreview
              system={system}
              variant="panel"
              showCover={false}
              className="ds-modal-kit-preview"
              dataTestId="design-system-modal-kit"
            />
          ),
        },
        { id: 'showcase', label: t('ds.showcase'), html: showcaseHtml },
        { id: 'tokens', label: t('ds.tokens'), html: tokensHtml },
      ]}
      initialViewId={initialViewId}
      onView={handleView}
      exportTitleFor={(viewId) => (viewId === 'kit' ? system.title : `${system.title} - ${viewId}`)}
      onClose={onClose}
      sidebar={{
        label: t('ds.specToggle'),
        defaultOpen: true,
        onToggle: handleSidebarToggle,
        contentKey: system.id,
        content: (
          <DesignSpecView
            source={specBody}
            loadingLabel={t('ds.specLoading')}
          />
        ),
      }}
    />
  );

  if (typeof document === 'undefined') return modal;
  return createPortal(modal, document.body);
}
