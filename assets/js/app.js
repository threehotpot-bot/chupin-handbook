const API_BASE = '/api';
const ADMIN_TOKEN = 'adminpassword';
let recipes = [];
let isAdmin = false;
let currentRecipe = null;
let editingRecipeId = null;
let wecomSending = false;
const DRAFT_KEY_NEW_RECIPE = 'DRAFT_RECIPE_ADD';
let pageScrollY = 0;

// ========== Utility ==========
function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function highlightIngredientsInStep(stepText, ingredientsList) {
    if (!Array.isArray(ingredientsList) || ingredientsList.length === 0) return escapeHtml(stepText || '');
    let safe = escapeHtml(stepText || '');
    const sorted = [...ingredientsList].sort((a, b) => (b.name || '').length - (a.name || '').length);
    sorted.forEach(ing => {
        const name = (ing && ing.name) ? String(ing.name).trim() : '';
        const amount = (ing && ing.amount) ? String(ing.amount).trim() : '';
        if (!name) return;
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(escaped, 'g');
        const replacement = amount
            ? `<span class="ing-highlight">${name}</span><span class="ing-amount">（${escapeHtml(amount)}）</span>`
            : `<span class="ing-highlight">${name}</span>`;
        safe = safe.replace(pattern, replacement);
    });
    return safe;
}

function annotateIngredientsInPlain(stepText, ingredientsList) {
    if (!Array.isArray(ingredientsList) || ingredientsList.length === 0) return String(stepText || '');
    let plain = String(stepText || '');
    const sorted = [...ingredientsList].sort((a, b) => (b.name || '').length - (a.name || '').length);
    sorted.forEach(ing => {
        const name = (ing && ing.name) ? String(ing.name).trim() : '';
        const amount = (ing && ing.amount) ? String(ing.amount).trim() : '';
        if (!name || !amount) return;
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        plain = plain.replace(new RegExp(escaped, 'g'), `${name}（${amount}）`);
    });
    return plain;
}

// ========== Init ==========
function init() {
    var grid = document.getElementById('recipeGrid');
    if (grid) grid.innerHTML = '<div style="text-align: center; padding: 50px; color: #999;">加载中...</div>';
    tryLoadFromApi().then(function() {
        loadRecipes();
    }).catch(function() {
        var cached = localStorage.getItem('recipes');
        if (cached) { try { recipes = JSON.parse(cached); } catch(e) { recipes = []; } }
        loadRecipes();
    });
    loadVersion();
    checkAdminStatus();
    initDragForExistingIngredients();
}

function initDragForExistingIngredients() {
    document.querySelectorAll('#ingredientsList .ingredient-input-group[data-ingredient-item="true"]').forEach(item => {
        if (!item._dragBound) {
            item.draggable = true;
            item.addEventListener('dragstart', handleDragStart);
            item.addEventListener('dragover', handleDragOver);
            item.addEventListener('drop', handleDrop);
            item.addEventListener('dragend', handleDragEnd);
            item._dragBound = true;
        }
    });
}

async function tryLoadFromApi() {
    const resp = await fetch(`${API_BASE}/recipes`, { cache: 'no-store' });
    if (!resp.ok) return;
    const data = await resp.json();
    if (data && data.success && Array.isArray(data.data)) {
        recipes = data.data;
        localStorage.setItem('recipes', JSON.stringify(recipes));
    }
    await fetchCategories();
}

async function loadVersion() {
    try {
        const resp = await fetch(`/version.json?v=${Date.now()}`, { cache: 'no-store' });
        if (!resp.ok) return;
        const data = await resp.json();
        const v = data && data.version ? data.version : '';
        const span = document.getElementById('versionNumber');
        if (span && v) span.textContent = v;
    } catch (e) {}
}

// ========== Auth ==========
function checkAdminStatus() {
    isAdmin = sessionStorage.getItem('isAdmin') === 'true';
    document.getElementById('adminTab').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('userStatus').textContent = isAdmin ? '👨‍💼 管理员' : '👤 访客';
    if (isAdmin) {
        loadAdminRecipeList();
        setupAdminDraftPersistence();
    }
}

