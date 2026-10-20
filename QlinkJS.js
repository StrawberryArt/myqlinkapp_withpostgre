/* ---------- Talking to the server (api.php) ---------- */
async function api(action, data) {
  try {
    const res = await fetch('api.php?action=' + action, {
      method: data ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined,
    });
    let body = {};
    try {
      body = await res.json();
    } catch {
      body = { error: 'PHP error - open api.php in the browser tab to see it' };
    }
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: { error: 'cannot reach the server' } };
  }
}

// Short text for error popups, e.g. "bad url (status 400)"
const reason = (r) => (r.body.error || 'unknown') + ' (status ' + r.status + ')';

// The logged-in user's links, loaded once per page. The server only sends YOUR links.
let linksCache = [];
const myLinks = () => linksCache;

async function loadLinks() {
  const r = await api('list');
  if (r.status === 401) {
    window.location.replace('Qlinkhtml.html'); // session expired
    return;
  }
  linksCache = r.ok ? r.body : [];
}

/* ---------- Small helpers ---------- */

// Builds an element without innerHTML, so user input can never inject code
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

function isSafeUrl(text) {
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const shortText = (link) => 'qlink.app/' + link.name;

// The REAL link that gets copied, e.g. http://localhost/qlink/wiki
// .htaccess passes it to go.php, which sends the visitor to the long URL.
// (qlink.app is only the nice-looking label; it is not a real website.)
const shareUrl = (name) => new URL(encodeURIComponent(name), window.location.href).href;

// Copies text, then calls onDone() so the caller can show "Copied!"
function copyText(text, onDone) {
  navigator.clipboard
    .writeText(text)
    .then(onDone)
    .catch(() => alert('Could not copy. Please copy it manually.'));
}

function emptyRow(columns) {
  const td = el('td', { colspan: columns }, 'No links yet');
  td.style.color = '#9a9a9a';
  return el('tr', {}, td);
}

function longUrlCell(link) {
  // Full URL is stored; CSS (text-overflow) does the "..." shortening
  const span = el('span', { class: 'long-url', title: link.longUrl }, link.longUrl);
  return el('td', { class: 'cell-long-url' }, span);
}

// Clicking a short link COPIES it (it does not open the site) and counts as a click
function shortLinkAnchor(link, clicksCell, cell) {
  const a = el('a', { class: 'short-url', href: '#' }, shortText(link));
  a.addEventListener('click', (e) => {
    e.preventDefault();
    copyText(shareUrl(link.name), () => {
      const flag = el('span', { class: 'copied-flag show' }, 'Copied!');
      cell.append(flag);
      setTimeout(() => flag.remove(), 1200);

      api('click', { id: link.id }).then((r) => {
        if (!r.ok) return;
        link.clicks = r.body.clicks;
        clicksCell.textContent = link.clicks;
      });
    });
  });
  return a;
}

async function deleteLinks(ids) {
  const r = await api('delete', { ids });
  if (!r.ok) {
    alert('Could not delete: ' + reason(r));
    return;
  }
  linksCache = linksCache.filter((l) => !ids.includes(l.id));
}

// Custom confirm popup (matches the Figma design). Calls onYes() only if "Yes" is clicked.
function confirmDelete(onYes) {
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };

  const noBtn = el('button', { class: 'modal-btn', type: 'button' }, 'No');
  const yesBtn = el('button', { class: 'modal-btn', type: 'button' }, 'Yes');
  const card = el(
    'div',
    { class: 'modal-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' },
    el('h2', { id: 'modal-title' }, 'Are you sure you want to delete link permanently?'),
    el('div', { class: 'modal-actions' }, noBtn, yesBtn)
  );
  const overlay = el('div', { class: 'modal-overlay' }, card);

  noBtn.addEventListener('click', close);
  yesBtn.addEventListener('click', () => {
    close();
    onYes();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close(); // click outside the card = cancel
  });
  document.addEventListener('keydown', onKey);

  document.body.append(overlay);
  noBtn.focus(); // safest default for a destructive action
}

/* =====================================================
   LOGIN + REGISTER PAGE
   ===================================================== */
