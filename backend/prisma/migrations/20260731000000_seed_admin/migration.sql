INSERT INTO users (pseudo, email, password)
VALUES ('raloul', 'raoul.padovani@laplateforme.io', '$2b$10$vL4jygTNnTCpxJD9byr7guMmllJA5eT7XkLHY65LOSl/clcMNkpSq')
ON CONFLICT DO NOTHING;