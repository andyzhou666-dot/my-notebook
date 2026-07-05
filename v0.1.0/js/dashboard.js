/**
 * dashboard.js - 工作數據儀表板與熱力圖邏輯
 */
const dashboard = (() => {
    let statusChart = null;
    let tagsChart = null;

    const init = async () => {
        await render();
    };

    /**
     * 讀取 IndexedDB 並渲染儀表板與熱力圖
     */
    const render = async () => {
        try {
            const allNotes = await db.getAll('notes');
            
            // 1. 渲染年度熱力圖
            renderHeatmap(allNotes);

            // 2. 渲染 Chart.js 統計圖表
            renderCharts(allNotes);
        } catch (err) {
            console.error('Render dashboard error:', err);
        }
    };

    /**
     * 獲取當前主題的顏色變數
     */
    const getThemeColors = () => {
        const bodyStyles = getComputedStyle(document.body);
        return {
            textPrimary: bodyStyles.getPropertyValue('--text-primary').trim() || '#f8fafc',
            textSecondary: bodyStyles.getPropertyValue('--text-secondary').trim() || '#94a3b8',
            panelBorder: bodyStyles.getPropertyValue('--panel-border').trim() || 'rgba(255, 255, 255, 0.06)',
            colorPrimary: bodyStyles.getPropertyValue('--color-primary').trim() || '#6366f1',
            colorSecondary: bodyStyles.getPropertyValue('--color-secondary').trim() || '#14b8a6'
        };
    };

    /**
     * 渲染年度工作日誌熱力圖 (GitHub 風格)
     */
    const renderHeatmap = (allNotes) => {
        const container = document.getElementById('heatmap-svg-container');
        if (!container) return;

        // 建立資料比對 Map: dateKey (YYYY-MM-DD) -> 當日成功的事項數 (Success count)
        const dateMap = {};
        allNotes.forEach(note => {
            let dateKey = note.date;
            if (!dateKey && note.createdAt) {
                dateKey = new Date(note.createdAt).toISOString().split('T')[0];
            }
            if (dateKey) {
                let successCount = 0;
                if (note.items) {
                    successCount = note.items.filter(item => item.status === 'success').length;
                } else if (note.content && note.content.includes('[x]')) {
                    successCount = 1;
                }
                dateMap[dateKey] = (dateMap[dateKey] || 0) + successCount;
            }
        });

        // 取得今日與一年前的日期 (對齊週日開始)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const startDate = new Date(today);
        startDate.setDate(today.getDate() - 364); // 52 週前
        const startDayOfWeek = startDate.getDay();
        startDate.setDate(startDate.getDate() - startDayOfWeek); // 往回移至該週週日

        const rectSize = 10;
        const rectSpacing = 2;
        const colWidth = rectSize + rectSpacing;   // 12px
        const rowHeight = rectSize + rectSpacing;  // 12px
        const labelWidth = 28;
        const monthLabelHeight = 16;

        let svgContent = '';
        const months = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
        let lastMonth = -1;

        // 繪製 53 列 (Weeks)
        for (let col = 0; col < 53; col++) {
            const colX = labelWidth + col * colWidth;
            let groupContent = '';

            for (let row = 0; row < 7; row++) {
                const dayOffset = col * 7 + row;
                const cellDate = new Date(startDate);
                cellDate.setDate(startDate.getDate() + dayOffset);

                // 超過今天的部分不渲染
                if (cellDate > today) {
                    continue;
                }

                const dateStr = cellDate.toISOString().split('T')[0];
                const count = dateMap[dateStr] || 0;

                // 決定顏色等級 (0次, 1-2次, 3-4次, 5-6次, 7次以上)
                let fill = 'rgba(120, 113, 108, 0.12)'; // 預設無事項 (輕暖灰，雙主題均合適)
                if (count > 0 && count <= 2) fill = '#c6e48b';
                else if (count > 2 && count <= 4) fill = '#7bc96f';
                else if (count > 4 && count <= 6) fill = '#239a3b';
                else if (count > 6) fill = '#196127';

                const cellY = monthLabelHeight + row * rowHeight;
                const formattedDate = dateStr.replace(/-/g, '/');

                groupContent += `
                    <rect 
                        x="${colX}" 
                        y="${cellY}" 
                        width="${rectSize}" 
                        height="${rectSize}" 
                        rx="2" 
                        ry="2" 
                        fill="${fill}" 
                        data-date="${dateStr}"
                        style="cursor: pointer; transition: filter 0.15s ease;"
                        onmouseover="this.setAttribute('filter', 'brightness(1.15)')"
                        onmouseout="this.removeAttribute('filter')"
                        onclick="dashboard.navigateToDate('${dateStr}')"
                    >
                        <title>${formattedDate}：已完成 ${count} 項工作</title>
                    </rect>
                `;

                // 渲染月份標籤 (只在每月的第 1 列繪製，且避免相鄰太擠)
                if (row === 0) {
                    const currentMonth = cellDate.getMonth();
                    if (currentMonth !== lastMonth && col < 51) {
                        svgContent += `<text x="${colX}" y="10" font-size="9" fill="var(--text-muted)" font-family="system-ui, sans-serif">${months[currentMonth]}</text>`;
                        lastMonth = currentMonth;
                    }
                }
            }
            svgContent += groupContent;
        }

        // 繪製左側星期指示
        const weekLabels = ['日', '二', '四', '六'];
        weekLabels.forEach((label, idx) => {
            const labelY = monthLabelHeight + (idx * 2) * rowHeight + 9;
            svgContent += `<text x="4" y="${labelY}" font-size="9" fill="var(--text-muted)" font-family="system-ui, sans-serif">${label}</text>`;
        });

        const totalWidth = labelWidth + 53 * colWidth;
        const totalHeight = monthLabelHeight + 7 * rowHeight + 6;

        container.innerHTML = `
            <svg width="100%" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}" style="max-width: ${totalWidth}px;">
                ${svgContent}
            </svg>
        `;
    };

    /**
     * 點擊熱力圖格子時，直接導航切換至該日期的工作日誌進行檢視/編輯
     */
    const navigateToDate = (dateStr) => {
        if (!dateStr) return;

        // 切換至日誌分頁
        app.switchTab('notes-section');

        // 將日誌日期選擇器切換至目標日期
        const datePicker = document.getElementById('log-date-picker');
        if (datePicker) {
            datePicker.value = dateStr;
            // 觸發 Change 事件載入草稿
            datePicker.dispatchEvent(new Event('change'));
        }
    };

    /**
     * 渲染近 30 天任務狀態佔比與專案工時標籤分析圖表 (Chart.js)
     */
    const renderCharts = (allNotes) => {
        destroyCharts();

        const colors = getThemeColors();

        // 篩選近 30 天的資料
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        const limitDate = new Date(today);
        limitDate.setDate(today.getDate() - 30);
        const limitDateStr = limitDate.toISOString().split('T')[0];

        const notesInLast30Days = allNotes.filter(note => {
            let dateKey = note.date;
            if (!dateKey && note.createdAt) {
                dateKey = new Date(note.createdAt).toISOString().split('T')[0];
            }
            return dateKey && dateKey >= limitDateStr;
        });

        // 1. 計算任務狀態佔比
        let successCount = 0;
        let todoCount = 0;
        let failedCount = 0;

        notesInLast30Days.forEach(note => {
            if (note.items) {
                note.items.forEach(item => {
                    if (item.status === 'success') successCount++;
                    else if (item.status === 'todo') todoCount++;
                    else if (item.status === 'failed') failedCount++;
                });
            } else if (note.content) {
                // 向下相容
                if (note.content.includes('[x]')) successCount++;
                else todoCount++;
            }
        });

        const totalTasks = successCount + todoCount + failedCount;

        // 2. 計算專案工時標籤佔比 (讀取項目文字中的 #標籤)
        const tagCounts = {};
        notesInLast30Days.forEach(note => {
            if (note.items) {
                note.items.forEach(item => {
                    const regex = /#([^\s#]+)/g;
                    let match;
                    const parsedTags = [];
                    while ((match = regex.exec(item.text)) !== null) {
                        parsedTags.push(match[1]);
                    }
                    // 過濾重複
                    const uniqueItemTags = [...new Set(parsedTags)];
                    uniqueItemTags.forEach(tag => {
                        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                    });
                });
            }
        });

        // 排序標籤並取前 5 大
        const sortedTags = Object.entries(tagCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        // --- 繪製近 30 天狀態圓餅圖 ---
        const statusCanvas = document.getElementById('task-status-chart');
        if (statusCanvas) {
            if (totalTasks === 0) {
                renderPlaceholderText(statusCanvas, '近 30 天無登入日誌數據', colors);
            } else {
                statusChart = new Chart(statusCanvas, {
                    type: 'doughnut',
                    data: {
                        labels: ['已完成 (Success)', '進行中 (Todo)', '遇阻/卡關 (Failed)'],
                        datasets: [{
                            data: [successCount, todoCount, failedCount],
                            backgroundColor: ['#10b981', '#38bdf8', '#f87171'],
                            borderWidth: 0
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: {
                                    color: colors.textSecondary,
                                    font: { family: 'system-ui', size: 11 }
                                }
                            }
                        }
                    }
                });
            }
        }

        // --- 繪製專案工時標籤橫向長條圖 ---
        const tagsCanvas = document.getElementById('project-tags-chart');
        if (tagsCanvas) {
            if (sortedTags.length === 0) {
                renderPlaceholderText(tagsCanvas, '未登錄任何事項標籤 (請使用 #標籤)', colors);
            } else {
                const labels = sortedTags.map(item => `#${item[0]}`);
                const data = sortedTags.map(item => item[1]);

                tagsChart = new Chart(tagsCanvas, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: '事項完成數',
                            data: data,
                            backgroundColor: colors.colorPrimary,
                            borderRadius: 4,
                            borderWidth: 0
                        }]
                    },
                    options: {
                        indexAxis: 'y', // 橫向排列
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false }
                        },
                        scales: {
                            x: {
                                grid: { color: colors.panelBorder },
                                ticks: { color: colors.textSecondary, stepSize: 1, precision: 0 }
                            },
                            y: {
                                grid: { display: false },
                                ticks: { color: colors.textSecondary }
                            }
                        }
                    }
                });
            }
        }
    };

    /**
     * 繪製 Canvas 佔位提示文字
     */
    const renderPlaceholderText = (canvas, text, colors) => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        ctx.clearRect(0, 0, rect.width, rect.height);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = colors.textSecondary;
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillText(text, rect.width / 2, rect.height / 2);
        ctx.restore();
    };

    /**
     * 銷毀舊圖表實體防止記憶體洩漏與渲染錯誤
     */
    const destroyCharts = () => {
        if (statusChart) {
            statusChart.destroy();
            statusChart = null;
        }
        if (tagsChart) {
            tagsChart.destroy();
            tagsChart = null;
        }
    };

    /**
     * 主題切換時，呼叫此函數重繪圖表以套用最新的文字與格線色彩
     */
    const updateTheme = async () => {
        const allNotes = await db.getAll('notes');
        renderCharts(allNotes);
    };

    return {
        init,
        render,
        navigateToDate,
        updateTheme
    };
})();

// 全域註冊，以便 app.js 呼叫
window.dashboard = dashboard;
