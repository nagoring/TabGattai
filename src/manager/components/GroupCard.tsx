import { memo, useEffect, useRef, useState, type FormEvent } from 'react';
import type { SavedTab, TabGroup } from '../../core/types';
import { MAX_GROUP_NAME } from '../../core/services';
import { formatDateTime, useI18n } from '../../i18n';
import { TabRow } from './TabRow';

export interface GroupActions {
  onOpenTab: (tab: SavedTab, background: boolean) => void;
  onRemoveTab: (tab: SavedTab) => void;
  onRestoreGroup: (group: TabGroup) => void;
  onDeleteGroup: (group: TabGroup) => void;
  onRenameGroup: (group: TabGroup, name: string) => void;
  onCopyGroup: (group: TabGroup) => void;
}

interface Props extends GroupActions {
  group: TabGroup;
  /** Total tabs of the group when the list is filtered by search. */
  totalCount: number;
  collapsed: boolean;
  onToggleCollapsed: (groupId: string) => void;
}

function GroupCardImpl(props: Props) {
  const { group, totalCount, collapsed } = props;
  const { t, lang } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const date = formatDateTime(group.createdAt, lang);
  const filtered = group.tabs.length !== totalCount;

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    props.onRenameGroup(group, draft);
    setEditing(false);
  };
  const bodyId = `group-body-${group.id}`;

  return (
    <section className="group" aria-label={group.name || date}>
      <header className="group-header">
        <button
          type="button"
          className="icon-button collapse-toggle"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          onClick={() => props.onToggleCollapsed(group.id)}
          title={collapsed ? t('expand') : t('collapse')}
        >
          <span className={collapsed ? 'chevron collapsed' : 'chevron'} aria-hidden="true">▾</span>
          <span className="visually-hidden">{collapsed ? t('expand') : t('collapse')}</span>
        </button>
        <div className="group-title">
          {editing ? (
            <form onSubmit={submit} className="rename-form">
              <input
                ref={inputRef}
                value={draft}
                maxLength={MAX_GROUP_NAME}
                placeholder={t('groupNamePlaceholder')}
                aria-label={t('rename')}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setDraft(group.name);
                    setEditing(false);
                  }
                }}
              />
              <button type="submit" className="button small primary">{t('save')}</button>
              <button type="button" className="button small" onClick={() => { setDraft(group.name); setEditing(false); }}>{t('cancel')}</button>
            </form>
          ) : (
            <>
              <h2 className="group-name">{group.name || date}</h2>
              <span className="group-meta">
                {filtered ? `${group.tabs.length} / ${t('tabsCount', { count: totalCount })}` : t('tabsCount', { count: totalCount })}
                {group.name ? ` · ${t('createdAt', { date })}` : ''}
              </span>
            </>
          )}
        </div>
        {!editing && (
          <div className="group-actions">
            <button type="button" className="button small primary" onClick={() => props.onRestoreGroup(group)}>{t('restoreAll')}</button>
            <button type="button" className="button small" onClick={() => { setDraft(group.name); setEditing(true); }}>{t('rename')}</button>
            <button type="button" className="button small" onClick={() => props.onCopyGroup(group)}>{t('copyUrls')}</button>
            <button type="button" className="button small danger" onClick={() => props.onDeleteGroup(group)}>{t('deleteGroup')}</button>
          </div>
        )}
      </header>
      {!collapsed && (
        <ul className="tab-list" id={bodyId}>
          {group.tabs.map((tab) => (
            <TabRow key={tab.id} tab={tab} onOpen={props.onOpenTab} onRemove={props.onRemoveTab} />
          ))}
        </ul>
      )}
    </section>
  );
}

export const GroupCard = memo(GroupCardImpl);
