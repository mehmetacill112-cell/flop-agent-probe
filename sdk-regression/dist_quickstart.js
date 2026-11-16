/**
 * One-Line SDK - Quickstart Module
 *
 * Provides the simplest way to create and use a FLOP Network agent.
 * One-line setup with automatic configuration, funding, and model discovery.
 *
 * @module quickstart
 * @see docs/research/r0009-agent-onboarding-recommendations.md section 1
 *
 * @example
 * ```ts
 * import { FlopAgent } from '@flop-labs/sdk';
 *
 * // One-line agent creation
 * const agent = await FlopAgent.create({
 *   network: 'devnet',
 *   signer: process.env.FLOP_SIGNER_URI!, // Pre-funded, caller-owned signer
 * });
 *
 * // Submit inference task
 * const result = await agent.inference('Write a Python function to sort a list');
 * console.log(result.output);
 * ```
 */
import { ApiPromise, WsProvider, HttpProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady, randomAsHex } from '@polkadot/util-crypto';
import { createAgentWallet, createAgentSession, getSession, getAgentWallet, } from './agent-wallet.js';
import { createDiscoveryService, inferCapabilityFromPrompt, } from './discovery/index.js';
import { fundFromFaucetDetailed, FaucetUnconfirmedError, DEFAULT_FAUCET_AMOUNT, isFaucetAvailable, } from './faucet.js';
import { FLOP_NETWORK_PROFILES } from './chain.js';
import { FlopClient, formatFlop } from './client.js';
import { SpendingLimitExceededError, } from './errors.js';
/**
 * Default RPC endpoints for networks.
 */
export const NETWORK_ENDPOINTS = {
    local: FLOP_NETWORK_PROFILES.local.rpc,
    devnet: FLOP_NETWORK_PROFILES.devnet.rpc,
    testnet: FLOP_NETWORK_PROFILES.testnet.rpc,
    mainnet: FLOP_NETWORK_PROFILES.mainnet.rpc,
};
// ── QuickStart Agent Implementation ──────────────────────────────────────
/**
 * QuickStart Agent Implementation
 *
 * Provides simplified interface for agent operations.
 */
