/**
 * notes.js - 每日工作日誌與進度追蹤邏輯
 */
const notes = (() => {
    let logsList = [];                 // 聚合後的工作日誌清單
    let todayLogDraftItems = [];       // 當前編輯日期的事項草稿
    let selectedTagFilter = '';        // 當前選取的標籤篩選
    let searchQuery = '';              // 當前搜尋字串
    let currentStatusFilter = '';      // 看板狀態過濾 ('todo' 或 'failed')

    let lastLoadedDateKey = '';        // 最後成功載入的日誌日期
    let lastLoadedItemsJson = '[]';    // 最後載入時的事項草稿快照
    let lastLoadedNotes = '';          // 最後載入時的心得快照
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
            const allNotes = await db.getAll('notes');
            // 尋找日期為 dateKey 的日誌
            const targetLog = allNotes.find(n => {
                if (n.date === dateKey) return true;
                // 向下相容判斷：如果是舊格式，比對建立日
                if (!n.date && n.createdAt) {
                    const dKey = new Date(n.createdAt).toISOString().split('T')[0];
                    return dKey === dateKey;
                }
                return false;
            });

            // 載入心得
            const noteInput = document.getElementById('log-day-notes');
            const notesValue = targetLog && targetLog.notes ? targetLog.notes : '';
            if (noteInput) {
                noteInput.value = notesValue;
            }

            if (targetLog) {
                // 如果是舊格式，轉化 items
                if (!targetLog.items && targetLog.content) {
                    todayLogDraftItems = [parseOldNoteToItem(targetLog)];
                } else {
                    todayLogDraftItems = JSON.parse(JSON.stringify(targetLog.items || []));
                }
            } else {
                todayLogDraftItems = [];
            }

            // 儲存當時的資料快照以便偵測是否變更
            lastLoadedDateKey = dateKey;
            lastLoadedItemsJson = JSON.stringify(todayLogDraftItems);
            lastLoadedNotes = notesValue.trim();

            // 更新儲存按鈕上的日期提示
            const btnText = document.getElementById('save-log-btn-text');
            if (btnText) {
                btnText.textContent = `儲存 ${dateKey} 工作日誌`;
            }

            renderDraftItems();
            updateStatsDashboard(); // 即時刷新頂部完成率與日期顯示
        } catch (err) {
            console.error('Load log draft error:', err);
        }
    };

    /**
     * 偵測當前編輯器是否含有「未儲存的變更」
     */
    const hasUnsavedChanges = () => {
        // 1. 比對事項草稿是否有變更
        const currentItemsJson = JSON.stringify(todayLogDraftItems);
        if (currentItemsJson !== lastLoadedItemsJson) return true;

        // 2. 比對心得備註是否有變更
        const noteInput = document.getElementById('log-day-notes');
        const currentNotes = noteInput ? noteInput.value.trim() : '';
        if (currentNotes !== lastLoadedNotes) return true;

        // 3. 比對輸入框中是否有輸入但尚未新增的事項文字
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
                `您在 ${lastLoadedDateKey} 的日誌內容尚未儲存，切換日期會遺失目前的編輯。確定要切換到 ${newDate} 嗎？`,
                '未儲存的變更警告'
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
                    addLogItemDraft();
                }
            });
        }

        // 輸入遇阻原因按 Enter 快捷新增
        if (failReasonInput) {
            failReasonInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addLogItemDraft();
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
     * 新增事項到選定日期的日誌草稿 (暫存)
     */
    const addLogItemDraft = () => {
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

        const status = statusSelect.value;
        let failReason = '';
        if (status === 'failed') {
            failReason = failReasonInput.value.trim() || '未說明具體原因';
        }

        // 推送至草稿
        todayLogDraftItems.push({
            id: Date.now(),
            text,
            status,
            failReason
        });

        // 重置欄位
        textInput.value = '';
        failReasonInput.value = '';
        statusSelect.value = 'todo';
        handleStatusChange('todo');

        renderDraftItems();
        textInput.focus();
        
        const selectedDate = datePicker ? datePicker.value : '選定日期';
        app.showToast(`登錄一筆事項到 ${selectedDate} 草稿`, 'info');
    };

    /**
     * 自草稿中刪除特定事項
     */
    const deleteDraftItem = (itemId) => {
        todayLogDraftItems = todayLogDraftItems.filter(item => item.id !== itemId);
        renderDraftItems();
    };

    /**
     * 渲染今日日誌草稿區預覽
     */
    const renderDraftItems = () => {
        const previewContainer = document.getElementById('log-draft-items-preview');
        if (!previewContainer) return;

        if (todayLogDraftItems.length === 0) {
            previewContainer.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted); padding: 8px 0; text-align:center;">此日期尚無事項登錄，請於上方輸入新增。</div>';
            return;
        }

        let html = '';
        todayLogDraftItems.forEach(item => {
            let statusIcon = '⏳';
            let statusClass = 'status-todo';
            let statusLabel = '進行中';
            if (item.status === 'success') {
                statusIcon = '✅';
                statusClass = 'status-success';
                statusLabel = '已完成';
            } else if (item.status === 'failed') {
                statusIcon = '❌';
                statusClass = 'status-failed';
                statusLabel = '遇阻';
            }

            html += `
                <div class="log-draft-item">
                    <div style="display:flex; flex-direction:column; flex:1;">
                        <div>
                            <span style="margin-right:6px;">${statusIcon}</span>
                            <span class="${statusClass}" style="font-weight:550; margin-right:8px;">[${statusLabel}]</span>
                            <span class="item-text">${escapeHtml(item.text)}</span>
                        </div>
                        ${item.status === 'failed' ? `<div style="font-size:0.75rem; color:#fca5a5; margin-top:2px; margin-left:20px;">⚠️ 原因：${escapeHtml(item.failReason)}</div>` : ''}
                    </div>
                    <button type="button" class="btn-delete" onclick="notes.deleteDraftItem(${item.id})" title="刪除事項" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; width:auto; height:auto; padding:2px;">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            `;
        });

        previewContainer.innerHTML = html;
    };

    /**
     * 清空選定日期日誌草稿
     */
    const clearTodayLogDraft = () => {
        todayLogDraftItems = [];
        const noteInput = document.getElementById('log-day-notes');
        if (noteInput) noteInput.value = '';
        renderDraftItems();
        app.showToast('編輯草稿已清空', 'info');
    };

    /**
     * 儲存今日日誌 (寫入 IndexedDB)
     */
    const saveTodayLog = async () => {
        // 自動防呆：如果輸入框有字但忘記點選「新增事項」，自動代為新增
        const textInput = document.getElementById('log-item-text');
        if (textInput && textInput.value.trim()) {
            addLogItemDraft();
        }

        if (todayLogDraftItems.length === 0) {
            await app.alert('請至少新增一項工作事項，再進行存檔。');
            return;
        }

        const datePicker = document.getElementById('log-date-picker');
        const selectedDate = datePicker ? datePicker.value : getTodayDateKey();

        const noteInput = document.getElementById('log-day-notes');
        const notesValue = noteInput ? noteInput.value.trim() : '';

        // 收集所有事項中的標籤 Hashtags
        let allTags = [];
        todayLogDraftItems.forEach(item => {
            allTags = allTags.concat(parseTags(item.text));
        });
        if (notesValue) {
            allTags = allTags.concat(parseTags(notesValue));
        }
        const uniqueTags = [...new Set(allTags)];

        try {
            // 檢查資料庫該日期是否已有日誌
            const allNotes = await db.getAll('notes');
            const existingLog = allNotes.find(n => {
                if (n.date === selectedDate) return true;
                if (!n.date && n.createdAt) {
                    return new Date(n.createdAt).toISOString().split('T')[0] === selectedDate;
                }
                return false;
            });

            const logData = {
                date: selectedDate,
                items: todayLogDraftItems,
                notes: notesValue,
                tags: uniqueTags,
                updatedAt: Date.now()
            };

            if (existingLog) {
                // 更新
                logData.id = existingLog.id;
                logData.createdAt = existingLog.createdAt;
                await db.put('notes', logData);
                app.showToast(`${selectedDate} 工作日誌已更新成功`, 'success');
            } else {
                // 新建
                logData.createdAt = Date.now();
                await db.add('notes', logData);
                app.showToast(`${selectedDate} 工作日誌已建立成功`, 'success');
            }

            await render();
            // 存檔後保持載入該日期，不予清空，以便使用者連續操作
            await loadLogDraftForDate(selectedDate);
        } catch (error) {
            console.error('Save log error:', error);
            app.showToast('儲存日誌失敗', 'error');
        }
    };

    /**
     * 刪除特定日期的整天日誌
     */
    const deleteNote = async (id) => {
        if (await app.confirm('確定要刪除這整天的工作日誌嗎？刪除後無法還原。')) {
            try {
                // 找到即將被刪除的日誌日期
                const deletedNote = logsList.find(l => l.id === id);
                const deletedDate = deletedNote ? deletedNote.date : '';

                await db.remove('notes', id);
                app.showToast('日誌已成功刪除', 'info');
                
                // 如果刪除的是當前編輯器選定的日期，同步清空編輯器草稿
                const datePicker = document.getElementById('log-date-picker');
                const selectedDate = datePicker ? datePicker.value : getTodayDateKey();
                
                if (deletedDate && deletedDate === selectedDate) {
                    todayLogDraftItems = [];
                    const noteInput = document.getElementById('log-day-notes');
                    if (noteInput) noteInput.value = '';
                    renderDraftItems();
                }

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
            const log = await db.getById('notes', logId);
            if (!log) return;

            let logItems = [];
            if (!log.items && log.content) {
                logItems = [parseOldNoteToItem(log)];
            } else {
                logItems = log.items || [];
            }

            const targetItem = logItems.find(item => item.id === itemId);
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

        // 1. 選定日期的完成率 (採用編輯器當前日期草稿 todayLogDraftItems 作為即時數據來源)
        let completionPercent = 0;
        const totalItems = todayLogDraftItems.length;
        if (totalItems > 0) {
            const successCount = todayLogDraftItems.filter(item => item.status === 'success').length;
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
        // 3. 遇阻/卡關事項 (全系統歷史 failed)
        let activeFailedCount = 0;

        logsList.forEach(log => {
            if (log.items) {
                activeTodoCount += log.items.filter(item => item.status === 'todo').length;
                activeFailedCount += log.items.filter(item => item.status === 'failed').length;
            }
        });

        const activeTodoVal = document.getElementById('stat-active-todo');
        if (activeTodoVal) activeTodoVal.textContent = activeTodoCount;

        const activeFailedVal = document.getElementById('stat-active-failed');
        if (activeFailedVal) activeFailedVal.textContent = activeFailedCount;
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
     * 設定看板狀態過濾器 (進行中 / 卡關)
     */
    const setFilterStatus = (status) => {
        if (currentStatusFilter === status) {
            resetFilter();
            return;
        }

        currentStatusFilter = status;
        
        document.getElementById('stat-log-todo-card').classList.remove('active-filter');
        document.getElementById('stat-log-failed-card').classList.remove('active-filter');

        if (status === 'todo') {
            document.getElementById('stat-log-todo-card').classList.add('active-filter');
        } else if (status === 'failed') {
            document.getElementById('stat-log-failed-card').classList.add('active-filter');
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
        document.getElementById('stat-log-failed-card').classList.remove('active-filter');

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

            const chevronTransform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';

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
                            <div class="log-card-toggle-icon" style="color: var(--text-secondary); transition: transform 0.2s ease; margin-left: 4px; display: inline-flex; transform: ${chevronTransform}; font-size: 0.8rem; align-items: center; justify-content: center; width: 18px; height: 18px;">
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
                                <button class="btn-delete" onclick="notes.deleteNote(${log.id})" title="刪除整天日誌" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; width:auto; height:auto; padding:2px;">
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
                                    <div class="log-item ${itemClass}">
                                        <div class="log-item-main">
                                            <input type="checkbox" ${item.status === 'success' ? 'checked' : ''} 
                                                   style="width: 16px; height: 16px; cursor: pointer; margin-top:2px;"
                                                   onchange="notes.toggleLogItemStatus(${log.id}, ${item.id}, this.checked)">
                                            <span class="log-item-icon">${itemIcon}</span>
                                            <span class="log-item-text" style="flex:1; margin-top:1px;">${textHtml}</span>
                                        </div>
                                        ${item.status === 'failed' ? `
                                            <div class="fail-reason-box">
                                                <i class="fa-solid fa-circle-exclamation" style="margin-right:4px;"></i>
                                                <strong>遇阻原因：</strong>${escapeHtml(item.failReason)}
                                            </div>
                                        ` : ''}
                                    </div>
                                `;
                            }).join('')
                            : '<div style="font-size:0.8rem; color:var(--text-muted); padding: 4px 0;">無事項紀錄</div>'
                        }
                    </div>

                    ${log.notes ? `
                        <div class="log-card-notes-box">
                            <i class="fa-solid fa-quote-left"></i>
                            <span>${escapeHtml(log.notes).replace(/\n/g, '<br>')}</span>
                        </div>
                    ` : ''}
                </div>
            `;
        });

        container.innerHTML = html;
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
        addLogItemDraft,
        deleteDraftItem,
        clearTodayLogDraft,
        saveTodayLog,
        setFilterStatus,
        resetFilter,
        handleDateChange,
        exportLogsToExcel,
        openExportModal,
        closeExportModal,
        confirmExport,
        toggleCardCollapse,
        expandAllLogs
    };
})();

window.notes = notes;
