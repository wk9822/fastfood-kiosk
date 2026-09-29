document.addEventListener('DOMContentLoaded', function() {
    const API_BASE = 'http://localhost:8000';
    const preparingList = document.getElementById('preparing-list');
    const readyList = document.getElementById('ready-list');
    const countPreparingEl = document.getElementById('count-preparing');
    const countReadyEl = document.getElementById('count-ready');
    const kitchenLogo = document.getElementById('kitchen-logo');
    const AUTO_COMPLETE_MINUTES = 5; // Auto-complete ready orders after 5 minutes
    let lastLogoUrl = '';

    async function loadOrders() {
        let activeOrders = [];
        try {
            const response = await fetch(`${API_BASE}/orders`);
            if (!response.ok) {
                throw new Error('Failed to load orders');
            }
            const orders = await response.json();
            activeOrders = orders.filter(o => o.status !== 'completed');
            
            // Auto-complete orders that have been ready for too long
            const now = new Date();
            for (const order of activeOrders) {
                if (order.status === 'ready' && order.readyTimestamp) {
                    const readyTime = new Date(order.readyTimestamp);
                    const minutesElapsed = (now - readyTime) / (1000 * 60);
                    
                    if (minutesElapsed >= AUTO_COMPLETE_MINUTES) {
                        // Auto-complete this order
                        await markOrderCompleted(order.id, true);
                    }
                }
            }
            
            // Reload to get updated list after auto-completion
            const response2 = await fetch(`${API_BASE}/orders`);
            if (response2.ok) {
                const updatedOrders = await response2.json();
                activeOrders = updatedOrders.filter(o => o.status !== 'completed');
            }
        } catch (err) {
            console.error(err);
            if (preparingList && readyList) {
                preparingList.innerHTML = '<p class="text-sm text-red-500 text-center mt-4">Error loading orders</p>';
                readyList.innerHTML = '';
            }
            return;
        }

        const preparingOrders = activeOrders.filter(o => o.status === 'preparing');
        const readyOrders = activeOrders.filter(o => o.status === 'ready');

        if (countPreparingEl) {
            countPreparingEl.textContent = `${preparingOrders.length} ${preparingOrders.length === 1 ? 'order' : 'orders'}`;
        }
        if (countReadyEl) {
            countReadyEl.textContent = `${readyOrders.length} ${readyOrders.length === 1 ? 'order' : 'orders'}`;
        }

        if (preparingList) preparingList.innerHTML = '';
        if (readyList) readyList.innerHTML = '';

        if (preparingOrders.length === 0 && preparingList) {
            preparingList.innerHTML = '<p class="text-sm text-slate-400 text-center mt-6">No orders in process</p>';
        }
        if (readyOrders.length === 0 && readyList) {
            readyList.innerHTML = '<p class="text-sm text-slate-400 text-center mt-6">No ready orders</p>';
        }

        preparingOrders.forEach(order => {
            const normalizedType = (order.orderType || 'dine-in') === 'take-away' ? 'take-away' : 'dine-in';
            const orderTypeLabel = normalizedType === 'take-away' ? 'Take Away' : 'Dine In';
            const orderTypeClass =
                normalizedType === 'take-away'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-100 text-emerald-700';
            // Group identical items (include customizations in key - different customizations = different line)
            const itemGroups = {};
            order.items.forEach(item => {
                const custKey = (item.customizations || []).sort().join(',');
                const key = `${item.name}-${item.selectedSize}-${custKey}`;
                itemGroups[key] = itemGroups[key] || {...item, quantity: 0};
                itemGroups[key].quantity++;
            });

            // Create order card
            const orderEl = document.createElement('div');
            orderEl.className = 'rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm';
            orderEl.innerHTML = `
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                        <div class="text-sm font-semibold text-slate-800">Order #${order.id}</div>
                        <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${orderTypeClass}">
                            ${orderTypeLabel}
                        </span>
                    </div>
                    <div class="text-xs text-slate-500">${new Date(order.timestamp).toLocaleTimeString()}</div>
                </div>
                <div class="mt-2 space-y-1 text-sm text-slate-800">
                    ${Object.values(itemGroups).map(item => {
                        const custText = (item.customizations && item.customizations.length > 0)
                            ? ` + ${item.customizations.join(', ')}` : '';
                        return `
                        <div class="flex items-start gap-2">
                            <div class="font-semibold min-w-[28px] text-center">${item.quantity}x</div>
                            <div class="flex-1">
                                <div>${item.name} (${item.selectedSize})${custText}</div>
                                ${item.description ? `<div class="text-xs text-slate-500 mt-0.5">Note: ${item.description}</div>` : ''}
                            </div>
                        </div>
                    `}).join('')}
                </div>
                <button class="mt-3 inline-flex items-center justify-center rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm mark-ready-btn" data-order-id="${order.id}">
                    Mark as Ready
                </button>
            `;
            if (preparingList) {
                preparingList.appendChild(orderEl);
            }
        });

        readyOrders.forEach(order => {
            const normalizedType = (order.orderType || 'dine-in') === 'take-away' ? 'take-away' : 'dine-in';
            const orderTypeLabel = normalizedType === 'take-away' ? 'Take Away' : 'Dine In';
            const orderTypeClass =
                normalizedType === 'take-away'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-100 text-emerald-700';
            const itemGroups = {};
            order.items.forEach(item => {
                const custKey = (item.customizations || []).sort().join(',');
                const key = `${item.name}-${item.selectedSize}-${custKey}`;
                itemGroups[key] = itemGroups[key] || {...item, quantity: 0};
                itemGroups[key].quantity++;
            });

            const orderEl = document.createElement('div');
            orderEl.className = 'rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm';
            orderEl.innerHTML = `
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                        <div class="text-sm font-semibold text-slate-800">Order #${order.id}</div>
                        <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${orderTypeClass}">
                            ${orderTypeLabel}
                        </span>
                    </div>
                    <div class="text-xs text-slate-500">${new Date(order.timestamp).toLocaleTimeString()}</div>
                </div>
                <div class="mt-2 space-y-1 text-sm text-slate-800">
                    ${Object.values(itemGroups).map(item => {
                        const custText = (item.customizations && item.customizations.length > 0)
                            ? ` + ${item.customizations.join(', ')}` : '';
                        return `
                        <div class="flex items-start gap-2">
                            <div class="font-semibold min-w-[28px] text-center">${item.quantity}x</div>
                            <div class="flex-1">
                                <div>${item.name} (${item.selectedSize})${custText}</div>
                                ${item.description ? `<div class="text-xs text-slate-500 mt-0.5">Note: ${item.description}</div>` : ''}
                            </div>
                        </div>
                    `}).join('')}
                </div>
                <button class="mt-3 inline-flex items-center justify-center rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm picked-up-btn" data-order-id="${order.id}">
                    Order Picked Up
                </button>
            `;
            if (readyList) {
                readyList.appendChild(orderEl);
            }
        });

        // Add event listeners to buttons
        document.querySelectorAll('.mark-ready-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                markOrderReady(this.dataset.orderId);
            });
        });

        document.querySelectorAll('.picked-up-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                markOrderCompleted(this.dataset.orderId);
            });
        });
    }

    async function markOrderReady(orderId) {
        try {
            const now = new Date().toISOString();
            const response = await fetch(`${API_BASE}/orders/${orderId}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status: 'ready',
                    readyTimestamp: now
                })
            });
            if (!response.ok) {
                throw new Error('Failed to update order status');
            }
            await loadOrders();
        } catch (err) {
            console.error(err);
            alert('Unable to mark order as ready. Please try again.');
        }
    }

    async function markOrderCompleted(orderId, isAuto = false) {
        try {
            const response = await fetch(`${API_BASE}/orders/${orderId}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status: 'completed'
                })
            });
            if (!response.ok) {
                throw new Error('Failed to mark order as completed');
            }
            if (!isAuto) {
                await loadOrders();
            }
        } catch (err) {
            console.error(err);
            if (!isAuto) {
                alert('Unable to mark order as picked up. Please try again.');
            }
        }
    }

    async function loadLogoFromApi() {
        if (!kitchenLogo) return;
        try {
            const response = await fetch(`${API_BASE}/settings`);
            if (response.ok) {
                const data = await response.json();
                if (data && data.logoUrl && data.logoUrl !== lastLogoUrl) {
                    lastLogoUrl = data.logoUrl;
                    kitchenLogo.classList.add('logo-updating');
                    kitchenLogo.src = data.logoUrl;
                    setTimeout(() => kitchenLogo.classList.remove('logo-updating'), 300);
                    return;
                }
            }
        } catch (err) {}
        const savedLogo = localStorage.getItem('brandLogo');
        if (savedLogo) {
            kitchenLogo.src = savedLogo;
        }
    }

    // Initial load
    loadOrders();
    
    // Auto-refresh every 60 seconds (reduced to save Firestore 50k/day quota)
    setInterval(loadOrders, 60000);

    // Load logo from backend / localStorage
    loadLogoFromApi();
    setInterval(loadLogoFromApi, 60000);
});