function login() {
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    const msg = document.getElementById('loginMessage');
    if (u === 'admin' && p === 'adminpassword') {
        sessionStorage.setItem('isAdmin', 'true');
        msg.innerHTML = '<div class="success-message">登录成功！正在跳转...</div>';
        setTimeout(() => {
            checkAdminStatus();
            switchTab('admin');
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('adminTab').classList.add('active');
        }, 800);
    } else {
        msg.innerHTML = '<div style="color: red;">用户名或密码错误</div>';
    }
}

function toggleUserMenu() {
    if (isAdmin && confirm('确定要退出登录吗？')) {
        sessionStorage.removeItem('isAdmin');
        checkAdminStatus();
        location.reload();
    }
}

// ========== Tab Switching ==========
function switchTab(tabName, btn) {
    if (tabName === 'admin' && !isAdmin) {
        alert('请先登录管理员账号');
        switchTab('login');
        return;
    }
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');
    if (btn && btn.classList) { btn.classList.add('active'); }
    else {
        const map = { recipes: 0, admin: 1, login: 2 };
        const buttons = document.querySelectorAll('.nav-tabs .tab-btn');
        if (typeof map[tabName] === 'number' && buttons[map[tabName]]) buttons[map[tabName]].classList.add('active');
    }
    if (tabName === 'admin' && isAdmin) {
        loadAdminRecipeList();
        setupAdminDraftPersistence();
        renderCategoryManager();
    }
}

// ========== Admin Sub-Tab Switching ==========
function switchAdminSub(subName, btn) {
    document.querySelectorAll('.admin-sub-content').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
    var el = document.getElementById('adminSub-' + subName);
    if (el) el.classList.add('active');
    if (btn && btn.classList) { btn.classList.add('active'); }
    else {
        var map = { list: 0, form: 1, categories: 2 };
        var buttons = document.querySelectorAll('.admin-sub-tabs .sub-tab-btn');
        if (typeof map[subName] === 'number' && buttons[map[subName]]) buttons[map[subName]].classList.add('active');
    }
    if (subName === 'list') loadAdminRecipeList();
    if (subName === 'categories') renderCategoryManager();
    if (subName === 'form') {
        var formTab = document.getElementById('subTabForm');
        if (formTab) formTab.textContent = editingRecipeId ? '✏️ 编辑菜品' : '➕ 添加菜品';
    }
}

// ========== Categories ==========
let categories = ['主食','小菜','汤品','饮品','特色菜'];

async function fetchCategories() {
    try {
        const resp = await fetch(`${API_BASE}/categories`, { cache: 'no-store' });
        if (!resp.ok) return;
        const data = await resp.json();
        if (data && data.success && Array.isArray(data.data)) {
            categories = data.data;
            renderCategoryOptions();
        }
    } catch (e) {}
}

function renderCategoryOptions() {
    const sel = document.getElementById('recipeCategory');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '';
    categories.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); });
    if (current && categories.includes(current)) sel.value = current;
}

function renderCategoryManager() {
    const box = document.getElementById('categoryManager');
    if (!box) return;
    box.innerHTML = '';

    const input = document.createElement('input');
    input.type = 'text'; input.placeholder = '输入新分类名称'; input.className = 'form-control';
    input.style.maxWidth = '240px';

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-add'; addBtn.style.marginLeft = '10px'; addBtn.textContent = '添加分类';
    addBtn.onclick = async () => {
        const name = (input.value || '').trim();
        if (!name) return alert('请输入分类名称');
        const resp = await fetch(`${API_BASE}/categories`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': ADMIN_TOKEN },
            body: JSON.stringify({ name })
        });
        const data = await resp.json().catch(() => ({}));
        if (resp.ok && data.success) {
            categories = data.data || categories;
            renderCategoryOptions(); renderCategoryManager(); input.value = '';
        } else alert('添加失败');
    };

    const list = document.createElement('div'); list.style.marginTop = '12px';
    categories.forEach(c => {
        const item = document.createElement('div');
        item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: white; border-radius: 8px; margin-bottom: 6px;';
        const span = document.createElement('span'); span.textContent = c; span.style.fontWeight = '500';
        const del = document.createElement('button');
        del.className = 'btn btn-remove'; del.textContent = '删除'; del.style.padding = '4px 12px'; del.style.fontSize = '0.85em';
        del.onclick = async () => {
            if (!confirm(`删除分类"${c}"？`)) return;
            const resp = await fetch(`${API_BASE}/categories/${encodeURIComponent(c)}`, {
                method: 'DELETE', headers: { 'X-Admin-Token': ADMIN_TOKEN }
            });
            const data = await resp.json().catch(() => ({}));
            if (resp.ok && data.success) { categories = data.data || categories; renderCategoryOptions(); renderCategoryManager(); }
            else alert('删除失败');
        };
        item.appendChild(span); item.appendChild(del); list.appendChild(item);
    });

    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center;';
    row.appendChild(input); row.appendChild(addBtn);
    box.appendChild(row); box.appendChild(list);
}

