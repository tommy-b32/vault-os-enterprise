"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  BrainCopilotRepository,
} from "@/lib/brain/BrainCopilotRepository";

import {
  BrainCopilotEngine,
} from "@/lib/brain/BrainCopilotEngine";

import {
  BrainSignalsEngine,
} from "@/lib/brain/BrainSignalsEngine";

import {
  BrainSignalsService,
} from "@/lib/brain/BrainSignalsService";

import {
  BuyingRecommendationEngine,
} from "@/lib/brain/BuyingRecommendationEngine";

import {
  BrainLearningRepository,
} from "@/lib/brain/BrainLearningRepository";

import type {
  BrainDecisionReason,
} from "@/types/brain-learning";

import {
  VaultBrainOverlay,
} from "@/components/brain/VaultBrainOverlay";

import {
  BuyingBasket,
  type BuyingBasketItem,
} from "@/components/suppliers/BuyingBasket";

import {
  SupplierProductCreationWorkspace,
  type SupplierProductDraft,
} from "@/components/suppliers/SupplierProductCreationWorkspace";

import {
  SupplierProductReview,
} from "@/components/suppliers/SupplierProductReview";

import {
  SupplierReviewComplete,
} from "@/components/suppliers/SupplierReviewComplete";

import type {
  ProductLink,
} from "@/lib/supplier/ProductLinkRepository";

import {
  VaultMemoryRepository,
  type VaultProductMemory,
} from "@/lib/brain/VaultMemoryRepository";

import {
  LinkProductEngine,
} from "@/lib/brain/LinkProductEngine";

import type {
  CatalogueMatchingResult,
  CatalogueProductMatch,
} from "@/lib/brain/CatalogueMatchingEngine";

import type {
  SupplierCatalogueCardData,
} from "@/types/supplier-catalogue";

import type {
  CatalogueMultiProductDetection,
} from "@/lib/supplier/catalogue-analysis-types";

import type {
  CatalogueProduct,
} from "@/types/catalogue";

type ReviewItem = {
  card: SupplierCatalogueCardData;
  match: CatalogueMatchingResult;
  multiProductDetection:
    CatalogueMultiProductDetection;
};

type Props = {
  items: ReviewItem[];
};

type CatalogueProductsResponse = {
  products?: CatalogueProduct[];
  error?: string;
};

type Decision =
  | "accepted"
  | "skipped"
  | "create_product";

type WorkspaceMode =
  | "review"
  | "create-product";

type MemoryToast = {
  title: string;
  message: string;
} | null;

function wait(
  milliseconds: number,
): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(
      resolve,
      milliseconds,
    );
  });
}

function buildProductLink(
  item: ReviewItem,
): ProductLink | null {
  const bestMatch =
    item.match.bestMatch;

  if (!bestMatch) {
    return null;
  }

  const supplierProductName =
    item.card.officialProductName ??
    item.card.internalReference ??
    "Unnamed supplier product";

  return {
    id:
      `${item.card.supplierId}:${item.card.id}`,

    supplierName:
      item.card.supplierName,

    supplierProductName,

    supplierReference:
      item.card.internalReference,

    fabricVaultProductId:
      bestMatch.product.style_id,

    fabricVaultProductName:
      bestMatch.product.product_name,

    confidence:
      bestMatch.confidence,

    createdAt:
      new Date().toISOString(),
  };
}

function buildVaultMemoryInput(
  item: ReviewItem,
) {
  const bestMatch =
    item.match.bestMatch;

  if (!bestMatch) {
    return null;
  }

  const supplierProductName =
    item.card.officialProductName ??
    item.card.internalReference ??
    "Unnamed supplier product";

  const preferredImage =
    item.card.images.find(
      (image) =>
        image.role === "supplier",
    ) ??
    item.card.images.find(
      (image) =>
        image.role === "official",
    ) ??
    item.card.images[0] ??
    null;

  return {
    supplierName:
      item.card.supplierName,

    supplierProductName,

    supplierReference:
      item.card.internalReference,

    fabricVaultProductId:
      bestMatch.product.style_id,

    fabricVaultProductName:
      bestMatch.product.product_name,

    confidence:
      bestMatch.confidence,

    visualFingerprint:
      item.card.vision.visualFingerprint,

    supplierImageUrl:
      preferredImage?.url ??
      null,

    lastSupplierCost:
      item.card.packCost,

    currency:
      item.card.currency,

    leadTimeDays:
      item.card.leadTimeDays,
  };
}

