export const externalPostageInputError = ({ orderNumber, amountGbp }) => {
  if (!/^[1-9][0-9]{0,11}$/.test(orderNumber.trim())) return "Enter a valid Shopify order number.";
  if (!/^(?:0|[1-9][0-9]{0,7})(?:\.[0-9]{1,2})?$/.test(amountGbp.trim())) return "Enter a non-negative GBP amount with up to two decimal places.";
  return null;
};

export const displayExternalPostageAmount = (amountGbp) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(amountGbp));
