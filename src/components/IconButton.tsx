import type { RemixiconComponentType } from '@remixicon/react';
import { memo } from 'react';

import { blockDrag } from './tab-tree-helpers';

export const IconButton = memo(function IconButton({
  icon: Icon,
  label,
  danger,
  nativeTitle = true,
  onClick
}: {
  icon: RemixiconComponentType;
  label: string;
  danger?: boolean;
  nativeTitle?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={danger ? 'tm-icon-button-danger' : 'tm-icon-button'}
      onClick={onClick}
      onPointerDown={blockDrag}
      title={nativeTitle ? label : undefined}
      type="button"
    >
      <Icon size={14} />
    </button>
  );
});
