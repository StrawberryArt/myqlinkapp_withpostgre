<?php
// go.php - the redirect. A short link like go.php?c=mylink sends the visitor to the long URL.
require_once 'db.php';

$name = $_GET['c'] ?? '';

$stmt = $pdo->prepare("SELECT long_url FROM links WHERE lower(name) = lower(?)");
$stmt->execute([$name]);
$url = $stmt->fetchColumn();

$scheme = $url ? strtolower(parse_url($url, PHP_URL_SCHEME) ?? '') : '';
if (!$url || ($scheme !== 'http' && $scheme !== 'https')) {
    logAction("VISIT  name=$name  NOT FOUND");
    http_response_code(404);
    echo 'Link not found.';
    exit;
}

logAction("VISIT  name=$name  -> $url");
header('Location: ' . $url);
exit;