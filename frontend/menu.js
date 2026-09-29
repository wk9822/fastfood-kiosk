document.addEventListener('DOMContentLoaded', function() {
    const API_BASE = 'http://localhost:8000';
    // DOM Elements
    const menuContainer = document.getElementById('menu-container');
    const cartButton = document.getElementById('cart-button');
    const cartBadge = document.getElementById('cart-badge');
    const sizeModal = document.getElementById('size-modal');
    const sizeOptions = document.getElementById('size-options');
    const itemDescription = document.getElementById('item-description');
    const confirmSizeBtn = document.getElementById('confirm-size-btn');
    const sizeModalTitle = document.getElementById('size-modal-title');
    const customerLogo = document.getElementById('customer-logo');
    const orderTypeOverlay = document.getElementById('order-type-overlay');
    const orderTypeBadge = document.getElementById('order-type-badge');
    const dineInBtn = document.getElementById('dine-in-btn');
    const takeAwayBtn = document.getElementById('take-away-btn');
    const backToOrderTypeBtn = document.getElementById('back-to-order-type');

    const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
    let inactivityTimerId = null;

    let currentItem = null;

    const pageBody = document.body;

    // Reset order and show the "first page" (dine-in / take-away)
    function resetOrderAndShowOrderType() {
        try {
            localStorage.removeItem('orderType');
            localStorage.removeItem('cart');
        } catch (e) {}
        updateCartBadge();
        orderTypeOverlay.classList.remove('hidden');
        orderTypeBadge.textContent = '';
        orderTypeBadge.style.cursor = 'default';
        if (pageBody) {
            pageBody.classList.add('menu-hidden');
        }
        if (inactivityTimerId) {
            clearTimeout(inactivityTimerId);
            inactivityTimerId = null;
        }
    }

    function resetInactivityTimer() {
        if (inactivityTimerId) {
            clearTimeout(inactivityTimerId);
        }
        // Only run inactivity timeout when an order type is already chosen (menu visible)
        const orderType = localStorage.getItem('orderType');
        if (!orderType) {
            inactivityTimerId = null;
            return;
        }
        inactivityTimerId = setTimeout(() => {
            resetOrderAndShowOrderType();
        }, INACTIVITY_TIMEOUT_MS);
    }

    // Order type: show overlay if not chosen, else show badge
    function initOrderType() {
        const orderType = localStorage.getItem('orderType');
        if (!orderType) {
            orderTypeOverlay.classList.remove('hidden');
            orderTypeBadge.textContent = '';
            orderTypeBadge.style.cursor = 'default';
        } else {
            orderTypeOverlay.classList.add('hidden');
            orderTypeBadge.textContent = orderType === 'dine-in' ? 'Dine In' : 'Take Away';
            orderTypeBadge.style.cursor = 'pointer';
            // We already have a selection when loading this page (e.g. coming back from cart)
            resetInactivityTimer();
            if (pageBody) {
                pageBody.classList.remove('menu-hidden');
            }
        }
    }

    orderTypeBadge.addEventListener('click', () => {
        if (localStorage.getItem('orderType')) {
            // Treat changing the order type as starting a brand new order
            resetOrderAndShowOrderType();
        }
    });

    function setOrderType(type) {
        localStorage.setItem('orderType', type);
        orderTypeOverlay.classList.add('hidden');
        orderTypeBadge.textContent = type === 'dine-in' ? 'Dine In' : 'Take Away';
        orderTypeBadge.style.cursor = 'pointer';
        if (pageBody) {
            pageBody.classList.remove('menu-hidden');
        }
        resetInactivityTimer();
    }

    dineInBtn.addEventListener('click', () => setOrderType('dine-in'));
    takeAwayBtn.addEventListener('click', () => setOrderType('take-away'));

    // Back button to go "home" (dine-in / take-away) and clear current cart
    if (backToOrderTypeBtn) {
        backToOrderTypeBtn.addEventListener('click', () => {
            resetOrderAndShowOrderType();
        });
    }

    // Initialize
    initOrderType();
    loadMenu();
    // Refresh menu periodically so changes from admin/backend appear
    setInterval(loadMenu, 60000);
    updateCartBadge();
    setupRealTimeUpdates();

    // Load logo from database (settings), fallback to localStorage
    loadLogoFromApi();

    // Global activity listeners to keep kiosk alive while being used.
    // Any interaction on the menu page resets the 10-minute timer.
    ['click', 'touchstart', 'mousemove', 'keydown'].forEach(eventName => {
        document.addEventListener(eventName, () => {
            // Ignore while the order-type overlay is visible (no order started yet)
            if (!orderTypeOverlay.classList.contains('hidden')) return;
            resetInactivityTimer();
        }, { passive: true });
    });

    // Event Listeners
    confirmSizeBtn.addEventListener('click', addToCart);
    cartButton.addEventListener('click', () => {
        if (typeof navigateWithFade === 'function') {
            navigateWithFade('cart.html');
        } else {
            window.location.href = 'cart.html';
        }
    });

    // Close modal when clicking the X button
    const closeBtn = document.querySelector('.size-modal .close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeSizeModal);
    }

    // Close modal when clicking outside the modal content
    sizeModal.addEventListener('click', function(e) {
        if (e.target === sizeModal) {
            closeSizeModal();
        }
    });

    // Real-time updates
    function setupRealTimeUpdates() {
        // Menu updates
        window.addEventListener('menuUpdated', loadMenu);
        
        // Logo updates
        window.addEventListener('logoUpdated', function(e) {
            customerLogo.src = e.detail.logoUrl;
            customerLogo.classList.add('logo-updating');
            setTimeout(() => {
                customerLogo.classList.remove('logo-updating');
            }, 1000);
        });

        // Poll settings for logo changes (saved from admin to database)
        setInterval(loadLogoFromApi, 60000);
    }

    async function loadLogoFromApi() {
        try {
            const response = await fetch(`${API_BASE}/settings`);
            if (response.ok) {
                const data = await response.json();
                if (data && data.logoUrl) {
                    if (customerLogo.src !== data.logoUrl) {
                        customerLogo.src = data.logoUrl;
                        customerLogo.classList.add('logo-updating');
                        setTimeout(() => customerLogo.classList.remove('logo-updating'), 500);
                    }
                    return;
                }
            }
        } catch (err) {}
        const savedLogo = localStorage.getItem('brandLogo');
        if (savedLogo) customerLogo.src = savedLogo;
    }

    async function loadMenu() {
        try {
            const response = await fetch(`${API_BASE}/menu`);
            if (!response.ok) {
                throw new Error('Failed to load menu');
            }
            const items = await response.json();

            if (!items || items.length === 0) {
                menuContainer.innerHTML = '<p class="empty-menu">Menu is currently being prepared. Please check back later.</p>';
                return;
            }

            // Group items by category
            const groupedItems = items.reduce((acc, item) => {
                if (!acc[item.category]) {
                    acc[item.category] = [];
                }
                acc[item.category].push(item);
                return acc;
            }, {});

            menuContainer.innerHTML = Object.entries(groupedItems).map(([category, categoryItems]) => `
                <div class="category-section">
                    <h2 class="category-title">${formatCategory(category)}</h2>
                    <div class="category-items">
                        ${categoryItems.map(item => `
                            <div class="menu-item" data-id="${item.id}">
                                <img src="${item.imageUrl}" alt="${item.name}">
                                <div class="item-info">
                                    <h3>${item.name}</h3>
                                    <p class="price">$${item.price.toFixed(2)}</p>
                                    ${item.description ? `<p class="description">${item.description}</p>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('');

            // local copy for lookups
            const itemsById = {};
            items.forEach(item => {
                itemsById[item.id] = item;
            });

            // Add click handlers to menu items
            document.querySelectorAll('.menu-item').forEach(itemEl => {
                itemEl.addEventListener('click', function() {
                    const itemId = this.dataset.id;
                    const menuItem = itemsById[itemId];
                    if (menuItem) {
                        currentItem = { ...menuItem };
                        openSizeModal(menuItem);
                    }
                });
            });
        } catch (err) {
            console.error(err);
            menuContainer.innerHTML = '<p class="empty-menu">Unable to load menu. Please try again.</p>';
        }
    }

    function openSizeModal(item) {
        sizeModalTitle.textContent = `Select Size for ${item.name}`;
        itemDescription.innerHTML = item.description ? `<p>${item.description}</p>` : '';
        
        // Ingredients (display only) - shown at bottom before extra add-ons
        const ingredientsHTML = (item.ingredients && item.ingredients.length > 0)
            ? `<div class="ingredients-section" style="margin:12px 0;padding:10px;background:#f9f9f9;border-radius:6px;"><strong style="color:#333;">Ingredients:</strong> ${formatIngredientsDisplay(item.ingredients)}</div>`
            : '';
        
        // Build customization options HTML
        let customizationsHTML = '';
        if (item.customizationOptions && item.customizationOptions.length > 0) {
            customizationsHTML = `
                <div class="customization-section">
                    <h4>Customizations (Optional)</h4>
                    ${item.customizationOptions.map(opt => `
                        <label class="customization-option">
                            <input type="checkbox" class="custom-checkbox" data-option-id="${opt.id}" data-option-name="${opt.name}" data-option-price="${opt.price}">
                            <span>${opt.name}</span>
                            <span class="custom-price">${opt.price > 0 ? '+$' + opt.price.toFixed(2) : 'Free'}</span>
                        </label>
                    `).join('')}
                </div>
            `;
        }
        
        sizeOptions.innerHTML = `
            <div class="size-option selected" data-size="medium" data-price="${item.price}">
                <span>Medium</span>
                <span>$${item.price.toFixed(2)}</span>
            </div>
            <div class="size-option" data-size="large" data-price="${item.price * 1.3}">
                <span>Large (+30%)</span>
                <span>$${(item.price * 1.3).toFixed(2)}</span>
            </div>
            ${ingredientsHTML}
            ${customizationsHTML}
            <div class="quantity-selector">
                <label>Quantity:</label>
                <div class="quantity-controls">
                    <button type="button" class="qty-btn-modal" id="decrease-qty">−</button>
                    <span class="qty-display-modal" id="quantity-display">1</span>
                    <button type="button" class="qty-btn-modal" id="increase-qty">+</button>
                </div>
            </div>
        `;

        // Set default selection
        currentItem.selectedSize = 'medium';
        currentItem.finalPrice = item.price;
        currentItem.quantity = 1;
        currentItem.customizations = [];
        currentItem.customizationOptions = item.customizationOptions || [];

        // Size selection handlers
        document.querySelectorAll('.size-option').forEach(option => {
            option.addEventListener('click', function() {
                document.querySelectorAll('.size-option').forEach(opt => opt.classList.remove('selected'));
                this.classList.add('selected');
                currentItem.selectedSize = this.dataset.size;
                updateItemPrice();
            });
        });

        // Customization checkbox handlers
        document.querySelectorAll('.custom-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                updateItemPrice();
            });
        });

        // Quantity control handlers
        const qtyDisplay = document.getElementById('quantity-display');
        document.getElementById('increase-qty').addEventListener('click', function() {
            currentItem.quantity++;
            qtyDisplay.textContent = currentItem.quantity;
        });

        document.getElementById('decrease-qty').addEventListener('click', function() {
            if (currentItem.quantity > 1) {
                currentItem.quantity--;
                qtyDisplay.textContent = currentItem.quantity;
            }
        });

        sizeModal.style.display = 'flex';
    }

    function updateItemPrice() {
        // Get base price based on selected size
        const selectedSizeOption = document.querySelector('.size-option.selected');
        let basePrice = selectedSizeOption ? parseFloat(selectedSizeOption.dataset.price) : currentItem.price;

        // Add customization prices
        let customizationPrice = 0;
        const selectedCustomizations = [];
        document.querySelectorAll('.custom-checkbox:checked').forEach(checkbox => {
            const optPrice = parseFloat(checkbox.dataset.optionPrice) || 0;
            customizationPrice += optPrice;
            selectedCustomizations.push(checkbox.dataset.optionName);
        });

        currentItem.finalPrice = basePrice + customizationPrice;
        currentItem.customizations = selectedCustomizations;
    }

    function addToCart() {
        let cart = JSON.parse(localStorage.getItem('cart')) || [];
        
        cart.push({
            ...currentItem,
            id: Date.now().toString(),
            menuItemId: currentItem.id,
            selectedSize: currentItem.selectedSize,
            finalPrice: currentItem.finalPrice,
            quantity: currentItem.quantity || 1,
            customizations: currentItem.customizations || []
        });

        localStorage.setItem('cart', JSON.stringify(cart));
        
        closeSizeModal();
        updateCartBadge();
    }

    function closeSizeModal() {
        sizeModal.style.display = 'none';
        currentItem = null;
    }

    function updateCartBadge() {
        const cart = JSON.parse(localStorage.getItem('cart')) || [];
        const totalItems = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
        cartBadge.textContent = totalItems;
        cartBadge.style.display = totalItems ? 'flex' : 'none';
    }

    function formatCategory(category) {
        return category.charAt(0).toUpperCase() + category.slice(1);
    }

    function formatIngredientsDisplay(ingredients) {
        if (!ingredients || !ingredients.length) return '';
        const list = ingredients.map(i => {
            const name = typeof i === 'string' ? i : (i && i.name || '');
            const img = typeof i === 'object' && i && i.imageUrl;
            if (img) {
                return `<span class="ingredient-with-img"><img src="${i.imageUrl}" alt="${name}" class="ingredient-thumb">${name}</span>`;
            }
            return `<span>${name}</span>`;
        });
        return `<div class="ingredients-row">${list.join('')}</div>`;
    }
});