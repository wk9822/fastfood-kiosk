document.addEventListener('DOMContentLoaded', async function() {
    const API_BASE = 'http://localhost:8000';
    const orderId = new URLSearchParams(window.location.search).get('orderId');

    if (!orderId) {
        alert('Missing order ID');
        window.location.href = 'index.html';
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/orders/${orderId}`);
        if (!response.ok) {
            throw new Error('Order not found');
        }
        const order = await response.json();

        // Display order info
        document.getElementById('order-id').textContent = order.id;
        const orderType = order.orderType || 'dine-in';
        document.getElementById('order-type').textContent = orderType === 'take-away' ? 'Take Away' : 'Dine In';
        document.getElementById('order-time').textContent = new Date(order.timestamp).toLocaleString();

        // Group items (include customizations in key - different customizations = different line)
        const itemGroups = {};
        order.items.forEach(item => {
            const custKey = (item.customizations || []).sort().join(',');
            const key = `${item.name}-${item.selectedSize}-${custKey}`;
            if (!itemGroups[key]) {
                itemGroups[key] = { ...item, quantity: 0 };
            }
            itemGroups[key].quantity += item.quantity || 1;
        });

        // Display items and calculate total
        let total = 0;
        const itemsEl = document.getElementById('receipt-items');
        
        Object.values(itemGroups).forEach(item => {
            const unitPrice = item.unitPrice || item.finalPrice || 0;
            const itemTotal = unitPrice * item.quantity;
            total += itemTotal;
            
            const customizationsText = (item.customizations && item.customizations.length > 0)
                ? ` + ${item.customizations.join(', ')}` : '';
            
            itemsEl.innerHTML += `
                <div class="flex justify-between items-start gap-4 py-3 border-b border-gray-100 last:border-0">
                    <div class="flex-1 min-w-0">
                        <span class="inline-block bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded mr-2">${item.quantity}x</span>
                        <span class="text-gray-800">${item.name}</span>
                        <span class="text-gray-500 text-sm">(${item.selectedSize})</span>
                        ${customizationsText ? `<span class="block text-gray-500 text-sm mt-0.5">+ ${item.customizations.join(', ')}</span>` : ''}
                    </div>
                    <div class="text-orange-600 font-semibold shrink-0">$${itemTotal.toFixed(2)}</div>
                </div>
            `;
        });

        document.getElementById('receipt-total').textContent = total.toFixed(2);
    } catch (err) {
        console.error(err);
        alert('Order not found');
        window.location.href = 'index.html';
    }

    // This order is finished; next time on the menu we want to ask again
    try {
        localStorage.removeItem('orderType');
    } catch (e) {}
});

