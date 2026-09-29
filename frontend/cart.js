document.addEventListener('DOMContentLoaded', function() {
    const API_BASE = 'http://localhost:8000';
    const cartItemsEl = document.getElementById('cart-items');
    const subtotalEl = document.getElementById('subtotal');
    const taxAmountEl = document.getElementById('tax-amount');
    const totalPriceEl = document.getElementById('total-price');
    const taxRateEl = document.getElementById('tax-rate');
    const checkoutBtn = document.getElementById('checkout-btn');
    const customerLogo = document.getElementById('customer-logo');
    const editExtrasModal = document.getElementById('edit-extras-modal');
    const editExtrasOptions = document.getElementById('edit-extras-options');
    const editExtrasPrice = document.getElementById('edit-extras-price');
    const editExtrasSaveBtn = document.getElementById('edit-extras-save-btn');
    const editExtrasClose = document.querySelector('.edit-extras-close');

    let cart = JSON.parse(localStorage.getItem('cart')) || [];
    const taxRate = parseFloat(localStorage.getItem('taxRate')) || 10;
    let lastLogoUrl = '';
    let editingItemId = null;

    renderCartItems();
    updateCartTotal();
    loadLogoFromApi();
    setInterval(loadLogoFromApi, 60000);

    // Event Listeners
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', () => {
            if (typeof navigateWithFade === 'function') {
                navigateWithFade('payment.html');
            } else {
                window.location.href = 'payment.html';
            }
        });
    }

    editExtrasClose.addEventListener('click', closeEditExtrasModal);
    editExtrasModal.addEventListener('click', function(e) {
        if (e.target === editExtrasModal) closeEditExtrasModal();
    });
    editExtrasSaveBtn.addEventListener('click', saveEditExtras);

    // Functions
    function renderCartItems() {
        if (!cartItemsEl) return;
        
        if (cart.length === 0) {
            cartItemsEl.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;"><p>Your cart is empty</p><a href="index.html" class="btn-primary" style="text-decoration: none;">Browse Menu</a></div>';
            return;
        }
        
        cartItemsEl.innerHTML = cart.map(item => {
            const quantity = item.quantity || 1;
            const itemTotal = item.finalPrice * quantity;
            
            // Build customizations display
            let customizationsHTML = '';
            if (item.customizations && item.customizations.length > 0) {
                customizationsHTML = `<p style="color: #ff6b00; font-size: 13px; margin-top: 5px;">+ ${item.customizations.join(', ')}</p>`;
            }
            
            // Edit extras available for all items (options fetched from API if not in cart)
            const editExtrasBtn = `<button class="edit-extras-btn" data-id="${item.id}" title="Edit extras">✏️ Edit extras</button>`;
            
            return `
            <div class="cart-item" data-id="${item.id}">
                <div class="cart-item-info">
                    <h3>${item.name} (${item.selectedSize})</h3>
                    <p>${item.description || ''}</p>
                    ${customizationsHTML}
                    ${editExtrasBtn}
                    <p style="color: #666; font-size: 14px;">Unit Price: $${item.finalPrice.toFixed(2)}</p>
                </div>
                <div class="cart-item-quantity">
                    <button class="qty-btn decrease-btn" data-id="${item.id}">−</button>
                    <span class="qty-display">${quantity}</span>
                    <button class="qty-btn increase-btn" data-id="${item.id}">+</button>
                </div>
                <div class="cart-item-price">
                    $${itemTotal.toFixed(2)}
                </div>
                <div class="cart-item-controls">
                    <button class="remove-item-btn" data-id="${item.id}">🗑️</button>
                </div>
            </div>
        `;
        }).join('');

        // Add event listeners
        document.querySelectorAll('.remove-item-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                removeFromCart(this.dataset.id);
            });
        });

        document.querySelectorAll('.increase-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                updateQuantity(this.dataset.id, 1);
            });
        });

        document.querySelectorAll('.decrease-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                updateQuantity(this.dataset.id, -1);
            });
        });

        document.querySelectorAll('.edit-extras-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                openEditExtrasModal(this.dataset.id);
            });
        });
    }

    function getBasePriceForSize(item) {
        const basePrice = item.price || 0;
        return item.selectedSize === 'large' ? basePrice * 1.3 : basePrice;
    }

    async function openEditExtrasModal(itemId) {
        const item = cart.find(i => i.id === itemId);
        if (!item) return;
        
        let options = item.customizationOptions || [];
        
        // If item has no customization options in cart, try to fetch from API
        if (options.length === 0) {
            try {
                const response = await fetch(`${API_BASE}/menu`);
                if (response.ok) {
                    const menuItems = await response.json();
                    const menuItem = menuItems.find(m => m.id === item.menuItemId) || menuItems.find(m => m.name === item.name);
                    if (menuItem && menuItem.customizationOptions && menuItem.customizationOptions.length > 0) {
                        options = menuItem.customizationOptions;
                        item.customizationOptions = options;
                    }
                }
            } catch (err) {
                console.log('Could not fetch menu for extras', err);
            }
        }
        
        editingItemId = itemId;
        document.getElementById('edit-extras-title').textContent = `Edit extras: ${item.name} (${item.selectedSize})`;
        
        if (options.length === 0) {
            editExtrasOptions.innerHTML = '<p style="color: #666; font-style: italic;">No extras available for this item.</p>';
            editExtrasPrice.textContent = `$${item.finalPrice.toFixed(2)}`;
            editExtrasSaveBtn.style.display = 'none';
        } else {
            editExtrasSaveBtn.style.display = '';
            editExtrasOptions.innerHTML = options.map(opt => {
                const isChecked = item.customizations && item.customizations.includes(opt.name);
                const priceText = (opt.price && parseFloat(opt.price) > 0) ? `+$${parseFloat(opt.price).toFixed(2)}` : 'Free';
                return `
                    <label class="edit-extras-option">
                        <input type="checkbox" class="edit-extras-checkbox" data-name="${opt.name}" data-price="${opt.price || 0}" ${isChecked ? 'checked' : ''}>
                        <span>${opt.name}</span>
                        <span style="color: #ff6b00; font-weight: bold;">${priceText}</span>
                    </label>
                `;
            }).join('');
            
            editExtrasOptions.querySelectorAll('.edit-extras-checkbox').forEach(cb => {
                cb.addEventListener('change', updateEditExtrasPreview);
            });
            updateEditExtrasPreview();
        }
        
        editExtrasModal.classList.add('show');
    }

    function updateEditExtrasPreview() {
        const item = cart.find(i => i.id === editingItemId);
        if (!item) return;
        
        let basePrice = getBasePriceForSize(item);
        let extraPrice = 0;
        editExtrasOptions.querySelectorAll('.edit-extras-checkbox:checked').forEach(cb => {
            extraPrice += parseFloat(cb.dataset.price) || 0;
        });
        const newPrice = basePrice + extraPrice;
        editExtrasPrice.textContent = `$${newPrice.toFixed(2)}`;
    }

    function saveEditExtras() {
        if (!editingItemId) return;
        
        const item = cart.find(i => i.id === editingItemId);
        if (!item) return;
        
        const selected = [];
        let extraPrice = 0;
        editExtrasOptions.querySelectorAll('.edit-extras-checkbox:checked').forEach(cb => {
            selected.push(cb.dataset.name);
            extraPrice += parseFloat(cb.dataset.price) || 0;
        });
        
        const basePrice = getBasePriceForSize(item);
        item.customizations = selected;
        item.finalPrice = basePrice + extraPrice;
        
        localStorage.setItem('cart', JSON.stringify(cart));
        closeEditExtrasModal();
        renderCartItems();
        updateCartTotal();
    }

    function closeEditExtrasModal() {
        editingItemId = null;
        editExtrasModal.classList.remove('show');
        editExtrasSaveBtn.style.display = '';
    }

    function updateQuantity(id, change) {
        const item = cart.find(item => item.id === id);
        if (!item) return;

        item.quantity = (item.quantity || 1) + change;

        // Remove item if quantity reaches 0
        if (item.quantity <= 0) {
            removeFromCart(id);
            return;
        }

        localStorage.setItem('cart', JSON.stringify(cart));
        renderCartItems();
        updateCartTotal();
    }

    function removeFromCart(id) {
        cart = cart.filter(item => item.id !== id);
        localStorage.setItem('cart', JSON.stringify(cart));
        renderCartItems();
        updateCartTotal();
    }

    function updateCartTotal() {
        const subtotal = cart.reduce((sum, item) => {
            const quantity = item.quantity || 1;
            return sum + (item.finalPrice * quantity);
        }, 0);
        const taxAmount = subtotal * (taxRate / 100);
        const total = subtotal + taxAmount;

        if (subtotalEl) subtotalEl.textContent = subtotal.toFixed(2);
        if (taxAmountEl) taxAmountEl.textContent = taxAmount.toFixed(2);
        if (totalPriceEl) totalPriceEl.textContent = total.toFixed(2);
        if (taxRateEl) taxRateEl.textContent = taxRate;
    }

    async function loadLogoFromApi() {
        try {
            const response = await fetch(`${API_BASE}/settings`);
            if (response.ok) {
                const data = await response.json();
                if (data && data.logoUrl && data.logoUrl !== lastLogoUrl) {
                    lastLogoUrl = data.logoUrl;
                    if (customerLogo) {
                        customerLogo.classList.add('logo-updating');
                        customerLogo.src = data.logoUrl;
                        setTimeout(() => customerLogo.classList.remove('logo-updating'), 300);
                    }
                    return;
                }
            }
        } catch (err) {}
        const savedLogo = localStorage.getItem('brandLogo');
        if (savedLogo && customerLogo) customerLogo.src = savedLogo;
    }
});