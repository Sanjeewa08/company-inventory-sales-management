type QueryMock = jest.Mock<Promise<unknown>, [unknown]>;

function queryMock(result: unknown = null): QueryMock {
  return jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(result);
}

export const customerMocks = {
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

export const quotationMocks = {
  findMany: queryMock([]),
  findUnique: queryMock(),
  findUniqueOrThrow: queryMock(),
  count: queryMock(0),
  create: queryMock(),
  update: queryMock(),
  updateMany: queryMock({ count: 0 }),
};

export const auditMocks = {
  create: queryMock(),
};

export const userMocks = {
  findUnique: queryMock(),
};

export const salesPrismaMock = {
  customer: customerMocks,
  branch: branchMocks,
  product: productMocks,
  documentSequence: documentSequenceMocks,
  quotation: quotationMocks,
  auditLog: auditMocks,
  user: userMocks,
  $transaction: queryMock(),
};

const allMocks: QueryMock[] = [
  ...Object.values(customerMocks),
  ...Object.values(branchMocks),
  ...Object.values(productMocks),
  ...Object.values(documentSequenceMocks),
  ...Object.values(quotationMocks),
  ...Object.values(auditMocks),
  ...Object.values(userMocks),
  salesPrismaMock.$transaction,
];

export function resetSalesMocks(): void {
  for (const mock of allMocks) mock.mockReset();
  customerMocks.findMany.mockResolvedValue([]);
  customerMocks.findUnique.mockResolvedValue(null);
  customerMocks.findFirst.mockResolvedValue(null);
  customerMocks.count.mockResolvedValue(0);
  customerMocks.create.mockResolvedValue(null);
  customerMocks.update.mockResolvedValue(null);
  branchMocks.findFirst.mockResolvedValue(null);
  productMocks.findMany.mockResolvedValue([]);
  documentSequenceMocks.upsert.mockResolvedValue({ nextValue: 2 });
  quotationMocks.findMany.mockResolvedValue([]);
  quotationMocks.findUnique.mockResolvedValue(null);
  quotationMocks.findUniqueOrThrow.mockResolvedValue(null);
  quotationMocks.count.mockResolvedValue(0);
  quotationMocks.create.mockResolvedValue(null);
  quotationMocks.update.mockResolvedValue(null);
  quotationMocks.updateMany.mockResolvedValue({ count: 0 });
  auditMocks.create.mockResolvedValue(null);
  userMocks.findUnique.mockResolvedValue(null);
  salesPrismaMock.$transaction.mockImplementation(async (operation) => {
    if (typeof operation === "function") {
      return operation(salesPrismaMock);
    }
    if (Array.isArray(operation)) {
      return Promise.all(operation);
    }
    throw new Error("Unsupported mock transaction");
  });
}
