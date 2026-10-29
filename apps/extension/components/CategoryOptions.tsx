import { categoryGroups } from "@/lib/category-groups";
import type { Category } from "@/lib/types";

/** Native optgroups provide visible, non-selectable category group headers. */
export default function CategoryOptions({ categories }: { categories: Category[] }) {
  return <>
    <option value="">Choose category…</option>
    {categoryGroups(categories).map(group => <optgroup key={group.key} label={group.name}>
      {group.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
    </optgroup>)}
  </>;
}
