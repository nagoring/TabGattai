import { memo, useState, type MouseEvent } from 'react';
import type { SavedTab } from '../../core/types';
import { isSafeToOpen } from '../../core/url';
import { useI18n } from '../../i18n';
import { faviconUrl } from '../favicon';

interface Props {
  tab: SavedTab;
  onOpen: (tab: SavedTab, background: boolean) => void;
  onRemove: (tab: SavedTab) => void;
}

function TabRowImpl({ tab, onOpen, onRemove }: Props) {
  const { t } = useI18n();
  const [iconFailed, setIconFailed] = useState(false);
  const icon = iconFailed ? null : faviconUrl(tab.url);
  const safe = isSafeToOpen(tab.url);

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (!safe) return;
    onOpen(tab, e.ctrlKey || e.metaKey || e.shiftKey);
  };
  const handleAuxClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 1) return;
    e.preventDefault();
    if (safe) onOpen(tab, true);
  };

  return (
    <li className="tab-row">
      <span className="favicon" aria-hidden="true">
        {icon ? <img src={icon} width={16} height={16} alt="" loading="lazy" onError={() => setIconFailed(true)} /> : <span className="favicon-fallback" />}
      </span>
      <a
        className="tab-link"
        href={safe ? tab.url : undefined}
        onClick={handleClick}
        onAuxClick={handleAuxClick}
        title={t('restoreTab')}
        rel="noreferrer"
      >
        <span className="tab-title">{tab.title || t('untitled')}</span>
        <span className="tab-url">{tab.url}</span>
      </a>
      <button type="button" className="icon-button tab-remove" onClick={() => onRemove(tab)} aria-label={t('removeTab')} title={t('removeTab')}>
        ×
      </button>
    </li>
  );
}

export const TabRow = memo(TabRowImpl);