// ========== Admin Recipe List (grouped by category) ==========
function loadAdminRecipeList() {
    const listDiv = document.getElementById('adminRecipeList');
    if (!listDiv) return;
    listDiv.innerHTML = '';

    if (recipes.length === 0) {
        listDiv.innerHTML = '<div class="empty-state"><div class="emoji">📭</div><p>还没有菜品，点击上方"新增"添加</p></div>';
        return;
    }

    // Group by category
    const groups = {};
    recipes.forEach(r => {
        const cat = r.category || '未分类';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(r);
    });

    // Render each group
    Object.keys(groups).forEach(cat => {
        const group = document.createElement('div');
        group.className = 'admin-category-group';

        const title = document.createElement('div');
        title.className = 'admin-category-title';
        title.innerHTML = `${escapeHtml(cat)} <span class="count">(${groups[cat].length})</span>`;
        group.appendChild(title);

        groups[cat].forEach(recipe => {
            const item = document.createElement('div');
            item.className = 'admin-recipe-item';
            item.innerHTML = `
                <div class="recipe-label">
                    <strong>${escapeHtml(recipe.name)}</strong>
                    <span class="time-badge">⏱️ ${recipe.cookingTime || '-'}分钟</span>
                </div>
                <div class="actions">
                    <button class="btn btn-edit" onclick="startEdit(${recipe.id})">编辑</button>
                    <button class="btn btn-dup" onclick="duplicateRecipe(${recipe.id})">复制</button>
                    <button class="btn btn-remove" onclick="deleteRecipe(${recipe.id})">删除</button>
                </div>
            `;
            group.appendChild(item);
        });

        listDiv.appendChild(group);
    });
}

function filterAdminList() {
    const q = (document.getElementById('adminSearchInput').value || '').toLowerCase();
    const items = document.querySelectorAll('#adminRecipeList .admin-recipe-item');
    const groups = document.querySelectorAll('#adminRecipeList .admin-category-group');

    items.forEach(item => {
        const name = (item.querySelector('strong') || {}).textContent || '';
        item.style.display = name.toLowerCase().includes(q) ? '' : 'none';
    });

    // Hide empty groups
    groups.forEach(g => {
        const visible = g.querySelectorAll('.admin-recipe-item:not([style*="display: none"])');
        g.style.display = visible.length > 0 ? '' : 'none';
    });
}

