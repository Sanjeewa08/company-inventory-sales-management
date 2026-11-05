ALTER TABLE "Stock"
ADD CONSTRAINT "Stock_quantity_nonnegative_check" CHECK ("quantity" >= 0);