function initLogin() {
  const container = document.querySelector('.loginpg-container');
  const loginForm = document.getElementById('user-form');
  const registerForm = document.getElementById('register-form');
  const pgTitle = document.getElementById('pg-title');
  const errorMsg = document.getElementById('error-message');
  const successMsg = document.getElementById('success-message');
  const usernameError = document.getElementById('username-error');
  const confirmError = document.getElementById('confirm-error');

  const setMismatch = (on) => confirmError && confirmError.classList.toggle('active', on);
  const setTaken = (on) => usernameError && usernameError.classList.toggle('active', on); 

  function showForm(mode) {
    const toRegister = mode === 'register';
    loginForm.classList.toggle('active-form', !toRegister);
    loginForm.classList.toggle('hidden-form', toRegister);
    registerForm.classList.toggle('active-form', toRegister);
    registerForm.classList.toggle('hidden-form', !toRegister);
    container.classList.toggle('register-mode', toRegister);
    pgTitle.textContent = toRegister ? 'Register' : 'Login';
    errorMsg.classList.remove('active');
    successMsg.classList.remove('active');
    setMismatch(false);
     setTaken(false);
  }

  document.querySelector('#to-register a').addEventListener('click', (e) => {
    e.preventDefault();
    showForm('register');
  });

  document.querySelector('#to-login a').addEventListener('click', (e) => {
    e.preventDefault();
    showForm('login');
  });

  registerForm.username.addEventListener('input', () => setTaken(false));
  registerForm.password.addEventListener('input', () => setMismatch(false));
  registerForm.confirm_password.addEventListener('input', () => setMismatch(false));

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = registerForm.username.value.trim().toLowerCase();
    const pass = registerForm.password.value;

    setTaken(false);
    const mismatch = pass !== registerForm.confirm_password.value;
    setMismatch(mismatch);
    if (mismatch) return;

    const r = await api('register', { username: name, password: pass });
    if (r.status === 409) {
      setTaken(true);
      return;
    }
    if (!r.ok) {
      alert('Could not register: ' + reason(r));
      return;
    }

    registerForm.reset();
    showForm('login');
    successMsg.classList.add('active'); 
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = loginForm.username.value.trim().toLowerCase();
    successMsg.classList.remove('active');
    const r = await api('login', { username: name, password: loginForm.password.value });

    if (r.ok) {
      errorMsg.classList.remove('active');
      window.location.href = 'QlinkDB.html';
    } else {
      errorMsg.classList.add('active');
    }
  });

  // Password eye toggles
  document.querySelectorAll('.eye-icon').forEach((icon) => {
    icon.addEventListener('click', () => {
      const input = icon.previousElementSibling;
      input.type = input.type === 'password' ? 'text' : 'password';
      icon.src = input.type === 'password' ? 'images/eye closed.png' : 'images/eye open.png';
    });
  });
}

/* =====================================================
   DASHBOARD PAGE
   ===================================================== */
