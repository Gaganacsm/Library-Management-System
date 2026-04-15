/* ══════════════════════════════════════════════════════════════
   Litesty — Library Management System
   script.js
   ══════════════════════════════════════════════════════════════ */

const API = 'http://localhost:5000/api';

/* ── State ────────────────────────────────────────────────── */
let allBooks   = [];
let allMembers = [];
let allTxns    = [];
let activeGenre = '';

/* ── Navigation ───────────────────────────────────────────── */
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const page = item.dataset.page;

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');

    document.getElementById('page-title').textContent =
      item.querySelector('span:last-of-type').textContent.trim();

    loadPage(page);
  });
});

function loadPage(p) {
  if      (p === 'dashboard')    loadDashboard();
  else if (p === 'books')        loadBooks();
  else if (p === 'members')      loadMembers();
  else if (p === 'transactions') loadTransactions();
  else if (p === 'issue')        loadIssueSelects();
  else if (p === 'return')       loadReturnList();
}

/* ── Dashboard ────────────────────────────────────────────── */
async function loadDashboard() {
  const [stats, txns, books] = await Promise.all([
    apiFetch('/stats'),
    apiFetch('/transactions'),
    apiFetch('/books')
  ]);

  if (stats) {
    set('stat-books',   stats.total_books);
    set('stat-members', stats.total_members);
    set('stat-loans',   stats.active_loans);
    set('stat-overdue', stats.overdue);

    const badge = document.getElementById('overdue-badge');
    if (stats.overdue > 0) {
      badge.textContent = stats.overdue;
      badge.classList.add('show');
    } else {
      badge.classList.remove('show');
    }
  }

  if (txns) {
    const recent = txns.slice(0, 6);
    const html = recent.length
      ? `<div class="tbl-wrap"><table>
          <thead><tr>
            <th>Book</th><th>Member</th><th>Status</th><th>Fine</th>
          </tr></thead>
          <tbody>${recent.map(t => `<tr>
            <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.book_title}</td>
            <td>${t.member_name}</td>
            <td>${makeBadge(t.status)}</td>
            <td>${t.fine > 0 ? '₹' + t.fine.toFixed(0) : '-'}</td>
          </tr>`).join('')}</tbody>
        </table></div>`
      : `<div class="empty-state">
           <div class="es-icon">📭</div><p>No transactions yet</p>
         </div>`;
    document.getElementById('dash-transactions').innerHTML = html;
  }

  if (books) {
    const low = books.filter(b => b.avail_qty === 0 || b.avail_qty <= 1);
    document.getElementById('dash-lowstock').innerHTML = low.length
      ? `<div class="tbl-wrap"><table>
          <thead><tr><th>Book</th><th>Available</th><th>Total</th></tr></thead>
          <tbody>${low.map(b => `<tr>
            <td>${b.title}</td>
            <td>${availBadge(b.avail_qty)}</td>
            <td>${b.total_qty}</td>
          </tr>`).join('')}</tbody>
        </table></div>`
      : `<div class="empty-state">
           <div class="es-icon">✅</div><p>All books well-stocked</p>
         </div>`;
  }
}

/* ── Books ────────────────────────────────────────────────── */
async function loadBooks(q = '') {
  let url = q
    ? `/books?q=${encodeURIComponent(q)}`
    : '/books' + (activeGenre ? `?genre=${activeGenre}` : '');

  const books = await apiFetch(url);
  if (!books) return;

  allBooks = books;
  const genres = [...new Set(allBooks.map(b => b.genre).filter(Boolean))];
  renderGenreFilters(genres);
  renderBooks(books);
}

function renderGenreFilters(genres) {
  const wrap = document.getElementById('book-filters');
  wrap.innerHTML =
    `<button class="filter-btn${activeGenre === '' ? ' active' : ''}" data-genre="">All Genres</button>` +
    genres.map(g =>
      `<button class="filter-btn${activeGenre === g ? ' active' : ''}" data-genre="${g}">${g}</button>`
    ).join('');

  wrap.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeGenre = btn.dataset.genre;
      wrap.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadBooks();
    });
  });
}

