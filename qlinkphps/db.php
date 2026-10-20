<?php
$DB_HOST = 'localhost';
$DB_PORT = '5432';
$DB_NAME = 'qlink';
$DB_USER = 'postgres';
$DB_PASS = 'pos123';
 
try {
    $pdo = new PDO("pgsql:host=$DB_HOST;port=$DB_PORT;dbname=$DB_NAME", $DB_USER, $DB_PASS);
} catch (PDOException $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'database connection failed']);
    exit;
}
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
 
$pdo->exec("CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
)");
 
$pdo->exec("CREATE TABLE IF NOT EXISTS links (
  id SERIAL PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  long_url TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)");
 
// Link names are unique ignoring upper/lower case (replaces SQLite's COLLATE NOCASE)
$pdo->exec("CREATE UNIQUE INDEX IF NOT EXISTS links_name_lower_idx ON links (lower(name))");
 
// Writes one line per user action to qlink.log (watch it live in cmd, see instructions)
// and also to the Apache error log. Never pass passwords to this.
function logAction(string $msg): void {
    $line = date('Y-m-d H:i:s') . '  ' . $msg . PHP_EOL;
    @file_put_contents(__DIR__ . '/qlink.log', $line, FILE_APPEND | LOCK_EX);
    error_log('[qlink] ' . $msg);
}
