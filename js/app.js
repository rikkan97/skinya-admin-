/* ====================================================================
   APP.JS — Bootstrap (στήνει login form + initial auth check)
   ==================================================================== */

document.addEventListener('DOMContentLoaded', async ()=>{
  // Auth forms
  document.getElementById('loginForm')?.addEventListener('submit', adminLogin);
  document.getElementById('forgotForm')?.addEventListener('submit', sendResetEmail);
  document.getElementById('resetForm')?.addEventListener('submit', submitNewPassword);

  // Αν γυρίσαμε από σύνδεσμο επαναφοράς κωδικού (το hash έχει type=recovery),
  // δείξε τη φόρμα νέου κωδικού — ΟΧΙ auto-login.
  const isRecovery = location.hash.includes('type=recovery');

  // Listen σε auth state changes (recovery / logout from elsewhere)
  window.sb.auth.onAuthStateChange(async (event)=>{
    if(event === 'PASSWORD_RECOVERY'){
      showAuthScreen();
      showResetPanel();
    } else if(event === 'SIGNED_OUT'){
      window.currentAdmin = null;
      showAuthScreen();
    }
  });

  if(isRecovery){
    showAuthScreen();
    showResetPanel();
    return;
  }

  // Initial session check
  const ok = await checkAdminAccess();
  if(ok){
    showAdminApp();
    // Initial view from hash
    const hash = location.hash.replace('#','');
    if(hash && typeof switchView === 'function') switchView(hash);
  } else {
    showAuthScreen();
  }

  // Close modals on overlay click
  document.getElementById('orderModalOverlay')?.addEventListener('click', (e)=>{
    if(e.target.id === 'orderModalOverlay') closeOrderModal();
  });
  document.getElementById('productModalOverlay')?.addEventListener('click', (e)=>{
    if(e.target.id === 'productModalOverlay') closeProductModal();
  });

  // ESC to close modals
  document.addEventListener('keydown', (e)=>{
    if(e.key !== 'Escape') return;
    if(!document.getElementById('orderModalOverlay').hidden) closeOrderModal();
    if(!document.getElementById('productModalOverlay').hidden) closeProductModal();
  });
});
