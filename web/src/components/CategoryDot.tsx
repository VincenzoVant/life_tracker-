import { CATEGORY_META, type Category } from '@life-tracker/shared';
import type { CSSProperties } from 'react';

export function CategoryDot({ category }: { category: Category }) {
  const meta = CATEGORY_META[category];
  return <span className="cat-dot" role="img" aria-label={meta.label} style={{ '--cat-color': meta.color } as CSSProperties} />;
}
