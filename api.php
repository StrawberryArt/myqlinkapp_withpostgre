<?php
// api.php - the whole backend. QlinkJS.js calls it with ?action=...
session_start();
require_once 'db.php';

$action = $_GET['action'] ?? '';

// Logout is a normal link (not fetch), so it redirects instead of sending JSON
if ($action === 'logout') {
    logAction('LOGOUT  user=' . ($_SESSION['user'] ?? '(none)'));
    $_SESSION = [];
    session_destroy();
    header('Location: Qlinkhtml.html');
    exit;
}

header('Content-Type: application/json');

function out($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function requireLogin(): string {
    if (!isset($_SESSION['user'])) out(['error' => 'not logged in'], 401);
    return $_SESSION['user'];
}

function isSafeUrl(string $url): bool {
    $p = parse_url($url);
    return $p && isset($p['scheme'], $p['host'])
        && in_array(strtolower($p['scheme']), ['http', 'https'], true);
}

// 23505 = PostgreSQL "unique violation" (name/username already exists)
function isDuplicate(PDOException $e): bool {
    return $e->getCode() === '23505';
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $in = json_decode(file_get_contents('php://input'), true) ?? [];
} else {
    $in = [];
}

switch ($action) {

    case 'register':
        $name = strtolower(trim($in['username'] ?? ''));
        $pass = $in['password'] ?? '';
        if ($name === '' || $pass === '') out(['error' => 'missing fields'], 400);

        try {
            $stmt = $pdo->prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)");
            $stmt->execute([$name, password_hash($pass, PASSWORD_DEFAULT)]);
        } catch (PDOException $e) {
            if (isDuplicate($e)) {
                logAction("REGISTER  user=$name  FAILED (username taken)");
                out(['error' => 'taken'], 409);
            }
            throw $e;
        }
        logAction("REGISTER  user=$name  OK");
        out(['ok' => true]);

    case 'login':
        $name = strtolower(trim($in['username'] ?? ''));
        $pass = $in['password'] ?? '';

        $stmt = $pdo->prepare("SELECT password_hash FROM users WHERE username = ?");
        $stmt->execute([$name]);
        $user = $stmt->fetch();

        if ($user && password_verify($pass, $user['password_hash'])) {
            session_regenerate_id(true);
            $_SESSION['user'] = $name;
            logAction("LOGIN  user=$name  OK");
            out(['ok' => true]);
        }
        logAction("LOGIN  user=$name  FAILED (wrong login)");
        out(['error' => 'wrong login'], 401);

    case 'list':
        $me = requireLogin();
        $stmt = $pdo->prepare("SELECT id, name, long_url, clicks FROM links WHERE owner = ? ORDER BY id DESC");
        $stmt->execute([$me]);
        $links = array_map(fn($r) => [
            'id'      => (int)$r['id'],
            'name'    => $r['name'],
            'longUrl' => $r['long_url'],
            'clicks'  => (int)$r['clicks'],
        ], $stmt->fetchAll());
        out($links);

    case 'create':
        $me      = requireLogin();
        $longUrl = trim($in['longUrl'] ?? '');
        $name    = trim($in['name'] ?? '');

        if (!isSafeUrl($longUrl)) out(['error' => 'bad url'], 400);
        if (mb_strlen($name) > 13) out(['error' => 'name too long'], 400);
        if (preg_match('/\s/', $name)) out(['error' => 'spaces not allowed'], 400);

        $exists = $pdo->prepare("SELECT 1 FROM links WHERE lower(name) = lower(?)");

        if ($name === '') {                       // no custom name: make a random one
            do {
                $name = 'link' . random_int(0, 9999);
                $exists->execute([$name]);
            } while ($exists->fetch());
        }

        try {
            // RETURNING id replaces lastInsertId() (which needs a sequence name in PostgreSQL)
            $stmt = $pdo->prepare("INSERT INTO links (owner, name, long_url) VALUES (?, ?, ?) RETURNING id");
            $stmt->execute([$me, $name, $longUrl]);
            $newId = (int)$stmt->fetchColumn();
        } catch (PDOException $e) {
            if (isDuplicate($e)) {
                logAction("CREATE  user=$me  name=$name  FAILED (name taken)");
                out(['error' => 'taken'], 409);  // custom name already used
            }
            throw $e;
        }

        logAction("CREATE  user=$me  name=$name  url=$longUrl");
        out([
            'id'      => $newId,
            'name'    => $name,
            'longUrl' => $longUrl,
            'clicks'  => 0,
        ]);

    case 'click':
        $me = requireLogin();
        $id = (int)($in['id'] ?? 0);
        $stmt = $pdo->prepare("UPDATE links SET clicks = clicks + 1 WHERE id = ? AND owner = ? RETURNING clicks, name");
        $stmt->execute([$id, $me]);
        $row = $stmt->fetch();
        if (!$row) out(['error' => 'not found'], 404);

        logAction("COPY/CLICK  user=$me  name={$row['name']}  clicks={$row['clicks']}");
        out(['clicks' => (int)$row['clicks']]);

    case 'delete':
        $me  = requireLogin();
        $ids = array_values(array_filter(array_map('intval', $in['ids'] ?? [])));
        if (!$ids) out(['ok' => true]);

        $marks = implode(',', array_fill(0, count($ids), '?'));
        $stmt  = $pdo->prepare("DELETE FROM links WHERE owner = ? AND id IN ($marks)");
        $stmt->execute(array_merge([$me], $ids));
        logAction("DELETE  user=$me  removed=" . $stmt->rowCount() . " link(s)");
        out(['ok' => true]);

    default:
        out(['error' => 'unknown action'], 400);
}