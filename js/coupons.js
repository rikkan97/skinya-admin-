/* ====================================================================
   COUPONS.JS — Coupons CRUD
   ==================================================================== */

async function loadCoupons(){
  const tbody = document.querySelector('#couponsTable tbody');
  if(!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" class="empty-row">Φόρτωση…</td></tr>';

  try {
    const { data, error } = await window.sb
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false });

    if(error) throw error;

    if(!data || data.length === 0){
      tbody.innerHTML = '<tr><td colspan="7" class="empty-row">Κανένα κουπόνι</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(c => `
      <tr>
        <td><strong>${escapeHTML(c.code)}</strong></td>
        <td class="muted">${c.discount_kind === 'percentage' ? 'Ποσοστό' : 'Σταθερό'}</td>
        <td>${c.discount_kind === 'percentage' ? c.discount_value + '%' : fmtMoney(c.discount_value)}</td>
        <td>${c.uses_count || 0}${c.max_uses ? '/'+c.max_uses : ''}</td>
        <td class="muted">${c.valid_until ? fmtDate(c.valid_until) : '—'}</td>
        <td class="${c.is_active ? 'bool-yes' : 'bool-no'}">${c.is_active ? '✓' : '○'}</td>
        <td class="col-actions">
          <button class="row-btn" onclick="openCouponModal('${c.id}')">Edit</button>
          <button class="row-btn row-btn--danger" onclick="deleteCoupon('${c.id}','${escapeHTML(c.code)}')">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch(err){
    console.error('[Skinya Admin] loadCoupons error:', err);
    tbody.innerHTML = '<tr><td colspan="7" class="empty-row">Σφάλμα φόρτωσης</td></tr>';
  }
}

async function openCouponModal(couponId){
  const overlay = document.getElementById('productModalOverlay'); // re-use product modal
  const body = document.getElementById('productModalBody');
  overlay.hidden = false;
  setTimeout(()=>overlay.classList.add('open'), 10);

  let c = null;
  if(couponId){
    const { data, error } = await window.sb.from('coupons').select('*').eq('id', couponId).single();
    if(error){ body.innerHTML = '<p class="muted">Σφάλμα φόρτωσης</p>'; return; }
    c = data;
  }

  body.innerHTML = `
    <h2 style="margin-bottom:1rem">${c ? 'Επεξεργασία κουπονιού' : 'Νέο κουπόνι'}</h2>
    <form class="adm-form" onsubmit="saveCoupon(event, ${c ? `'${c.id}'` : 'null'})">
      <div class="adm-form-row">
        <label class="adm-field"><span>Code ${fieldTip('Ο κωδικός που πληκτρολογεί ο πελάτης στο ταμείο, π.χ. SUMMER20. Μετατρέπεται αυτόματα σε ΚΕΦΑΛΑΙΑ — πρέπει να είναι μοναδικός.')}</span>
          <input type="text" name="code" required value="${escapeHTML(c?.code||'')}" style="text-transform:uppercase">
        </label>
        <label class="adm-field"><span>Τύπος ${fieldTip('Ποσοστό = εκπτωση % επί του συνόλου. Σταθερό = αφαιρείται συγκεκριμένο ποσό σε €.')}</span>
          <select name="discount_kind" required>
            <option value="percentage" ${c?.discount_kind==='percentage'?'selected':''}>Ποσοστό (%)</option>
            <option value="fixed" ${c?.discount_kind==='fixed'?'selected':''}>Σταθερό ποσό (€)</option>
          </select>
        </label>
      </div>
      <div class="adm-form-row">
        <label class="adm-field"><span>Αξία ${fieldTip('Το μέγεθος της έκπτωσης. Αν ο τύπος είναι Ποσοστό → π.χ. 20 (=20%). Αν είναι Σταθερό → π.χ. 10 (=10€).')}</span>
          <input type="number" step="0.01" name="discount_value" required value="${c?.discount_value ?? ''}">
        </label>
        <label class="adm-field"><span>Ελάχιστο σύνολο παραγγελίας ${fieldTip('Το κουπόνι ισχύει μόνο αν το καλάθι ξεπερνά αυτό το ποσό σε €. Άφησέ το κενό για κανένα όριο.')}</span>
          <input type="number" step="0.01" name="min_order_amount" value="${c?.min_order_amount ?? ''}" placeholder="προαιρετικό">
        </label>
      </div>
      <div class="adm-form-row">
        <label class="adm-field"><span>Μέγιστος αριθμός χρήσεων ${fieldTip('Πόσες φορές συνολικά μπορεί να εξαργυρωθεί το κουπόνι. Κενό = απεριόριστες χρήσεις (∞).')}</span>
          <input type="number" name="max_uses" value="${c?.max_uses ?? ''}" placeholder="∞">
        </label>
        <label class="adm-field"><span>Λήγει ${fieldTip('Ημερομηνία & ώρα μετά την οποία το κουπόνι παύει να ισχύει. Κενό = δεν λήγει ποτέ.')}</span>
          <input type="datetime-local" id="couponValidUntil" name="valid_until" class="date-input" value="${c?.valid_until ? c.valid_until.slice(0,16) : ''}">
          <div class="date-presets">
            <button type="button" onclick="setCouponExpiry(7)">+7 ημέρες</button>
            <button type="button" onclick="setCouponExpiry(30)">+1 μήνας</button>
            <button type="button" onclick="setCouponExpiry(90)">+3 μήνες</button>
            <button type="button" class="date-preset--clear" onclick="setCouponExpiry(null)">Χωρίς λήξη</button>
          </div>
        </label>
      </div>
      <label class="adm-field" style="flex-direction:row;align-items:center;gap:.6rem">
        <input type="checkbox" name="is_active" ${(c?.is_active ?? true) ? 'checked' : ''}>
        <span style="letter-spacing:.06em">Ενεργό ${fieldTip('Αν είναι τσεκαρισμένο, το κουπόνι μπορεί να εξαργυρωθεί. Ξετσέκαρε το για να το απενεργοποιήσεις προσωρινά χωρίς διαγραφή.')}</span>
      </label>
      <div class="adm-form-foot">
        <button type="button" class="btn-ghost" onclick="closeProductModal()">Άκυρο</button>
        <button type="submit" class="btn-primary"><span>${c ? 'Αποθήκευση' : 'Δημιουργία'}</span></button>
      </div>
    </form>
  `;
}

// Quick presets για το «Λήγει» — days από τώρα (στο τέλος της ημέρας), ή null = χωρίς λήξη
function setCouponExpiry(days){
  const inp = document.getElementById('couponValidUntil');
  if(!inp) return;
  if(days === null){
    inp.value = '';
  } else {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(23, 59, 0, 0);
    // YYYY-MM-DDTHH:mm σε local time (όχι UTC) για το datetime-local
    const pad = n => String(n).padStart(2, '0');
    inp.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  inp.dispatchEvent(new Event('change'));
}

async function saveCoupon(e, couponId){
  e.preventDefault();
  const form = e.currentTarget;
  try {
    const fd = new FormData(form);
    const payload = {
      code:             fd.get('code')?.toString().trim().toUpperCase(),
      discount_kind:    fd.get('discount_kind'),
      discount_value:   Number(fd.get('discount_value') || 0),
      min_order_amount: fd.get('min_order_amount') ? Number(fd.get('min_order_amount')) : null,
      max_uses:         fd.get('max_uses') ? Number(fd.get('max_uses')) : null,
      valid_until:      fd.get('valid_until') ? new Date(fd.get('valid_until')).toISOString() : null,
      is_active:        !!fd.get('is_active')
    };

    let error;
    if(couponId){
      ({ error } = await window.sb.from('coupons').update(payload).eq('id', couponId));
    } else {
      ({ error } = await window.sb.from('coupons').insert(payload));
    }
    if(error) throw error;

    showToast('Αποθηκεύτηκε ✓');
    closeProductModal();
    loadCoupons();
  } catch(err){
    console.error('[Skinya Admin] saveCoupon error:', err);
    showToast('Σφάλμα: ' + (err.message||''));
  }
}

async function deleteCoupon(couponId, code){
  if(!confirm(`Σίγουρα θες να διαγράψεις το κουπόνι "${code}";`)) return;
  try {
    const { error } = await window.sb.from('coupons').delete().eq('id', couponId);
    if(error) throw error;
    showToast('Διαγράφηκε');
    loadCoupons();
  } catch(err){
    console.error('[Skinya Admin] deleteCoupon error:', err);
    showToast('Σφάλμα');
  }
}
