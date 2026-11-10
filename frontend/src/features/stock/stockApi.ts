import { apiClient } from "../../lib/api";
import type { Pagination } from "../catalog/catalogApi";

export interface BranchOption {
  id: string;
  name: string;
  isActive: boolean;
}

export interface StockProduct {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  unit: string;
  categoryId: string;
  reorderLevel: number;
  category: { id: string; name: string };
}

export interface StockRecord {
  id: string;
  productId: string;
  branchId: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
  product: StockProduct;
  branch: { id: string; name: string };
}

export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

export interface StockListParams {
  page: number;
  limit: number;
  sortBy: "quantity" | "createdAt";
  sortOrder: "asc" | "desc";
  branchId?: string;
  productId?: string;
  search?: string;
  categoryId?: string;
  status?: StockStatus;
}

export interface StockListResponse {
  stock: StockRecord[];
  pagination: Pagination;
}

export interface BranchListResponse {
  branches: BranchOption[];
  pagination: Pagination;
}

export interface AdjustStockInput {
  branchId: string;
  productId: string;
  quantity: number;
  notes: string;
}

export interface TransferStockInput {
  fromBranchId: string;
  toBranchId: string;
  notes?: string;
  items: Array<{ productId: string; quantity: number }>;
}

export interface TransferResult {
  transferId: string;
  fromBranchId: string;
  toBranchId: string;
  items: Array<{
    productId: string;
    sourceQuantity: number;
    destinationQuantity: number;
  }>;
}

export async function listStock(
  params: StockListParams,
): Promise<StockListResponse> {
  const { data } = await apiClient.get<StockListResponse>("/stock", { params });
  return data;
}

export async function listBranches(): Promise<BranchListResponse> {
  const { data } = await apiClient.get<BranchListResponse>("/branches", {
    params: { page: 1, limit: 100, isActive: true },
  });
  return data;
}

export async function adjustStock(
  input: AdjustStockInput,
): Promise<StockRecord> {
  const { data } = await apiClient.post<{ stock: StockRecord }>(
    "/stock/adjustments",
    input,
  );
  return data.stock;
}

export async function transferStock(
  input: TransferStockInput,
): Promise<TransferResult> {
  const { data } = await apiClient.post<{ transfer: TransferResult }>(
    "/stock/transfers",
    input,
  );
  return data.transfer;
}