// ========== Edit / Add ==========
function startEdit(id) {
    const r = recipes.find(x => x.id === id);
    if (!r) return;
    editingRecipeId = id;

    document.getElementById('recipeName').value = r.name || '';
    document.getElementById('recipeCategory').value = r.category || '主食';
    document.getElementById('recipeImage').value = r.image || '';
    document.getElementById('recipeNotes').value = r.notes || '';
    document.getElementById('cookingTime').value = r.cookingTime || '';

    // Ingredients
    const ingContainer = document.getElementById('ingredientsList');
    ingContainer.innerHTML = '';
    (r.ingredients || []).forEach(ing => {
        const div = document.createElement('div');
        div.className = 'ingredient-input-group';
        div.draggable = true; div.setAttribute('data-ingredient-item', 'true');
        div.innerHTML = `
            <span class="drag-handle">⋮⋮</span>
            <input type="text" class="form-control" value="${(ing.name || '').replace(/"/g, '&quot;')}">
            <input type="text" class="form-control" value="${(ing.amount || '').replace(/"/g, '&quot;')}">
            <button class="btn btn-remove" onclick="removeIngredient(this)">删除</button>
        `;
        div.addEventListener('dragstart', handleDragStart);
        div.addEventListener('dragover', handleDragOver);
        div.addEventListener('drop', handleDrop);
        div.addEventListener('dragend', handleDragEnd);
        ingContainer.appendChild(div);
    });
    if ((r.ingredients || []).length === 0) addIngredient();

    // Steps
    var ta = document.getElementById('stepsTextarea');
    if (ta) ta.value = (r.steps || []).join('\n');

    // UI
    document.getElementById('formTitle').textContent = '编辑菜品：' + r.name;
    document.getElementById('saveBtn').textContent = '保存修改';
    document.getElementById('cancelEditBtn').style.display = 'inline-block';

    switchAdminSub('form');
}

function resetForm() {
    editingRecipeId = null;
    document.getElementById('recipeName').value = '';
    document.getElementById('recipeCategory').value = categories[0] || '主食';
    document.getElementById('recipeImage').value = '';
    document.getElementById('recipeNotes').value = '';
    document.getElementById('cookingTime').value = '';
    document.getElementById('ingredientsList').innerHTML = '';
    addIngredient();
    var ta = document.getElementById('stepsTextarea');
    if (ta) ta.value = '';
    document.getElementById('formTitle').textContent = '添加新菜品';
    document.getElementById('saveBtn').textContent = '保存菜品';
    document.getElementById('cancelEditBtn').style.display = 'none';
    document.getElementById('adminMessage').innerHTML = '';
}

function cancelEdit() {
    resetForm();
    switchAdminSub('list');
}

// ========== Save Recipe ==========
function saveRecipe() {
    const name = document.getElementById('recipeName').value;
    const category = document.getElementById('recipeCategory').value;
    const image = document.getElementById('recipeImage').value;
    const notes = document.getElementById('recipeNotes').value;
    const cookingTime = document.getElementById('cookingTime').value || 30;

    if (!name) { alert('请输入菜品名称'); return; }

    const ingredients = [];
    document.querySelectorAll('#ingredientsList .ingredient-input-group').forEach(group => {
        const inputs = group.querySelectorAll('input');
        if (inputs[0].value && inputs[1].value) ingredients.push({ name: inputs[0].value, amount: inputs[1].value });
    });

    let steps = [];
    var ta = document.getElementById('stepsTextarea');
    if (ta && ta.value) steps = ta.value.split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 0);
    if (ingredients.length === 0) { alert('请至少添加一个配料'); return; }
    if (steps.length === 0) { alert('请至少添加一个制作步骤'); return; }

    const recipeData = { name, category, image, ingredients, steps, notes, cookingTime: parseInt(cookingTime) };

    if (editingRecipeId) {
        recipeData.id = editingRecipeId;
        fetch(`${API_BASE}/recipes/${editingRecipeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Admin-Token': ADMIN_TOKEN },
            body: JSON.stringify(recipeData)
        }).then(() => {
            const idx = recipes.findIndex(r => r.id === editingRecipeId);
            if (idx !== -1) recipes[idx] = recipeData;
            localStorage.setItem('recipes', JSON.stringify(recipes));
            loadRecipes();
            document.getElementById('adminMessage').innerHTML = '<div class="success-message">✅ 修改已保存！</div>';
            setTimeout(() => { resetForm(); switchAdminSub('list'); }, 1200);
        }).catch(() => {
            const idx = recipes.findIndex(r => r.id === editingRecipeId);
            if (idx !== -1) recipes[idx] = recipeData;
            localStorage.setItem('recipes', JSON.stringify(recipes));
            loadRecipes();
            document.getElementById('adminMessage').innerHTML = '<div class="success-message">✅ 修改已保存（离线）</div>';
            setTimeout(() => { resetForm(); switchAdminSub('list'); }, 1200);
        });
    } else {
        recipeData.id = Date.now();
        fetch(`${API_BASE}/recipes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Admin-Token': ADMIN_TOKEN },
            body: JSON.stringify(recipeData)
        }).then(async resp => {
            if (resp.ok) {
                const data = await resp.json();
                recipes.push(data && data.success && data.data ? data.data : recipeData);
            } else { recipes.push(recipeData); }
            localStorage.setItem('recipes', JSON.stringify(recipes));
            loadRecipes();
            clearNewRecipeDraft();
            document.getElementById('adminMessage').innerHTML = '<div class="success-message">✅ 菜品添加成功！</div>';
            setTimeout(() => { resetForm(); switchAdminSub('list'); }, 1200);
        }).catch(() => {
            recipes.push(recipeData);
            localStorage.setItem('recipes', JSON.stringify(recipes));
            loadRecipes();
            document.getElementById('adminMessage').innerHTML = '<div class="success-message">✅ 菜品已添加（离线）</div>';
            setTimeout(() => { resetForm(); switchAdminSub('list'); }, 1200);
        });
    }
}

