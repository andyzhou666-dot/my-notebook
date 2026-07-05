/**
 * app.js - 系統主控與 SPA 導引邏輯
 */
const app = (() => {
    let currentTab = 'notes-section';

    /**
     * 初始化與載入主題偏好
     */
    const initTheme = () => {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        setTheme(savedTheme);
    };

    const setTheme = (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);

        const btn = document.getElementById('theme-toggle-btn');
        if (btn) {
            if (theme === 'light') {
                btn.innerHTML = '<i class="fa-solid fa-moon"></i> <span id="theme-toggle-text">深色炫酷模式</span>';
            } else {
                btn.innerHTML = '<i class="fa-solid fa-sun"></i> <span id="theme-toggle-text">柔和淺色模式</span>';
            }
        }

        // 通知儀表板更新圖表主題顏色
        if (window.dashboard && typeof window.dashboard.updateTheme === 'function') {
            setTimeout(() => {
                window.dashboard.updateTheme();
            }, 100);
        }
    };

    const toggleTheme = () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        showToast(`已切換為${newTheme === 'light' ? '柔和淺色' : '深色炫酷'}模式`, 'success');
    };

    /**
     * 初始化系統
     */
    const init = async () => {
        initTheme(); // 載入主題偏好
        setupTabNavigation();
        setupGlobalEvents();
        setupLightboxEvents();
        
        try {
            // 1. 初始化本地資料庫
            await db.init();
            showToast('本地資料庫初始化完成', 'success');

            // 2. 初始化各功能子模組
            if (window.notes && typeof window.notes.init === 'function') {
                await window.notes.init();
            }
            if (window.vendors && typeof window.vendors.init === 'function') {
                await window.vendors.init();
            }
            if (window.kb && typeof window.kb.init === 'function') {
                await window.kb.init();
            }
            if (window.dashboard && typeof window.dashboard.init === 'function') {
                await window.dashboard.init();
            }

            // 3. 初始化 Google 同步服務
            setupSyncUI();
            await sync.init();

        } catch (error) {
            console.error('System initialization failed:', error);
            showToast('系統初始化失敗，請重新整理網頁', 'error');
        }
    };

    /**
     * 處理 SPA Tab 切換
     */
    const setupTabNavigation = () => {
        const navItems = document.querySelectorAll('.nav-item, .mobile-nav-item');

        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const target = item.getAttribute('data-target');
                if (target) {
                    switchTab(target);
                }
            });
        });
    };

    const switchTab = (tabId) => {
        currentTab = tabId;

        // 1. 切換 section 顯示
        const sections = document.querySelectorAll('.tab-content');
        sections.forEach(sec => {
            sec.classList.remove('active');
            if (sec.id === tabId) {
                sec.classList.add('active');
            }
        });

        // 2. 更新 PC 導覽選單樣式
        const pcNavs = document.querySelectorAll('.sidebar .nav-item');
        pcNavs.forEach(nav => {
            nav.classList.remove('active');
            if (nav.getAttribute('data-target') === tabId) {
                nav.classList.add('active');
            }
        });

        // 3. 更新手機底部導覽樣式
        const mobNavs = document.querySelectorAll('.mobile-nav-item');
        mobNavs.forEach(nav => {
            nav.classList.remove('active');
            if (nav.getAttribute('data-target') === tabId) {
                nav.classList.add('active');
            }
        });

        // 切換頁面時重新整理資料，確保即時顯示
        refreshCurrentTab(tabId);
    };

    const refreshCurrentTab = (tabId) => {
        if (tabId === 'notes-section' && window.notes && typeof window.notes.render === 'function') {
            window.notes.render();
        } else if (tabId === 'vendors-section' && window.vendors && typeof window.vendors.render === 'function') {
            window.vendors.render();
        } else if (tabId === 'kb-section' && window.kb && typeof window.kb.render === 'function') {
            window.kb.render();
        } else if (tabId === 'dashboard-section' && window.dashboard && typeof window.dashboard.render === 'function') {
            window.dashboard.render();
        }
    };

    /**
     * 全域 Toast 提示功能
     */
    const showToast = (message, type = 'info') => {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let iconHtml = '<i class="fa-solid fa-circle-info"></i>';
        if (type === 'success') iconHtml = '<i class="fa-solid fa-circle-check"></i>';
        if (type === 'error') iconHtml = '<i class="fa-solid fa-circle-exclamation"></i>';
        if (type === 'warning') iconHtml = '<i class="fa-solid fa-triangle-exclamation"></i>';

        toast.innerHTML = `
            ${iconHtml}
            <div class="toast-message">${message}</div>
        `;

        container.appendChild(toast);

        // 動態滑入
        setTimeout(() => toast.classList.add('show'), 50);

        // 3秒後滑出並移除
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode === container) {
                    container.removeChild(toast);
                }
            }, 300);
        }, 3000);
    };

    /**
     * 客製化確認對話框 (Promise-based Custom Confirm)
     */
    const confirm = (message, title = '系統確認') => {
        return new Promise((resolve) => {
            const modal = document.getElementById('global-dialog-modal');
            const titleEl = document.getElementById('global-dialog-title');
            const msgEl = document.getElementById('global-dialog-message');
            const confirmBtn = document.getElementById('global-dialog-confirm-btn');
            const cancelBtn = document.getElementById('global-dialog-cancel-btn');
            const closeBtn = document.getElementById('global-dialog-close-btn');

            titleEl.textContent = title;
            msgEl.textContent = message;
            cancelBtn.style.display = 'inline-flex'; // 顯示取消按鈕

            modal.classList.add('active');
            setTimeout(() => {
                modal.querySelector('.modal').style.transform = 'scale(1)';
            }, 10);

            const cleanUp = () => {
                confirmBtn.removeEventListener('click', onConfirm);
                cancelBtn.removeEventListener('click', onCancel);
                closeBtn.removeEventListener('click', onCancel);
            };

            const onConfirm = () => {
                closeModal();
                cleanUp();
                resolve(true);
            };

            const onCancel = () => {
                closeModal();
                cleanUp();
                resolve(false);
            };

            const closeModal = () => {
                modal.querySelector('.modal').style.transform = 'scale(0.9)';
                modal.classList.remove('active');
            };

            confirmBtn.addEventListener('click', onConfirm);
            cancelBtn.addEventListener('click', onCancel);
            closeBtn.addEventListener('click', onCancel);
        });
    };

    /**
     * 客製化輸入對話框 (Promise-based Custom Prompt)
     */
    const prompt = (message, defaultValue = '', title = '系統輸入') => {
        return new Promise((resolve) => {
            const modal = document.getElementById('global-dialog-modal');
            const titleEl = document.getElementById('global-dialog-title');
            const msgEl = document.getElementById('global-dialog-message');
            const confirmBtn = document.getElementById('global-dialog-confirm-btn');
            const cancelBtn = document.getElementById('global-dialog-cancel-btn');
            const closeBtn = document.getElementById('global-dialog-close-btn');

            titleEl.textContent = title;
            
            // 建立提示文字與輸入框 HTML
            msgEl.innerHTML = `
                <div style="text-align: left; margin-bottom: 12px; font-weight: 550;">${message}</div>
                <input type="text" id="global-dialog-prompt-input" value="${defaultValue.replace(/"/g, '&quot;')}" 
                       style="width: 100%; padding: 8px 12px; font-size: 0.9rem; background: var(--bg-input); border: 1px solid var(--panel-border); color: var(--text-primary); border-radius: var(--border-radius-sm); outline: none;">
            `;
            
            cancelBtn.style.display = 'inline-flex'; // 顯示取消按鈕

            modal.classList.add('active');
            setTimeout(() => {
                modal.querySelector('.modal').style.transform = 'scale(1)';
                const inputEl = document.getElementById('global-dialog-prompt-input');
                if (inputEl) {
                    inputEl.focus();
                    // 將游標移到最後
                    inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
                }
            }, 10);

            // 支援 Enter 鍵送出
            setTimeout(() => {
                const inputEl = document.getElementById('global-dialog-prompt-input');
                if (inputEl) {
                    inputEl.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            onConfirm();
                        }
                    });
                }
            }, 20);

            const cleanUp = () => {
                confirmBtn.removeEventListener('click', onConfirm);
                cancelBtn.removeEventListener('click', onCancel);
                closeBtn.removeEventListener('click', onCancel);
                // 恢復原狀，防止影響 alert / confirm
                msgEl.innerHTML = '';
            };

            const onConfirm = () => {
                const inputEl = document.getElementById('global-dialog-prompt-input');
                const val = inputEl ? inputEl.value : null;
                closeModal();
                cleanUp();
                resolve(val);
            };

            const onCancel = () => {
                closeModal();
                cleanUp();
                resolve(null);
            };

            const closeModal = () => {
                modal.querySelector('.modal').style.transform = 'scale(0.9)';
                modal.classList.remove('active');
            };

            confirmBtn.addEventListener('click', onConfirm);
            cancelBtn.addEventListener('click', onCancel);
            closeBtn.addEventListener('click', onCancel);
        });
    };

    /**
     * 客製化警告對話框 (Promise-based Custom Alert)
     */
    const alert = (message, title = '系統提示') => {
        return new Promise((resolve) => {
            const modal = document.getElementById('global-dialog-modal');
            const titleEl = document.getElementById('global-dialog-title');
            const msgEl = document.getElementById('global-dialog-message');
            const confirmBtn = document.getElementById('global-dialog-confirm-btn');
            const cancelBtn = document.getElementById('global-dialog-cancel-btn');
            const closeBtn = document.getElementById('global-dialog-close-btn');

            titleEl.textContent = title;
            msgEl.textContent = message;
            cancelBtn.style.display = 'none'; // 隱藏取消按鈕

            modal.classList.add('active');
            setTimeout(() => {
                modal.querySelector('.modal').style.transform = 'scale(1)';
            }, 10);

            const cleanUp = () => {
                confirmBtn.removeEventListener('click', onConfirm);
                closeBtn.removeEventListener('click', onConfirm);
            };

            const onConfirm = () => {
                modal.querySelector('.modal').style.transform = 'scale(0.9)';
                modal.classList.remove('active');
                cleanUp();
                resolve(true);
            };

            confirmBtn.addEventListener('click', onConfirm);
            closeBtn.addEventListener('click', onConfirm);
        });
    };

    // Lightbox 狀態變數
    let lightboxImages = [];
    let lightboxCurrentIndex = 0;
    let lightboxState = {
        scale: 1,
        translateX: 0,
        translateY: 0,
        isDragging: false,
        startX: 0,
        startY: 0
    };

    /**
     * 開啟全域圖片放大燈箱
     */
    const openLightbox = (imagesArray, initialIndex = 0) => {
        if (!imagesArray || imagesArray.length === 0) return;
        
        lightboxImages = imagesArray;
        lightboxCurrentIndex = initialIndex;

        const modal = document.getElementById('global-lightbox-modal');
        modal.classList.add('active');
        
        renderLightboxPhoto();
    };

    const closeLightbox = () => {
        const modal = document.getElementById('global-lightbox-modal');
        modal.classList.remove('active');
        resetLightboxTransform();
    };

    const resetLightboxTransform = () => {
        lightboxState = {
            scale: 1,
            translateX: 0,
            translateY: 0,
            isDragging: false,
            startX: 0,
            startY: 0
        };
        const img = document.getElementById('lightbox-img');
        if (img) {
            img.style.transform = 'scale(1) translate(0px, 0px)';
            img.style.cursor = 'zoom-in';
        }
    };

    const renderLightboxPhoto = () => {
        const img = document.getElementById('lightbox-img');
        const prevBtn = document.getElementById('btn-lightbox-prev');
        const nextBtn = document.getElementById('btn-lightbox-next');
        const indicator = document.getElementById('lightbox-index-indicator');

        if (lightboxImages.length === 0) {
            closeLightbox();
            return;
        }

        resetLightboxTransform();
        
        img.src = lightboxImages[lightboxCurrentIndex];
        
        // 更新張數指示器
        indicator.textContent = `${lightboxCurrentIndex + 1} / ${lightboxImages.length}`;

        // 控制左右按鈕顯示與隱藏
        if (lightboxImages.length > 1) {
            prevBtn.style.display = 'flex';
            nextBtn.style.display = 'flex';
        } else {
            prevBtn.style.display = 'none';
            nextBtn.style.display = 'none';
        }
    };

    const setupLightboxEvents = () => {
        const modal = document.getElementById('global-lightbox-modal');
        const img = document.getElementById('lightbox-img');
        const closeBtn = document.getElementById('btn-lightbox-close');
        const prevBtn = document.getElementById('btn-lightbox-prev');
        const nextBtn = document.getElementById('btn-lightbox-next');

        closeBtn.addEventListener('click', closeLightbox);
        
        // 點選遮罩背景關閉
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.classList.contains('lightbox-content')) {
                closeLightbox();
            }
        });

        // 左右切換
        const showPrev = () => {
            if (lightboxImages.length > 1) {
                lightboxCurrentIndex = (lightboxCurrentIndex - 1 + lightboxImages.length) % lightboxImages.length;
                renderLightboxPhoto();
            }
        };

        const showNext = () => {
            if (lightboxImages.length > 1) {
                lightboxCurrentIndex = (lightboxCurrentIndex + 1) % lightboxImages.length;
                renderLightboxPhoto();
            }
        };

        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showPrev();
        });

        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showNext();
        });

        // 滾輪縮放
        img.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomSpeed = 0.12;
            if (e.deltaY < 0) {
                lightboxState.scale = Math.min(6, lightboxState.scale + zoomSpeed);
            } else {
                lightboxState.scale = Math.max(0.5, lightboxState.scale - zoomSpeed);
            }
            img.style.transform = `scale(${lightboxState.scale}) translate(${lightboxState.translateX}px, ${lightboxState.translateY}px)`;
            img.style.cursor = lightboxState.scale > 1 ? 'grab' : 'zoom-in';
        }, { passive: false });

        // 滑鼠拖曳移動
        img.addEventListener('mousedown', (e) => {
            if (lightboxState.scale <= 1) return;
            e.preventDefault();
            lightboxState.isDragging = true;
            img.style.cursor = 'grabbing';
            lightboxState.startX = e.clientX - lightboxState.translateX * lightboxState.scale;
            lightboxState.startY = e.clientY - lightboxState.translateY * lightboxState.scale;
        });

        window.addEventListener('mousemove', (e) => {
            if (!lightboxState.isDragging) return;
            const tx = (e.clientX - lightboxState.startX) / lightboxState.scale;
            const ty = (e.clientY - lightboxState.startY) / lightboxState.scale;
            lightboxState.translateX = tx;
            lightboxState.translateY = ty;
            img.style.transform = `scale(${lightboxState.scale}) translate(${tx}px, ${ty}px)`;
        });

        window.addEventListener('mouseup', () => {
            if (lightboxState.isDragging) {
                lightboxState.isDragging = false;
                img.style.cursor = lightboxState.scale > 1 ? 'grab' : 'zoom-in';
            }
        });

        // 鍵盤監聽
        window.addEventListener('keydown', (e) => {
            if (modal.classList.contains('active')) {
                if (e.key === 'Escape') {
                    closeLightbox();
                } else if (e.key === 'ArrowLeft') {
                    showPrev();
                } else if (e.key === 'ArrowRight') {
                    showNext();
                }
            }
        });
    };

    /**
     * 設定 Google 同步的 UI 綁定與狀態監聽
     */
    const setupSyncUI = () => {
        const loginBtn = document.getElementById('google-login-btn');
        const logoutBtn = document.getElementById('google-logout-btn');
        const syncNowBtn = document.getElementById('sync-now-btn');
        const statusBadge = document.getElementById('sync-status-badge');
        const userEmail = document.getElementById('sync-user-email');
        const syncOptions = document.getElementById('sync-options-area');

        // PC 側邊欄同步狀態提示
        const sidebarSyncIndicator = document.getElementById('sidebar-sync-indicator');
        const sidebarSyncText = document.getElementById('sidebar-sync-text');

        // 自訂 Client ID 綁定
        const customIdInput = document.getElementById('custom-client-id-input');
        const saveIdBtn = document.getElementById('save-client-id-btn');
        if (customIdInput && saveIdBtn) {
            // 從 localStorage 載入目前自訂的 ID (若有)
            customIdInput.value = localStorage.getItem('gd_custom_client_id') || '';
            
            saveIdBtn.addEventListener('click', () => {
                const newId = customIdInput.value.trim();
                sync.setClientId(newId);
                showToast('Google Client ID 已儲存更新', 'success');
            });
        }

        // 自訂 Gemini API Key 綁定
        const geminiKeyInput = document.getElementById('gemini-api-key-input');
        const saveGeminiBtn = document.getElementById('save-gemini-key-btn');
        if (geminiKeyInput && saveGeminiBtn) {
            geminiKeyInput.value = localStorage.getItem('gemini_api_key') || '';
            
            saveGeminiBtn.addEventListener('click', () => {
                const key = geminiKeyInput.value.trim();
                if (key) {
                    localStorage.setItem('gemini_api_key', key);
                    showToast('Gemini API Key 已安全儲存於本地', 'success');
                } else {
                    localStorage.removeItem('gemini_api_key');
                    showToast('已清除 Gemini API Key', 'info');
                }
            });
        }

        // 自訂 Gemini Model 選擇器綁定
        const geminiModelSelect = document.getElementById('gemini-model-select');
        if (geminiModelSelect) {
            geminiModelSelect.value = localStorage.getItem('gemini_model') || 'gemini-2.5-flash';
            
            geminiModelSelect.addEventListener('change', (e) => {
                const selectedModel = e.target.value;
                localStorage.setItem('gemini_model', selectedModel);
                showToast(`已將預設模型切換為：${selectedModel}`, 'info');
            });
        }

        // 登入事件
        loginBtn.addEventListener('click', () => {
            sync.login();
        });

        // 登出事件
        logoutBtn.addEventListener('click', async () => {
            if (await confirm('確定要登出 Google 帳號並停止雲端同步嗎？')) {
                sync.logout();
                showToast('已登出 Google 帳號', 'info');
            }
        });

        // 立即同步事件
        syncNowBtn.addEventListener('click', () => {
            sync.runSync();
        });

        // 監聽同步狀態變更
        sync.registerStateCallback((state, email) => {
            // 清除 badge class
            statusBadge.className = 'status-badge';
            
            // 預設重置側邊欄
            sidebarSyncIndicator.className = 'sync-status-indicator';

            if (state === 'disconnected') {
                statusBadge.textContent = '未連線';
                statusBadge.classList.add('status-disconnected');
                userEmail.textContent = '請登入 Google 帳號啟用同步';
                
                loginBtn.style.display = 'inline-flex';
                logoutBtn.style.display = 'none';
                syncNowBtn.style.display = 'none';
                syncOptions.style.display = 'none';

                sidebarSyncText.textContent = '未登入同步';
            } else if (state === 'connected') {
                statusBadge.textContent = '已連線';
                statusBadge.classList.add('status-connected');
                userEmail.textContent = email;

                loginBtn.style.display = 'none';
                logoutBtn.style.display = 'inline-flex';
                syncNowBtn.style.display = 'inline-flex';
                syncOptions.style.display = 'block';

                sidebarSyncIndicator.classList.add('synced');
                sidebarSyncText.textContent = '雲端已同步';
            } else if (state === 'syncing') {
                statusBadge.textContent = '同步中...';
                statusBadge.classList.add('status-syncing');
                
                loginBtn.style.display = 'none';
                
                sidebarSyncIndicator.classList.add('syncing');
                sidebarSyncText.textContent = '資料同步中';
            } else if (state === 'success') {
                statusBadge.textContent = '同步成功';
                statusBadge.classList.add('status-connected');
                userEmail.textContent = email;

                loginBtn.style.display = 'none';
                logoutBtn.style.display = 'inline-flex';
                syncNowBtn.style.display = 'inline-flex';
                syncOptions.style.display = 'block';

                sidebarSyncIndicator.classList.add('synced');
                sidebarSyncText.textContent = '雲端已同步';
                showToast('雲端資料同步完成', 'success');
            } else if (state === 'error') {
                statusBadge.textContent = '同步失敗';
                statusBadge.classList.add('status-disconnected');
                
                loginBtn.style.display = 'inline-flex';
                logoutBtn.style.display = 'none';
                syncNowBtn.style.display = 'none';
                
                sidebarSyncText.textContent = '同步發生錯誤';
                showToast('同步失敗，請檢查網路或 OAuth 設定', 'error');
            }
        });
    };

    /**
     * 設定本地備份與還原的事件
     */
    const setupGlobalEvents = () => {
        const exportBtn = document.getElementById('export-db-btn');
        const importBtn = document.getElementById('import-db-btn');
        const fileInput = document.getElementById('import-db-file');

        // 匯出 JSON 備份檔
        exportBtn.addEventListener('click', async () => {
            try {
                const jsonStr = await db.exportData();
                const blob = new Blob([jsonStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                
                const dateStr = new Date().toISOString().split('T')[0];
                const tempLink = document.createElement('a');
                tempLink.href = url;
                tempLink.download = `my_notebook_backup_${dateStr}.json`;
                document.body.appendChild(tempLink);
                tempLink.click();
                document.body.removeChild(tempLink);
                URL.revokeObjectURL(url);
                
                showToast('備份檔案已成功匯出', 'success');
            } catch (err) {
                console.error(err);
                showToast('匯出備份失敗', 'error');
            }
        });

        // 匯入 JSON 備份檔
        importBtn.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (await confirm('匯入備份檔將會清除目前瀏覽器的本地資料，確定要覆蓋並還原資料嗎？')) {
                const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                        const content = event.target.result;
                        await db.importData(content);
                        showToast('備份資料還原成功！', 'success');
                        
                        // 重新整理當前畫面
                        refreshCurrentTab(currentTab);
                    } catch (err) {
                        await alert('還原失敗，請檢查 JSON 備份檔案格式是否正確。');
                        showToast('備份還原失敗', 'error');
                    }
                };
                reader.readAsText(file);
            }
            // 清空 value，讓同一個檔案可以重複選取觸發 change
            fileInput.value = '';
        });
    };

    return {
        init,
        switchTab,
        showToast,
        confirm,
        alert,
        prompt,
        openLightbox,
        toggleTheme
    };
})();

window.app = app;

// 當網頁全部載入完成時執行初始化
window.addEventListener('DOMContentLoaded', () => {
    app.init();
});
