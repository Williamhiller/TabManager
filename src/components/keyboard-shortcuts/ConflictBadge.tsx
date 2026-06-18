import { RiAlertLine } from '@remixicon/react';

interface ConflictBadgeProps {
  conflictingIds: string[];
  shortcutLabels: Map<string, string>;
}

export function ConflictBadge({ conflictingIds, shortcutLabels }: ConflictBadgeProps) {
  if (conflictingIds.length === 0) return null;

  const conflictingLabels = conflictingIds
    .map((id) => shortcutLabels.get(id))
    .filter(Boolean)
    .join(', ');

  return (
    <span className="tm-conflict-badge" title={`Conflicts with: ${conflictingLabels}`}>
      <RiAlertLine size={12} />
      Conflict
    </span>
  );
}