// ========== Duplicate ==========
function duplicateRecipe(id) {
    const original = recipes.find(r => r.id === id);
    if (!original) return;
    const dup = {
        id: Date.now(), name: `${original.name}（副本）`, category: original.category || '主食',
        image: original.image || '', ingredients: JSON.parse(JSON.stringify(original.ingredients || [])),
        steps: JSON.parse(JSON.stringify(original.steps || [])), notes: original.notes || '',
        cookingTime: original.cookingTime || 30
    };
    fetch(`${API_BASE}/recipes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': ADMIN_TOKEN },
        body: JSON.stringify(dup)
    }).then(async resp => {
        if (resp.ok) { const d = await resp.json(); recipes.push(d && d.success && d.data ? d.data : dup); }
        else recipes.push(dup);
        localStorage.setItem('recipes', JSON.stringify(recipes));
        loadRecipes(); loadAdminRecipeList();
    }).catch(() => {
        recipes.push(dup);
        localStorage.setItem('recipes', JSON.stringify(recipes));
        loadRecipes(); loadAdminRecipeList();
    });
}

// ========== Delete ==========
function deleteRecipe(id) {
    if (!confirm('确定要删除这个菜品吗？')) return;
    fetch(`${API_BASE}/recipes/${id}`, {
        method: 'DELETE', headers: { 'X-Admin-Token': ADMIN_TOKEN }
    }).finally(() => {
        recipes = recipes.filter(r => r.id !== id);
        localStorage.setItem('recipes', JSON.stringify(recipes));
        loadRecipes(); loadAdminRecipeList();
    });
}

// ========== Draft Persistence ==========
function collectNewRecipeForm() {
    return {
        name: (document.getElementById('recipeName') || {}).value || '',
        category: (document.getElementById('recipeCategory') || {}).value || '主食',
        image: (document.getElementById('recipeImage') || {}).value || '',
        notes: (document.getElementById('recipeNotes') || {}).value || '',
        cookingTime: (document.getElementById('cookingTime') || {}).value || '',
        stepsRaw: (document.getElementById('stepsTextarea') || {}).value || '',
        ingredients: Array.from(document.querySelectorAll('#ingredientsList .ingredient-input-group')).map(g => {
            const inputs = g.querySelectorAll('input');
            return { name: inputs[0] ? inputs[0].value : '', amount: inputs[1] ? inputs[1].value : '' };
        })
    };
}

function applyDraftToForm() {
    if (editingRecipeId) return;
    try {
        const raw = localStorage.getItem(DRAFT_KEY_NEW_RECIPE);
        if (!raw) return;
        const d = JSON.parse(raw);
        if (!d || typeof d !== 'object') return;
        if (d.name != null) (document.getElementById('recipeName') || {}).value = d.name;
        if (d.category != null) (document.getElementById('recipeCategory') || {}).value = d.category || '主食';
        if (d.image != null) (document.getElementById('recipeImage') || {}).value = d.image;
        if (d.notes != null) (document.getElementById('recipeNotes') || {}).value = d.notes;
        if (d.cookingTime != null) (document.getElementById('cookingTime') || {}).value = d.cookingTime;
        if (d.stepsRaw != null) { var el = document.getElementById('stepsTextarea'); if (el) el.value = d.stepsRaw; }
        if (Array.isArray(d.ingredients)) {
            var c = document.getElementById('ingredientsList'); if (!c) return;
            c.innerHTML = '';
            if (d.ingredients.length === 0) { addIngredient(); return; }
            d.ingredients.forEach(ing => {
                var div = document.createElement('div');
                div.className = 'ingredient-input-group'; div.draggable = true;
                div.setAttribute('data-ingredient-item', 'true');
                div.innerHTML = `<span class="drag-handle">⋮⋮</span>
                    <input type="text" class="form-control" value="${(ing.name || '').replace(/"/g, '&quot;')}">
                    <input type="text" class="form-control" value="${(ing.amount || '').replace(/"/g, '&quot;')}">
                    <button class="btn btn-remove" onclick="removeIngredient(this)">删除</button>`;
                div.addEventListener('dragstart', handleDragStart);
                div.addEventListener('dragover', handleDragOver);
                div.addEventListener('drop', handleDrop);
                div.addEventListener('dragend', handleDragEnd);
                c.appendChild(div);
            });
        }
    } catch (e) {}
}

function saveDraftFromForm() {
    if (editingRecipeId) return;
    try { localStorage.setItem(DRAFT_KEY_NEW_RECIPE, JSON.stringify(collectNewRecipeForm())); } catch (e) {}
}

function clearNewRecipeDraft() { try { localStorage.removeItem(DRAFT_KEY_NEW_RECIPE); } catch (e) {} }

function setupAdminDraftPersistence() {
    applyDraftToForm();
    var el = document.getElementById('admin');
    if (!el) return;
    el.removeEventListener('input', saveDraftFromForm);
    el.addEventListener('input', saveDraftFromForm);
    el.removeEventListener('change', saveDraftFromForm);
    el.addEventListener('change', saveDraftFromForm);
}

// ========== Recipe Display ==========
function loadRecipes() {
    const grid = document.getElementById('recipeGrid');
    grid.innerHTML = '';
    if (recipes.length === 0) {
        grid.innerHTML = '<div class="empty-state"><div class="emoji">📭</div><p>暂无菜品</p></div>';
        return;
    }
    recipes.forEach(recipe => {
        const card = document.createElement('div');
        card.className = 'recipe-card';
        card.onclick = () => showRecipeDetail(recipe);
        card.innerHTML = `<div class="recipe-info">
            <div class="recipe-name">${escapeHtml(recipe.name)}</div>
            <div class="recipe-meta">
                <span class="recipe-category">${escapeHtml(recipe.category)}</span>
                <span>⏱️ ${recipe.cookingTime}分钟</span>
            </div></div>`;
        grid.appendChild(card);
    });
}

function searchRecipes() {
    const q = (document.getElementById('searchInput').value || '').toLowerCase();
    const grid = document.getElementById('recipeGrid');
    grid.innerHTML = '';
    const filtered = recipes.filter(r => r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q));
    if (filtered.length === 0) {
        grid.innerHTML = '<div style="text-align: center; padding: 50px; color: #999;">没有找到相关菜品</div>';
        return;
    }
    filtered.forEach(recipe => {
        const card = document.createElement('div');
        card.className = 'recipe-card';
        card.onclick = () => showRecipeDetail(recipe);
        card.innerHTML = `<div class="recipe-info">
            <div class="recipe-name">${escapeHtml(recipe.name)}</div>
            <div class="recipe-meta">
                <span class="recipe-category">${escapeHtml(recipe.category)}</span>
                <span>⏱️ ${recipe.cookingTime}分钟</span>
            </div></div>`;
        grid.appendChild(card);
    });
}

// ========== Modal ==========
function showRecipeDetail(recipe) {
    currentRecipe = recipe;
    document.getElementById('modalTitle').textContent = recipe.name;
    document.getElementById('modalCategory').textContent = recipe.category;

    const imageDiv = document.getElementById('modalImage');
    imageDiv.innerHTML = recipe.image ? `<img src="${recipe.image}" alt="${escapeHtml(recipe.name)}" style="max-width: 100%; border-radius: 10px;">` : '<div style="font-size: 5em;">🍜</div>';

    const ingDiv = document.getElementById('modalIngredients');
    ingDiv.innerHTML = '';
    recipe.ingredients.forEach(ing => {
        ingDiv.innerHTML += `<div class="ingredient-item"><span>${escapeHtml(ing.name)}</span><strong>${escapeHtml(ing.amount)}</strong></div>`;
    });

    const stepsDiv = document.getElementById('modalSteps');
    stepsDiv.innerHTML = '';
    recipe.steps.forEach(step => {
        stepsDiv.innerHTML += `<div class="step-item">${highlightIngredientsInStep(step, recipe.ingredients || [])}</div>`;
    });

    if (recipe.notes) {
        document.getElementById('modalNotesSection').style.display = 'block';
        document.getElementById('modalNotes').textContent = recipe.notes;
    } else {
        document.getElementById('modalNotesSection').style.display = 'none';
    }
    document.getElementById('modalTime').textContent = `约 ${recipe.cookingTime} 分钟`;

    document.getElementById('recipeModal').classList.add('active');
    try { pageScrollY = window.scrollY || 0; document.body.style.top = `-${pageScrollY}px`; document.body.classList.add('modal-open'); } catch (e) {}
}

function closeModal() {
    document.getElementById('recipeModal').classList.remove('active');
    try { document.body.classList.remove('modal-open'); document.body.style.top = ''; window.scrollTo(0, pageScrollY || 0); } catch (e) {}
}

// ========== Ingredient Drag ==========
let draggedElement = null;
function handleDragStart(e) { draggedElement = this; this.style.opacity = '0.5'; e.dataTransfer.effectAllowed = 'move'; }
function handleDragOver(e) {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    if (this !== draggedElement && this.getAttribute('data-ingredient-item') === 'true') {
        const rect = this.getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) this.parentNode.insertBefore(draggedElement, this);
        else this.parentNode.insertBefore(draggedElement, this.nextSibling);
    }
}
function handleDrop(e) { e.stopPropagation(); }
function handleDragEnd() { this.style.opacity = '1'; draggedElement = null; }

function addIngredient() {
    const c = document.getElementById('ingredientsList');
    const div = document.createElement('div');
    div.className = 'ingredient-input-group'; div.draggable = true;
    div.setAttribute('data-ingredient-item', 'true');
    div.innerHTML = `<span class="drag-handle">⋮⋮</span>
        <input type="text" class="form-control" placeholder="材料名称">
        <input type="text" class="form-control" placeholder="用量（如：200克）">
        <button class="btn btn-remove" onclick="removeIngredient(this)">删除</button>`;
    div.addEventListener('dragstart', handleDragStart);
    div.addEventListener('dragover', handleDragOver);
    div.addEventListener('drop', handleDrop);
    div.addEventListener('dragend', handleDragEnd);
    c.appendChild(div);
}

function removeIngredient(btn) { btn.parentElement.remove(); }

// ========== Copy / Print / WeChat ==========
function copyRecipe() {
    let t = `【${currentRecipe.name}】\n\n原材料：\n`;
    currentRecipe.ingredients.forEach(i => { t += `${i.name}：${i.amount}\n`; });
    t += '\n制作步骤：\n';
    currentRecipe.steps.forEach((s, i) => { t += `${i + 1}. ${annotateIngredientsInPlain(s, currentRecipe.ingredients || [])}\n`; });
    if (currentRecipe.notes) t += `\n注意事项：${currentRecipe.notes}\n`;
    t += `\n制作时间：${currentRecipe.cookingTime}分钟`;
    if (navigator.clipboard) { navigator.clipboard.writeText(t).then(() => alert('配方已复制到剪贴板！')); }
    else { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); alert('配方已复制到剪贴板！'); }
}

function printRecipe() {
    if (!currentRecipe) { alert('请先打开一个菜品详情'); return; }
    const r = currentRecipe;
    const w = window.open('', '_blank');
    let html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${r.name}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Microsoft YaHei',sans-serif;padding:40px;color:#333;line-height:1.6}
.hdr{text-align:center;margin-bottom:30px;padding-bottom:20px;border-bottom:2px solid #667eea}
.hdr h1{font-size:2em;color:#667eea;margin-bottom:10px}.hdr .cat{color:#666;font-size:1.1em}
.sec{margin-bottom:30px}.sec h2{color:#667eea;margin-bottom:15px;font-size:1.3em;padding-bottom:10px;border-bottom:1px solid #e0e0e0}
.il{background:#f8f8f8;padding:20px;border-radius:10px}.ii{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e0e0e0}.ii:last-child{border-bottom:none}
.sl{counter-reset:sc}.si{position:relative;padding-left:50px;margin-bottom:20px;counter-increment:sc}
.si::before{content:counter(sc);position:absolute;left:0;top:0;background:#667eea;color:#fff;width:25px;height:25px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:.9em}
.nb{background:#fff3cd;padding:15px;border-radius:10px;border-left:4px solid #ffc107}
.ti{text-align:center;padding:15px;background:#e3f2fd;border-radius:10px;font-size:1.1em;color:#1976d2}
.ing-highlight{color:#0ea5e9;font-weight:700}.ing-amount{color:#0369a1;font-weight:700;margin-left:2px}
</style></head><body>
<div class="hdr"><h1>${escapeHtml(r.name)}</h1><div class="cat">${escapeHtml(r.category)}</div></div>
<div class="sec"><h2>原材料</h2><div class="il">`;
    r.ingredients.forEach(i => { html += `<div class="ii"><span>${escapeHtml(i.name)}</span><strong>${escapeHtml(i.amount)}</strong></div>`; });
    html += `</div></div><div class="sec"><h2>制作步骤</h2><div class="sl">`;
    r.steps.forEach(s => { html += `<div class="si">${highlightIngredientsInStep(s, r.ingredients || [])}</div>`; });
    html += `</div></div>`;
    if (r.notes) html += `<div class="sec"><h2>注意事项</h2><div class="nb">${escapeHtml(r.notes)}</div></div>`;
    html += `<div class="ti">制作时间：约 ${r.cookingTime} 分钟</div>
<div style="text-align:center;margin-top:30px;color:#999;font-size:.9em">后门小吃出品手册 - chupin.ayakoai.com</div></body></html>`;
    w.document.write(html); w.document.close();
    setTimeout(() => w.print(), 250);
}