function initDashboard() {
  const RECENT = 3; // how many recent links to show
  const MAX_NAME = 13;

  const form = document.querySelector('.input-container');
  const urlInput = form.querySelector('[name="shortlinkinput"]');
  const nameInput = form.querySelector('[name="custominput"]');
  const limitNote = document.getElementById('limit-note');
  const tbody = document.querySelector('.links-table tbody');

  let resultText = ''; // the short link currently shown in the second box

  /* ----- second box: shows the new short link, one click copies it ----- */
  function showResult(text) {
    resultText = text;
    nameInput.value = text;
    nameInput.readOnly = true;
  }

  function clearResult() {
    if (!resultText) return;
    resultText = '';
    nameInput.value = '';
    nameInput.readOnly = false;
  }

  nameInput.addEventListener('click', () => {
    if (!resultText) return;
    const shown = resultText;
    copyText(shareUrl(shown.replace(/^qlink\.app\//, '')), () => {
      nameInput.value = 'Copied!';
      setTimeout(() => {
        if (resultText === shown) nameInput.value = shown;
      }, 1200);
    });
  });

  // Starting a new link resets the second box back to a normal input
  urlInput.addEventListener('input', clearResult);

  // Spaces are not allowed in the custom name: remove them and show the red prompt
  nameInput.addEventListener('input', () => {
    if (/\s/.test(nameInput.value)) {
      nameInput.value = nameInput.value.replace(/\s/g, '');
      limitNote.textContent = 'spaces not allowed**';
      limitNote.classList.add('active');
    } else {
      limitNote.classList.remove('active');
    }
  });

  /* ----- table ----- */
  function row(link) {
    const clicksCell = el('td', {}, String(link.clicks));
    const linkCell = el('td', { class: 'cell-link' });
    linkCell.append(shortLinkAnchor(link, clicksCell, linkCell));

    // Long URL starts hidden ("----"); the eye button reveals it
    const urlCell = longUrlCell(link);
    const urlText = urlCell.querySelector('.long-url');
    urlText.removeAttribute('title'); // tooltip would leak the hidden URL
    urlText.textContent = '----';

    const eye = el('img', { src: 'images/eye closegrey.png', alt: 'Show full URL' });
    const viewBtn = el(
      'button',
      { class: 'view-btn', type: 'button', 'aria-label': 'Show full URL' },
      eye
    );

    viewBtn.addEventListener('click', () => {
      const isHidden = urlText.textContent === '----';

      if (isHidden) {
        urlText.textContent = link.longUrl;
        urlText.setAttribute('title', link.longUrl);
        eye.src = 'images/eye opengrey.png';
        eye.alt = 'Hide full URL';
      } else {
        urlText.textContent = '----';
        urlText.removeAttribute('title');
        eye.src = 'images/eye closegrey.png';
        eye.alt = 'Show full URL';
      }
      viewBtn.setAttribute('aria-label', eye.alt);
    });

    const binImg = el('img', { src: 'images/red bin.png', alt: 'Delete link' });
    const delBtn = el(
      'button',
      { class: 'delete-btn', type: 'button', 'aria-label': 'Delete link' },
      binImg
    );

    delBtn.addEventListener('click', () => {
      confirmDelete(async () => {
        await deleteLinks([link.id]);
        render();
      });
    });

    return el(
      'tr',
      {},
      linkCell,
      urlCell,
      clicksCell,
      el('td', {}, viewBtn),
      el('td', {}, delBtn)
    );
  }

  // Invisible row with the same structure as a real one, so the table keeps its height
  function ghostRow() {
    const tr = row({ id: -1, name: '', longUrl: '', clicks: 0 });
    tr.style.visibility = 'hidden';
    return tr;
  }

  function render() {
    const rows = myLinks().slice(0, RECENT).map(row);
    while (rows.length < RECENT) rows.push(ghostRow());
    tbody.replaceChildren(...rows);
  }

  /* ----- Shorten button ----- */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // If the second box still holds the last result, treat it as empty
    const longUrl = urlInput.value.trim();
    const name = resultText ? '' : nameInput.value.trim();

    if (!isSafeUrl(longUrl)) {
      alert('Please paste a full link starting with http:// or https://');
      return;
    }

    // 14+ characters: red "13 limit**" shows ONLY when the button is hit
    if (name.length > MAX_NAME) {
      limitNote.textContent = '13 limit**';
      limitNote.classList.add('active');
      return;
    }
    limitNote.classList.remove('active');

    // The server checks the name is free (or makes a random one) and saves it
    const r = await api('create', { name, longUrl });
  if (r.status === 409) {
  limitNote.textContent = 'Name already taken, please choose another**';
  limitNote.classList.add('active');
  return;
}
    if (!r.ok) {
      alert('Could not create the link: ' + reason(r));
      return;
    }

    linksCache.unshift(r.body);
    form.reset();
    showResult(shortText(r.body)); // short link appears in the second box
    render();
  });

  render();
}

/* =====================================================
   MY LINKS PAGE
   ===================================================== */
