import { readFileSync, existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import type { AppConfig, VisionProvider } from './types.js';

let config: AppConfig;

const DEFAULT_VISION_BASE_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_VISION_MODEL = 'gpt-4o-mini';
const DEFAULT_MODELSCOPE_BASE_URL = 'https://api-inference.modelscope.cn/v1/chat/completions';
const DEFAULT_MODELSCOPE_MODEL = 'Qwen/Qwen2.5-VL-72B-Instruct';

function parseBooleanEnv(value: string | undefined): boolean | undefined {
    if (value === undefined) return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    return undefined;
}

function ensureVisionConfig(): NonNullable<AppConfig['vision']> {
    if (!config.vision) {
        config.vision = {
            enabled: true,
            mode: 'ocr',
            providers: [],
            fallbackToOcr: true,
            baseUrl: DEFAULT_VISION_BASE_URL,
            apiKey: '',
            model: DEFAULT_VISION_MODEL,
        };
    }
    return config.vision;
}

function isModelScopeProvider(provider: VisionProvider): boolean {
    const haystack = `${provider.name || ''} ${provider.baseUrl || ''}`.toLowerCase();
    return haystack.includes('modelscope') || haystack.includes('api-inference.modelscope.cn');
}

function createModelScopeProvider(): VisionProvider {
    return {
        name: 'modelscope',
        baseUrl: process.env.MODELSCOPE_BASE_URL || DEFAULT_MODELSCOPE_BASE_URL,
        apiKey: process.env.MODELSCOPE_API_KEY || process.env.MODELSCOPE_API_TOKEN || '',
        model: process.env.MODELSCOPE_MODEL || DEFAULT_MODELSCOPE_MODEL,
    };
}

function applyVisionEnvOverrides() {
    const hasVisionEnvOverrides = [
        process.env.VISION_ENABLED,
        process.env.VISION_MODE,
        process.env.VISION_FALLBACK_TO_OCR,
        process.env.VISION_BASE_URL,
        process.env.VISION_API_KEY,
        process.env.VISION_MODEL,
        process.env.MODELSCOPE_API_KEY,
        process.env.MODELSCOPE_API_TOKEN,
        process.env.MODELSCOPE_BASE_URL,
        process.env.MODELSCOPE_MODEL,
    ].some(value => value !== undefined);

    if (!config.vision && !hasVisionEnvOverrides) return;

    const vision = ensureVisionConfig();

    const envEnabled = parseBooleanEnv(process.env.VISION_ENABLED);
    if (envEnabled !== undefined) vision.enabled = envEnabled;

    const envMode = process.env.VISION_MODE;
    if (envMode === 'ocr' || envMode === 'api') vision.mode = envMode;

    const envFallback = parseBooleanEnv(process.env.VISION_FALLBACK_TO_OCR);
    if (envFallback !== undefined) vision.fallbackToOcr = envFallback;

    if (process.env.VISION_BASE_URL) vision.baseUrl = process.env.VISION_BASE_URL;
    if (process.env.VISION_API_KEY) vision.apiKey = process.env.VISION_API_KEY;
    if (process.env.VISION_MODEL) vision.model = process.env.VISION_MODEL;

    if (vision.providers.length === 1) {
        const provider = { ...vision.providers[0] };
        if (process.env.VISION_BASE_URL) provider.baseUrl = process.env.VISION_BASE_URL;
        if (process.env.VISION_API_KEY) provider.apiKey = process.env.VISION_API_KEY;
        if (process.env.VISION_MODEL) provider.model = process.env.VISION_MODEL;
        vision.providers = [provider];
    }

    const hasModelScopeEnv = [
        process.env.MODELSCOPE_API_KEY,
        process.env.MODELSCOPE_API_TOKEN,
        process.env.MODELSCOPE_BASE_URL,
        process.env.MODELSCOPE_MODEL,
    ].some(value => value !== undefined);

    if (!hasModelScopeEnv) return;

    const modelscopeProvider = createModelScopeProvider();
    let hasExistingModelScopeProvider = false;

    vision.providers = vision.providers.map(provider => {
        if (!isModelScopeProvider(provider)) return provider;
        hasExistingModelScopeProvider = true;
        return {
            ...provider,
            baseUrl: process.env.MODELSCOPE_BASE_URL || provider.baseUrl || modelscopeProvider.baseUrl,
            apiKey: process.env.MODELSCOPE_API_KEY || process.env.MODELSCOPE_API_TOKEN || provider.apiKey,
            model: process.env.MODELSCOPE_MODEL || provider.model || modelscopeProvider.model,
        };
    });

    if (vision.mode === 'api' && !hasExistingModelScopeProvider) {
        vision.providers.unshift(modelscopeProvider);
    }

    if (!vision.baseUrl || isModelScopeProvider({ name: 'legacy', baseUrl: vision.baseUrl, apiKey: vision.apiKey, model: vision.model })) {
        vision.baseUrl = process.env.MODELSCOPE_BASE_URL || vision.baseUrl || modelscopeProvider.baseUrl;
    }
    if (!vision.apiKey) {
        vision.apiKey = process.env.MODELSCOPE_API_KEY || process.env.MODELSCOPE_API_TOKEN || vision.apiKey;
    }
    if (!vision.model || vision.model === DEFAULT_VISION_MODEL) {
        vision.model = process.env.MODELSCOPE_MODEL || vision.model || modelscopeProvider.model;
    }
}

export function getConfig(): AppConfig {
    if (config) return config;

    // 默认配置
    config = {
        port: 3010,
        timeout: 120,
        cursorModel: 'anthropic/claude-sonnet-4.6',
        enableThinking: true,
        fingerprint: {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        },
    };

    // 从 config.yaml 加载
    if (existsSync('config.yaml')) {
        try {
            const raw = readFileSync('config.yaml', 'utf-8');
            const yaml = parseYaml(raw);
            if (yaml.port) config.port = yaml.port;
            if (yaml.timeout) config.timeout = yaml.timeout;
            if (yaml.proxy) config.proxy = yaml.proxy;
            if (yaml.cursor_model) config.cursorModel = yaml.cursor_model;
            if (yaml.enable_thinking !== undefined) config.enableThinking = yaml.enable_thinking;
            if (yaml.fingerprint) {
                if (yaml.fingerprint.user_agent) config.fingerprint.userAgent = yaml.fingerprint.user_agent;
            }
            if (yaml.vision) {
                // Parse providers array
                let providers: VisionProvider[] = [];
                if (Array.isArray(yaml.vision.providers)) {
                    providers = yaml.vision.providers.map((p: any) => ({
                        name: p.name || '',
                        baseUrl: p.base_url || DEFAULT_VISION_BASE_URL,
                        apiKey: p.api_key || '',
                        model: p.model || DEFAULT_VISION_MODEL,
                    }));
                } else if (yaml.vision.base_url && yaml.vision.api_key) {
                    // Backward compat: single provider from legacy fields
                    providers = [{
                        name: 'default',
                        baseUrl: yaml.vision.base_url,
                        apiKey: yaml.vision.api_key,
                        model: yaml.vision.model || DEFAULT_VISION_MODEL,
                    }];
                }

                config.vision = {
                    enabled: yaml.vision.enabled !== false,
                    mode: yaml.vision.mode || 'ocr',
                    providers,
                    fallbackToOcr: yaml.vision.fallback_to_ocr !== false, // default true
                    baseUrl: yaml.vision.base_url || DEFAULT_VISION_BASE_URL,
                    apiKey: yaml.vision.api_key || '',
                    model: yaml.vision.model || DEFAULT_VISION_MODEL,
                };
            }
        } catch (e) {
            console.warn('[Config] 读取 config.yaml 失败:', e);
        }
    }

    // 环境变量覆盖
    if (process.env.PORT) config.port = parseInt(process.env.PORT);
    if (process.env.TIMEOUT) config.timeout = parseInt(process.env.TIMEOUT);
    if (process.env.PROXY) config.proxy = process.env.PROXY;
    if (process.env.CURSOR_MODEL) config.cursorModel = process.env.CURSOR_MODEL;
    if (process.env.ENABLE_THINKING !== undefined) config.enableThinking = process.env.ENABLE_THINKING !== 'false';

    applyVisionEnvOverrides();

    // 从 base64 FP 环境变量解析指纹
    if (process.env.FP) {
        try {
            const fp = JSON.parse(Buffer.from(process.env.FP, 'base64').toString());
            if (fp.userAgent) config.fingerprint.userAgent = fp.userAgent;
        } catch (e) {
            console.warn('[Config] 解析 FP 环境变量失败:', e);
        }
    }

    return config;
}
