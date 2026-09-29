document.addEventListener('DOMContentLoaded', function() {
    const API_BASE = 'http://localhost:8000';
    
    // DOM Elements
    const ordersTbody = document.getElementById('orders-tbody');
    const statusFilter = document.getElementById('status-filter');
    const dateFrom = document.getElementById('date-from');
    const dateTo = document.getElementById('date-to');
    const orderTypeFilter = document.getElementById('order-type-filter');
    const paymentFilter = document.getElementById('payment-filter');
    const applyFiltersBtn = document.getElementById('apply-filters');
    const resetFiltersBtn = document.getElementById('reset-filters');
    const orderModal = document.getElementById('order-modal');
    const orderDetailContent = document.getElementById('order-detail-content');
    const closeBtn = document.querySelector('.close-btn');

    // Stats elements
    const totalOrdersEl = document.getElementById('total-orders');
    const totalRevenueEl = document.getElementById('total-revenue');
    const todayOrdersEl = document.getElementById('today-orders');
    const avgOrderEl = document.getElementById('avg-order');

    let allOrders = [];
    let filteredOrders = [];

    // Initialize
    loadOrders();

    // Event Listeners
    applyFiltersBtn.addEventListener('click', applyFilters);
    resetFiltersBtn.addEventListener('click', resetFilters);
    closeBtn.addEventListener('click', closeModal);
    
    orderModal.addEventListener('click', function(e) {
        if (e.target === orderModal) {
            closeModal();
        }
    });

    // Date picker: calendar with DD/MM/YYYY display (day/month/year)
    const fpFrom = flatpickr(dateFrom, {
        dateFormat: 'Y-m-d',
        altInput: true,
        altFormat: 'd/m/Y',
        allowInput: false
    });
    const fpTo = flatpickr(dateTo, {
        dateFormat: 'Y-m-d',
        altInput: true,
        altFormat: 'd/m/Y',
        allowInput: false
    });
    setDatesToToday();

    async function loadOrders() {
        try {
            const response = await fetch(`${API_BASE}/orders`);
            if (!response.ok) {
                throw new Error('Failed to load orders');
            }
            allOrders = await response.json();
            
            // Sort by timestamp (newest first)
            allOrders.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            applyFilters();
        } catch (err) {
            console.error(err);
            ordersTbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: red;">Error loading orders. Make sure the backend is running.</td></tr>';
        }
    }

    function applyFilters() {
        const status = statusFilter.value;
        const orderType = orderTypeFilter.value;
        const payment = paymentFilter.value;
        const fromDate = dateFrom.value ? new Date(dateFrom.value + 'T00:00:00') : null;
        const toDate = dateTo.value ? new Date(dateTo.value + 'T23:59:59.999') : null;

        filteredOrders = allOrders.filter(order => {
            // Status filter
            if (status !== 'all' && order.status !== status) {
                return false;
            }

            // Order type filter (dine-in / take-away)
            if (orderType !== 'all') {
                const normalized = (order.orderType || 'dine-in').toLowerCase();
                if (normalized !== orderType) return false;
            }

            // Payment filter
            if (payment !== 'all' && order.paymentMethod !== payment) {
                return false;
            }

            // Date filter - only show orders within selected date range
            const orderDate = new Date(order.timestamp);
            if (fromDate && orderDate < fromDate) {
                return false;
            }
            if (toDate && orderDate > toDate) {
                return false;
            }

            return true;
        });

        renderOrders();
        updateStats();
    }

    function setDatesToToday() {
        const today = new Date();
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const d = String(today.getDate()).padStart(2, '0');
        const val = `${y}-${m}-${d}`;
        fpFrom.setDate(val, false);
        fpTo.setDate(val, false);
    }

    function resetFilters() {
        statusFilter.value = 'all';
        orderTypeFilter.value = 'all';
        paymentFilter.value = 'all';
        setDatesToToday();
        applyFilters();
    }

    function renderOrders() {
        if (filteredOrders.length === 0) {
            ordersTbody.innerHTML = '<tr><td colspan="8"><div class="empty-state">No orders found matching your filters.</div></td></tr>';
            return;
        }

        ordersTbody.innerHTML = filteredOrders.map(order => {
            const date = new Date(order.timestamp);
            const itemCount = order.items.length;
            
            const orderTypeDisplay = (order.orderType || 'dine-in') === 'take-away' ? 'Take Away' : 'Dine In';
            return `
                <tr>
                    <td><strong>${order.id}</strong></td>
                    <td>
                        ${date.toLocaleDateString()}<br>
                        <small style="color: #666;">${date.toLocaleTimeString()}</small>
                    </td>
                    <td>${orderTypeDisplay}</td>
                    <td>${itemCount} item${itemCount !== 1 ? 's' : ''}</td>
                    <td><strong>$${order.total.toFixed(2)}</strong></td>
                    <td>${capitalizeFirst(order.paymentMethod)}</td>
                    <td><span class="status-badge status-${order.status}">${order.status}</span></td>
                    <td>
                        <button class="view-btn" onclick="viewOrder('${order.id}')">View Receipt</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function updateStats() {
        // Total orders
        totalOrdersEl.textContent = filteredOrders.length;

        // Total revenue
        const totalRevenue = filteredOrders.reduce((sum, order) => sum + order.total, 0);
        totalRevenueEl.textContent = `$${totalRevenue.toFixed(2)}`;

        // Today's completed orders
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayOrders = filteredOrders.filter(order => {
            const orderDate = new Date(order.timestamp);
            orderDate.setHours(0, 0, 0, 0);
            return orderDate.getTime() === today.getTime() && order.status === 'completed';
        });
        todayOrdersEl.textContent = todayOrders.length;

        // Average order value
        const avgOrder = filteredOrders.length > 0 ? totalRevenue / filteredOrders.length : 0;
        avgOrderEl.textContent = `$${avgOrder.toFixed(2)}`;
    }

    window.viewOrder = function(orderId) {
        const order = allOrders.find(o => o.id === orderId);
        if (!order) return;

        const date = new Date(order.timestamp);
        
        // Group items by name and size
        const itemGroups = {};
        order.items.forEach(item => {
            const key = `${item.name}-${item.selectedSize}`;
            if (!itemGroups[key]) {
                itemGroups[key] = {
                    name: item.name,
                    size: item.selectedSize,
                    price: item.unitPrice,
                    quantity: 0
                };
            }
            itemGroups[key].quantity += item.quantity;
        });

        orderDetailContent.innerHTML = `
            <h2 style="color: #ff6b00; margin-top: 0;">Order Receipt</h2>
            
            <div class="receipt-detail">
                <h3>Order Information</h3>
                <div class="detail-row">
                    <span class="detail-label">Order ID:</span>
                    <span>${order.id}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Date & Time:</span>
                    <span>${date.toLocaleString()}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Status:</span>
                    <span class="status-badge status-${order.status}">${order.status}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Order Type:</span>
                    <span>${(order.orderType || 'dine-in') === 'take-away' ? 'Take Away' : 'Dine In'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Payment Method:</span>
                    <span>${capitalizeFirst(order.paymentMethod)}</span>
                </div>
            </div>

            <div class="receipt-detail">
                <h3>Order Items</h3>
                <div class="items-list">
                    ${Object.values(itemGroups).map(item => `
                        <div class="item-row">
                            <div>
                                <strong>${item.quantity}x ${item.name}</strong><br>
                                <small style="color: #666;">Size: ${capitalizeFirst(item.size)}</small>
                            </div>
                            <div style="text-align: right;">
                                <strong>$${(item.price * item.quantity).toFixed(2)}</strong><br>
                                <small style="color: #666;">@ $${item.price.toFixed(2)} each</small>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="receipt-detail">
                <h3>Payment Summary</h3>
                <div class="detail-row">
                    <span class="detail-label">Subtotal:</span>
                    <span>$${order.subtotal.toFixed(2)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Tax:</span>
                    <span>$${order.taxAmount.toFixed(2)}</span>
                </div>
                <div class="detail-row total-row">
                    <span>TOTAL:</span>
                    <span>$${order.total.toFixed(2)}</span>
                </div>
            </div>

            ${order.readyTimestamp ? `
                <div class="receipt-detail">
                    <div class="detail-row">
                        <span class="detail-label">Ready Time:</span>
                        <span>${new Date(order.readyTimestamp).toLocaleString()}</span>
                    </div>
                </div>
            ` : ''}
        `;

        orderModal.style.display = 'flex';
    };

    function closeModal() {
        orderModal.style.display = 'none';
    }

    function capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    // Auto-refresh every 60 seconds (reduced to save Firestore 50k/day quota)
    setInterval(loadOrders, 60000);
});
