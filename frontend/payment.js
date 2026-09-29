document.addEventListener('DOMContentLoaded', function() {
    const API_BASE = 'http://localhost:8000';
    const paymentMethods = document.querySelectorAll('.payment-method');
    const confirmPaymentBtn = document.getElementById('confirm-payment-btn');
    const customerLogo = document.getElementById('customer-logo');
    let selectedMethod = 'cash'; // default

    // Define logo loading function first
    async function loadLogoFromApi() {
        // First, immediately set logo from localStorage if available (instant load)
        const savedLogo = localStorage.getItem('brandLogo');
        if (savedLogo && customerLogo) {
            customerLogo.src = savedLogo;
        }

        // Then try to get updated logo from API
        try {
            const response = await fetch(`${API_BASE}/settings`);
            if (response.ok) {
                const data = await response.json();
                if (data && data.logoUrl && customerLogo) {
                    customerLogo.src = data.logoUrl;
                    // Update localStorage with latest logo
                    localStorage.setItem('brandLogo', data.logoUrl);
                }
            }
        } catch (err) {
            // API not available, already using localStorage logo
            console.log('Backend not available, using cached logo');
        }
    }

    // Load logo on page load and refresh periodically
    loadLogoFromApi();
    setInterval(loadLogoFromApi, 60000);
    
    // Payment method selection
    paymentMethods.forEach(method => {
        method.addEventListener('click', function() {
            paymentMethods.forEach(m => m.classList.remove('selected'));
            this.classList.add('selected');
            selectedMethod = this.dataset.method;
        });
    });

    // Auto-select first payment method
    if (paymentMethods.length > 0) {
        paymentMethods[0].click();
    }

    // Payment confirmation
    confirmPaymentBtn.addEventListener('click', async function() {
        const cart = JSON.parse(localStorage.getItem('cart')) || [];
        
        // Validate cart
        if (cart.length === 0) {
            alert('Your cart is empty!');
            return;
        }

        // Disable button during processing
        confirmPaymentBtn.disabled = true;
        confirmPaymentBtn.textContent = 'Processing...';

        const now = new Date();

        // Calculate totals
        const subtotal = cart.reduce((sum, item) => {
            const quantity = item.quantity || 1;
            return sum + (item.finalPrice * quantity);
        }, 0);
        const taxRate = parseFloat(localStorage.getItem('taxRate')) || 10;
        const taxAmount = subtotal * (taxRate / 100);
        const total = subtotal + taxAmount;

        // Create order payload for backend (order ID generated server-side: ORD-YYYYMMDD-0001)
        const orderType = localStorage.getItem('orderType') || 'dine-in';
        const order = {
            items: cart.map(item => ({
                menuItemId: item.menuItemId || item.id,
                name: item.name,
                selectedSize: item.selectedSize,
                unitPrice: item.finalPrice,
                quantity: item.quantity || 1,
                customizations: item.customizations || []
            })),
            status: 'preparing',
            timestamp: now.toISOString(),
            paymentMethod: selectedMethod,
            orderType: orderType,
            subtotal,
            taxAmount,
            total
        };

        try {
            const response = await fetch(`${API_BASE}/orders`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(order)
            });

            if (!response.ok) {
                throw new Error('Failed to create order');
            }

            const createdOrder = await response.json();

            // Clear cart locally after successful order creation
            localStorage.removeItem('cart');

            // Redirect to receipt (order ID from server: daily ascending 0001-9999)
            const targetUrl = `receipt.html?orderId=${createdOrder.id}`;
            if (typeof navigateWithFade === 'function') {
                navigateWithFade(targetUrl);
            } else {
                window.location.href = targetUrl;
            }
        } catch (err) {
            console.error(err);
            alert('There was a problem processing your order. Please try again.');
            confirmPaymentBtn.disabled = false;
            confirmPaymentBtn.textContent = 'Confirm Payment';
        }
    });
});
