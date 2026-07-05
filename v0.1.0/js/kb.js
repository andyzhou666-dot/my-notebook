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
    let currentKbTagFilter = null; // 當前選取的標籤篩選
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

        // 知識庫編輯區鍵盤輔助 (處理程式碼區塊 Backspace 刪除與 Ctrl+Enter 跳出)
        const kbEditor = document.getElementById('kb-markdown-input');
        if (kbEditor) {
            kbEditor.addEventListener('keydown', (e) => {
                const selection = window.getSelection();
                if (!selection.rangeCount) return;
                const range = selection.getRangeAt(0);

                // 1. 處理 Backspace 鍵
                if (e.key === 'Backspace') {
                    let node = range.startContainer;
                    while (node && node !== kbEditor) {
                        if (node.nodeName === 'PRE') {
                            const textContent = node.textContent.replace(/\u200B/g, '').trim();
                            // 如果程式碼區塊為空或僅含空字元，按 Backspace 將其轉為普通段落，消除灰底
                            if (textContent === '' || textContent === '\n') {
                                e.preventDefault();
                                const p = document.createElement('p');
                                p.innerHTML = '<br>';
                                node.parentNode.replaceChild(p, node);
                                
                                // 移回游標
                                const newRange = document.createRange();
                                newRange.selectNodeContents(p);
                                newRange.collapse(true);
                                selection.removeAllRanges();
                                selection.addRange(newRange);
                            }
                            return;
                        }
                        node = node.parentNode;
                    }
                }

                // 2. 處理 Ctrl+Enter 鍵 (快速跳出程式碼區塊)
                if (e.key === 'Enter' && e.ctrlKey) {
                    let node = range.startContainer;
                    while (node && node !== kbEditor) {
                        if (node.nodeName === 'PRE') {
                            e.preventDefault();
                            const p = document.createElement('p');
                            p.innerHTML = '<br>';
                            // 在 PRE 後方插入新段落
                            node.parentNode.insertBefore(p, node.nextSibling);
                            
                            // 將游標移到新段落
                            const newRange = document.createRange();
                            newRange.selectNodeContents(p);
                            newRange.collapse(true);
                            selection.removeAllRanges();
                            selection.addRange(newRange);
                            return;
                        }
                        node = node.parentNode;
                    }
                }
            });
        }
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
            renderTagCloud(); // 渲染標籤雲
            
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
            } else if (currentKbTagFilter) {
                // 保持標籤篩選狀態
                switchViewState('list');
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
        currentKbTagFilter = null; // 清除標籤篩選
        
        // 更新分類標題
        const titleElement = document.getElementById('current-category-title');
        const cat = categoriesList.find(c => c.id === id);
        if (titleElement && cat) {
            titleElement.textContent = cat.name;
        }

        // 清除搜尋框
        kbSearchQuery = '';
        const searchInput = document.getElementById('search-kb-input');
        if (searchInput) searchInput.value = '';

        renderCategoryTree();
        renderTagCloud(); // 重新整理標籤選取狀態
        switchViewState('list');
    };

    /**
     * 渲染知識庫側邊欄底部標籤雲
     */
    const renderTagCloud = () => {
        const container = document.getElementById('kb-tag-cloud');
        if (!container) return;

        // 計算標籤出現次數
        const tagCounts = {};
        knowledgeList.forEach(item => {
            if (item.tags && item.tags.length > 0) {
                item.tags.forEach(tag => {
                    const trimmed = tag.trim();
                    if (trimmed) {
                        tagCounts[trimmed] = (tagCounts[trimmed] || 0) + 1;
                    }
                });
            }
        });

        const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);

        if (sortedTags.length === 0) {
            container.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-muted); padding: 4px;">無標籤</div>';
            return;
        }

        const counts = sortedTags.map(t => t[1]);
        const maxCount = Math.max(...counts);
        const minCount = Math.min(...counts);

        let html = '';
        sortedTags.forEach(([tag, count]) => {
            let fontSize = 0.8;
            if (maxCount !== minCount) {
                // 字體大小在 0.75rem ~ 1.15rem 之間動態縮放
                fontSize = 0.75 + ((count - minCount) / (maxCount - minCount)) * 0.4;
            }
            
            const isActive = currentKbTagFilter === tag;
            
            html += `
                <span class="note-tag ${isActive ? 'active' : ''}" 
                      style="font-size: ${fontSize}rem; cursor: pointer; display: inline-block; padding: 2px 6px; border-radius: 4px; border: 1px solid ${isActive ? 'var(--color-primary)' : 'var(--panel-border)'}; background: ${isActive ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.02)'}; margin-bottom: 2px;" 
                      onclick="kb.selectTag('${escapeHtml(tag)}')">
                    #${escapeHtml(tag)} <span style="font-size: 0.7em; opacity: 0.6;">(${count})</span>
                </span>
            `;
        });

        container.innerHTML = html;
    };

    /**
     * 點擊標籤雲中的標籤進行過濾
     */
    const selectTag = (tag) => {
        if (currentKbTagFilter === tag) {
            // 重複點擊已選取標籤，清除篩選狀態
            currentKbTagFilter = null;
            currentCategoryId = null;
            const titleElement = document.getElementById('current-category-title');
            if (titleElement) titleElement.textContent = '未選擇分類';
            renderCategoryTree();
            renderTagCloud();
            switchViewState('empty');
            return;
        }

        currentKbTagFilter = tag;
        currentCategoryId = null; // 清除大類/子分類的選取狀態
        currentKbItemId = null;

        // 更新分類標題
        const titleElement = document.getElementById('current-category-title');
        if (titleElement) {
            titleElement.innerHTML = `<i class="fa-solid fa-tag" style="color: var(--color-primary); margin-right: 6px;"></i>標籤篩選：#${escapeHtml(tag)}`;
        }

        // 清除關鍵字搜尋框
        kbSearchQuery = '';
        const searchInput = document.getElementById('search-kb-input');
        if (searchInput) searchInput.value = '';

        renderCategoryTree();
        renderTagCloud();
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

        // 1. 決定資料來源：若是標籤篩選則讀取所有含有該標籤的項目；否則讀取該分類項目
        let items = [];
        if (currentKbTagFilter) {
            items = knowledgeList.filter(k => k.tags && k.tags.includes(currentKbTagFilter));
        } else {
            items = knowledgeList.filter(k => k.categoryId === currentCategoryId);
        }

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
                        <p>目前沒有任何知識條目。請點選「新增條目」建立。</p>
                    </div>
                `;
            }
            return;
        }

        let html = '';
        items.forEach(item => {
            // 2. 智慧提取包含搜尋文字的摘要片段，並移除 markdown 語法符號
            let previewTextHtml = '';
            const cleanContent = item.content ? item.content.replace(/[#*`_~\[\]()\-]/g, ' ').replace(/\s+/g, ' ') : '';
            
            let titleHtml = escapeHtml(item.title);
            
            if (kbSearchQuery) {
                const lowerContent = cleanContent.toLowerCase();
                const queryIdx = lowerContent.indexOf(kbSearchQuery);
                
                let snippet = '';
                if (queryIdx !== -1) {
                    // 向前取 20 字，向後取 40 字
                    const start = Math.max(0, queryIdx - 20);
                    const end = Math.min(cleanContent.length, queryIdx + kbSearchQuery.length + 40);
                    snippet = (start > 0 ? '...' : '') + cleanContent.substring(start, end) + (end < cleanContent.length ? '...' : '');
                } else {
                    snippet = cleanContent.substring(0, 60) + (cleanContent.length > 60 ? '...' : '');
                }
                
                // 先安全跳脫 HTML
                let escapedSnippet = escapeHtml(snippet);
                
                // 再對關鍵字進行 <mark> 高亮標註
                const escapedQuery = kbSearchQuery.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                const regex = new RegExp(`(${escapedQuery})`, 'gi');
                
                previewTextHtml = escapedSnippet.replace(regex, '<mark style="background: rgba(245, 158, 11, 0.35); color: inherit; padding: 1px 3px; border-radius: 2px; font-weight: bold;">$1</mark>');
                titleHtml = titleHtml.replace(regex, '<mark style="background: rgba(245, 158, 11, 0.35); color: inherit; padding: 1px 3px; border-radius: 2px; font-weight: bold;">$1</mark>');
            } else {
                previewTextHtml = escapeHtml(cleanContent.substring(0, 60) + (cleanContent.length > 60 ? '...' : ''));
            }
            
            html += `
                <div class="kb-item-card" onclick="kb.showDetail(${item.id})">
                    <div class="kb-item-card-title">${titleHtml}</div>
                    <div class="kb-item-card-preview">${previewTextHtml || '無內容'}</div>
                    ${item.tags && item.tags.length > 0 ? `
                        <div class="note-content-tags">
                            ${item.tags.map(t => `<span class="note-tag ${currentKbTagFilter === t ? 'active' : ''}">#${escapeHtml(t)}</span>`).join('')}
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
            // 關鍵：載入時若有資料，先用 marked 轉成 HTML 以在編輯框內實現所見即所得富文本
            if (typeof marked !== 'undefined' && item.content) {
                contentInput.innerHTML = marked.parse(item.content);
            } else {
                contentInput.innerHTML = item.content || '';
            }
        } else {
            currentKbItemId = null;
            titleInput.value = '';
            tagsInput.value = '';
            contentInput.innerHTML = '';
        }

        switchViewState('edit');
    };

    const saveKbItem = async () => {
        const title = document.getElementById('kb-title-input').value.trim();
        const tagsVal = document.getElementById('kb-tags-input').value.trim();
        // 關鍵：儲存時直接抓取富文本編輯器產出的 HTML 內容
        const content = document.getElementById('kb-markdown-input').innerHTML;

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
            const editorHtml = document.getElementById('kb-markdown-input').innerHTML;
            previewContainer.innerHTML = editorHtml || '<p style="color:var(--text-muted);">*無內容*</p>';
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
     * 格式化編輯器文字 (所見即所得富文本編輯)
     */
    const formatText = (type, value = '') => {
        const editor = document.getElementById('kb-markdown-input');
        if (!editor) return;

        editor.focus();

        switch (type) {
            case 'bold':
                document.execCommand('bold', false, null);
                break;
            case 'italic':
                document.execCommand('italic', false, null);
                break;
            case 'underline':
                document.execCommand('underline', false, null);
                break;
            case 'strike':
                document.execCommand('strikeThrough', false, null);
                break;
            case 'clean':
                document.execCommand('removeFormat', false, null);
                break;
            case 'h1':
                document.execCommand('formatBlock', false, '<h1>');
                break;
            case 'h2':
                document.execCommand('formatBlock', false, '<h2>');
                break;
            case 'quote':
                const selectedQuote = document.getSelection().toString() || '引用文字';
                document.execCommand('insertHTML', false, `<blockquote style="border-left: 4px solid var(--color-primary); padding-left: 12px; margin: 10px 0; color: var(--text-secondary); font-style: italic;">${escapeHtml(selectedQuote)}</blockquote><p><br></p>`);
                break;
            case 'hr':
                document.execCommand('insertHorizontalRule', false, null);
                break;
            case 'align-left':
                document.execCommand('justifyLeft', false, null);
                break;
            case 'align-center':
                document.execCommand('justifyCenter', false, null);
                break;
            case 'align-right':
                document.execCommand('justifyRight', false, null);
                break;
            case 'link':
                const selection = document.getSelection().toString();
                const url = prompt('請輸入連結網址 (例如: https://example.com):');
                if (url) {
                    if (!selection) {
                        document.execCommand('insertHTML', false, `<a href="${url}" target="_blank" style="color: var(--color-primary); text-decoration: underline;">${url}</a>`);
                    } else {
                        document.execCommand('createLink', false, url);
                        // 自動為選取的連結設定 target="_blank" 與配色
                        const sel = window.getSelection();
                        if (sel.rangeCount > 0) {
                            const el = sel.anchorNode.parentNode;
                            if (el.nodeName === 'A') {
                                el.setAttribute('target', '_blank');
                                el.style.color = 'var(--color-primary)';
                                el.style.textDecoration = 'underline';
                            }
                        }
                    }
                }
                break;
            case 'ul':
                document.execCommand('insertUnorderedList', false, null);
                break;
            case 'ol':
                document.execCommand('insertOrderedList', false, null);
                break;
            case 'code':
                const selectionText = document.getSelection().toString() || ' ';
                document.execCommand('insertHTML', false, `<pre style="background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px; font-family: monospace; border: 1px solid var(--panel-border); margin: 8px 0; color: var(--text-primary);"><code style="background:none; padding:0; color:inherit;">${escapeHtml(selectionText)}</code></pre><p><br></p>`);
                break;
            case 'color':
                document.execCommand('foreColor', false, value);
                break;
            case 'size':
                const selectedText = document.getSelection().toString() || '選取文字';
                document.execCommand('insertHTML', false, `<span style="font-size: ${value};">${escapeHtml(selectedText)}</span>`);
                break;
        }

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
        formatText,
        selectTag
    };
})();

window.kb = kb;
