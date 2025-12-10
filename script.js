document.addEventListener('DOMContentLoaded', () => {
    // --- 状态管理 ---
    const STORAGE_KEY = 'prompt_cards_data';
    const THEME_KEY = 'prompt_cards_theme';
    
    // 默认数据
    const defaultCards = [
        {
            id: 'default_1',
            title: '真人转绘助手',
            type: '人像编辑',
            contributor: '官方示例',
            template: '帮我生成图片：将图片中的人物转为真人\n保留其脸部特征，让人一看就觉得是那个角色，保留其五官特征；\n{{{你需要再加深一下这个角色的面部皱纹、他有黑眼圈，眼眶很深（即骨相很深，属于浓颜）}}}\n生成5张图片',
            precautions: '请确保底模为写实风格，否则效果不佳。',
            exampleText: '将动漫角色转为写实风格，保留特征。',
            exampleImage: 'https://via.placeholder.com/300x200?text=Example+Image',
            hue: 210 // 蓝色
        },
        {
            id: 'default_2',
            title: '多图拼接生成',
            type: 'N图合一',
            contributor: '官方示例',
            template: '请将以下元素组合在一张图中：\n背景：{{{背景描述}}}\n主体：{{{主体描述}}}\n风格：{{{艺术风格}}}\n保持画面和谐统一。',
            precautions: '建议使用宽画幅生成。',
            exampleText: '组合森林背景、一只猫和水彩风格。',
            exampleImage: '',
            hue: 150 // 绿色
        }
    ];

    // 加载数据
    // let cards = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultCards;
    let cards = []; // 先初始化为空，等待从云端加载
    let editingCardId = null; // 当前正在编辑的卡片ID

    // --- DOM 元素 ---
    const cardContainer = document.getElementById('card-container');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const createModal = document.getElementById('create-modal');
    const openCreateModalBtn = document.getElementById('open-create-modal');
    const closeModalBtn = document.querySelector('.close-modal');
    const createForm = document.getElementById('create-card-form');
    const insertInputBtn = document.getElementById('insert-input-btn');
    const templateInput = document.getElementById('card-template');
    const inputBlockLabel = document.getElementById('input-block-label');
    const modalTitle = createModal.querySelector('h2');
    const submitBtn = createForm.querySelector('.submit-btn');
    
    // 图片相关元素
    const imagePathInput = document.getElementById('example-image-path');
    const imageFileInput = document.getElementById('example-image-file');
    const selectImageBtn = document.getElementById('select-image-btn');
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const imagePreview = document.getElementById('image-preview');
    const uploadStatus = document.getElementById('upload-status'); // 新增状态显示元素

    // --- 辅助函数 ---
    function getRandomHue() {
        return Math.floor(Math.random() * 360);
    }

    // 图片压缩函数
    function compressImage(file, maxSizeKB = 200, quality = 0.7) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    // 如果图片太大，先缩小尺寸 (例如最大宽度 1280)
                    const MAX_WIDTH = 1280;
                    if (width > MAX_WIDTH) {
                        height = Math.round(height * (MAX_WIDTH / width));
                        width = MAX_WIDTH;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // 递归压缩逻辑
                    const compress = (q) => {
                        canvas.toBlob((blob) => {
                            if (!blob) {
                                reject(new Error('Canvas to Blob failed'));
                                return;
                            }
                            
                            if (blob.size / 1024 <= maxSizeKB || q <= 0.1) {
                                // 转换回 File 对象，保持原文件名
                                const compressedFile = new File([blob], file.name, {
                                    type: 'image/jpeg',
                                    lastModified: Date.now(),
                                });
                                resolve(compressedFile);
                            } else {
                                // 如果还是太大，降低质量继续压缩
                                compress(q - 0.1);
                            }
                        }, 'image/jpeg', q);
                    };

                    compress(quality);
                };
                img.onerror = (err) => reject(err);
            };
            reader.onerror = (err) => reject(err);
        });
    }

    function getTypeClass(type) {
        switch (type) {
            case '人像编辑': return 'tag-portrait';
            case 'N图合一': return 'tag-n-in-1';
            case '画风转绘': return 'tag-style-transfer';
            case '焚天': return 'tag-burning-sky';
            default: return '';
        }
    }

    function checkPassword() {
        const password = prompt("请输入管理员密码以继续操作：");
        return password === 'ofsjnfswtkb76sa';
    }

    // --- 主题切换 ---
    function initTheme() {
        const savedTheme = localStorage.getItem(THEME_KEY);
        if (savedTheme === 'dark') {
            document.body.classList.remove('light-mode');
            document.body.classList.add('dark-mode');
            themeToggleBtn.textContent = '切换日间模式';
        }
    }

    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
        themeToggleBtn.textContent = isDark ? '切换日间模式' : '切换夜间模式';
    });

    // --- 数据同步逻辑 ---
    async function loadCards() {
        try {
            // 显示加载中提示（可选）
            const response = await fetch('/.netlify/functions/manage-cards');
            if (response.ok) {
                const data = await response.json();
                if (data && Array.isArray(data) && data.length > 0) {
                    cards = data;
                } else {
                    cards = defaultCards; // 如果云端没数据，用默认的
                }
            } else {
                console.warn('无法从云端加载数据，使用默认数据');
                cards = defaultCards;
            }
        } catch (error) {
            console.error('加载数据出错:', error);
            cards = defaultCards;
        }
        renderCards();
    }

    async function saveCards() {
        try {
            // 先更新本地显示
            renderCards();
            
            // 同步到云端
            const response = await fetch('/.netlify/functions/manage-cards', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cards)
            });
            
            if (!response.ok) {
                throw new Error('保存到云端失败');
            }
        } catch (error) {
            console.error('保存失败:', error);
            alert('保存到云端失败，请检查网络。');
        }
    }

    // --- 渲染逻辑 ---
    function renderCards() {
        // 保留第一个“新建卡片”按钮，移除其他卡片
        const existingCards = cardContainer.querySelectorAll('.card:not(.create-card-btn)');
        existingCards.forEach(card => card.remove());

        cards.forEach(card => {
            const cardEl = createCardElement(card);
            cardContainer.appendChild(cardEl);
        });
    }

    function createCardElement(card) {
        const el = document.createElement('div');
        el.className = 'card';
        el.dataset.id = card.id;
        
        // 设置随机颜色变量
        if (card.hue !== undefined) {
            el.style.setProperty('--card-hue', card.hue);
        }

        // 解析模版，提取自定义块 {{label}}
        // 使用正则匹配 {{...}}
        const regex = /\{\{\{(.*?)\}\}\}/g;
        let match;
        const inputs = [];
        
        // 我们不需要在渲染时替换文本，而是生成对应的输入框列表
        while ((match = regex.exec(card.template)) !== null) {
            inputs.push(match[1]);
        }

        // 生成模版预览 HTML (将 {{{label}}} 替换为 [label])
        const previewHtml = escapeHtml(card.template).replace(/\{\{\{(.*?)\}\}\}/g, '<span class="template-placeholder">[$1]</span>');

        // 生成输入框 HTML
        let inputsHtml = '';
        if (inputs.length > 0) {
            inputsHtml = `<div class="card-inputs">`;
            inputs.forEach((label, index) => {
                inputsHtml += `
                    <div class="input-group">
                        <label>${label}</label>
                        <input type="text" class="custom-input" data-index="${index}" placeholder="输入${label}...">
                    </div>
                `;
            });
            inputsHtml += `</div>`;
        }

        // 例子图片 HTML
        const imgHtml = card.exampleImage ? `<img src="${card.exampleImage}" class="example-img" alt="Example">` : '';

        // 获取类型对应的 CSS 类
        const typeClass = getTypeClass(card.type);

        // 注意事项 HTML
        const precautionsHtml = card.precautions ? `
            <div class="precautions-section">
                <span class="precautions-title">⚠️ 注意事项：</span>
                ${escapeHtml(card.precautions)}
            </div>
        ` : '';

        el.innerHTML = `
            <div class="card-controls">
                <button class="control-btn edit-btn" title="编辑">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                </button>
                <button class="control-btn delete-btn" title="删除">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                </button>
            </div>
            <div class="card-header">
                <h3 class="card-title">${escapeHtml(card.title)}</h3>
            </div>
            <div class="card-meta">
                <span class="card-tag ${typeClass}">${card.type}</span>
                <div class="card-contributor">by ${escapeHtml(card.contributor)}</div>
            </div>
            
            <div class="template-preview">${previewHtml}</div>

            ${inputsHtml}

            ${precautionsHtml}

            <div class="card-actions">
                <button class="action-btn copy-btn">复制提示词</button>
                <button class="action-btn secondary toggle-example-btn">查看例子</button>
            </div>

            <div class="example-section">
                <p class="example-text">${escapeHtml(card.exampleText)}</p>
                ${imgHtml}
            </div>
        `;

        // 绑定事件
        const copyBtn = el.querySelector('.copy-btn');
        copyBtn.addEventListener('click', () => copyPrompt(card, el));

        const toggleBtn = el.querySelector('.toggle-example-btn');
        const exampleSection = el.querySelector('.example-section');
        toggleBtn.addEventListener('click', () => {
            const isHidden = getComputedStyle(exampleSection).display === 'none';
            if (isHidden) {
                exampleSection.style.display = 'block';
                toggleBtn.textContent = '收起例子';
            } else {
                exampleSection.style.display = 'none';
                toggleBtn.textContent = '查看例子';
            }
        });

        // 编辑和删除事件
        const editBtn = el.querySelector('.edit-btn');
        const deleteBtn = el.querySelector('.delete-btn');

        editBtn.addEventListener('click', () => {
            if (checkPassword()) {
                openEditModal(card);
            } else {
                alert("密码错误");
            }
        });

        deleteBtn.addEventListener('click', () => {
            if (checkPassword()) {
                if (confirm(`确定要删除卡片 "${card.title}" 吗？`)) {
                    cards = cards.filter(c => c.id !== card.id);
                    // localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
                    saveCards(); // 改为调用 saveCards
                    // renderCards(); // saveCards 内部已经调用了 renderCards
                }
            } else {
                alert("密码错误");
            }
        });

        return el;
    }

    function openEditModal(card) {
        editingCardId = card.id;
        modalTitle.textContent = '编辑提示词卡片';
        submitBtn.textContent = '保存修改';
        
        document.getElementById('card-title').value = card.title;
        document.getElementById('card-type').value = card.type;
        document.getElementById('card-contributor').value = card.contributor;
        document.getElementById('card-template').value = card.template;
        document.getElementById('card-precautions').value = card.precautions || '';
        document.getElementById('example-text').value = card.exampleText;
        
        // 设置图片路径和预览
        imagePathInput.value = card.exampleImage || '';
        if (card.exampleImage) {
            imagePreview.src = card.exampleImage;
            imagePreviewContainer.style.display = 'block';
        } else {
            imagePreviewContainer.style.display = 'none';
        }
        
        createModal.style.display = 'block';
    }

    function copyPrompt(card, cardEl) {
        let finalPrompt = card.template;
        const inputs = cardEl.querySelectorAll('.custom-input');
        
        // 替换逻辑：按顺序替换
        let inputIndex = 0;
        finalPrompt = finalPrompt.replace(/\{\{\{(.*?)\}\}\}/g, (match, label) => {
            const userValue = inputs[inputIndex] ? inputs[inputIndex].value : '';
            inputIndex++;
            return userValue; 
        });

        navigator.clipboard.writeText(finalPrompt).then(() => {
            const originalText = cardEl.querySelector('.copy-btn').textContent;
            cardEl.querySelector('.copy-btn').textContent = '已复制!';
            setTimeout(() => {
                cardEl.querySelector('.copy-btn').textContent = originalText;
            }, 2000);
        }).catch(err => {
            console.error('复制失败:', err);
            alert('复制失败，请手动复制');
        });
    }

    // --- 模态框逻辑 ---
    openCreateModalBtn.addEventListener('click', () => {
        editingCardId = null;
        modalTitle.textContent = '创建新提示词卡片';
        submitBtn.textContent = '创建卡片';
        createForm.reset();
        imagePreviewContainer.style.display = 'none'; // 重置预览
        createModal.style.display = 'block';
    });

    closeModalBtn.addEventListener('click', () => {
        createModal.style.display = 'none';
    });

    // 移除点击模态框外部关闭的功能，防止误触
    // window.addEventListener('click', (event) => {
    //     if (event.target == createModal) {
    //         createModal.style.display = 'none';
    //     }
    // });

    // --- 插入自定义块 ---
    insertInputBtn.addEventListener('click', () => {
        const label = inputBlockLabel.value.trim();
        if (!label) {
            alert('请输入输入框标题');
            return;
        }

        // 检查当前已有多少个自定义块
        const currentContent = templateInput.value;
        const count = (currentContent.match(/\{\{\{(.*?)\}\}\}/g) || []).length;
        if (count >= 4) {
            alert('最多只能添加4个自定义块');
            return;
        }

        const tag = `{{{${label}}}}`;
        insertAtCursor(templateInput, tag);
        inputBlockLabel.value = ''; // 清空输入
    });

    function insertAtCursor(myField, myValue) {
        if (document.selection) {
            myField.focus();
            sel = document.selection.createRange();
            sel.text = myValue;
        } else if (myField.selectionStart || myField.selectionStart == '0') {
            var startPos = myField.selectionStart;
            var endPos = myField.selectionEnd;
            myField.value = myField.value.substring(0, startPos)
                + myValue
                + myField.value.substring(endPos, myField.value.length);
            myField.selectionStart = startPos + myValue.length;
            myField.selectionEnd = startPos + myValue.length;
        } else {
            myField.value += myValue;
        }
    }

    // --- 图片选择与上传逻辑 ---
    selectImageBtn.addEventListener('click', () => {
        imageFileInput.click();
    });

    imageFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // 1. 显示本地预览 (提升体验)
        const reader = new FileReader();
        reader.onload = function(e) {
            imagePreview.src = e.target.result;
            imagePreviewContainer.style.display = 'block';
        };
        reader.readAsDataURL(file);

        // 2. 执行上传
        uploadStatus.style.display = 'block';
        uploadStatus.textContent = '正在压缩并上传图片...';
        uploadStatus.style.color = '#666';
        selectImageBtn.disabled = true;

        try {
            // 压缩图片
            const compressedFile = await compressImage(file, 200); // 目标 200KB
            console.log(`原始大小: ${(file.size/1024).toFixed(2)}KB, 压缩后: ${(compressedFile.size/1024).toFixed(2)}KB`);

            const formData = new FormData();
            formData.append('file', compressedFile);

            const response = await fetch('/.netlify/functions/upload-image', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.statusText}`);
            }

            const data = await response.json();
            
            // 上传成功，填入返回的 URL
            imagePathInput.value = data.url;
            
            uploadStatus.textContent = '上传成功！';
            uploadStatus.style.color = 'green';
        } catch (error) {
            console.error('上传出错:', error);
            uploadStatus.textContent = '上传失败，请重试。';
            uploadStatus.style.color = 'red';
            imagePathInput.value = ''; // 清空路径
        } finally {
            selectImageBtn.disabled = false;
        }
    });

    // 监听路径输入框变化，尝试更新预览 (兼容手动输入 URL)
    imagePathInput.addEventListener('input', (e) => {
        const path = e.target.value.trim();
        if (path) {
            imagePreview.src = path;
            imagePreviewContainer.style.display = 'block';
        } else {
            imagePreviewContainer.style.display = 'none';
        }
    });

    // --- 创建/编辑卡片提交 ---
    createForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const title = document.getElementById('card-title').value;
        const type = document.getElementById('card-type').value;
        const contributor = document.getElementById('card-contributor').value;
        const template = document.getElementById('card-template').value;
        const precautions = document.getElementById('card-precautions').value;
        const exampleText = document.getElementById('example-text').value;
        const imagePath = imagePathInput.value.trim(); // 获取路径字符串

        // 再次检查自定义块数量
        const count = (template.match(/\{\{\{(.*?)\}\}\}/g) || []).length;
        if (count > 4) {
            alert('自定义块数量不能超过4个');
            return;
        }

        // 直接保存数据，不再处理 Base64
        if (editingCardId) {
            // 编辑模式
            const index = cards.findIndex(c => c.id === editingCardId);
            if (index !== -1) {
                cards[index] = {
                    ...cards[index],
                    title,
                    type,
                    contributor,
                    template,
                    precautions,
                    exampleText,
                    exampleImage: imagePath // 保存路径
                };
            }
        } else {
            // 创建模式
            const newCard = {
                id: 'card_' + Date.now(),
                title,
                type,
                contributor,
                template,
                precautions,
                exampleText,
                exampleImage: imagePath, // 保存路径
                hue: getRandomHue()
            };
            cards.push(newCard);
        }

        // localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
        // renderCards();
        saveCards(); // 改为调用 saveCards

        createModal.style.display = 'none';
        createForm.reset();
    });

    // 工具函数：转义 HTML 防止 XSS
    function escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // --- 初始化 ---
    initTheme();
    // renderCards(); // 移除直接渲染
    loadCards(); // 改为异步加载
});