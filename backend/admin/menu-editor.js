document.addEventListener('DOMContentLoaded', function() {
    const API_BASE = 'http://localhost:8000';

    // Menu and categories (loaded from API only, no hardcoded defaults)
    let menuItems = [];
    let categories = [];
    let currentItem = null;
    let editingItemId = null;  // set when editing an existing item
    let customizationOptions = [];  // Temporary storage for customization options being added/edited
    let ingredients = [];  // [{ name, imageUrl? }] - display-only, staff editable
    let pendingIngredientImage = null;  // Base64 for next ingredient to add

    // DOM elements
    const elements = {
        menuContainer: document.getElementById('menu-items-container'),
        editModal: document.getElementById('edit-modal'),
        logoModal: document.getElementById('logo-modal'),
        categoryModal: document.getElementById('category-modal'),
        taxModal: document.getElementById('tax-modal'),
        itemForm: document.getElementById('item-form'),
        itemName: document.getElementById('item-name'),
        itemPrice: document.getElementById('item-price'),
        itemDescription: document.getElementById('item-description'),
        itemCategory: document.getElementById('item-category'),
        categoryFilter: document.getElementById('category-filter'),
        imageUpload: document.getElementById('item-image'),
        imagePreview: document.getElementById('image-preview'),
        logoPreview: document.getElementById('logo-preview'),
        logoUpload: document.getElementById('logo-upload'),
        editLogoBtn: document.getElementById('edit-logo-btn'),
        saveLogoBtn: document.getElementById('save-logo-btn'),
        manageCategoriesBtn: document.getElementById('manage-categories-btn'),
        categoriesList: document.getElementById('categories-list'),
        addCategoryBtn: document.getElementById('add-category-btn'),
        newCategoryName: document.getElementById('new-category-name'),
        configureTaxBtn: document.getElementById('configure-tax-btn'),
        taxRateInput: document.getElementById('tax-rate-input'),
        saveTaxBtn: document.getElementById('save-tax-btn'),
        newItemBtn: document.getElementById('new-item-btn'),
        brandLogo: document.getElementById('brand-logo'),
        itemModalTitle: document.getElementById('item-modal-title'),
        itemSubmitBtn: document.getElementById('item-submit-btn'),
        customizationOptionsList: document.getElementById('customization-options-list'),
        newOptionName: document.getElementById('new-option-name'),
        newOptionPrice: document.getElementById('new-option-price'),
        addOptionBtn: document.getElementById('add-option-btn'),
        ingredientsList: document.getElementById('ingredients-list'),
        newIngredient: document.getElementById('new-ingredient'),
        newIngredientImage: document.getElementById('new-ingredient-image'),
        ingredientImagePreview: document.getElementById('ingredient-image-preview'),
        addIngredientBtn: document.getElementById('add-ingredient-btn')
    };

    // Initialize
    initData();
    setupEventListeners();

    async function loadCategoriesFromApi() {
        try {
            const response = await fetch(`${API_BASE}/categories`);
            if (!response.ok) throw new Error('Failed to load categories');
            const data = await response.json();
            categories = Array.isArray(data) ? data : [];
            return true;
        } catch (err) {
            console.error('Load categories error:', err);
            return false;
        }
    }

    async function loadMenuFromApi() {
        try {
            const response = await fetch(`${API_BASE}/menu`);
            if (!response.ok) throw new Error('Failed to load menu');
            const data = await response.json();
            menuItems = (data || []).map(item => ({
                ...item,
                image: item.imageUrl || item.image || ''
            }));
            return true;
        } catch (err) {
            console.error('Load menu error:', err);
            return false;
        }
    }

    async function initData() {
        try {
            if (!localStorage.getItem('taxRate')) {
                localStorage.setItem('taxRate', '10');
            }
            if (!localStorage.getItem('brandLogo')) {
                localStorage.setItem('brandLogo', 'brand-logo.png');
            }

            await loadCategoriesFromApi();
            const menuLoaded = await loadMenuFromApi();
            if (!menuLoaded) {
                const stored = localStorage.getItem('menuItems');
                if (stored) menuItems = JSON.parse(stored);
            }
            // Sync any categories that exist on menu items but are missing from the categories list (e.g. first run)
            const fromItems = [...new Set(menuItems.map(i => i.category).filter(Boolean))];
            const missing = fromItems.filter(c => !categories.includes(c));
            for (const name of missing) {
                try {
                    const r = await fetch(`${API_BASE}/admin/categories`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name })
                    });
                    if (r.ok) categories = await r.json();
                } catch (_) {}
            }

            updateCategoryDropdowns();
            renderMenu();
            initLogo();
        } catch (error) {
            console.error('Initialization error:', error);
            updateCategoryDropdowns();
            renderMenu();
            initLogo();
        }
    }

    function setupEventListeners() {
        // Image upload handling
        document.getElementById('image-upload-area').addEventListener('click', function() {
            elements.imageUpload.click();
        });
        elements.imageUpload.addEventListener('change', handleImageUpload);

        // Logo upload handling
        document.getElementById('logo-upload-area').addEventListener('click', function() {
            elements.logoUpload.click();
        });
        elements.logoUpload.addEventListener('change', handleLogoUpload);
        
        // Form submission
        elements.itemForm.addEventListener('submit', handleFormSubmit);
        
        // Button clicks
        elements.newItemBtn.addEventListener('click', openAddModal);
        elements.editLogoBtn.addEventListener('click', () => showModal('logo'));
        elements.saveLogoBtn.addEventListener('click', saveLogo);
        elements.manageCategoriesBtn.addEventListener('click', openCategoryModal);
        elements.addCategoryBtn.addEventListener('click', addNewCategory);
        elements.configureTaxBtn.addEventListener('click', openTaxModal);
        elements.saveTaxBtn.addEventListener('click', saveTaxRate);
        elements.categoryFilter.addEventListener('change', renderMenu);
        elements.addOptionBtn.addEventListener('click', addCustomizationOption);
        elements.addIngredientBtn.addEventListener('click', addIngredient);
        if (elements.ingredientImagePreview) {
            elements.ingredientImagePreview.addEventListener('click', () => elements.newIngredientImage && elements.newIngredientImage.click());
        }
        if (elements.newIngredientImage) {
            elements.newIngredientImage.addEventListener('change', handleIngredientImageUpload);
        }
        
        // Modal close buttons
        document.querySelectorAll('.close-btn').forEach(btn => {
            btn.addEventListener('click', closeAllModals);
        });

        // Close modals when clicking outside
        window.addEventListener('click', function(event) {
            if (event.target.classList.contains('modal')) {
                closeAllModals();
            }
        });
    }

    function showModal(modalName) {
        closeAllModals();
        const modal = elements[`${modalName}Modal`];
        if (modal) {
            modal.style.display = 'block';
            document.body.style.overflow = 'hidden';
        }
    }

    function closeModal(modalName) {
        const modal = elements[`${modalName}Modal`];
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    function closeAllModals() {
        ['edit', 'logo', 'category', 'tax'].forEach(modalName => {
            closeModal(modalName);
        });
    }

    function generateUniqueId() {
        return 'item-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    }

    function handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(event) {
            elements.imagePreview.src = event.target.result;
            document.querySelector('#image-upload-area .upload-hint').style.display = 'none';
        };
        reader.readAsDataURL(file);
    }

    function handleLogoUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(event) {
            elements.logoPreview.src = event.target.result;
            document.querySelector('#logo-upload-area .upload-hint').style.display = 'none';
        };
        reader.readAsDataURL(file);
    }

    function addCustomizationOption() {
        const name = elements.newOptionName.value.trim();
        const price = parseFloat(elements.newOptionPrice.value) || 0;

        if (!name) {
            alert('Please enter an option name');
            return;
        }

        const option = {
            id: 'opt-' + Date.now(),
            name,
            price
        };

        customizationOptions.push(option);
        renderCustomizationOptions();
        
        // Clear inputs
        elements.newOptionName.value = '';
        elements.newOptionPrice.value = '0';
    }

    function removeCustomizationOption(optionId) {
        customizationOptions = customizationOptions.filter(opt => opt.id !== optionId);
        renderCustomizationOptions();
    }

    function renderCustomizationOptions() {
        if (!elements.customizationOptionsList) return;

        if (customizationOptions.length === 0) {
            elements.customizationOptionsList.innerHTML = '<p style="color: #666; font-size: 14px; font-style: italic;">No customization options added yet.</p>';
            return;
        }

        elements.customizationOptionsList.innerHTML = customizationOptions.map(opt => `
            <div class="option-item">
                <div class="option-item-info">
                    <span class="option-item-name">${opt.name}</span>
                    <span class="option-item-price">${opt.price > 0 ? '+$' + opt.price.toFixed(2) : 'Free'}</span>
                </div>
                <button type="button" class="remove-option-btn" onclick="window.removeCustomizationOption('${opt.id}')">Remove</button>
            </div>
        `).join('');
    }

    // Make function globally accessible
    window.removeCustomizationOption = removeCustomizationOption;

    function resizeIngredientImage(dataUrl, maxSize, quality) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = function() {
                const w = img.width, h = img.height;
                let nw = w, nh = h;
                if (w > maxSize || h > maxSize) {
                    if (w > h) {
                        nw = maxSize;
                        nh = Math.round(h * maxSize / w);
                    } else {
                        nh = maxSize;
                        nw = Math.round(w * maxSize / h);
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = nw;
                canvas.height = nh;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, nw, nh);
                resolve(canvas.toDataURL('image/jpeg', quality || 0.7));
            };
            img.onerror = () => resolve(dataUrl);
            img.src = dataUrl;
        });
    }

    async function handleIngredientImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async function(ev) {
            let dataUrl = ev.target.result;
            dataUrl = await resizeIngredientImage(dataUrl, 120, 0.65);
            pendingIngredientImage = dataUrl;
            if (elements.ingredientImagePreview) {
                elements.ingredientImagePreview.innerHTML = `<img src="${dataUrl}" alt="" class="ingredient-item-img" style="width:100%;height:100%;object-fit:cover;">`;
                elements.ingredientImagePreview.title = 'Click to change photo';
            }
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    }

    function addIngredient() {
        const name = (elements.newIngredient && elements.newIngredient.value || '').trim();
        if (!name) {
            alert('Please enter an ingredient name');
            return;
        }
        const nameLower = name.toLowerCase();
        const isDuplicate = ingredients.some(ing => (ing.name || '').toLowerCase() === nameLower);
        if (isDuplicate) {
            alert('This ingredient has already been added.');
            return;
        }
        const ing = { name, imageUrl: pendingIngredientImage || null };
        ingredients.push(ing);
        pendingIngredientImage = null;
        if (elements.newIngredient) elements.newIngredient.value = '';
        if (elements.newIngredientImage) elements.newIngredientImage.value = '';
        if (elements.ingredientImagePreview) {
            elements.ingredientImagePreview.innerHTML = '<span style="font-size:20px;color:#999;">+</span>';
            elements.ingredientImagePreview.title = 'Click to add photo';
        }
        renderIngredients();
    }

    function removeIngredient(index) {
        ingredients = ingredients.filter((_, i) => i !== index);
        renderIngredients();
    }

    function renderIngredients() {
        if (!elements.ingredientsList) return;
        if (ingredients.length === 0) {
            elements.ingredientsList.innerHTML = '<p style="color: #666; font-size: 14px; font-style: italic;">No ingredients added yet.</p>';
            return;
        }
        elements.ingredientsList.innerHTML = ingredients.map((ing, idx) => `
            <div class="option-item">
                <div class="option-item-info" style="display: flex; align-items: center; gap: 10px;">
                    ${ing.imageUrl ? `<img src="${ing.imageUrl}" alt="" class="ingredient-item-img">` : ''}
                    <span class="option-item-name">${ing.name}</span>
                </div>
                <button type="button" class="remove-option-btn" onclick="window.removeIngredient(${idx})">Remove</button>
            </div>
        `).join('');
    }

    window.removeIngredient = removeIngredient;

    async function handleFormSubmit(e) {
        e.preventDefault();
        
        const name = elements.itemName.value.trim();
        const price = parseFloat(elements.itemPrice.value);
        const description = elements.itemDescription.value.trim();
        const category = elements.itemCategory.value;
        const image = elements.imagePreview.src;

        if (!validateForm(name, price, image, !!editingItemId)) return;

        const isEdit = !!editingItemId;
        const itemId = isEdit ? editingItemId : generateUniqueId();
        const payload = {
            id: itemId,
            name,
            price,
            description: description || null,
            category,
            imageUrl: image,
            customizationOptions: customizationOptions.length > 0 ? customizationOptions : [],
            ingredients: ingredients.length > 0 ? ingredients : []
        };

        if (!isEdit) {
            const itemsInCategory = menuItems.filter(item => item.category === category).length;
            if (itemsInCategory >= 50) {
                alert(`Cannot add more than 50 items to the "${formatCategory(category)}" category`);
                return;
            }
        }

        try {
            const url = isEdit
                ? `${API_BASE}/admin/menu-items/${encodeURIComponent(itemId)}`
                : `${API_BASE}/admin/menu-items`;
            const method = isEdit ? 'PUT' : 'POST';
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error(isEdit ? 'Failed to update item' : 'Failed to save item');

            if (isEdit) {
                const idx = menuItems.findIndex(i => i.id === itemId);
                if (idx !== -1) menuItems[idx] = { ...payload, image };
            } else {
                menuItems.push({ ...payload, image });
            }
            editingItemId = null;
            customizationOptions = [];
            ingredients = [];
            elements.itemName.value = '';
            elements.itemPrice.value = '';
            elements.itemDescription.value = '';
            elements.imagePreview.src = 'data:image/svg+xml;base64,...';
            document.querySelector('#image-upload-area .upload-hint').style.display = 'block';
            elements.itemCategory.value = category;
            if (elements.itemModalTitle) elements.itemModalTitle.textContent = 'Add New Menu Item';
            if (elements.itemSubmitBtn) elements.itemSubmitBtn.textContent = 'Add Item';
            renderCustomizationOptions();
            renderIngredients();
            renderMenu();
            closeModal('edit');
            alert(isEdit ? 'Item updated successfully!' : 'Item added successfully! It will appear on the menu display.');
        } catch (error) {
            console.error('Error saving item:', error);
            alert('Error saving item. Please try again. Is the backend running?');
        }
    }

    function validateForm(name, price, image, isEditing) {
        if (!name) {
            alert('Please enter item name');
            return false;
        }
        if (isNaN(price) || price <= 0) {
            alert('Please enter valid price');
            return false;
        }
        const hasValidImage = image && (image.startsWith('data:image') || image.startsWith('http'));
        if (!hasValidImage) {
            alert(isEditing ? 'Please keep or upload an image.' : 'Please upload an image');
            return false;
        }
        return true;
    }

    function saveAllData() {
        try {
            localStorage.setItem('menuItems', JSON.stringify(menuItems));
            updateCategoryDropdowns();
            renderMenu();
            return true;
        } catch (error) {
            console.error('Error saving data:', error);
            alert('Error saving menu data. Please try again.');
            return false;
        }
    }

    function renderMenu() {
        const selectedCategory = elements.categoryFilter.value;
        const filteredItems = selectedCategory === 'all' 
            ? menuItems 
            : menuItems.filter(item => item.category === selectedCategory);

        if (filteredItems.length === 0) {
            elements.menuContainer.innerHTML = `
                <div class="empty-state">
                    <img src="data:image/svg+xml;base64,..." alt="Empty Menu">
                    <h3>No Menu Items Found</h3>
                    <p>No items match your current filter</p>
                </div>`;
            return;
        }

        elements.menuContainer.innerHTML = filteredItems.map(item => `
            <div class="menu-item-card" data-id="${item.id}">
                <img src="${item.image || item.imageUrl || ''}" alt="${item.name}">
                <div class="item-info">
                    <h3>${item.name}</h3>
                    <p>$${item.price.toFixed(2)}</p>
                    <span class="item-category">${formatCategory(item.category)}</span>
                    <div class="item-card-actions">
                        <button class="edit-item-btn" data-id="${item.id}">Edit</button>
                        <button class="delete-btn" data-id="${item.id}">Delete</button>
                    </div>
                </div>
            </div>
        `).join('');

        document.querySelectorAll('.edit-item-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const item = menuItems.find(i => i.id === this.dataset.id);
                if (item) openEditModal(item);
            });
        });
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                if (confirm('Are you sure you want to delete this item?')) {
                    deleteItem(this.dataset.id);
                }
            });
        });
    }

    async function deleteItem(id) {
        try {
            const response = await fetch(`${API_BASE}/admin/menu-items/${encodeURIComponent(id)}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Failed to delete item');
            menuItems = menuItems.filter(item => item.id !== id);
            renderMenu();
            alert('Item deleted successfully!');
        } catch (err) {
            console.error('Error deleting item:', err);
            alert('Error deleting item. Please try again. Is the backend running?');
        }
    }

    function openAddModal() {
        editingItemId = null;
        customizationOptions = [];
        ingredients = [];
        if (elements.itemModalTitle) elements.itemModalTitle.textContent = 'Add New Menu Item';
        if (elements.itemSubmitBtn) elements.itemSubmitBtn.textContent = 'Add Item';
        elements.itemForm.reset();
        elements.imagePreview.src = 'data:image/svg+xml;base64,...';
        document.querySelector('#image-upload-area .upload-hint').style.display = 'block';
        renderCustomizationOptions();
        renderIngredients();
        showModal('edit');
    }

    function openEditModal(item) {
        editingItemId = item.id;
        customizationOptions = item.customizationOptions ? [...item.customizationOptions] : [];
        ingredients = item.ingredients ? item.ingredients.map(i => typeof i === 'string' ? { name: i, imageUrl: null } : { name: i.name || '', imageUrl: i.imageUrl || null }) : [];
        if (elements.itemModalTitle) elements.itemModalTitle.textContent = 'Edit Menu Item';
        if (elements.itemSubmitBtn) elements.itemSubmitBtn.textContent = 'Save Changes';
        elements.itemName.value = item.name || '';
        elements.itemPrice.value = item.price != null ? item.price : '';
        elements.itemDescription.value = item.description || '';
        elements.itemCategory.value = item.category || (categories[0] || '');
        const imgSrc = item.image || item.imageUrl || '';
        elements.imagePreview.src = imgSrc || 'data:image/svg+xml;base64,...';
        document.querySelector('#image-upload-area .upload-hint').style.display = imgSrc ? 'none' : 'block';
        renderCustomizationOptions();
        renderIngredients();
        showModal('edit');
    }

    function openCategoryModal() {
        renderCategoryList();
        showModal('category');
    }

    function renderCategoryList() {
        if (categories.length === 0) {
            elements.categoriesList.innerHTML = '<li class="empty-categories">No categories yet. Add one above.</li>';
            return;
        }
        elements.categoriesList.innerHTML = categories.map(category => `
            <li>
                <span>${formatCategory(category)}</span>
                <div class="category-actions">
                    <button class="edit-category-btn" data-category="${category}">Edit</button>
                    <button class="delete-category-btn" data-category="${category}">Delete</button>
                </div>
            </li>
        `).join('');

        // Add event listeners to dynamic buttons
        document.querySelectorAll('.edit-category-btn').forEach(btn => {
            btn.addEventListener('click', editCategory);
        });

        document.querySelectorAll('.delete-category-btn').forEach(btn => {
            btn.addEventListener('click', deleteCategory);
        });
    }

    async function addNewCategory() {
        const categoryName = elements.newCategoryName.value.trim().toLowerCase();
        if (!categoryName) return;

        if (categories.includes(categoryName)) {
            alert('Category already exists!');
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/admin/categories`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: categoryName })
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.detail || 'Failed to add category');
            }
            categories = await response.json();
            elements.newCategoryName.value = '';
            updateCategoryDropdowns();
            renderCategoryList();
            alert(`Category "${formatCategory(categoryName)}" added and saved to database.`);
        } catch (err) {
            console.error(err);
            alert(err.message || 'Error adding category. Is the backend running?');
        }
    }

    async function editCategory(e) {
        const oldCategory = e.target.dataset.category;
        const newName = prompt('Enter new category name:', formatCategory(oldCategory));
        if (!newName || !newName.trim()) return;
        const newCategory = newName.trim().toLowerCase();

        try {
            const response = await fetch(`${API_BASE}/admin/categories/rename`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldName: oldCategory, newName: newCategory })
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.detail || 'Failed to rename category');
            }
            categories = await response.json();
            await loadMenuFromApi();
            updateCategoryDropdowns();
            renderMenu();
            renderCategoryList();
            alert('Category renamed in database. All menu items in this category were updated.');
        } catch (err) {
            console.error(err);
            alert(err.message || 'Error renaming category.');
        }
    }

    async function deleteCategory(e) {
        const categoryToDelete = e.target.dataset.category;
        if (!confirm(`Delete "${formatCategory(categoryToDelete)}" and ALL its menu items from the database? This cannot be undone.`)) return;

        try {
            const response = await fetch(`${API_BASE}/admin/categories/${encodeURIComponent(categoryToDelete)}?delete_items=true`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.detail || 'Failed to delete category');
            }
            categories = await response.json();
            await loadMenuFromApi();
            updateCategoryDropdowns();
            renderMenu();
            renderCategoryList();
            alert('Category and all its items have been deleted from the database.');
        } catch (err) {
            console.error(err);
            alert(err.message || 'Error deleting category.');
        }
    }

    function updateCategoryDropdowns() {
        // Update filter dropdown
        elements.categoryFilter.innerHTML = `
            <option value="all">All Categories</option>
            ${categories.map(cat => `
                <option value="${cat}">${formatCategory(cat)}</option>
            `).join('')}
        `;

        // Update item category dropdown
        elements.itemCategory.innerHTML = categories.map(cat => `
            <option value="${cat}">${formatCategory(cat)}</option>
        `).join('');
    }

    function openTaxModal() {
        elements.taxRateInput.value = parseFloat(localStorage.getItem('taxRate')) || 10;
        showModal('tax');
    }

    function saveTaxRate() {
        const rate = parseFloat(elements.taxRateInput.value);
        if (isNaN(rate)) {
            alert('Please enter a valid number');
            return;
        }
        localStorage.setItem('taxRate', rate);
        closeModal('tax');
        alert('Tax rate updated successfully!');
    }

    async function saveLogo() {
        const newLogoSrc = elements.logoPreview.src;
        try {
            const response = await fetch(`${API_BASE}/settings`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ logoUrl: newLogoSrc })
            });
            if (!response.ok) throw new Error('Failed to save logo');
            elements.brandLogo.src = newLogoSrc;
            localStorage.setItem('brandLogo', newLogoSrc);
            localStorage.setItem('logoUpdated', Date.now());
            closeModal('logo');
            alert('Logo saved to database! It will appear on the menu and other pages.');
            const event = new CustomEvent('logoUpdated', { detail: { logoUrl: newLogoSrc } });
            window.dispatchEvent(event);
        } catch (err) {
            console.error(err);
            alert('Error saving logo. Is the backend running?');
        }
    }

    async function initLogo() {
        try {
            const response = await fetch(`${API_BASE}/settings`);
            if (response.ok) {
                const data = await response.json();
                const logoUrl = data && data.logoUrl;
                if (logoUrl) {
                    elements.brandLogo.src = logoUrl;
                    elements.logoPreview.src = logoUrl;
                    document.querySelector('#logo-upload-area .upload-hint').style.display = 'none';
                    return;
                }
            }
        } catch (err) {
            console.error('Load logo from API:', err);
        }
        const savedLogo = localStorage.getItem('brandLogo');
        if (savedLogo) {
            elements.brandLogo.src = savedLogo;
            elements.logoPreview.src = savedLogo;
            document.querySelector('#logo-upload-area .upload-hint').style.display = 'none';
        }
    }

    function updateCustomerMenu() {
        // Create fresh grouped items structure
        const groupedItems = {};
        
        // Group items by category
        menuItems.forEach(item => {
            if (!groupedItems[item.category]) {
                groupedItems[item.category] = [];
            }
            groupedItems[item.category].push({
                id: item.id,
                name: item.name,
                price: item.price,
                description: item.description || '',
                image: item.image,
                category: item.category
            });
        });
        
        // Save the grouped structure
        localStorage.setItem('groupedMenuItems', JSON.stringify(groupedItems));
        localStorage.setItem('menuLastUpdated', Date.now());
        
        // Dispatch event to all open customer menus
        window.dispatchEvent(new Event('menuUpdated'));
    }

    function formatCategory(category) {
        return category.charAt(0).toUpperCase() + category.slice(1);
    }
});

