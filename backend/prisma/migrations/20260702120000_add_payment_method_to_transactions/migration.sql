-- Add payment method support for transactions
ALTER TABLE "transactions"
ADD COLUMN "paymentMethod" TEXT NOT NULL DEFAULT 'CASH';
