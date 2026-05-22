/* ====================================================================
   SUPABASE-CLIENT.JS — Initializes the global Supabase client (admin)
   ==================================================================== */

const SUPABASE_URL = 'https://swkdewwmmxsftdmzjqsr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ORVm0gPr-42u4Eif_PRTNQ_Ko1SFnzI';

if (typeof supabase === 'undefined') {
  console.error('[Skinya Admin] Supabase SDK δεν φορτώθηκε');
}

window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

// Helper: show toast
window.showToast = function(msg){
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>t.classList.remove('show'), 2800);
};

// Helper: escape HTML
window.escapeHTML = function(s){
  return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
};

// Helper: εικονίδιο ⓘ με tooltip on hover — επεξήγηση/παράδειγμα δίπλα σε field label.
// down=true → tooltip ανοίγει προς τα κάτω (για κεφαλίδες πινάκων μέσα σε overflow wrapper).
window.fieldTip = function(tip, down){
  return tip ? `<i class="info-tip${down ? ' info-tip--down' : ''}" data-tip="${window.escapeHTML(tip)}">i</i>` : '';
};

// Helper: format date
window.fmtDate = function(iso, opts){
  if(!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('el-GR', opts || {day:'2-digit', month:'short', year:'numeric'});
};

// Helper: format money
window.fmtMoney = function(n){
  return (Number(n)||0).toFixed(2) + '€';
};

// ──────────────────────────────────────────────────────────────
// Helper: convert any image File → webp Blob via Canvas
// ──────────────────────────────────────────────────────────────
window.convertImageToWebp = function(file, maxWidth = 1600, quality = 0.86){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.naturalWidth);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        b => b ? resolve(b) : reject(new Error('webp encoding failed')),
        'image/webp',
        quality
      );
    };
    img.onerror = () => reject(new Error('Δεν ήταν δυνατή η ανάγνωση της εικόνας'));
    img.src = URL.createObjectURL(file);
  });
};

// ──────────────────────────────────────────────────────────────
// Helper: upload an image File as .webp to Supabase Storage
//   → returns the public URL
//   Default bucket: 'media' · subfolders ανά πεδίο (products, founders, ...)
//   IMPORTANT: στο Supabase Dashboard, δημιούργησε bucket "media" (public).
// ──────────────────────────────────────────────────────────────
window.uploadImageAsWebp = async function(file, folder = 'misc'){
  if(!file) throw new Error('Δεν επιλέχθηκε αρχείο');
  if(!file.type.startsWith('image/')) throw new Error('Το αρχείο δεν είναι εικόνα');

  const blob = await window.convertImageToWebp(file);
  const baseName = (file.name || 'image')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .toLowerCase()
    .slice(0, 40) || 'image';
  const path = `${folder}/${baseName}-${Date.now()}.webp`;

  const { error } = await window.sb.storage
    .from('media')
    .upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
  if(error) throw error;

  const { data } = window.sb.storage.from('media').getPublicUrl(path);
  return data.publicUrl;
};

// ──────────────────────────────────────────────────────────────
// Generic <input type="file"> handler for .img-upload widget
//   data-on-url: optional callback name, called with the public URL
//                (χρήσιμο για in-memory editors π.χ. founder photo)
// ──────────────────────────────────────────────────────────────
window.handleImgUpload = async function(input, folder){
  const file = input.files && input.files[0];
  if(!file) return;
  const wrap    = input.closest('.img-upload');
  const status  = wrap.querySelector('.img-upload-status');
  const preview = wrap.querySelector('.img-upload-preview');
  const hidden  = wrap.querySelector('input[type="hidden"]');
  const onUrlAttr = input.getAttribute('data-on-url');

  status.className = 'img-upload-status';
  status.textContent = 'Μετατροπή σε .webp & upload…';
  input.disabled = true;

  try {
    const url = await window.uploadImageAsWebp(file, folder || 'misc');
    if(hidden) hidden.value = url;
    preview.innerHTML = `<img src="${window.escapeHTML(url)}" alt="">`;
    status.classList.add('is-ok');
    status.textContent = '✓ Ανέβηκε ως .webp';

    // Add "remove" button if not present
    if(!wrap.querySelector('.img-upload-clear')){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'img-upload-clear';
      btn.textContent = 'Αφαίρεση';
      btn.onclick = () => window.clearImgUpload(btn);
      wrap.querySelector('.img-upload-controls').appendChild(btn);
    }

    if(onUrlAttr && typeof window[onUrlAttr] === 'function'){
      window[onUrlAttr](url, wrap);
    }
  } catch(err){
    console.error('[Skinya Admin] image upload error:', err);
    status.classList.add('is-error');
    status.textContent = 'Σφάλμα: ' + (err.message || 'upload failed');
    showToast('Σφάλμα upload εικόνας');
  } finally {
    input.disabled = false;
    input.value = '';
  }
};

window.clearImgUpload = function(btn){
  const wrap = btn.closest('.img-upload');
  if(!wrap) return;
  const preview = wrap.querySelector('.img-upload-preview');
  const hidden  = wrap.querySelector('input[type="hidden"]');
  const status  = wrap.querySelector('.img-upload-status');
  if(hidden) hidden.value = '';
  preview.innerHTML = '<span>Καμία εικόνα</span>';
  status.className = 'img-upload-status';
  status.textContent = 'Επιλογή αρχείου — γίνεται μετατροπή σε .webp';
  btn.remove();

  const input = wrap.querySelector('input[type="file"]');
  const onUrlAttr = input?.getAttribute('data-on-url');
  if(onUrlAttr && typeof window[onUrlAttr] === 'function'){
    window[onUrlAttr]('', wrap);
  }
};
