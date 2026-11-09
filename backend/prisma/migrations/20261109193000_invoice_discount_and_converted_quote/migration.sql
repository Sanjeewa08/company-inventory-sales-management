-- AlterEnum
ALTER TYPE "QuotationStatus" ADD VALUE 'CONVERTED';

-- AlterTable
ALTER TABLE "Invoice"
ADD COLUMN "discount" DECIMAL(12,2) NOT NULL DEFAULT 0;
