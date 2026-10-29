import type { Category } from "./types";

/** Keep groups and their categories in YNAB's returned order, including emoji.
 * Group IDs distinguish separate groups that happen to share a name. */
export function categoryGroups(categories: Category[]) {
  const groups = new Map<string, { key: string; name: string; categories: Category[] }>();
  for (const category of categories) {
    const key = category.groupId === undefined ? `name:${category.groupName}` : `id:${category.groupId}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, name: category.groupName, categories: [] };
      groups.set(key, group);
    }
    group.categories.push(category);
  }
  return [...groups.values()];
}
