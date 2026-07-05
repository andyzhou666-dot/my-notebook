/**
 * db.js - IndexedDB 本地資料庫封裝
 */
const db = (() => {
    const DB_NAME = 'my_notebook_db';
    const DB_VERSION = 1;
    let databaseInstance = null;

    /**
     * 初始化資料庫
     */
    const init = () => {
        return new Promise((resolve, reject) => {
            if (databaseInstance) return resolve(databaseInstance);

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const d = event.target.result;

                // 1. 智能筆記 notes
                // 欄位: id, content, tags, createdAt, updatedAt, viewMode
                if (!d.objectStoreNames.contains('notes')) {
                    d.createObjectStore('notes', { keyPath: 'id', autoIncrement: true });
                }

                // 2. 廠商管理 vendors
                // 欄位: id, companyName, contactName, phone, email, address, tags, notes, cardImage, createdAt
                if (!d.objectStoreNames.contains('vendors')) {
                    d.createObjectStore('vendors', { keyPath: 'id', autoIncrement: true });
                }

                // 3. 知識條目 knowledge
                // 欄位: id, title, content, categoryId, tags, createdAt, updatedAt
                if (!d.objectStoreNames.contains('knowledge')) {
                    d.createObjectStore('knowledge', { keyPath: 'id', autoIncrement: true });
                }

                // 4. 知識庫分類 categories
                // 欄位: id, name, parentId
                if (!d.objectStoreNames.contains('categories')) {
                    d.createObjectStore('categories', { keyPath: 'id', autoIncrement: true });
                }
            };

            request.onsuccess = (event) => {
                databaseInstance = event.target.result;
                resolve(databaseInstance);
            };

            request.onerror = (event) => {
                console.error('IndexedDB open error:', event.target.error);
                reject(event.target.error);
            };
        });
    };

    /**
     * 更新本地最後修改時間戳記 (供同步模組比對)
     */
    const updateLastModified = () => {
        localStorage.setItem('db_last_modified', Date.now().toString());
        // 如果有註冊的變更回呼 (供自動同步偵測)
        if (window.onDatabaseChanged) {
            window.onDatabaseChanged();
        }
    };

    /**
     * 取得最後修改時間戳記
     */
    const getLastModified = () => {
        return parseInt(localStorage.getItem('db_last_modified') || '0', 10);
    };

    /**
     * 取得 Object Store 的讀寫交易
     */
    const getStore = (storeName, mode = 'readonly') => {
        if (!databaseInstance) throw new Error('Database not initialized');
        const transaction = databaseInstance.transaction(storeName, mode);
        return transaction.objectStore(storeName);
    };

    /* ----------------- 通用 CRUD 封裝 ----------------- */

    const getAll = (storeName) => {
        return new Promise((resolve, reject) => {
            try {
                const store = getStore(storeName, 'readonly');
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (err) {
                reject(err);
            }
        });
    };

    const getById = (storeName, id) => {
        return new Promise((resolve, reject) => {
            try {
                const store = getStore(storeName, 'readonly');
                const request = store.get(id);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (err) {
                reject(err);
            }
        });
    };

    const add = (storeName, item) => {
        return new Promise((resolve, reject) => {
            try {
                const store = getStore(storeName, 'readwrite');
                const request = store.add(item);
                request.onsuccess = () => {
                    updateLastModified();
                    resolve(request.result);
                };
                request.onerror = () => reject(request.error);
            } catch (err) {
                reject(err);
            }
        });
    };

    const put = (storeName, item) => {
        return new Promise((resolve, reject) => {
            try {
                const store = getStore(storeName, 'readwrite');
                const request = store.put(item);
                request.onsuccess = () => {
                    updateLastModified();
                    resolve(request.result);
                };
                request.onerror = () => reject(request.error);
            } catch (err) {
                reject(err);
            }
        });
    };

    const remove = (storeName, id) => {
        return new Promise((resolve, reject) => {
            try {
                const store = getStore(storeName, 'readwrite');
                const request = store.delete(id);
                request.onsuccess = () => {
                    updateLastModified();
                    resolve(true);
                };
                request.onerror = () => reject(request.error);
            } catch (err) {
                reject(err);
            }
        });
    };

    const clearStore = (storeName) => {
        return new Promise((resolve, reject) => {
            try {
                const store = getStore(storeName, 'readwrite');
                const request = store.clear();
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            } catch (err) {
                reject(err);
            }
        });
    };

    /* ----------------- 資料備份與還原邏輯 (JSON) ----------------- */

    /**
     * 匯出整個資料庫為 JSON 字串
     */
    const exportData = async () => {
        await init();
        const stores = ['notes', 'vendors', 'knowledge', 'categories'];
        const exportObj = {
            version: DB_VERSION,
            exportedAt: Date.now(),
            lastModified: getLastModified(),
            data: {}
        };

        for (const storeName of stores) {
            exportObj.data[storeName] = await getAll(storeName);
        }

        return JSON.stringify(exportObj);
    };

    /**
     * 從 JSON 覆蓋還原本地資料庫
     */
    const importData = async (jsonString) => {
        try {
            const importObj = JSON.parse(jsonString);
            if (!importObj.data) throw new Error('匯入資料格式不正確');

            await init();
            
            // 逐一清除並寫入
            const stores = ['notes', 'vendors', 'knowledge', 'categories'];
            for (const storeName of stores) {
                if (importObj.data[storeName]) {
                    await clearStore(storeName);
                    const store = getStore(storeName, 'readwrite');
                    for (const item of importObj.data[storeName]) {
                        // 確保將 item 寫回 IndexedDB
                        await new Promise((res, rej) => {
                            const req = store.put(item);
                            req.onsuccess = () => res();
                            req.onerror = () => rej(req.error);
                        });
                    }
                }
            }

            // 更新最後修改時間
            const importModified = importObj.lastModified || Date.now();
            localStorage.setItem('db_last_modified', importModified.toString());

            // 觸發 UI 更新
            if (window.onDatabaseChanged) {
                window.onDatabaseChanged();
            }

            return true;
        } catch (error) {
            console.error('Database import error:', error);
            throw error;
        }
    };

    return {
        init,
        getAll,
        getById,
        add,
        put,
        remove,
        exportData,
        importData,
        getLastModified,
        updateLastModified
    };
})();

window.db = db;
