const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
export function naturalSort(a, b) { return collator.compare(String(a), String(b)); }
