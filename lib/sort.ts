// Shared by the browser and Node tests. Missing measurements stay last in both directions.
export function compareValues(a: string, b: string, numeric: boolean, direction: number): number {
  if (a === '' || b === '') return a === b ? 0 : a === '' ? 1 : -1;
  return direction * (numeric ? Number(a) - Number(b) : a.localeCompare(b, 'en', { numeric: true }));
}
