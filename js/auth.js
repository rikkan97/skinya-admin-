/* ====================================================================
   AUTH.JS — Login, admin role check, logout
   --------------------------------------------------------------------
   • checkAdminAccess()  — verifies user is logged in AND has admin role
   • adminLogin()        — handles login form submit
   • adminLogout()       — signs out
   ==================================================================== */

window.currentAdmin = null;

async function checkAdminAccess(){
  const { data: { session } } = await window.sb.auth.getSession();
  if(!session?.user) return false;

  // Έλεγξε το role από το customers table
  const { data, error } = await window.sb
    .from('customers')
    .select('id, email, role, first_name, last_name')
    .eq('id', session.user.id)
    .single();

  if(error || !data || data.role !== 'admin'){
    return false;
  }
  window.currentAdmin = data;
  return true;
}

async function adminLogin(e){
  e.preventDefault();
  const form = e.currentTarget;
  const btn = document.getElementById('loginBtn');
  const errBox = document.getElementById('authError');
  const email = form.querySelector('input[name="email"]').value.trim();
  const password = form.querySelector('input[name="password"]').value;

  errBox.textContent = '';
  btn.disabled = true;
  const orig = btn.querySelector('span').textContent;
  btn.querySelector('span').textContent = 'Σύνδεση…';

  try {
    const { error } = await window.sb.auth.signInWithPassword({ email, password });
    if(error) throw error;

    const isAdmin = await checkAdminAccess();
    if(!isAdmin){
      await window.sb.auth.signOut();
      throw new Error('Ο λογαριασμός σου δεν έχει admin δικαιώματα.');
    }
    // Επιτυχία → δείξε το admin app
    showAdminApp();
  } catch(err){
    console.error('[Skinya Admin] login error:', err);
    let msg = err.message || 'Σφάλμα σύνδεσης';
    if(msg.includes('Invalid login credentials')) msg = 'Λάθος email ή κωδικός';
    else if(msg.includes('Email not confirmed')) msg = 'Επιβεβαίωσε πρώτα το email σου';
    errBox.textContent = msg;
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = orig;
  }
}

// Show/hide password (ματάκι) — δουλεύει για κάθε input μέσα σε .pw-wrap
function togglePassword(btn){
  const input = btn.parentElement?.querySelector('input');
  if(!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.classList.toggle('is-on', show);
  btn.setAttribute('aria-label', show ? 'Απόκρυψη κωδικού' : 'Εμφάνιση κωδικού');
}

// ──────────────────────────────────────────────────────────────
// Panel switching (login ↔ forgot ↔ reset)
// ──────────────────────────────────────────────────────────────
function showAuthPanel(name){
  document.querySelectorAll('[data-auth-panel]').forEach(p=>{
    p.hidden = p.dataset.authPanel !== name;
  });
}
function showLoginPanel(){ showAuthPanel('login'); }
function showForgotPanel(){
  document.getElementById('forgotMsg').textContent = '';
  // prefill το email από τη φόρμα login αν υπάρχει
  const loginEmail = document.querySelector('#loginForm input[name="email"]')?.value.trim();
  const forgotEmail = document.querySelector('#forgotForm input[name="email"]');
  if(loginEmail && forgotEmail && !forgotEmail.value) forgotEmail.value = loginEmail;
  showAuthPanel('forgot');
}
function showResetPanel(){
  document.getElementById('resetMsg').textContent = '';
  showAuthPanel('reset');
}

// ──────────────────────────────────────────────────────────────
// Αποστολή email επαναφοράς κωδικού (Resend μέσω Supabase Auth)
// ──────────────────────────────────────────────────────────────
async function sendResetEmail(e){
  e.preventDefault();
  const form = e.currentTarget;
  const btn = document.getElementById('forgotBtn');
  const msg = document.getElementById('forgotMsg');
  const email = form.querySelector('input[name="email"]').value.trim();

  msg.style.color = '';
  msg.textContent = '';
  btn.disabled = true;
  const orig = btn.querySelector('span').textContent;
  btn.querySelector('span').textContent = 'Αποστολή…';

  try {
    // redirectTo = αυτή ακριβώς η σελίδα του admin (πρέπει να είναι στα
    // Redirect URLs του Supabase → Authentication → URL Configuration).
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await window.sb.auth.resetPasswordForEmail(email, { redirectTo });
    if(error) throw error;

    msg.style.color = 'var(--success, #4caf7a)';
    msg.textContent = 'Στάλθηκε! Έλεγξε το email σου για τον σύνδεσμο.';
  } catch(err){
    console.error('[Skinya Admin] resetPasswordForEmail error:', err);
    msg.style.color = '';
    msg.textContent = err.message || 'Σφάλμα αποστολής';
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = orig;
  }
}

// ──────────────────────────────────────────────────────────────
// Ορισμός νέου κωδικού (μετά το κλικ στον σύνδεσμο του email)
// ──────────────────────────────────────────────────────────────
async function submitNewPassword(e){
  e.preventDefault();
  const form = e.currentTarget;
  const btn = document.getElementById('resetBtn');
  const msg = document.getElementById('resetMsg');
  const pw1 = form.querySelector('input[name="password"]').value;
  const pw2 = form.querySelector('input[name="password2"]').value;

  msg.style.color = '';
  msg.textContent = '';
  if(pw1 !== pw2){ msg.textContent = 'Οι κωδικοί δεν ταιριάζουν'; return; }
  if(pw1.length < 6){ msg.textContent = 'Τουλάχιστον 6 χαρακτήρες'; return; }

  btn.disabled = true;
  const orig = btn.querySelector('span').textContent;
  btn.querySelector('span').textContent = 'Αποθήκευση…';

  try {
    const { error } = await window.sb.auth.updateUser({ password: pw1 });
    if(error) throw error;

    // Καθάρισε το recovery token από το URL ώστε refresh να μην το ξανα-ανοίξει.
    history.replaceState(null, '', window.location.pathname);

    const isAdmin = await checkAdminAccess();
    if(!isAdmin){
      await window.sb.auth.signOut();
      throw new Error('Ο λογαριασμός δεν έχει admin δικαιώματα.');
    }
    showToast('Ο κωδικός ενημερώθηκε ✓');
    showAdminApp();
  } catch(err){
    console.error('[Skinya Admin] updateUser error:', err);
    msg.textContent = err.message || 'Σφάλμα αποθήκευσης';
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = orig;
  }
}

async function adminLogout(){
  await window.sb.auth.signOut();
  window.currentAdmin = null;
  showAuthScreen();
  showToast('Αποσυνδέθηκες');
}

function showAuthScreen(){
  document.getElementById('authScreen').hidden = false;
  document.getElementById('adminApp').hidden = true;
  showLoginPanel();
}

function showAdminApp(){
  document.getElementById('authScreen').hidden = true;
  document.getElementById('adminApp').hidden = false;
  // Set email στο sidebar
  const emailEl = document.getElementById('adminUserEmail');
  if(emailEl) emailEl.textContent = window.currentAdmin?.email || '—';
  // Φόρτωσε dashboard
  if(typeof loadDashboard === 'function') loadDashboard();
}
