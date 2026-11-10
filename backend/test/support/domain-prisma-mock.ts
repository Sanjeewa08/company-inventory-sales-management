type QueryMock = jest.Mock<Promise<unknown>, [unknown]>;

function queryMock(result: unknown = null): QueryMock {
  return jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(result);
}

export const branchMocks = {
  findFirst: queryMock(),
  findMany: queryMock([]),
  findUnique: queryMock(),
  count: queryMock(0),
  create: queryMock(),
  update: queryMock(),
};

export const categoryMocks = {
  findFirst: queryMock(),
  findMany: queryMock([]),
  findUnique: queryMock(),
  count: queryMock(0),
  create: queryMock(),
  update: queryMock(),
};

export const productMocks = {
  findFirst: queryMock(),
  findMany: queryMock([]),
  findUnique: queryMock(),
  count: queryMock(0),
  create: queryMock(),
  update: queryMock(),
};

export const stockMocks = {
  findMany: queryMock([]),
  findUnique: queryMock(),
  findUniqueOrThrow: queryMock(),
  count: queryMock(0),
  updateMany: queryMock({ count: 0 }),
  upsert: queryMock(),
};

export const stockMovementMocks = {
  create: queryMock(),
  createMany: queryMock({ count: 0 }),
};

export const alertMocks = {
  upsert: queryMock(),
  updateMany: queryMock({ count: 0 }),
};

export const auditMocks = {
  create: queryMock(),
};

export const userMocks = {
  findUnique: queryMock(),
};

export const prismaDomainMock = {
  branch: branchMocks,
  category: categoryMocks,
  product: productMocks,
  stock: stockMocks,
  stockMovement: stockMovementMocks,
  alert: alertMocks,
  auditLog: auditMocks,
  user: userMocks,
  $queryRaw: queryMock([]),
  $transaction: queryMock(),
};

const allQueryMocks: QueryMock[] = [
  ...Object.values(branchMocks),
  ...Object.values(categoryMocks),
  ...Object.values(productMocks),
  ...Object.values(stockMocks),
  ...Object.values(stockMovementMocks),
  ...Object.values(alertMocks),
  ...Object.values(auditMocks),
  ...Object.values(userMocks),
  prismaDomainMock.$queryRaw,
  prismaDomainMock.$transaction,
];

export function resetDomainMocks(): void {
  for (const mock of allQueryMocks) {
    mock.mockReset();
  }
  branchMocks.findFirst.mockResolvedValue(null);
  branchMocks.findMany.mockResolvedValue([]);
  branchMocks.findUnique.mockResolvedValue(null);
  branchMocks.count.mockResolvedValue(0);
  branchMocks.create.mockResolvedValue(null);
  branchMocks.update.mockResolvedValue(null);
  categoryMocks.findFirst.mockResolvedValue(null);
  categoryMocks.findMany.mockResolvedValue([]);
  categoryMocks.findUnique.mockResolvedValue(null);
  categoryMocks.count.mockResolvedValue(0);
  categoryMocks.create.mockResolvedValue(null);
  categoryMocks.update.mockResolvedValue(null);
  productMocks.findFirst.mockResolvedValue(null);
  productMocks.findMany.mockResolvedValue([]);
  productMocks.findUnique.mockResolvedValue(null);
  productMocks.count.mockResolvedValue(0);
  productMocks.create.mockResolvedValue(null);
  productMocks.update.mockResolvedValue(null);
  stockMocks.findMany.mockResolvedValue([]);
  stockMocks.findUnique.mockResolvedValue(null);
  stockMocks.findUniqueOrThrow.mockResolvedValue(null);
  stockMocks.count.mockResolvedValue(0);
  stockMocks.updateMany.mockResolvedValue({ count: 0 });
  stockMocks.upsert.mockResolvedValue(null);
  stockMovementMocks.create.mockResolvedValue(null);
  stockMovementMocks.createMany.mockResolvedValue({ count: 0 });
  alertMocks.upsert.mockResolvedValue(null);
  alertMocks.updateMany.mockResolvedValue({ count: 0 });
  auditMocks.create.mockResolvedValue(null);
  userMocks.findUnique.mockResolvedValue(null);
  prismaDomainMock.$transaction.mockImplementation(async (operation) => {
    if (typeof operation === "function") {
      return operation(prismaDomainMock);
    }
    if (Array.isArray(operation)) {
      return Promise.all(operation);
    }
    throw new Error("Unsupported mock transaction");
  });
}
