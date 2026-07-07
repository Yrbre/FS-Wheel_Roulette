-- Skema database untuk aplikasi Wheel of Names
-- Import dengan: mysql -u root -p nama_database < sql/schema.sql

CREATE TABLE IF NOT EXISTS participants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  has_won TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_has_won (has_won),
  INDEX idx_name (name),
  INDEX idx_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS prizes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  stock INT NOT NULL DEFAULT 1,
  original_stock INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_stock (stock)
);

CREATE TABLE IF NOT EXISTS winners (
  id INT AUTO_INCREMENT PRIMARY KEY,
  participant_id INT NOT NULL,
  prize_id INT NOT NULL,
  round_number INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (participant_id) REFERENCES participants(id),
  FOREIGN KEY (prize_id) REFERENCES prizes(id),
  INDEX idx_participant_id (participant_id),
  INDEX idx_prize_id (prize_id),
  INDEX idx_created_at (created_at)
);

-- Contoh data (opsional, hapus/ubah sesuai kebutuhan)
INSERT INTO participants (name) VALUES
  ('Andi'), ('Budi'), ('Citra'), ('Dewi'), ('Eka'),
  ('Fajar'), ('Gita'), ('Hasan'), ('Indah'), ('Joko'),
  ('Kartika'), ('Lukman'), ('Maya'), ('Nanda'), ('Oscar');

INSERT INTO prizes (name, stock, original_stock) VALUES
  ('Voucher Belanja 100rb', 5, 5),
  ('Smartwatch', 3, 3),
  ('Grand Prize - Smartphone', 1, 1);
