import { Button } from "../../components/ui/Button";
import type { Pagination } from "./catalogApi";

interface CatalogPaginationProps {
  pagination: Pagination;
  onPageChange: (page: number) => void;
}

export function CatalogPagination({
  pagination,
  onPageChange,
}: CatalogPaginationProps) {
  const totalPages = Math.max(pagination.totalPages, 1);
  const firstItem =
    pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const lastItem = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div className="flex flex-col gap-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
      <p>
        Showing {firstItem}–{lastItem} of {pagination.total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          disabled={pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
          type="button"
          variant="secondary"
        >
          Previous
        </Button>
        <span className="min-w-24 text-center">
          Page {pagination.page} of {totalPages}
        </span>
        <Button
          disabled={pagination.page >= totalPages}
          onClick={() => onPageChange(pagination.page + 1)}
          type="button"
          variant="secondary"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
