/* ====================================================================
   SECTIONS.JS — Site UI Manager (inline tab-based editor)
   --------------------------------------------------------------------
   Top tabs map to sections:
     home_favorites  → 1 section
     home_shop       → meta-tab with 8 sub-sections (one per category)
     morning_routine → 1 section
     night_routine   → 1 section
     weekly_routine  → 1 section
     founders        → 1 section
   ==================================================================== */

let _allProductsCache = null;
let _editingSection   = null;     // current section being edited
let _activeUITab      = 'home_favorites';
let _activeShopSubCat = 'cleansers';

const SHOP_SUBTABS = [
  {id:'cleansers',    label:'Καθαρισμός'},
  {id:'toners',       label:'Toners'},
  {id:'serums',       label:'Serums'},
  {id:'eyes',         label:'Eyes'},
  {id:'moisturizers', label:'Κρέμες'},
  {id:'spf',          label:'SPF'},
  {id:'masks',        label:'Μάσκες'},
  {id:'body',         label:'Body'}
];

async function ensureProductsCache(){
  if(_allProductsCache) return _allProductsCache;
  const { data } = await window.sb
    .from('products')
    .select('id, sku, name, img, category_id, brand:brands(name)')
    .eq('is_active', true)
    .order('sku');
  _allProductsCache = data || [];
  return _allProductsCache;
}

function findProductBySku(sku){
  return _allProductsCache?.find(p => p.sku === sku);
}

// Map top-tab → section id
function getSectionIdForTab(tab){
  if(tab === 'home_shop') return 'home_shop_' + _activeShopSubCat;
  return tab;
}

// ──────────────────────────────────────────────────────────────
// Entry point: load tabs + first section
// ──────────────────────────────────────────────────────────────
async function loadSections(){
  await ensureProductsCache();
  wireUITabs();
  loadSectionInline(getSectionIdForTab(_activeUITab));
}

function wireUITabs(){
  document.querySelectorAll('.ui-tab[data-ui-tab]').forEach(btn=>{
    btn.onclick = ()=> {
      _activeUITab = btn.dataset.uiTab;
      document.querySelectorAll('.ui-tab[data-ui-tab]').forEach(b=>{
        b.classList.toggle('is-active', b.dataset.uiTab === _activeUITab);
      });
      loadSectionInline(getSectionIdForTab(_activeUITab));
    };
  });
}

// ──────────────────────────────────────────────────────────────
// Load one section into the pane
// ──────────────────────────────────────────────────────────────
async function loadSectionInline(sectionId){
  const pane = document.getElementById('uiPane');
  if(!pane) return;
  pane.innerHTML = '<p class="muted">Φόρτωση…</p>';

  try {
    const { data, error } = await window.sb
      .from('site_sections').select('*').eq('id', sectionId).single();
    if(error) throw error;
    _editingSection = JSON.parse(JSON.stringify(data));
    if(!Array.isArray(_editingSection.items)) _editingSection.items = [];
    renderSectionPane();
  } catch(err){
    console.error('[Skinya Admin] loadSectionInline error:', err);
    pane.innerHTML = `<p class="empty-row">Σφάλμα: ${escapeHTML(err.message||'')}</p>`;
  }
}

