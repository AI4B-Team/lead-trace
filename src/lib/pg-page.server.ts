/**
 * The Data API caps a single select at 1000 rows, so any query that asks for
 * more silently truncates. Paging matters most for compliance reads (suppression,
 * opt-outs, prior runs): a truncated list means excluded numbers come back.
 */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  max = 50_000,
  size = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < max; from += size) {
    const to = Math.min(from + size, max) - 1;
    const { data, error } = await page(from, to);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < to - from + 1) break;
  }
  return rows;
}
