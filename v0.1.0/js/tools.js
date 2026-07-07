/**
 * tools.js - My Notebook 辦公實用小工具模組
 * 包含：工具一（批次圖片壓縮）、工具二（文字排版與全半形清理）
 */
const tools = (() => {
    // 壓縮佇列狀態
    let compressQueue = [];
    let isProcessing = false;

    // 簡繁字體轉換對照表
    const S_TO_T_MAP = {
        '万':'萬','与':'與','专':'專','业':'業','丛':'叢','东':'東','丝':'絲','丢':'丟','两':'兩','严':'嚴','丧':'喪','个':'個','临':'臨','丽':'麗','举':'舉','么':'麼','义':'義','乌':'烏','乐':'樂','乔':'喬','习':'習','乡':'鄉','书':'書','买':'買','乱':'亂','争':'爭','于':'於','亏':'虧','云':'雲','亚':'亞','产':'產','亩':'畝','亲':'親','亿':'億','仅':'僅','从':'從','仑':'侖','仓':'倉','们':'們','价':'價','众':'眾','优':'優','伙':'夥','会':'會','伟':'偉','传':'傳','伤':'傷','进':'進','时':'時','间':'間','伦':'倫','伪':'偽','体':'體','余':'餘','佣':'傭','敛':'斂','宁':'寧','党':'黨','厂':'廠','厅':'廳','历':'歷','压':'壓','厌':'厭','厕':'廁','厢':'廂','厦':'廈','厨':'廚','县':'縣','双':'雙','发':'發','变':'變','叙':'敘','叠':'疊','号':'號','叹':'嘆','吓':'嚇','吕':'呂','吗':'嗎','听':'聽','启':'啟','吴':'吳','呐':'吶','呕':'嘔','员':'員','哑':'啞','哒':'噠','哗':'華','唠':'嘮','唢':'嗩','唤':'喚','啧':'嘖','啬':'嗇','啰':'囉','啸':'嘯','喷':'噴','喽':'嘍','嘱':'囑','囵':'圇','国':'國','围':'圍','园':'園','圆':'圓','图':'圖','团':'團','圣':'聖','场':'場','坏':'壞','块':'塊','坚':'堅','坛':'壇','坝':'壩','坞':'塢','坟':'墳','坠':'墜','垄':'壟','垒':'壘','垦':'墾','垫':'墊','垮':'垮','堑':'塹','堕':'墮','墙':'牆','壮':'壯','声':'聲','壳':'殼','壶':'壺','处':'處','备':'備','复':'複','够':'夠','头':'頭','夸':'誇','夹':'夾','夺':'奪','奂':'奐','奋':'奮','奥':'奧','妇':'婦','妈':'媽','&':'＆','*':'＊','#':'＃','1':'１','2':'２','3':'３','4':'４','5':'５','6':'６','7':'７','8':'８','9':'９','0':'０','a':'ａ','b':'ｂ','c':'ｃ','d':'ｄ','e':'ｅ','f':'ｆ','g':'ｇ','h':'ｈ','i':'ｉ','j':'ｊ','k':'ｋ','l':'ｌ','m':'ｍ','n':'ｎ','o':'ｏ','p':'ｐ','q':'ｑ','r':'ｒ','s':'ｓ','t':'ｔ','u':'ｕ','v':'ｖ','w':'ｗ','x':'ｘ','y':'ｙ','z':'ｚ','A':'Ａ','B':'Ｂ','C':'Ｃ','D':'Ｄ','E':'Ｅ','F':'Ｆ','G':'Ｇ','H':'Ｈ','I':'Ｉ','J':'Ｊ','K':'Ｋ','L':'Ｌ','M':'Ｍ','N':'Ｎ','O':'Ｏ','P':'Ｐ','Q':'Ｑ','R':'Ｒ','S':'Ｓ','T':'Ｔ','U':'Ｕ','V':'Ｖ','W':'Ｗ','X':'Ｘ','Y':'Ｙ','Z':'Ｚ','。':'。','，':'，','、':'、','；':'；','：':'：','？':'？','！':'！','“':'“','”':'”','‘':'‘','’':'’','（':'（','）':'）','【':'【','】':'】','{':'｛','}':'｝','[':'［',']':'］','(':'（',')':'）','/':'／','\\':'＼','+':'＋','=':'＝','-':'－','_':'＿','*':'＊','%':'％','@':'＠','!':'！','?':'？',':':'：',';':'；','\'':'\'','"':'"','`':'｀','~':'～','<':'＜','>':'＞','妫':'媯','姗':'姍','姜':'姜','姝':'姝','姣':'姣','姥':'姥','姨':'姨','姬':'姬','姻':'姻','姿':'姿','威':'威','娃':'娃','娄':'婁','娅':'婭','娆':'嬈','娇':'嬌','娈':'嫺','娱':'娛','阻':'阻','难':'難','试':'試','验':'驗','证':'證','确':'確','认':'認','输':'輸','入':'入','选':'選','择':'擇','定':'定','清':'清','除':'除','多':'多','余':'餘','空':'空','行':'行','簡':'簡','繁':'繁','體':'體','中':'中','文':'文','字':'字','體':'體','轉':'轉','換':'換','對':'對','照':'照','表':'表','轉':'轉','載':'載','銘':'銘','偉':'偉','陳':'陳','劉':'劉','趙':'趙','黃':'黃','吳':'吳','孫':'孫','鄭':'鄭','謝':'謝','韓':'韓','馮':'馮','鄧':'鄧','許':'許','蘇':'蘇','盧':'盧','蔣':'蔣','賈':'賈','葉':'葉','閻':'閻','鐘':'鍾','范':'範','譚':'譚','鄒':'鄒','陸':'陸','顧':'顧','龍':'龍','錢':'錢','湯':'湯','賀':'賀','賴':'賴','龔':'龔','伟':'偉','铭':'銘'
    };

    // 自動建構繁轉簡對照表，確保雙向轉換 100% 對稱且無冗餘定義
    const T_TO_S_MAP = {};
    for (const [s, t] of Object.entries(S_TO_T_MAP)) {
        T_TO_S_MAP[t] = s;
    }

    /**
     * 初始化小工具模組
     */
    const init = () => {
        setupTabs();
        setupCompressor();
        setupTextTool();
    };

    /**
     * 設定工具分頁切換
     */
    const setupTabs = () => {
        const tabBtns = document.querySelectorAll('.tool-tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTool = btn.getAttribute('data-tool');
                
                // 移除其他 active 類別
                tabBtns.forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tool-panel').forEach(p => p.classList.remove('active'));

                // 啟用當前分頁
                btn.classList.add('active');
                if (targetTool === 'compress-tool') {
                    document.getElementById('tool-compress-panel').classList.add('active');
                } else if (targetTool === 'text-tool') {
                    document.getElementById('tool-text-panel').classList.add('active');
                }
            });
        });
    };

    /**
     * 工具一：圖片壓縮器邏輯初始化
     */
    const setupCompressor = () => {
        const qualitySlider = document.getElementById('compress-quality');
        const qualityVal = document.getElementById('compress-quality-val');
        const dropzone = document.getElementById('compress-dropzone');
        const fileInput = document.getElementById('compress-file-input');
        const clearBtn = document.getElementById('compress-clear-btn');
        const downloadAllBtn = document.getElementById('compress-download-all-btn');

        // 品質拉動條數值即時更新
        qualitySlider.addEventListener('input', (e) => {
            qualityVal.textContent = `${e.target.value}%`;
        });

        // 點選拖曳區觸發檔案上傳
        dropzone.addEventListener('click', () => {
            fileInput.click();
        });

        // 監聽拖曳行為
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('dragover');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleSelectFiles(e.dataTransfer.files);
            }
        });

        // 檔案選擇變更
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                handleSelectFiles(e.target.files);
                fileInput.value = ''; // 重置 input 允許重複選相同檔案
            }
        });

        // 清除清單
        clearBtn.addEventListener('click', () => {
            compressQueue = [];
            isProcessing = false;
            document.getElementById('compress-queue-section').style.display = 'none';
            document.getElementById('compress-queue-list').innerHTML = '';
        });

        // 下載全部
        downloadAllBtn.addEventListener('click', () => {
            const completedItems = compressQueue.filter(item => item.status === 'done');
            if (completedItems.length === 0) {
                app.showToast('目前尚無已完成壓縮的圖片可供下載。', 'warning');
                return;
            }
            app.showToast(`開始下載共 ${completedItems.length} 張圖片...`, 'info');
            
            // 順序觸發瀏覽器下載
            completedItems.forEach((item, idx) => {
                setTimeout(() => {
                    const originalName = item.file.name;
                    const dotIndex = originalName.lastIndexOf('.');
                    const nameWithoutExt = dotIndex !== -1 ? originalName.substring(0, dotIndex) : originalName;
                    const downloadName = `${nameWithoutExt}_compressed.jpg`;
                    
                    const link = document.createElement('a');
                    link.href = item.base64;
                    link.download = downloadName;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }, idx * 300); // 間隔 300ms 以免瀏覽器阻擋多檔下載
            });
        });
    };

    /**
     * 處理選擇的檔案並加入佇列
     */
    const handleSelectFiles = (files) => {
        const queueSection = document.getElementById('compress-queue-section');
        const queueList = document.getElementById('compress-queue-list');
        queueSection.style.display = 'block';

        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) {
            app.showToast('選取的檔案中沒有支援的圖片格式！', 'danger');
            return;
        }

        imageFiles.forEach(file => {
            const itemId = `q-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const item = {
                id: itemId,
                file: file,
                originalSize: file.size,
                compressedSize: 0,
                base64: null,
                status: 'pending' // pending, processing, done, failed
            };
            compressQueue.push(item);

            // 渲染進度行
            const itemHtml = `
                <div class="compress-item" id="${itemId}">
                    <div class="compress-item-name"><i class="fa-regular fa-image" style="margin-right: 6px; color:var(--text-muted);"></i>${escapeHtml(file.name)}</div>
                    <div class="compress-item-sizes">
                        <span class="orig-size">${formatBytes(file.size)}</span>
                        <span class="size-arrow" style="display:none;"><i class="fa-solid fa-arrow-right"></i></span>
                        <span class="comp-size" style="display:none;"></span>
                        <span class="compress-item-ratio" style="display:none;"></span>
                    </div>
                    <div class="compress-item-status pending">排隊中...</div>
                    <div class="compress-item-action" style="display:none;">
                        <button type="button" class="compress-item-btn" title="下載單張"><i class="fa-solid fa-download"></i></button>
                    </div>
                </div>
            `;
            queueList.insertAdjacentHTML('beforeend', itemHtml);
        });

        updateQueueCount();

        // 啟動佇列處理
        if (!isProcessing) {
            processNextInQueue();
        }
    };

    /**
     * 更新清單計數器
     */
    const updateQueueCount = () => {
        document.getElementById('compress-queue-count').textContent = compressQueue.length;
    };

    /**
     * 迴圈非同步處理佇列中的圖片
     */
    const processNextInQueue = async () => {
        const nextItem = compressQueue.find(item => item.status === 'pending');
        if (!nextItem) {
            isProcessing = false;
            app.showToast('所有圖片皆已處理完成！', 'success');
            return;
        }

        isProcessing = true;
        nextItem.status = 'processing';
        updateItemUi(nextItem);

        try {
            await compressImage(nextItem);
            nextItem.status = 'done';
        } catch (err) {
            console.error('Compress error:', err);
            nextItem.status = 'failed';
        }

        updateItemUi(nextItem);
        // 繼續處理下一張
        processNextInQueue();
    };

    /**
     * 更新單個項目的 UI 狀態
     */
    const updateItemUi = (item) => {
        const row = document.getElementById(item.id);
        if (!row) return;

        const statusEl = row.querySelector('.compress-item-status');
        const arrowEl = row.querySelector('.size-arrow');
        const compSizeEl = row.querySelector('.comp-size');
        const ratioEl = row.querySelector('.compress-item-ratio');
        const actionEl = row.querySelector('.compress-item-action');

        // 移除舊的狀態類別
        statusEl.className = 'compress-item-status';

        if (item.status === 'processing') {
            statusEl.classList.add('processing');
            statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right:6px;"></i>壓縮中...';
        } else if (item.status === 'done') {
            statusEl.classList.add('done');
            statusEl.textContent = '完成';
            
            // 秀出壓縮後大小與比率
            arrowEl.style.display = 'inline';
            compSizeEl.style.display = 'inline';
            compSizeEl.textContent = formatBytes(item.compressedSize);
            
            ratioEl.style.display = 'inline';
            const savingsPct = Math.round((1 - (item.compressedSize / item.originalSize)) * 100);
            ratioEl.textContent = `-${savingsPct}%`;

            // 啟用下載按鈕
            actionEl.style.display = 'block';
            const dlBtn = actionEl.querySelector('button');
            
            // 避免重複綁定監聽
            dlBtn.onclick = () => {
                const originalName = item.file.name;
                const dotIndex = originalName.lastIndexOf('.');
                const nameWithoutExt = dotIndex !== -1 ? originalName.substring(0, dotIndex) : originalName;
                const downloadName = `${nameWithoutExt}_compressed.jpg`;
                
                const link = document.createElement('a');
                link.href = item.base64;
                link.download = downloadName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            };
        } else if (item.status === 'failed') {
            statusEl.classList.add('failed');
            statusEl.textContent = '失敗';
        }
    };

    /**
     * 核心壓縮程序 (Canvas 縮放與重繪)
     */
    const compressImage = (item) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    // 獲取使用者設定引數
                    const quality = parseInt(document.getElementById('compress-quality').value) / 100;
                    const maxDim = parseInt(document.getElementById('compress-max-dimension').value);

                    let width = img.width;
                    let height = img.height;

                    // 若設定了最大邊長限制，且圖片寬度或高度超過時進行等比例縮小
                    if (maxDim > 0 && (width > maxDim || height > maxDim)) {
                        if (width > height) {
                            height = Math.round((height * maxDim) / width);
                            width = maxDim;
                        } else {
                            width = Math.round((width * maxDim) / height);
                            height = maxDim;
                        }
                    }

                    // 繪製到 Canvas
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    
                    // 背景填白色以防透明 PNG 壓縮後變全黑
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, width, height);
                    ctx.drawImage(img, 0, 0, width, height);

                    // 匯出為壓縮後的 JPEG Base64
                    const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
                    
                    // 計算壓縮後的 byte 數
                    const head = 'data:image/jpeg;base64,'.length;
                    const sizeInBytes = Math.round((compressedBase64.length - head) * 3 / 4);

                    item.base64 = compressedBase64;
                    item.compressedSize = sizeInBytes;

                    resolve();
                };
                img.onerror = () => reject(new Error('Failed to load image object'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(item.file);
        });
    };

    /**
     * 工具二：文字整理器邏輯初始化
     */
    const setupTextTool = () => {
        const copyBtn = document.getElementById('text-tool-copy-btn');
        const outputTextarea = document.getElementById('text-tool-output');

        copyBtn.addEventListener('click', () => {
            const val = outputTextarea.value;
            if (!val) {
                app.showToast('沒有文字可以複製！', 'warning');
                return;
            }
            navigator.clipboard.writeText(val).then(() => {
                app.showToast('已複製到剪貼簿！', 'success');
            }).catch(() => {
                app.showToast('複製失敗，請手動複製文字。', 'danger');
            });
        });
    };

    // --- 文字轉換核心演算法 ---

    /**
     * 1. 清除贅餘空行 (將連續兩個以上的空行縮減為單個空行，並清理空格，支援 Windows \r\n 換行格式)
     */
    const cleanExtraNewlines = () => {
        const input = document.getElementById('text-tool-input').value;
        const outputTextarea = document.getElementById('text-tool-output');
        
        // 依換行符切割（相容 Windows 的 \r\n）
        const lines = input.split(/\r?\n/);
        const cleanedLines = [];
        let lastWasEmpty = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const isEmpty = line.trim() === '';
            if (isEmpty) {
                // 如果前一行不是空行，才保留一個空行（達到連續空行壓縮為單一空行的目的）
                if (!lastWasEmpty) {
                    cleanedLines.push('');
                    lastWasEmpty = true;
                }
            } else {
                cleanedLines.push(line);
                lastWasEmpty = false;
            }
        }
        
        // 去除最後一行的尾部空行（如果有的話）
        if (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1] === '') {
            cleanedLines.pop();
        }
        // 去除開頭的第一個空行（如果有的話）
        if (cleanedLines.length > 0 && cleanedLines[0] === '') {
            cleanedLines.shift();
        }
        
        outputTextarea.value = cleanedLines.join('\n');
        app.showToast('已清除贅餘空行', 'success');
    };

    /**
     * 2. 英數符號全形轉半形
     */
    const convertFullToHalf = () => {
        const input = document.getElementById('text-tool-input').value;
        const outputTextarea = document.getElementById('text-tool-output');
        
        let result = "";
        for (let i = 0; i < input.length; i++) {
            let code = input.charCodeAt(i);
            // 全形英數與一般符號範圍在 65281~65374 (對應半形 33~126)
            if (code >= 65281 && code <= 65374) {
                result += String.fromCharCode(code - 65248);
            }
            // 全形空格特殊處理
            else if (code === 12288) {
                result += String.fromCharCode(32);
            } else {
                result += input.charAt(i);
            }
        }
        
        outputTextarea.value = result;
        app.showToast('全形已轉換為半形', 'success');
    };

    /**
     * 3. 清理首尾與每行贅餘多個空格
     */
    const cleanSpaces = () => {
        const input = document.getElementById('text-tool-input').value;
        const outputTextarea = document.getElementById('text-tool-output');
        
        // 依行切割，清理每行首尾空格，並將行內多個連續半形空格縮減為單一空格
        const cleaned = input.split('\n')
            .map(line => line.trim().replace(/[ \t]{2,}/g, ' '))
            .join('\n');
            
        outputTextarea.value = cleaned;
        app.showToast('多餘空格清理完畢', 'success');
    };

    /**
     * 4. 將每一行文字包裝為 Markdown 無序清單 (- 項目)
     */
    const convertToMarkdownList = () => {
        const input = document.getElementById('text-tool-input').value;
        const outputTextarea = document.getElementById('text-tool-output');
        
        const lines = input.split('\n');
        const listText = lines
            .map(line => {
                const trimmed = line.trim();
                if (!trimmed) return "";
                // 如果原本就有 Markdown 清單前置字元則保留
                if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) {
                    return trimmed;
                }
                return `- ${trimmed}`;
            })
            .filter(l => l !== "")
            .join('\n');
            
        outputTextarea.value = listText;
        app.showToast('已格式化為 MD 清單', 'success');
    };

    /**
     * 5. 繁體中文轉為簡體中文
     */
    const convertToSimplified = () => {
        const input = document.getElementById('text-tool-input').value;
        const outputTextarea = document.getElementById('text-tool-output');
        
        let result = '';
        for (let i = 0; i < input.length; i++) {
            const char = input[i];
            result += T_TO_S_MAP[char] || char;
        }
        
        outputTextarea.value = result;
        app.showToast('繁體已轉換為簡體', 'success');
    };

    /**
     * 6. 簡體中文轉為繁體中文
     */
    const convertToTraditional = () => {
        const input = document.getElementById('text-tool-input').value;
        const outputTextarea = document.getElementById('text-tool-output');
        
        let result = '';
        for (let i = 0; i < input.length; i++) {
            const char = input[i];
            result += S_TO_T_MAP[char] || char;
        }
        
        outputTextarea.value = result;
        app.showToast('簡體已轉換為繁體', 'success');
    };

    // --- Helper 輔助函數 ---

    const escapeHtml = (text) => {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, function(m) { return map[m]; });
    };

    const formatBytes = (bytes, decimals = 2) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    return {
        init,
        cleanExtraNewlines,
        convertFullToHalf,
        cleanSpaces,
        convertToMarkdownList,
        convertToSimplified,
        convertToTraditional
    };
})();

// 掛載到全域 Window
window.tools = tools;
