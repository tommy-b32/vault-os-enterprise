import {
  ProductLinkRepository,
} from "@/lib/supplier/ProductLinkRepository";

import {
  VaultMemoryRepository,
} from "@/lib/brain/VaultMemoryRepository";

import {
  SupplierMemoryRepository,
} from "@/lib/brain/SupplierMemoryRepository";

import type {
  ProductLink,
} from "@/lib/supplier/ProductLinkRepository";

import type {
  VaultProductMemoryInput,
  VaultProductMemory,
} from "@/lib/brain/VaultMemoryRepository";

import type {
  SupplierMemory,
} from "@/lib/brain/SupplierMemoryRepository";

export type LinkProductInput = {
  productLink: ProductLink;

  productMemory: VaultProductMemoryInput;

  supplierMemory: {
    supplierName: string;

    preferredBrandNames: string[];

    packSize: number | null;

    leadTimeDays: number | null;
  };
};

export type LinkProductResult = {
  productMemory: VaultProductMemory;

  supplierMemory: SupplierMemory;

  links: ProductLink[];
};

export const LinkProductEngine = {
  async execute(
    input: LinkProductInput,
  ): Promise<LinkProductResult> {

    const productMemory =
      await VaultMemoryRepository.save(
        input.productMemory,
      );

    const supplierMemory =
      await SupplierMemoryRepository.recordSuccessfulMatch(
        input.supplierMemory,
      );

    ProductLinkRepository.save(
      input.productLink,
    );

    return {
      productMemory,

      supplierMemory,

      links:
        ProductLinkRepository.getAll(),
    };
  },
};