/* ====================================================================
   DASHBOARD.JS — Stats overview + recent orders
   ==================================================================== */

async function loadDashboard(){
  loadStats();
  loadRecentOrders();
}

async function loadStats(){
  try {
    // Orders today
    const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
    const { count: ordersToday } = await window.sb
      .from('orders').select('*', { count:'exact', head:true })
      .gte('created_at', startOfDay.toISOString());

    // Total orders (όλες)
    const { count: ordersTotal } = await window.sb
      .from('orders').select('*', { count:'exact', head:true });

    // Total revenue (paid/processing/shipped/delivered)
    const { data: paidOrders } = await window.sb
      .from('orders').select('total')
      .in('status', ['paid','processing','shipped','delivered']);
    const revenue = (paidOrders||[]).reduce((s,o)=>s + Number(o.total||0), 0);

    // Customers count
    const { count: customers } = await window.sb
      .from('customers').select('*', { count:'exact', head:true });

    document.getElementById('statOrdersToday').textContent = ordersToday ?? 0;
    document.getElementById('statOrdersTotal').textContent = ordersTotal ?? 0;
    document.getElementById('statRevenue').textContent     = fmtMoney(revenue);
    document.getElementById('statCustomers').textContent   = customers ?? 0;

    // Pending orders badge
    const { count: pending } = await window.sb
      .from('orders').select('*', { count:'exact', head:true })
      .eq('status', 'pending');
    const badge = document.getElementById('navOrdersBadge');
    if(badge){
      if(pending && pending > 0){
        badge.textContent = pending;
        badge.hidden = false;
      } else {
        badge.hidden = true;
      }
    }
  } catch(err){
    console.error('[Skinya Admin] loadStats error:', err);
  }
}

async function loadRecentOrders(){
  const tbody = document.querySelector('#recentOrdersTable tbody');
  if(!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Φόρτωση…</td></tr>';

  try {
    const { data, error } = await window.sb
      .from('orders')
      .select('id, order_number, customer_email, status, total, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    if(error) throw error;

    if(!data || data.length === 0){
      tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Δεν υπάρχουν παραγγελίες</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(o => `
      <tr style="cursor:pointer" onclick="openOrderModal('${o.id}')">
        <td><strong>${escapeHTML(o.order_number)}</strong></td>
        <td>${escapeHTML(o.customer_email)}</td>
        <td><span class="status-badge status-${o.status}">${ORDER_STATUS_LABEL[o.status]||o.status}</span></td>
        <td>${fmtMoney(o.total)}</td>
        <td class="muted">${fmtDate(o.created_at)}</td>
      </tr>
    `).join('');
  } catch(err){
    console.error('[Skinya Admin] loadRecentOrders error:', err);
    tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Σφάλμα φόρτωσης</td></tr>';
  }
}
