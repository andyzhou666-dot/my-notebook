/**
 * kb.js - 知識庫分類管理邏輯 (Markdown 編輯與渲染)
 */
const kb = (() => {
    let categoriesList = [];
    let knowledgeList = [];
    
    let currentCategoryId = null; // 當前選擇的分類 ID
    let currentKbItemId = null; // 當前選擇的知識條目 ID
    let viewState = 'empty'; // empty, list, detail, edit
    let kbSearchQuery = ''; // 知識庫搜尋關鍵字
    const collapsedCategories = new Set(JSON.parse(localStorage.getItem('kb_collapsed_categories') || '[]')); // 折疊的分類 ID 集合

    const init = async () => {
        setupEvents();
        await render();
    };

    const setupEvents = () => {
        // 分類新增按鈕
        document.getElementById('add-category-btn').addEventListener('click', () => {
            openCategoryModal();
        });

        // 分類表單提交
        document.getElementById('category-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveCategory();
        });

        // 知識條目新增按鈕
        document.getElementById('add-kb-item-btn').addEventListener('click', () => {
            openEditor();
        });

        // 編輯器儲存與取消按鈕
        document.getElementById('kb-save-btn').addEventListener('click', async () => {
            await saveKbItem();
        });

        document.getElementById('kb-cancel-edit-btn').addEventListener('click', () => {
            if (currentKbItemId) {
                switchViewState('detail');
            } else {
                switchViewState('list');
            }
        });

        // 搜尋輸入框綁定
        const searchInput = document.getElementById('search-kb-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                kbSearchQuery = e.target.value.trim().toLowerCase();
                renderItemsList();
            });
        }

        // 點擊外部關閉工具列下拉選單
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown-container')) {
                const dropdowns = document.querySelectorAll('.kb-toolbar-dropdown');
                dropdowns.forEach(d => d.style.display = 'none');
            }
        });
    };

    /**
     * 切換右側的顯示狀態
     * @param {'empty'|'list'|'detail'|'edit'} state 
     */
    const switchViewState = (state) => {
        viewState = state;
        
        const emptyState = document.getElementById('kb-empty-state');
        const listView = document.getElementById('kb-items-list');
        const detailView = document.getElementById('kb-item-detail');
        const editorView = document.getElementById('kb-item-editor');
        const addBtn = document.getElementById('add-kb-item-btn');
        const searchContainer = document.getElementById('kb-search-container');

        // 隱藏全部
        emptyState.style.display = 'none';
        listView.style.display = 'none';
        detailView.style.display = 'none';
        editorView.style.display = 'none';
        addBtn.style.display = 'none';
        if (searchContainer) searchContainer.style.display = 'none';

        if (state === 'empty') {
            emptyState.style.display = 'flex';
        } else if (state === 'list') {
            listView.style.display = 'grid';
            if (currentCategoryId) {
                addBtn.style.display = 'inline-flex';
                if (searchContainer) searchContainer.style.display = 'flex';
            }
            renderItemsList();
        } else if (state === 'detail') {
            detailView.style.display = 'block';
            renderItemDetail();
        } else if (state === 'edit') {
            editorView.style.display = 'flex';
            // 切換為編輯狀態時，預設切回「編輯」頁籤
            switchEditorTab('edit');
        }
    };

    /**
     * 讀取並渲染整個知識庫 (包括分類樹與當前內容)
     */
    const render = async () => {
        try {
            categoriesList = await db.getAll('categories');
            knowledgeList = await db.getAll('knowledge');

            renderCategoryTree();
            
            // 如果原本選取了分類，則保持選取狀態並重新載入列表
            if (currentCategoryId) {
                // 檢查該分類是否還存在
                const catExists = categoriesList.some(c => c.id === currentCategoryId);
                if (catExists) {
                    switchViewState('list');
                } else {
                    currentCategoryId = null;
                    switchViewState('empty');
                }
            } else {
                switchViewState('empty');
            }
        } catch (error) {
            console.error('KB render error:', error);
        }
    };

    /* ----------------- 分類目錄樹狀結構 ----------------- */

    /**
     * 渲染左側樹狀分類目錄
     */
    const renderCategoryTree = () => {
        const treeContainer = document.getElementById('kb-category-tree');
        if (!treeContainer) return;

        // 大類 (parentId 為空或不存在)
        const parentCategories = categoriesList.filter(c => !c.parentId);
        
        if (parentCategories.length === 0) {
            treeContainer.innerHTML = `<div class="empty-text-tip">尚無分類。請點選上方資料夾圖示新增。</div>`;
            return;
        }

        let html = '';
        parentCategories.forEach(parent => {
            // 找出子分類
            const children = categoriesList.filter(c => c.parentId === parent.id);
            const isParentActive = currentCategoryId === parent.id;
            const isCollapsed = collapsedCategories.has(parent.id);

            html += `
                <div class="kb-tree-group">
                    <div class="kb-tree-item ${isParentActive ? 'active' : ''}" 
                         onclick="kb.selectCategory(${parent.id})">
                        <span class="kb-tree-item-label">
                            ${children.length > 0 ? `
                                <i class="fa-solid fa-chevron-down toggle-arrow" 
                                   style="cursor: pointer; transition: var(--transition-smooth); font-size: 0.75rem; margin-right: 6px; width: 12px; display: inline-block; text-align: center; color: var(--text-muted); transform: ${isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'};"
                                   onclick="event.stopPropagation(); kb.toggleCategoryCollapse(${parent.id})"></i>
                            ` : '<span style="width: 18px; display: inline-block;"></span>'}
                            <i class="fa-solid fa-folder"></i>
                            <span>${escapeHtml(parent.name)}</span>
                        </span>
                        <div class="kb-tree-item-actions">
                            <button onclick="event.stopPropagation(); kb.openCategoryModal(null, ${parent.id})" title="新增子分類">
                                <i class="fa-solid fa-plus"></i>
                            </button>
                            <button onclick="event.stopPropagation(); kb.openCategoryModal(${parent.id})" title="修改名稱">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button class="btn-delete" onclick="event.stopPropagation(); kb.deleteCategory(${parent.id})" title="刪除分類">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
            `;

            // 渲染子分類
            if (children.length > 0) {
                html += `<div class="kb-tree-sub" style="${isCollapsed ? 'display: none;' : ''}">`;
                children.forEach(child => {
                    const isChildActive = currentCategoryId === child.id;
                    html += `
                        <div class="kb-tree-item ${isChildActive ? 'active' : ''}" 
                             onclick="kb.selectCategory(${child.id})">
                            <span class="kb-tree-item-label">
                                <i class="fa-solid fa-folder-minus"></i>
                                <span>${escapeHtml(child.name)}</span>
                            </span>
                            <div class="kb-tree-item-actions">
                                <button onclick="event.stopPropagation(); kb.openCategoryModal(${child.id})" title="修改名稱">
                                    <i class="fa-solid fa-pen"></i>
                                </button>
                                <button class="btn-delete" onclick="event.stopPropagation(); kb.deleteCategory(${child.id})" title="刪除分類">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    `;
                });
                html += `</div>`;
            }

            html += `</div>`;
        });

        treeContainer.innerHTML = html;
    };

    /**
     * 選擇分類
     */
    const selectCategory = (id) => {
        currentCategoryId = id;
        currentKbItemId = null;
        
        // 更新分類標題
        const titleElement = document.getElementById('current-category-title');
        const cat = categoriesList.find(c => c.id === id);
        if (titleElement && cat) {
            titleElement.textContent = cat.name;
        }

        renderCategoryTree();
        switchViewState('list');
    };

    /* ----------------- 分類 Modal 編輯邏輯 ----------------- */

    const openCategoryModal = (id = null, parentId = null) => {
        const modal = document.getElementById('category-modal');
        const form = document.getElementById('category-form');
        const select = document.getElementById('category-parent');
        const title = document.getElementById('category-modal-title');
        
        form.reset();

        // 動態填充大類選項 (防無限循環，子分類的父分類只能是「大類」)
        const parentCategories = categoriesList.filter(c => !c.parentId);
        let optionsHtml = '<option value="">(無 - 作為第一層大類)</option>';
        parentCategories.forEach(p => {
            // 如果目前是在修改大類，則不能選自己作為父類
            if (id && p.id === id) return;
            optionsHtml += `<option value="${p.id}">${escapeHtml(p.name)}</option>`;
        });
        select.innerHTML = optionsHtml;

        if (id) {
            title.textContent = '修改分類名稱';
            const cat = categoriesList.find(c => c.id === id);
            document.getElementById('category-id').value = cat.id;
            document.getElementById('category-name').value = cat.name;
            select.value = cat.parentId || '';
        } else {
            title.textContent = '新增分類';
            document.getElementById('category-id').value = '';
            select.value = parentId || ''; // 如果傳入 parentId 表示要建立這個大類下的子分類
        }

        modal.classList.add('active');
    };

    const closeCategoryModal = () => {
        document.getElementById('category-modal').classList.remove('active');
    };

    const saveCategory = async () => {
        const id = document.getElementById('category-id').value;
        const name = document.getElementById('category-name').value.trim();
        const parentVal = document.getElementById('category-parent').value;
        const parentId = parentVal ? parseInt(parentVal, 10) : null;

        if (!name) return;

        const categoryData = { name, parentId };

        try {
            if (id) {
                categoryData.id = parseInt(id, 10);
                await db.put('categories', categoryData);
                app.showToast('分類已更新', 'success');
            } else {
                await db.add('categories', categoryData);
                app.showToast('成功新增分類', 'success');
            }
            closeCategoryModal();
            await render();
        } catch (error) {
            console.error(error);
            app.showToast('儲存分類失敗', 'error');
        }
    };

    const deleteCategory = async (id) => {
        // 檢查是否有子分類
        const hasChildren = categoriesList.some(c => c.parentId === id);
        if (hasChildren) {
            await app.alert('該分類下有子分類，請先將子分類刪除或移開後再行刪除。');
            return;
        }

        // 檢查該分類下是否有知識條目
        const hasItems = knowledgeList.some(k => k.categoryId === id);
        if (hasItems) {
            if (!await app.confirm('該分類下已有知識條目，刪除分類將會把這些條目設為「未分類」，確定要刪除嗎？')) {
                return;
            }
        }

        if (await app.confirm('確定要刪除此分類嗎？')) {
            try {
                // 刪除分類
                await db.remove('categories', id);
                
                // 將該分類下的條目設為未分類 (或 categoryId = null)
                const itemsToUpdate = knowledgeList.filter(k => k.categoryId === id);
                for (const item of itemsToUpdate) {
                    item.categoryId = null;
                    await db.put('knowledge', item);
                }

                app.showToast('分類已刪除', 'info');
                currentCategoryId = null;
                await render();
            } catch (error) {
                console.error(error);
                app.showToast('刪除分類失敗', 'error');
            }
        }
    };

    /* ----------------- 知識條目渲染與 CRUD ----------------- */

    /**
     * 渲染當前分類下的知識卡片列表
     */
    const renderItemsList = () => {
        const listContainer = document.getElementById('kb-items-list');
        if (!listContainer) return;

        // 篩選出目前分類下的條目
        let items = knowledgeList.filter(k => k.categoryId === currentCategoryId);

        // 如果有搜尋關鍵字，進行模糊比對過濾
        if (kbSearchQuery) {
            items = items.filter(item => {
                const titleMatch = item.title && item.title.toLowerCase().includes(kbSearchQuery);
                const contentMatch = item.content && item.content.toLowerCase().includes(kbSearchQuery);
                const tagMatch = item.tags && item.tags.some(t => t.toLowerCase().includes(kbSearchQuery));
                return titleMatch || contentMatch || tagMatch;
            });
        }

        if (items.length === 0) {
            if (kbSearchQuery) {
                listContainer.innerHTML = `
                    <div class="kb-empty-state" style="grid-column: 1 / -1; padding: 40px 0;">
                        <i class="fa-solid fa-magnifying-glass" style="font-size: 2rem; background: none; -webkit-text-fill-color: var(--text-muted); opacity: 0.6;"></i>
                        <p>找不到符合「${escapeHtml(kbSearchQuery)}」的條目。</p>
                    </div>
                `;
            } else {
                listContainer.innerHTML = `
                    <div class="kb-empty-state" style="grid-column: 1 / -1; padding: 40px 0;">
                        <i class="fa-solid fa-book-bookmark" style="font-size: 2rem;"></i>
                        <p>此分類目前沒有任何知識條目。請點選「新增條目」建立。</p>
                    </div>
                `;
            }
            return;
        }

        let html = '';
        items.forEach(item => {
            // 取前 60 字作為預覽文字
            const previewText = item.content ? item.content.substring(0, 60).replace(/[#*`_]/g, '') + '...' : '無內容';
            
            html += `
                <div class="kb-item-card" onclick="kb.showDetail(${item.id})">
                    <div class="kb-item-card-title">${escapeHtml(item.title)}</div>
                    <div class="kb-item-card-preview">${escapeHtml(previewText)}</div>
                    ${item.tags && item.tags.length > 0 ? `
                        <div class="note-content-tags">
                            ${item.tags.map(t => `<span class="note-tag">#${escapeHtml(t)}</span>`).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        });

        listContainer.innerHTML = html;
    };

    /**
     * 顯示知識條目詳細內容 (Markdown 渲染)
     */
    const showDetail = (id) => {
        currentKbItemId = id;
        switchViewState('detail');
    };

    const renderItemDetail = () => {
        const detailContainer = document.getElementById('kb-item-detail');
        if (!detailContainer) return;

        const item = knowledgeList.find(k => k.id === currentKbItemId);
        if (!item) {
            switchViewState('list');
            return;
        }

        // 使用 Marked 渲染 Markdown
        // 確保 marked 庫已載入
        let contentHtml = '';
        if (typeof marked !== 'undefined') {
            contentHtml = marked.parse(item.content || '');
        } else {
            contentHtml = `<pre>${escapeHtml(item.content)}</pre>`;
        }

        detailContainer.innerHTML = `
            <div style="margin-bottom: 20px; display: flex; align-items: center; gap: 12px;">
                <button class="btn btn-secondary" onclick="kb.switchViewState('list')" style="padding: 6px 12px; font-size:0.85rem;">
                    <i class="fa-solid fa-chevron-left"></i> 返回列表
                </button>
                <button class="btn btn-secondary" onclick="kb.openEditor(${item.id})" style="padding: 6px 12px; font-size:0.85rem;">
                    <i class="fa-solid fa-pen-to-square"></i> 編輯
                </button>
                <button class="btn btn-secondary btn-delete" onclick="kb.deleteKbItem(${item.id})" style="padding: 6px 12px; font-size:0.85rem; color:var(--color-danger)">
                    <i class="fa-solid fa-trash-can"></i> 刪除
                </button>
            </div>
            
            <h1 style="font-size: 1.8rem; font-weight:700; margin-bottom:10px; border-bottom:2px solid var(--panel-border); padding-bottom:12px;">
                ${escapeHtml(item.title)}
            </h1>
            
            ${item.tags && item.tags.length > 0 ? `
                <div class="note-content-tags" style="margin-bottom: 24px;">
                    ${item.tags.map(t => `<span class="note-tag">#${escapeHtml(t)}</span>`).join('')}
                </div>
            ` : ''}

            <div class="markdown-body">
                ${contentHtml}
            </div>
        `;
    };

    /* ----------------- 知識條目 編輯器邏輯 ----------------- */

    const openEditor = (id = null) => {
        const titleInput = document.getElementById('kb-title-input');
        const tagsInput = document.getElementById('kb-tags-input');
        const contentInput = document.getElementById('kb-markdown-input');
        
        if (id) {
            currentKbItemId = id;
            const item = knowledgeList.find(k => k.id === id);
            titleInput.value = item.title;
            tagsInput.value = item.tags ? item.tags.join(', ') : '';
            contentInput.value = item.content || '';
        } else {
            currentKbItemId = null;
            titleInput.value = '';
            tagsInput.value = '';
            contentInput.value = '';
        }

        switchViewState('edit');
    };

    const saveKbItem = async () => {
        const title = document.getElementById('kb-title-input').value.trim();
        const tagsVal = document.getElementById('kb-tags-input').value.trim();
        const content = document.getElementById('kb-markdown-input').value;

        if (!title) {
            await app.alert('標題為必填項目！');
            return;
        }

        const tags = tagsVal ? tagsVal.split(',').map(t => t.trim()).filter(t => t) : [];

        const kbItemData = {
            title,
            tags,
            content,
            categoryId: currentCategoryId,
            updatedAt: Date.now()
        };

        try {
            if (currentKbItemId) {
                kbItemData.id = currentKbItemId;
                const original = knowledgeList.find(k => k.id === currentKbItemId);
                kbItemData.createdAt = original.createdAt;
                await db.put('knowledge', kbItemData);
                app.showToast('條目更新成功', 'success');
            } else {
                kbItemData.createdAt = Date.now();
                const newId = await db.add('knowledge', kbItemData);
                currentKbItemId = newId;
                app.showToast('成功新增條目', 'success');
            }

            // 重新載入列表
            await render();
            // 跳回詳細檢視
            switchViewState('detail');
        } catch (error) {
            console.error(error);
            app.showToast('儲存失敗', 'error');
        }
    };

    const deleteKbItem = async (id) => {
        if (await app.confirm('確定要刪除這筆知識條目嗎？')) {
            try {
                await db.remove('knowledge', id);
                app.showToast('條目已刪除', 'info');
                currentKbItemId = null;
                await render();
                switchViewState('list');
            } catch (error) {
                console.error(error);
                app.showToast('刪除失敗', 'error');
            }
        }
    };

    /**
     * 切換大類目錄的折疊狀態
     */
    const toggleCategoryCollapse = (id) => {
        if (collapsedCategories.has(id)) {
            collapsedCategories.delete(id);
        } else {
            collapsedCategories.add(id);
        }
        localStorage.setItem('kb_collapsed_categories', JSON.stringify([...collapsedCategories]));
        renderCategoryTree();
    };

    /**
     * 切換編輯器頁籤 (編輯 vs 預覽)
     */
    const switchEditorTab = (tab) => {
        const editTab = document.getElementById('editor-edit-tab');
        const previewTab = document.getElementById('editor-preview-tab');
        const editContainer = document.getElementById('editor-edit-container');
        const previewContainer = document.getElementById('editor-preview-container');

        if (!editTab || !previewTab || !editContainer || !previewContainer) return;

        // 移除 active 狀態
        editTab.classList.remove('active');
        previewTab.classList.remove('active');
        editTab.style.borderBottom = 'none';
        editTab.style.color = 'var(--text-muted)';
        editTab.style.fontWeight = 'normal';
        previewTab.style.borderBottom = 'none';
        previewTab.style.color = 'var(--text-muted)';
        previewTab.style.fontWeight = 'normal';

        // 隱藏容器
        editContainer.style.display = 'none';
        previewContainer.style.display = 'none';

        if (tab === 'edit') {
            editTab.classList.add('active');
            editTab.style.borderBottom = '2px solid var(--color-primary)';
            editTab.style.color = 'var(--text-primary)';
            editTab.style.fontWeight = '600';
            editContainer.style.display = 'flex';
        } else if (tab === 'preview') {
            previewTab.classList.add('active');
            previewTab.style.borderBottom = '2px solid var(--color-primary)';
            previewTab.style.color = 'var(--text-primary)';
            previewTab.style.fontWeight = '600';
            
            // 渲染預覽內容
            const markdownVal = document.getElementById('kb-markdown-input').value;
            let previewHtml = '';
            if (typeof marked !== 'undefined') {
                previewHtml = marked.parse(markdownVal || '*無內容*');
            } else {
                previewHtml = `<pre>${escapeHtml(markdownVal)}</pre>`;
            }
            previewContainer.innerHTML = previewHtml;
            previewContainer.style.display = 'block';
        }
    };

    /**
     * 開關工具列下拉選單
     */
    const toggleToolbarDropdown = (event, dropdownId) => {
        event.stopPropagation();
        
        // 隱藏所有其他的下拉選單
        const dropdowns = document.querySelectorAll('.kb-toolbar-dropdown');
        dropdowns.forEach(d => {
            if (d.id !== dropdownId) {
                d.style.display = 'none';
            }
        });

        // 切換指定的下拉選單
        const dropdown = document.getElementById(dropdownId);
        if (dropdown) {
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        }
    };

    /**
     * 格式化編輯器文字 (插入 Markdown / HTML)
     */
    const formatText = (type, value = '') => {
        const textarea = document.getElementById('kb-markdown-input');
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const selection = text.substring(start, end);

        let before = '';
        let after = '';

        switch (type) {
            case 'bold':
                before = '**';
                after = '**';
                break;
            case 'italic':
                before = '*';
                after = '*';
                break;
            case 'underline':
                before = '<u>';
                after = '</u>';
                break;
            case 'h1':
                before = '\n# ';
                after = '';
                break;
            case 'h2':
                before = '\n## ';
                after = '';
                break;
            case 'ul':
                before = '\n- ';
                after = '';
                break;
            case 'code':
                before = '\n```\n';
                after = '\n```\n';
                break;
            case 'color':
                before = `<span style="color: ${value};">`;
                after = '</span>';
                break;
            case 'size':
                before = `<span style="font-size: ${value};">`;
                after = '</span>';
                break;
        }

        const replacement = before + (selection || '選取文字') + after;
        textarea.value = text.substring(0, start) + replacement + text.substring(end);
        
        // 重設選區與焦點
        textarea.focus();
        textarea.selectionStart = start + before.length;
        textarea.selectionEnd = start + before.length + (selection || '選取文字').length;

        // 關閉所有下拉選單
        const dropdowns = document.querySelectorAll('.kb-toolbar-dropdown');
        dropdowns.forEach(d => d.style.display = 'none');
    };

    // Helper: 避免 XSS
    const escapeHtml = (text) => {
        if (!text) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, function(m) { return map[m]; });
    };

    return {
        init,
        render,
        selectCategory,
        openCategoryModal,
        closeCategoryModal,
        deleteCategory,
        switchViewState,
        showDetail,
        openEditor,
        deleteKbItem,
        toggleCategoryCollapse,
        switchEditorTab,
        toggleToolbarDropdown,
        formatText
    };
})();

window.kb = kb;
