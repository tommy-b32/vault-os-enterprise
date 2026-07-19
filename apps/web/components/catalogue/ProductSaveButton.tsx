"use client";

import { useFormStatus } from "react-dom";

export function ProductSaveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="product-save-button"
      disabled={pending}
      type="submit"
    >
      {pending ? (
        <>
          <span
            aria-hidden="true"
            className="product-save-spinner"
          />
          Saving changes...
        </>
      ) : (
        <>Save product settings</>
      )}
    </button>
  );
}