import type { TabGroup } from '../../core/types';
import { useI18n } from '../../i18n';
import { GroupCard, type GroupActions } from './GroupCard';

interface Props extends GroupActions {
  /** Groups to show (possibly filtered by search). */
  groups: readonly TabGroup[];
  /** Total tab count per group id (unfiltered). */
  totals: ReadonlyMap<string, number>;
  collapsed: ReadonlySet<string>;
  searching: boolean;
  onToggleCollapsed: (groupId: string) => void;
}

export function GroupList({ groups, totals, collapsed, searching, onToggleCollapsed, ...actions }: Props) {
  const { t } = useI18n();
  if (groups.length === 0) {
    return searching ? (
      <p className="empty">{t('noMatches')}</p>
    ) : (
      <div className="empty">
        <p className="empty-title">{t('emptyTitle')}</p>
        <p>{t('emptyBody')}</p>
      </div>
    );
  }
  return (
    <div className="group-list">
      {groups.map((g) => (
        <GroupCard
          key={g.id}
          group={g}
          totalCount={totals.get(g.id) ?? g.tabs.length}
          // While searching, always show matches even in collapsed groups.
          collapsed={!searching && collapsed.has(g.id)}
          onToggleCollapsed={onToggleCollapsed}
          {...actions}
        />
      ))}
    </div>
  );
}