function initMyLinks() {
  const PER_PAGE = 7; // rows per page (matches the Figma wireframe)

  const tbody = document.getElementById('mylinks-body');
  const prevBtn = document.getElementById('page-prev');
  const nextBtn = document.getElementById('page-next');
  const copyBtn = document.getElementById('copy-selected');
  const viewBtn = document.getElementById('view-selected');
  const delBtn = document.getElementById('delete-selected');
  const eyeOpen = viewBtn.querySelector('.eye-open');
  const eyeOff = viewBtn.querySelector('.eye-off');

  let page = 0;
  const selected = new Set(); // ids ticked on the current page
  const revealed = new Set(); // ids whose long URL is shown

  const pageLinks = () => myLinks().slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  function updateEye() {
    const shown = selected.size > 0 && [...selected].every((id) => revealed.has(id));
    eyeOpen.style.display = shown ? 'none' : '';
    eyeOff.style.display = shown ? '' : 'none';
  }
  function row(link) {
    const clicksCell = el('td', {}, String(link.clicks));
    const linkCell = el('td', { class: 'cell-link' });
    linkCell.append(shortLinkAnchor(link, clicksCell, linkCell));

    // Long URL is hidden ("---") until revealed with the eye button
    const urlCell = longUrlCell(link);
    const urlText = urlCell.querySelector('.long-url');
    if (!revealed.has(link.id)) {
      urlText.removeAttribute('title'); // tooltip would leak the hidden URL
      urlText.textContent = '----';
    }

    const box = el('input', {
      type: 'checkbox',
      class: 'row-checkbox',
      'aria-label': 'Select ' + shortText(link),
    });
    box.checked = selected.has(link.id);
    box.addEventListener('change', () => {
      if (box.checked) selected.add(link.id);
      else selected.delete(link.id);
       updateEye(); 
    });

    return el('tr', {}, linkCell, urlCell, clicksCell, el('td', {}, box));
  }

  // Invisible row with the same structure as a real one, so the table never changes height
  function ghostRow() {
    const tr = row({ id: -1, name: '', longUrl: '', clicks: 0 });
    tr.style.visibility = 'hidden';
    return tr;
  }

  function render() {
    const pages = Math.max(1, Math.ceil(myLinks().length / PER_PAGE));
    if (page > pages - 1) page = pages - 1;

    const rows = pageLinks().map(row);
    if (rows.length === 0) rows.push(emptyRow(4));
    while (rows.length < PER_PAGE) rows.push(ghostRow()); // keeps the table the same height
    tbody.replaceChildren(...rows);

    prevBtn.disabled = page === 0;
    nextBtn.disabled = page >= pages - 1;
    updateEye();
  }

  function goToPage(n) {
    page = n;
    selected.clear(); // selection never carries over to links you can't see
    render();
  }

  prevBtn.addEventListener('click', () => goToPage(page - 1));
  nextBtn.addEventListener('click', () => goToPage(page + 1));

  // Small floating label above a footer button (e.g. "Copied!")
  function flash(btn, text) {
    btn.dataset.tip = text;
    btn.classList.add('tip');
    setTimeout(() => btn.classList.remove('tip'), 1200);
  }

  // The three buttons stay clickable, but do nothing at all unless something is ticked
  function hasSelection() {
    return selected.size > 0;
  }

  // Copy every ticked short link (one per line)
  copyBtn.addEventListener('click', () => {
    if (!hasSelection(copyBtn)) return;
    const text = myLinks()
      .filter((l) => selected.has(l.id))
      .map((l) => shareUrl(l.name))
      .join('\n');
    copyText(text, () => flash(copyBtn, 'Copied!'));
  });

  // Show the long URLs of ticked rows; if they are all shown already, hide them again
  viewBtn.addEventListener('click', () => {
    if (!hasSelection(viewBtn)) return;
    const ids = [...selected];
    const allShown = ids.every((id) => revealed.has(id));
    ids.forEach((id) => (allShown ? revealed.delete(id) : revealed.add(id)));
    render();
  });

  delBtn.addEventListener('click', () => {
    if (!hasSelection(delBtn)) return;
    confirmDelete(async () => {
      await deleteLinks([...selected]);
      selected.clear();
      render();
    });
  });

  render();
}

document.addEventListener('DOMContentLoaded', async () => {
  if (document.querySelector('.loginpg-container')) {
    initLogin();
    return;
  }

  // Login check happens in PHP (top of each page). Here we just load this user's links.
  await loadLinks();

  if (document.querySelector('.shortener-card')) initDashboard();
  if (document.getElementById('mylinks-body')) initMyLinks();
});