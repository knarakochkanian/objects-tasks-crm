const PAGE_SIZE = 200;

/** Supabase caps each response; collect explicit ranges so list screens stay complete. */
export async function collectPages<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  signal?: AbortSignal,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    signal?.throwIfAborted();
    const page = await fetchPage(from, from + PAGE_SIZE - 1);
    signal?.throwIfAborted();
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}
