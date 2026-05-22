/* ====================================================================
   CUSTOMERS.JS — Customers list + search
   ==================================================================== */

let _customersCache = [];
// Σύνολα παραγγελιών ανά email (lowercased) → { count, total }.
// Μετράμε με ΕΜΑΙΛ (όχι με customer_id) ώστε να πιάνουμε και τις guest παραγγελίες
// (customer_id = null) που ανήκουν στο ίδιο email με τον λογαριασμό.
let _ordersByEmail = {};

async function loadCustomers(){
  const tbody = document.querySelector('#customersTable tbody');
  if(!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" class="empty-row">Φόρτωση…</td></tr>';

  try {
    const [custRes, ordersRes] = await Promise.all([
      window.sb
        .from('customers')
        .select('id, email, first_name, last_name, phone, role, newsletter, created_at')
        .order('created_at', { ascending: false }),
      window.sb
        .from('orders')
        .select('customer_email, total, status')
    ]);

    if(custRes.error) throw custRes.error;
    if(ordersRes.error) console.warn('[Skinya Admin] loadCustomers orders error:', ordersRes.error);

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
    renderCustomers(_customersCache, document.getElementById('customersSearch')?.value || '');
  } catch(err){
    console.error('[Skinya Admin] loadCustomers error:', err);
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">Σφάλμα φόρτωσης</td></tr>';
  }
}

function renderCustomers(list, query){
  const tbody = document.querySelector('#customersTable tbody');
  if(!tbody) return;

  const q = (query || '').trim().toLowerCase();
  const filtered = q
    ? list.filter(c => {
        const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ').toLowerCase();
        return (
          (c.email || '').toLowerCase().includes(q) ||
          fullName.includes(q) ||
          (c.phone || '').toLowerCase().includes(q)
        );
      })
    : list;

  if(filtered.length === 0){
    tbody.innerHTML = `<tr><td colspan="8" class="empty-row">${q ? 'Κανένα αποτέλεσμα' : 'Κανένας πελάτης'}</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(c => {
    const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ') || '—';
    const agg = _ordersByEmail[(c.email || '').trim().toLowerCase()] || { count:0, total:0 };
    const ordersCount = agg.count;
    const ordersTotal = agg.total;
    return `
      <tr>
        <td><strong>${escapeHTML(c.email)}</strong></td>
        <td>${escapeHTML(fullName)}</td>
        <td class="muted">${escapeHTML(c.phone || '—')}</td>
        <td>${c.role === 'admin' ? '<span class="status-badge status-paid">admin</span>' : '<span class="muted">customer</span>'}</td>
        <td class="${c.newsletter ? 'bool-yes' : 'bool-no'}">${c.newsletter ? '✓' : '○'}</td>
        <td>${ordersCount}</td>
        <td>${fmtMoney(ordersTotal)}</td>
        <td class="muted">${fmtDate(c.created_at)}</td>
      </tr>
    `;
  }).join('');
}

// Wire up search input (debounced)
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('customersSearch');
  if(!input) return;
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => renderCustomers(_customersCache, input.value), 120);
  });
});
