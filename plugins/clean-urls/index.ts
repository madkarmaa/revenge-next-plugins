import { onFluxEventDispatched } from '@revenge-mod/discord/flux';
import {
    getJsonStorage,
    pluginStoragePathFor
} from '@revenge-mod/json-storage';
import { getModules } from '@revenge-mod/modules/finders';
import { withName, withProps } from '@revenge-mod/modules/finders/filters';
import { before, instead } from '@revenge-mod/patcher';
import SettingsComponent from './settings';

// https://gitlab.com/ClearURLs/Rules
export const ListUrl = 'https://rules2.clearurls.xyz/data.minify.json';
const PluginId = 'madkarma.clean-urls';

export interface Settings {
    redirect: boolean;
    referrals: boolean;
}

interface Provider {
    urlPattern?: string;
    rules?: string[];
    rawRules?: string[];
    referralMarketing?: string[];
    exceptions?: string[];
    redirections?: string[];
}

export interface RulesType {
    providers: Record<string, Provider>;
}

interface RulesData {
    rules: RulesType | null;
    lastModified: string | null;
}

const DefaultSettings: Settings = {
    redirect: true,
    referrals: false
};

const RulesStorage = getJsonStorage<RulesData>(
    pluginStoragePathFor(PluginId, 'rules.json'),
    {
        default: { rules: null, lastModified: null },
        load: true
    }
);

async function updateRules(logger?: { warn(...args: unknown[]): void }) {
    try {
        const { lastModified } =
            (RulesStorage.cache as RulesData | undefined) ?? {};

        const res = await fetch(ListUrl, {
            headers: lastModified
                ? ({ 'if-modified-since': lastModified } as HeadersInit)
                : {}
        });

        if (!res.ok) return;

        const rules = (await res.json()) as RulesType;
        await RulesStorage.set({
            rules,
            lastModified: res.headers.get('last-modified')
        });
    } catch (e) {
        logger?.warn(`Clean URLs: failed to update rules: ${e}`);
    }
}

function toURL(url: URL) {
    const str = url.toString();
    if (url.pathname === '/' && str.endsWith('/')) return str.slice(0, -1);
    return str;
}

function applyProvider(provider: Provider, urlObj: URL, config: Settings) {
    const url = urlObj.toString();
    const query = [...urlObj.searchParams.keys()];

    if (config.redirect && provider.redirections) {
        const redirect = provider.redirections.find((reg) =>
            url.match(new RegExp(reg, 'i'))
        );
        const red = redirect && url.match(new RegExp(redirect, 'i'))?.[1];
        if (red) return cleanUrl(decodeURIComponent(red), config);
    }

    if (provider.rawRules && query.length > 0) {
        for (const rule of provider.rawRules)
            urlObj.search = urlObj.search.replace(new RegExp(rule, 'gi'), '');
    }

    const toRemove: string[] = [
        ...(provider.rules ?? []),
        ...(config.referrals ? (provider.referralMarketing ?? []) : [])
    ];

    if (toRemove.length > 0 && query.length > 0) {
        for (const rule of toRemove)
            for (const key of query)
                if (new RegExp(`^${rule}$`, 'i').test(key))
                    urlObj.searchParams.delete(key);
    }

    return toURL(urlObj);
}

export function cleanUrl(url: string, config: Settings) {
    const { rules } = (RulesStorage.cache as RulesData | undefined) ?? {};
    if (!rules?.providers) return url;

    let urlObj: URL;
    try {
        urlObj = new URL(url);
    } catch {
        return url;
    }

    for (const provider of Object.values(rules.providers)) {
        if (!provider.urlPattern) continue;
        if (!new RegExp(provider.urlPattern, 'i').test(url)) continue;
        if (provider.exceptions?.some((reg) => new RegExp(reg, 'i').test(url)))
            continue;

        try {
            urlObj = new URL(applyProvider(provider, urlObj, config));
        } catch {
            return toURL(urlObj);
        }
    }

    return toURL(urlObj);
}