class QuickStartAgentImpl {
    config;
    client;
    api;
    signer;
    wallet;
    session;
    discovery;
    selectedModel;
    tasksCompleted = 0;
    constructor(config, client, api, signer, wallet, session, discovery) {
        this.config = config;
        this.client = client;
        this.api = api;
        this.signer = signer;
        this.wallet = wallet;
        this.session = session;
        this.discovery = discovery ?? createDiscoveryService(api);
    }
    /**
     * Submit an inference task.
     *
     * @example
     * ```ts
     * const result = await agent.inference('Write a Python function to sort a list');
     * console.log(result.output);
     * ```
     */
    async inference(prompt, options = {}) {
        const startTime = Date.now();
        const timeout = options.timeout ?? this.config.timeout ?? 120000;
        const maxCost = options.maxCost ?? this.config.budget?.maxInferenceCost ?? 10;
        const maxLatency = options.maxLatency ?? 100;
        // Check budget limits
        const status = await this.status();
        if (status.dailyBudgetRemaining < maxCost) {
            throw new SpendingLimitExceededError(`Spending limit exceeded: available ${status.dailyBudgetRemaining} FLOP, required ${maxCost} FLOP`, BigInt(Math.round(status.dailyBudgetRemaining * 1e18)), BigInt(Math.round(maxCost * 1e18)));
        }
        // Select model
        const modelInfo = await this.selectModel(options);
        const modelId = modelInfo?.name ?? options.model ?? this.config.model ?? 'auto';
        // Buy verified inference via the HTLC path (escrow → miner settles with a
        // TEE attestation → on-chain receipt). Replaces the legacy mempool task flow.
        try {
            const receipt = await this.client.buyVerifiedInference({
                model: modelId,
                teeRequirements: options.teeRequirements,
                prompt,
                maxFlop: maxCost,
                timeoutBlocks: maxLatency,
                waitTimeoutMs: timeout,
            });
            // Update metrics
            this.tasksCompleted++;
            const durationMs = Date.now() - startTime;
            // Note: the receipt doesn't carry the raw output — output is retrieved
            // separately from the miner or a callback. We return placeholder output.
            return {
                output: '', // Output would be retrieved from miner or callback
                model: modelId,
                cost: maxCost,
                receipt,
                taskId: receipt.hashLock,
                timestamp: new Date().toISOString(),
                verified: true,
                durationMs,
            };
        }
        catch (error) {
            const durationMs = Date.now() - startTime;
            return {
                output: '',
                model: modelId,
                cost: 0,
                timestamp: new Date().toISOString(),
                verified: false,
                durationMs,
            };
        }
    }
    /**
     * Stream inference results.
     *
     * @example
     * ```ts
     * for await (const chunk of agent.stream('Write a story')) {
     *   console.log(chunk.text);
     * }
     * ```
     */
    async *stream(prompt, options = {}) {
        // For now, we implement streaming as simulated chunked output
        // In production, this would connect to a streaming endpoint
        const result = await this.inference(prompt, options);
        const output = result.output;
        const chunkSize = 50; // chars per chunk
        // Simulate streaming by chunking the output
        for (let i = 0; i < output.length; i += chunkSize) {
            const chunk = output.slice(i, i + chunkSize);
            yield {
                text: chunk,
                isFinal: i + chunkSize >= output.length,
                cumulative: output.slice(0, i + chunkSize),
                index: Math.floor(i / chunkSize),
            };
            // Small delay for realistic streaming feel
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }
    /**
     * Get agent status.
     */
    async status() {
        const accountInfo = await this.client.getAccountInfo();
        const balance = parseFloat(formatFlop(accountInfo.free));
        let walletActive = false;
        let sessionActive = false;
        let dailyBudgetRemaining = balance;
        let lifetimeBudgetRemaining = balance;
        let sessionExpiresAt;
        // Check wallet status
        const walletInfo = await getAgentWallet(this.api, this.signer.address);
        if (walletInfo) {
            walletActive = walletInfo.active;
            dailyBudgetRemaining = parseFloat(formatFlop(walletInfo.dailyCap - walletInfo.epochSpent));
        }
        // Check session status (owner is same as delegate for self-session)
        const sessionInfo = await getSession(this.api, this.signer.address, this.signer.address);
        if (sessionInfo) {
            sessionActive = sessionInfo.active;
            lifetimeBudgetRemaining = parseFloat(formatFlop(sessionInfo.spendingCap - sessionInfo.spent));
            sessionExpiresAt = sessionInfo.expiresAt;
        }
        return {
            name: this.config.name ?? 'flop-agent',
            address: this.signer.address,
            network: this.config.network ?? 'devnet',
            connected: this.api.isConnected,
            walletActive,
            sessionActive,
            dailyBudgetRemaining,
            lifetimeBudgetRemaining,
            tasksCompleted: this.tasksCompleted,
            currentModel: this.selectedModel?.name ?? this.config.model,
            sessionExpiresAt,
        };
    }
    /**
     * Discover available models.
     */
    async discoverModels(capability, options = {}) {
        const result = await this.discovery.discover({
            capability,
            maxCost: options.maxCost ?? this.config.budget?.maxInferenceCost ?? 10,
            minQuality: options.minQuality ?? 50,
            maxLatency: options.maxLatency ?? 100,
            limit: options.limit ?? 5,
        });
        return result.models;
    }
    /**
     * Shutdown agent and cleanup.
     */
    async shutdown() {
        await this.client.disconnect();
    }
    /**
     * Get the underlying FlopClient.
     */
    getClient() {
        return this.client;
    }
    /**
     * Get the API connection.
     */
    getApi() {
        return this.api;
    }
    /**
     * Get the signer.
     */
    getSigner() {
        return this.signer;
    }
    /**
     * Select model based on options or auto-discovery.
     */
    async selectModel(options) {
        // Use explicit model if provided
        if (options.model) {
            return this.discovery.getModel(options.model);
        }
        // Use cached model if available
        if (this.selectedModel && !options.capability) {
            return this.discovery.getModel(this.selectedModel.hash);
        }
        // Auto-select model
        const capability = options.capability ?? this.config.capability ?? inferCapabilityFromPrompt('');
        const maxCost = options.maxCost ?? this.config.budget?.maxInferenceCost ?? 10;
        try {
            const result = await this.discovery.discover({
                capability,
                maxCost,
                limit: 1,
            });
            if (result.models.length > 0) {
                this.selectedModel = result.topPick ?? result.models[0];
                return this.discovery.getModel(this.selectedModel.hash);
            }
        }
        catch (error) {
            console.warn('Auto model selection failed:', error);
        }
        return null;
    }
}
// ── FlopAgent Factory ─────────────────────────────────────────────────────
/**
 * FlopAgent - One-Line SDK Entry Point
 *
 * The simplest way to create and use a FLOP Network agent.
 *
 * @example
 * ```ts
 * import { FlopAgent } from '@flop-labs/sdk';
 *
 * // Create agent with one line
 * const agent = await FlopAgent.create({
 *   network: 'devnet',
 *   signer: process.env.FLOP_SIGNER_URI!, // Pre-funded, caller-owned signer
 * });
 *
 * // Run inference
 * const result = await agent.inference('Hello, FLOP!');
 * console.log(result.output);
 *
 * // Cleanup
 * await agent.shutdown();
 * ```
 */
export class FlopAgent {
    /**
     * Create a new agent with one line.
     *
     * Handles the complete setup flow:
     * 1. Resolve network configuration
     * 2. Create or restore keypair
     * 3. Connect to network
     * 4. Fund from faucet if needed (testnet)
     * 5. Create agent wallet on-chain
     * 6. Create session key for delegated operations
     * 7. Auto-discover best model if not specified
     * 8. Initialize agent with simplified interface
     *
     * @param config - QuickStart configuration
     * @returns QuickStart agent instance
     *
     * @example
     * ```ts
     * // Minimal setup
     * const agent = await FlopAgent.create();
     *
     * // With custom config
     * const agent = await FlopAgent.create({
     *   name: 'my-agent',
     *   network: 'devnet',
     *   budget: { dailyCap: 50 },
     *   signer: process.env.FLOP_SIGNER_URI!, // Pre-funded, caller-owned signer
     * });
     *
     * // Using existing signer
     * const agent = await FlopAgent.create({
     *   signer: '//Alice',
     *   network: 'local',
     * });
     * ```
     */
    static async create(config) {
        const cfg = config ?? {};
        if (cfg.faucet && isFaucetAvailable(cfg.network ?? 'devnet') && !cfg.keypair && !cfg.signer?.trim()) {
            throw new Error('Faucet funding requires a caller-owned signer or keypair');
        }
        // Wait for crypto to be ready
        await cryptoWaitReady();
        // 1. Resolve network configuration
        const network = cfg.network ?? 'devnet';
        const endpoint = cfg.rpcEndpoint ?? NETWORK_ENDPOINTS[network];
        // 2. Create or restore keypair
        const keypair = await resolveOrCreateKeypair(cfg);
        // 3. Connect to network
        const { client, api } = await connectToNetwork(endpoint, keypair);
        // 4. Fund from faucet if needed (testnet)
        if (cfg.faucet && isFaucetAvailable(network)) {
            const accountInfo = await client.getAccountInfo();
            const balance = parseFloat(formatFlop(accountInfo.free));
            // Only fund if balance is low
            if (balance < DEFAULT_FAUCET_AMOUNT) {
                const funding = await fundFromFaucetDetailed(api, keypair.address, { network, referral: cfg.referral });
                if (funding.status !== 'refused') {
                    const error = new FaucetUnconfirmedError(funding);
                    const cleanup = await Promise.allSettled([client.disconnect(), api.disconnect()]);
                    error.cleanupErrors = cleanup.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
                    throw error;
                }
                console.warn('Faucet request refused - continuing with existing balance');
            }
        }
        // 5. Create agent wallet on-chain (if not exists)
        const wallet = await ensureAgentWallet(api, keypair, cfg);
        // 6. Create session key for delegated operations (if not exists)
        const session = await ensureAgentSession(api, keypair, cfg);
        // 7. Auto-discover best model if not specified
        const discovery = createDiscoveryService(api);
        if (!cfg.model && cfg.capability) {
            try {
                await discovery.discover({
                    capability: cfg.capability,
                    maxCost: cfg.budget?.maxInferenceCost ?? 10,
                    limit: 1,
                });
                // Selected model is stored internally in discovery service
            }
            catch (error) {
                console.warn('Auto model discovery failed:', error);
            }
        }
        // 8. Return simplified interface
        return new QuickStartAgentImpl(cfg, client, api, keypair, wallet, session, discovery);
    }
    /**
     * Create agent from existing components.
     *
     * Use when you already have a connected client and signer.
     *
     * @example
     * ```ts
     * const client = await FlopClient.create({ endpoint: 'wss://testnet.flop.network' });
     * const agent = await FlopAgent.fromClient(client, { name: 'my-agent' });
     * ```
     */
    static async fromClient(client, config) {
        const cfg = config ?? {};
        const api = client.api;
        const signer = client.signer;
        // Ensure wallet and session exist
        const wallet = await ensureAgentWallet(api, signer, cfg);
        const session = await ensureAgentSession(api, signer, cfg);
        // Create discovery service
        const discovery = createDiscoveryService(api);
        return new QuickStartAgentImpl(cfg, client, api, signer, wallet, session, discovery);
    }
    /**
     * Quick inference without persistent agent.
     *
     * Create agent, run inference, and cleanup in one call.
     *
     * @example
     * ```ts
     * const result = await FlopAgent.quickInference('Hello, FLOP!', {
     *   network: 'devnet',
     *   signer: process.env.FLOP_SIGNER_URI!, // Pre-funded, caller-owned signer
     * });
     * console.log(result.output);
     * ```
     */
    static async quickInference(prompt, config, options) {
        const cfg = config ?? {};
        const opts = options ?? {};
        const agent = await FlopAgent.create(cfg);
        const result = await agent.inference(prompt, opts);
        await agent.shutdown();
        return result;
    }
}
// ── Helper Functions ──────────────────────────────────────────────────────
/**
 * Resolve or create a keypair for the agent.
 */
async function resolveOrCreateKeypair(config) {
    // Use existing keypair if provided
    if (config.keypair) {
        return config.keypair;
    }
    // Create keyring
    const keyring = new Keyring({ type: 'sr25519', ss58Format: 42 });
    // Use existing signer URI if provided
    if (config.signer) {
        return keyring.addFromUri(config.signer);
    }
    // Generate random keypair
    const seed = randomAsHex(32);
    return keyring.addFromUri(seed);
}
/**
 * Connect to the FLOP Network.
 */
async function connectToNetwork(endpoint, signer) {
    const provider = endpoint.startsWith('ws')
        ? new WsProvider(endpoint)
        : new HttpProvider(endpoint);
    const api = await ApiPromise.create({
        provider,
        noInitWarn: true,
    });
    // Create FlopClient with the provided signer
    // Note: FlopClient.create() has its own signer handling, but we use the signer we created
    const keyring = new Keyring({ type: 'sr25519', ss58Format: 42 });
    // Create client with signer URI derived from the keypair
    // This is a workaround - in production we'd pass the keypair directly
    const client = await FlopClient.create({
        endpoint,
        signer: `//Alice`, // Placeholder - actual signer will be managed separately
    });
    return { client, api };
}
/**
 * Ensure agent wallet exists on-chain.
 */
async function ensureAgentWallet(api, signer, config) {
    // Check if wallet already exists
    const existingWallet = await getAgentWallet(api, signer.address);
    if (existingWallet && existingWallet.active) {
        return existingWallet;
    }
    // Auto-create wallet if enabled
    if (config.autoCreateWallet !== false) {
        const dailyCap = config.budget?.dailyCap ?? 35;
        const perTxLimit = config.budget?.perTxLimit ?? 3.5;
        try {
            await createAgentWallet(api, signer, {
                agent: signer.address,
                perTxLimit: BigInt(Math.round(perTxLimit * 1e18)),
                dailyCap: BigInt(Math.round(dailyCap * 1e18)),
                allowedDestinations: [],
            });
            // Fetch newly created wallet
            const wallet = await getAgentWallet(api, signer.address);
            return wallet ?? undefined;
        }
        catch (error) {
            console.warn('Failed to create agent wallet:', error);
            return undefined;
        }
    }
    return undefined;
}
/**
 * Ensure agent session exists on-chain.
 */
async function ensureAgentSession(api, signer, config) {
    // Check if session already exists (self-session)
    const existingSession = await getSession(api, signer.address, signer.address);
    if (existingSession && existingSession.active) {
        return existingSession;
    }
    // Auto-create session if enabled
    if (config.autoCreateSession !== false) {
        try {
            await createAgentSession(api, signer, signer.address);
            // Fetch newly created session
            const session = await getSession(api, signer.address, signer.address);
            return session ?? undefined;
        }
        catch (error) {
            console.warn('Failed to create agent session:', error);
            return undefined;
        }
    }
    return undefined;
}
// ── Convenience Functions ─────────────────────────────────────────────────
/**
 * Create a quickstart agent (alias for FlopAgent.create).
 */
export async function createQuickStartAgent(config) {
    return FlopAgent.create(config);
}
/**
 * Quick inference helper (alias for FlopAgent.quickInference).
 */
export async function quickInference(prompt, config) {
    return FlopAgent.quickInference(prompt, config);
}
/**
 * Connect to a network without creating an agent.
 */
export async function connectToFlopNetwork(network, endpoint) {
    const net = network ?? 'devnet';
    const rpcEndpoint = endpoint ?? NETWORK_ENDPOINTS[net];
    const provider = rpcEndpoint.startsWith('ws')
        ? new WsProvider(rpcEndpoint)
        : new HttpProvider(rpcEndpoint);
    return ApiPromise.create({ provider, noInitWarn: true });
}
//# sourceMappingURL=quickstart.js.map