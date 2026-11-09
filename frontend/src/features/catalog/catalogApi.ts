import { apiClient } from "../../lib/api";

export interface Category {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  unit: string;
  categoryId: string;
  costPrice: string;
  sellingPrice: string;
  reorderLevel: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ProductListResponse {
  products: Product[];
  pagination: Pagination;
}

export interface CategoryListResponse {
  categories: Category[];
  pagination: Pagination;
}

export interface ProductListParams {
  page: number;
  limit: number;
  isActive: boolean;
  name?: string;
  sku?: string;
  barcode?: string;
  categoryId?: string;
}

export interface CategoryListParams {
  page: number;
  limit: number;
  isActive: boolean;
  name?: string;
}

export interface ProductInput {
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  unit: string;
  categoryId: string;
  costPrice: string;
  sellingPrice: string;
  reorderLevel: number;
}

export interface ProductUpdate extends Partial<ProductInput> {
  isActive?: boolean;
}

export interface CategoryInput {
  name: string;
  description: string | null;
}

export interface CategoryUpdate extends Partial<CategoryInput> {
  isActive?: boolean;
}

export async function listProducts(
  params: ProductListParams,
): Promise<ProductListResponse> {
  const { data } = await apiClient.get<ProductListResponse>("/products", {
    params,
  });
  return data;
}

export async function listCategories(
  params: CategoryListParams,
): Promise<CategoryListResponse> {
  const { data } = await apiClient.get<CategoryListResponse>("/categories", {
    params,
  });
  return data;
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const { data } = await apiClient.post<{ product: Product }>("/products", input);
  return data.product;
}

export async function updateProduct(
  id: string,
  input: ProductUpdate,
): Promise<Product> {
  const { data } = await apiClient.patch<{ product: Product }>(
    `/products/${id}`,
    input,
  );
  return data.product;
}

export async function createCategory(input: CategoryInput): Promise<Category> {
  const { data } = await apiClient.post<{ category: Category }>(
    "/categories",
    input,
  );
  return data.category;
}

export async function updateCategory(
  id: string,
  input: CategoryUpdate,
): Promise<Category> {
  const { data } = await apiClient.patch<{ category: Category }>(
    `/categories/${id}`,
    input,
  );
  return data.category;
}
