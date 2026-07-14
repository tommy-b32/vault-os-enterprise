(() => {
  'use strict';

  if (window.__tfvVaultOsBrainLoaded) return;
  window.__tfvVaultOsBrainLoaded = true;

  const MEMORY_KEY = 'tfvVaultOsBrainMemoryV1';
  const DECISION_HOLD_DEFAULT = 1800;
  const RECENT_MESSAGE_LIMIT = 8;

  const defaultMemory = () => ({
    viewedProducts: [],
    productsViewed: 0,
    securedItems: 0,
    qualifyingItems: 0,
    qualifyingPairs: 0,
    securedSaving: 0,
    highestSaving: 0,
    vaultCareActive: false,
    bundleUnlocked: false,
    heardMessages: {},
    recentMessages: [],
    lastEvent: '',
    lastMessageId: '',
    activeDecision: null,
    activeDecisionUntil: 0,
    activePipeline: null,
    operatorState: 'idle'
  });

  const surfaces = new Map();

  function readMemory() {
    try {
      const stored =
        window.sessionStorage.getItem(
          MEMORY_KEY
        );

      if (!stored) {
        return defaultMemory();
      }

      return {
        ...defaultMemory(),
        ...JSON.parse(stored)
      };
    } catch (error) {
      return defaultMemory();
    }
  }

  function writeMemory(memory) {
    try {
      window.sessionStorage.setItem(
        MEMORY_KEY,
        JSON.stringify(memory)
      );
    } catch (error) {
      console.warn(
        '[Vault OS Brain] Session memory unavailable:',
        error
      );
    }
  }

  function normaliseContext(payload = {}) {
    return {
      cartItems:
        Math.max(
          0,
          Number(payload.cartItems) || 0
        ),

      qualifyingItems:
        Math.max(
          0,
          Number(payload.qualifyingItems) || 0
        ),

      qualifyingPairs:
        Math.max(
          0,
          Number(payload.qualifyingPairs) || 0
        ),

      securedSaving:
        Math.max(
          0,
          Number(payload.securedSaving) || 0
        ),

      vaultCareActive:
        Boolean(payload.vaultCareActive),

      offerEligible:
        Boolean(payload.offerEligible),

      returningVisitor:
        Boolean(payload.returningVisitor),

      configuration:
        payload.configuration ||
        'Selected configuration',

      available:
        payload.available !== false,

      productPath:
        payload.productPath ||
        window.location.pathname,

      operation:
        payload.operation ||
        '',

      bundleUnlocked:
        Boolean(payload.bundleUnlocked),

      source:
        payload.source ||
        'unknown'
    };
  }

  function updateMemory(
    type,
    context
  ) {
    const memory =
      readMemory();

    if (
      type === 'product-view' ||
      type === 'session-start'
    ) {
      const productPath =
        context.productPath;

      if (
        productPath &&
        !memory.viewedProducts.includes(
          productPath
        )
      ) {
        memory.viewedProducts.push(
          productPath
        );
      }

      memory.productsViewed =
        memory.viewedProducts.length;
    }

    memory.securedItems =
      Math.max(
        context.cartItems,
        memory.securedItems || 0
      );

    memory.qualifyingItems =
      context.qualifyingItems;

    memory.qualifyingPairs =
      context.qualifyingPairs;

    memory.securedSaving =
      context.securedSaving;

    memory.highestSaving =
      Math.max(
        memory.highestSaving || 0,
        context.securedSaving
      );

    memory.vaultCareActive =
      context.vaultCareActive ||
      memory.vaultCareActive;

    memory.bundleUnlocked =
      memory.bundleUnlocked ||
      context.bundleUnlocked ||
      context.qualifyingPairs > 0;

    memory.lastEvent =
      type;

    writeMemory(
      memory
    );

    return memory;
  }

  function message(
    id,
    title,
    detail,
    tone = 'verified',
    signal = '✓',
    options = {}
  ) {
    return {
      id,
      title,
      detail,
      tone,
      signal,
      priority:
        Number(options.priority) || 50,
      repeatable:
        Boolean(options.repeatable),
      effect:
        options.effect || '',
      duration:
        Number(options.duration) || 0,
      state:
        options.state ||
        (
          tone === 'closed'
            ? 'attention'
            : tone === 'scanning'
              ? 'scanning'
              : tone === 'bundle'
                ? 'guidance'
                : 'verification'
        ),
      interrupt:
        Boolean(options.interrupt),
      hold:
        Number(options.hold) ||
        DECISION_HOLD_DEFAULT,
      pipeline:
        options.pipeline || '',
      pipelineStage:
        Number(options.pipelineStage) || 0,
      pipelineTerminal:
        Boolean(options.pipelineTerminal)
    };
  }

  function resolveMessage(
    type,
    context,
    memory
  ) {
    switch (type) {
      case 'variant-scanning':
        return message(
          'variant-scanning',
          'Scanning Variant',
          `Authenticating ${context.configuration}...`,
          'scanning',
          '•',
          {
            priority: 90,
            repeatable: true,
            pipeline: 'variant-verification',
            pipelineStage: 1,
            hold: 900
          }
        );

      case 'variant-checking':
        return message(
          'variant-checking',
          'Checking Inventory',
          'Confirming availability inside the Vault.',
          'scanning',
          '•',
          {
            priority: 90,
            repeatable: true,
            pipeline: 'variant-verification',
            pipelineStage: 2,
            hold: 1200
          }
        );

      case 'variant-unavailable':
        return message(
          'variant-unavailable',
          'Vault Closed',
          context.available
            ? `Selected ${context.configuration} is not currently offered. Choose another size or colour to continue.`
            : `Selected ${context.configuration} is currently sold out. Choose another size or colour to continue.`,
          'closed',
          '○',
          {
            priority: 110,
            repeatable: true,
            interrupt: true,
            hold: 3200,
            state: 'attention',
            pipeline: 'variant-verification',
            pipelineStage: 3,
            pipelineTerminal: true
          }
        );

      case 'variant-verified':
        return message(
          `variant-verified:${context.configuration}`,
          'Variant Verified',
          `${context.configuration} is available and ready to secure.`,
          'verified',
          '✓',
          {
            priority: 96,
            repeatable: true,
            interrupt: true,
            hold: 2200,
            state: 'verification',
            pipeline: 'variant-verification',
            pipelineStage: 3,
            pipelineTerminal: true
          }
        );

      case 'inventory-secured':
        return message(
          'inventory-secured',
          'Inventory Secured',
          'Item transferred to your Vault.',
          'verified',
          '✓',
          {
            priority: 95,
            repeatable: true,
            pipeline: 'secure-inventory',
            pipelineStage: 1,
            hold: 900
          }
        );

      case 'savings-sync':
        return message(
          'savings-sync',
          'Synchronising Savings',
          'Recalculating qualifying inventory and active Vault Bundles...',
          'scanning',
          '•',
          {
            priority: 92,
            repeatable: true,
            pipeline: 'secure-inventory',
            pipelineStage: 2,
            hold: 1100
          }
        );

      case 'bundle-unlocked':
        return message(
          `bundle-unlocked:${context.qualifyingPairs}`,
          'Vault Bundle Activated',
          `£${context.securedSaving} saving secured.`,
          'verified',
          '✓',
          {
            priority: 110,
            repeatable: true,
            effect: 'bundle-celebration',
            pipeline: 'secure-inventory',
            pipelineStage: 3,
            pipelineTerminal: true,
            hold: 3600
          }
        );

      case 'vaultcare-enabled':
        return message(
          'vaultcare-enabled',
          'Protection Protocol Enabled',
          'VaultCare is active. Return protection has been verified.',
          'verified',
          '✓',
          {
            priority: 100
          }
        );

      case 'vaultcare-removed':
        return message(
          'vaultcare-removed',
          'Protection Removed',
          'VaultCare is no longer active for this secured session.',
          'bundle',
          '◇',
          {
            priority: 95,
            repeatable: true
          }
        );

      case 'cart-opened':
        if (context.qualifyingPairs > 0) {
          return message(
            'cart-opened:savings',
            'Secured Inventory Restored',
            `${context.qualifyingPairs} ${
              context.qualifyingPairs === 1
                ? 'bundle is'
                : 'bundles are'
            } active · £${context.securedSaving} saved.`,
            'verified',
            '✓',
            {
              priority: 76
            }
          );
        }

        if (context.cartItems > 0) {
          return message(
            'cart-opened:items',
            'Secured Inventory Restored',
            `${context.cartItems} ${
              context.cartItems === 1
                ? 'item is'
                : 'items are'
            } currently secured in your Vault.`,
            'verified',
            '●',
            {
              priority: 72
            }
          );
        }

        return null;

      case 'savings-status':
        if (context.qualifyingPairs > 0) {
          const unpaired =
            context.qualifyingItems % 2;

          return message(
            `savings-status:${context.qualifyingPairs}:${unpaired}`,
            'Savings Monitor',
            unpaired === 1
              ? `${context.qualifyingPairs} ${
                  context.qualifyingPairs === 1
                    ? 'bundle is'
                    : 'bundles are'
                } active · £${context.securedSaving} saved. One qualifying item is waiting to be paired.`
              : `${context.qualifyingPairs} ${
                  context.qualifyingPairs === 1
                    ? 'bundle is'
                    : 'bundles are'
                } active · £${context.securedSaving} saving secured.`,
            'verified',
            '✓',
            {
              priority: 70,
              repeatable: true,
              pipeline: 'secure-inventory',
              pipelineStage: 3,
              pipelineTerminal: true,
              hold: 2200
            }
          );
        }

        if (context.qualifyingItems === 1) {
          return message(
            'savings-status:one',
            'Savings Monitor',
            '1 of 2 qualifying items secured. One more activates your first £10 saving.',
            'bundle',
            '◇',
            {
              priority: 70,
              repeatable: true,
              pipeline: 'secure-inventory',
              pipelineStage: 3,
              pipelineTerminal: true,
              hold: 2200
            }
          );
        }

        return message(
          'savings-status:none',
          'Savings Monitor',
          context.offerEligible
            ? 'This item qualifies. Secure two qualifying Tees or Polos to activate £10 saving.'
            : 'No active Vault Bundle is currently secured.',
          'bundle',
          '◇',
          {
            priority: 60,
            repeatable: true,
            pipeline: 'secure-inventory',
            pipelineStage: 3,
            pipelineTerminal: true,
            hold: 2200
          }
        );

      case 'session-start':
      case 'product-view':
        if (context.qualifyingPairs > 0) {
          return message(
            'session:savings-restored',
            'Savings Restored',
            `${context.qualifyingPairs} ${
              context.qualifyingPairs === 1
                ? 'bundle is'
                : 'bundles are'
            } active · £${context.securedSaving} saving secured.`,
            'verified',
            '✓',
            {
              priority: 84
            }
          );
        }

        if (context.vaultCareActive) {
          return message(
            'session:protection',
            'Protection Verified',
            'VaultCare is active for this secured session.',
            'verified',
            '✓',
            {
              priority: 82
            }
          );
        }

        if (context.cartItems > 0) {
          return message(
            'session:secured-items',
            'Secured Session Restored',
            `${context.cartItems} ${
              context.cartItems === 1
                ? 'item is'
                : 'items are'
            } currently secured in your Vault.`,
            'verified',
            '●',
            {
              priority: 80
            }
          );
        }

        if (memory.productsViewed >= 5) {
          return message(
            'session:five-products',
            'Extended Comparison Active',
            `${memory.productsViewed} products reviewed this session. Your product shortlist remains under analysis.`,
            'bundle',
            '●',
            {
              priority: 74
            }
          );
        }

        if (memory.productsViewed >= 3) {
          return message(
            'session:three-products',
            'Product Comparison Active',
            `${memory.productsViewed} products reviewed this session. Bundle eligibility remains monitored.`,
            'bundle',
            '●',
            {
              priority: 72
            }
          );
        }

        if (memory.productsViewed === 2) {
          return message(
            'session:two-products',
            'Comparison Session Detected',
            'A second product is now under review. Your previous selection remains remembered.',
            'bundle',
            '●',
            {
              priority: 70
            }
          );
        }

        return message(
          context.returningVisitor
            ? 'session:returning'
            : 'session:first',
          context.returningVisitor
            ? 'Welcome Back'
            : 'Welcome To The Vault',
          context.returningVisitor
            ? 'Your secure shopping session has been restored.'
            : 'Vault Operator is online and monitoring this product.',
          'verified',
          '●',
          {
            priority: 65
          }
        );

      default:
        return null;
    }
  }

  function getCurrentDecision(
    memory
  ) {
    if (
      !memory.activeDecision ||
      Date.now() >=
        Number(memory.activeDecisionUntil || 0)
    ) {
      return null;
    }

    return memory.activeDecision;
  }

  function isRecentMessage(
    messageData,
    memory
  ) {
    return (
      Array.isArray(memory.recentMessages) &&
      memory.recentMessages.includes(
        messageData.id
      )
    );
  }

  function canAdvancePipeline(
    messageData,
    memory
  ) {
    const active =
      memory.activePipeline;

    if (
      !messageData.pipeline ||
      !active ||
      active.name !==
        messageData.pipeline
    ) {
      return false;
    }

    return (
      messageData.pipelineStage >=
      Number(active.stage || 0)
    );
  }

  function shouldDeliver(
    messageData,
    memory
  ) {
    if (!messageData) return false;

    const currentDecision =
      getCurrentDecision(memory);

    const pipelineAdvance =
      canAdvancePipeline(
        messageData,
        memory
      );

    if (
      currentDecision &&
      !messageData.interrupt &&
      !pipelineAdvance &&
      messageData.priority <
        Number(currentDecision.priority || 0)
    ) {
      return false;
    }

    if (
      !messageData.repeatable &&
      memory.heardMessages[
        messageData.id
      ]
    ) {
      return false;
    }

    if (
      !messageData.repeatable &&
      isRecentMessage(
        messageData,
        memory
      )
    ) {
      return false;
    }

    return true;
  }

  function rememberDelivery(
    messageData
  ) {
    const memory =
      readMemory();

    memory.heardMessages[
      messageData.id
    ] = Date.now();

    memory.lastMessageId =
      messageData.id;

    memory.operatorState =
      messageData.state;

    memory.activeDecision = {
      id:
        messageData.id,
      priority:
        messageData.priority,
      state:
        messageData.state
    };

    memory.activeDecisionUntil =
      Date.now() +
      messageData.hold;

    if (messageData.pipeline) {
      memory.activePipeline = {
        name:
          messageData.pipeline,
        stage:
          messageData.pipelineStage,
        terminal:
          messageData.pipelineTerminal,
        updatedAt:
          Date.now()
      };
    } else if (
      memory.activePipeline &&
      Date.now() >=
        Number(
          memory.activeDecisionUntil || 0
        )
    ) {
      memory.activePipeline = null;
    }

    const recent =
      Array.isArray(memory.recentMessages)
        ? memory.recentMessages
        : [];

    memory.recentMessages = [
      messageData.id,
      ...recent.filter(
        (id) =>
          id !== messageData.id
      )
    ].slice(
      0,
      RECENT_MESSAGE_LIMIT
    );

    writeMemory(
      memory
    );
  }

  function deliver(
    messageData,
    eventData
  ) {
    surfaces.forEach((handler) => {
      try {
        handler({
          message:
            messageData,
          event:
            eventData
        });
      } catch (error) {
        console.error(
          '[Vault OS Brain] Surface failed:',
          error
        );
      }
    });

    document.dispatchEvent(
      new CustomEvent(
        'tfv:brain-message',
        {
          detail: {
            message:
              messageData,
            event:
              eventData
          }
        }
      )
    );
  }

  function emit(
    type,
    payload = {}
  ) {
    const context =
      normaliseContext(
        payload
      );

    const memory =
      updateMemory(
        type,
        context
      );

    const messageData =
      resolveMessage(
        type,
        context,
        memory
      );

    if (
      !shouldDeliver(
        messageData,
        memory
      )
    ) {
      document.dispatchEvent(
        new CustomEvent(
          'tfv:brain-message-suppressed',
          {
            detail: {
              type,
              message:
                messageData,
              activeDecision:
                getCurrentDecision(memory)
            }
          }
        )
      );

      return null;
    }

    rememberDelivery(
      messageData
    );

    deliver(
      messageData,
      {
        type,
        context,
        memory:
          readMemory()
      }
    );

    return messageData;
  }

  function registerSurface(
    name,
    handler
  ) {
    if (
      !name ||
      typeof handler !== 'function'
    ) {
      return () => {};
    }

    surfaces.set(
      name,
      handler
    );

    return () => {
      surfaces.delete(
        name
      );
    };
  }

  function resetSession() {
    try {
      window.sessionStorage.removeItem(
        MEMORY_KEY
      );
    } catch (error) {
      // No action required.
    }
  }

  window.VaultOSBrain = {
    version: '1.1B',
    emit,
    registerSurface,
    getMemory: readMemory,
    getDecision() {
      return getCurrentDecision(
        readMemory()
      );
    },
    getPipeline() {
      return readMemory().activePipeline;
    },
    resetSession
  };

  document.addEventListener(
    'tfv:vault-updated',
    (event) => {
      const detail =
        event.detail || {};

      const cart =
        detail.cart || {};

      const operation =
        detail.operation ||
        'synchronise-inventory';

      const common = {
        cartItems:
          Math.max(
            0,
            Number(detail.customerItems) ||
            Number(cart.item_count) ||
            0
          ),

        qualifyingItems:
          Math.max(
            0,
            Number(detail.qualifyingItems) || 0
          ),

        qualifyingPairs:
          Math.max(
            0,
            Number(detail.qualifyingPairs) || 0
          ),

        securedSaving:
          Math.max(
            0,
            Number(detail.securedSaving) || 0
          ),

        vaultCareActive:
          Boolean(detail.vaultCareActive),

        bundleUnlocked:
          Boolean(detail.bundleUnlocked),

        operation,
        source: 'cart'
      };

      if (
        operation === 'activate-vaultcare'
      ) {
        emit(
          'vaultcare-enabled',
          {
            ...common,
            vaultCareActive: true
          }
        );

        return;
      }

      if (
        operation === 'remove-vaultcare'
      ) {
        emit(
          'vaultcare-removed',
          common
        );

        return;
      }

      if (detail.bundleUnlocked) {
        emit(
          'bundle-unlocked',
          common
        );

        return;
      }

      emit(
        'savings-status',
        common
      );
    }
  );
})();