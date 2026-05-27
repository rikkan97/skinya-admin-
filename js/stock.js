/* ====================================================================
   STOCK.JS — Προϊόντα ανά κατηγορία (top tab nav) με inline stock edit
   ==================================================================== */

async function loadStock(){
  const wrap = document.getElementById('stockGroups');
  if(!wrap) return;
  wrap.innerHTML = '<p class="empty-row">Φόρτωση…</p>';

  try {
    const [{ data: cats, error: catErr }, { data: prods, error: prodErr }] = await Promise.all([
      window.sb.from('categories').select('id, name, sort_order').order('sort_order'),
      window.sb.from('products')
        .select('id, sku, name, img, stock, category_id, brand:brands(name)')
        .order('sku')
    ]);
    if(catErr) throw catErr;
    if(prodErr) throw prodErr;

    if(!prods || prods.length === 0){
      wrap.innerHTML = '<p class="empty-row">Καμία εγγραφή</p>';
      return;
    }

    // Group by category_id
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
                  <th></th><th>SKU</th><th>Όνομα</th><th>Brand</th><th style="width:120px">Stock ${fieldTip('Διαθέσιμα τεμάχια. Άλλαξε τον αριθμό απευθείας εδώ — τα τροποποιημένα κελιά επισημαίνονται και αποθηκεύονται όλα μαζί με το κουμπί «Αποθήκευση».', true)}</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(p => `
                  <tr>
                    <td class="col-thumb"><div class="thumb">${p.img ? `<img src="${escapeHTML(p.img)}" alt="">` : (p.brand?.name||'').charAt(0)}</div></td>
                    <td><strong>${escapeHTML(p.sku)}</strong></td>
                    <td>${escapeHTML(p.name)}</td>
                    <td class="muted">${escapeHTML(p.brand?.name || '—')}</td>
                    <td>
                      <input type="number" min="0" class="stock-input"
                             data-id="${p.id}"
                             data-original="${p.stock ?? 0}"
                             value="${p.stock ?? 0}">
                    </td>
                  </tr>
                `).join('')}
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
      btn.addEventListener('click', () => switchStockTab(btn.dataset.cat));
    });
    // Dirty tracking
    wrap.querySelectorAll('.stock-input').forEach(inp => {
      inp.addEventListener('input', refreshStockDirty);
    });
    refreshStockDirty();
    wireStockSearch();
    applyStockSearch();
    subscribeStockRealtime();   // live updates όταν δημιουργούνται παραγγελίες
  } catch(err){
    console.error('[Skinya Admin] loadStock error:', err);
    wrap.innerHTML = '<p class="empty-row">Σφάλμα φόρτωσης</p>';
  }
}

// ─────────────────────────────────────────────────────────────
// Realtime subscription — products UPDATE → live stock updates
// ─────────────────────────────────────────────────────────────
// Όταν δημιουργείται παραγγελία στο public site, η create_order RPC
// κάνει atomic decrement στο stock. Εδώ ακούμε αυτές τις αλλαγές και
// ενημερώνουμε τα inputs χωρίς refresh. Αν ο admin είναι σε edit
// (is-dirty), σεβόμαστε την επεξεργασία του και ενημερώνουμε μόνο
// το data-original (με stale indicator).
let _stockChannel = null;

function subscribeStockRealtime(){
  if(_stockChannel) return;  // ένα channel αρκεί για όλη τη ζωή της σελίδας
  _stockChannel = window.sb.channel('admin-stock-live')
    .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'products' },
        payload => onStockRealtimeUpdate(payload.new))
    .subscribe();
}

function onStockRealtimeUpdate(row){
  if(!row || !row.id) return;
  const inp = document.querySelector(`.stock-input[data-id="${row.id}"]`);
  if(!inp) return;
  const newStock = String(row.stock ?? 0);
  if(inp.dataset.original === newStock && inp.value === newStock) return;  // no-op

  if(inp.classList.contains('is-dirty')){
    // Ο admin πληκτρολογεί — μην αλλάξεις την τιμή του. Απλά ενημέρωσε
    // το "original" για να ξέρει ότι η βάση άλλαξε από κάτω του.
    inp.dataset.original = newStock;
    inp.classList.add('is-stale');
    setTimeout(()=> inp.classList.remove('is-stale'), 2200);
    refreshStockDirty();
  } else {
    // Free input — απλό live update + flash.
    inp.value = newStock;
    inp.dataset.original = newStock;
    inp.classList.add('is-flash');
    setTimeout(()=> inp.classList.remove('is-flash'), 1200);
  }
}

