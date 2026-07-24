export interface Pagination {
  page: number;
  limit: number;
  offset: number;
}

export function pagination(page: number, limit: number): Pagination {
  const safePage = Math.max(1, Math.trunc(page));
  const safeLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
  return {
    page: safePage,
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit,
  };
}

export function paginationMeta(
  total: number,
  page: number,
  limit: number,
): {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
} {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
