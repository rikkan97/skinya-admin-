/* ====================================================================
   CUSTOMERS.JS — Customers list + search
   ==================================================================== */

let _customersCache = [];
// Σύνολα παραγγελιών ανά email (lowercased) → { count, total }.
// Μετράμε με ΕΜΑΙΛ (όχι με customer_id) ώστε να πιάνουμε και τις guest παραγγελίες
// (customer_id = null) που ανήκουν στο ίδιο email με τον λογαριασμό.
let _ordersByEmail = {};
// Newsletter-only subscribers (πίνακας newsletter_subscribers) — emails χωρίς account.
// Αυτοί προστίθενται ως «synthetic» rows στο tab «Newsletter μόνο».
let _newsletterOnlyCache = [];
// Ενεργό tab: 'all' | 'buyers' | 'newsletter-only'.
let _customersTab = 'all';

async function loadCustomers(){
  const tbody = document.querySelector('#customersTable tbody');
  if(!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" class="empty-row">Φόρτωση…</td></tr>';

  try {
    const [custRes, ordersRes, newsRes] = await Promise.all([
      window.sb
        .from('customers')
        .select('id, email, first_name, last_name, phone, role, newsletter, created_at')
        .order('created_at', { ascending: false }),
      window.sb
        .from('orders')
        .select('customer_email, total, status'),
      window.sb
        .from('newsletter_subscribers')
        .select('email, source, subscribed_at, unsubscribed_at')
        .is('unsubscribed_at', null)
        .order('subscribed_at', { ascending: false })
    ]);

    if(custRes.error) throw custRes.error;
    if(ordersRes.error) console.warn('[Skinya Admin] loadCustomers orders error:', ordersRes.error);
    if(newsRes.error) console.warn('[Skinya Admin] newsletter_subscribers error:', newsRes.error);

    // Aggregate παραγγελιών ανά email — εξαιρούμε cancelled/refunded (όπως πριν)
    _ordersByEmail = {};
    for(const o of (ordersRes.data || [])){
      if(o.status === 'cancelled' || o.status === 'refunded') continue;
      const key = (o.customer_email || '').trim().toLowerCase();
      if(!key) continue;
      const agg = _ordersByEmail[key] || (_ordersByEmail[key] = { count:0, total:0 });
      agg.count++;
      agg.total += Number(o.total || 0);
    }

    _customersCache = custRes.data || [];

    // Newsletter-only: από το newsletter_subscribers, κρατάμε όσους ΔΕΝ έχουν customer row
    // (αλλιώς θα ήταν διπλοεγγραφές στη λίστα).
    const customerEmails = new Set(_customersCache.map(c => (c.email || '').trim().toLowerCase()));
    _newsletterOnlyCache = (newsRes.data || [])
      .filter(s => s.email && !customerEmails.has(s.email.trim().toLowerCase()))
      .map(s => ({
        id: 'newsletter:' + s.email,
        email: s.email,
        first_name: null,
        last_name: null,
        phone: null,
        role: 'customer',
        newsletter: true,
        created_at: s.subscribed_at,
        _newsletterOnly: true,            // flag για render
        _source: s.source || 'homepage'
      }));

    renderCustomers(_customersCache, document.getElementById('customersSearch')?.value || '');
  } catch(err){
    console.error('[Skinya Admin] loadCustomers error:', err);
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">Σφάλμα φόρτωσης</td></tr>';
  }
}

function ordersCountFor(c){
  return (_ordersByEmail[(c.email || '').trim().toLowerCase()] || { count:0 }).count;
}

function updateCustomersTabCounts(list){
  let buyers = 0, custNewsletterNoOrders = 0;
  for(const c of list){
    const n = ordersCountFor(c);
    if(n > 0) buyers++;
    if(c.newsletter && n === 0) custNewsletterNoOrders++;
  }
  // Newsletter μόνο = εγγραφές χωρίς account + customers με newsletter αλλά καμία παραγγελία
  const newsletterOnly = custNewsletterNoOrders + _newsletterOnlyCache.length;
  const all = list.length + _newsletterOnlyCache.length;
  const elAll = document.getElementById('custCountAll');
  const elBuy = document.getElementById('custCountBuyers');
  const elNew = document.getElementById('custCountNewsletter');
  if(elAll) elAll.textContent = all;
  if(elBuy) elBuy.textContent = buyers;
  if(elNew) elNew.textContent = newsletterOnly;
}

function renderCustomers(list, query){
  const tbody = document.querySelector('#customersTable tbody');
  if(!tbody) return;

  updateCustomersTabCounts(list);

  // Newsletter-only synthetics: φαίνονται στο tab "Όλοι" και στο "Newsletter μόνο"
  const withSynthetics = (_customersTab === 'buyers')
    ? list
    : list.concat(_newsletterOnlyCache);

  const tabFiltered = withSynthetics.filter(c => {
    if(_customersTab === 'all') return true;
    const n = ordersCountFor(c);
    if(_customersTab === 'buyers') return n > 0;
    if(_customersTab === 'newsletter-only') return c.newsletter && n === 0;
    return true;
  });

  const q = (query || '').trim().toLowerCase();
  const filtered = q
    ? tabFiltered.filter(c => {
        const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ').toLowerCase();
        return (
          (c.email || '').toLowerCase().includes(q) ||
          fullName.includes(q) ||
          (c.phone || '').toLowerCase().includes(q)
        );
      })
    : tabFiltered;

  if(filtered.length === 0){
    const emptyMsg = q
      ? 'Κανένα αποτέλεσμα'
      : (_customersTab === 'newsletter-only' ? 'Κανείς εγγεγραμμένος μόνο σε newsletter'
         : _customersTab === 'buyers' ? 'Κανείς πελάτης με παραγγελία'
         : 'Κανένας πελάτης');
    tbody.innerHTML = `<tr><td colspan="8" class="empty-row">${emptyMsg}</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(c => {
    const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ') || '—';
    const agg = _ordersByEmail[(c.email || '').trim().toLowerCase()] || { count:0, total:0 };
    const ordersCount = agg.count;
    const ordersTotal = agg.total;
    const roleCell = c._newsletterOnly
      ? '<span class="muted" title="Εγγραφή μόνο σε newsletter, χωρίς account">newsletter</span>'
      : (c.role === 'admin' ? '<span class="status-badge status-paid">admin</span>' : '<span class="muted">customer</span>');
    return `
      <tr>
        <td><strong>${escapeHTML(c.email)}</strong></td>
        <td>${escapeHTML(fullName)}</td>
        <td class="muted">${escapeHTML(c.phone || '—')}</td>
        <td>${roleCell}</td>
        <td class="${c.newsletter ? 'bool-yes' : 'bool-no'}">${c.newsletter ? '✓' : '○'}</td>
        <td>${ordersCount}</td>
        <td>${fmtMoney(ordersTotal)}</td>
        <td class="muted">${fmtDate(c.created_at)}</td>
      </tr>
    `;
  }).join('');
}

// Wire up search input (debounced) + tab buttons (All / Buyers / Newsletter-only)
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('customersSearch');
  if(input){
    let t;
    input.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => renderCustomers(_customersCache, input.value), 120);
    });
  }

  const tabs = document.getElementById('customersTabs');
  if(tabs){
    tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cust-tab]');
      if(!btn) return;
      _customersTab = btn.dataset.custTab;
      tabs.querySelectorAll('[data-cust-tab]').forEach(b => {
        const on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      renderCustomers(_customersCache, document.getElementById('customersSearch')?.value || '');
    });
  }
});
