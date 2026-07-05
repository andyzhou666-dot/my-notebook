/**
 * sync.js - Google Drive appDataFolder 雲端同步模組
 */
const sync = (() => {
    // 預設的 Client ID，支援 localhost 的開發與測試。
    // 使用者可以在設定頁面自訂自己的 Client ID 以適配自訂的 GitHub Pages。
    const DEFAULT_CLIENT_ID = '521475610363-b50um5eogpnb5m9iagt9eq3jjtrcc014.apps.googleusercontent.com'; // 專屬 Client ID
    const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
    const BACKUP_FILENAME = 'backup.json';

    let tokenClient = null;
    let accessToken = null;
    let syncState = 'disconnected'; // disconnected, connected, syncing, success, error
    let autoSyncTimer = null;

    // 回呼函數註冊，用於將同步狀態更新至 UI
    let onStateChangeCallback = null;

    /**
     * 初始化 Google Identity Services (GIS)
     */
    const init = () => {
        return new Promise((resolve) => {
            // 從 localStorage 取得使用者自訂的 Client ID，若無則使用預設
            const clientId = getClientId();

            if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
                console.warn('Google Identity Services SDK not loaded yet.');
                return resolve(false);
            }

            try {
                tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: clientId,
                    scope: SCOPE,
                    callback: (tokenResponse) => {
                        if (tokenResponse.error !== undefined) {
                            console.error('GIS Error:', tokenResponse);
                            updateState('error');
                            return;
                        }
                        accessToken = tokenResponse.access_token;
                        // 儲存 token 到 session 中，避免重新整理網頁時一直彈出登入
                        sessionStorage.setItem('gd_access_token', accessToken);
                        sessionStorage.setItem('gd_token_expiry', (Date.now() + tokenResponse.expires_in * 1000).toString());
                        
                        updateState('connected');
                        resolve(true);

                        // 登入後立即觸發一次同步
                        runSync();
                    },
                });

                // 檢查 Session 中是否已有有效的 Token
                const cachedToken = sessionStorage.getItem('gd_access_token');
                const expiry = sessionStorage.getItem('gd_token_expiry');
                if (cachedToken && expiry && Date.now() < parseInt(expiry, 10)) {
                    accessToken = cachedToken;
                    updateState('connected');
                }

                resolve(true);
            } catch (err) {
                console.error('Failed to initialize GIS client:', err);
                resolve(false);
            }
        });
    };

    const getClientId = () => {
        return localStorage.getItem('gd_custom_client_id') || DEFAULT_CLIENT_ID;
    };

    const setClientId = (id) => {
        if (!id) {
            localStorage.removeItem('gd_custom_client_id');
        } else {
            localStorage.setItem('gd_custom_client_id', id.trim());
        }
        // 重新初始化 GIS
        init();
    };

    const registerStateCallback = (callback) => {
        onStateChangeCallback = callback;
    };

    const updateState = (newState) => {
        syncState = newState;
        if (onStateChangeCallback) {
            onStateChangeCallback(syncState, getUserEmail());
        }
    };

    const getState = () => syncState;

    const getUserEmail = () => {
        if (accessToken) {
            // 如果已登入，可以解析 token 或是直接顯示「已連結」
            return localStorage.getItem('gd_user_email') || '已授權 Google Drive 空間';
        }
        return '';
    };

    /**
     * 登入 Google
     */
    const login = () => {
        if (!tokenClient) {
            init().then((success) => {
                if (success && tokenClient) {
                    tokenClient.requestAccessToken({ prompt: 'consent' });
                } else {
                    alert('無法載入 Google 登入模組。請確認網路連線，或是否使用了不支援的瀏覽器環境。');
                }
            });
        } else {
            tokenClient.requestAccessToken({ prompt: 'consent' });
        }
    };

    /**
     * 登出 Google
     */
    const logout = () => {
        accessToken = null;
        sessionStorage.removeItem('gd_access_token');
        sessionStorage.removeItem('gd_token_expiry');
        localStorage.removeItem('gd_user_email');
        updateState('disconnected');
    };

    /**
     * 向 Google Drive API 發送請求的輔助函數
     */
    const driveFetch = async (url, options = {}) => {
        if (!accessToken) {
            // 嘗試從 Session 重新取得
            const cachedToken = sessionStorage.getItem('gd_access_token');
            const expiry = sessionStorage.getItem('gd_token_expiry');
            if (cachedToken && expiry && Date.now() < parseInt(expiry, 10)) {
                accessToken = cachedToken;
            } else {
                updateState('disconnected');
                throw new Error('未授權或登入已過期');
            }
        }

        options.headers = options.headers || {};
        options.headers['Authorization'] = `Bearer ${accessToken}`;

        let response = await fetch(url, options);

        // 如果是 401 錯誤，表示 token 已過期，清除 token
        if (response.status === 401) {
            logout();
            throw new Error('登入已過期，請重新登入');
        }

        return response;
    };

    /**
     * 搜尋 appDataFolder 中是否存在備份檔案
     */
    const findBackupFile = async () => {
        const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${BACKUP_FILENAME}'&fields=files(id,name,modifiedTime)`;
        const response = await driveFetch(url);
        const result = await response.json();
        if (result.files && result.files.length > 0) {
            return result.files[0];
        }
        return null;
    };

    /**
     * 從雲端下載備份檔案內容
     */
    const downloadBackup = async (fileId) => {
        const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
        const response = await driveFetch(url);
        return await response.text();
    };

    /**
     * 建立全新的備份檔案到雲端
     */
    const createBackup = async (jsonData) => {
        const metadata = {
            name: BACKUP_FILENAME,
            parents: ['appDataFolder']
        };

        const boundary = 'foo_bar_boundary';
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelimiter = `\r\n--${boundary}--`;

        const multipartBody =
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            jsonData +
            closeDelimiter;

        const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
        const response = await driveFetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/related; boundary=${boundary}`
            },
            body: multipartBody
        });

        return await response.json();
    };

    /**
     * 覆蓋更新雲端上的備份檔案
     */
    const updateBackup = async (fileId, jsonData) => {
        const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
        const response = await driveFetch(url, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: jsonData
        });

        return await response.json();
    };

    /**
     * 執行雲端與本地同步邏輯
     */
    const runSync = async () => {
        if (!accessToken) return;

        updateState('syncing');
        try {
            // 1. 取得本地的最後修改時間
            const localLastModified = db.getLastModified();
            
            // 2. 尋找雲端備份檔
            const cloudFile = await findBackupFile();

            if (!cloudFile) {
                // 雲端無備份：上傳本地當前資料
                console.log('Sync: Cloud backup not found. Uploading local database...');
                const localData = await db.exportData();
                await createBackup(localData);
                updateState('success');
                console.log('Sync: Cloud backup created successfully.');
                return;
            }

            // 3. 雲端存在備份，比對修改時間
            const cloudModifiedTime = new Date(cloudFile.modifiedTime).getTime();
            
            // 緩衝 2 秒（避免系統時鐘微小差距造成頻繁覆蓋）
            if (cloudModifiedTime > localLastModified + 2000) {
                // 雲端較新 -> 下載雲端資料覆蓋本地
                console.log(`Sync: Cloud version (${new Date(cloudModifiedTime).toLocaleString()}) is newer than local (${new Date(localLastModified).toLocaleString()}). Downloading...`);
                const cloudJson = await downloadBackup(cloudFile.id);
                await db.importData(cloudJson);
                
                // 強制將本地的最後修改時間對齊雲端時間
                localStorage.setItem('db_last_modified', cloudModifiedTime.toString());
                updateState('success');
                console.log('Sync: Downloaded and restored local database successfully.');
            } else if (localLastModified > cloudModifiedTime + 2000) {
                // 本地較新 -> 上傳本地資料覆蓋雲端
                console.log(`Sync: Local version (${new Date(localLastModified).toLocaleString()}) is newer than cloud (${new Date(cloudModifiedTime).toLocaleString()}). Uploading...`);
                const localData = await db.exportData();
                await updateBackup(cloudFile.id, localData);
                updateState('success');
                console.log('Sync: Uploaded local database to Google Drive successfully.');
            } else {
                // 時間一致 -> 不需要同步
                console.log('Sync: Cloud and local are in sync. No action needed.');
                updateState('success');
            }
        } catch (error) {
            console.error('Sync process failed:', error);
            updateState('error');
        }
    };

    /**
     * 觸發延遲自動同步 (Debounced Sync)
     */
    const triggerAutoSync = () => {
        if (!accessToken) return;
        
        // 檢查使用者是否啟用了自動同步開關
        const autoSyncCheckbox = document.getElementById('auto-sync-checkbox');
        if (autoSyncCheckbox && !autoSyncCheckbox.checked) return;

        if (autoSyncTimer) clearTimeout(autoSyncTimer);
        
        // 延遲 5 秒後執行上傳同步，避免每次打字都發送 API 請求
        autoSyncTimer = setTimeout(() => {
            console.log('AutoSync triggered by database changes...');
            runSync();
        }, 5000);
    };

    return {
        init,
        login,
        logout,
        runSync,
        triggerAutoSync,
        registerStateCallback,
        getState,
        getClientId,
        setClientId,
        getUserEmail
    };
})();

// 當資料庫有任何寫入異動時，會被 db.js 呼叫此變更通知
window.onDatabaseChanged = () => {
    // 觸發自動同步
    sync.triggerAutoSync();
};

window.sync = sync;
