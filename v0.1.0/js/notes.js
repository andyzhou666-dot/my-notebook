/**
 * notes.js - 每日工作日誌與進度追蹤邏輯
 */
const notes = (() => {
    let logsList = [];                 // 聚合後的工作日誌清單
    let selectedTagFilter = '';        // 當前選取的標籤篩選
    let searchQuery = '';              // 當前搜尋字串
    let currentStatusFilter = '';      // 看板狀態過濾 ('todo' 或 'failed')

    let lastLoadedDateKey = '';        // 最後成功載入的日誌日期
    let collapsedLogDates = new Set();  // 使用者手動折疊的日誌日期
    let expandedLogDates = new Set();   // 使用者手動展開的日誌日期

    const init = async () => {
        // 設定今日日期選擇器預設值為今天 (YYYY-MM-DD)
        const datePicker = document.getElementById('log-date-picker');
        if (datePicker) {
            datePicker.value = getTodayDateKey();
        }
        
        // 載入選定日期的日誌內容作為初始草稿 (預設為今天)
        await loadLogDraftForDate(getTodayDateKey());

        setupEvents();
        await render();
    };

    /**
     * 載入特定日期的日誌草稿 (若該日已建檔，載入 items 與心得，否則清空)
     */
    const loadLogDraftForDate = async (dateKey) => {
        if (!dateKey) return;
        
        try {
            lastLoadedDateKey = dateKey;
            updateStatsDashboard(); // 即時刷新頂部完成率與日期顯示
        } catch (err) {
            console.error('Load log draft error:', err);
        }
    };

    /**
     * 偵測當前編輯器是否含有「未新增的事項文字」
     */
    const hasUnsavedChanges = () => {
        // 僅比對輸入框中是否有輸入但尚未新增的事項文字
        const textInput = document.getElementById('log-item-text');
        if (textInput && textInput.value.trim()) return true;
        return false;
    };

    /**
     * 監聽日期選擇器切換事件 (帶有防呆警告)
     */
    const handleDateChange = async (newDate) => {
        if (!newDate || newDate === lastLoadedDateKey) return;

        if (hasUnsavedChanges()) {
            const confirmLeave = await app.confirm(
                `您在輸入框中已輸入事項文字但尚未點擊新增，確定要切換到 ${newDate} 嗎？`,
                '未新增變更警告'
            );
            if (!confirmLeave) {
                // 將日期選擇器還原為切換前的值
                const datePicker = document.getElementById('log-date-picker');
                if (datePicker) {
                    datePicker.value = lastLoadedDateKey;
                }
                return;
            }
        }

        await loadLogDraftForDate(newDate);

        // 載入編輯時，自動將該日期的歷史卡片強制展開以供對照
        collapsedLogDates.delete(newDate);
        expandedLogDates.add(newDate);
        const cardEl = document.getElementById(`log-card-${newDate}`);
        if (cardEl) {
            cardEl.classList.remove('collapsed');
            const iconEl = cardEl.querySelector('.log-card-toggle-icon');
            if (iconEl) iconEl.style.transform = 'rotate(0deg)';
        }
    };

    /**
     * 切換單張日誌卡片的展開/收合狀態 (防止點擊按鈕或複選框等交互元素時誤切換)
     */
    const toggleCardCollapse = (event, dateKey) => {
        if (!dateKey) return;
        
        // 阻止點擊卡片標頭內的按鈕、複選框、下拉選單等操作觸發卡片折疊
        const target = event.target;
        if (
            target.closest('button') || 
            target.closest('input') || 
            target.closest('select') || 
            target.closest('.log-progress-container')
        ) {
            return;
        }

        // 判斷目前是展開還是折疊
        const cardEl = document.getElementById(`log-card-${dateKey}`);
        const isCollapsed = cardEl ? cardEl.classList.contains('collapsed') : true;

        if (isCollapsed) {
            // 切換為展開
            collapsedLogDates.delete(dateKey);
            expandedLogDates.add(dateKey);
            if (cardEl) {
                cardEl.classList.remove('collapsed');
            }
        } else {
            // 切換為折疊
            expandedLogDates.delete(dateKey);
            collapsedLogDates.add(dateKey);
            if (cardEl) {
                cardEl.classList.add('collapsed');
            }
        }
    };

    /**
     * 一鍵展開或收合所有歷史日誌卡片
     */
    const expandAllLogs = (shouldExpand) => {
        collapsedLogDates.clear();
        expandedLogDates.clear();

        logsList.forEach(log => {
            if (shouldExpand) {
                expandedLogDates.add(log.date);
            } else {
                collapsedLogDates.add(log.date);
            }
        });

        renderList();
        app.showToast(shouldExpand ? '已展開所有歷史日誌' : '已收合所有歷史日誌', 'success');
    };

    const setupEvents = () => {
        const itemTextInput = document.getElementById('log-item-text');
        const failReasonInput = document.getElementById('log-item-fail-reason');
        const searchInput = document.getElementById('search-notes-input');
        const datePicker = document.getElementById('log-date-picker');
        const exportLogsBtn = document.getElementById('export-logs-btn');

        // 日期選擇監聽
        if (datePicker) {
            datePicker.addEventListener('change', (e) => {
                handleDateChange(e.target.value);
            });
        }

        // 輸入事項按 Enter 快捷新增
        if (itemTextInput) {
            itemTextInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addLogItemDirect();
                }
            });
        }

        // 輸入遇阻原因按 Enter 快捷新增
        if (failReasonInput) {
            failReasonInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addLogItemDirect();
                }
            });
        }

        // 搜尋日誌
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                searchQuery = e.target.value.trim().toLowerCase();
                renderList();
            });
        }

        // 匯出日誌 Excel 現已改由 index.html 的 inline onclick 呼叫 notes.openExportModal()
    };

    /**
     * 取得今天日期的 YYYY-MM-DD 格式 (本地時區)
     */
    const getTodayDateKey = () => {
        const offset = new Date().getTimezoneOffset();
        const localDate = new Date(Date.now() - (offset * 60 * 1000));
        return localDate.toISOString().split('T')[0];
    };

    /**
     * 將舊筆記資料轉化為標準單一 item
     */
    const parseOldNoteToItem = (oldNote) => {
        const content = oldNote.content || '';
        let isTodo = content.startsWith('/todo');
        let status = 'success';
        let displayText = content;
        
        if (isTodo) {
            if (content.startsWith('/todo [x]')) {
                status = 'success';
                displayText = content.substring(9).trim();
            } else if (content.startsWith('/todo [ ]')) {
                status = 'todo';
                displayText = content.substring(9).trim();
            } else {
                status = 'todo';
                displayText = content.substring(5).trim();
            }
        }
        return {
            id: oldNote.id || Date.now(),
            text: displayText,
            status: status,
            failReason: ''
        };
    };

    /**
     * 解析事項中的 Hashtag (#tag)
     */
    const parseTags = (text) => {
        const regex = /#([^\s#]+)/g;
        const tags = [];
        let match;
        while ((match = regex.exec(text)) !== null) {
            tags.push(match[1]);
        }
        return [...new Set(tags)];
    };

    /**
     * 監聽狀態切換：如果是「遇阻」，展開失敗原因欄位
     */
    const handleStatusChange = (status) => {
        const failRow = document.getElementById('log-item-fail-reason-row');
        if (failRow) {
            if (status === 'failed') {
                failRow.style.display = 'block';
                document.getElementById('log-item-fail-reason').focus();
            } else {
                failRow.style.display = 'none';
                document.getElementById('log-item-fail-reason').value = '';
            }
        }
    };

    /**
     * 直接新增事項到選定日期的日誌 (即時儲存)
     */
    const addLogItemDirect = async () => {
        const textInput = document.getElementById('log-item-text');
        const statusSelect = document.getElementById('log-item-status');
        const failReasonInput = document.getElementById('log-item-fail-reason');
        const datePicker = document.getElementById('log-date-picker');

        if (!textInput) return;
        const text = textInput.value.trim();
        if (!text) {
            app.showToast('請輸入事項描述', 'warning');
            return;
        }

        const selectedDate = datePicker ? datePicker.value : getTodayDateKey();
        const status = statusSelect.value;
        let failReason = '';
        if (status === 'failed') {
            failReason = failReasonInput.value.trim() || '未說明具體原因';
        }

        const newItem = {
            id: Date.now(),
            text,
            status,
            failReason
        };

        try {
            // 讀取現有資料庫資料
            const allNotes = await db.getAll('notes');
            const existingLog = allNotes.find(n => {
                if (n.date === selectedDate) return true;
                if (!n.date && n.createdAt) {
                    return new Date(n.createdAt).toISOString().split('T')[0] === selectedDate;
                }
                return false;
            });

            let logData;
            if (existingLog) {
                // 在已有的日誌中追加事項
                logData = { ...existingLog };
                logData.items = logData.items || [];
                logData.items.push(newItem);
                logData.updatedAt = Date.now();
                // 重新計算標籤
                let allTags = [];
                logData.items.forEach(item => {
                    allTags = allTags.concat(parseTags(item.text));
                });
                if (logData.notes) {
                    allTags = allTags.concat(parseTags(logData.notes));
                }
                logData.tags = [...new Set(allTags)];

                await db.put('notes', logData);
            } else {
                // 建立新的一天
                logData = {
                    date: selectedDate,
                    items: [newItem],
                    notes: '',
                    tags: parseTags(text),
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };
                await db.add('notes', logData);
            }

            // 重置輸入框
            textInput.value = '';
            failReasonInput.value = '';
            statusSelect.value = 'todo';
            handleStatusChange('todo');

            app.showToast(`已新增事項至 ${selectedDate} 日誌`, 'success');
            
            // 重新載入並自動展開該日期卡片
            expandedLogDates.add(selectedDate);
            collapsedLogDates.delete(selectedDate);
            
            await render();
            textInput.focus();
        } catch (error) {
            console.error('Add item direct error:', error);
            app.showToast('新增事項失敗', 'error');
        }
    };

    /**
     * 刪除日誌中特定單一事項 (即時儲存)
     */
    const deleteLogItem = async (logId, itemId) => {
        if (!await app.confirm('確定要刪除這項工作事項嗎？')) return;
        try {
            const docId = typeof logId === 'string' ? (parseInt(logId, 10) || logId) : logId;
            const item_id = typeof itemId === 'string' ? (parseInt(itemId, 10) || itemId) : itemId;
            const rawNote = await db.getById('notes', docId);
            if (!rawNote) return;

            rawNote.items = (rawNote.items || []).filter(item => item.id !== item_id);
            rawNote.updatedAt = Date.now();

            // 重新計算標籤
            let allTags = [];
            rawNote.items.forEach(item => {
                allTags = allTags.concat(parseTags(item.text));
            });
            if (rawNote.notes) {
                allTags = allTags.concat(parseTags(rawNote.notes));
            }
            rawNote.tags = [...new Set(allTags)];

            // 如果該日誌沒有任何事項，也沒有心得，直接刪除整天日誌
            if (rawNote.items.length === 0 && !rawNote.notes) {
                await db.remove('notes', docId);
                app.showToast('日誌事項已清空，整日日誌已自動刪除', 'info');
            } else {
                await db.put('notes', rawNote);
                app.showToast('事項已刪除', 'success');
            }

            await render();
        } catch (error) {
            console.error('Delete item error:', error);
            app.showToast('刪除事項失敗', 'error');
        }
    };

    /**
     * 直接修改日誌中特定單一事項的文字內容 (即時儲存)
     */
    const editLogItemText = async (logId, itemId, currentText) => {
        const newText = await app.prompt('請輸入修改後的事項內容：', currentText);
        if (newText === null) return; // 使用者按取消
        const trimmed = newText.trim();
        if (!trimmed) {
            app.showToast('內容不能為空', 'warning');
            return;
        }

        try {
            const docId = typeof logId === 'string' ? (parseInt(logId, 10) || logId) : logId;
            const item_id = typeof itemId === 'string' ? (parseInt(itemId, 10) || itemId) : itemId;
            const rawNote = await db.getById('notes', docId);
            if (!rawNote) return;

            const targetItem = (rawNote.items || []).find(item => item.id === item_id);
            if (targetItem) {
                targetItem.text = trimmed;
                rawNote.updatedAt = Date.now();

                // 重新計算標籤
                let allTags = [];
                rawNote.items.forEach(item => {
                    allTags = allTags.concat(parseTags(item.text));
                });
                if (rawNote.notes) {
                    allTags = allTags.concat(parseTags(rawNote.notes));
                }
                rawNote.tags = [...new Set(allTags)];

                await db.put('notes', rawNote);
                app.showToast('事項文字已修改', 'success');
                await render();
            }
        } catch (error) {
            console.error('Edit item text error:', error);
            app.showToast('修改事項失敗', 'error');
        }
    };

    /**
     * 將事項標記為遇阻並設定原因 (即時儲存)
     */
    const promptLogItemFailed = async (logId, itemId) => {
        try {
            const docId = typeof logId === 'string' ? (parseInt(logId, 10) || logId) : logId;
            const item_id = typeof itemId === 'string' ? (parseInt(itemId, 10) || itemId) : itemId;
            const rawNote = await db.getById('notes', docId);
            if (!rawNote) return;

            const targetItem = (rawNote.items || []).find(item => item.id === item_id);
            if (!targetItem) return;

            const currentReason = targetItem.status === 'failed' ? (targetItem.failReason || '') : '';
            const reason = await app.prompt('請輸入遇阻/卡關原因：', currentReason);
            if (reason === null) return; // 使用者按取消

            const trimmedReason = reason.trim();
            if (trimmedReason) {
                targetItem.status = 'failed';
                targetItem.failReason = trimmedReason;
            } else {
                targetItem.status = 'todo';
                targetItem.failReason = '';
            }

            rawNote.updatedAt = Date.now();
            await db.put('notes', rawNote);
            app.showToast('遇阻狀態已更新', 'success');
            await render();
        } catch (error) {
            console.error('Prompt fail item error:', error);
            app.showToast('更新遇阻狀態失敗', 'error');
        }
    };

    /**
     * 更新特定日期的今日心得/備註 (即時儲存)
     */
    const updateNotesDirect = async (logId, notesValue) => {
        try {
            const docId = typeof logId === 'string' ? (parseInt(logId, 10) || logId) : logId;
            const rawNote = await db.getById('notes', docId);
            if (!rawNote) return;

            rawNote.notes = notesValue.trim();
            rawNote.updatedAt = Date.now();

            // 重新計算標籤
            let allTags = [];
            if (rawNote.items) {
                rawNote.items.forEach(item => {
                    allTags = allTags.concat(parseTags(item.text));
                });
            }
            if (rawNote.notes) {
                allTags = allTags.concat(parseTags(rawNote.notes));
            }
            rawNote.tags = [...new Set(allTags)];

            // 如果沒有任何事項，也沒有心得，則刪除整天日誌
            if ((rawNote.items || []).length === 0 && !rawNote.notes) {
                await db.remove('notes', docId);
                app.showToast('日誌已自動刪除', 'info');
            } else {
                await db.put('notes', rawNote);
                app.showToast('心得備註已自動儲存', 'success');
            }

            await render();
        } catch (error) {
            console.error('Update notes error:', error);
            app.showToast('心得儲存失敗', 'error');
        }
    };

    /**
     * 刪除特定日期的整天日誌
     */
    const deleteNote = async (id) => {
        if (await app.confirm('確定要刪除這整天的工作日誌嗎？刪除後無法還原。')) {
            try {
                const docId = typeof id === 'string' ? (parseInt(id, 10) || id) : id;
                await db.remove('notes', docId);
                app.showToast('日誌已成功刪除', 'info');
                await render();
            } catch (error) {
                console.error(error);
                app.showToast('刪除日誌失敗', 'error');
            }
        }
    };

    /**
     * 在歷史卡片上點擊 Checkbox，直接切換特定日誌中事項的狀態
     */
    const toggleLogItemStatus = async (logId, itemId, isChecked) => {
        try {
            const docId = typeof logId === 'string' ? (parseInt(logId, 10) || logId) : logId;
            const item_id = typeof itemId === 'string' ? (parseInt(itemId, 10) || itemId) : itemId;
            const log = await db.getById('notes', docId);
            if (!log) return;

            let logItems = [];
            if (!log.items && log.content) {
                logItems = [parseOldNoteToItem(log)];
            } else {
                logItems = log.items || [];
            }

            const targetItem = logItems.find(item => item.id === item_id);
            if (targetItem) {
                targetItem.status = isChecked ? 'success' : 'todo';
                if (isChecked) {
                    targetItem.failReason = ''; // 完成則清除遇阻原因
                }
            }

            // 更新日誌
            log.items = logItems;
            // 相容性防護：若原先為舊單筆筆記，同步更新 content 為 /todo 格式
            if (log.content) {
                const primaryItem = logItems[0];
                log.content = `/todo [${primaryItem.status === 'success' ? 'x' : ' '}] ${primaryItem.text}`;
            }
            log.updatedAt = Date.now();

            await db.put('notes', log);
            
            // 如果修改的是編輯器目前選取的日期，同步更新編輯器草稿
            const datePicker = document.getElementById('log-date-picker');
            const selectedDate = datePicker ? datePicker.value : getTodayDateKey();
            if (log.date === selectedDate) {
                await loadLogDraftForDate(selectedDate);
            }

            await render();
            app.showToast('事項狀態已更新', 'success');
        } catch (err) {
            console.error('Toggle log item error:', err);
            app.showToast('更新狀態失敗', 'error');
        }
    };

    /**
     * 讀取 IndexedDB 並重整日誌資料 (按天聚合與向下相容)
     */
    const render = async () => {
        try {
            const rawNotes = await db.getAll('notes');
            
            // 1. 按天聚合日誌
            const logsMap = new Map();

            rawNotes.forEach(n => {
                let dateKey = n.date;
                if (!dateKey && n.createdAt) {
                    dateKey = new Date(n.createdAt).toISOString().split('T')[0];
                }
                if (!dateKey) dateKey = '未知日期';

                let itemsList = [];
                if (!n.items && n.content) {
                    itemsList = [parseOldNoteToItem(n)];
                } else {
                    itemsList = n.items || [];
                }

                if (!logsMap.has(dateKey)) {
                    logsMap.set(dateKey, {
                        id: n.id,
                        date: dateKey,
                        items: JSON.parse(JSON.stringify(itemsList)),
                        notes: n.notes || '',
                        tags: n.tags || [],
                        createdAt: n.createdAt || Date.now()
                    });
                } else {
                    const existing = logsMap.get(dateKey);
                    existing.items = existing.items.concat(JSON.parse(JSON.stringify(itemsList)));
                    if (n.notes) {
                        existing.notes = existing.notes ? (existing.notes + '\n' + n.notes) : n.notes;
                    }
                    if (n.tags && n.tags.length > 0) {
                        existing.tags = [...new Set(existing.tags.concat(n.tags))];
                    }
                    if (n.createdAt && n.createdAt > existing.createdAt) {
                        existing.id = n.id;
                        existing.createdAt = n.createdAt;
                    }
                }
            });

            logsList = Array.from(logsMap.values());
            logsList.sort((a, b) => b.date.localeCompare(a.date));

            // 2. 更新頂部統計看板與 UI
            updateStatsDashboard();

            // 3. 渲染篩選器與清單
            renderTagsFilter();
            renderList();
        } catch (error) {
            console.error('Render logs error:', error);
        }
    };

    /**
     * 更新統計看板資料 (本日完成率、進行中工作、遇阻卡關數)
     */
    const updateStatsDashboard = () => {
        const datePicker = document.getElementById('log-date-picker');
        const selectedDate = datePicker ? datePicker.value : getTodayDateKey();
        const selectedLog = logsList.find(l => l.date === selectedDate);

        // 1. 選定日期的完成率 (採用已選定日期的資料作為即時數據來源)
        let completionPercent = 0;
        if (selectedLog && selectedLog.items && selectedLog.items.length > 0) {
            const totalItems = selectedLog.items.length;
            const successCount = selectedLog.items.filter(item => item.status === 'success').length;
            completionPercent = Math.round((successCount / totalItems) * 100);
        }
        
        const completionVal = document.getElementById('stat-today-completion');
        const completionLabel = document.querySelector('#stat-log-completion-card .stat-label');
        if (completionVal) {
            completionVal.textContent = `${completionPercent}%`;
        }
        if (completionLabel) {
            completionLabel.textContent = `${selectedDate} 完成率`;
        }

        // 2. 進行中事項 (全系統歷史 todo)
        let activeTodoCount = 0;
        // 3. 已完成事項 (全系統歷史 success)
        let activeSuccessCount = 0;

        logsList.forEach(log => {
            if (log.items) {
                activeTodoCount += log.items.filter(item => item.status === 'todo').length;
                activeSuccessCount += log.items.filter(item => item.status === 'success').length;
            }
        });

        const activeTodoVal = document.getElementById('stat-active-todo');
        if (activeTodoVal) activeTodoVal.textContent = activeTodoCount;

        const activeSuccessVal = document.getElementById('stat-active-success');
        if (activeSuccessVal) activeSuccessVal.textContent = activeSuccessCount;
    };

    /**
     * 動態渲染搜尋欄下方的標籤過濾按鈕
     */
    const renderTagsFilter = () => {
        const filterContainer = document.getElementById('notes-tags-filter');
        if (!filterContainer) return;

        const allTags = new Set();
        logsList.forEach(l => {
            if (l.tags && l.tags.length > 0) {
                l.tags.forEach(t => allTags.add(t));
            }
        });

        if (allTags.size === 0) {
            filterContainer.innerHTML = '';
            return;
        }

        let html = `<span class="tag-badge ${!selectedTagFilter ? 'active' : ''}" onclick="notes.setTagFilter('')">全部</span>`;
        allTags.forEach(tag => {
            html += `<span class="tag-badge ${selectedTagFilter === tag ? 'active' : ''}" onclick="notes.setTagFilter('${tag}')">#${tag}</span>`;
        });

        filterContainer.innerHTML = html;
    };

    const setTagFilter = (tag) => {
        selectedTagFilter = tag;
        renderTagsFilter();
        renderList();
    };

    /**
     * 設定看板狀態過濾器 (進行中 / 已完成)
     */
    const setFilterStatus = (status) => {
        if (currentStatusFilter === status) {
            resetFilter();
            return;
        }

        currentStatusFilter = status;
        
        document.getElementById('stat-log-todo-card').classList.remove('active-filter');
        document.getElementById('stat-log-success-card').classList.remove('active-filter');

        if (status === 'todo') {
            document.getElementById('stat-log-todo-card').classList.add('active-filter');
        } else if (status === 'success') {
            document.getElementById('stat-log-success-card').classList.add('active-filter');
        }

        const resetBtn = document.getElementById('btn-reset-log-filter');
        if (resetBtn) {
            resetBtn.style.display = status ? 'inline-block' : 'none';
        }

        renderList();
    };

    /**
     * 重置所有篩選器
     */
    const resetFilter = () => {
        currentStatusFilter = '';
        selectedTagFilter = '';
        searchQuery = '';
        
        const searchInput = document.getElementById('search-notes-input');
        if (searchInput) searchInput.value = '';

        document.getElementById('stat-log-todo-card').classList.remove('active-filter');
        document.getElementById('stat-log-success-card').classList.remove('active-filter');

        const resetBtn = document.getElementById('btn-reset-log-filter');
        if (resetBtn) resetBtn.style.display = 'none';

        renderTagsFilter();
        renderList();
    };

    /**
     * 取得目前篩選狀態下的日誌清單
     */
    const getFilteredLogs = () => {
        return logsList.filter(log => {
            if (selectedTagFilter && (!log.tags || !log.tags.includes(selectedTagFilter))) {
                return false;
            }
            if (currentStatusFilter) {
                const hasMatchingStatus = log.items && log.items.some(item => item.status === currentStatusFilter);
                if (!hasMatchingStatus) return false;
            }
            if (searchQuery) {
                const dateMatch = log.date.includes(searchQuery);
                const notesMatch = log.notes && log.notes.toLowerCase().includes(searchQuery);
                const tagMatch = log.tags && log.tags.some(t => t.toLowerCase().includes(searchQuery));
                const itemMatch = log.items && log.items.some(item => 
                    item.text.toLowerCase().includes(searchQuery) || 
                    (item.failReason && item.failReason.toLowerCase().includes(searchQuery))
                );
                return dateMatch || notesMatch || tagMatch || itemMatch;
            }
            return true;
        });
    };

    /**
     * 開啟匯出日期篩選對話框
     */
    const openExportModal = () => {
        const modal = document.getElementById('export-logs-modal');
        const startDateInput = document.getElementById('export-start-date');
        const endDateInput = document.getElementById('export-end-date');

        if (!modal) return;

        // 預設日期區間：結束日期為今天，開始日期為當月 1 號
        const today = getTodayDateKey();
        const firstDayOfMonth = today.substring(0, 8) + '01';

        if (startDateInput) startDateInput.value = firstDayOfMonth;
        if (endDateInput) endDateInput.value = today;

        modal.classList.add('active');
        setTimeout(() => {
            modal.querySelector('.modal').style.transform = 'scale(1)';
        }, 10);
    };

    /**
     * 關閉匯出日期篩選對話框
     */
    const closeExportModal = () => {
        const modal = document.getElementById('export-logs-modal');
        if (!modal) return;
        modal.querySelector('.modal').style.transform = 'scale(0.95)';
        modal.classList.remove('active');
    };

    /**
     * 確認起訖日期並執行匯出
     */
    const confirmExport = () => {
        const startDateInput = document.getElementById('export-start-date');
        const endDateInput = document.getElementById('export-end-date');

        const startDate = startDateInput ? startDateInput.value : '';
        const endDate = endDateInput ? endDateInput.value : '';

        if (!startDate || !endDate) {
            app.showToast('請選擇開始與結束日期', 'warning');
            return;
        }

        if (startDate > endDate) {
            app.showToast('開始日期不能大於結束日期', 'warning');
            return;
        }

        closeExportModal();
        exportLogsToExcel(startDate, endDate);
    };

    /**
     * 使用 ExcelJS 將篩選後且在指定日期區間內的工作日誌匯出為 Excel 報表
     */
    const exportLogsToExcel = async (startDate, endDate) => {
        try {
            let filtered = getFilteredLogs();
            
            // 進行日期區間過濾
            if (startDate && endDate) {
                filtered = filtered.filter(log => log.date >= startDate && log.date <= endDate);
            }

            if (filtered.length === 0) {
                app.showToast('此日期區間內無篩選的日誌資料可供匯出', 'warning');
                return;
            }

            if (typeof ExcelJS === 'undefined') {
                app.showToast('ExcelJS 載入失敗，請重新整理網頁', 'error');
                return;
            }

            app.showToast('正在產生工作日誌報表...', 'info');

            const wb = new ExcelJS.Workbook();
            wb.creator = 'My Notebook System';
            wb.created = new Date();
            const ws = wb.addWorksheet('工作日誌彙整表', {
                views: [{ state: 'frozen', ySplit: 2 }] // 凍結前兩列
            });

            // 定義 Excel 欄位
            const COLS = [
                { key: 'index',       header: '序號',       width: 8 },
                { key: 'date',        header: '日誌日期',     width: 14 },
                { key: 'itemText',    header: '工作事項內容',   width: 45 },
                { key: 'status',      header: '執行狀態',     width: 12 },
                { key: 'failReason',  header: '卡關/遇阻原因',  width: 30 },
                { key: 'notes',       header: '當日心得/備註',  width: 35 },
                { key: 'tags',        header: '標籤',       width: 20 }
            ];
            ws.columns = COLS;
            const totalCols = COLS.length;
            const lastColLetter = String.fromCharCode(64 + totalCols);

            // 樣式填充定義
            const titleFill    = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }; // 石板灰
            const headerFill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }; // 靛藍主色
            const oddRowFill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }; // 白
            const evenRowFill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }; // 淺藍灰
            const todoFill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }; // 進行中：淺藍
            const failedFill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }; // 遇阻：淺紅
            
            const thinBorder   = { style: 'thin', color: { argb: 'FFE2E8F0' } };
            const dataBorder   = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
            const headerBorder = {
                top:    { style: 'medium', color: { argb: 'FF312E81' } },
                left:   { style: 'medium', color: { argb: 'FF312E81' } },
                bottom: { style: 'medium', color: { argb: 'FF312E81' } },
                right:  { style: 'medium', color: { argb: 'FF312E81' } }
            };

            // 1. 第一列：主標題
            ws.mergeCells(`A1:${lastColLetter}1`);
            const titleCell = ws.getCell('A1');
            titleCell.value = `工作日誌彙整與進度報告 (${startDate} ~ ${endDate}，共 ${filtered.length} 天)`;
            titleCell.font = { name: 'Microsoft JhengHei', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
            titleCell.fill = titleFill;
            titleCell.alignment = { horizontal: 'center', vertical: 'middle' }; // 主標題置中對齊
            titleCell.border = dataBorder;
            ws.getRow(1).height = 32;

            // 2. 第二列：表頭列
            const headerRow = ws.getRow(2);
            COLS.forEach((col, i) => {
                const cell = headerRow.getCell(i + 1);
                cell.value = col.header;
                cell.font = { name: 'Microsoft JhengHei', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = headerFill;
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = headerBorder;
            });
            headerRow.height = 26;

            // 3. 第三列起：寫入攤平的數據
            let globalRowIndex = 3;
            let itemIndex = 1;

            filtered.forEach((log) => {
                const totalItems = log.items ? log.items.length : 0;
                
                // 如果這天沒有任何工作事項 (理論上少見，但防呆)
                if (totalItems === 0) {
                    const rowData = [
                        itemIndex++,
                        log.date,
                        '(無事項紀錄)',
                        '-',
                        '-',
                        log.notes || '-',
                        log.tags ? log.tags.map(t => `#${t}`).join(', ') : '-'
                    ];
                    
                    const dataRow = ws.getRow(globalRowIndex);
                    rowData.forEach((val, colIdx) => {
                        const cell = dataRow.getCell(colIdx + 1);
                        cell.value = val;
                        cell.fill = oddRowFill;
                        cell.border = dataBorder;
                        cell.font = { name: 'Microsoft JhengHei', size: 10, color: { argb: 'FF64748B' } };
                        cell.alignment = { vertical: 'middle', wrapText: true };
                    });
                    dataRow.height = 24;
                    globalRowIndex++;
                    return;
                }

                // 攤平該天的所有事項
                log.items.forEach((item, itemIdx) => {
                    const isEvenLog = (itemIndex - 1) % 2 === 1;
                    let baseFill = isEvenLog ? evenRowFill : oddRowFill;

                    let statusLabel = '⏳ 進行中';
                    let statusFontColor = 'FF1E3A8A'; // 深藍
                    let statusCellFill = todoFill;
                    let textFont = { name: 'Microsoft JhengHei', size: 10, color: { argb: 'FF334155' } };

                    if (item.status === 'success') {
                        statusLabel = '✅ 已完成';
                        statusFontColor = 'FF15803D'; // 深綠
                        statusCellFill = baseFill;
                        // 已完成事項文字給予灰色 + 刪除線
                        textFont = { name: 'Microsoft JhengHei', size: 10, color: { argb: 'FF94A3B8' }, strike: true };
                    } else if (item.status === 'failed') {
                        statusLabel = '❌ 遇阻/卡關';
                        statusFontColor = 'FFB91C1C'; // 深紅
                        statusCellFill = failedFill;
                        textFont = { name: 'Microsoft JhengHei', size: 10, bold: true, color: { argb: 'FFEF4444' } }; // 遇阻事項字體變紅加粗
                    }

                    // 只有當天第一個事項顯示日期與心得 (其餘同日事項此欄位留空或合併，為求美觀我們使用日期與心得合併儲存格)
                    // ExcelJS 中可以使用合併儲存格，但攤平展示更加便於複製篩選。
                    // 這裡我們採用精美展示：同一天的每一行都寫出日期與心得，以便使用者在 Excel 中做單行篩選，但背景使用相同的斑馬紋色彩做視覺歸類。
                    const rowData = [
                        itemIndex++,
                        log.date,
                        item.text,
                        statusLabel,
                        item.status === 'failed' ? item.failReason : '-',
                        log.notes || '-',
                        log.tags ? log.tags.map(t => `#${t}`).join(', ') : '-'
                    ];

                    const dataRow = ws.getRow(globalRowIndex);
                    rowData.forEach((val, colIdx) => {
                        const cell = dataRow.getCell(colIdx + 1);
                        cell.value = val;
                        cell.fill = baseFill; // 預設背景色
                        cell.border = dataBorder;
                        cell.alignment = { vertical: 'middle', wrapText: true };

                        // 依據不同欄位微調樣式
                        if (colIdx === 0) {
                            // 序號
                            cell.font = { name: 'Consolas', size: 9, color: { argb: 'FF64748B' } };
                            cell.alignment = { horizontal: 'center', vertical: 'middle' };
                        } else if (colIdx === 1) {
                            // 日期
                            cell.font = { name: 'Consolas', size: 10, bold: true, color: { argb: 'FF334155' } };
                            cell.alignment = { horizontal: 'center', vertical: 'middle' };
                        } else if (colIdx === 2) {
                            // 工作事項內容
                            cell.font = textFont;
                        } else if (colIdx === 3) {
                            // 執行狀態
                            cell.value = statusLabel;
                            cell.font = { name: 'Microsoft JhengHei', size: 9.5, bold: true, color: { argb: statusFontColor } };
                            cell.fill = statusCellFill; // 特殊背景色
                            cell.alignment = { horizontal: 'center', vertical: 'middle' };
                        } else if (colIdx === 4) {
                            // 卡關原因
                            cell.font = item.status === 'failed' 
                                ? { name: 'Microsoft JhengHei', size: 9.5, bold: true, color: { argb: 'FFDC2626' } } 
                                : { name: 'Microsoft JhengHei', size: 10, color: { argb: 'FF94A3B8' } };
                            if (item.status === 'failed') cell.fill = failedFill;
                        } else {
                            // 心得與標籤
                            cell.font = { name: 'Microsoft JhengHei', size: 9.5, color: { argb: 'FF475569' } };
                        }
                    });

                    dataRow.height = 26; // 提供較寬的列高容納多行文字
                    globalRowIndex++;
                });
            });

            // 4. 欄寬自適應 (中文長度補償)
            ws.columns.forEach(col => {
                let maxLen = 0;
                col.eachCell({ includeEmpty: true }, (cell, rowNum) => {
                    if (rowNum === 1) return; // 略過主標題
                    const val = cell.value ? cell.value.toString() : '';
                    let len = 0;
                    for (let i = 0; i < val.length; i++) {
                        len += val.charCodeAt(i) > 128 ? 2 : 1;
                    }
                    if (len > maxLen) maxLen = len;
                });
                col.width = Math.min(60, Math.max(col.width || 10, maxLen + 4));
            });

            // 5. 檔案下載
            const buffer = await wb.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `工作日誌彙整報告_${new Date().toISOString().split('T')[0]}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            app.showToast('工作日誌報告 Excel 匯出成功！', 'success');
        } catch (err) {
            console.error('Export logs to Excel failed:', err);
            app.showToast('匯出工作日誌失敗', 'error');
        }
    };

    /**
     * 渲染日誌卡片清單 (帶過濾與進度計算)
     */
    const renderList = () => {
        const container = document.getElementById('notes-container');
        if (!container) return;

        const filtered = getFilteredLogs();

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="kb-empty-state" style="padding: 60px 0;">
                    <i class="fa-solid fa-calendar-xmark" style="font-size: 2.5rem;"></i>
                    <p>沒有找到符合篩選條件的工作日誌。</p>
                </div>
            `;
            return;
        }

        let html = '';
        filtered.forEach((log, index) => {
            const totalItems = log.items ? log.items.length : 0;
            const successItems = log.items ? log.items.filter(item => item.status === 'success').length : 0;
            const percent = totalItems > 0 ? Math.round((successItems / totalItems) * 100) : 0;

            // 智慧折疊判斷：若有進行狀態過濾（進行中或卡關），預設全部展開；無過濾時第一張展開，其餘收合
            const isFirstCard = index === 0;
            let isCollapsed = currentStatusFilter ? false : !isFirstCard;
            
            // 僅在無狀態過濾時，才套用手動記錄的展開/收合狀態
            if (!currentStatusFilter) {
                if (expandedLogDates.has(log.date)) {
                    isCollapsed = false;
                }
                if (collapsedLogDates.has(log.date)) {
                    isCollapsed = true;
                }
            }

            let statusTagHtml = '';
            const hasFailed = log.items && log.items.some(item => item.status === 'failed');
            if (hasFailed) {
                statusTagHtml = '<span class="vendor-tag" style="background:rgba(248,113,113,0.15); color:#f87171; border:1px solid rgba(248,113,113,0.3); font-size:0.72rem; padding: 2px 6px; border-radius:4px; width:auto; height:auto; margin:0;">⚠️ 有遇阻事項</span>';
            } else if (percent === 100 && totalItems > 0) {
                statusTagHtml = '<span class="vendor-tag" style="background:rgba(34,197,94,0.15); color:#4ade80; border:1px solid rgba(34,197,94,0.3); font-size:0.72rem; padding: 2px 6px; border-radius:4px; width:auto; height:auto; margin:0;">✅ 已全數完工</span>';
            } else if (totalItems > 0) {
                statusTagHtml = '<span class="vendor-tag" style="background:rgba(56,189,248,0.15); color:#38bdf8; border:1px solid rgba(56,189,248,0.3); font-size:0.72rem; padding: 2px 6px; border-radius:4px; width:auto; height:auto; margin:0;">⏳ 事項進行中</span>';
            }

            html += `
                <div class="log-card ${isCollapsed ? 'collapsed' : ''}" id="log-card-${log.date}">
                    <div class="log-card-header" onclick="notes.toggleCardCollapse(event, '${log.date}')" title="點擊標頭展開/折疊此日誌事項">
                        <div class="log-card-date">
                            <i class="fa-regular fa-calendar" style="color:var(--color-primary); font-size: 0.95rem;"></i>
                            <span style="cursor:pointer;" onclick="document.getElementById('log-date-picker').value='${log.date}'; notes.handleDateChange('${log.date}'); window.scrollTo({top: 0, behavior: 'smooth'});" title="點擊載入此日誌進行編輯與補登">${log.date}</span>
                            <div class="log-card-toggle-icon" style="color: var(--text-secondary); margin-left: 4px; display: inline-flex; font-size: 0.8rem; align-items: center; justify-content: center; width: 18px; height: 18px;">
                                <i class="fa-solid fa-chevron-down"></i>
                            </div>
                            ${statusTagHtml}
                        </div>
                        <div style="display:flex; align-items:center; gap:16px;">
                            <div class="log-progress-container" title="當日完成率: ${percent}% (${successItems}/${totalItems})">
                                <div class="log-progress-bar-bg">
                                    <div class="log-progress-bar-fill" style="width: ${percent}%;"></div>
                                </div>
                                <span class="log-progress-text">${successItems}/${totalItems}</span>
                            </div>
                            <div class="log-card-actions">
                                <button class="btn-delete" onclick="notes.deleteNote('${log.id}')" title="刪除整天日誌" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; width:auto; height:auto; padding:2px;">
                                    <i class="fa-solid fa-trash-can"></i>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="log-items-list">
                        ${log.items && log.items.length > 0 ? 
                            log.items.filter(item => {
                                if (currentStatusFilter) {
                                    return item.status === currentStatusFilter;
                                }
                                return true;
                            }).map(item => {
                                let itemIcon = '<i class="fa-regular fa-circle-question"></i>';
                                let itemClass = 'status-todo';
                                if (item.status === 'success') {
                                    itemIcon = '<i class="fa-solid fa-circle-check"></i>';
                                    itemClass = 'status-success';
                                } else if (item.status === 'todo') {
                                    itemIcon = '<i class="fa-regular fa-circle-play"></i>';
                                    itemClass = 'status-todo';
                                } else if (item.status === 'failed') {
                                    itemIcon = '<i class="fa-solid fa-circle-exclamation"></i>';
                                    itemClass = 'status-failed';
                                }

                                let textHtml = escapeHtml(item.text);
                                if (log.tags && log.tags.length > 0) {
                                    log.tags.forEach(tag => {
                                        const r = new RegExp(`#${tag}`, 'g');
                                        textHtml = textHtml.replace(r, `<span style="color: var(--color-secondary); font-weight: 500;">#${tag}</span>`);
                                    });
                                }

                                return `
                                    <div class="log-item ${itemClass}" style="display: flex; flex-direction: column; gap: 4px; padding: 6px 10px; border-radius: var(--border-radius-sm); transition: background 0.15s ease;">
                                        <div class="log-item-main" style="display: flex; align-items: center; gap: 8px; width: 100%;">
                                            <input type="checkbox" ${item.status === 'success' ? 'checked' : ''} 
                                                   style="width: 16px; height: 16px; cursor: pointer;"
                                                   onchange="notes.toggleLogItemStatus('${log.id}', '${item.id}', this.checked)">
                                            <span class="log-item-icon">${itemIcon}</span>
                                            <span class="log-item-text" style="flex: 1; font-size: 0.85rem; color: var(--text-primary); cursor: pointer;" 
                                                  onclick="notes.editLogItemText('${log.id}', '${item.id}', \`${escapeHtml(item.text).replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)"
                                                  title="點擊修改文字內容">${textHtml}</span>
                                            <div class="log-item-actions" style="display: flex; gap: 6px; align-items: center;">
                                                <button type="button" onclick="notes.promptLogItemFailed('${log.id}', '${item.id}')" title="標記遇阻/編輯原因" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 2px; font-size: 0.78rem;">
                                                    <i class="fa-solid fa-circle-exclamation"></i>
                                                </button>
                                                <button type="button" onclick="notes.deleteLogItem('${log.id}', '${item.id}')" title="刪除此事項" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 2px; font-size: 0.78rem;">
                                                    <i class="fa-solid fa-xmark"></i>
                                                </button>
                                            </div>
                                        </div>
                                        ${item.status === 'failed' ? `
                                            <div class="fail-reason-box" style="margin-left: 24px; padding: 4px 8px; font-size: 0.78rem; background: rgba(239, 68, 68, 0.05); border: 1px dashed rgba(239, 68, 68, 0.2); border-radius: 4px; color: var(--text-primary);">
                                                <i class="fa-solid fa-triangle-exclamation" style="margin-right: 4px; color: #ef4444;"></i>
                                                <strong>卡關原因：</strong>${escapeHtml(item.failReason)}
                                            </div>
                                        ` : ''}
                                    </div>
                                `;
                            }).join('')
                            : '<div style="font-size:0.8rem; color:var(--text-muted); padding: 4px 0;">無事項紀錄</div>'
                        }
                    </div>

                    <div class="log-card-notes-box" style="margin-top: 10px; border-top: 1px dashed var(--panel-border); padding-top: 10px; display: flex; align-items: flex-start; gap: 8px;">
                        <i class="fa-solid fa-pen-to-square" style="color: var(--color-primary); font-size: 0.8rem; margin-top: 4px;"></i>
                        <input type="text" placeholder="點選此處可新增/修改本日工作心得或備註..." value="${escapeHtml(log.notes || '')}" 
                               style="background: transparent; border: none; outline: none; color: var(--text-secondary); font-size: 0.8rem; width: 100%; font-style: italic; padding: 2px 4px; transition: color 0.15s ease;"
                               onchange="notes.updateNotesDirect('${log.id}', this.value)"
                               onfocus="this.style.fontStyle='normal'; this.style.color='var(--text-primary)'"
                               onblur="this.style.fontStyle='italic'; this.style.color='var(--text-secondary)'">
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    };

    /**
     * 開啟週報生成對話框
     */
    const openWeeklyReportModal = () => {
        const modal = document.getElementById('weekly-report-modal');
        const startDateInput = document.getElementById('report-start-date');
        const endDateInput = document.getElementById('report-end-date');
        const aiBtn = document.getElementById('btn-weekly-api-summary');
        const output = document.getElementById('weekly-report-output');

        if (!modal) return;

        // 預設日期區間：結束日期為今天，開始日期為 7 天前
        const today = getTodayDateKey();
        const start = new Date();
        start.setDate(start.getDate() - 6); // 包含今天共 7 天
        const startDateKey = start.toISOString().split('T')[0];

        if (startDateInput) startDateInput.value = startDateKey;
        if (endDateInput) endDateInput.value = today;
        if (output) output.value = '';

        // 檢查是否有儲存 Gemini API Key 以決定是否顯示 AI 按鈕
        const apiKey = localStorage.getItem('gemini_api_key');
        if (aiBtn) {
            aiBtn.style.display = apiKey ? 'inline-flex' : 'none';
        }

        modal.classList.add('active');
        setTimeout(() => {
            modal.querySelector('.modal').style.transform = 'scale(1)';
        }, 10);
    };

    /**
     * 關閉週報生成對話框
     */
    const closeWeeklyReportModal = () => {
        const modal = document.getElementById('weekly-report-modal');
        if (!modal) return;
        modal.querySelector('.modal').style.transform = 'scale(0.95)';
        modal.classList.remove('active');
    };

    /**
     * 產生原始 Markdown 工作週報
     */
    const generateWeeklyReportRaw = async () => {
        const startDateInput = document.getElementById('report-start-date');
        const endDateInput = document.getElementById('report-end-date');
        const output = document.getElementById('weekly-report-output');

        if (!startDateInput || !endDateInput || !output) return;

        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        if (!startDate || !endDate) {
            app.showToast('請選擇開始與結束日期', 'warning');
            return;
        }

        if (startDate > endDate) {
            app.showToast('開始日期不能大於結束日期', 'warning');
            return;
        }

        try {
            // 從 IndexedDB 查詢所有日誌
            const allNotes = await db.getAll('notes');
            
            // 篩選出日期區間內的日誌
            const filteredNotes = allNotes.filter(note => {
                let dateKey = note.date;
                if (!dateKey && note.createdAt) {
                    dateKey = new Date(note.createdAt).toISOString().split('T')[0];
                }
                return dateKey && dateKey >= startDate && dateKey <= endDate;
            });

            // 排序 (按日期遞增)
            filteredNotes.sort((a, b) => {
                const dateA = a.date || new Date(a.createdAt).toISOString().split('T')[0];
                const dateB = b.date || new Date(b.createdAt).toISOString().split('T')[0];
                return dateA.localeCompare(dateB);
            });

            if (filteredNotes.length === 0) {
                output.value = `### 📅 日期區間: ${startDate.replace(/-/g, '/')} ~ ${endDate.replace(/-/g, '/')}\n\n⚠️ 此日期區間內尚無任何工作日誌資料。`;
                return;
            }

            let successItems = [];
            let todoItems = [];
            let failedItems = [];
            let diarySummary = '';

            filteredNotes.forEach(note => {
                const displayDate = (note.date || new Date(note.createdAt).toISOString().split('T')[0]).replace(/-/g, '/');
                
                if (note.items && note.items.length > 0) {
                    note.items.forEach(item => {
                        const itemText = `[${displayDate}] ${item.text}`;
                        if (item.status === 'success') {
                            successItems.push(`- ${itemText}`);
                        } else if (item.status === 'todo') {
                            todoItems.push(`- ${itemText}`);
                        } else if (item.status === 'failed') {
                            failedItems.push(`- ${itemText} *(遇阻原因: ${item.failReason})*`);
                        }
                    });
                } else if (note.content) {
                    // 向下相容
                    const itemText = `[${displayDate}] ${note.content.replace(/^\/todo\s+\[[x\s]\]\s+/i, '')}`;
                    if (note.content.includes('[x]')) {
                        successItems.push(`- ${itemText}`);
                    } else {
                        todoItems.push(`- ${itemText}`);
                    }
                }

                if (note.notes && note.notes.trim()) {
                    diarySummary += `### 📅 ${displayDate} 心得備註\n${note.notes.trim()}\n\n`;
                }
            });

            // 組合 Markdown 格式
            let md = `# 工作週報報告 (${startDate.replace(/-/g, '/')} ~ ${endDate.replace(/-/g, '/')})\n\n`;
            md += `## 📊 事項統計總覽\n`;
            md += `- 🟢 已完成任務：${successItems.length} 項\n`;
            md += `- 🔵 進行中事項：${todoItems.length} 項\n`;
            md += `- 🔴 遇阻卡關事項：${failedItems.length} 項\n\n`;

            md += `## 🟢 已完成事項 (Success)\n`;
            md += successItems.length > 0 ? successItems.join('\n') + '\n\n' : '*無已完成事項*\n\n';

            md += `## 🔵 進行中事項 (Todo)\n`;
            md += todoItems.length > 0 ? todoItems.join('\n') + '\n\n' : '*無進行中事項*\n\n';

            md += `## 🔴 遇阻/卡關事項 (Failed)\n`;
            md += failedItems.length > 0 ? failedItems.join('\n') + '\n\n' : '*無卡關事項*\n\n';

            if (diarySummary) {
                md += `## 📝 每日心得與日誌備註\n`;
                md += diarySummary;
            }

            output.value = md;

            // 再次檢查 API key 以動態更新 AI 按鈕
            const apiKey = localStorage.getItem('gemini_api_key');
            const aiBtn = document.getElementById('btn-weekly-api-summary');
            if (aiBtn) {
                aiBtn.style.display = apiKey ? 'inline-flex' : 'none';
            }

            app.showToast('週報日誌載入完成', 'success');
        } catch (err) {
            console.error('Generate weekly report error:', err);
            app.showToast('產生週報失敗', 'error');
        }
    };

    /**
     * 呼叫 Google Gemini API 進行智能週報提煉與整理
     */
    const generateWeeklyReportAI = async () => {
        const apiKey = localStorage.getItem('gemini_api_key');
        if (!apiKey) {
            app.showToast('請先至「設定與同步」配置您的 Gemini API Key', 'warning');
            return;
        }

        const output = document.getElementById('weekly-report-output');
        if (!output) return;

        // 如果目前文字框為空，先自動載入一次區間日誌
        if (!output.value || output.value.includes('請選擇日期區間')) {
            await generateWeeklyReportRaw();
        }

        const rawMarkdown = output.value;
        if (rawMarkdown.includes('尚無任何工作日誌資料')) {
            app.showToast('此區間無資料，AI 無法整理', 'warning');
            return;
        }

        const loadingIndicator = document.getElementById('ai-loading-indicator');
        const aiBtn = document.getElementById('btn-weekly-api-summary');

        if (loadingIndicator) loadingIndicator.style.display = 'inline';
        if (aiBtn) aiBtn.disabled = true;

        try {
            const prompt = `你是一位專業的工作週報整理秘書。請將以下這份由系統自動聚合出之日期區間內的工作日誌與事項，重新精練、分類、潤飾成一份排版美觀、格式專業的工作週報。
您的輸出格式必須符合以下結構：

# 📝 工作週報報告 (請填入正確日期區間)

## 📊 本週工作概覽
(請以精煉的主管口吻，總結本週的核心進展與事項進度比例)

## 🎯 核心完成任務 (Success)
(請整理出本週最重要的完成項目，並用列點說明。可以將相似的項目合併為一小組以提高可讀性)

## ⚙️ 進行中與後續事項 (Todo)
(整理出下週需持續追蹤的工作項目)

## ⚠️ 本週遇阻卡關與解決方案 (Failed)
(本週遭遇的卡關事項及應對或建議解決方式，如果本週沒有卡關，此處請寫「本週進展順利，無顯著遇阻事項」)

--
以下是原始的工作日誌數據：
${rawMarkdown}`;

            const model = localStorage.getItem('gemini_model') || 'gemini-2.5-flash';
            const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }]
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
                output.value = data.candidates[0].content.parts[0].text;
                app.showToast('AI 智能週報提煉完成！', 'success');
            } else {
                throw new Error('Gemini API 未回傳有效的文本內容');
            }
        } catch (err) {
            console.error('Gemini API call failed:', err);
            app.showToast(`AI 整理失敗：${err.message}`, 'error');
        } finally {
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            if (aiBtn) aiBtn.disabled = false;
        }
    };

    /**
     * 複製週報 Markdown 內容至剪貼簿
     */
    const copyWeeklyReportText = () => {
        const output = document.getElementById('weekly-report-output');
        if (!output || !output.value || output.value.includes('請選擇日期區間')) {
            app.showToast('無週報內容可供複製', 'warning');
            return;
        }

        output.select();
        output.setSelectionRange(0, 99999); // 適用於行動裝置

        try {
            navigator.clipboard.writeText(output.value);
            app.showToast('週報內容已成功複製至剪貼簿！', 'success');
        } catch (err) {
            // 備用方案
            document.execCommand('copy');
            app.showToast('週報內容已複製', 'success');
        }
    };

    /**
     * 列印工作週報（渲染為 HTML 並調用瀏覽器列印為 PDF）
     */
    const printWeeklyReport = () => {
        const output = document.getElementById('weekly-report-output');
        const printArea = document.getElementById('weekly-report-print-area');

        if (!output || !output.value || output.value.includes('請選擇日期區間')) {
            app.showToast('無週報內容可供列印', 'warning');
            return;
        }

        try {
            const rawText = output.value;

            // 1. 嘗試利用正則表達式擷取日期區間 (支援 YYYY/MM/DD ~ YYYY/MM/DD)
            const dateRegex = /(?:工作週報報告|工作週報)\s*\(([^)]+)\)/i;
            let match = rawText.match(dateRegex);
            let dateStr = '';
            if (match) {
                dateStr = match[1];
            } else {
                const directDateRegex = /(\d{4}[\/\-]\d{2}[\/\-]\d{2}\s*~\s*\d{4}[\/\-]\d{2}[\/\-]\d{2})/;
                const directMatch = rawText.match(directDateRegex);
                if (directMatch) {
                    dateStr = directMatch[1];
                }
            }

            // 2. 使用 marked 將 Markdown 轉換為 HTML
            let contentHtml = '';
            if (typeof marked !== 'undefined') {
                contentHtml = marked.parse(rawText);
            } else {
                contentHtml = `<pre style="white-space: pre-wrap; font-family: monospace;">${escapeHtml(rawText)}</pre>`;
            }

            // 3. 重構表頭：移除轉換出來的第一個 h1 標籤，改用 Flex 雙欄高質感表頭
            let finalHtml = contentHtml;
            let headerHtml = '';

            if (dateStr) {
                // 移出原有的 h1 標題
                finalHtml = finalHtml.replace(/<h1>[\s\S]*?<\/h1>/i, '');
                headerHtml = `
                    <div class="print-header-layout" style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #222; padding-bottom: 10px; margin-bottom: 24px;">
                        <h1 style="margin: 0; font-size: 26px; font-weight: bold; color: #000; display: flex; align-items: center; gap: 8px;">📝 工作週報報告</h1>
                        <span style="font-size: 13px; color: #555; font-weight: 600; font-family: monospace; white-space: nowrap; margin-bottom: 2px;">📅 區間：${dateStr.replace(/-/g, '/')}</span>
                    </div>
                `;
            } else {
                // 若無日期，只重置為標準 h1 加底線
                finalHtml = finalHtml.replace(/<h1>[\s\S]*?<\/h1>/i, '');
                headerHtml = `
                    <div class="print-header-layout" style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #222; padding-bottom: 10px; margin-bottom: 24px;">
                        <h1 style="margin: 0; font-size: 26px; font-weight: bold; color: #000;">📝 工作週報報告</h1>
                    </div>
                `;
            }

            // 4. 寫入列印專用隱藏區域
            printArea.innerHTML = `
                <div class="weekly-report-print-content" style="font-family: 'Segoe UI', system-ui, sans-serif; line-height: 1.6; color: #000; padding: 20px;">
                    ${headerHtml}
                    ${finalHtml}
                </div>
            `;

            // 為 body 加上列印標記，啟動 @media print 樣式規則
            document.body.classList.add('printing-weekly-report');

            // 呼叫系統列印
            window.print();

            // 列印完成或取消後，清除 body 的列印標記
            const cleanup = () => {
                document.body.classList.remove('printing-weekly-report');
                printArea.innerHTML = '';
            };

            if ('onafterprint' in window) {
                window.onafterprint = cleanup;
            } else {
                setTimeout(cleanup, 1000);
            }

        } catch (err) {
            console.error('Print weekly report error:', err);
            app.showToast('無法調用列印功能', 'error');
            document.body.classList.remove('printing-weekly-report');
        }
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
        deleteNote,
        setTagFilter,
        toggleLogItemStatus,
        handleStatusChange,
        addLogItemDirect,
        deleteLogItem,
        editLogItemText,
        promptLogItemFailed,
        updateNotesDirect,
        setFilterStatus,
        resetFilter,
        handleDateChange,
        exportLogsToExcel,
        openExportModal,
        closeExportModal,
        confirmExport,
        toggleCardCollapse,
        expandAllLogs,
        openWeeklyReportModal,
        closeWeeklyReportModal,
        generateWeeklyReportRaw,
        generateWeeklyReportAI,
        copyWeeklyReportText,
        printWeeklyReport
    };
})();

window.notes = notes;
