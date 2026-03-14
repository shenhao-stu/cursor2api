/**
 * Cursor2API v2 - 入口
 *
 * 将 Cursor 文档页免费 AI 接口代理为 Anthropic Messages API
 * 通过提示词注入让 Claude Code 拥有完整工具调用能力
 */

import 'dotenv/config';
import { createRequire } from 'module';
import express, { type RequestHandler } from 'express';
import { getConfig } from './config.js';
import { handleMessages, listModels, countTokens } from './handler.js';
import { handleOpenAIChatCompletions, handleOpenAIResponses } from './openai-handler.js';

// 从 package.json 读取版本号，统一来源，避免多处硬编码
const require = createRequire(import.meta.url);
const { version: VERSION } = require('../package.json') as { version: string };


const app = express();
const config = getConfig();
const inboundApiToken = process.env.CURSOR2API_INBOUND_API_TOKEN || process.env.API_AUTH_TOKEN || process.env.API_TOKEN;

if (!inboundApiToken) {
    throw new Error(
        'Missing inbound API token. Set CURSOR2API_INBOUND_API_TOKEN (preferred) or API_AUTH_TOKEN / API_TOKEN before starting cursor2api.'
    );
}

const requireInboundApiToken: RequestHandler = (req, res, next) => {
    const authorization = req.header('authorization')?.trim();
    const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
    const bearerToken = bearerMatch?.[1]?.trim();
    const apiKeyToken = req.header('x-api-key')?.trim();
    const providedTokens = [bearerToken, apiKeyToken].filter((token): token is string => Boolean(token));

    if (!providedTokens.some(token => token === inboundApiToken)) {
        res.setHeader('WWW-Authenticate', 'Bearer');
        res.status(401).json({
            error: {
                message: 'Unauthorized',
                type: 'authentication_error',
            },
        });
        return;
    }

    next();
};

// 解析 JSON body（增大限制以支持 base64 图片，单张图片可达 10MB+）
app.use(express.json({ limit: '50mb' }));

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', req.header('access-control-request-headers') || 'Authorization, Content-Type, X-API-Key');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
    }
    next();
});

// ==================== 路由 ====================

// Anthropic Messages API
app.post('/v1/messages', requireInboundApiToken, handleMessages);
app.post('/messages', requireInboundApiToken, handleMessages);

// OpenAI Chat Completions API（兼容）
app.post('/v1/chat/completions', requireInboundApiToken, handleOpenAIChatCompletions);
app.post('/chat/completions', requireInboundApiToken, handleOpenAIChatCompletions);

// OpenAI Responses API（Cursor IDE Agent 模式）
app.post('/v1/responses', requireInboundApiToken, handleOpenAIResponses);
app.post('/responses', requireInboundApiToken, handleOpenAIResponses);

// Token 计数
app.post('/v1/messages/count_tokens', requireInboundApiToken, countTokens);
app.post('/messages/count_tokens', requireInboundApiToken, countTokens);

// OpenAI 兼容模型列表
app.get('/v1/models', requireInboundApiToken, listModels);

// 健康检查
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: VERSION });
});

// 根路径
app.get('/', (_req, res) => {
    res.json({
        name: 'cursor2api',
        version: VERSION,
        description: 'Cursor Docs AI → Anthropic & OpenAI & Cursor IDE API Proxy',
        auth: {
            enabled: true,
            required: true,
            env: 'CURSOR2API_INBOUND_API_TOKEN',
            accepted_headers: [
                'Authorization: Bearer <token>',
                'x-api-key: <token>',
            ],
            open_endpoints: ['GET /', 'GET /health'],
        },
        endpoints: {
            anthropic_messages: 'POST /v1/messages',
            openai_chat: 'POST /v1/chat/completions',
            openai_responses: 'POST /v1/responses',
            models: 'GET /v1/models',
            health: 'GET /health',
        },
        usage: {
            claude_code: 'export ANTHROPIC_BASE_URL=http://localhost:' + config.port,
            claude_code_auth_token: 'export ANTHROPIC_AUTH_TOKEN=$CURSOR2API_INBOUND_API_TOKEN',
            openai_compatible: 'OPENAI_BASE_URL=http://localhost:' + config.port + '/v1',
            openai_compatible_api_key: 'OPENAI_API_KEY=$CURSOR2API_INBOUND_API_TOKEN',
            cursor_ide: 'OPENAI_BASE_URL=http://localhost:' + config.port + '/v1 && OPENAI_API_KEY=$CURSOR2API_INBOUND_API_TOKEN (选用 Claude 模型)',
        },
    });
});

// ==================== 启动 ====================

const server = app.listen(config.port, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════╗');
    console.log(`  ║        Cursor2API v${VERSION.padEnd(21)}║`);
    console.log('  ╠══════════════════════════════════════╣');
    console.log(`  ║  Server:  http://localhost:${config.port}      ║`);
    console.log('  ║  Model:   ' + config.cursorModel.padEnd(26) + '║');
    console.log('  ╠══════════════════════════════════════╣');
    console.log('  ║  API Endpoints:                      ║');
    console.log('  ║  • Anthropic: /v1/messages            ║');
    console.log('  ║  • OpenAI:   /v1/chat/completions     ║');
    console.log('  ║  • Cursor:   /v1/responses            ║');
    console.log('  ╠══════════════════════════════════════╣');
    console.log('  ║  Claude Code:                        ║');
    console.log(`  ║  export ANTHROPIC_BASE_URL=           ║`);
    console.log(`  ║    http://localhost:${config.port}              ║`);
    console.log('  ║  OpenAI / Cursor IDE:                 ║');
    console.log(`  ║  OPENAI_BASE_URL=                     ║`);
    console.log(`  ║    http://localhost:${config.port}/v1            ║`);
    console.log('  ╚══════════════════════════════════════╝');
    console.log('');
});

// 解除 Node.js HTTP Server 的默认超时限制，防止长时 AI 流式输出被本地掐断
server.timeout = 0; 
server.keepAliveTimeout = 120 * 1000;
server.headersTimeout = 125 * 1000;
