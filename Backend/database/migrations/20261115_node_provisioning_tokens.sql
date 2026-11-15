-- Provisioning token dùng một lần cho ESP32.
-- Mỗi Node có tối đa một token hiện hành; DB chỉ lưu SHA-256 hash, không lưu token rõ.
CREATE TABLE IF NOT EXISTS `provisioningTokens` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nodeId` INT NOT NULL,
  `tokenHash` CHAR(64) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `provisioningTokens_nodeId_unique` (`nodeId`),
  UNIQUE KEY `provisioningTokens_tokenHash_unique` (`tokenHash`),
  CONSTRAINT `fk_provisioningTokens_node`
    FOREIGN KEY (`nodeId`) REFERENCES `nodes` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- nodeCode/deviceCode của các bản ghi cũ được giữ nguyên để không phá MQTT topic,
-- ACL và cấu hình Firmware đã triển khai. Bản ghi mới dùng NODE-<id> / DEV-<id>.
