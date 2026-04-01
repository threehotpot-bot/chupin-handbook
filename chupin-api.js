#!/usr/bin/env node

// 出品器 - 极简配方API服务
// 说明：
// - GET /api/recipes           获取所有菜品
// - POST /api/recipes          新增菜品（需要管理口令）
// - DELETE /api/recipes/:id    删除菜品（需要管理口令）
// - GET /api/health            健康检查

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'adminpassword';
const DATA_FILE = path.join(__dirname, 'recipes.json');
const CATEGORY_FILE = path.join(__dirname, 'categories.json');
const WECHAT_WEBHOOK_KEY = process.env.WECHAT_WEBHOOK_KEY || '2ad7b44b-7a40-4eed-9d77-18ebf5b0134a';

// 默认两道示例菜品（与前端示例一致字段）
const defaultRecipes = [
    {
        id: 1,
        name: '招牌红烧牛肉面',
        category: '主食',
        image: '',
        ingredients: [
            { name: '新鲜牛腱', amount: '500克' },
            { name: '手工拉面', amount: '200克' },
            { name: '生抽', amount: '30毫升' },
            { name: '老抽', amount: '15毫升' },
            { name: '冰糖', amount: '20克' },
            { name: '八角', amount: '2个' },
            { name: '桂皮', amount: '1块' },
            { name: '青菜', amount: '100克' }
        ],
        steps: [
            '将牛腱切成3厘米见方的块，冷水下锅焯水去血沫',
            '热锅放油，下冰糖炒糖色，呈枣红色时加入牛肉块翻炒',
            '加入生抽、老抽、八角、桂皮等香料，翻炒均匀',
            '加入开水没过牛肉，大火烧开后转小火炖煮1.5小时',
            '另起锅烧水，下入拉面煮3分钟至熟',
            '青菜焯水30秒',
            '面条装碗，浇上牛肉汤，摆上牛肉块和青菜即可'
        ],
        notes: '牛肉要选新鲜的，炖煮时间要足够，汤色要红亮',
        cookingTime: 120
    },
    {
        id: 2,
        name: '清汤牛肉面',
        category: '主食',
        image: '',
        ingredients: [
            { name: '牛骨', amount: '1000克' },
            { name: '牛肉', amount: '300克' },
            { name: '拉面', amount: '200克' },
            { name: '白萝卜', amount: '200克' },
            { name: '香菜', amount: '20克' },
            { name: '葱', amount: '30克' },
            { name: '姜', amount: '20克' }
        ],
        steps: [
            '牛骨冷水下锅焯水，去除血沫',
            '将焯好的牛骨放入汤锅，加入葱姜和足量清水',
            '大火烧开后转小火熬煮4小时',
            '牛肉切薄片，白萝卜切片',
            '面条煮熟装碗',
            '浇上清汤，放上牛肉片和萝卜片',
            '撒上香菜和葱花即可'
        ],
        notes: '汤要熬得清澈，不要有杂质',
        cookingTime: 240
    }
];

function loadRecipes() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('读取数据失败:', e);
    }
    saveRecipes(defaultRecipes);
    return defaultRecipes;
}

function saveRecipes(items) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));
        return true;
    } catch (e) {
        console.error('保存数据失败:', e);
        return false;
    }
}

// 分类数据
const defaultCategories = ['主食', '小菜', '汤品', '饮品', '特色菜'];

function loadCategories() {
    try {
        if (fs.existsSync(CATEGORY_FILE)) {
            const data = fs.readFileSync(CATEGORY_FILE, 'utf8');
            const arr = JSON.parse(data);
            if (Array.isArray(arr) && arr.length > 0) return arr;
        }
    } catch (e) {
        console.error('读取分类失败:', e);
    }
    saveCategories(defaultCategories);
    return defaultCategories;
}

function saveCategories(items) {
    try {
        const unique = Array.from(new Set((items || []).map(x => String(x).trim()).filter(Boolean)));
        fs.writeFileSync(CATEGORY_FILE, JSON.stringify(unique, null, 2));
        return true;
    } catch (e) {
        console.error('保存分类失败:', e);
        return false;
    }
}

