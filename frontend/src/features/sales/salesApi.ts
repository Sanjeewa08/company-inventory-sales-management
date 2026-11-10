import { apiClient } from "../../lib/api";
import type { Pagination } from "../catalog/catalogApi";

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxNumber: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerInput {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxNumber: string | null;
}

export interface CustomerListParams {
  page: number;
  limit: number;
  search?: string;
  isActive: boolean;
  sortBy: "name" | "createdAt";
  sortOrder: "asc" | "desc";
}

export interface CustomerListResponse {
  customers: Customer[];
  pagination: Pagination;
}

export type QuotationStatus =
  | "DRAFT"
  | "SENT"
  | "ACCEPTED"
  | "CONVERTED"
  | "EXPIRED"
  | "REJECTED";

export interface SalesLineItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  product: { id: string; sku: string; name: string; unit: string };
}

export interface Quotation {
  id: string;
  number: string;
  customerId: string;
  branchId: string;
  createdById: string;
  status: QuotationStatus;
  issuedAt: string;
  validUntil: string | null;
  notes: string | null;
  subtotal: string;
  tax: string;
  total: string;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; name: string; email: string | null; phone: string | null };
  branch: { id: string; name: string };
  items: SalesLineItem[];
}

export interface QuotationInput {
  customerId: string;
  branchId: string;
  validUntil: string | null;
  notes: string | null;
  tax: string;
  items: Array<{ productId: string; quantity: number; unitPrice: string }>;
}

export type QuotationUpdate = Partial<QuotationInput>;

export interface QuotationListParams {
  page: number;
  limit: number;
  search?: string;
  status?: QuotationStatus;
  customerId?: string;
  branchId?: string;
  sortBy: "number" | "issuedAt" | "createdAt" | "total";
  sortOrder: "asc" | "desc";
}

export interface QuotationListResponse {
  quotations: Quotation[];
  pagination: Pagination;
}

export type InvoiceStatus = "PENDING" | "PARTIAL" | "PAID" | "CANCELLED";
export type PaymentMethod = "CASH" | "CARD" | "BANK_TRANSFER";

export interface Invoice {
  id: string;
  number: string;
  customerId: string;
  branchId: string;
  quotationId: string | null;
  createdById: string;
  status: InvoiceStatus;
  issuedAt: string;
  dueAt: string | null;
  notes: string | null;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; name: string; email: string | null; phone: string | null };
  branch: { id: string; name: string };
  items: SalesLineItem[];
}

export interface ManualInvoiceInput {
  customerId: string;
  branchId: string;
  dueAt: string | null;
  notes: string | null;
  discount: string;
  tax: string;
  items: Array<{ productId: string; quantity: number; unitPrice: string }>;
}

export interface QuotationInvoiceInput {
  quotationId: string;
  dueAt?: string | null;
  notes?: string | null;
}

export type CreateInvoiceInput = ManualInvoiceInput | QuotationInvoiceInput;

export interface InvoiceListParams {
  page: number;
  limit: number;
  status?: InvoiceStatus;
  customerId?: string;
  branchId?: string;
  startDate?: string;
  endDate?: string;
  sortBy: "number" | "issuedAt" | "createdAt" | "total";
  sortOrder: "asc" | "desc";
}

export interface InvoiceListResponse {
  invoices: Invoice[];
  pagination: Pagination;
}

export interface Payment {
  id: string;
  invoiceId: string;
  receivedById: string;
  amount: string;
  method: PaymentMethod;
  reference: string | null;
  receivedAt: string;
  notes: string | null;
  createdAt: string;
}

export interface PaymentInput {
  amount: string;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
}

export interface CreatePaymentResponse {
  payment: Payment;
  invoice: Invoice;
  paidAmount: string;
  balance: string;
}

export async function listCustomers(
  params: CustomerListParams,
): Promise<CustomerListResponse> {
  const { data } = await apiClient.get<CustomerListResponse>("/customers", {
    params,
  });
  return data;
}

export async function getCustomer(id: string): Promise<Customer> {
  const { data } = await apiClient.get<{ customer: Customer }>(
    `/customers/${id}`,
  );
  return data.customer;
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  const { data } = await apiClient.post<{ customer: Customer }>(
    "/customers",
    input,
  );
  return data.customer;
}

export async function updateCustomer(
  id: string,
  input: Partial<CustomerInput> & { isActive?: boolean },
): Promise<Customer> {
  const { data } = await apiClient.patch<{ customer: Customer }>(
    `/customers/${id}`,
    input,
  );
  return data.customer;
}

export async function listQuotations(
  params: QuotationListParams,
): Promise<QuotationListResponse> {
  const { data } = await apiClient.get<QuotationListResponse>("/quotations", {
    params,
  });
  return data;
}

export async function getQuotation(id: string): Promise<Quotation> {
  const { data } = await apiClient.get<{ quotation: Quotation }>(
    `/quotations/${id}`,
  );
  return data.quotation;
}

export async function createQuotation(input: QuotationInput): Promise<Quotation> {
  const { data } = await apiClient.post<{ quotation: Quotation }>(
    "/quotations",
    input,
  );
  return data.quotation;
}

export async function updateQuotation(
  id: string,
  input: QuotationUpdate,
): Promise<Quotation> {
  const { data } = await apiClient.patch<{ quotation: Quotation }>(
    `/quotations/${id}`,
    input,
  );
  return data.quotation;
}

async function quotationAction(
  id: string,
  action: "send" | "accept" | "expire",
): Promise<Quotation> {
  const { data } = await apiClient.post<{ quotation: Quotation }>(
    `/quotations/${id}/${action}`,
  );
  return data.quotation;
}

export const sendQuotation = (id: string) => quotationAction(id, "send");
export const acceptQuotation = (id: string) => quotationAction(id, "accept");
export const expireQuotation = (id: string) => quotationAction(id, "expire");

export async function listInvoices(
  params: InvoiceListParams,
): Promise<InvoiceListResponse> {
  const { data } = await apiClient.get<InvoiceListResponse>("/invoices", {
    params,
  });
  return data;
}

export async function getInvoice(id: string): Promise<Invoice> {
  const { data } = await apiClient.get<{ invoice: Invoice }>(`/invoices/${id}`);
  return data.invoice;
}

export async function createInvoice(
  input: CreateInvoiceInput,
): Promise<Invoice> {
  const { data } = await apiClient.post<{ invoice: Invoice }>("/invoices", input);
  return data.invoice;
}

export async function cancelInvoice(id: string): Promise<Invoice> {
  const { data } = await apiClient.post<{ invoice: Invoice }>(
    `/invoices/${id}/cancel`,
  );
  return data.invoice;
}

export async function listInvoicePayments(id: string): Promise<Payment[]> {
  const { data } = await apiClient.get<{ payments: Payment[] }>(
    `/invoices/${id}/payments`,
  );
  return data.payments;
}

export async function createInvoicePayment(
  id: string,
  input: PaymentInput,
): Promise<CreatePaymentResponse> {
  const { data } = await apiClient.post<CreatePaymentResponse>(
    `/invoices/${id}/payments`,
    input,
  );
  return data;
}

export async function getInvoicePdf(id: string): Promise<Blob> {
  const { data } = await apiClient.get<Blob>(`/invoices/${id}/pdf`, {
    responseType: "blob",
  });
  return data;
}
