/**
 * tests.js - 系統自動化測試單元與整合測試
 * 執行方式：在瀏覽器網址後方加上 ?test=true 即可啟動測試，如：index.html?test=true
 */
const tests = (() => {
    const run = async () => {
        console.log('%c--- 開始執行系統自動化測試 ---', 'color: #6366f1; font-weight: bold; font-size: 1.2rem;');
        
        try {
            await testDatabase();
            testRegexParser();
            
            console.log('%c✔ 所有測試皆已通過！系統功能正常。', 'color: #10b981; font-weight: bold; font-size: 1.1rem;');
            app.showToast('✔ 系統自我測試全部通過！', 'success');
        } catch (error) {
            console.error('%c✘ 測試未通過，錯誤原因：', 'color: #ef4444; font-weight: bold;', error);
            app.showToast('✘ 系統自我測試失敗，請檢查主控台。', 'error');
        }
    };

    /**
     * 1. 測試資料庫 IndexedDB 的基本 CRUD 操作
     */
    const testDatabase = async () => {
        console.log('測試項 1：IndexedDB 基礎讀寫...');
        
        // 確保資料庫已初始化
        await db.init();

        // 測試新增筆記
        const testNote = {
            content: '測試筆記項目 #單元測試',
            tags: ['單元測試'],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        const noteId = await db.add('notes', testNote);
        if (!noteId) throw new Error('新增筆記失敗：未能取得回傳的 ID');
        console.log(' -> 新增筆記成功，ID:', noteId);

        // 測試取得筆記
        const retrieved = await db.getById('notes', noteId);
        if (!retrieved || retrieved.content !== testNote.content) {
            throw new Error('讀取筆記失敗：資料不一致');
        }
        console.log(' -> 讀取筆記比對成功');

        // 測試修改筆記
        retrieved.content = '修改後的測試筆記 #修改測試';
        retrieved.tags = ['修改測試'];
        await db.put('notes', retrieved);

        const updated = await db.getById('notes', noteId);
        if (!updated || updated.content !== '修改後的測試筆記 #修改測試') {
            throw new Error('修改筆記失敗：內容未更新');
        }
        console.log(' -> 修改筆記成功');

        // 測試刪除筆記
        await db.remove('notes', noteId);
        const deleted = await db.getById('notes', noteId);
        if (deleted) {
            throw new Error('刪除筆記失敗：項目依然存在於資料庫中');
        }
        console.log(' -> 刪除筆記成功');
    };

    /**
     * 2. 測試 Regex 解析名片欄位（Email、電話、地址）
     */
    const testRegexParser = () => {
        console.log('測試項 2：正則表達式欄位解析...');

        // 模擬 OCR 辨識出來的亂序文本
        const mockOcrText = `
            恆創精密工業股份有限公司
            經理 王大明
            行動電話：0912-345-678
            公司電話：(02)2345-6789
            傳真：02-2345-0000
            Email: service@hengchuang-tech.com
            網址：www.hengchuang-tech.com
            地址：台北市信義區信義路五段7號85樓
        `;

        // 模擬 Email 解析
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i;
        const emailMatch = mockOcrText.match(emailRegex);
        if (!emailMatch || emailMatch[0] !== 'service@hengchuang-tech.com') {
            throw new Error(`Email 解析錯誤，解析結果：${emailMatch ? emailMatch[0] : '無'}`);
        }
        console.log(' -> Email 正則解析成功:', emailMatch[0]);

        // 模擬 手機/電話 解析
        const phoneRegex = /(09\d{2}[-\s]?\d{3}[-\s]?\d{3})|(0\d{1,3}[-\s]?\d{3,4}[-\s]?\d{4})/g;
        const phoneMatches = mockOcrText.match(phoneRegex);
        if (!phoneMatches || !phoneMatches.some(p => p.trim() === '0912-345-678')) {
            throw new Error('手機號碼解析錯誤');
        }
        console.log(' -> 電話正則解析成功，找到的手機：', phoneMatches.find(p => p.includes('0912')));

        // 模擬地址解析
        const lines = mockOcrText.split('\n').map(l => l.trim());
        const addressLine = lines.find(l => 
            /([省縣市][市區鄉鎮])/.test(l) || 
            /([路街鄰巷弄號樓])/.test(l)
        );
        if (!addressLine || addressLine !== '地址：台北市信義區信義路五段7號85樓') {
            throw new Error(`地址解析錯誤，解析結果：${addressLine || '無'}`);
        }
        console.log(' -> 地址解析成功:', addressLine);
    };

    return {
        run
    };
})();

// 如果網址包含 ?test=true 則自動執行測試
if (window.location.search.includes('test=true')) {
    window.addEventListener('load', () => {
        // 延遲一下執行，確保各子模組已完全初始化
        setTimeout(() => {
            tests.run();
        }, 1000);
    });
}
