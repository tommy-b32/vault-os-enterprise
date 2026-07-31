import type {
  CatalogueReviewQueueDetails,
  CatalogueReviewQueueItem,
} from "@/lib/supplier/CatalogueReviewQueueEngine";

export type StoredCatalogueReviewQueue = {
  items: CatalogueReviewQueueItem[];
  details: CatalogueReviewQueueDetails;
  savedAt: string;
};

const DATABASE_NAME =
  "vault-os";

const DATABASE_VERSION =
  1;

const STORE_NAME =
  "catalogue-review-queues";

const ACTIVE_QUEUE_KEY =
  "active-review-queue";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise(
    (resolve, reject) => {
      const request =
        window.indexedDB.open(
          DATABASE_NAME,
          DATABASE_VERSION,
        );

      request.onupgradeneeded = () => {
        const database =
          request.result;

        if (
          !database.objectStoreNames.contains(
            STORE_NAME,
          )
        ) {
          database.createObjectStore(
            STORE_NAME,
          );
        }
      };

      request.onsuccess = () => {
        resolve(
          request.result,
        );
      };

      request.onerror = () => {
        reject(
          request.error ??
            new Error(
              "Vault OS could not open browser storage.",
            ),
        );
      };
    },
  );
}

export const CatalogueReviewQueueRepository = {
  async save(
    queue: StoredCatalogueReviewQueue,
  ): Promise<boolean> {
    if (!isBrowser()) {
      return false;
    }

    try {
      const database =
        await openDatabase();

      await new Promise<void>(
        (resolve, reject) => {
          const transaction =
            database.transaction(
              STORE_NAME,
              "readwrite",
            );

          const store =
            transaction.objectStore(
              STORE_NAME,
            );

          store.put(
            queue,
            ACTIVE_QUEUE_KEY,
          );

          transaction.oncomplete =
            () => {
              database.close();
              resolve();
            };

          transaction.onerror =
            () => {
              database.close();

              reject(
                transaction.error ??
                  new Error(
                    "Vault OS could not save the review queue.",
                  ),
              );
            };

          transaction.onabort =
            transaction.onerror;
        },
      );

      return true;
    } catch (error) {
      console.error(
        "Vault OS could not save the catalogue review queue.",
        error,
      );

      return false;
    }
  },

  async get(): Promise<StoredCatalogueReviewQueue | null> {
    if (!isBrowser()) {
      return null;
    }

    try {
      const database =
        await openDatabase();

      return await new Promise<
        StoredCatalogueReviewQueue | null
      >((resolve, reject) => {
        const transaction =
          database.transaction(
            STORE_NAME,
            "readonly",
          );

        const store =
          transaction.objectStore(
            STORE_NAME,
          );

        const request =
          store.get(
            ACTIVE_QUEUE_KEY,
          );

        request.onsuccess = () => {
          database.close();

          resolve(
            (request.result as
              | StoredCatalogueReviewQueue
              | undefined) ??
              null,
          );
        };

        request.onerror = () => {
          database.close();

          reject(
            request.error ??
              new Error(
                "Vault OS could not load the review queue.",
              ),
          );
        };
      });
    } catch (error) {
      console.error(
        "Vault OS could not read the catalogue review queue.",
        error,
      );

      return null;
    }
  },

  async clear(): Promise<void> {
    if (!isBrowser()) {
      return;
    }

    try {
      const database =
        await openDatabase();

      await new Promise<void>(
        (resolve, reject) => {
          const transaction =
            database.transaction(
              STORE_NAME,
              "readwrite",
            );

          transaction
            .objectStore(
              STORE_NAME,
            )
            .delete(
              ACTIVE_QUEUE_KEY,
            );

          transaction.oncomplete =
            () => {
              database.close();
              resolve();
            };

          transaction.onerror =
            () => {
              database.close();

              reject(
                transaction.error ??
                  new Error(
                    "Vault OS could not clear the review queue.",
                  ),
              );
            };

          transaction.onabort =
            transaction.onerror;
        },
      );
    } catch (error) {
      console.error(
        "Vault OS could not clear the catalogue review queue.",
        error,
      );
    }
  },
} as const;