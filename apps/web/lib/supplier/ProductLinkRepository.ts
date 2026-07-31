export type ProductLink = {
  id: string;

  supplierName: string;

  supplierProductName: string;

  supplierReference: string | null;

  fabricVaultProductId: string;

  fabricVaultProductName: string;

  confidence: number;

  createdAt: string;
};

const STORAGE_KEY =
  "vault-product-links";

function getLinks(): ProductLink[] {
  if (typeof window === "undefined") {
    return [];
  }

  const json =
    localStorage.getItem(STORAGE_KEY);

  return json ? JSON.parse(json) : [];
}

function saveLinks(
  links: ProductLink[],
) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(links),
  );
}

export const ProductLinkRepository = {
  getAll() {
    return getLinks();
  },

  save(link: ProductLink) {
    const links = getLinks();

    const existing =
      links.findIndex(
        (candidate) =>
          candidate.id === link.id,
      );

    if (existing >= 0) {
      links[existing] = link;
    } else {
      links.push(link);
    }

    saveLinks(links);
  },
};