function sendWecom() {
    if (!currentRecipe) { alert('请先打开一个菜品详情'); return; }
    if (wecomSending) return;
    if (!confirm(`将把【${currentRecipe.name}】发送到企业微信，确认发送吗？`)) return;
    let t = `【${currentRecipe.name}】\n\n原材料：\n`;
    currentRecipe.ingredients.forEach(i => { t += `${i.name}：${i.amount}\n`; });
    t += '\n制作步骤：\n';
    currentRecipe.steps.forEach((s, i) => { t += `${i + 1}. ${annotateIngredientsInPlain(s, currentRecipe.ingredients || [])}\n`; });
    if (currentRecipe.notes) t += `\n注意事项：${currentRecipe.notes}\n`;
    t += `\n制作时间：${currentRecipe.cookingTime}分钟`;
    wecomSending = true;
    fetch(`${API_BASE}/send-webhook`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msgtype: 'text', text: { content: t } })
    }).then(async resp => {
        const d = await resp.json().catch(() => ({}));
        alert(resp.ok ? '已发送到企业微信' : '发送失败：' + (d.message || '未知错误'));
    }).catch(() => alert('发送失败，网络错误')).finally(() => { wecomSending = false; });
}

// ========== Boot ==========
window.onload = init;
window.onclick = function(e) { if (e.target === document.getElementById('recipeModal')) closeModal(); };