function renderSectionPane(){
  if(!_editingSection) return;
  const s = _editingSection;
  const pane = document.getElementById('uiPane');

  // If this is a shop-sub section, render the sub-tabs first
  const showSubtabs = _activeUITab === 'home_shop';

  const subtabsHtml = showSubtabs ? `
    <div class="ui-subtabs">
      ${SHOP_SUBTABS.map(c => `
        <button class="ui-subtab ${c.id === _activeShopSubCat ? 'is-active' : ''}" data-shop-cat="${c.id}" type="button">${c.label}</button>
      `).join('')}
    </div>
  ` : '';

  let bodyHtml;
  if(s.kind === 'founders'){
    bodyHtml = renderFoundersBody(s);
  } else {
    bodyHtml = renderProductListBody(s);
  }

  // Discount input για routine sections που έχουν bundle
  const showsDiscount = (s.id === 'morning_routine' || s.id === 'night_routine');
  const currentDiscount = showsDiscount ? Math.round(((s.config?.discount ?? 0) * 100) * 10)/10 : 0;
  const discountInputHtml = showsDiscount ? `
    <div class="bundle-discount">
      <label class="adm-field" style="max-width:200px">
        <span>Έκπτωση set (%) ${fieldTip('Έκπτωση που εφαρμόζεται όταν ο πελάτης αγοράζει όλο το routine ως πακέτο (bundle), π.χ. 10. Ισχύει μόνο για morning/night routine.')}</span>
        <input type="number" id="bundleDiscountInput" min="0" max="50" step="0.5" value="${currentDiscount}" oninput="updateSectionDiscount(this.value)">
      </label>
    </div>
  ` : '';

  // Editorial copy για το weekly hero (μόνο weekly_routine) — αποθηκεύεται στο config.editorial
  const editorialHtml = (s.id === 'weekly_routine') ? renderWeeklyEditorial(s) : '';

  pane.innerHTML = `
    ${subtabsHtml}
    <div class="pane-head">
      <h2 style="font-family:'Inter',sans-serif;font-size:1rem;font-weight:600;color:var(--text)">${escapeHTML(s.title)} ${fieldTip('Τα στοιχεία εμφανίζονται στο site με αυτή ακριβώς τη σειρά. Χρησιμοποίησε ↑↓ για αναδιάταξη και × για αφαίρεση. Ο αριθμός δίπλα δείχνει πόσα έχεις / το μέγιστο.')}</h2>
      <small class="muted">${s.items.length}/${s.max_items}</small>
    </div>
    ${discountInputHtml}
    ${bodyHtml}
    ${editorialHtml}
    <div class="adm-form-foot" style="margin-top:1.5rem">
      <button type="button" class="btn-primary" onclick="saveSection()"><span>Αποθήκευση</span></button>
    </div>
  `;

  // Wire subtabs
  if(showSubtabs){
    pane.querySelectorAll('.ui-subtab[data-shop-cat]').forEach(btn=>{
      btn.onclick = ()=>{
        _activeShopSubCat = btn.dataset.shopCat;
        loadSectionInline(getSectionIdForTab(_activeUITab));
      };
    });
  }

  // Wire product search if applicable
  if(s.kind !== 'founders') wireSectionSearch();
}

function renderProductListBody(s){
  return `
    <ul class="sec-items-list" id="secItemsList">
      ${s.items.map((it,i)=>renderSectionItem(it,i)).join('')}
      ${s.items.length === 0 ? '<li class="sec-empty">Άδειο — πρόσθεσε προϊόντα από κάτω</li>' : ''}
    </ul>

    ${s.items.length < s.max_items ? `
      <div class="sec-search-wrap">
        <small style="display:block;color:var(--text-dim);font-size:.62rem;letter-spacing:.22em;text-transform:uppercase;font-weight:600;margin-bottom:.4rem">Προσθήκη προϊόντος</small>
        <input type="text" id="secSearchInput" class="sec-search" placeholder="Αναζήτηση με SKU, όνομα ή brand…">
        <div class="sec-search-results" id="secSearchResults" hidden></div>
      </div>
    ` : '<p class="muted" style="font-style:italic;margin-top:1rem">Μέγιστο: αφαίρεσε κάποιο για να προσθέσεις άλλο</p>'}
  `;
}

