"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

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

import {
  ProductLinkRepository,
  type ProductLink,
} from "@/lib/supplier/ProductLinkRepository";

import type {
  CatalogueMatchingResult,
} from "@/lib/brain/CatalogueMatchingEngine";

import type {
  SupplierCatalogueCardData,
} from "@/types/supplier-catalogue";

type ReviewItem = {
  card: SupplierCatalogueCardData;
  match: CatalogueMatchingResult;
};

type Props = {
  items: ReviewItem[];
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
      bestMatch.product.product_id,

    fabricVaultProductName:
      bestMatch.product.product_name,

    confidence:
      bestMatch.confidence,

    createdAt:
      new Date().toISOString(),
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
    setRememberedLinks(
      ProductLinkRepository.getAll(),
    );
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

    const basketItem: BuyingBasketItem = {
      id: item.card.id,

      productName:
        bestMatch.product.product_name,

      supplierName:
        item.card.supplierName,

      packs: 1,

      packCost:
        item.card.packCost,

      currency:
        item.card.currency,
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

  async function acceptCurrentMatch() {
    if (
      !currentItem ||
      isAcceptingMatch
    ) {
      return;
    }

    const productLink =
      buildProductLink(
        currentItem,
      );

    if (!productLink) {
      return;
    }

    setIsAcceptingMatch(
      true,
    );

    setAcceptanceProgress(
      8,
    );

    setAcceptanceStatus(
      "Confirming the supplier product match...",
    );

    try {
      await wait(280);

      setAcceptanceProgress(
        28,
      );

      setAcceptanceStatus(
        "Saving the supplier-to-product relationship...",
      );

      ProductLinkRepository.save(
        productLink,
      );

      await wait(360);

      setAcceptanceProgress(
        52,
      );

      setAcceptanceStatus(
        "Updating Vault Brain product memory...",
      );

      setRememberedLinks(
        ProductLinkRepository.getAll(),
      );

      await wait(360);

      setAcceptanceProgress(
        74,
      );

      setAcceptanceStatus(
        "Checking inventory and buying context...",
      );

      await wait(360);

      setAcceptanceProgress(
        91,
      );

      setAcceptanceStatus(
        "Preparing the next review item...",
      );

      const nextDecisions = {
        ...decisions,

        [currentItem.card.id]:
          "accepted" as const,
      };

      addAcceptedItemToBasket(
        currentItem,
      );

      setMemoryToast({
        title:
          "Product remembered",

        message:
          `Future ${currentItem.card.supplierName} catalogues can recognise this product automatically.`,
      });

      await wait(300);

      setAcceptanceProgress(
        100,
      );

      setAcceptanceStatus(
        "Product linked successfully.",
      );

      await wait(420);

      setIsAcceptingMatch(
        false,
      );

      await wait(160);

      setDecisions(
        nextDecisions,
      );

      moveToNextItem(
        nextDecisions,
      );
    } catch (error) {
      console.error(
        "Vault OS could not complete the product link.",
        error,
      );

      setAcceptanceStatus(
        "The product link could not be completed.",
      );

      setAcceptanceProgress(
        100,
      );

      await wait(700);

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
            {rememberedLinks.length}
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
          {rememberedLinks.length}
        </span>
      </footer>
    </main>
  );
}