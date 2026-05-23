/* ====================================================================
   BANK.JS — Στοιχεία τραπεζικής κατάθεσης (store_settings, single row id=1)
   • loadBank  — φέρνει τα στοιχεία και γεμίζει τη φόρμα
   • saveBank  — upsert στη γραμμή id=1
   ==================================================================== */

async function loadBank(){
  const form = document.getElementById('bankForm');
  if(!form) return;
  try {
    const { data, error } = await window.sb
      .from('store_settings')
      .select('bank_name, bank_holder, bank_iban, bank_swift')
      .eq('id', 1)
      .maybeSingle();
    if(error) throw error;
    const s = data || {};
    form.bank_name.value   = s.bank_name   || '';
    form.bank_holder.value = s.bank_holder || '';
    form.bank_iban.value   = s.bank_iban   || '';
    form.bank_swift.value  = s.bank_swift  || '';
  } catch(err){
    console.error('[Skinya Admin] loadBank error:', err);
    showToast('Σφάλμα φόρτωσης στοιχείων');
  }
}

async function saveBank(e){
  e.preventDefault();
  const form = e.currentTarget;
  const btn = document.getElementById('bankSaveBtn');
  const original = btn?.innerHTML;
  if(btn){ btn.disabled = true; btn.innerHTML = '<span>Αποθήκευση…</span>'; }

  try {
    const fd = new FormData(form);
    const payload = {
      id: 1,
      bank_name:   fd.get('bank_name')?.trim()   || null,
      bank_holder: fd.get('bank_holder')?.trim() || null,
      bank_iban:   fd.get('bank_iban')?.trim().replace(/\s+/g,' ') || null,
      bank_swift:  fd.get('bank_swift')?.trim()  || null,
      bank_note:   null,
      updated_at:  new Date().toISOString()
    };
    const { error } = await window.sb.from('store_settings').upsert(payload, { onConflict: 'id' });
    if(error) throw error;
    showToast('Τραπεζικά στοιχεία αποθηκεύτηκαν ✓');
  } catch(err){
    console.error('[Skinya Admin] saveBank error:', err);
    showToast('Σφάλμα αποθήκευσης');
  } finally {
    if(btn){ btn.disabled = false; btn.innerHTML = original; }
  }
}