function renderSectionItem(item, index){
  const p = findProductBySku(item.sku);
  if(!p){
    return `
      <li class="sec-item sec-item--missing" data-index="${index}">
        <span class="sec-handle">≡</span>
        <div class="sec-thumb sec-thumb--lg">?</div>
        <div class="sec-info">
          <strong style="color:var(--warn)">⚠ Άγνωστο SKU: ${escapeHTML(item.sku)}</strong>
          <small>Το προϊόν δεν υπάρχει πια</small>
        </div>
        <div class="sec-actions">
          <button type="button" class="sec-mv" onclick="moveSectionItem(${index},-1)" title="Πάνω">↑</button>
          <button type="button" class="sec-mv" onclick="moveSectionItem(${index},1)" title="Κάτω">↓</button>
          <button type="button" class="sec-rm" onclick="removeSectionItem(${index})" title="Αφαίρεση">×</button>
        </div>
      </li>`;
  }
  return `
    <li class="sec-item" data-index="${index}">
      <span class="sec-handle">≡</span>
      <div class="sec-thumb sec-thumb--lg">${p.img ? `<img src="${escapeHTML(p.img)}" alt="">` : (p.brand?.name||'').charAt(0)}</div>
      <div class="sec-info">
        <small>${escapeHTML(p.brand?.name||'')} · ${escapeHTML(p.sku)}</small>
        <strong>${escapeHTML(p.name)}</strong>
      </div>
      <div class="sec-actions">
        <button type="button" class="sec-mv" onclick="moveSectionItem(${index},-1)" title="Πάνω">↑</button>
        <button type="button" class="sec-mv" onclick="moveSectionItem(${index},1)" title="Κάτω">↓</button>
        <button type="button" class="sec-rm" onclick="removeSectionItem(${index})" title="Αφαίρεση">×</button>
      </div>
    </li>`;
}

// ──────────────────────────────────────────────────────────────
// In-memory mutations
// ──────────────────────────────────────────────────────────────
function moveSectionItem(index, delta){
  const arr = _editingSection.items;
  const j = index + delta;
  if(j < 0 || j >= arr.length) return;
  [arr[index], arr[j]] = [arr[j], arr[index]];
  renderSectionPane();
}
function removeSectionItem(index){
  _editingSection.items.splice(index, 1);
  renderSectionPane();
}
function addSectionItem(sku){
  if(_editingSection.items.length >= _editingSection.max_items) return;
  if(_editingSection.items.some(i=>i.sku === sku)) return;
  _editingSection.items.push({sku});
  renderSectionPane();
}

