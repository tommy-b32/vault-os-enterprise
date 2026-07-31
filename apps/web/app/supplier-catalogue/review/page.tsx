"use client";

import {
  useEffect,
  useState,
} from "react";

import VaultAppShell from "@/components/layout/VaultAppShell";

import {
  SupplierReviewWorkspace,
} from "@/components/suppliers/SupplierReviewWorkspace";

import {
  CatalogueReviewQueueRepository,
  type StoredCatalogueReviewQueue,
} from "@/lib/supplier/CatalogueReviewQueueRepository";

export default function SupplierCatalogueReviewPage() {
  const [
    storedQueue,
    setStoredQueue,
  ] =
    useState<StoredCatalogueReviewQueue | null>(
      null,
    );

  const [
    hasLoaded,
    setHasLoaded,
  ] =
    useState(false);

  useEffect(() => {
    let isMounted =
      true;

    async function loadQueue() {
      const queue =
        await CatalogueReviewQueueRepository.get();

      if (!isMounted) {
        return;
      }

      setStoredQueue(
        queue,
      );

      setHasLoaded(
        true,
      );
    }

    void loadQueue();

    return () => {
      isMounted =
        false;
    };
  }, []);

  return (
    <VaultAppShell
      notificationCount={3}
      searchPlaceholder="Search catalogue review..."
    >
      {!hasLoaded ? (
        <section className="supplier-review-workspace-empty">
          <p className="vault-eyebrow">
            Match Review
          </p>

          <h1>
            Loading review queue...
          </h1>

          <p>
            Vault OS is restoring the selected PDF images and
            product matches.
          </p>
        </section>
      ) : storedQueue &&
        storedQueue.items.length > 0 ? (
        <SupplierReviewWorkspace
          items={
            storedQueue.items
          }
        />
      ) : (
        <section className="supplier-review-workspace-empty">
          <p className="vault-eyebrow">
            Match Review
          </p>

          <h1>
            No products are waiting for review
          </h1>

          <p>
            Upload a supplier PDF, analyse the required pages
            and send the detected products into Match Review.
          </p>

          <a href="/supplier-catalogue">
            ← Open Supplier Catalogue
          </a>
        </section>
      )}
    </VaultAppShell>
  );
}