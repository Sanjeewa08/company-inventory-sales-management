import { apiClient } from "../../lib/api";
import type { Pagination } from "../catalog/catalogApi";

export interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxNumber: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierInput {
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxNumber: string | null;
}

export interface SupplierListParams {
  page: number;
  limit: number;
  search?: string;
  isActive: boolean;
  sortBy: "name" | "createdAt";
  sortOrder: "asc" | "desc";
}

export interface SupplierListResponse {
  suppliers: Supplier[];
  pagination: Pagination;
}

export type PurchaseOrderStatus =
  | "DRAFT"
  | "APPROVED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "CANCELLED";

export interface PurchaseOrderItem {
  id: string;
  productId: string;
  quantity: number;
  receivedQuantity: number;
  unitCost: string;
  lineTotal: string;
  product: { id: string; sku: string; name: string; unit: string };
}

export interface PurchaseOrder {
  id: string;
  number: string;
  supplierId: string;
  branchId: string;
  createdById: string;
  approvedById: string | null;
  status: PurchaseOrderStatus;
  orderedAt: string;
  expectedAt: string | null;
  approvedAt: string | null;
  notes: string | null;
  subtotal: string;
  tax: string;
  total: string;
  createdAt: string;
  updatedAt: string;
  supplier: { id: string; name: string; email: string | null };
  branch: { id: string; name: string };
  items: PurchaseOrderItem[];
}

export interface PurchaseOrderInput {
  supplierId: string;
  branchId: string;
  expectedAt: string | null;
  notes: string | null;
  tax: string;
  items: Array<{ productId: string; quantity: number; unitCost: string }>;
}

export type PurchaseOrderUpdate = Partial<PurchaseOrderInput>;

export interface PurchaseOrderListParams {
  page: number;
  limit: number;
  search?: string;
  status?: PurchaseOrderStatus;
  supplierId?: string;
  branchId?: string;
  sortBy: "number" | "orderedAt" | "createdAt" | "total";
  sortOrder: "asc" | "desc";
}

export interface PurchaseOrderListResponse {
  purchaseOrders: PurchaseOrder[];
  pagination: Pagination;
}

export interface ReceivePurchaseOrderInput {
  notes?: string;
  items: Array<{ purchaseOrderItemId: string; quantity: number }>;
}

export interface GoodsReceipt {
  id: string;
  number: string;
  purchaseOrderId: string;
  branchId: string;
  receivedById: string;
  receivedAt: string;
  notes: string | null;
  createdAt: string;
  items: Array<{
    id: string;
    purchaseOrderItemId: string;
    quantity: number;
    unitCost: string;
  }>;
}

export interface ReceivePurchaseOrderResponse {
  goodsReceipt: GoodsReceipt;
  purchaseOrder: PurchaseOrder;
}

export async function listSuppliers(
  params: SupplierListParams,
): Promise<SupplierListResponse> {
  const { data } = await apiClient.get<SupplierListResponse>("/suppliers", {
    params,
  });
  return data;
}

export async function getSupplier(id: string): Promise<Supplier> {
  const { data } = await apiClient.get<{ supplier: Supplier }>(
    `/suppliers/${id}`,
  );
  return data.supplier;
}

export async function createSupplier(input: SupplierInput): Promise<Supplier> {
  const { data } = await apiClient.post<{ supplier: Supplier }>(
    "/suppliers",
    input,
  );
  return data.supplier;
}

export async function updateSupplier(
  id: string,
  input: Partial<SupplierInput> & { isActive?: boolean },
): Promise<Supplier> {
  const { data } = await apiClient.patch<{ supplier: Supplier }>(
    `/suppliers/${id}`,
    input,
  );
  return data.supplier;
}

export async function listPurchaseOrders(
  params: PurchaseOrderListParams,
): Promise<PurchaseOrderListResponse> {
  const { data } = await apiClient.get<PurchaseOrderListResponse>(
    "/purchase-orders",
    { params },
  );
  return data;
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const { data } = await apiClient.get<{ purchaseOrder: PurchaseOrder }>(
    `/purchase-orders/${id}`,
  );
  return data.purchaseOrder;
}

export async function createPurchaseOrder(
  input: PurchaseOrderInput,
): Promise<PurchaseOrder> {
  const { data } = await apiClient.post<{ purchaseOrder: PurchaseOrder }>(
    "/purchase-orders",
    input,
  );
  return data.purchaseOrder;
}

export async function updatePurchaseOrder(
  id: string,
  input: PurchaseOrderUpdate,
): Promise<PurchaseOrder> {
  const { data } = await apiClient.patch<{ purchaseOrder: PurchaseOrder }>(
    `/purchase-orders/${id}`,
    input,
  );
  return data.purchaseOrder;
}

export async function approvePurchaseOrder(
  id: string,
): Promise<PurchaseOrder> {
  const { data } = await apiClient.post<{ purchaseOrder: PurchaseOrder }>(
    `/purchase-orders/${id}/approve`,
  );
  return data.purchaseOrder;
}

export async function cancelPurchaseOrder(
  id: string,
): Promise<PurchaseOrder> {
  const { data } = await apiClient.post<{ purchaseOrder: PurchaseOrder }>(
    `/purchase-orders/${id}/cancel`,
  );
  return data.purchaseOrder;
}

export async function receivePurchaseOrder(
  id: string,
  input: ReceivePurchaseOrderInput,
): Promise<ReceivePurchaseOrderResponse> {
  const { data } = await apiClient.post<ReceivePurchaseOrderResponse>(
    `/purchase-orders/${id}/receive`,
    input,
  );
  return data;
}
