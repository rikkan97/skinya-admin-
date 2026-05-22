/* ====================================================================
   ORDERS.JS — Orders list + details modal + status updates
   ==================================================================== */

// Τα statuses που χρησιμοποιεί το admin (ροή: Εκκρεμεί → Απεστάλη → Ολοκληρωμένη,
// + Ακυρώθηκε). Το 'delivered' = «Ολοκληρωμένη» (υπάρχει ήδη στο order_status enum,
// μαζί με στήλη delivered_at — δεν χρειάζεται migration). Τα υπόλοιπα legacy
// (paid/processing/refunded) μένουν στο label map ώστε παλιές παραγγελίες να εμφανίζονται σωστά.
const ADMIN_STATUSES = ['pending','shipped','delivered','cancelled'];
const ORDER_STATUS_LABEL = {
  pending:'Εκκρεμεί', shipped:'Απεστάλη', delivered:'Ολοκληρωμένη', cancelled:'Ακυρώθηκε',
  // legacy
  paid:'Πληρωμένη', processing:'Σε επεξεργασία', refunded:'Επιστράφηκε'
};

// Μεταφορικές (το key αποθηκεύεται στο orders.carrier — το edge function το χαρτογραφεί σε tracking URL)
const CARRIERS = [
  { id:'elta_courier',   label:'ELTA Courier' },
  { id:'acs',            label:'ACS' },
  { id:'speedex',        label:'Speedex' },
  { id:'courier_center', label:'Courier Center' },
  { id:'geniki',         label:'Γενική Ταχυδρομική' },
  { id:'boxnow',         label:'BOX NOW' }
];

let _currentOrder = null;  // η παραγγελία που είναι ανοιχτή στο modal

