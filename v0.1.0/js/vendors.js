/**
 * vendors.js - 廠商管理與名片 OCR 掃描邏輯
 */
const vendors = (() => {
    let vendorsList = [];
    let selectedTagFilter = '';
    let searchQuery = '';
    let currentShareVendor = null;   // 當前分享的廠商
    let shareCanvasInstance = null;  // 當前生成的畫布實體

    // 相機串流與鏡頭狀態
    let streamInstance = null;
    let currentFacingMode = 'environment'; // environment (後置) 或 user (前置)
    
    // OCR 狀態資料
    let tempCardImageBase64 = null; // 暫存的名片圖片 (OCR 用)
    let activeOcrTextLine = ''; // 目前點選的名片辨識文字行

    // 多圖管理暫存資料
    let tempCardImages = []; // 當前編輯廠商的照片陣列 [base64_1, base64_2, ...]
    let activePreviewIndex = 0; // 目前放大預覽的圖片索引

    // 視角與多聯絡人狀態資料
    let currentViewState = 'card'; // 'card' 或 'table'
    let tempContacts = [];        // 暫存聯絡人資料
    let tempVisits = [];          // 暫存拜訪紀錄資料

    const init = async () => {
        setupEvents();
        await render();
    };

    const setupEvents = () => {
        // 新增廠商按鈕
        document.getElementById('add-vendor-btn').addEventListener('click', () => {
            openEditModal();
        });

        // 搜尋廠商
        document.getElementById('search-vendors-input').addEventListener('input', (e) => {
            searchQuery = e.target.value.trim().toLowerCase();
            renderList();
        });

        // 阻止拜訪紀錄輸入框按 Enter 鍵時提交整張廠商表單，改為自動觸發「新增拜訪」
        const handleVisitEnter = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addVisitRecord();
            }
        };
        document.getElementById('visit-input-purpose').addEventListener('keydown', handleVisitEnter);
        document.getElementById('visit-input-custom-contact').addEventListener('keydown', handleVisitEnter);

        // 廠商表單提交
        document.getElementById('vendor-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveVendor();
        });

        // 匯出 Excel 事件
        document.getElementById('export-vendors-btn').addEventListener('click', () => {
            exportToExcel();
        });

        // 視角切換事件：卡片式
        document.getElementById('vendor-view-card-btn').addEventListener('click', () => {
            switchViewState('card');
        });

        // 視角切換事件：條列式
        document.getElementById('vendor-view-table-btn').addEventListener('click', () => {
            switchViewState('table');
        });

        // 新增聯絡人行按鈕
        document.getElementById('add-contact-row-btn').addEventListener('click', () => {
            addContactRow();
        });

        // 刪除當前顯示的名片/照片
        document.getElementById('delete-card-photo-btn').addEventListener('click', () => {
            deleteThumbnail(activePreviewIndex);
        });

        // 點擊新增多張照片按鈕
        const morePhotosBtn = document.getElementById('add-more-photos-btn');
        const morePhotosInput = document.getElementById('add-more-photos-input');
        
        morePhotosBtn.addEventListener('click', () => {
            morePhotosInput.click();
        });

        morePhotosInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            if (files.length === 0) return;

            let loadedCount = 0;
            files.forEach(file => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    tempCardImages.push(event.target.result);
                    loadedCount++;
                    if (loadedCount === files.length) {
                        // 全部載入完畢，預覽最後一張，並重新渲染縮圖
                        activePreviewIndex = tempCardImages.length - 1;
                        renderThumbnails();
                        updateActivePreview();
                        app.showToast(`成功新增 ${files.length} 張照片`, 'success');
                    }
                };
                reader.readAsDataURL(file);
            });
            morePhotosInput.value = ''; // 重置 input
        });

        // 點擊編輯視窗中的大圖，啟動全螢幕 Lightbox 檢視
        document.getElementById('vendor-card-preview-img').addEventListener('click', () => {
            if (tempCardImages.length > 0) {
                app.openLightbox(tempCardImages, activePreviewIndex);
            }
        });

        /* ---- 掃描名片 Modal 相關事件 ---- */
        const scanCardBtn = document.getElementById('scan-card-btn');
        const closeScanBtn = document.getElementById('close-scan-btn');
        const scanCancelBtn = document.getElementById('scan-cancel-btn');
        const scanSaveBtn = document.getElementById('scan-save-btn');
        const fileUploader = document.getElementById('ocr-file-uploader');
        const fileInput = document.getElementById('scan-file-input');

        // 開啟掃描視窗
        scanCardBtn.addEventListener('click', () => {
            openScanModal();
        });

        // 關閉掃描視窗
        closeScanBtn.addEventListener('click', () => {
            closeScanModal();
        });
        scanCancelBtn.addEventListener('click', () => {
            closeScanModal();
        });

        // 點擊上傳檔案區
        fileUploader.addEventListener('click', () => {
            fileInput.click();
        });

        // 拖曳上傳檔案處理
        fileUploader.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileUploader.classList.add('dragover');
        });

        fileUploader.addEventListener('dragleave', () => {
            fileUploader.classList.remove('dragover');
        });

        fileUploader.addEventListener('drop', (e) => {
            e.preventDefault();
            fileUploader.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) {
                processUploadedFile(file);
            }
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                processUploadedFile(file);
            }
        });

        // 相機拍照快門
        document.getElementById('capture-photo-btn').addEventListener('click', () => {
            capturePhoto();
        });

        // 切換前後鏡頭
        document.getElementById('toggle-camera-source-btn').addEventListener('click', () => {
            toggleCamera();
        });

        // 掃描表單的填入按鈕 (將點選的文字填入輸入框)
        const fillTargetButtons = document.querySelectorAll('.btn-fill-target');
        fillTargetButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const field = btn.getAttribute('data-field');
                fillOcrTextToField(field, btn);
            });
        });

        // 點擊「確認匯入廠商」
        scanSaveBtn.addEventListener('click', async () => {
            await saveOcrImportedVendor();
        });

        // 模式切換：相機拍照 Tab
        document.getElementById('scan-tab-camera').addEventListener('click', () => {
            switchScanMode('camera');
        });

        // 模式切換：上傳檔案 Tab
        document.getElementById('scan-tab-upload').addEventListener('click', () => {
            switchScanMode('upload');
        });

        // 監聽 OCR 閥值滑桿
        const thresholdSlider = document.getElementById('ocr-threshold-slider');
        thresholdSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            document.getElementById('threshold-value-display').textContent = `手動 (${val})`;
            // 即時更新黑白二值化預覽圖
            updateBinarizationPreview(val);
        });

        // 監聽重新辨識按鈕
        document.getElementById('re-recognize-btn').addEventListener('click', () => {
            const val = thresholdSlider.value;
            triggerOcrWithThreshold(val);
        });
    };

    /**
     * 讀取並渲染廠商列表
     */
    const render = async () => {
        try {
            vendorsList = await db.getAll('vendors');
            vendorsList.sort((a, b) => b.createdAt - a.createdAt);
            
            renderTagsFilter();
            renderList();
        } catch (error) {
            console.error('Render vendors error:', error);
        }
    };

    /**
     * 動態渲染搜尋欄下方的標籤過濾按鈕
     */
    const renderTagsFilter = () => {
        const filterContainer = document.getElementById('vendors-tags-filter');
        if (!filterContainer) return;

        const allTags = new Set();
        vendorsList.forEach(v => {
            if (v.tags && v.tags.length > 0) {
                v.tags.forEach(t => allTags.add(t));
            }
        });

        if (allTags.size === 0) {
            filterContainer.innerHTML = '';
            return;
        }

        let html = `<span class="tag-badge ${!selectedTagFilter ? 'active' : ''}" onclick="vendors.setTagFilter('')">全部</span>`;
        allTags.forEach(tag => {
            html += `<span class="tag-badge ${selectedTagFilter === tag ? 'active' : ''}" onclick="vendors.setTagFilter('${tag}')">${tag}</span>`;
        });

        filterContainer.innerHTML = html;
    };

    const setTagFilter = (tag) => {
        selectedTagFilter = tag;
        renderTagsFilter();
        renderList();
    };

    /**
     * 渲染廠商列表卡片
     */
    /**
     * 廠商列表渲染路由
     */
    const renderList = () => {
        // 過濾
        const filtered = vendorsList.filter(v => {
            if (selectedTagFilter && (!v.tags || !v.tags.includes(selectedTagFilter))) {
                return false;
            }
            if (searchQuery) {
                return v.companyName.toLowerCase().includes(searchQuery) ||
                       (v.contactName && v.contactName.toLowerCase().includes(searchQuery)) ||
                       (v.phone && v.phone.includes(searchQuery)) ||
                       v.tags.some(t => t.toLowerCase().includes(searchQuery)) ||
                       (v.brands && v.brands.some(b => b.toLowerCase().includes(searchQuery))) ||
                       (v.contacts && v.contacts.some(c => 
                           c.name.toLowerCase().includes(searchQuery) || 
                           (c.title && c.title.toLowerCase().includes(searchQuery)) || 
                           (c.phone && c.phone.includes(searchQuery)) || 
                           (c.email && c.email.toLowerCase().includes(searchQuery))
                       )) ||
                       (v.visits && v.visits.some(vt => 
                           vt.contactName.toLowerCase().includes(searchQuery) ||
                           vt.purpose.toLowerCase().includes(searchQuery) ||
                           vt.date.includes(searchQuery)
                       ));
            }
            return true;
        });

        if (currentViewState === 'card') {
            document.getElementById('vendors-grid').style.display = 'grid';
            document.getElementById('vendors-table-container').style.display = 'none';
            renderCardList(filtered);
        } else {
            document.getElementById('vendors-grid').style.display = 'none';
            document.getElementById('vendors-table-container').style.display = 'block';
            renderTableList(filtered);
        }
    };

    /**
     * 渲染廠商卡片列表 (原樣式)
     */
    const renderCardList = (filtered) => {
        const container = document.getElementById('vendors-grid');
        if (!container) return;

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="kb-empty-state" style="grid-column: 1 / -1; padding: 60px 0;">
                    <i class="fa-solid fa-address-book" style="font-size: 3rem;"></i>
                    <p>目前尚無廠商資料。請點擊「新增廠商」或「掃描名片」建立。</p>
                </div>
            `;
            return;
        }

        let html = '';
        filtered.forEach(v => {
            const dateStr = new Date(v.createdAt).toLocaleDateString();
            
            // 讀取聯絡人
            const contactsList = v.contacts || [];
            const primary = contactsList.find(c => c.isPrimary) || contactsList[0] || { name: v.contactName || '', phone: v.phone || '', email: v.email || '', title: '代表' };
            const visitsCount = getUniqueVisitCount(v.visits);

            html += `
                <div class="vendor-card">
                    <div>
                        <div class="vendor-card-header">
                            <div class="vendor-title-wrapper">
                                <div class="vendor-company">${escapeHtml(v.companyName)}</div>
                                <div class="vendor-contact">
                                    聯絡人：${escapeHtml(primary.name)} 
                                    ${primary.title ? `<span style="font-size:0.75rem; opacity:0.8; font-weight:normal;">(${escapeHtml(primary.title)})</span>` : ''}
                                </div>
                            </div>
                            <div class="vendor-card-actions">
                                <button onclick="vendors.openEditModal(${v.id})" title="修改資料">
                                    <i class="fa-solid fa-pen-to-square"></i>
                                </button>
                                <button class="btn-delete" onclick="vendors.deleteVendor(${v.id})" title="刪除廠商">
                                    <i class="fa-solid fa-trash-can"></i>
                                </button>
                            </div>
                        </div>

                        <div class="vendor-card-body">
                            ${primary.phone ? `
                                <div class="vendor-info-item">
                                    <i class="fa-solid fa-phone"></i>
                                    <a href="tel:${primary.phone}">${escapeHtml(primary.phone)}</a>
                                </div>
                            ` : ''}
                            ${primary.email ? `
                                <div class="vendor-info-item">
                                    <i class="fa-solid fa-envelope"></i>
                                    <a href="mailto:${primary.email}">${escapeHtml(primary.email)}</a>
                                </div>
                            ` : ''}
                            ${v.address ? `
                                <div class="vendor-info-item">
                                    <i class="fa-solid fa-map-location-dot"></i>
                                    <span>${escapeHtml(v.address)}</span>
                                </div>
                            ` : ''}
                            ${v.notes ? `
                                <div class="vendor-info-item" style="align-items: flex-start; margin-top: 8px;">
                                    <i class="fa-solid fa-message" style="margin-top: 4px;"></i>
                                    <span style="white-space: pre-wrap; font-size: 0.8rem; opacity: 0.8;">${escapeHtml(v.notes)}</span>
                                </div>
                            ` : ''}

                            ${v.brands && v.brands.length > 0 ? `
                                <div class="note-brand-tags">
                                    ${v.brands.map(b => `<span class="brand-tag"><i class="fa-solid fa-microchip"></i> ${escapeHtml(b)}</span>`).join('')}
                                </div>
                            ` : ''}

                            ${v.tags && v.tags.length > 0 ? `
                                <div class="vendor-card-tags" style="margin-top: 8px;">
                                    ${v.tags.map(t => `<span class="vendor-tag">${escapeHtml(t)}</span>`).join('')}
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    <div class="vendor-card-footer">
                        <span class="vendor-date">建檔日：${dateStr}</span>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <span class="visit-badge" onclick="vendors.showQuickVisitHistory(${v.id})" title="點擊檢視完整拜訪歷史">
                                <i class="fa-solid fa-clock-rotate-left"></i> ${visitsCount} 次拜訪
                            </span>
                            ${v.cardImage || (v.cardImages && v.cardImages.length > 0) ? `
                                <span class="vendor-has-card-badge" onclick="vendors.previewCardPhoto(${v.id})" style="cursor: pointer;" title="點擊查看名片圖">
                                    <i class="fa-solid fa-image"></i> 名片相片
                                </span>
                            ` : ''}
                            <span class="vendor-has-card-badge" onclick="vendors.generateShareCard(${v.id})" style="cursor: pointer; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.25); color: var(--color-primary);" title="點擊產生名片分享拼圖">
                                <i class="fa-solid fa-share-nodes"></i> 名片分享
                            </span>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    };

    /**
     * 渲染廠商條列式表格列表
     */
    const renderTableList = (filtered) => {
        const container = document.getElementById('vendors-table-container');
        if (!container) return;

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="kb-empty-state" style="padding: 60px 0;">
                    <i class="fa-solid fa-address-book" style="font-size: 3rem;"></i>
                    <p>目前尚無篩選的廠商資料。請點擊「新增廠商」或「掃描名片」建立。</p>
                </div>
            `;
            return;
        }

        let html = `
            <table class="vendor-table">
                <thead>
                    <tr>
                        <th style="width: 20%;">公司名稱</th>
                        <th style="width: 15%;">代理品牌</th>
                        <th style="width: 25%;">代表聯絡人 (職稱/電話/Email)</th>
                        <th style="width: 13%;">拜訪紀錄</th>
                        <th style="width: 15%;">經營項目標籤</th>
                        <th style="width: 12%; text-align: center;">操作</th>
                    </tr>
                </thead>
                <tbody>
        `;

        filtered.forEach(v => {
            const contactsList = v.contacts || [];
            const primary = contactsList.find(c => c.isPrimary) || contactsList[0] || { name: v.contactName || '', phone: v.phone || '', email: v.email || '', title: '代表' };
            const visitsList = v.visits || [];
            
            // 排序取得最近拜訪日期
            let recentVisitText = '<span style="color:var(--text-muted); font-size:0.75rem;">無紀錄</span>';
            if (visitsList.length > 0) {
                const sortedVisits = [...visitsList].sort((a,b) => b.date.localeCompare(a.date));
                recentVisitText = `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">最近: ${sortedVisits[0].date}</div>`;
            }

            // 拼接其他聯絡人提示
            const others = contactsList.filter(c => c !== primary);
            const othersTooltip = others.length > 0 ? ` title="其他聯絡人：&#10;${others.map(o => `${o.name}(${o.title || '無'}): ${o.phone || ''} ${o.email || ''}`).join('&#10;')}"` : '';
            const othersIndicator = others.length > 0 ? ` <span class="vendor-tag" style="font-size:0.7rem; background:rgba(255,255,255,0.05); margin-left:4px;">+${others.length} 位</span>` : '';

            html += `
                <tr>
                    <td class="vendor-table-company" style="position: relative;">
                        <div>${escapeHtml(v.companyName)}</div>
                        ${v.notes ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px; font-weight:normal; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(v.notes)}">${escapeHtml(v.notes)}</div>` : ''}
                    </td>
                    <td>
                        ${v.brands && v.brands.length > 0 ? 
                            v.brands.map(b => `<span class="brand-tag" style="margin: 2px 2px 0 0; display:inline-block;"><i class="fa-solid fa-microchip" style="font-size:0.7rem;"></i> ${escapeHtml(b)}</span>`).join('') 
                            : '<span style="color:var(--text-muted); font-size:0.8rem;">-</span>'
                        }
                    </td>
                    <td${othersTooltip} style="cursor: help;">
                        <div style="font-weight:600;">
                            ${escapeHtml(primary.name)} ${primary.title ? `<span style="font-size:0.8rem; color:var(--text-secondary); font-weight:normal;">(${escapeHtml(primary.title)})</span>` : ''}
                            ${othersIndicator}
                        </div>
                        ${primary.phone ? `<div style="font-size:0.8rem; color:var(--text-secondary); margin-top:2px;"><i class="fa-solid fa-phone" style="font-size:0.75rem;"></i> <a href="tel:${primary.phone}">${escapeHtml(primary.phone)}</a></div>` : ''}
                        ${primary.email ? `<div style="font-size:0.8rem; color:var(--text-secondary); margin-top:2px;"><i class="fa-solid fa-envelope" style="font-size:0.75rem;"></i> <a href="mailto:${primary.email}">${escapeHtml(primary.email)}</a></div>` : ''}
                    </td>
                    <td>
                        <span class="visit-badge" onclick="vendors.showQuickVisitHistory(${v.id})" title="點擊檢視完整拜訪歷史">
                            <i class="fa-solid fa-clock-rotate-left"></i> ${getUniqueVisitCount(visitsList)} 次
                        </span>
                        ${recentVisitText}
                    </td>
                    <td>
                        ${v.tags && v.tags.length > 0 ? 
                            v.tags.map(t => `<span class="vendor-tag" style="margin: 2px 2px 0 0; display:inline-block;">${escapeHtml(t)}</span>`).join('') 
                            : '<span style="color:var(--text-muted); font-size:0.8rem;">-</span>'
                        }
                    </td>
                    <td style="text-align: center;">
                        <div style="display:flex; justify-content:center; gap:6px;">
                            ${v.cardImage || (v.cardImages && v.cardImages.length > 0) ? `
                                <button class="btn btn-secondary btn-sm" onclick="vendors.previewCardPhoto(${v.id})" style="padding: 4px 8px; font-size: 0.8rem; height: auto;" title="檢視名片">
                                    <i class="fa-solid fa-image"></i>
                                </button>
                            ` : ''}
                            <button class="btn btn-secondary btn-sm" onclick="vendors.generateShareCard(${v.id})" style="padding: 4px 8px; font-size: 0.8rem; height: auto; color: var(--color-primary);" title="分享名片">
                                <i class="fa-solid fa-share-nodes"></i>
                            </button>
                            <button class="btn btn-secondary btn-sm" onclick="vendors.openEditModal(${v.id})" style="padding: 4px 8px; font-size: 0.8rem; height: auto;" title="修改資料">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </button>
                            <button class="btn btn-secondary btn-sm btn-delete" onclick="vendors.deleteVendor(${v.id})" style="padding: 4px 8px; font-size: 0.8rem; height: auto; color:var(--color-danger);" title="刪除廠商">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;
        container.innerHTML = html;
    };

    /* ----------------- 新增 / 編輯 表單 Modal 邏輯 ----------------- */

    const openEditModal = async (id = null) => {
        const modal = document.getElementById('vendor-modal');
        const form = document.getElementById('vendor-form');
        const title = document.getElementById('vendor-modal-title');
        
        form.reset();
        tempCardImageBase64 = null;
        tempCardImages = [];
        activePreviewIndex = 0;
        tempContacts = [];
        tempVisits = [];

        // 初始化拜訪紀錄日期為今日，清空事由
        document.getElementById('visit-input-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('visit-input-purpose').value = '';

        if (id) {
            title.textContent = '修改廠商資料';
            try {
                const v = await db.getById('vendors', id);
                document.getElementById('vendor-id').value = v.id;
                document.getElementById('vendor-company').value = v.companyName;
                document.getElementById('vendor-address').value = v.address || '';
                document.getElementById('vendor-tags').value = v.tags ? v.tags.join(', ') : '';
                document.getElementById('vendor-notes').value = v.notes || '';
                document.getElementById('vendor-brands').value = v.brands ? v.brands.join(', ') : '';
                
                // 相容多聯絡人結構
                if (v.contacts && v.contacts.length > 0) {
                    tempContacts = JSON.parse(JSON.stringify(v.contacts)); // 深拷貝
                } else {
                    // 若是舊資料，由原有舊欄位補全一筆聯絡人
                    tempContacts = [{
                        id: Date.now(),
                        name: v.contactName || '',
                        title: '主要聯絡人',
                        phone: v.phone || '',
                        email: v.email || '',
                        isPrimary: true
                    }];
                }
                
                // 載入拜訪紀錄
                tempVisits = v.visits ? JSON.parse(JSON.stringify(v.visits)) : [];

                // 相容多圖結構
                if (v.cardImages && v.cardImages.length > 0) {
                    tempCardImages = [...v.cardImages];
                } else if (v.cardImage) {
                    tempCardImages = [v.cardImage];
                }
                
                renderThumbnails();
                updateActivePreview();
            } catch (err) {
                console.error(err);
            }
        } else {
            title.textContent = '新增廠商資料';
            document.getElementById('vendor-id').value = '';
            document.getElementById('vendor-brands').value = '';
            
            // 新增時預設給一列主要聯絡人以方便填寫
            tempContacts = [{
                id: Date.now(),
                name: '',
                title: '主要聯絡人',
                phone: '',
                email: '',
                isPrimary: true
            }];
            tempVisits = [];
            
            renderThumbnails();
            updateActivePreview();
        }

        renderContactInputs();
        renderVisitInputsAndHistory();
        modal.classList.add('active');
    };

    /**
     * 渲染縮圖網格
     */
    const renderThumbnails = () => {
        const grid = document.getElementById('vendor-thumbnails-grid');
        if (!grid) return;

        if (tempCardImages.length === 0) {
            grid.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted); padding: 5px 0;">尚無照片備份</div>';
            return;
        }

        let html = '';
        tempCardImages.forEach((img, idx) => {
            const isActive = idx === activePreviewIndex;
            html += `
                <div class="thumbnail-wrapper ${isActive ? 'thumbnail-active' : ''}" onclick="vendors.setActivePreview(${idx})">
                    <div class="thumbnail-inner-wrap">
                        <img src="${img}" class="thumbnail-img">
                    </div>
                    <button type="button" class="btn-delete-thumbnail" onclick="event.stopPropagation(); vendors.deleteThumbnail(${idx})" title="刪除此照片">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            `;
        });
        grid.innerHTML = html;
    };

    /**
     * 更新大圖預覽區域的顯示
     */
    const updateActivePreview = () => {
        const previewContainer = document.getElementById('active-image-preview-container');
        const previewImg = document.getElementById('vendor-card-preview-img');

        if (tempCardImages.length > 0 && activePreviewIndex < tempCardImages.length) {
            previewImg.src = tempCardImages[activePreviewIndex];
            previewContainer.style.display = 'block';
        } else {
            previewImg.src = '';
            previewContainer.style.display = 'none';
        }
    };

    /**
     * 設定目前選取的大圖預覽
     */
    const setActivePreview = (index) => {
        activePreviewIndex = index;
        renderThumbnails();
        updateActivePreview();
    };

    /**
     * 刪除特定索引的縮圖
     */
    const deleteThumbnail = async (index) => {
        if (await app.confirm('確定要刪除這張照片嗎？')) {
            tempCardImages.splice(index, 1);
            if (tempCardImages.length > 0) {
                // 自動對齊至上一張
                activePreviewIndex = Math.max(0, index - 1);
            } else {
                activePreviewIndex = 0;
            }
            renderThumbnails();
            updateActivePreview();
            app.showToast('相片已刪除', 'info');
        }
    };

    /**
     * 切換視角 (卡片/條列式)
     */
    const switchViewState = (state) => {
        currentViewState = state;
        
        const cardBtn = document.getElementById('vendor-view-card-btn');
        const tableBtn = document.getElementById('vendor-view-table-btn');
        
        if (state === 'card') {
            cardBtn.classList.add('active');
            tableBtn.classList.remove('active');
            cardBtn.style.color = 'var(--text-primary)';
            tableBtn.style.color = 'var(--text-muted)';
        } else {
            tableBtn.classList.add('active');
            cardBtn.classList.remove('active');
            tableBtn.style.color = 'var(--text-primary)';
            cardBtn.style.color = 'var(--text-muted)';
        }
        
        renderList();
    };

    /**
     * 渲染聯絡人編輯行
     */
    const renderContactInputs = () => {
        const list = document.getElementById('contacts-edit-list');
        if (!list) return;

        let html = '';
        tempContacts.forEach((c, idx) => {
            html += `
                <div class="contact-edit-row" data-index="${idx}">
                    <input type="text" placeholder="姓名" value="${escapeHtml(c.name)}" oninput="vendors.updateContactField(${idx}, 'name', this.value)" required style="flex: 1.2;">
                    <input type="text" placeholder="職稱" value="${escapeHtml(c.title || '')}" oninput="vendors.updateContactField(${idx}, 'title', this.value)" style="flex: 1.2;">
                    <input type="text" placeholder="電話/手機" value="${escapeHtml(c.phone || '')}" oninput="vendors.updateContactField(${idx}, 'phone', this.value)" style="flex: 1.5;">
                    <input type="email" placeholder="電子信箱" value="${escapeHtml(c.email || '')}" oninput="vendors.updateContactField(${idx}, 'email', this.value)" style="flex: 2;">
                    
                    <div class="primary-checkbox-wrap">
                        <input type="radio" name="primary-contact" id="primary-contact-${idx}" ${c.isPrimary ? 'checked' : ''} onchange="vendors.setPrimaryContact(${idx})" style="width: auto; margin-right: 4px; cursor: pointer;">
                        <label for="primary-contact-${idx}" style="cursor: pointer; margin-bottom: 0;">主要</label>
                    </div>
                    
                    ${tempContacts.length > 1 ? `
                        <button type="button" class="btn-delete-contact" onclick="vendors.deleteContactRow(${idx})" title="刪除此聯絡人">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    ` : ''}
                </div>
            `;
        });
        list.innerHTML = html;
    };

    /**
     * 動態新增聯絡人行
     */
    const addContactRow = () => {
        tempContacts.push({
            id: Date.now(),
            name: '',
            title: '',
            phone: '',
            email: '',
            isPrimary: tempContacts.length === 0
        });
        renderContactInputs();
    };

    /**
     * 刪除聯絡人行
     */
    const deleteContactRow = (index) => {
        const wasPrimary = tempContacts[index].isPrimary;
        tempContacts.splice(index, 1);
        if (wasPrimary && tempContacts.length > 0) {
            tempContacts[0].isPrimary = true;
        }
        renderContactInputs();
    };

    /**
     * 更新聯絡人欄位
     */
    const updateContactField = (index, field, value) => {
        if (tempContacts[index]) {
            tempContacts[index][field] = value;
        }
    };

    /**
     * 設定主要聯絡人
     */
    const setPrimaryContact = (index) => {
        tempContacts.forEach((c, idx) => {
            c.isPrimary = idx === index;
        });
        renderContactInputs();
    };

    /**
     * 使用 ExcelJS 將篩選後的廠商資料匯出為 Excel
     */
    const exportToExcel = async () => {
        try {
            // 套用過濾條件
            const filtered = vendorsList.filter(v => {
                if (selectedTagFilter && (!v.tags || !v.tags.includes(selectedTagFilter))) {
                    return false;
                }
                if (searchQuery) {
                    return v.companyName.toLowerCase().includes(searchQuery) ||
                           (v.contactName && v.contactName.toLowerCase().includes(searchQuery)) ||
                           (v.phone && v.phone.includes(searchQuery)) ||
                           v.tags.some(t => t.toLowerCase().includes(searchQuery)) ||
                           (v.brands && v.brands.some(b => b.toLowerCase().includes(searchQuery))) ||
                           (v.contacts && v.contacts.some(c => 
                               c.name.toLowerCase().includes(searchQuery) || 
                               (c.title && c.title.toLowerCase().includes(searchQuery)) || 
                               (c.phone && c.phone.includes(searchQuery)) || 
                               (c.email && c.email.toLowerCase().includes(searchQuery))
                           )) ||
                           (v.visits && v.visits.some(vt => 
                               vt.contactName.toLowerCase().includes(searchQuery) ||
                               vt.purpose.toLowerCase().includes(searchQuery) ||
                               vt.date.includes(searchQuery)
                           ));
                }
                return true;
            });

            if (filtered.length === 0) {
                app.showToast('目前無篩選廠商資料可供匯出', 'warning');
                return;
            }

            if (typeof ExcelJS === 'undefined') {
                app.showToast('ExcelJS 載入失敗，請重新整理網頁', 'error');
                return;
            }

            app.showToast('正在產生 Excel 報表...', 'info');

            const wb = new ExcelJS.Workbook();
            wb.creator = 'My Notebook System';
            wb.created = new Date();
            const ws = wb.addWorksheet('廠商清單總表', {
                views: [{ state: 'frozen', ySplit: 2 }] // 凍結前2列
            });

            const COLS = [
                { key: 'index',         header: '序號',       width: 8 },
                { key: 'companyName',   header: '公司名稱',     width: 30 },
                { key: 'primaryName',   header: '主要聯絡人',   width: 14 },
                { key: 'primaryTitle',  header: '職稱',       width: 14 },
                { key: 'primaryPhone',  header: '聯絡電話',     width: 18 },
                { key: 'primaryEmail',  header: '電子信箱',     width: 24 },
                { key: 'brands',        header: '代理品牌',     width: 20 },
                { key: 'otherContacts', header: '其他聯絡人',   width: 30 },
                { key: 'visitCount',    header: '來訪次數',     width: 10 },
                { key: 'visitDetailsText', header: '所有來訪紀錄',  width: 30 },
                { key: 'address',       header: '公司地址',     width: 35 },
                { key: 'tags',          header: '標籤',       width: 18 },
                { key: 'notes',         header: '詳細備註',     width: 30 },
                { key: 'updatedAt',     header: '最後修改時間', width: 20 }
            ];
            ws.columns = COLS;
            const totalCols = COLS.length;
            const lastColLetter = String.fromCharCode(64 + totalCols);

            // 樣式定義
            const titleFill    = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; // 深灰藍
            const headerFill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }; // 靛藍主色
            const oddRowFill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }; // 白
            const evenRowFill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }; // 淺藍灰
            
            const thinBorder   = { style: 'thin', color: { argb: 'FFE2E8F0' } };
            const dataBorder   = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
            const headerBorder = {
                top:    { style: 'medium', color: { argb: 'FF312E81' } },
                left:   { style: 'medium', color: { argb: 'FF312E81' } },
                bottom: { style: 'medium', color: { argb: 'FF312E81' } },
                right:  { style: 'medium', color: { argb: 'FF312E81' } }
            };

            // 1. 第一列：主標題列
            ws.mergeCells(`A1:${lastColLetter}1`);
            const titleCell = ws.getCell('A1');
            titleCell.value = `廠商總表與聯絡清冊 (篩選出 ${filtered.length} 家廠商)`;
            titleCell.font = { name: 'Microsoft JhengHei', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
            titleCell.fill = titleFill;
            titleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
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

            // 3. 第三列起：寫入資料列
            filtered.forEach((v, idx) => {
                const rowIdx = idx + 3;
                const isEven = idx % 2 === 1;
                const fill = isEven ? evenRowFill : oddRowFill;

                // 處理聯絡人
                const contactsList = v.contacts || [];
                const primary = contactsList.find(c => c.isPrimary) || contactsList[0] || { name: v.contactName || '', phone: v.phone || '', email: v.email || '', title: '主要聯絡人' };
                const others = contactsList.filter(c => c !== primary);
                
                const otherContactsText = others.map(o => 
                    `${o.name}${o.title ? `(${o.title})` : ''}: ${o.phone || ''} ${o.email || ''}`.trim()
                ).join('; ');

                // 處理拜訪紀錄
                const visits = v.visits || [];
                const visitCount = getUniqueVisitCount(visits);
                let visitDetailsText = '-';
                if (visitCount > 0) {
                    const sortedVisits = [...visits].sort((a, b) => b.date.localeCompare(a.date));
                    visitDetailsText = sortedVisits.map(vt => 
                        `[${vt.date}] ${vt.contactName}: ${vt.purpose}`
                    ).join('\n');
                }

                const rowData = [
                    idx + 1,
                    v.companyName,
                    primary.name || '-',
                    primary.title || '-',
                    primary.phone || '-',
                    primary.email || '-',
                    v.brands ? v.brands.join(', ') : '-',
                    otherContactsText || '-',
                    visitCount,
                    visitDetailsText,
                    v.address || '-',
                    v.tags ? v.tags.join(', ') : '-',
                    v.notes || '-',
                    new Date(v.updatedAt).toLocaleString('zh-TW')
                ];

                const dataRow = ws.getRow(rowIdx);
                rowData.forEach((val, colIdx) => {
                    const cell = dataRow.getCell(colIdx + 1);
                    cell.value = val;
                    cell.fill = fill;
                    cell.border = dataBorder;
                    cell.alignment = { vertical: 'middle', wrapText: true };

                    // 特殊欄位對齊與字體
                    if (colIdx === 0) {
                        cell.font = { name: 'Consolas', size: 9, color: { argb: 'FF64748B' } };
                        cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    } else if (colIdx === 1) {
                        cell.font = { name: 'Microsoft JhengHei', size: 10, bold: true, color: { argb: 'FF0F172A' } };
                    } else {
                        cell.font = { name: 'Microsoft JhengHei', size: 10, color: { argb: 'FF334155' } };
                    }
                });
                dataRow.height = 24;
            });

            // 4. 欄寬自適應
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
                col.width = Math.min(50, Math.max(col.width || 10, maxLen + 4));
            });

            // 5. 下載
            const buffer = await wb.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `廠商管理清冊_${new Date().toISOString().split('T')[0]}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            app.showToast('Excel 報表匯出成功', 'success');
        } catch (err) {
            console.error(err);
            app.showToast('匯出 Excel 失敗', 'error');
        }
    };

    const closeModal = () => {
        document.getElementById('vendor-modal').classList.remove('active');
    };

    const saveVendor = async () => {
        // 自動防呆：如果使用者填寫了拜訪資訊（勾選了人員、或填寫了事由）卻忘記點選「新增拜訪」直接存檔，自動代為新增
        const dateInput = document.getElementById('visit-input-date');
        const purposeInput = document.getElementById('visit-input-purpose');
        const customChk = document.getElementById('visit-contact-check-custom');
        const customInput = document.getElementById('visit-input-custom-contact');

        const hasCheckedContacts = document.querySelectorAll('input[name="visit-contact-check"]:checked').length > 0;
        const hasCustomInput = customChk && customChk.checked && customInput && customInput.value.trim();
        const hasPurposeText = purposeInput && purposeInput.value.trim();

        if ((hasCheckedContacts || hasCustomInput || hasPurposeText) && dateInput && dateInput.value) {
            addVisitRecord();
        }

        const id = document.getElementById('vendor-id').value;
        const companyName = document.getElementById('vendor-company').value.trim();
        const address = document.getElementById('vendor-address').value.trim();
        const tagsInput = document.getElementById('vendor-tags').value.trim();
        const brandsInput = document.getElementById('vendor-brands').value.trim();
        const notesValue = document.getElementById('vendor-notes').value.trim();

        if (!companyName) {
            await app.alert('公司名稱為必填欄位。');
            return;
        }

        const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
        const brands = brandsInput ? brandsInput.split(',').map(b => b.trim()).filter(b => b) : [];

        // 取得主要聯絡人做相容儲存
        const primaryContact = tempContacts.find(c => c.isPrimary) || tempContacts[0] || { name: '', phone: '', email: '', title: '' };

        const vendorData = {
            companyName,
            contactName: primaryContact.name,
            phone: primaryContact.phone,
            email: primaryContact.email,
            address,
            tags,
            brands,
            contacts: tempContacts,
            visits: tempVisits, // 寫入拜訪歷史
            notes: notesValue,
            cardImage: tempCardImages[0] || null,
            cardImages: tempCardImages,
            updatedAt: Date.now()
        };

        try {
            if (id) {
                vendorData.id = parseInt(id, 10);
                const original = await db.getById('vendors', vendorData.id);
                vendorData.createdAt = original.createdAt;
                await db.put('vendors', vendorData);
                app.showToast('廠商資料已更新', 'success');
            } else {
                vendorData.createdAt = Date.now();
                await db.add('vendors', vendorData);
                app.showToast('成功新增廠商', 'success');
            }
            closeModal();
            await render();
        } catch (error) {
            console.error(error);
            app.showToast('儲存廠商資料失敗', 'error');
        }
    };

    /**
     * 同步拜訪管理區之聯絡人下拉選單
     */
    /**
     * 獲取去重後的拜訪次數 (以不同的日期作為一次拜訪)
     */
    const getUniqueVisitCount = (visits) => {
        if (!visits || visits.length === 0) return 0;
        const dates = new Set(visits.map(vt => vt.date));
        return dates.size;
    };

    /**
     * 渲染來訪紀錄多選 Checkboxes 清單
     */
    const renderVisitContactCheckboxes = () => {
        const container = document.getElementById('visit-contacts-checkboxes');
        if (!container) return;

        let html = '';
        tempContacts.forEach((c, idx) => {
            if (c.name.trim()) {
                html += `
                    <label class="visit-chk-label">
                        <input type="checkbox" name="visit-contact-check" value="${escapeHtml(c.name)}">
                        <span>${escapeHtml(c.name)} ${c.title ? `<span style="opacity: 0.6; font-size:0.72rem;">(${escapeHtml(c.title)})</span>` : ''}</span>
                    </label>
                `;
            }
        });

        // 加上「其他」checkbox
        html += `
            <label class="visit-chk-label">
                <input type="checkbox" id="visit-contact-check-custom" onchange="vendors.toggleCustomVisitContact(this.checked)">
                <span>其他人員</span>
            </label>
        `;

        container.innerHTML = html;
        
        // 預設將「其他」手動輸入框隱藏並重置
        const customWrap = document.getElementById('visit-custom-contact-wrap');
        if (customWrap) customWrap.style.display = 'none';
        const customInput = document.getElementById('visit-input-custom-contact');
        if (customInput) customInput.value = '';
    };

    /**
     * 控制手動輸入其他人員輸入框之顯示隱藏
     */
    const toggleCustomVisitContact = (checked) => {
        const wrap = document.getElementById('visit-custom-contact-wrap');
        if (wrap) {
            wrap.style.display = checked ? 'block' : 'none';
            if (checked) {
                document.getElementById('visit-input-custom-contact').focus();
            }
        }
    };

    /**
     * 渲染編輯 Modal 內部的拜訪紀錄與輸入連動
     */
    const renderVisitInputsAndHistory = () => {
        renderVisitContactCheckboxes();

        const list = document.getElementById('visit-history-list');
        if (!list) return;

        if (tempVisits.length === 0) {
            list.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted); padding: 6px 0;">尚無拜訪紀錄</div>';
            return;
        }

        // 照來訪日期降序排序，若日期相同則照 ID 降序
        tempVisits.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

        let html = '<div class="visit-timeline">';
        tempVisits.forEach(vt => {
            html += `
                <div class="visit-timeline-item">
                    <div class="visit-timeline-header">
                        <div class="visit-timeline-meta">
                            <span class="visit-timeline-date">${escapeHtml(vt.date)}</span>
                            <span>${escapeHtml(vt.contactName)}</span>
                        </div>
                        <button type="button" class="btn-delete-visit" onclick="vendors.deleteVisitRecord(${vt.id})" title="刪除此紀錄">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                    <div class="visit-timeline-purpose">${escapeHtml(vt.purpose)}</div>
                </div>
            `;
        });
        html += '</div>';
        list.innerHTML = html;
    };

    /**
     * 新增拜訪紀錄到 tempVisits (勾選多名人員合併為單一拜訪事件)
     */
    const addVisitRecord = () => {
        const dateInput = document.getElementById('visit-input-date');
        const purposeInput = document.getElementById('visit-input-purpose');

        if (!dateInput || !purposeInput) return;

        const date = dateInput.value;
        const purpose = purposeInput.value.trim() || '無記錄';

        if (!date) {
            app.showToast('請選擇來訪日期', 'warning');
            return;
        }

        // 收集勾選的聯絡人
        const checkedNames = [];
        const checkboxes = document.querySelectorAll('input[name="visit-contact-check"]:checked');
        checkboxes.forEach(cb => {
            checkedNames.push(cb.value);
        });

        // 檢查是否勾選其他
        const customChk = document.getElementById('visit-contact-check-custom');
        if (customChk && customChk.checked) {
            const customInput = document.getElementById('visit-input-custom-contact');
            const customVal = customInput ? customInput.value.trim() : '';
            if (customVal) {
                checkedNames.push(customVal);
            } else {
                checkedNames.push('外部人員');
            }
        }

        if (checkedNames.length === 0) {
            app.showToast('請至少勾選一位來訪聯絡人', 'warning');
            return;
        }

        const contactName = checkedNames.join(', ');

        tempVisits.push({
            id: Date.now(),
            date,
            contactName,
            purpose
        });

        // 重置事由、勾選與手動輸入框
        purposeInput.value = '';
        const allChecks = document.querySelectorAll('input[name="visit-contact-check"], #visit-contact-check-custom');
        allChecks.forEach(cb => cb.checked = false);
        
        const customWrap = document.getElementById('visit-custom-contact-wrap');
        if (customWrap) customWrap.style.display = 'none';
        const customInput = document.getElementById('visit-input-custom-contact');
        if (customInput) customInput.value = '';

        renderVisitInputsAndHistory();
        app.showToast('拜訪紀錄已暫存 (儲存廠商後才會寫入)', 'info');
    };

    /**
     * 自暫存中刪除拜訪紀錄
     */
    const deleteVisitRecord = (id) => {
        tempVisits = tempVisits.filter(v => v.id !== id);
        renderVisitInputsAndHistory();
    };

    /**
     * 主畫面免進入編輯 Modal 的拜訪歷史快速檢視
     */
    const showQuickVisitHistory = async (vendorId) => {
        try {
            const v = await db.getById('vendors', vendorId);
            if (!v) return;

            document.getElementById('quick-visit-company-name').textContent = v.companyName;
            
            const visitsList = v.visits || [];
            const uniqueCount = getUniqueVisitCount(visitsList);
            document.getElementById('quick-visit-stats').textContent = `共來訪 ${uniqueCount} 次`;

            const container = document.getElementById('quick-visit-timeline-container');
            if (visitsList.length === 0) {
                container.innerHTML = '<div style="font-size:0.9rem; color:var(--text-muted); text-align:center; padding: 20px 0;">目前尚無來訪紀錄。</div>';
            } else {
                // 照日期降序
                visitsList.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
                
                let html = '<div class="visit-timeline" style="margin-left: 5px;">';
                visitsList.forEach(vt => {
                    html += `
                        <div class="visit-timeline-item">
                            <div class="visit-timeline-header">
                                <div class="visit-timeline-meta" style="font-weight:600; color:var(--text-primary);">
                                    <span class="visit-timeline-date" style="font-family:Consolas; color:var(--text-muted); margin-right:8px;">${escapeHtml(vt.date)}</span>
                                    <span>${escapeHtml(vt.contactName)}</span>
                                </div>
                            </div>
                            <div class="visit-timeline-purpose" style="font-size:0.85rem; color:var(--text-secondary); margin-top:4px; line-height:1.4;">${escapeHtml(vt.purpose)}</div>
                        </div>
                    `;
                });
                html += '</div>';
                container.innerHTML = html;
            }

            document.getElementById('quick-visit-modal').classList.add('active');
        } catch (err) {
            console.error(err);
            app.showToast('讀取拜訪紀錄失敗', 'error');
        }
    };

    const closeQuickVisitModal = () => {
        document.getElementById('quick-visit-modal').classList.remove('active');
    };


    const deleteVendor = async (id) => {
        if (await app.confirm('確定要刪除這家廠商的所有資料嗎？刪除後將無法還原。')) {
            try {
                await db.remove('vendors', id);
                app.showToast('廠商資料已刪除', 'info');
                await render();
            } catch (error) {
                console.error(error);
                app.showToast('刪除廠商失敗', 'error');
            }
        }
    };

    // 點擊列表的「名片照片」預覽
    const previewCardPhoto = async (id) => {
        try {
            const v = await db.getById('vendors', id);
            // 優先讀取新版 cardImages 陣列，若無則讀取舊版單圖 cardImage
            const imgs = v.cardImages && v.cardImages.length > 0 ? v.cardImages : (v.cardImage ? [v.cardImage] : []);
            if (imgs.length > 0) {
                app.openLightbox(imgs, 0);
            } else {
                app.showToast('該廠商無照片備份', 'warning');
            }
        } catch (err) {
            console.error(err);
        }
    };

    /* ----------------- 智慧名片掃描器 Modal 邏輯 ----------------- */

    const switchScanMode = (mode) => {
        const tabCamera = document.getElementById('scan-tab-camera');
        const tabUpload = document.getElementById('scan-tab-upload');
        const cameraView = document.getElementById('camera-view-container');
        const fileUploader = document.getElementById('ocr-file-uploader');

        if (mode === 'camera') {
            tabCamera.classList.add('active');
            tabUpload.classList.remove('active');
            cameraView.style.display = 'block';
            fileUploader.style.display = 'none';
            startCamera();
        } else {
            tabUpload.classList.add('active');
            tabCamera.classList.remove('active');
            cameraView.style.display = 'none';
            fileUploader.style.display = 'flex';
            stopCamera();
        }
    };

    const openScanModal = () => {
        const modal = document.getElementById('scan-modal');
        modal.classList.add('active');
        
        // 初始化掃描 Modal 內容
        tempCardImageBase64 = null;
        activeOcrTextLine = '';
        
        document.getElementById('scan-fill-company').value = '';
        document.getElementById('scan-fill-contact').value = '';
        document.getElementById('scan-fill-phone').value = '';
        document.getElementById('scan-fill-email').value = '';
        document.getElementById('scan-fill-address').value = '';
        
        document.getElementById('ocr-parsed-lines-list').innerHTML = `
            <div class="empty-text-tip">尚未取得辨識文字。請拍照或上傳圖片。</div>
        `;
        document.getElementById('scan-save-btn').disabled = true;

        // 還原上傳提示與預覽狀態
        document.getElementById('ocr-file-preview-img').style.display = 'none';
        document.getElementById('ocr-file-preview-img').src = '';
        document.getElementById('ocr-file-upload-prompt').style.display = 'flex';
        document.getElementById('ocr-threshold-control').style.display = 'none';

        // 預設切換為相機模式
        switchScanMode('camera');
    };

    // 緩存處理完的黑白 Base64 用以送給 OCR
    let binaryImageBase64 = null;

    /**
     * 計算大津二值化閥值並將預覽與 Slider 初始化
     */
    const handleImageLoadedForOcr = (dataUrl) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // 為了效能，縮小尺寸計算大津閥值
            const maxW = 600;
            let w = img.width;
            let h = img.height;
            if (w > maxW) {
                h = Math.floor(h * (maxW / w));
                w = maxW;
            }
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(img, 0, 0, w, h);
            
            const imgData = ctx.getImageData(0, 0, w, h);
            const data = imgData.data;
            
            // 統計直方圖
            const histogram = new Array(256).fill(0);
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
                histogram[gray]++;
            }
            
            // 大津演算法 OTSU
            const totalPixels = w * h;
            let sum = 0;
            for (let i = 0; i < 256; i++) sum += i * histogram[i];
            
            let sumB = 0;
            let wB = 0;
            let wF = 0;
            let maxVariance = 0;
            let threshold = 128; // 預設值
            
            for (let i = 0; i < 256; i++) {
                wB += histogram[i];
                if (wB === 0) continue;
                wF = totalPixels - wB;
                if (wF === 0) break;
                
                sumB += i * histogram[i];
                const mB = sumB / wB;
                const mF = (sum - sumB) / wF;
                
                const variance = wB * wF * (mB - mF) * (mB - mF);
                if (variance > maxVariance) {
                    maxVariance = variance;
                    threshold = i;
                }
            }

            // 初始化 Slider 數值
            const slider = document.getElementById('ocr-threshold-slider');
            slider.value = threshold;
            document.getElementById('threshold-value-display').textContent = `自動 (${threshold})`;
            document.getElementById('ocr-threshold-control').style.display = 'block';

            // 執行並顯示二值化預覽，這會更新 binaryImageBase64
            updateBinarizationPreview(threshold, () => {
                // 自動二值化圖更新完後，直接跑第一次 OCR
                if (binaryImageBase64) {
                    runOcrRecognize(binaryImageBase64);
                }
            });
        };
        img.src = dataUrl;
    };

    /**
     * 依據閥值，對 tempCardImageBase64 進行二值化並更新預覽圖
     */
    const updateBinarizationPreview = (threshold, callback = null) => {
        if (!tempCardImageBase64) return;

        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // 使用較高解析度 (但限制最大寬度 1200px) 來進行 OCR 辨識，兼顧清晰度與辨識效能
            const maxW = 1200;
            let w = img.width;
            let h = img.height;
            if (w > maxW) {
                h = Math.floor(h * (maxW / w));
                w = maxW;
            }
            
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(img, 0, 0, w, h);
            
            const imgData = ctx.getImageData(0, 0, w, h);
            const data = imgData.data;
            
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                const binary = (gray < threshold) ? 0 : 255;
                data[i] = binary;
                data[i + 1] = binary;
                data[i + 2] = binary;
            }
            ctx.putImageData(imgData, 0, 0);
            
            const binaryUrl = canvas.toDataURL('image/jpeg', 0.95);
            binaryImageBase64 = binaryUrl;
            
            // 更新預覽圖為黑白二值化圖
            document.getElementById('ocr-file-preview-img').src = binaryUrl;
            
            if (callback) callback();
        };
        img.src = tempCardImageBase64;
    };

    /**
     * 使用指定閥值進行重新辨識
     */
    const triggerOcrWithThreshold = (threshold) => {
        if (!binaryImageBase64) return;
        runOcrRecognize(binaryImageBase64);
    };

    const closeScanModal = () => {
        stopCamera();
        document.getElementById('scan-modal').classList.remove('active');
    };

    /**
     * 啟動鏡頭串流 (WebRTC)
     */
    const startCamera = async () => {
        const cameraView = document.getElementById('camera-view-container');
        const fileUploader = document.getElementById('ocr-file-uploader');
        const video = document.getElementById('camera-stream');

        // 先停止舊的相機串流
        stopCamera();

        // 偵測是否支援相機
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn('WebRTC camera not supported in this browser.');
            fileUploader.style.display = 'flex';
            cameraView.style.display = 'none';
            return;
        }

        // 行動端優先使用 environment，電腦端自動降級為 user
        const constraints = {
            video: {
                facingMode: currentFacingMode,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        };

        try {
            streamInstance = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = streamInstance;
            cameraView.style.display = 'block';
            fileUploader.style.display = 'none';
        } catch (error) {
            console.warn('Failed to start camera with mode ' + currentFacingMode + ':', error);
            if (currentFacingMode === 'environment') {
                // 如果後鏡頭失敗，嘗試前置鏡頭
                currentFacingMode = 'user';
                startCamera();
            } else {
                // 完全開不起來相機，自動切換到上傳模式
                switchScanMode('upload');
            }
        }
    };

    /**
     * 停止鏡頭
     */
    const stopCamera = () => {
        if (streamInstance) {
            streamInstance.getTracks().forEach(track => track.stop());
            streamInstance = null;
        }
        const video = document.getElementById('camera-stream');
        if (video) video.srcObject = null;
    };

    /**
     * 切換鏡頭方向
     */
    const toggleCamera = () => {
        currentFacingMode = (currentFacingMode === 'environment') ? 'user' : 'environment';
        startCamera();
    };

    /**
     * 拍照擷取圖片
     */
    const capturePhoto = () => {
        const video = document.getElementById('camera-stream');
        const canvas = document.getElementById('camera-canvas');
        
        if (!streamInstance) return;

        const ctx = canvas.getContext('2d');
        // 設定 canvas 尺寸與 video 的解析度一致
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // 繪製畫面到 canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // 轉換為 Base64 JPG
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        tempCardImageBase64 = dataUrl;

        // 停止相機
        stopCamera();
        
        // 隱藏相機畫面，改為顯示處理中，切換 Tab 至上傳
        const tabCamera = document.getElementById('scan-tab-camera');
        const tabUpload = document.getElementById('scan-tab-upload');
        tabUpload.classList.add('active');
        tabCamera.classList.remove('active');

        document.getElementById('camera-view-container').style.display = 'none';
        
        const fileUploader = document.getElementById('ocr-file-uploader');
        fileUploader.style.display = 'flex';

        const previewImg = document.getElementById('ocr-file-preview-img');
        const promptText = document.getElementById('ocr-file-upload-prompt');
        previewImg.src = dataUrl;
        previewImg.style.display = 'block';
        promptText.style.display = 'none';

        // 開始進行影像預處理與二值化
        handleImageLoadedForOcr(dataUrl);
    };

    /**
     * 處理從檔案上傳或拖曳的圖片
     */
    const processUploadedFile = (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            tempCardImageBase64 = dataUrl;

            // 隱藏相機，呈現圖片
            stopCamera();
            document.getElementById('camera-view-container').style.display = 'none';
            
            const fileUploader = document.getElementById('ocr-file-uploader');
            fileUploader.style.display = 'flex';
            
            const previewImg = document.getElementById('ocr-file-preview-img');
            const promptText = document.getElementById('ocr-file-upload-prompt');
            previewImg.src = dataUrl;
            previewImg.style.display = 'block';
            promptText.style.display = 'none';

            // 開始進行影像預處理與二值化
            handleImageLoadedForOcr(dataUrl);
        };
        reader.readAsDataURL(file);
    };

    /**
     * 呼叫 Tesseract.js 進行 OCR 辨識
     */
    const runOcrRecognize = async (imageBase64) => {
        const statusOverlay = document.getElementById('ocr-status-overlay');
        const statusText = document.getElementById('ocr-status-text');
        
        statusOverlay.style.display = 'flex';
        statusText.textContent = '載入辨識引擎中...';

        try {
            // 使用 chi_tra (繁體中文) + eng (英文)
            const result = await Tesseract.recognize(
                imageBase64,
                'chi_tra+eng',
                {
                    logger: (m) => {
                        if (m.status === 'recognizing') {
                            const pct = Math.floor(m.progress * 100);
                            statusText.textContent = `文字辨識中... ${pct}%`;
                        }
                    }
                }
            );

            const rawText = result.data.text;
            console.log('OCR Raw Output:\n', rawText);

            // 關閉等待遮罩
            statusOverlay.style.display = 'none';

            // 處理辨識後的文字行
            processOcrTextLines(rawText);

        } catch (error) {
            console.error('OCR Error:', error);
            statusOverlay.style.display = 'none';
            await app.alert('名片辨識過程中發生錯誤，請改用手動填入。');
        }
    };

    /**
     * 解析 OCR 辨識的全部文字，做正則過濾並列表呈現
     */
    const processOcrTextLines = (text) => {
        const linesListContainer = document.getElementById('ocr-parsed-lines-list');
        const scanSaveBtn = document.getElementById('scan-save-btn');
        
        // 依換行符拆分，並過濾掉純空白行
        const lines = text.split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 1); // 過濾掉極短或雜訊行

        if (lines.length === 0) {
            linesListContainer.innerHTML = `<div class="empty-text-tip" style="color:var(--color-danger)">未能辨識出有效文字，請試著重新拍照或手動輸入。</div>`;
            return;
        }

        // 渲染點選文字行與快捷填入按鈕
        let linesHtml = '';
        lines.forEach((line, index) => {
            const escapedLine = escapeJsString(line);
            linesHtml += `
                <div class="ocr-line-item-group" style="display: flex; flex-direction: column; gap: 4px; padding: 10px; background: rgba(255,255,255,0.02); border: 1px solid var(--panel-border); border-radius: var(--border-radius-sm); margin-bottom: 8px;">
                    <div style="font-size: 0.85rem; color: var(--text-primary); font-weight: 555; word-break: break-all;">${escapeHtml(line)}</div>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px;">
                        <button type="button" class="btn btn-secondary" onclick="vendors.quickFillOcr(\`${escapedLine}\`, 'company')" style="padding: 2px 6px; font-size: 0.7rem; height: auto; width: auto; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3); color: #a5b4fc; border-radius: 4px;">公司</button>
                        <button type="button" class="btn btn-secondary" onclick="vendors.quickFillOcr(\`${escapedLine}\`, 'contact')" style="padding: 2px 6px; font-size: 0.7rem; height: auto; width: auto; background: rgba(20,184,166,0.15); border: 1px solid rgba(20,184,166,0.3); color: #99f6e4; border-radius: 4px;">姓名</button>
                        <button type="button" class="btn btn-secondary" onclick="vendors.quickFillOcr(\`${escapedLine}\`, 'phone')" style="padding: 2px 6px; font-size: 0.7rem; height: auto; width: auto; background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.3); color: #fde047; border-radius: 4px;">電話</button>
                        <button type="button" class="btn btn-secondary" onclick="vendors.quickFillOcr(\`${escapedLine}\`, 'email')" style="padding: 2px 6px; font-size: 0.7rem; height: auto; width: auto; background: rgba(56,189,248,0.15); border: 1px solid rgba(56,189,248,0.3); color: #38bdf8; border-radius: 4px;">信箱</button>
                        <button type="button" class="btn btn-secondary" onclick="vendors.quickFillOcr(\`${escapedLine}\`, 'address')" style="padding: 2px 6px; font-size: 0.7rem; height: auto; width: auto; background: rgba(168,85,247,0.15); border: 1px solid rgba(168,85,247,0.3); color: #c084fc; border-radius: 4px;">地址</button>
                    </div>
                </div>
            `;
        });
        linesListContainer.innerHTML = linesHtml;

        // --- 啟用智能正規表達式 (Regex) 解析欄位 ---
        
        // 1. 解析 Email
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i;
        const foundEmails = text.match(emailRegex);
        if (foundEmails) {
            document.getElementById('scan-fill-email').value = foundEmails[0];
        }

        // 2. 解析 電話/手機
        // 比對台灣手機號碼 (09xxxxxxxx, 09xx-xxx-xxx) 與市話 (0x-xxxxxxx, 0x-xxxxxxxx)
        const phoneRegex = /(09\d{2}[-\s]?\d{3}[-\s]?\d{3})|(0\d{1,3}[-\s]?\d{3,4}[-\s]?\d{4})|(\+886[-\s]?\d[-\s]?\d{3,4}[-\s]?\d{4})/g;
        const foundPhones = text.match(phoneRegex);
        if (foundPhones && foundPhones.length > 0) {
            // 清理多餘空白並填入第一個找到的電話
            document.getElementById('scan-fill-phone').value = foundPhones[0].trim();
        }

        // 3. 解析 地址
        // 尋找包含「縣、市、區、鄉、鎮、路、街、巷、弄、號、樓」的行
        const addressLine = lines.find(l => 
            /([省縣市][市區鄉鎮])/.test(l) || 
            /([路街鄰巷弄號樓])/.test(l)
        );
        if (addressLine) {
            document.getElementById('scan-fill-address').value = addressLine;
        }

        // 啟用「確認匯入」按鈕
        scanSaveBtn.disabled = false;
    };

    /**
     * 點擊名片辨識文字列下方的快捷按鈕，直接將文字填入目標欄位
     */
    const quickFillOcr = (text, field) => {
        const targetInput = document.getElementById(`scan-fill-${field}`);
        if (targetInput) {
            targetInput.value = text;
            app.showToast(`已填入 ${field === 'company' ? '公司名稱' : field === 'contact' ? '聯絡人姓名' : field === 'phone' ? '電話/手機' : field === 'email' ? '電子信箱' : '公司地址'} 欄位`, 'success');
        }
    };

    /**
     * 提供給名片辨識文字按鈕點選時呼叫
     */
    const selectOcrLine = (text, btnId) => {
        activeOcrTextLine = text;

        // 清除其他按鈕的選取狀態樣式
        const btns = document.querySelectorAll('.ocr-line-btn');
        btns.forEach(b => b.classList.remove('clicked-indicator'));

        // 讓當前按鈕高亮
        const activeBtn = document.getElementById(btnId);
        if (activeBtn) {
            activeBtn.classList.add('clicked-indicator');
        }

        // 提示使用者點選欄位旁的填入按鈕
        const fillTargetBtns = document.querySelectorAll('.btn-fill-target');
        fillTargetBtns.forEach(b => b.classList.add('target-active'));
        
        // 3秒後自動消掉高亮指引
        setTimeout(() => {
            fillTargetBtns.forEach(b => b.classList.remove('target-active'));
        }, 3000);
    };

    /**
     * 點擊輸入欄位旁的按鈕，將選中的 OCR 文字帶入
     */
    const fillOcrTextToField = (field, buttonElement) => {
        if (!activeOcrTextLine) {
            app.showToast('請先在左側名片文字行中，點選您想要填入的文字。', 'warning');
            return;
        }

        const targetInput = document.getElementById(`scan-fill-${field}`);
        if (targetInput) {
            targetInput.value = activeOcrTextLine;
            app.showToast(`已填入 ${field} 欄位`, 'success');
            
            // 填完後清除目前選取，免得重複點到
            activeOcrTextLine = '';
            const btns = document.querySelectorAll('.ocr-line-btn');
            btns.forEach(b => b.classList.remove('clicked-indicator'));
        }
    };

    /**
     * 將掃描視窗中填好的廠商資料寫入資料庫
     */
    const saveOcrImportedVendor = async () => {
        const companyName = document.getElementById('scan-fill-company').value.trim();
        const contactName = document.getElementById('scan-fill-contact').value.trim();
        const phone = document.getElementById('scan-fill-phone').value.trim();
        const email = document.getElementById('scan-fill-email').value.trim();
        const address = document.getElementById('scan-fill-address').value.trim();

        if (!companyName) {
            await app.alert('「公司名稱」為必填欄位。請點選或輸入公司名稱。');
            return;
        }

        const newVendor = {
            companyName,
            contactName,
            phone,
            email,
            address,
            tags: ['掃描匯入'], // 預設加上一個標籤以便識別
            notes: '透過名片掃描自動匯入。',
            cardImage: tempCardImageBase64,                // 相容單圖欄位
            cardImages: tempCardImageBase64 ? [tempCardImageBase64] : [], // 多圖陣列初始化為單張
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        try {
            await db.add('vendors', newVendor);
            app.showToast('名片資料已成功匯入為新廠商', 'success');
            closeScanModal();
            await render();
        } catch (error) {
            console.error(error);
            app.showToast('匯入廠商失敗', 'error');
        }
    };

    /**
     * 關閉分享名片 Modal
     */
    const closeShareModal = () => {
        const modal = document.getElementById('vendor-share-modal');
        if (!modal) return;
        modal.querySelector('.modal').style.transform = 'scale(0.95)';
        modal.classList.remove('active');
        currentShareVendor = null;
        shareCanvasInstance = null;
    };

    /**
     * 下載分享名片圖片
     */
    const downloadShareCard = () => {
        if (!shareCanvasInstance || !currentShareVendor) {
            app.showToast('無法下載，圖片尚未生成完畢', 'warning');
            return;
        }

        try {
            const dataUrl = shareCanvasInstance.toDataURL('image/png');
            const link = document.createElement('a');
            const fileName = `${currentShareVendor.companyName || '廠商'}_名片分享拼圖.png`;
            link.download = fileName;
            link.href = dataUrl;
            link.click();
            app.showToast('圖片下載成功！', 'success');
        } catch (err) {
            console.error('Download card error:', err);
            app.showToast('下載失敗，請嘗試手動長按圖片儲存', 'error');
        }
    };

    /**
     * 產生並渲染 HTML5 Canvas 拼圖分享名片
     */
    const generateShareCard = async (vendorId) => {
        const vendor = vendorsList.find(v => v.id === vendorId);
        if (!vendor) return;

        currentShareVendor = vendor;

        const modal = document.getElementById('vendor-share-modal');
        const container = document.getElementById('vendor-share-canvas-container');
        if (!modal || !container) return;

        container.innerHTML = `
            <div style="padding: 40px; text-align: center; color: var(--text-secondary);">
                <i class="fa-solid fa-spinner fa-spin fa-2x" style="color: var(--color-primary);"></i>
                <p style="margin-top: 12px; font-size: 0.85rem;">名片拼圖生成中...</p>
            </div>
        `;
        modal.classList.add('active');
        setTimeout(() => {
            modal.querySelector('.modal').style.transform = 'scale(1)';
        }, 10);

        try {
            // 創建離屏 Canvas
            const canvas = document.createElement('canvas');
            canvas.width = 800;
            canvas.height = 1000;
            const ctx = canvas.getContext('2d');

            // 1. 繪製背景：深藍紫色極光漸層
            const grad = ctx.createLinearGradient(0, 0, 0, 1000);
            grad.addColorStop(0, '#0f172a');
            grad.addColorStop(1, '#1e1b4b');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 800, 1000);

            // 繪製背景微光光暈 (裝飾性)
            ctx.beginPath();
            ctx.arc(100, 150, 200, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(99, 102, 241, 0.08)';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(700, 850, 250, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(20, 184, 166, 0.06)';
            ctx.fill();

            // 繪製邊框
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 1;
            ctx.strokeRect(20, 20, 760, 960);

            // 2. 標頭文字
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.font = '14px "Segoe UI", system-ui, sans-serif';
            ctx.fillText('MY NOTEBOOK • 廠商聯絡分享卡', 50, 60);

            // 3. 繪製公司名稱
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 36px "Segoe UI", system-ui, sans-serif';
            ctx.fillText(vendor.companyName, 50, 115);

            // 橫線分割線
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(50, 140);
            ctx.lineTo(750, 140);
            ctx.stroke();

            // 4. 聯絡人主體
            const primaryContact = (vendor.contacts && vendor.contacts.find(c => c.isPrimary)) || {
                name: vendor.contactName || '未指定聯絡人',
                title: '代表',
                phone: vendor.phone || '',
                email: vendor.email || ''
            };

            ctx.fillStyle = '#818cf8'; // 亮紫色
            ctx.font = 'bold 24px "Segoe UI", system-ui, sans-serif';
            ctx.fillText(primaryContact.name, 50, 190);
            
            if (primaryContact.title) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
                ctx.font = '18px "Segoe UI", system-ui, sans-serif';
                ctx.fillText(` (${primaryContact.title})`, 50 + ctx.measureText(primaryContact.name).width + 5, 190);
            }

            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.font = '18px "Segoe UI", system-ui, sans-serif';
            let infoY = 230;

            if (primaryContact.phone) {
                ctx.fillText(`📞 電話: ${primaryContact.phone}`, 50, infoY);
                infoY += 32;
            }
            if (primaryContact.email) {
                ctx.fillText(`✉️ 信箱: ${primaryContact.email}`, 50, infoY);
                infoY += 32;
            }
            if (vendor.address) {
                ctx.fillText(`📍 地址: ${vendor.address}`, 50, infoY);
                infoY += 32;
            }

            // 5. 繪製代理品牌及經營標籤
            let tagX = 50;
            let tagY = infoY + 12;
            ctx.font = '14px "Segoe UI", system-ui, sans-serif';
            
            const allBadges = [];
            if (vendor.brands) vendor.brands.forEach(b => allBadges.push({ text: b, type: 'brand' }));
            if (vendor.tags) vendor.tags.forEach(t => allBadges.push({ text: t, type: 'tag' }));

            allBadges.slice(0, 10).forEach(badge => {
                const badgeText = badge.type === 'brand' ? `🔧 ${badge.text}` : `#${badge.text}`;
                const badgeWidth = ctx.measureText(badgeText).width + 20;

                if (tagX + badgeWidth > 750) {
                    tagX = 50;
                    tagY += 34;
                }

                ctx.fillStyle = badge.type === 'brand' ? 'rgba(99, 102, 241, 0.18)' : 'rgba(20, 184, 166, 0.18)';
                ctx.strokeStyle = badge.type === 'brand' ? 'rgba(99, 102, 241, 0.35)' : 'rgba(20, 184, 166, 0.35)';
                ctx.lineWidth = 1;
                
                ctx.beginPath();
                ctx.roundRect(tagX, tagY, badgeWidth, 24, 6);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = badge.type === 'brand' ? '#a5b4fc' : '#99f6e4';
                ctx.fillText(badgeText, tagX + 10, tagY + 17);

                tagX += badgeWidth + 8;
            });

            // 6. 繪製名片照片拼圖
            const cardImages = [];
            if (vendor.cardImage) cardImages.push(vendor.cardImage);
            if (vendor.cardImages) {
                vendor.cardImages.forEach(img => {
                    if (img && img !== vendor.cardImage) cardImages.push(img);
                });
            }

            const imgLoadPromises = cardImages.slice(0, 2).map(base64 => {
                return new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = () => resolve(null);
                    img.src = base64;
                });
            });

            const loadedImages = await Promise.all(imgLoadPromises);
            const activeImages = loadedImages.filter(img => img !== null);

            // 卡片容器的外層卡槽
            ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(40, 520, 720, 420, 12);
            ctx.fill();
            ctx.stroke();

            if (activeImages.length === 1) {
                // 單張名片：置中拉伸適配
                const img = activeImages[0];
                const maxW = 680;
                const maxH = 380;
                let w = img.width;
                let h = img.height;
                const ratio = Math.min(maxW / w, maxH / h);
                w = w * ratio;
                h = h * ratio;
                const x = (800 - w) / 2;
                const y = 540 + (380 - h) / 2;

                ctx.drawImage(img, x, y, w, h);
            } else if (activeImages.length >= 2) {
                // 兩張名片：左右並排 (正面與背面)
                const maxW = 320;
                const maxH = 260;

                // 左圖
                const img1 = activeImages[0];
                let w1 = img1.width;
                let h1 = img1.height;
                const ratio1 = Math.min(maxW / w1, maxH / h1);
                w1 = w1 * ratio1;
                h1 = h1 * ratio1;
                const x1 = 60 + (320 - w1) / 2;
                const y1 = 610 + (260 - h1) / 2;
                ctx.drawImage(img1, x1, y1, w1, h1);

                ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
                ctx.font = 'bold 15px "Segoe UI", system-ui, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('📋 名片正面', 220, 570);

                // 右圖
                const img2 = activeImages[1];
                let w2 = img2.width;
                let h2 = img2.height;
                const ratio2 = Math.min(maxW / w2, maxH / h2);
                w2 = w2 * ratio2;
                h2 = h2 * ratio2;
                const x2 = 420 + (320 - w2) / 2;
                const y2 = 610 + (260 - h2) / 2;
                ctx.drawImage(img2, x2, y2, w2, h2);

                ctx.fillText('📋 名片背面', 580, 570);
                ctx.textAlign = 'left'; // 恢復靠左
            } else {
                // 無名片相片：繪製高質感數位排版裝飾圖
                ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                ctx.font = 'bold 96px "Font Awesome 6 Free"';
                ctx.textAlign = 'center';
                ctx.fillText('\uf2bb', 400, 710); // FontAwesome address-card
                
                ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
                ctx.font = '16px "Segoe UI", system-ui, sans-serif';
                ctx.fillText('數位名片聯絡檔案', 400, 765);
                ctx.textAlign = 'left';
            }

            shareCanvasInstance = canvas;

            // 輸出至 Modal 供預覽
            const previewImg = document.createElement('img');
            previewImg.src = canvas.toDataURL('image/png');
            previewImg.style.width = '100%';
            previewImg.style.height = 'auto';
            previewImg.style.borderRadius = 'var(--border-radius-sm)';
            previewImg.style.display = 'block';

            container.innerHTML = '';
            container.appendChild(previewImg);
        } catch (err) {
            console.error('Canvas generate share card error:', err);
            container.innerHTML = `<div style="padding:40px; text-align:center; color:var(--color-danger);"><i class="fa-solid fa-triangle-exclamation fa-2x"></i><p style="margin-top:10px;">名片生成失敗：${err.message}</p></div>`;
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

    // Helper: 避免 JS 字串注入
    const escapeJsString = (str) => {
        return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
    };

    return {
        init,
        render,
        openEditModal,
        closeModal,
        deleteVendor,
        previewCardPhoto,
        setTagFilter,
        selectOcrLine,
        quickFillOcr,
        setActivePreview,
        deleteThumbnail,
        updateContactField,
        setPrimaryContact,
        deleteContactRow,
        showQuickVisitHistory,
        closeQuickVisitModal,
        addVisitRecord,
        deleteVisitRecord,
        toggleCustomVisitContact,
        generateShareCard,
        closeShareModal,
        downloadShareCard
    };
})();

window.vendors = vendors;
