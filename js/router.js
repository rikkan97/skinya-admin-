/* ====================================================================
   ROUTER.JS — Single-page navigation (sidebar items + content views)
   ==================================================================== */

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  orders:    'Παραγγελίες',
  products:  'Προϊόντα',
  stock:     'Stock',
  offers:    'Προσφορές',
  customers: 'Πελάτες',
  coupons:   'Κουπόνια',
  ui:        'Site UI',
  bank:      'Τραπεζικός λογαριασμός'
};

const VIEW_LOADERS = {
  dashboard: () => typeof loadDashboard  === 'function' && loadDashboard(),
  orders:    () => typeof loadOrders     === 'function' && loadOrders(),
  products:  () => typeof loadProducts   === 'function' && loadProducts(),
  stock:     () => typeof loadStock      === 'function' && loadStock(),
  offers:    () => typeof loadOffers     === 'function' && loadOffers(),
  customers: () => typeof loadCustomers  === 'function' && loadCustomers(),
  coupons:   () => typeof loadCoupons    === 'function' && loadCoupons(),
  ui:        () => typeof loadSections   === 'function' && loadSections(),
  bank:      () => typeof loadBank       === 'function' && loadBank()
};

function switchView(view){
  if(!VIEW_TITLES[view]) view = 'dashboard';

  // Toggle nav active state
  document.querySelectorAll('.nav-item[data-view]').forEach(el=>{
    el.classList.toggle('is-active', el.dataset.view === view);
  });
  // Toggle view panels
  document.querySelectorAll('.view[data-view]').forEach(el=>{
    el.classList.toggle('is-active', el.dataset.view === view);
  });
  // Update topbar title + actions
  document.getElementById('viewTitle').textContent = VIEW_TITLES[view];
  const actions = document.getElementById('viewActions');
  if(actions){
    actions.innerHTML = '';
    if(view === 'products'){
      actions.innerHTML = '<button class="btn-primary" onclick="openProductModal(null)"><span>+ Νέο προϊόν</span></button>';
    } else if(view === 'coupons'){
      actions.innerHTML = '<button class="btn-primary" onclick="openCouponModal(null)"><span>+ Νέο κουπόνι</span></button>';
    } else if(view === 'stock'){
      actions.innerHTML = '<button class="btn-primary" id="stockSaveBtn" onclick="saveStock()" disabled><span>Αποθήκευση</span></button>';
    } else if(view === 'offers'){
      actions.innerHTML = '<button class="btn-primary" id="offersSaveBtn" onclick="saveOffers()" disabled><span>Αποθήκευση</span></button>';
    }
  }
  // Update hash
  if(location.hash !== '#' + view){
    history.pushState(null, '', '#' + view);
  }
  // Call the view's loader
  VIEW_LOADERS[view]?.();
}

document.addEventListener('DOMContentLoaded', ()=>{
  // Sidebar click handlers
  document.querySelectorAll('.nav-item[data-view], .link[data-view]').forEach(el=>{
    el.addEventListener('click', (e)=>{
      e.preventDefault();
      switchView(el.dataset.view);
    });
  });
});

window.addEventListener('hashchange', ()=>{
  const hash = location.hash.replace('#','') || 'dashboard';
  if(VIEW_TITLES[hash]) switchView(hash);
});