async function loadOrders(){
  const tbody = document.querySelector('#ordersTable tbody');
  if(!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" class="empty-row">Φόρτωση…</td></tr>';

  const statusFilter = document.getElementById('ordersStatusFilter')?.value;

  try {
    let query = window.sb
      .from('orders')
      .select('id, order_number, customer_email, status, total, created_at, is_guest, order_items(quantity)')
      .order('created_at', { ascending: false })
      .limit(100);

    if(statusFilter) query = query.eq('status', statusFilter);

    const { data, error } = await query;
    if(error) throw error;

    if(!data || data.length === 0){
      tbody.innerHTML = '<tr><td colspan="7" class="empty-row">Καμία παραγγελία</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(o => {
      const itemsCount = (o.order_items||[]).reduce((s,i)=>s+i.quantity, 0);
      return `
        <tr>
          <td><strong>${escapeHTML(o.order_number)}</strong></td>
          <td>${escapeHTML(o.customer_email)}${o.is_guest ? ' <span class="guest-tag">Επισκέπτης</span>' : ''}</td>
          <td><span class="status-badge status-${o.status}">${ORDER_STATUS_LABEL[o.status]||o.status}</span></td>
          <td>${itemsCount}</td>
          <td>${fmtMoney(o.total)}</td>
          <td class="muted">${fmtDate(o.created_at)}</td>
          <td class="col-actions">
            <button class="row-btn" onclick="openOrderModal('${o.id}')">Άνοιγμα</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch(err){
    console.error('[Skinya Admin] loadOrders error:', err);
    tbody.innerHTML = '<tr><td colspan="7" class="empty-row">Σφάλμα φόρτωσης</td></tr>';
  }
}

// ──────────────────────────────────────────────────────────────
// Order details modal
// ──────────────────────────────────────────────────────────────
async function openOrderModal(orderId){
  const overlay = document.getElementById('orderModalOverlay');
  const body = document.getElementById('orderModalBody');
  overlay.hidden = false;
  setTimeout(()=>overlay.classList.add('open'), 10);
  body.innerHTML = '<p class="muted">Φόρτωση παραγγελίας…</p>';

  try {
    const { data, error } = await window.sb
      .from('orders')
      .select('*, items:order_items(id, quantity, unit_price, line_total, product_snapshot)')
      .eq('id', orderId)
      .single();

    if(error) throw error;
    renderOrderModal(data);
  } catch(err){
    console.error('[Skinya Admin] openOrderModal error:', err);
    body.innerHTML = '<p class="muted">Σφάλμα φόρτωσης</p>';
  }
}

function closeOrderModal(){
  const overlay = document.getElementById('orderModalOverlay');
  overlay.classList.remove('open');
  setTimeout(()=>overlay.hidden = true, 300);
}

function renderOrderModal(o){
  _currentOrder = o;
  const body = document.getElementById('orderModalBody');
  const addr = o.shipping_address || {};
  const addrLines = [
    [addr.first_name, addr.last_name].filter(Boolean).join(' '),
    addr.phone,
    [addr.line1, addr.line2].filter(Boolean).join(', '),
    [addr.postcode, addr.city, addr.region, addr.country].filter(Boolean).join(' · ')
  ].filter(Boolean).join('\n');

  const itemsHtml = (o.items||[]).map(it => {
    const snap = it.product_snapshot || {};
    return `
      <li>
        <div class="thumb">${snap.img ? `<img src="${escapeHTML(snap.img)}" alt="">` : (snap.brand||'').charAt(0)}</div>
        <div>
          <small style="display:block;color:var(--accent);font-size:.62rem;letter-spacing:.2em;text-transform:uppercase">${escapeHTML(snap.brand||'')}</small>
          <strong style="display:block;color:var(--text);font-family:'Cormorant Garamond',serif;font-size:1.02rem">${escapeHTML(snap.name||'')}</strong>
          <span style="color:var(--text-dim);font-size:.78rem">${it.quantity} × ${fmtMoney(it.unit_price)}</span>
        </div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:1rem;color:var(--text)">${fmtMoney(it.line_total)}</div>
      </li>`;
  }).join('');

  body.innerHTML = `
    <div class="order-modal-head">
      <div>
        <small>Παραγγελία</small>
        <h2>${escapeHTML(o.order_number)}</h2>
        <small style="margin-top:.4rem">${fmtDate(o.created_at, {day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit'})}</small>
      </div>
      <div>
        <small>Κατάσταση</small>
        <select class="status-select" id="statusSelect" onchange="onStatusSelectChange('${o.id}', this.value)">
          ${statusOptions(o.status)}
        </select>
        <button type="button" id="statusSaveBtn" class="btn-primary status-save-btn" onclick="saveStatusChange('${o.id}')" hidden><span>Αποθήκευση</span></button>
      </div>
    </div>

    ${renderShippingBlock(o)}

    <div class="order-meta-grid">
      <div>
        <small>Πελάτης${o.is_guest ? ' · Επισκέπτης' : ''}</small>
        <p>${escapeHTML(o.customer_email)}${o.is_guest ? ' <span class="guest-tag">Επισκέπτης</span>' : ''}</p>
      </div>
      <div>
        <small>Αποστολή</small>
        <p>${escapeHTML(addrLines)}</p>
      </div>
      <div>
        <small>Πληρωμή</small>
        <p>${o.payment_method === 'card' ? 'Κάρτα (Viva)' : 'Τραπεζική κατάθεση'}
           ${o.paid_at
              ? ' <span class="guest-tag" style="background:rgba(76,175,122,0.18);color:var(--success)">Πληρωμένη</span>'
              : ' <span class="guest-tag" style="background:rgba(212,164,92,0.16);color:var(--warn)">Σε αναμονή πληρωμής</span>'}</p>
        ${!o.paid_at ? `<button type="button" class="btn-primary" style="margin-top:.6rem;width:100%" onclick="confirmPayment('${o.id}')"><span>Επιβεβαίωση πληρωμής</span></button>` : ''}
      </div>
      ${o.notes ? `<div style="grid-column:1/-1"><small>Σημειώσεις</small><p>${escapeHTML(o.notes)}</p></div>` : ''}
      ${o.viva_order_code ? `<div><small>Viva ref</small><p>${escapeHTML(o.viva_order_code)}</p></div>` : ''}
    </div>

    <h3 style="margin-bottom:.6rem">Προϊόντα</h3>
    <ul class="order-items-list">${itemsHtml}</ul>

    <div class="order-totals-box">
      <div><span>Υποσύνολο</span><span>${fmtMoney(o.subtotal)}</span></div>
      <div><span>Μεταφορικά</span><span>${fmtMoney(o.shipping)}</span></div>
      ${o.discount > 0 ? `<div><span>Έκπτωση${o.coupon_code ? ` <small style="color:var(--text-dim)">(${escapeHTML(o.coupon_code)})</small>` : ''}</span><span>-${fmtMoney(o.discount)}</span></div>` : ''}
      <div class="grand"><span>Σύνολο</span><span>${fmtMoney(o.total)}</span></div>
    </div>
  `;
}

// Options του status dropdown — τα 3 admin states (+ το τρέχον legacy αν δεν ανήκει σ' αυτά)
function statusOptions(current){
  const set = ADMIN_STATUSES.includes(current) ? ADMIN_STATUSES.slice() : [current, ...ADMIN_STATUSES];
  return set.map(s=>`<option value="${s}" ${s===current?'selected':''}>${ORDER_STATUS_LABEL[s]||s}</option>`).join('');
}

// Πεδία αποστολής — πάντα ορατά. Συμπληρώνεις μεταφορική + tracking και το κουμπί
// κάνει την αποστολή (status → Απεστάλη) + στέλνει το email.
function renderShippingBlock(o){
  const sent = o.shipped_email_sent_at;
  const carrierOpts = CARRIERS.map(c=>`<option value="${c.id}" ${o.carrier===c.id?'selected':''}>${c.label}</option>`).join('');
  return `
    <div id="shippingBlock" class="shipping-block">
      <small class="ship-title">Αποστολή · μεταφορική &amp; tracking</small>
      <div class="adm-form-row">
        <label class="adm-field"><span>Μεταφορική</span>
          <select id="shipCarrier"><option value="">—</option>${carrierOpts}</select>
        </label>
        <label class="adm-field"><span>Tracking number</span>
          <input type="text" id="shipTracking" value="${escapeHTML(o.tracking_number||'')}" placeholder="π.χ. 1234567890">
        </label>
      </div>
      <div class="ship-actions">
        ${sent
          ? `<span class="ship-sent">✓ Email στάλθηκε στις ${fmtDate(sent,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
             <button type="button" class="btn-ghost" onclick="saveShipment('${o.id}', true)">Επαναποστολή email</button>`
          : `<button type="button" class="btn-primary" onclick="saveShipment('${o.id}', false)"><span>Αποθήκευση &amp; αποστολή email</span></button>`}
      </div>
    </div>`;
}

// Επιλογή status από το dropdown — ΔΕΝ εφαρμόζεται αμέσως· σταδιοποιείται.
// Το «Απεστάλη» γίνεται από το (πάντα ορατό) block αποστολής με δικό του κουμπί,
// οπότε εκεί κρύβουμε το γενικό «Αποθήκευση». Για Εκκρεμεί/Ακυρώθηκε εμφανίζεται
// το «Αποθήκευση» μόνο αν όντως άλλαξε από την τρέχουσα κατάσταση.
function onStatusSelectChange(orderId, value){
  const btn = document.getElementById('statusSaveBtn');
  if(btn) btn.hidden = (value === 'shipped' || value === _currentOrder?.status);
}

// Εφαρμογή της επιλεγμένης κατάστασης (με το κουμπί «Αποθήκευση»)
async function saveStatusChange(orderId){
  const value = document.getElementById('statusSelect')?.value;
  if(!value) return;
  await updateOrderStatus(orderId, value);
  openOrderModal(orderId);   // refresh modal με τη νέα κατάσταση
}

// Αποθήκευση μεταφορικής + tracking, set status=shipped, και αποστολή email μέσω edge function
async function saveShipment(orderId, resend){
  const carrier  = document.getElementById('shipCarrier')?.value || '';
  const tracking = (document.getElementById('shipTracking')?.value || '').trim();
  if(!carrier || !tracking){ showToast('Συμπλήρωσε μεταφορική και tracking number'); return; }

  try {
    // 1) Αποθήκευση στοιχείων αποστολής — αυτό είναι το «κυρίως» success.
    const updates = { status:'shipped', carrier, tracking_number: tracking };
    if(!_currentOrder?.shipped_at) updates.shipped_at = new Date().toISOString();
    if(resend) updates.shipped_email_sent_at = null;   // ξεκλείδωσε το dedupe για επαναποστολή

    const { error } = await window.sb.from('orders').update(updates).eq('id', orderId);
    if(error) throw error;
  } catch(err){
    console.error('[Skinya Admin] saveShipment (db) error:', err);
    showToast('Σφάλμα αποθήκευσης: ' + (err.message||''));
    return;
  }

  // 2) Αποστολή email — best-effort. Αν αποτύχει (π.χ. δεν έχει γίνει deploy το
  //    function ή λείπει το Resend key), η αποθήκευση παραμένει επιτυχής.
  let emailOk = false;
  try {
    const { data, error: fnErr } = await window.sb.functions.invoke('send-order-email', {
      body: { type:'shipped', order_id: orderId }
    });
    if(fnErr || data?.error) throw new Error(data?.error || fnErr?.message || 'function error');
    emailOk = true;
  } catch(err){
    console.warn('[Skinya Admin] saveShipment (email) skipped/failed:', err);
  }

  showToast(emailOk ? 'Αποθηκεύτηκε & στάλθηκε ✓' : 'Αποθηκεύτηκε ✓ (το email δεν στάλθηκε)');
  openOrderModal(orderId);   // re-render
  if(document.querySelector('.view[data-view="orders"].is-active')) loadOrders();
  else loadRecentOrders();
}

// Χειροκίνητη επιβεβαίωση πληρωμής (κυρίως για τραπεζική κατάθεση — η κάρτα/Viva
// επιβεβαιώνεται αυτόματα από το webhook). Set paid_at + στέλνει το «paid» email.
async function confirmPayment(orderId){
  if(!confirm('Επιβεβαίωση ότι έχει γίνει η πληρωμή/κατάθεση για αυτή την παραγγελία;')) return;

  try {
    const { error } = await window.sb.from('orders')
      .update({ paid_at: new Date().toISOString() }).eq('id', orderId);
    if(error) throw error;
  } catch(err){
    console.error('[Skinya Admin] confirmPayment (db) error:', err);
    showToast('Σφάλμα: ' + (err.message||''));
    return;
  }

  // Email επιβεβαίωσης πληρωμής — best-effort
  let emailOk = false;
  try {
    const { data, error: fnErr } = await window.sb.functions.invoke('send-order-email', {
      body: { type:'paid', order_id: orderId }
    });
    if(fnErr || data?.error) throw new Error(data?.error || fnErr?.message || 'function error');
    emailOk = true;
  } catch(err){
    console.warn('[Skinya Admin] confirmPayment (email) skipped/failed:', err);
  }

  showToast(emailOk ? 'Πληρωμή επιβεβαιώθηκε & email στάλθηκε ✓' : 'Πληρωμή επιβεβαιώθηκε ✓ (email δεν στάλθηκε)');
  openOrderModal(orderId);
  if(document.querySelector('.view[data-view="orders"].is-active')) loadOrders();
  else loadRecentOrders();
}

async function updateOrderStatus(orderId, newStatus){
  try {
    const updates = { status: newStatus };
    // Timestamp helpers
    if(newStatus === 'paid')      updates.paid_at      = new Date().toISOString();
    if(newStatus === 'shipped')   updates.shipped_at   = new Date().toISOString();
    if(newStatus === 'delivered') updates.delivered_at = new Date().toISOString();

    const { error } = await window.sb.from('orders').update(updates).eq('id', orderId);
    if(error) throw error;

    // Email ακύρωσης (#8) — best-effort
    if(newStatus === 'cancelled'){
      window.sb.functions.invoke('send-order-email', { body:{ type:'cancelled', order_id: orderId } })
        .catch(err => console.warn('[Skinya Admin] cancelled email failed:', err));
    }

    showToast('Η κατάσταση ενημερώθηκε ✓');
    // Reload list για να δείξει τη νέα κατάσταση
    if(document.querySelector('.view[data-view="orders"].is-active')) loadOrders();
    else loadRecentOrders();
  } catch(err){
    console.error('[Skinya Admin] updateOrderStatus error:', err);
    showToast('Σφάλμα ενημέρωσης');
  }
}

// Wire up filter dropdown
document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('ordersStatusFilter')?.addEventListener('change', loadOrders);
});