function renderBooks(books) {
  const c = document.getElementById('books-container');
  if (!books.length) {
    c.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="es-icon">📭</div><h3>No books found</h3>
    </div>`;
    return;
  }
  c.innerHTML = books.map(b => `
    <div class="book-card" onclick="showBookDetail(${b.id})">
      <div class="book-cover">
        ${b.cover_url
          ? `<img src="${b.cover_url}" alt="${b.title}" onerror="this.style.display='none'"/>`
          : `<span style="font-size:2.8rem">📖</span>`}
      </div>
      <div class="book-info">
        <h3>${b.title}</h3>
        <div class="author">${b.author}</div>
        ${b.genre ? `<span class="genre-tag">${b.genre}</span>` : ''}
        <div class="book-qty">
          ${availBadge(b.avail_qty)}
          <span style="font-size:.75rem;color:#9a8f80;font-family:var(--font-mono)">${b.avail_qty}/${b.total_qty}</span>
        </div>
      </div>
    </div>`).join('');
}

function showBookDetail(id) {
  const b = allBooks.find(x => x.id === id);
  if (!b) return;

  document.getElementById('bd-title').textContent = b.title;
  document.getElementById('bd-body').innerHTML = `
    <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
      ${b.cover_url
        ? `<img src="${b.cover_url}" style="width:100px;height:140px;object-fit:cover;border-radius:8px" onerror="this.remove()"/>`
        : ''}
      <div style="flex:1">
        <p><strong>Author:</strong> ${b.author}</p>
        <p style="margin:.5rem 0"><strong>ISBN:</strong>
          <code style="font-family:var(--font-mono);background:var(--cream);padding:2px 6px;border-radius:4px">${b.isbn}</code>
        </p>
        <p><strong>Genre:</strong> ${b.genre || '—'}</p>
        <p style="margin:.5rem 0"><strong>Copies:</strong> ${b.avail_qty} available / ${b.total_qty} total</p>
      </div>
    </div>`;

  document.getElementById('bd-delete').onclick = () => deleteBook(id);
  openModal('book-detail');
}

async function deleteBook(id) {
  if (!confirm('Delete this book?')) return;
  const r = await apiFetch(`/books/${id}`, { method: 'DELETE' });
  if (r) { toast('Book deleted', 'success'); closeModal('book-detail'); loadBooks(); }
}

/* ── Members ──────────────────────────────────────────────── */
async function loadMembers() {
  const members = await apiFetch('/members');
  if (!members) return;

  allMembers = members;
  const tbody = document.getElementById('members-tbody');

  if (!members.length) {
    tbody.innerHTML = `<tr><td colspan="6"
      style="text-align:center;color:#9a8f80;padding:40px">No members registered</td></tr>`;
    return;
  }

  tbody.innerHTML = members.map(m => `<tr>
    <td><code style="font-family:var(--font-mono);background:var(--cream);padding:2px 8px;border-radius:5px;font-size:.8rem">${m.card_no}</code></td>
    <td><strong>${m.name}</strong></td>
    <td style="color:#7a7060">${m.email}</td>
    <td>${makeBadge('' + m.role)}</td>
    <td style="font-size:.8rem;color:#9a8f80">${formatDate(m.joined_at)}</td>
    <td><button class="btn btn-danger btn-sm" onclick="deleteMember(${m.id})">Delete</button></td>
  </tr>`).join('');
}

async function deleteMember(id) {
  if (!confirm('Delete this member?')) return;
  const r = await apiFetch(`/members/${id}`, { method: 'DELETE' });
  if (r) { toast('Member removed', 'success'); loadMembers(); }
}

/* ── Transactions ─────────────────────────────────────────── */
async function loadTransactions() {
  const txns = await apiFetch('/transactions');
  if (!txns) return;

  allTxns = txns;
  const tbody = document.getElementById('txn-tbody');

  if (!txns.length) {
    tbody.innerHTML = `<tr><td colspan="9"
      style="text-align:center;color:#9a8f80;padding:40px">No transactions yet</td></tr>`;
    return;
  }

  tbody.innerHTML = txns.map(t => `<tr>
    <td style="font-size:.75rem;color:#9a8f80;font-family:var(--font-mono)">#${t.id}</td>
    <td><span title="${t.book_title}"
      style="max-width:160px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.book_title}</span></td>
    <td>${t.member_name}</td>
    <td style="font-size:.8rem">${formatDate(t.issued_at)}</td>
    <td style="font-size:.8rem">${formatDate(t.due_date)}</td>
    <td style="font-size:.8rem">${t.returned_at ? formatDate(t.returned_at) : '—'}</td>
    <td style="font-weight:600;color:${t.fine > 0 ? '#b94a2c' : '#1a6b3a'}">
      ${t.fine > 0 ? '₹' + t.fine.toFixed(0) : '₹0'}</td>
    <td>${makeBadge(t.status)}</td>
    <td>${!t.returned_at
      ? `<button class="btn btn-sm btn-secondary" onclick="returnTxn(${t.id})">Return</button>`
      : '—'}</td>
  </tr>`).join('');
}

async function returnTxn(id) {
  const r = await apiFetch(`/transactions/${id}/return`, { method: 'POST' });
  if (r) {
    const msg = r.fine > 0 ? `Returned! Fine: ₹${r.fine.toFixed(0)}` : 'Returned successfully';
    toast(msg, r.fine > 0 ? 'info' : 'success');
    loadTransactions();
    loadDashboard();
  }
}

/* ── Issue Book ───────────────────────────────────────────── */
async function loadIssueSelects() {
  const [books, members] = await Promise.all([apiFetch('/books'), apiFetch('/members')]);

  if (books) {
    const sel = document.getElementById('issue-book');
    sel.innerHTML = '<option value="">— choose book —</option>' +
      books
        .filter(b => b.avail_qty > 0)
        .map(b => `<option value="${b.id}">${b.title} (${b.avail_qty} avail)</option>`)
        .join('');
  }

  if (members) {
    const sel = document.getElementById('issue-member');
    sel.innerHTML = '<option value="">— choose member —</option>' +
      members.map(m => `<option value="${m.id}">${m.name} — ${m.card_no}</option>`).join('');
  }
}

async function issueBook() {
  const book_id   = document.getElementById('issue-book').value;
  const member_id = document.getElementById('issue-member').value;
  const days      = parseInt(document.getElementById('issue-days').value) || 14;

  if (!book_id || !member_id) { toast('Select book and member', 'error'); return; }

  const r = await apiFetch('/transactions/issue', {
    method: 'POST',
    body: JSON.stringify({ book_id: +book_id, member_id: +member_id, days })
  });

  if (r) { toast(`Book issued! Due: ${formatDate(r.due_date)}`, 'success'); loadIssueSelects(); }
}

/* ── Return List ──────────────────────────────────────────── */
async function loadReturnList() {
  const txns = await apiFetch('/transactions');
  if (!txns) return;

  const active = txns.filter(t => !t.returned_at);
  const wrap   = document.getElementById('return-list');

  if (!active.length) {
    wrap.innerHTML = `<div class="empty-state">
      <div class="es-icon">✅</div><h3>No active loans</h3>
    </div>`;
    return;
  }

  wrap.innerHTML = `<div class="tbl-wrap"><table>
    <thead><tr>
      <th>Book</th><th>Member</th><th>Due Date</th><th>Fine</th><th>Status</th><th></th>
    </tr></thead>
    <tbody>${active.map(t => `<tr>
      <td><strong>${t.book_title}</strong></td>
      <td>${t.member_name}</td>
      <td style="font-size:.85rem">${formatDate(t.due_date)}</td>
      <td style="color:${t.fine > 0 ? '#b94a2c' : 'inherit'}">
        ${t.fine > 0 ? '₹' + t.fine.toFixed(0) : '₹0'}</td>
      <td>${makeBadge(t.status)}</td>
      <td>
        <button class="btn btn-primary btn-sm"
          onclick="returnTxn(${t.id}); loadReturnList()">Return</button>
      </td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

/* ── Form Submissions ─────────────────────────────────────── */
async function submitAddBook() {
  const d = {
    title:     val('b-title'),
    author:    val('b-author'),
    isbn:      val('b-isbn'),
    genre:     val('b-genre'),
    total_qty: parseInt(val('b-qty')) || 1,
    cover_url: val('b-cover')
  };
  if (!d.title || !d.author || !d.isbn) { toast('Title, Author & ISBN required', 'error'); return; }

  const r = await apiFetch('/books', { method: 'POST', body: JSON.stringify(d) });
  if (r) {
    toast('Book added!', 'success');
    closeModal('add-book');
    loadBooks();
    clearFields('b-title', 'b-author', 'b-isbn', 'b-genre', 'b-cover');
  }
}

async function submitAddMember() {
  const d = { name: val('m-name'), email: val('m-email'), role: val('m-role') };
  if (!d.name || !d.email) { toast('Name and email required', 'error'); return; }

  const r = await apiFetch('/members', { method: 'POST', body: JSON.stringify(d) });
  if (r) {
    toast(`Member registered! Card: ${r.card_no}`, 'success');
    closeModal('add-member');
    loadMembers();
    clearFields('m-name', 'm-email');
  }
}

/* ── Global Search ────────────────────────────────────────── */
document.getElementById('global-search').addEventListener('input', e => {
  const page = document.querySelector('.nav-item.active')?.dataset.page;
  if (page === 'books') loadBooks(e.target.value);
});

/* ── Modals ───────────────────────────────────────────────── */
function openModal(name)  { document.getElementById('modal-' + name).classList.add('open'); }
function closeModal(name) { document.getElementById('modal-' + name).classList.remove('open'); }

document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
});

/* ── API Helper ───────────────────────────────────────────── */
async function apiFetch(path, opts = {}) {
  try {
    const res = await fetch(API + path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts
    });
    if (!res.ok) {
      const e = await res.json();
      toast(e.error || 'Request failed', 'error');
      return null;
    }
    return res.json();
  } catch (e) {
    toast('Cannot reach server. Is Flask running?', 'error');
    return null;
  }
}

/* ── Toast ────────────────────────────────────────────────── */
function toast(msg, type = 'info') {
  const wrap = document.getElementById('toast');
  const el   = document.createElement('div');
  el.className = `toast-item ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  el.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.opacity   = '0';
    el.style.transform = 'translateX(20px)';
    el.style.transition = 'all .3s';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

/* ── Badge Renderers ──────────────────────────────────────── */
function makeBadge(status) {
  const map = {
    issued:    'badge-issued',
    returned:  'badge-returned',
    overdue:   'badge-overdue',
    admin:     'badge-admin',
    librarian: 'badge-librarian',
    member:    'badge-member'
  };
  return `<span class="badge ${map[status] || 'badge-member'}">${status}</span>`;
}

function availBadge(qty) {
  if (qty === 0) return `<span class="badge badge-none">Unavailable</span>`;
  if (qty <= 1)  return `<span class="badge badge-low">Low Stock</span>`;
  return `<span class="badge badge-avail">Available</span>`;
}

/* ── Utility Helpers ──────────────────────────────────────── */
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

function val(id)   { return document.getElementById(id)?.value?.trim() || ''; }
function set(id,v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function clearFields(...ids) { ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); }

/* ── Init ─────────────────────────────────────────────────── */
loadDashboard();
