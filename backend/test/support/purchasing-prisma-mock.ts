type QueryMock = jest.Mock<Promise<unknown>, [unknown]>;

function queryMock(result: unknown = null): QueryMock {
  return jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(result);
}

export const supplierMocks = {
  findMany: queryMock([]),
  findUnique: queryMock(),
  findFirst: queryMock(),
  count: queryMock(0),
  create: queryMock(),
  update: queryMock(),
};

export const branchMocks = {
  findFirst: queryMock(),
};

export const productMocks = {
  findMany: queryMock([]),
};

export const documentSequenceMocks = {
  upsert: queryMock({ nextValue: 2 }),
};

export const purchaseOrderMocks = {
  findMany: queryMock([]),
  findUnique: queryMock(),
  findUniqueOrThrow: queryMock(),
  count: queryMock(0),
  create: queryMock(),
  update: queryMock(),
  updateMany: queryMock({ count: 0 }),
};

export const purchaseOrderItemMocks = {
  updateMany: queryMock({ count: 0 }),
};

export const goodsReceiptMocks = {
  create: queryMock(),
};

export const stockMocks = {
  upsert: queryMock(),
};

export const stockMovementMocks = {
  create: queryMock(),
};

export const alertMocks = {
  upsert: queryMock(),
  updateMany: queryMock(),
};

export const auditMocks = {
  create: queryMock(),
};

export const userMocks = {
  findUnique: queryMock(),
};

export const purchasingPrismaMock = {
  supplier: supplierMocks,
  branch: branchMocks,
  product: productMocks,
  documentSequence: documentSequenceMocks,
  purchaseOrder: purchaseOrderMocks,
  purchaseOrderItem: purchaseOrderItemMocks,
  goodsReceipt: goodsReceiptMocks,
  stock: stockMocks,
  stockMovement: stockMovementMocks,
  alert: alertMocks,
  auditLog: auditMocks,
  user: userMocks,
  $transaction: queryMock(),
};

const allMocks: QueryMock[] = [
  ...Object.values(supplierMocks),
  ...Object.values(branchMocks),
  ...Object.values(productMocks),
  ...Object.values(documentSequenceMocks),
  ...Object.values(purchaseOrderMocks),
  ...Object.values(purchaseOrderItemMocks),
  ...Object.values(goodsReceiptMocks),
  ...Object.values(stockMocks),
  ...Object.values(stockMovementMocks),
  ...Object.values(alertMocks),
  ...Object.values(auditMocks),
  ...Object.values(userMocks),
  purchasingPrismaMock.$transaction,
];

export function resetPurchasingMocks(): void {
  for (const mock of allMocks) mock.mockReset();
  supplierMocks.findMany.mockResolvedValue([]);
  supplierMocks.findUnique.mockResolvedValue(null);
  supplierMocks.findFirst.mockResolvedValue(null);
  supplierMocks.count.mockResolvedValue(0);
  supplierMocks.create.mockResolvedValue(null);
  supplierMocks.update.mockResolvedValue(null);
  branchMocks.findFirst.mockResolvedValue(null);
  productMocks.findMany.mockResolvedValue([]);
  documentSequenceMocks.upsert.mockResolvedValue({ nextValue: 2 });
  purchaseOrderMocks.findMany.mockResolvedValue([]);
  purchaseOrderMocks.findUnique.mockResolvedValue(null);
  purchaseOrderMocks.findUniqueOrThrow.mockResolvedValue(null);
  purchaseOrderMocks.count.mockResolvedValue(0);
  purchaseOrderMocks.create.mockResolvedValue(null);
  purchaseOrderMocks.update.mockResolvedValue(null);
  purchaseOrderMocks.updateMany.mockResolvedValue({ count: 0 });
  purchaseOrderItemMocks.updateMany.mockResolvedValue({ count: 0 });
  goodsReceiptMocks.create.mockResolvedValue(null);
  stockMocks.upsert.mockResolvedValue(null);
  stockMovementMocks.create.mockResolvedValue(null);
  alertMocks.upsert.mockResolvedValue(null);
  alertMocks.updateMany.mockResolvedValue({ count: 0 });
  auditMocks.create.mockResolvedValue(null);
  userMocks.findUnique.mockResolvedValue(null);
  purchasingPrismaMock.$transaction.mockImplementation(async (operation) => {
    if (typeof operation === "function") {
      return operation(purchasingPrismaMock);
    }
    if (Array.isArray(operation)) {
      return Promise.all(operation);
    }
    throw new Error("Unsupported mock transaction");
  });
}