function buildSupplierMemoryInput(
  item: ReviewItem,
) {
  const bestMatch =
    item.match.bestMatch;

  if (!bestMatch) {
    return null;
  }

  const confirmedBrand =
    bestMatch.product.product_vision?.brand ??
    bestMatch.product.product_intelligence.brand ??
    item.card.brand;

  return {
    supplierName:
      item.card.supplierName,

    preferredBrandNames:
      confirmedBrand
        ? [
            confirmedBrand,
          ]
        : [],

    packSize:
      item.card.packSize,

    leadTimeDays:
      item.card.leadTimeDays,
  };
}

export function SupplierReviewWorkspace({
  items,
}: Props) {
  const [currentIndex, setCurrentIndex] =
    useState(0);

  const [mode, setMode] =
    useState<WorkspaceMode>("review");

  const [decisions, setDecisions] =
    useState<Record<string, Decision>>({});

  const [
    createdProducts,
    setCreatedProducts,
  ] = useState<
    Record<string, SupplierProductDraft>
  >({});

  const [
    rememberedLinks,
    setRememberedLinks,
  ] = useState<ProductLink[]>([]);

  const [
    permanentMemories,
    setPermanentMemories,
  ] = useState<VaultProductMemory[]>([]);

  const [
    memoryLoadError,
    setMemoryLoadError,
  ] = useState<string | null>(null);

  const [
    catalogueProducts,
    setCatalogueProducts,
  ] = useState<CatalogueProduct[]>([]);

  const [
    catalogueLoadError,
    setCatalogueLoadError,
  ] = useState<string | null>(null);

  const [memoryToast, setMemoryToast] =
    useState<MemoryToast>(null);

  const [
    isAcceptingMatch,
    setIsAcceptingMatch,
  ] = useState(false);

  const [
    acceptanceStatus,
    setAcceptanceStatus,
  ] = useState(
    "Preparing product link...",
  );

  const [
    acceptanceProgress,
    setAcceptanceProgress,
  ] = useState(0);

  const [basketItems, setBasketItems] =
    useState<BuyingBasketItem[]>([]);

  const currentItem =
    items[currentIndex] ?? null;

  useEffect(() => {
    let cancelled = false;

    async function loadPermanentMemory() {
      try {
        const memories =
          await VaultMemoryRepository.getAll();

        if (!cancelled) {
          setPermanentMemories(memories);
          setMemoryLoadError(null);
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error
              ? error.message
              : "Vault Brain memory could not be loaded.";

          setMemoryLoadError(message);
        }
      }
    }

    async function loadCatalogueProducts() {
      try {
        const response =
          await fetch(
            "/api/catalogue-products",
            {
              method: "GET",
              cache: "no-store",
            },
          );

        const result =
          (await response.json()) as
            CatalogueProductsResponse;

        if (!response.ok) {
          throw new Error(
            result.error ??
            "The Fabric Vault catalogue could not be loaded.",
          );
        }

        if (!cancelled) {
          setCatalogueProducts(
            result.products ?? [],
          );
          setCatalogueLoadError(null);
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error
              ? error.message
              : "The Fabric Vault catalogue could not be loaded.";

          setCatalogueLoadError(
            message,
          );
        }
      }
    }

    void loadPermanentMemory();
    void loadCatalogueProducts();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!memoryToast) {
      return;
    }

    const timer =
      window.setTimeout(() => {
        setMemoryToast(null);
      }, 2600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [memoryToast]);

  const reviewedCount =
    Object.keys(decisions).length;

  const remainingCount = Math.max(
    0,
    items.length - reviewedCount,
  );

  const progressPercentage =
    items.length > 0
      ? Math.round(
          (reviewedCount / items.length) *
            100,
        )
      : 100;

  const estimatedMinutes = useMemo(
    () =>
      remainingCount === 0
        ? 0
        : Math.max(
            1,
            Math.ceil(remainingCount * 0.08),
          ),
    [remainingCount],
  );

  const acceptedCount =
    Object.values(decisions).filter(
      (decision) =>
        decision === "accepted",
    ).length;

  const skippedCount =
    Object.values(decisions).filter(
      (decision) =>
        decision === "skipped",
    ).length;

  const newProductCount =
    Object.values(decisions).filter(
      (decision) =>
        decision === "create_product",
    ).length;

  const reviewComplete =
    items.length > 0 &&
    reviewedCount === items.length;

  function getNextUnreviewedIndex(
    decisionsAfterUpdate: Record<
      string,
      Decision
    >,
  ): number | null {
    for (
      let offset = 1;
      offset <= items.length;
      offset += 1
    ) {
      const candidateIndex =
        (currentIndex + offset) %
        items.length;

      const candidate =
        items[candidateIndex];

      if (
        candidate &&
        !decisionsAfterUpdate[
          candidate.card.id
        ]
      ) {
        return candidateIndex;
      }
    }

    return null;
  }

  function moveToNextItem(
    decisionsAfterUpdate: Record<
      string,
      Decision
    >,
  ) {
    const nextIndex =
      getNextUnreviewedIndex(
        decisionsAfterUpdate,
      );

    if (nextIndex !== null) {
      setCurrentIndex(nextIndex);
    }
  }

  function addAcceptedItemToBasket(
    item: ReviewItem,
  ) {
    const bestMatch =
      item.match.bestMatch;

    if (!bestMatch) {
      return;
    }

    const recommendation =
      BuyingRecommendationEngine.buildRecommendation({
        product:
          bestMatch.product,

    supplierCard:
      item.card,
    });

    const copilotRecommendation =
      BrainCopilotEngine.createRecommendation({
        productId:
          bestMatch.product.style_id,

        productName:
          bestMatch.product.product_name,

        supplierId:
          item.card.supplierId ?? null,

        supplierName:
          item.card.supplierName,

        suggestedPacks:
          recommendation.suggestedPacks,

        estimatedCost:
          recommendation.estimatedOrderCost,

        estimatedRevenue:
          recommendation.estimatedOrderCost !== null &&
          recommendation.estimatedGrossProfit !== null
            ? recommendation.estimatedOrderCost +
              recommendation.estimatedGrossProfit
            : null,

        estimatedProfit:
          recommendation.estimatedGrossProfit,

        currency:
          item.card.currency,

        confidence:
          recommendation.confidence,

        urgency:
          recommendation.urgency === "none"
            ? "low"
            : recommendation.urgency === "critical"
              ? "critical"
              : recommendation.urgency,

        reasons:
          [recommendation.reason],
      });

        BrainCopilotRepository.save(
          copilotRecommendation,
        );

    const severity =
      copilotRecommendation.priority === "critical"
        ? "critical"
        : copilotRecommendation.priority === "high"
          ? "warning"
          : copilotRecommendation.priority === "medium"
            ? "info"
            : "success";

    const signal =
      BrainSignalsEngine.createSignal({
        type: "buying",

        severity,

        title:
          copilotRecommendation.title,

        message:
          copilotRecommendation.message,

        confidence:
          copilotRecommendation.confidence,

        productId:
          copilotRecommendation.productId,

        productName:
          copilotRecommendation.productName,

        supplierId:
          copilotRecommendation.supplierId,

        supplierName:
          copilotRecommendation.supplierName,

        value:
          copilotRecommendation.estimatedProfit,

        currency:
          copilotRecommendation.currency,

        actionHref:
          "/missions",

        actionLabel:
          "Review recommendation",
      });

    BrainSignalsService.publish(
      signal,
    );

    const basketItem: BuyingBasketItem = {
      id: item.card.id,

      productName:
        bestMatch.product.product_name,

      supplierName:
        item.card.supplierName,

      packs:
        recommendation.suggestedPacks !== null &&
        recommendation.suggestedPacks > 0
          ? recommendation.suggestedPacks
          : 1,

      packCost:
        item.card.packCost,

      currency:
        item.card.currency,

      urgency:
        recommendation.urgency === "critical"
          ? "high"
          : recommendation.urgency === "none"
            ? "low"
            : recommendation.urgency,

      estimatedProfit:
        recommendation.estimatedGrossProfit,

      estimatedRevenue:
        recommendation.estimatedOrderCost !== null &&
        recommendation.estimatedGrossProfit !== null
          ? recommendation.estimatedOrderCost +
            recommendation.estimatedGrossProfit
          : null,
    };

    setBasketItems((current) => {
      const existing = current.find(
        (entry) =>
          entry.id === basketItem.id,
      );

      if (existing) {
        return current;
      }

      return [
        ...current,
        basketItem,
      ];
    });
  }

  function addCreatedItemToBasket(
    draft: SupplierProductDraft,
  ) {
    const basketItem: BuyingBasketItem = {
      id: draft.id,

      productName:
        draft.productName,

      supplierName:
        draft.supplierName,

      packs: 1,

      packCost:
        draft.packCost,

      currency:
        draft.currency,

      urgency: "medium",

      estimatedProfit: null,

      estimatedRevenue: null,
    };

    setBasketItems((current) => {
      const existing = current.find(
        (entry) =>
          entry.id === basketItem.id,
      );

      if (existing) {
        return current;
      }

      return [
        ...current,
        basketItem,
      ];
    });
  }

  function removeItemFromBasket(
    cardId: string,
  ) {
    setBasketItems((current) =>
      current.filter(
        (item) =>
          item.id !== cardId,
      ),
    );
  }

  async function acceptCurrentMatch(
    selectedMatch: CatalogueProductMatch,
  ) {
    if (
      !currentItem ||
      isAcceptingMatch
    ) {
      return;
    }

    const selectedItem: ReviewItem = {
      ...currentItem,

      match: {
        ...currentItem.match,

        bestMatch:
          selectedMatch,

        status:
          selectedMatch.confidence >= 92
            ? "matched"
            : "possible_match",

        requiresReview:
          selectedMatch.confidence < 92,
      },
    };

    const productLink =
      buildProductLink(
        selectedItem,
      );

    const productMemory =
      buildVaultMemoryInput(
        selectedItem,
      );

    const supplierMemory =
      buildSupplierMemoryInput(
        selectedItem,
      );

    if (
      !productLink ||
      !productMemory ||
      !supplierMemory
    ) {
      return;
    }

    setIsAcceptingMatch(
      true,
    );

    setAcceptanceProgress(
      8,
    );

    setAcceptanceStatus(
      "Confirming your selected product match...",
    );

    try {
      await wait(220);

      setAcceptanceProgress(
        28,
      );

      setAcceptanceStatus(
        "Saving product and supplier memory...",
      );

      const result =
        await LinkProductEngine.execute({
          productLink,
          productMemory,
          supplierMemory,
        });

      const learningReason:
        BrainDecisionReason =
        selectedMatch.confidence >= 92
          ? "recommended"
          : "manual_override";

      BrainLearningRepository.save({
        id:
          `${currentItem.card.id}:${selectedMatch.product.style_id}`,

        createdAt:
          new Date().toISOString(),

        productId:
          selectedMatch.product.style_id,

        supplierId:
          currentItem.card.supplierId ??
          null,

        recommendationScore:
          selectedMatch.confidence,

        accepted: true,

        decisionReason:
          learningReason,

        notes:
          selectedMatch.confidence >= 92
            ? "Accepted the recommended catalogue match."
            : "Accepted a manually selected or lower-confidence match.",
      });

      setPermanentMemories(
        (current) => {
          const existingIndex =
            current.findIndex(
              (memory) =>
                memory.id ===
                result.productMemory.id,
            );

          if (existingIndex >= 0) {
            const updated = [
              ...current,
            ];

            updated[existingIndex] =
              result.productMemory;

            return updated;
          }

          return [
            result.productMemory,
            ...current,
          ];
        },
      );

      setRememberedLinks(
        result.links,
      );

      setMemoryLoadError(null);

      setAcceptanceProgress(
        68,
      );

      setAcceptanceStatus(
        "Updating buying context...",
      );

      const nextDecisions = {
        ...decisions,

        [currentItem.card.id]:
          "accepted" as const,
      };

      addAcceptedItemToBasket(
        selectedItem,
      );

      setMemoryToast({
        title:
          "Selected product remembered",

        message:
          `${selectedMatch.product.product_name} is now the confirmed match for this ${currentItem.card.supplierName} item.`,
      });

      await wait(280);

      setAcceptanceProgress(
        100,
      );

      setAcceptanceStatus(
        "Selected product linked and supplier memory updated.",
      );

      await wait(420);

      setIsAcceptingMatch(
        false,
      );

      setDecisions(
        nextDecisions,
      );

      moveToNextItem(
        nextDecisions,
      );
    } catch (error) {
      console.error(
        "Vault OS could not complete the selected product link.",
        error,
      );

      const message =
        error instanceof Error
          ? error.message
          : "The selected product and supplier memory could not be saved.";

      setAcceptanceStatus(
        message,
      );

      setAcceptanceProgress(
        100,
      );

      setMemoryToast({
        title:
          "Product was not linked",

        message:
          "Vault Brain could not save the selected product relationship. No review decision was recorded.",
      });

      await wait(1100);

      setIsAcceptingMatch(
        false,
      );
    }
  }

  function skipCurrentItem() {
    if (!currentItem) {
      return;
    }

    const nextDecisions = {
      ...decisions,

      [currentItem.card.id]:
        "skipped" as const,
    };

    setDecisions(
      nextDecisions,
    );

    removeItemFromBasket(
      currentItem.card.id,
    );

    moveToNextItem(
      nextDecisions,
    );
  }

  function openProductCreation() {
    if (!currentItem) {
      return;
    }

    setMode(
      "create-product",
    );
  }

  function saveCreatedProduct(
    draft: SupplierProductDraft,
  ) {
    if (!currentItem) {
      return;
    }

    const nextDecisions = {
      ...decisions,

      [currentItem.card.id]:
        "create_product" as const,
    };

    setCreatedProducts(
      (current) => ({
        ...current,

        [currentItem.card.id]:
          draft,
      }),
    );

    setDecisions(
      nextDecisions,
    );

    addCreatedItemToBasket(
      draft,
    );

    setMode("review");

    moveToNextItem(
      nextDecisions,
    );
  }

  function cancelProductCreation() {
    setMode("review");
  }

  function goPrevious() {
    setCurrentIndex((current) =>
      Math.max(
        0,
        current - 1,
      ),
    );
  }

  function goNext() {
    setCurrentIndex((current) =>
      Math.min(
        items.length - 1,
        current + 1,
      ),
    );
  }

  function increaseBasketItemPacks(
    itemId: string,
  ) {
    setBasketItems(
      (current) =>
        current.map(
          (item) =>
            item.id === itemId
              ? {
                  ...item,
                  packs:
                    item.packs +
                    1,
                }
              : item,
        ),
    );
  }

  function decreaseBasketItemPacks(
    itemId: string,
  ) {
    setBasketItems(
      (current) =>
        current.map(
          (item) =>
            item.id === itemId
              ? {
                  ...item,
                  packs:
                    Math.max(
                      1,
                      item.packs -
                        1,
                    ),
                }
              : item,
        ),
    );
  }

  function removeBasketItem(
    itemId: string,
  ) {
    setBasketItems(
      (current) =>
        current.filter(
          (item) =>
            item.id !==
            itemId,
        ),
    );
  }

  function openBasket() {
    window.alert(
      "Buying Basket workspace is the next step.",
    );
  }

  function returnToArchive() {
    window.location.href =
      "/supplier-catalogue";
  }

  if (items.length === 0) {
    return (
      <section className="supplier-review-workspace-empty">
        <p className="vault-eyebrow">
          Review Queue
        </p>

        <h1>
          No catalogue items to review
        </h1>

        <p>
          Import a supplier catalogue first.
          Items requiring attention will appear
          here.
        </p>

        <a href="/supplier-catalogue">
          ← Return to Supplier Catalogue
        </a>
      </section>
    );
  }

  if (
    mode === "create-product" &&
    currentItem
  ) {
    return (
      <SupplierProductCreationWorkspace
        card={currentItem.card}
        onCancel={
          cancelProductCreation
        }
        onSave={
          saveCreatedProduct
        }
      />
    );
  }

  if (reviewComplete) {
    return (
      <main className="supplier-review-workspace">
        {memoryToast ? (
          <div
            className="product-memory-toast"
            role="status"
          >
            <span>✓</span>

            <div>
              <strong>
                {memoryToast.title}
              </strong>

              <p>
                {memoryToast.message}
              </p>
            </div>
          </div>
        ) : null}

        <SupplierReviewComplete
          accepted={acceptedCount}
          basketItems={basketItems}
          newProducts={
            newProductCount
          }
          onOpenBasket={
            openBasket
          }
          onReturnToArchive={
            returnToArchive
          }
          reviewed={reviewedCount}
          skipped={skippedCount}
        />
      </main>
    );
  }

  if (!currentItem) {
    return null;
  }

  return (
    <main className="supplier-review-workspace">
      <VaultBrainOverlay
        progress={
          acceptanceProgress
        }
        status={
          acceptanceStatus
        }
        title="Linking supplier product"
        visible={
          isAcceptingMatch
        }
      />

      {memoryToast ? (
        <div
          className="product-memory-toast"
          role="status"
        >
          <span>✓</span>

          <div>
            <strong>
              {memoryToast.title}
            </strong>

            <p>
              {memoryToast.message}
            </p>
          </div>
        </div>
      ) : null}

      {catalogueLoadError ? (
        <div
          className="supplier-review-queue-error"
          role="alert"
        >
          <strong>
            Full catalogue search unavailable
          </strong>

          <p>
            {catalogueLoadError}
          </p>
        </div>
      ) : null}

      <header className="supplier-review-workspace-header">
        <div>
          <p className="vault-eyebrow">
            Vault Brain Review Queue
          </p>

          <h1>
            Catalogue Match Review
          </h1>

          <p>
            Review only the items that require a
            human decision.
          </p>
        </div>

        <a href="/supplier-catalogue">
          Exit Review
        </a>
      </header>

      <section className="supplier-review-status">
        <article>
          <span>Remaining</span>

          <strong>
            {remainingCount}
          </strong>
        </article>

        <article>
          <span>Reviewed</span>

          <strong>
            {reviewedCount}
          </strong>
        </article>

        <article>
          <span>Remembered</span>

          <strong>
            {permanentMemories.length}
          </strong>
        </article>

        <article>
          <span>Progress</span>

          <strong>
            {progressPercentage}%
          </strong>
        </article>

        <article>
          <span>
            Estimated time
          </span>

          <strong>
            {estimatedMinutes} min
          </strong>
        </article>
      </section>

      <div className="supplier-review-progress-track">
        <span
          style={{
            width:
              `${progressPercentage}%`,
          }}
        />
      </div>

      <div className="supplier-review-workspace-layout">
        <SupplierProductReview
          card={currentItem.card}
          currentIndex={
            currentIndex
          }
          match={currentItem.match}
          multiProductDetection={
            currentItem.multiProductDetection
          }
          products={catalogueProducts}
          onAccept={
            acceptCurrentMatch
          }
          onCreateProduct={
            openProductCreation
          }
          onNext={goNext}
          onPrevious={goPrevious}
          onSkip={
            skipCurrentItem
          }
          totalItems={
            items.length
          }
        />

        <BuyingBasket
          items={basketItems}
          onDecreasePacks={
            decreaseBasketItemPacks
          }
          onIncreasePacks={
            increaseBasketItemPacks
          }
          onOpen={
            openBasket
          }
          onRemove={
            removeBasketItem
          }
        />
      </div>

      <footer className="supplier-review-workspace-footer">
        <span>
          Accepted: {acceptedCount}
        </span>

        <span>
          Ignored: {skippedCount}
        </span>

        <span>
          New products:{" "}
          {newProductCount}
        </span>

        <span>
          Drafts stored:{" "}
          {
            Object.keys(
              createdProducts,
            ).length
          }
        </span>

        <span>
          Product memory:{" "}
          {permanentMemories.length}
        </span>
      </footer>
    </main>
  );
}
