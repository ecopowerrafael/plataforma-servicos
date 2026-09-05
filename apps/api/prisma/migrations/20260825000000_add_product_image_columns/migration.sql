-- Additive columns so products can reuse the central image storage used by services.
ALTER TABLE `products`
  ADD COLUMN `image_path` VARCHAR(512) NULL,
  ADD COLUMN `image_alt` VARCHAR(160) NULL;
