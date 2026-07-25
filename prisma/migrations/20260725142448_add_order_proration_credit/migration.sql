-- Thêm cột tín dụng proration (giá trị còn lại của gói trả phí khi nâng cấp)
ALTER TABLE `Order` ADD COLUMN `prorationCredit` INTEGER NOT NULL DEFAULT 0;
