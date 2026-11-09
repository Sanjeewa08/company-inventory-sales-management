process.env.DATABASE_URL ??=
  "postgresql://test:test@localhost:5432/inventory_test";
process.env.JWT_SECRET ??= "test-secret-that-is-at-least-32-characters-long";
