/* ====================================================================
   PRODUCTS.JS — Products list + add/edit modal + delete
   ==================================================================== */

let _brandsCache = null;
let _categoriesCache = null;
let _activeProductCat = '';

async function ensureProductCategoryTabs(){
  if(!_categoriesCache){
    const { data } = await window.sb.from('categories').select('id, name').order('sort_order');
    _categoriesCache = data || [];
  }
  const wrap = document.getElementById('productsCatTabs');
  if(!wrap) return;
  if(wrap.querySelector('[data-prod-cat="cleansers"]')) return;  // already injected

  // Append category tabs after the "Όλα" one
  const html = _categoriesCache.map(c =>
    `<button class="ui-tab" data-prod-cat="${c.id}" type="button">${escapeHTML(c.name)}</button>`
  ).join('');
  wrap.insertAdjacentHTML('beforeend', html);

  wrap.querySelectorAll('.ui-tab[data-prod-cat]').forEach(btn=>{
    btn.onclick = ()=>{
      _activeProductCat = btn.dataset.prodCat;
      wrap.querySelectorAll('.ui-tab').forEach(b => b.classList.toggle('is-active', b.dataset.prodCat === _activeProductCat));
      loadProducts();
    };
  });
}

async function loadProducts(){
  const tbody = document.querySelector('#productsTable tbody');
  if(!tbody) return;
  tbody.innerHTML = '<tr><td colspan="9" class="empty-row">Φόρτωση…</td></tr>';

  await ensureProductCategoryTabs();

  try {
    let query = window.sb
      .from('products')
      .select('id, sku, name, brand_id, category_id, price, default_price, stock, is_active, is_featured, img, brand:brands(name)')
      .order('sku');

    if(_activeProductCat) query = query.eq('category_id', _activeProductCat);

    const { data, error } = await query;

    if(error) throw error;

    if(!data || data.length === 0){
      tbody.innerHTML = '<tr><td colspan="9" class="empty-row">Καμία εγγραφή</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(p => `
      <tr>
        <td class="col-thumb"><div class="thumb">${p.img ? `<img src="${escapeHTML(p.img)}" alt="">` : (p.brand?.name||'').charAt(0)}</div></td>
        <td><strong>${escapeHTML(p.sku)}</strong></td>
        <td>${escapeHTML(p.name)}${p.is_featured ? ' <span class="feat-star" title="Best of Category">★</span>' : ''}</td>
        <td class="muted">${escapeHTML(p.brand?.name || '—')}</td>
        <td class="muted">${escapeHTML(p.category_id || '—')}</td>
        <td>${fmtMoney(p.price ?? p.default_price)}</td>
        <td>${p.stock <= 5 ? `<span class="status-badge" style="background:rgba(212,164,92,0.16);color:var(--warn)">${p.stock}</span>` : p.stock}</td>
        <td class="${p.is_active ? 'bool-yes' : 'bool-no'}">${p.is_active ? '✓' : '○'}</td>
        <td class="col-actions">
          <button class="row-btn" onclick="openProductModal('${p.id}')">Edit</button>
          <button class="row-btn row-btn--danger" onclick="deleteProduct('${p.id}','${escapeHTML(p.name)}')">Delete</button>
        </td>
      </tr>
    `).join('');

    wireProductsSearch();
    applyProductsSearch();   // διατήρησε το φίλτρο μετά από κάθε render (π.χ. αλλαγή κατηγορίας)
  } catch(err){
    console.error('[Skinya Admin] loadProducts error:', err);
    tbody.innerHTML = '<tr><td colspan="9" class="empty-row">Σφάλμα φόρτωσης</td></tr>';
  }
}

// Search — φιλτράρει client-side τις γραμμές του πίνακα (SKU/όνομα/brand)
function wireProductsSearch(){
  const inp = document.getElementById('productsSearch');
  if(!inp || inp.dataset.wired) return;
  inp.dataset.wired = '1';
  inp.addEventListener('input', applyProductsSearch);
}
function applyProductsSearch(){
  const q = (document.getElementById('productsSearch')?.value || '').trim().toLowerCase();
  const rows = document.querySelectorAll('#productsTable tbody tr');
  let shown = 0;
  rows.forEach(tr => {
    if(tr.querySelector('.empty-row')) return;
    const match = !q || tr.textContent.toLowerCase().includes(q);
    tr.style.display = match ? '' : 'none';
    if(match) shown++;
  });
  // «Κανένα αποτέλεσμα» γραμμή
  const tbody = document.querySelector('#productsTable tbody');
  let noRow = tbody?.querySelector('.search-empty-row');
  if(q && shown === 0){
    if(!noRow && tbody){
      tbody.insertAdjacentHTML('beforeend', '<tr class="search-empty-row"><td colspan="9" class="empty-row">Κανένα αποτέλεσμα</td></tr>');
    }
  } else if(noRow){
    noRow.remove();
  }
}

async function ensureBrandsCategoriesCache(){
  if(_brandsCache && _categoriesCache) return;
  const [{ data: brands }, { data: cats }] = await Promise.all([
    window.sb.from('brands').select('id, name').order('name'),
    window.sb.from('categories').select('id, name').order('sort_order')
  ]);
  _brandsCache = brands || [];
  _categoriesCache = cats || [];
}

// ──────────────────────────────────────────────────────────────
// Edit / Add modal
// ──────────────────────────────────────────────────────────────
async function openProductModal(productId){
  const overlay = document.getElementById('productModalOverlay');
  const body = document.getElementById('productModalBody');
  overlay.hidden = false;
  setTimeout(()=>overlay.classList.add('open'), 10);
  body.innerHTML = '<p class="muted">Φόρτωση…</p>';

  await ensureBrandsCategoriesCache();

  let product = null;
  if(productId){
    const { data, error } = await window.sb.from('products').select('*').eq('id', productId).single();
    if(error){ body.innerHTML = '<p class="muted">Σφάλμα φόρτωσης</p>'; return; }
    product = data;
  }
  renderProductForm(product);
}

function closeProductModal(){
  const overlay = document.getElementById('productModalOverlay');
  overlay.classList.remove('open');
  setTimeout(()=>overlay.hidden = true, 300);
}

function renderProductForm(p){
  const body = document.getElementById('productModalBody');
  const isNew = !p;
  const brandOpts = (_brandsCache||[]).map(b => `<option value="${b.id}" ${p?.brand_id===b.id?'selected':''}>${escapeHTML(b.name)}</option>`).join('');
  const catOpts   = (_categoriesCache||[]).map(c => `<option value="${c.id}" ${p?.category_id===c.id?'selected':''}>${escapeHTML(c.name)}</option>`).join('');

  body.innerHTML = `
    <h2 style="margin-bottom:1rem">${isNew ? 'Νέο προϊόν' : 'Επεξεργασία προϊόντος'}</h2>

    <form class="adm-form" onsubmit="saveProduct(event, ${p ? `'${p.id}'` : 'null'})">

      <div class="adm-form-row">
        <label class="adm-field"><span>SKU ${fieldTip('Μοναδικός κωδικός προϊόντος, π.χ. cl1 = cleanser 1, t1 = toner 1, s1 = serum 1. Χρησιμοποιείται εσωτερικά — να μην αλλάζει μετά τη δημιουργία.')}</span>
          <input type="text" name="sku" required value="${escapeHTML(p?.sku||'')}" placeholder="cl1, t1, s1, ...">
        </label>
        <label class="adm-field"><span>Stock ${fieldTip('Διαθέσιμο απόθεμα σε τεμάχια. Κάτω από 5 εμφανίζεται με κίτρινη προειδοποίηση. 0 = εξαντλημένο.')}</span>
          <input type="number" name="stock" min="0" value="${p?.stock ?? 50}">
        </label>
      </div>

      <label class="adm-field"><span>Όνομα προϊόντος ${fieldTip('Το εμπορικό όνομα όπως θα φαίνεται στο site, π.χ. «Hydra Boost Serum». Χωρίς το brand — αυτό μπαίνει χωριστά.')}</span>
        <input type="text" name="name" required value="${escapeHTML(p?.name||'')}">
      </label>

      <div class="adm-form-row">
        <label class="adm-field"><span>Brand ${fieldTip('Η μάρκα του προϊόντος. Αν δεν υπάρχει στη λίστα, επίλεξε «+ Νέο brand…» για να τη δημιουργήσεις εδώ.')}</span>
          <select name="brand_id" required onchange="onBrandSelectChange(this)">
            <option value="">—</option>
            ${brandOpts}
            <option value="__new__">+ Νέο brand…</option>
          </select>
        </label>
        <label class="adm-field"><span>Κατηγορία ${fieldTip('Σε ποια ενότητα του καταλόγου ανήκει (Cleansers, Toners, Serums…). Καθορίζει πού εμφανίζεται στο site.')}</span>
          <select name="category_id" required>
            <option value="">—</option>
            ${catOpts}
          </select>
        </label>
      </div>

      <label class="adm-field adm-field--full" id="newBrandField" hidden><span>Όνομα νέου brand ${fieldTip('Γράψε το πλήρες όνομα — το id δημιουργείται αυτόματα, π.χ. «La Roche-Posay» → la-roche-posay.')}</span>
        <input type="text" name="new_brand" placeholder="π.χ. La Roche-Posay" autocomplete="off">
      </label>

      <div class="adm-form-row">
        <label class="adm-field"><span>Μέγεθος ${fieldTip('Περιεκτικότητα/μέγεθος συσκευασίας, π.χ. 100ml, 50g. Εμφανίζεται δίπλα στο brand στην κάρτα.')}</span>
          <input type="text" name="size" value="${escapeHTML(p?.size||'')}" placeholder="100ml">
        </label>
        <label class="adm-field"><span>Τιμή ${fieldTip('Κανονική τιμή πώλησης σε €, π.χ. 24.90. Δεκαδικά με τελεία.')}</span>
          <input type="number" step="0.01" name="default_price" value="${p?.default_price ?? ''}">
        </label>
      </div>
      <input type="hidden" name="price" value="${p?.price ?? ''}">

      <label class="adm-field"><span>Εικόνα ${fieldTip('Φωτογραφία προϊόντος. Μετατρέπεται αυτόματα σε .webp για ταχύτητα. Ιδανικά τετράγωνη, καθαρό φόντο.')}</span>
        <div class="img-upload">
          <div class="img-upload-preview">
            ${p?.img ? `<img src="${escapeHTML(p.img)}" alt="">` : '<span>Καμία εικόνα</span>'}
          </div>
          <div class="img-upload-controls">
            <input type="file" accept="image/*" onchange="handleImgUpload(this, 'products')">
            <input type="hidden" name="img" value="${escapeHTML(p?.img||'')}">
            <span class="img-upload-status">${p?.img ? 'Αποθηκευμένη εικόνα' : 'Επιλογή αρχείου — γίνεται μετατροπή σε .webp'}</span>
            ${p?.img ? '<button type="button" class="img-upload-clear" onclick="clearImgUpload(this)">Αφαίρεση</button>' : ''}
          </div>
        </div>
      </label>

      <label class="adm-field"><span>Key ingredient (Ελληνικά) ${fieldTip('Το βασικό συστατικό που προβάλλεται στην κάρτα, π.χ. «Υαλουρονικό οξύ». Στα Ελληνικά.')}</span>
        <input type="text" name="key_ingredient" value="${escapeHTML(p?.key_ingredient||'')}">
      </label>

      <div class="adm-form-row">
        <label class="adm-field"><span>Tech name ${fieldTip('Τεχνική/επιστημονική ονομασία ή τεχνολογία — μικρό label πάνω στην κάρτα, π.χ. «Niacinamide 10%».')}</span>
          <input type="text" name="tech_name" value="${escapeHTML(p?.tech_name||'')}">
        </label>
        <label class="adm-field"><span>Tech description ${fieldTip('Σύντομη τεχνική επεξήγηση που συνοδεύει το tech name, π.χ. «Μειώνει πόρους & ερυθρότητα».')}</span>
          <input type="text" name="tech_desc" value="${escapeHTML(p?.tech_desc||'')}">
        </label>
      </div>

      <label class="adm-field"><span>Περιγραφή (long copy) ${fieldTip('Αναλυτικό κείμενο προϊόντος για τη σελίδα/tooltip. Όσα δεν χωρούν στα μικρά πεδία.')}</span>
        <textarea name="description" rows="4">${escapeHTML(p?.description||'')}</textarea>
      </label>

      <label class="adm-field"><span>Badges (χωρισμένα με κόμμα) ${fieldTip('Ετικέτες χωρισμένες με κόμμα, π.χ. cruelty-free, vegan, viral. Εμφανίζονται ως σφραγίδες πάνω στην εικόνα.')}</span>
        <input type="text" name="badges" value="${(p?.badges||[]).join(', ')}" placeholder="cruelty-free, vegan, viral">
      </label>

      <div class="adm-form-row">
        <label class="adm-field" style="flex-direction:row;align-items:center;gap:.6rem">
          <input type="checkbox" name="is_active" ${(p?.is_active ?? true) ? 'checked' : ''}>
          <span style="letter-spacing:.06em">Ενεργό ${fieldTip('Αν είναι τσεκαρισμένο, το προϊόν εμφανίζεται στο site. Αν το ξετσεκάρεις, αποσύρεται από τον κατάλογο χωρίς να διαγραφεί.')}</span>
        </label>
        <label class="adm-field" style="flex-direction:row;align-items:center;gap:.6rem">
          <input type="checkbox" name="is_featured" ${p?.is_featured ? 'checked' : ''}>
          <span style="letter-spacing:.06em">Best of Category ${fieldTip('Προβάλλει το προϊόν ως μεγάλη κάρτα «★ Best of Category» στην κορυφή της κατηγορίας του. ⚠️ Μόνο ΕΝΑ προϊόν ανά κατηγορία — αν το ενεργοποιήσεις ενώ υπάρχει ήδη άλλο, στο site εμφανίζεται μόνο το πρώτο. Διαφέρει από το «Ενεργό».')}</span>
        </label>
      </div>

      <div class="adm-form-foot">
        <button type="button" class="btn-ghost" onclick="closeProductModal()">Άκυρο</button>
        <button type="submit" class="btn-primary"><span>${isNew ? 'Δημιουργία' : 'Αποθήκευση'}</span></button>
      </div>
    </form>
  `;
}

// Δείξε/κρύψε το πεδίο "Όνομα νέου brand" όταν επιλέγεται «+ Νέο brand…»
function onBrandSelectChange(sel){
  const field = document.getElementById('newBrandField');
  if(!field) return;
  const isNew = sel.value === '__new__';
  field.hidden = !isNew;
  const inp = field.querySelector('input');
  if(inp){
    inp.required = isNew;
    if(isNew) setTimeout(()=>inp.focus(), 10); else inp.value = '';
  }
}

// Brand name → slug id (ίδια λογική με το seed: π.χ. "Mary & May" → "mary-may")
function slugifyBrand(name){
  return String(name||'').toLowerCase().trim()
    .replace(/[.&]/g, '')          // αφαίρεσε τελείες & ampersands
    .replace(/[^a-z0-9]+/g, '-')   // ό,τι δεν είναι alphanumeric → παύλα
    .replace(/^-+|-+$/g, '');      // κόψε παύλες στις άκρες
}

async function saveProduct(e, productId){
  e.preventDefault();
  const form = e.currentTarget;
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  const orig = btn.querySelector('span').textContent;
  btn.querySelector('span').textContent = 'Αποθήκευση…';

  try {
    const fd = new FormData(form);

    // ── Νέο brand on-the-fly ──────────────────────────────────────
    let brandId = fd.get('brand_id') || null;
    if(brandId === '__new__'){
      const newName = fd.get('new_brand')?.toString().trim();
      if(!newName){ throw new Error('Συμπλήρωσε το όνομα του νέου brand'); }
      brandId = slugifyBrand(newName);
      if(!brandId){ throw new Error('Μη έγκυρο όνομα brand'); }
      // upsert στο brands table (αν υπάρχει ήδη, ενημέρωσε το name)
      const { error: bErr } = await window.sb
        .from('brands')
        .upsert({ id: brandId, name: newName }, { onConflict: 'id' });
      if(bErr) throw bErr;
      _brandsCache = null;   // force reload στο επόμενο άνοιγμα
    }

    const badgesStr = fd.get('badges')?.toString() || '';
    const payload = {
      sku:            fd.get('sku')?.toString().trim(),
      name:           fd.get('name')?.toString().trim(),
      brand_id:       brandId,
      category_id:    fd.get('category_id') || null,
      size:           fd.get('size')?.toString().trim() || null,
      price:          fd.get('price') ? Number(fd.get('price')) : null,
      default_price:  fd.get('default_price') ? Number(fd.get('default_price')) : null,
      stock:          Number(fd.get('stock') || 0),
      img:            fd.get('img')?.toString().trim() || null,
      key_ingredient: fd.get('key_ingredient')?.toString().trim() || null,
      tech_name:      fd.get('tech_name')?.toString().trim() || null,
      tech_desc:      fd.get('tech_desc')?.toString().trim() || null,
      description:    fd.get('description')?.toString().trim() || null,
      badges:         badgesStr.split(',').map(b=>b.trim()).filter(Boolean),
      is_active:      !!fd.get('is_active'),
      is_featured:    !!fd.get('is_featured')
    };

    // ── Μόνο 1 «Best of Category» ανά κατηγορία ──────────────────
    if(payload.is_featured && payload.category_id){
      let q = window.sb.from('products')
        .select('id, name')
        .eq('category_id', payload.category_id)
        .eq('is_featured', true);
      if(productId) q = q.neq('id', productId);
      const { data: existing, error: fErr } = await q;
      if(fErr) throw fErr;
      if(existing && existing.length){
        throw new Error(`Υπάρχει ήδη Best of Category σε αυτή την κατηγορία: «${existing[0].name}». Ξεμάρκαρέ το πρώτα.`);
      }
    }

    let error;
    if(productId){
      ({ error } = await window.sb.from('products').update(payload).eq('id', productId));
    } else {
      ({ error } = await window.sb.from('products').insert(payload));
    }
    if(error) throw error;

    showToast(productId ? 'Αποθηκεύτηκε ✓' : 'Δημιουργήθηκε ✓');
    closeProductModal();
    loadProducts();
  } catch(err){
    console.error('[Skinya Admin] saveProduct error:', err);
    showToast('Σφάλμα: ' + (err.message||''));
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = orig;
  }
}

async function deleteProduct(productId, name){
  if(!confirm(`Σίγουρα θες να διαγράψεις το "${name}";`)) return;
  try {
    const { error } = await window.sb.from('products').delete().eq('id', productId);
    if(error) throw error;
    showToast('Διαγράφηκε');
    loadProducts();
  } catch(err){
    console.error('[Skinya Admin] deleteProduct error:', err);
    showToast('Σφάλμα διαγραφής');
  }
}
