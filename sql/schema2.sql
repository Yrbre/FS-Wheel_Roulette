-- Skema database untuk aplikasi Wheel of Names
-- Import dengan: mysql -u root -p nama_database < sql/schema.sql

CREATE TABLE IF NOT EXISTS participants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  has_won TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('PROPER', 'LS') NOT NULL DEFAULT 'LS',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prizes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  stock INT NOT NULL DEFAULT 1,
  original_stock INT NOT NULL DEFAULT 1,
  status ENUM('GRANDPRIZE', 'COMMON') NOT NULL DEFAULT 'COMMON',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS winners (
  id INT AUTO_INCREMENT PRIMARY KEY,
  participant_id INT NOT NULL,
  prize_id INT NOT NULL,
  round_number INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (participant_id) REFERENCES participants(id),
  FOREIGN KEY (prize_id) REFERENCES prizes(id)
);

-- Contoh data (opsional, hapus/ubah sesuai kebutuhan)
INSERT INTO participants (name, status) VALUES
  ('Andi', 'PROPER'), ('Budi', 'LS'), ('Citra', 'PROPER'), ('Dewi', 'LS'), ('Eka', 'LS'),
  ('Fajar', 'PROPER'), ('Gita', 'LS'), ('Hasan', 'LS'), ('Indah', 'PROPER'), ('Joko', 'LS'),
  ('Kartika', 'LS'), ('Lukman', 'PROPER'), ('Maya', 'LS'), ('Nanda', 'LS'), ('Oscar', 'LS');

INSERT INTO prizes (name, stock, original_stock, status) VALUES
  ('Voucher Belanja 100rb', 5, 5, 'COMMON'),
  ('Smartwatch', 3, 3, 'COMMON'),
  ('Grand Prize - Smartphone', 1, 1, 'GRANDPRIZE');