// ──────────────────────────────────────────────────────────────
// Search inside the pane
// ──────────────────────────────────────────────────────────────
function wireSectionSearch(){
  const input = document.getElementById('secSearchInput');
  const results = document.getElementById('secSearchResults');
  if(!input || !results) return;

  function update(){
    const q = input.value.trim().toLowerCase();
    if(!q){ results.hidden = true; results.innerHTML = ''; return; }
    const usedSkus = new Set(_editingSection.items.map(i=>i.sku));
    const matches = (_allProductsCache||[])
      .filter(p => !usedSkus.has(p.sku))
      .filter(p => {
        const hay = `${p.sku} ${p.name} ${p.brand?.name||''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 8);

    if(matches.length === 0){
      results.innerHTML = '<div class="sec-search-empty">Κανένα αποτέλεσμα</div>';
      results.hidden = false;
      return;
    }
    results.innerHTML = matches.map(p => `
      <button type="button" class="sec-search-row" onclick="addSectionItem('${p.sku}')">
        <div class="sec-thumb">${p.img ? `<img src="${escapeHTML(p.img)}" alt="">` : (p.brand?.name||'').charAt(0)}</div>
        <div class="sec-info">
          <small>${escapeHTML(p.brand?.name||'')} · ${escapeHTML(p.sku)}</small>
          <strong>${escapeHTML(p.name)}</strong>
        </div>
        <span class="sec-add-ic">+</span>
      </button>
    `).join('');
    results.hidden = false;
  }
  input.addEventListener('input', update);
}

// ──────────────────────────────────────────────────────────────
// Founders editor
// ──────────────────────────────────────────────────────────────
function renderFoundersBody(s){
  return `
    <div id="foundersList">
      ${s.items.map((f,i)=>renderFounderRow(f,i)).join('')}
    </div>
    ${s.items.length < s.max_items ? `
      <button type="button" class="btn-ghost" onclick="addFounder()" style="margin-top:1rem">+ Προσθήκη founder</button>
    ` : ''}
  `;
}

function renderFounderRow(f, i){
  return `
    <div class="founder-row" data-index="${i}">
      <div class="founder-photo">
        ${f.photo ? `<img src="${escapeHTML(f.photo)}" alt="">` : '<span class="muted">No photo</span>'}
      </div>
      <div class="founder-fields">
        <div class="adm-form-row">
          <label class="adm-field"><span>Όνομα ${fieldTip('Το ονοματεπώνυμο του founder όπως θα εμφανίζεται στην ενότητα «Founders» του site.')}</span>
            <input type="text" oninput="updateFounderField(${i},'name',this.value)" value="${escapeHTML(f.name||'')}">
          </label>
          <label class="adm-field"><span>Ρόλος ${fieldTip('Ο τίτλος/ιδιότητα, π.χ. «Co-Founder & CEO». Εμφανίζεται κάτω από το όνομα.')}</span>
            <input type="text" oninput="updateFounderField(${i},'role',this.value)" value="${escapeHTML(f.role||'')}">
          </label>
        </div>
        <label class="adm-field"><span>Φωτογραφία ${fieldTip('Πορτρέτο του founder. Μετατρέπεται αυτόματα σε .webp. Ιδανικά κάθετη (portrait) φωτογραφία.')}</span>
          <div class="img-upload" data-founder-index="${i}">
            <div class="img-upload-preview">
              ${f.photo ? `<img src="${escapeHTML(f.photo)}" alt="">` : '<span>Καμία φωτογραφία</span>'}
            </div>
            <div class="img-upload-controls">
              <input type="file" accept="image/*" onchange="handleFounderPhotoUpload(this, ${i})">
              <input type="hidden" value="${escapeHTML(f.photo||'')}">
              <span class="img-upload-status">${f.photo ? 'Αποθηκευμένη φωτογραφία' : 'Επιλογή αρχείου — γίνεται μετατροπή σε .webp'}</span>
              ${f.photo ? `<button type="button" class="img-upload-clear" onclick="clearFounderPhoto(${i}, this)">Αφαίρεση</button>` : ''}
            </div>
          </div>
        </label>
        <label class="adm-field"><span>Bio ${fieldTip('Σύντομο βιογραφικό κείμενο για τον founder (1–2 προτάσεις) που εμφανίζεται δίπλα στη φωτογραφία.')}</span>
          <textarea rows="2" oninput="updateFounderField(${i},'bio',this.value)">${escapeHTML(f.bio||'')}</textarea>
        </label>
        <button type="button" class="btn-danger" onclick="removeFounder(${i})" style="align-self:flex-start">Αφαίρεση</button>
      </div>
    </div>
  `;
}

function updateFounderField(index, field, value){
  if(!_editingSection?.items[index]) return;
  _editingSection.items[index][field] = value;
  if(field === 'photo'){
    const row = document.querySelector(`.founder-row[data-index="${index}"] .founder-photo`);
    if(row) row.innerHTML = value ? `<img src="${escapeHTML(value)}" alt="">` : '<span class="muted">No photo</span>';
  }
}

async function handleFounderPhotoUpload(input, index){
  const file = input.files && input.files[0];
  if(!file) return;
  const wrap    = input.closest('.img-upload');
  const status  = wrap.querySelector('.img-upload-status');
  const preview = wrap.querySelector('.img-upload-preview');
  const hidden  = wrap.querySelector('input[type="hidden"]');

  status.className = 'img-upload-status';
  status.textContent = 'Μετατροπή σε .webp & upload…';
  input.disabled = true;

  try {
    const url = await window.uploadImageAsWebp(file, 'founders');
    hidden.value = url;
    preview.innerHTML = `<img src="${escapeHTML(url)}" alt="">`;
    status.classList.add('is-ok');
    status.textContent = '✓ Ανέβηκε ως .webp';
    updateFounderField(index, 'photo', url);

    if(!wrap.querySelector('.img-upload-clear')){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'img-upload-clear';
      btn.textContent = 'Αφαίρεση';
      btn.onclick = () => clearFounderPhoto(index, btn);
      wrap.querySelector('.img-upload-controls').appendChild(btn);
    }
  } catch(err){
    console.error('[Skinya Admin] founder photo upload error:', err);
    status.classList.add('is-error');
    status.textContent = 'Σφάλμα: ' + (err.message || 'upload failed');
    showToast('Σφάλμα upload εικόνας');
  } finally {
    input.disabled = false;
    input.value = '';
  }
}

function clearFounderPhoto(index, btn){
  const wrap = btn.closest('.img-upload');
  if(!wrap) return;
  wrap.querySelector('input[type="hidden"]').value = '';
  wrap.querySelector('.img-upload-preview').innerHTML = '<span>Καμία φωτογραφία</span>';
  const status = wrap.querySelector('.img-upload-status');
  status.className = 'img-upload-status';
  status.textContent = 'Επιλογή αρχείου — γίνεται μετατροπή σε .webp';
  btn.remove();
  updateFounderField(index, 'photo', '');
}
function addFounder(){
  if(_editingSection.items.length >= _editingSection.max_items) return;
  _editingSection.items.push({name:'', role:'Co-Founder', photo:'', bio:''});
  renderSectionPane();
}
function removeFounder(index){
  if(!confirm('Διαγραφή founder;')) return;
  _editingSection.items.splice(index, 1);
  renderSectionPane();
}

// ──────────────────────────────────────────────────────────────
// Weekly hero — editorial copy (config.editorial)
// Το 1ο προϊόν της λίστας γίνεται το «hero». Αυτά τα κείμενα είναι
// curated (δεν ανήκουν στο προϊόν) και εμφανίζονται γύρω από αυτό.
// Όποιο πεδίο μείνει κενό → το site κρατάει το default κείμενο.
// ──────────────────────────────────────────────────────────────
function renderWeeklyEditorial(s){
  const ed = (s.config && s.config.editorial) || {};
  const v  = k => escapeHTML(ed[k] || '');

  // Editorial των 2 μικρών καρτών (config.cards[0] → 2ο προϊόν, [1] → 3ο)
  const cards = (s.config && Array.isArray(s.config.cards)) ? s.config.cards : [];

  return `
    <div class="weekly-editorial" style="margin-top:1.75rem;padding-top:1.5rem;border-top:1px solid var(--line,#e5e0d8)">
      <h3 style="font-family:'Inter',sans-serif;font-size:.95rem;font-weight:600;color:var(--text);margin-bottom:.35rem">Hero — 1ο προϊόν (curated)</h3>
      <p class="muted" style="font-size:.78rem;margin-bottom:1rem">Τα κείμενα του μεγάλου hero. Κενό πεδίο = κρατάει το προεπιλεγμένο κείμενο.</p>

      <div class="adm-form-row">
        <label class="adm-field"><span>Tag ${fieldTip('Μικρό label πάνω-αριστερά, π.χ. «Overnight Mask», «Sheet Mask».')}</span>
          <input type="text" placeholder="Overnight Mask" oninput="updateWeeklyEditorial('tag',this.value)" value="${v('tag')}">
        </label>
        <label class="adm-field"><span>Χρόνος ${fieldTip('Χρόνος εφαρμογής, π.χ. «15΄ ή όλη νύχτα», «10-15΄».')}</span>
          <input type="text" placeholder="15' ή όλη νύχτα" oninput="updateWeeklyEditorial('time',this.value)" value="${v('time')}">
        </label>
      </div>

      <label class="adm-field"><span>Best for ${fieldTip('Για ποιον/τι είναι ιδανικό. Μπαίνει αυτόματα το «Best for:» μπροστά. π.χ. «αφυδάτωση · έλλειψη λάμψης».')}</span>
        <input type="text" placeholder="αφυδάτωση · έλλειψη λάμψης" oninput="updateWeeklyEditorial('bestFor',this.value)" value="${v('bestFor')}">
      </label>

      <div class="adm-form-row">
        <label class="adm-field"><span>Τίτλος ${fieldTip('Το κανονικό κομμάτι του τίτλου, π.χ. «Hydrogel μάσκα,».')}</span>
          <input type="text" placeholder="Hydrogel μάσκα," oninput="updateWeeklyEditorial('title',this.value)" value="${v('title')}">
        </label>
        <label class="adm-field"><span>Τίτλος — έμφαση ${fieldTip('Το κομμάτι που εμφανίζεται πλάγια (italic), π.χ. «η νύχτα που αλλάζει το δέρμα.».')}</span>
          <input type="text" placeholder="η νύχτα που αλλάζει το δέρμα." oninput="updateWeeklyEditorial('titleEm',this.value)" value="${v('titleEm')}">
        </label>
      </div>

      <label class="adm-field"><span>Εισαγωγή (lead) ${fieldTip('Η περιγραφική παράγραφος κάτω από τον τίτλο (1-2 προτάσεις).')}</span>
        <textarea rows="2" placeholder="Microneedle collagen film που λιώνει στο δέρμα…" oninput="updateWeeklyEditorial('lead',this.value)">${v('lead')}</textarea>
      </label>

      <label class="adm-field"><span>Αποτέλεσμα ${fieldTip('Το κείμενο μέσα στο κουτί «✦ Αποτέλεσμα».')}</span>
        <textarea rows="2" placeholder="Πλήρης ενυδάτωση · ορατή λάμψη το επόμενο πρωί…" oninput="updateWeeklyEditorial('result',this.value)">${v('result')}</textarea>
      </label>

      <label class="adm-field"><span>Chips ${fieldTip('Οι μικρές ετικέτες-συστατικά, χωρισμένες με κόμμα, π.χ. «Marine Collagen, Microneedle Film, Hydrogel».')}</span>
        <input type="text" placeholder="Marine Collagen, Microneedle Film, Hydrogel" oninput="updateWeeklyEditorial('chips',this.value)" value="${v('chips')}">
      </label>

      <label class="adm-field"><span>Γιατί το επιλέξαμε ${fieldTip('Το κείμενο μετά το «Γιατί το επιλέξαμε:». Το label μπαίνει αυτόματα.')}</span>
        <textarea rows="2" placeholder="η viral TikTok μάσκα που πραγματικά αξίζει…" oninput="updateWeeklyEditorial('why',this.value)">${v('why')}</textarea>
      </label>

      ${renderWeeklyCardEditorial(0, 'Κάρτα 2 — 2ο προϊόν', cards[0] || {})}
      ${renderWeeklyCardEditorial(1, 'Κάρτα 3 — 3ο προϊόν', cards[1] || {})}
    </div>
  `;
}

// Editorial μιας μικρής κάρτας weekly (λιγότερα πεδία από το hero)
function renderWeeklyCardEditorial(slot, label, c){
  const v = k => escapeHTML(c[k] || '');
  return `
    <div style="margin-top:1.5rem;padding-top:1.25rem;border-top:1px dashed var(--line,#e5e0d8)">
      <h4 style="font-family:'Inter',sans-serif;font-size:.85rem;font-weight:600;color:var(--text);margin-bottom:.85rem">${escapeHTML(label)}</h4>

      <div class="adm-form-row">
        <label class="adm-field"><span>Step ${fieldTip('Μικρό label πάνω-αριστερά της κάρτας, π.χ. «Clay», «Eye».')}</span>
          <input type="text" placeholder="Clay" oninput="updateWeeklyCard(${slot},'step',this.value)" value="${v('step')}">
        </label>
        <label class="adm-field"><span>Χρόνος ${fieldTip('Μπαίνει αυτόματα το «· » μπροστά. π.χ. «10\'» ή «10-15\'».')}</span>
          <input type="text" placeholder="10'" oninput="updateWeeklyCard(${slot},'time',this.value)" value="${v('time')}">
        </label>
      </div>

      <div class="adm-form-row">
        <label class="adm-field"><span>Τίτλος ${fieldTip('Το κανονικό κομμάτι του τίτλου, π.χ. «Βαθύς καθαρισμός».')}</span>
          <input type="text" placeholder="Βαθύς καθαρισμός" oninput="updateWeeklyCard(${slot},'title',this.value)" value="${v('title')}">
        </label>
        <label class="adm-field"><span>Τίτλος — έμφαση ${fieldTip('Το πλάγιο (italic) κομμάτι, π.χ. «πόρων.».')}</span>
          <input type="text" placeholder="πόρων." oninput="updateWeeklyCard(${slot},'titleEm',this.value)" value="${v('titleEm')}">
        </label>
      </div>

      <label class="adm-field"><span>Αποτέλεσμα / περιγραφή ${fieldTip('Η σύντομη πρόταση κάτω από τον τίτλο της κάρτας.')}</span>
        <textarea rows="2" placeholder="Για μαύρα στίγματα στη μύτη και πιγούνι…" oninput="updateWeeklyCard(${slot},'result',this.value)">${v('result')}</textarea>
      </label>

      <label class="adm-field"><span>Chips ${fieldTip('Ετικέτες-συστατικά χωρισμένες με κόμμα, π.χ. «Mud Clay, Σαλικυλικό».')}</span>
        <input type="text" placeholder="Mud Clay, Σαλικυλικό" oninput="updateWeeklyCard(${slot},'chips',this.value)" value="${v('chips')}">
      </label>

      <label class="adm-field"><span>Γιατί το επιλέξαμε ${fieldTip('Το κείμενο μετά το «Γιατί το επιλέξαμε:». Το label μπαίνει αυτόματα.')}</span>
        <textarea rows="2" placeholder="ορατά αποτελέσματα από την πρώτη χρήση." oninput="updateWeeklyCard(${slot},'why',this.value)">${v('why')}</textarea>
      </label>
    </div>
  `;
}

function updateWeeklyEditorial(field, value){
  if(!_editingSection) return;
  if(!_editingSection.config || typeof _editingSection.config !== 'object'){
    _editingSection.config = {};
  }
  if(!_editingSection.config.editorial || typeof _editingSection.config.editorial !== 'object'){
    _editingSection.config.editorial = {};
  }
  _editingSection.config.editorial[field] = value;
}

function updateWeeklyCard(slot, field, value){
  if(!_editingSection) return;
  if(!_editingSection.config || typeof _editingSection.config !== 'object'){
    _editingSection.config = {};
  }
  if(!Array.isArray(_editingSection.config.cards)){
    _editingSection.config.cards = [];
  }
  if(!_editingSection.config.cards[slot] || typeof _editingSection.config.cards[slot] !== 'object'){
    _editingSection.config.cards[slot] = {};
  }
  _editingSection.config.cards[slot][field] = value;
}

// Discount input handler — αποθηκεύεται στο config του section
function updateSectionDiscount(value){
  if(!_editingSection) return;
  if(!_editingSection.config || typeof _editingSection.config !== 'object'){
    _editingSection.config = {};
  }
  const pct = Math.max(0, Math.min(50, Number(value) || 0));
  _editingSection.config.discount = pct / 100;
}

// ──────────────────────────────────────────────────────────────
// Save
// ──────────────────────────────────────────────────────────────
async function saveSection(){
  if(!_editingSection) return;
  try {
    const payload = { items: _editingSection.items };
    if(_editingSection.config && Object.keys(_editingSection.config).length){
      payload.config = _editingSection.config;
    }
    const { error } = await window.sb
      .from('site_sections')
      .update(payload)
      .eq('id', _editingSection.id);
    if(error) throw error;
    showToast('Αποθηκεύτηκε ✓');
    loadSectionInline(_editingSection.id);
  } catch(err){
    console.error('[Skinya Admin] saveSection error:', err);
    showToast('Σφάλμα αποθήκευσης');
  }
}
