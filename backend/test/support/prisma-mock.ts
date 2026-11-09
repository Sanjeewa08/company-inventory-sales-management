export const mockFindUnique = jest.fn<Promise<unknown>, [unknown]>();
export const mockAuditCreate = jest.fn<Promise<unknown>, [unknown]>();

export const prismaMock = {
  user: {
    findUnique: mockFindUnique,
  },
  auditLog: {
    create: mockAuditCreate,
  },
};
