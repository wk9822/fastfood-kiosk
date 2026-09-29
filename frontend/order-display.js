document.addEventListener('DOMContentLoaded', function () {
    const API_BASE = 'http://localhost:8000';
    const preparingEl = document.getElementById('preparing-orders');
    const readyEl = document.getElementById('ready-orders');

    async function updateDisplay() {
        let orders = [];
        try {
            const response = await fetch(`${API_BASE}/orders`);
            if (!response.ok) {
                throw new Error('Failed to load orders');
            }
            orders = await response.json();
        } catch (err) {
            console.error(err);
            preparingEl.innerHTML = '';
            readyEl.innerHTML = '';
            return;
        }

        // Clear current display
        preparingEl.innerHTML = '';
        readyEl.innerHTML = '';

        const now = Date.now();
        const twoHoursAgo = now - 2 * 60 * 60 * 1000;

        orders.forEach(order => {
            const orderTime = new Date(order.timestamp).getTime();
            const readyTime = order.readyTimestamp ? new Date(order.readyTimestamp).getTime() : null;

            // Only show orders from last 2 hours and not completed
            if (orderTime > twoHoursAgo && order.status !== 'completed') {
                if (order.status === 'preparing') {
                    preparingEl.innerHTML += `<div class="order-number">${order.id}</div>`;
                } else if (order.status === 'ready') {
                    // If it's been ready for more than 1 minute, skip adding it
                    if (readyTime && now - readyTime >= 1 * 60 * 1000) {
                        // too old in READY state, do not display
                    } else {
                        readyEl.innerHTML += `<div class="order-number">${order.id}</div>`;
                    }
                }
            }
        });
    }

    updateDisplay();
    setInterval(updateDisplay, 45000); // Every 45 seconds (reduced to save Firestore 50k/day quota)
});