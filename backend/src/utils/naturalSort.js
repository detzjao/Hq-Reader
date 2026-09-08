const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base'
});

export function naturalSort(a, b) {
  return collator.compare(String(a), String(b));
}

export function naturalSortByName(items) {
  return [...items].sort((a, b) => naturalSort(a.name, b.name));
}