function unauthorized(res) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: false, message: '未授权' }));
}

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const pathname = urlObj.pathname;

    try {
        if (pathname === '/api/health') {
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, message: 'ok', time: new Date().toISOString() }));
            return;
        }

        // 发送到企业微信 Webhook（参考“配方”项目策略）
        if (pathname === '/api/send-webhook' && req.method === 'POST') {
            let body = '';
            req.on('data', c => body += c.toString());
            req.on('end', () => {
                try {
                    const payload = JSON.parse(body);
                    const postData = JSON.stringify(payload);
                    const options = {
                        hostname: 'qyapi.weixin.qq.com',
                        port: 443,
                        path: `/cgi-bin/webhook/send?key=${WECHAT_WEBHOOK_KEY}`,
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(postData)
                        }
                    };
                    const reqWx = https.request(options, (resWx) => {
                        let data = '';
                        resWx.on('data', chunk => data += chunk);
                        resWx.on('end', () => {
                            let result;
                            try { result = JSON.parse(data); } catch(e) { result = { raw: data }; }
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: true, result }));
                        });
                    });
                    reqWx.on('error', (e) => {
                        res.writeHead(500);
                        res.end(JSON.stringify({ success: false, message: e.message }));
                    });
                    reqWx.write(postData);
                    reqWx.end();
                } catch (e) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ success: false, message: '无效的请求体' }));
                }
            });
            return;
        }

        if (pathname === '/api/recipes' && req.method === 'GET') {
            const list = loadRecipes();
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, data: list, count: list.length }));
            return;
        }

        // 分类列表
        if (pathname === '/api/categories' && req.method === 'GET') {
            const list = loadCategories();
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, data: list }));
            return;
        }
        if (pathname === '/api/categories' && req.method === 'POST') {
            if (req.headers['x-admin-token'] !== ADMIN_TOKEN) return unauthorized(res);
            let body = '';
            req.on('data', c => body += c.toString());
            req.on('end', () => {
                try {
                    const payload = JSON.parse(body || '{}');
                    const name = (payload.name || '').trim();
                    if (!name) { res.writeHead(400); return res.end(JSON.stringify({ success:false, message:'名称不能为空'})); }
                    const list = loadCategories();
                    if (!list.includes(name)) list.push(name);
                    if (saveCategories(list)) {
                        res.writeHead(201);
                        res.end(JSON.stringify({ success:true, data:list }));
                    } else {
                        res.writeHead(500); res.end(JSON.stringify({ success:false, message:'保存失败'}));
                    }
                } catch (e) {
                    res.writeHead(400); res.end(JSON.stringify({ success:false, message:'请求体格式错误' }));
                }
            });
            return;
        }
        if (pathname.startsWith('/api/categories/') && req.method === 'DELETE') {
            if (req.headers['x-admin-token'] !== ADMIN_TOKEN) return unauthorized(res);
            const name = decodeURIComponent(pathname.split('/')[3] || '').trim();
            const list = loadCategories();
            const next = list.filter(x => x !== name);
            if (saveCategories(next)) {
                res.writeHead(200); res.end(JSON.stringify({ success:true, data: next }));
            } else {
                res.writeHead(500); res.end(JSON.stringify({ success:false, message:'删除失败'}));
            }
            return;
        }

        if (pathname === '/api/recipes' && req.method === 'POST') {
            if (req.headers['x-admin-token'] !== ADMIN_TOKEN) return unauthorized(res);
            let body = '';
            req.on('data', c => body += c.toString());
            req.on('end', () => {
                try {
                    const item = JSON.parse(body);
                    const list = loadRecipes();
                    item.id = Date.now();
                    list.push(item);
                    if (saveRecipes(list)) {
                        res.writeHead(201);
                        res.end(JSON.stringify({ success: true, data: item }));
                    } else {
                        res.writeHead(500);
                        res.end(JSON.stringify({ success: false, message: '保存失败' }));
                    }
                } catch (e) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ success: false, message: '请求体格式错误' }));
                }
            });
            return;
        }

        if (pathname.startsWith('/api/recipes/') && req.method === 'PUT') {
            if (req.headers['x-admin-token'] !== ADMIN_TOKEN) return unauthorized(res);
            const idStr = pathname.split('/')[3];
            const id = Number(idStr);
            let body = '';
            req.on('data', c => body += c.toString());
            req.on('end', () => {
                try {
                    const updated = JSON.parse(body);
                    const list = loadRecipes();
                    const index = list.findIndex(r => r.id === id);
                    if (index === -1) {
                        res.writeHead(404);
                        res.end(JSON.stringify({ success: false, message: '未找到' }));
                        return;
                    }
                    updated.id = id;
                    list[index] = updated;
                    if (saveRecipes(list)) {
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: true, data: updated }));
                    } else {
                        res.writeHead(500);
                        res.end(JSON.stringify({ success: false, message: '保存失败' }));
                    }
                } catch (e) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ success: false, message: '请求体格式错误' }));
                }
            });
            return;
        }

        if (pathname.startsWith('/api/recipes/') && req.method === 'DELETE') {
            if (req.headers['x-admin-token'] !== ADMIN_TOKEN) return unauthorized(res);
            const idStr = pathname.split('/')[3];
            const id = Number(idStr);
            const list = loadRecipes();
            const next = list.filter(r => r.id !== id);
            if (next.length === list.length) {
                res.writeHead(404);
                res.end(JSON.stringify({ success: false, message: '未找到' }));
                return;
            }
            if (saveRecipes(next)) {
                res.writeHead(200);
                res.end(JSON.stringify({ success: true }));
            } else {
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, message: '删除失败' }));
            }
            return;
        }

        res.writeHead(404);
        res.end(JSON.stringify({ success: false, message: 'not found' }));
    } catch (e) {
        console.error('API错误:', e);
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, message: 'server error' }));
    }
});

server.listen(PORT, () => {
    console.log(`🍜 出品器API启动: http://localhost:${PORT}`);
    console.log('接口: GET /api/recipes | POST /api/recipes | DELETE /api/recipes/:id | GET /api/health');
    console.log(`数据文件: ${DATA_FILE}`);
});