// Search — cross-category: φιλτράρει γραμμές σε ΟΛΑ τα panels (SKU/όνομα/brand)
function wireStockSearch(){
  const inp = document.getElementById('stockSearch');
  if(!inp || inp.dataset.wired) return;
  inp.dataset.wired = '1';
  inp.addEventListener('input', applyStockSearch);
}
function applyStockSearch(){
  const wrap = document.getElementById('stockGroups');
  if(!wrap) return;
  const q = (document.getElementById('stockSearch')?.value || '').trim().toLowerCase();
  wrap.classList.toggle('is-searching', !!q);

  wrap.querySelectorAll('.stock-panel').forEach(panel => {
    let shown = 0;
    panel.querySelectorAll('tbody tr').forEach(tr => {
      // ψάξε σε SKU + όνομα + brand (όχι στο input value)
      const txt = tr.querySelector('td:nth-child(2)')?.textContent + ' ' +
                  tr.querySelector('td:nth-child(3)')?.textContent + ' ' +
                  tr.querySelector('td:nth-child(4)')?.textContent;
      const match = !q || txt.toLowerCase().includes(q);
      tr.style.display = match ? '' : 'none';
      if(match) shown++;
    });
    // Κρύψε panel χωρίς αποτελέσματα (μόνο σε λειτουργία αναζήτησης)
    panel.classList.toggle('no-match', !!q && shown === 0);
  });
}

function switchStockTab(catId){
  document.querySelectorAll('.stock-tab').forEach(b => {
    b.classList.toggle('is-active', b.dataset.cat === catId);
  });
  document.querySelectorAll('.stock-panel').forEach(p => {
    p.classList.toggle('is-active', p.dataset.cat === catId);
  });
}

function refreshStockDirty(){
  const btn = document.getElementById('stockSaveBtn');
  if(!btn) return;
  let dirty = 0;
  const dirtyByCat = {};
  document.querySelectorAll('.stock-input').forEach(inp => {
    const orig = Number(inp.dataset.original);
    const cur  = Number(inp.value);
    const changed = !Number.isNaN(cur) && cur !== orig;
    inp.classList.toggle('is-dirty', changed);
    if(changed){
      dirty++;
      const panel = inp.closest('.stock-panel');
      if(panel) dirtyByCat[panel.dataset.cat] = (dirtyByCat[panel.dataset.cat]||0)+1;
    }
  });
  // Badge on tabs
  document.querySelectorAll('.stock-tab').forEach(t => {
    const n = dirtyByCat[t.dataset.cat] || 0;
    t.classList.toggle('has-dirty', n > 0);
  });
  btn.disabled = dirty === 0;
  const span = btn.querySelector('span');
  if(span) span.textContent = dirty ? `Αποθήκευση (${dirty})` : 'Αποθήκευση';
}

async function saveStock(){
  const btn = document.getElementById('stockSaveBtn');
  if(!btn || btn.disabled) return;

  const changes = [];
  document.querySelectorAll('.stock-input.is-dirty').forEach(inp => {
    const id = inp.dataset.id;
    const v  = Number(inp.value);
    if(!id || Number.isNaN(v) || v < 0) return;
    changes.push({ id, stock: v, el: inp });
  });
  if(changes.length === 0) return;

  btn.disabled = true;
  const span = btn.querySelector('span');
  const orig = span?.textContent;
  if(span) span.textContent = 'Αποθήκευση…';

  try {
    const results = await Promise.all(changes.map(c =>
      window.sb.from('products').update({ stock: c.stock }).eq('id', c.id)
    ));
    const firstErr = results.find(r => r.error);
    if(firstErr) throw firstErr.error;

    changes.forEach(c => {
      c.el.dataset.original = String(c.stock);
      c.el.classList.remove('is-dirty');
    });
    showToast(`Αποθηκεύτηκαν ${changes.length} ✓`);
    refreshStockDirty();
  } catch(err){
    console.error('[Skinya Admin] saveStock error:', err);
    showToast('Σφάλμα: ' + (err.message||''));
    btn.disabled = false;
    if(span) span.textContent = orig || 'Αποθήκευση';
  }
}