const UrlRegex = /https?:\/\/[^\s<>"'`)\]]+/g;

function cleanText(text: string, config: Settings) {
    return text.replace(UrlRegex, (match) => {
        const trimmed = match.replace(/[.,!?:;)\]}'"]+$/, '');
        const trail = match.slice(trimmed.length);
        try {
            return cleanUrl(new URL(trimmed).toString(), config) + trail;
        } catch {
            return match;
        }
    });
}

function getConfig(cache: Settings | undefined): Settings {
    return {
        redirect: cache?.redirect ?? DefaultSettings.redirect,
        referrals: cache?.referrals ?? DefaultSettings.referrals
    };
}

interface MessageData {
    content?: string;
}

interface ContentNode {
    type?: string;
    target?: unknown;
    url?: unknown;
    href?: unknown;
    content?: unknown;
    items?: unknown;
    message?: unknown;
}

function cleanNode(node: ContentNode, config: Settings) {
    if (typeof node.target === 'string')
        node.target = cleanText(node.target, config);
    if (typeof node.url === 'string') node.url = cleanText(node.url, config);
    if (typeof node.href === 'string') node.href = cleanText(node.href, config);

    if (typeof node.content === 'string')
        node.content = cleanText(node.content, config);
    else if (Array.isArray(node.content)) cleanNodes(node.content, config);

    if (Array.isArray(node.items)) cleanNodes(node.items, config);

    if (node.message && typeof node.message === 'object') {
        const msg = node.message as { content?: unknown };
        if (typeof msg.content === 'string')
            msg.content = cleanText(msg.content, config);
        else if (Array.isArray(msg.content)) cleanNodes(msg.content, config);
    }
}

function cleanNodes(nodes: unknown[], config: Settings) {
    for (const node of nodes) {
        if (typeof node === 'string') continue;
        if (node && typeof node === 'object')
            cleanNode(node as ContentNode, config);
    }
    return nodes;
}

interface ChatManager {
    prototype: {
        createRow(row: unknown): void;
    };
}

interface MessageActionCreators {
    sendMessage(
        channelId: string,
        data: MessageData,
        ...rest: unknown[]
    ): unknown;
    editMessage(
        channelId: string,
        messageId: string,
        data: MessageData,
        ...rest: unknown[]
    ): unknown;
}

export default plugin<{ jsonStorage: Settings }>({
    jsonStorage: {
        load: true,
        default: DefaultSettings
    },

    start({ cleanup, jsonStorage: storage, logger }) {
        void updateRules(logger);
        cleanup(
            onFluxEventDispatched(
                'CONNECTION_OPEN',
                () => void updateRules(logger)
            )
        );

        cleanup(
            getModules(
                withProps<MessageActionCreators>('sendMessage', 'editMessage'),
                (Messages) =>
                    cleanup(
                        before(Messages, 'sendMessage', (args) => {
                            const data = args[1] as MessageData | undefined;
                            if (data?.content)
                                data.content = cleanText(
                                    data.content,
                                    getConfig(
                                        storage.cache as Settings | undefined
                                    )
                                );
                            return args;
                        }),

                        before(Messages, 'editMessage', (args) => {
                            const data = args[2] as MessageData | undefined;
                            if (data?.content)
                                data.content = cleanText(
                                    data.content,
                                    getConfig(
                                        storage.cache as Settings | undefined
                                    )
                                );
                            return args;
                        })
                    )
            ),

            getModules(withName<ChatManager>('ChatManager'), (ChatManager) =>
                cleanup(
                    instead(
                        ChatManager.prototype,
                        'createRow',
                        function (args, orig) {
                            const config = getConfig(
                                storage.cache as Settings | undefined
                            );
                            try {
                                const [row] = args as [unknown];
                                if (row && typeof row === 'object')
                                    cleanNode(row as ContentNode, config);
                            } catch (e) {
                                logger.warn(
                                    `Clean URLs: failed to clean row: ${e}`
                                );
                            }
                            return Reflect.apply(orig, this, args);
                        }
                    )
                )
            )
        );
    },
    SettingsComponent
});
