/* ====================================================================
   OFFERS.JS — Προσφορές ανά προϊόν (% ή τιμή έκπτωσης) με bulk save
   ──────────────────────────────────────────────────────────────────
   • Default price = κανονική τιμή (από products.default_price)
   • Offer price   = products.price (override). Όταν είναι null → χωρίς προσφορά.
   • % έκπτωση και τιμή έκπτωσης συγχρονίζονται bidirectional.
   ==================================================================== */

async function loadOffers(){
  const wrap = document.getElementById('offersGroups');
  if(!wrap) return;
  wrap.innerHTML = '<p class="empty-row">Φόρτωση…</p>';

  try {
    const [{ data: cats, error: catErr }, { data: prods, error: prodErr }] = await Promise.all([
      window.sb.from('categories').select('id, name, sort_order').order('sort_order'),
      window.sb.from('products')
        .select('id, sku, name, img, price, default_price, category_id, brand:brands(name)')
        .order('sku')
    ]);
    if(catErr) throw catErr;
    if(prodErr) throw prodErr;

    if(!prods || prods.length === 0){
      wrap.innerHTML = '<p class="empty-row">Καμία εγγραφή</p>';
      return;
    }

    const byCat = {};
    prods.forEach(p => {
      const key = p.category_id || '__none';
      (byCat[key] ||= []).push(p);
    });

    const orderedCats = (cats||[]).slice();
    Object.keys(byCat).forEach(k=>{
      if(k === '__none') return;
      if(!orderedCats.find(c=>c.id===k)) orderedCats.push({id:k, name:k});
    });
    if(byCat.__none) orderedCats.push({id:'__none', name:'Χωρίς κατηγορία'});

    const cats2 = orderedCats.filter(c=>byCat[c.id]?.length);
    if(cats2.length === 0){
      wrap.innerHTML = '<p class="empty-row">Καμία εγγραφή</p>';
      return;
    }

    const tabs = cats2.map((cat,i) => `
      <button type="button" class="stock-tab${i===0?' is-active':''}" data-cat="${escapeHTML(cat.id)}">
        ${escapeHTML(cat.name)}
        <span class="stock-count">${byCat[cat.id].length}</span>
      </button>
    `).join('');

    const panels = cats2.map((cat,i) => {
      const items = byCat[cat.id];
      return `
        <div class="stock-panel${i===0?' is-active':''}" data-cat="${escapeHTML(cat.id)}">
          <div class="stock-cat-label">${escapeHTML(cat.name)}</div>
          <div class="data-table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th></th><th>SKU</th><th>Όνομα</th>
                  <th style="width:90px">Τιμή ${fieldTip('Η κανονική τιμή του προϊόντος (default price). Δεν αλλάζει εδώ — ρυθμίζεται στη φόρμα του προϊόντος.', true)}</th>
                  <th style="width:100px">Έκπτωση % ${fieldTip('Γράψε ποσοστό έκπτωσης (0–99). Υπολογίζει αυτόματα την τιμή προσφοράς. Συγχρονίζεται αμφίδρομα με τη διπλανή στήλη.', true)}</th>
                  <th style="width:120px">Τιμή προσφοράς ${fieldTip('Η τελική τιμή με την προσφορά. Συμπλήρωσέ την απευθείας ή άφησε το % να την υπολογίσει. Κενή = χωρίς προσφορά (ισχύει η κανονική τιμή).', true)}</th>
                  <th style="width:1%"></th>
                </tr>
              </thead>
              <tbody>
                ${items.map(p => renderOfferRow(p)).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }).join('');

    wrap.innerHTML = `
      <nav class="stock-tabs">${tabs}</nav>
      <div class="stock-panels">${panels}</div>
    `;

    // Tab switching
    wrap.querySelectorAll('.stock-tab').forEach(btn => {
      btn.addEventListener('click', () => switchOffersTab(btn.dataset.cat));
    });
    // Sync handlers
    wrap.querySelectorAll('.offer-pct').forEach(inp => {
      inp.addEventListener('input', () => onOfferPctChange(inp));
    });
    wrap.querySelectorAll('.offer-price').forEach(inp => {
      inp.addEventListener('input', () => onOfferPriceChange(inp));
    });
    wrap.querySelectorAll('.offer-clear').forEach(btn => {
      btn.addEventListener('click', () => clearOfferRow(btn));
    });
    refreshOffersDirty();
    wireOffersSearch();
    applyOffersSearch();
  } catch(err){
    console.error('[Skinya Admin] loadOffers error:', err);
    wrap.innerHTML = '<p class="empty-row">Σφάλμα φόρτωσης</p>';
  }
}

// Search — cross-category: φιλτράρει γραμμές σε ΟΛΑ τα panels (SKU/όνομα)
function wireOffersSearch(){
  const inp = document.getElementById('offersSearch');
  if(!inp || inp.dataset.wired) return;
  inp.dataset.wired = '1';
  inp.addEventListener('input', applyOffersSearch);
}
function applyOffersSearch(){
  const wrap = document.getElementById('offersGroups');
  if(!wrap) return;
  const q = (document.getElementById('offersSearch')?.value || '').trim().toLowerCase();
  wrap.classList.toggle('is-searching', !!q);

  wrap.querySelectorAll('.stock-panel').forEach(panel => {
    let shown = 0;
    panel.querySelectorAll('tbody tr').forEach(tr => {
      const txt = (tr.querySelector('td:nth-child(2)')?.textContent || '') + ' ' +
                  (tr.querySelector('td:nth-child(3)')?.textContent || '');
      const match = !q || txt.toLowerCase().includes(q);
      tr.style.display = match ? '' : 'none';
      if(match) shown++;
    });
    panel.classList.toggle('no-match', !!q && shown === 0);
  });
}

function renderOfferRow(p){
  const def = Number(p.default_price ?? 0);
  const offer = (p.price != null) ? Number(p.price) : null;
  const pct = (offer != null && def > 0) ? Math.round((1 - offer/def) * 100) : '';
  return `
    <tr data-row="${p.id}" data-default="${def}" data-original-price="${offer ?? ''}">
      <td class="col-thumb"><div class="thumb">${p.img ? `<img src="${escapeHTML(p.img)}" alt="">` : (p.brand?.name||'').charAt(0)}</div></td>
      <td><strong>${escapeHTML(p.sku)}</strong></td>
      <td>${escapeHTML(p.name)}</td>
      <td class="muted">${def ? fmtMoney(def) : '—'}</td>
      <td>
        <div class="offer-input-wrap">
          <input type="number" min="0" max="99" step="1" class="offer-pct" value="${pct}" placeholder="0">
          <span class="offer-suffix">%</span>
        </div>
      </td>
      <td>
        <div class="offer-input-wrap">
          <input type="number" min="0" step="0.01" class="offer-price" value="${offer != null ? offer : ''}" placeholder="${def ? def.toFixed(2) : ''}">
          <span class="offer-suffix">€</span>
        </div>
      </td>
      <td>
        <button type="button" class="row-btn offer-clear" title="Καθαρισμός προσφοράς">✕</button>
      </td>
    </tr>
  `;
}

function switchOffersTab(catId){
  const wrap = document.getElementById('offersGroups');
  wrap.querySelectorAll('.stock-tab').forEach(b => {
    b.classList.toggle('is-active', b.dataset.cat === catId);
  });
  wrap.querySelectorAll('.stock-panel').forEach(p => {
    p.classList.toggle('is-active', p.dataset.cat === catId);
  });
}

function onOfferPctChange(inp){
  const row = inp.closest('tr');
  const def = Number(row.dataset.default);
  const priceInp = row.querySelector('.offer-price');
  let pct = Number(inp.value);
  if(Number.isNaN(pct)) pct = 0;
  pct = Math.max(0, Math.min(99, pct));
  if(inp.value === '' || pct === 0){
    priceInp.value = '';
  } else if(def > 0){
    const newPrice = def * (1 - pct/100);
    priceInp.value = (Math.round(newPrice * 100) / 100).toFixed(2);
  }
  refreshOffersDirty();
}

function onOfferPriceChange(inp){
  const row = inp.closest('tr');
  const def = Number(row.dataset.default);
  const pctInp = row.querySelector('.offer-pct');
  const v = inp.value;
  if(v === ''){
    pctInp.value = '';
  } else {
    const price = Number(v);
    if(!Number.isNaN(price) && def > 0 && price < def){
      pctInp.value = Math.round((1 - price/def) * 100);
    } else {
      pctInp.value = '';
    }
  }
  refreshOffersDirty();
}

function clearOfferRow(btn){
  const row = btn.closest('tr');
  row.querySelector('.offer-pct').value = '';
  row.querySelector('.offer-price').value = '';
  refreshOffersDirty();
}

function refreshOffersDirty(){
  const btn = document.getElementById('offersSaveBtn');
  if(!btn) return;
  let dirty = 0;
  const dirtyByCat = {};
  document.querySelectorAll('[data-row]').forEach(row => {
    if(!row.dataset.default) return;
    const orig = row.dataset.originalPrice === '' ? null : Number(row.dataset.originalPrice);
    const cur  = row.querySelector('.offer-price').value === '' ? null : Number(row.querySelector('.offer-price').value);
    const changed = (orig == null && cur != null) ||
                    (orig != null && cur == null) ||
                    (orig != null && cur != null && Math.abs(orig - cur) > 0.001);
    row.classList.toggle('is-dirty', changed);
    if(changed){
      dirty++;
      const panel = row.closest('.stock-panel');
      if(panel) dirtyByCat[panel.dataset.cat] = (dirtyByCat[panel.dataset.cat]||0)+1;
    }
  });
  document.querySelectorAll('#offersGroups .stock-tab').forEach(t => {
    const n = dirtyByCat[t.dataset.cat] || 0;
    t.classList.toggle('has-dirty', n > 0);
  });
  btn.disabled = dirty === 0;
  const span = btn.querySelector('span');
  if(span) span.textContent = dirty ? `Αποθήκευση (${dirty})` : 'Αποθήκευση';
}

async function saveOffers(){
  const btn = document.getElementById('offersSaveBtn');
  if(!btn || btn.disabled) return;

  const changes = [];
  document.querySelectorAll('[data-row].is-dirty').forEach(row => {
    const id = row.dataset.row;
    const v  = row.querySelector('.offer-price').value;
    const price = v === '' ? null : Number(v);
    if(price != null && (Number.isNaN(price) || price < 0)) return;
    changes.push({ id, price, row });
  });
  if(changes.length === 0) return;

  btn.disabled = true;
  const span = btn.querySelector('span');
  const orig = span?.textContent;
  if(span) span.textContent = 'Αποθήκευση…';

  try {
    const results = await Promise.all(changes.map(c =>
      window.sb.from('products').update({ price: c.price }).eq('id', c.id)
    ));
    const firstErr = results.find(r => r.error);
    if(firstErr) throw firstErr.error;

    changes.forEach(c => {
      c.row.dataset.originalPrice = c.price == null ? '' : String(c.price);
      c.row.classList.remove('is-dirty');
    });
    showToast(`Αποθηκεύτηκαν ${changes.length} ✓`);
    refreshOffersDirty();
  } catch(err){
    console.error('[Skinya Admin] saveOffers error:', err);
    showToast('Σφάλμα: ' + (err.message||''));
    btn.disabled = false;
    if(span) span.textContent = orig || 'Αποθήκευση';
  }
}
