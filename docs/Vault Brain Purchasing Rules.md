# Vault Brain Purchasing Rules

## Purpose

This document defines how Vault Brain should make stock-purchasing decisions for The Fabric Vault.

The goal is not simply to identify low stock. The goal is to recommend the best affordable supplier order while protecting cash flow and respecting supplier rules.

---

## Core principle

Vault Brain must never recommend an order based only on stock demand.

Every recommendation must consider:

- available purchasing power;
- protected cash reserve;
- supplier minimum order;
- product pack costs;
- existing committed orders;
- stock urgency;
- sales velocity;
- expected profitability;
- supplier lead time.

Recommendations must be made at supplier-order level, not as isolated product recommendations.

---

## Purchasing power

Vault Brain calculates purchasing power as:

Business cash  
minus protected reserve  
minus committed supplier orders  
equals available purchasing power

Current calculated ledger opening balance:

**£2,101.56**

The protected reserve will be stored separately and must not be spent unless Tom explicitly approves an override.

---

## Supplier: Exclusive

Company name:

**Exclusive**

Primary contact:

**Enes**

Fulfilment model:

**Stocked inventory**

Minimum order:

**20 packs total**

Ordering rule:

Products may be mixed across the full supplier order.

The minimum is not 20 packs per product.

Typical order size:

**20–40 packs**

Larger orders may be placed when demand and purchasing power justify them.

Vault Brain must build one optimised mixed-product basket for Exclusive.

The recommended basket must:

- contain at least 20 packs;
- remain within available purchasing power;
- protect the reserve;
- prioritise urgent and commercially valuable products;
- avoid recommending excessive packs of slow sellers.

---

## Supplier: Icon

Company name:

**Icon**

Primary contact:

**Yusef**

Fulfilment model:

**Stocked inventory**

Product categories:

- T-shirts
- Hoodies

Minimum order:

**Not confirmed**

Until the minimum order is entered, Vault Brain may show stock risk but must not automatically approve a supplier basket.

---

## Supplier: Tony

Company name:

**Tony**

Primary contact:

**Tony**

Fulfilment model:

**Dropship**

Product category:

**Shoes**

Vault Brain must not:

- calculate owned shoe inventory;
- recommend shoe-stock purchases;
- include Tony in normal stock replenishment;
- apply pack or target-stock rules to dropship shoes.

Vault Brain may later identify customer shoe orders awaiting purchase from Tony.

---

## Product purchasing data

Every stocked product should eventually store:

- supplier company;
- pack profile;
- cost per pack;
- units per pack;
- estimated shipping allocation;
- estimated landed cost per pack;
- supplier MOQ rules;
- target stock days;
- restock enabled;
- average selling price;
- estimated gross margin.

Products with incomplete purchasing data must not be used for trusted order recommendations.

---

## Cost calculations

Vault Brain should distinguish between:

### Pack cost

The amount charged by the supplier for one pack.

### Shipping allocation

The estimated share of shipping attributable to one pack.

### Landed cost per pack

Pack cost plus shipping allocation and any other direct import costs.

### Estimated supplier-order cost

Total landed cost of every pack in the proposed basket.

---

## Order affordability states

Every proposed supplier order must receive one of these states:

### Affordable

The order meets the supplier minimum, stays within purchasing power and preserves the protected reserve.

### Affordable but near reserve

The order is possible but leaves little purchasing power after completion.

### Reduce basket

The proposed products are valid, but the basket must be reduced while still respecting the supplier minimum.

### Insufficient purchasing power

The business cannot currently meet the supplier minimum without breaching the protected reserve.

### Defer order

The order should be delayed until more cash becomes available.

### Override required

The order requires Tom to explicitly approve spending below the protected reserve.

---

## Basket prioritisation

When purchasing power is limited, Vault Brain should rank products using:

1. Days until stockout
2. Sales velocity
3. Current broken size runs
4. Gross profit per pound invested
5. Supplier lead time
6. Existing incoming stock
7. Current pack coverage
8. Seasonal importance
9. Product configuration confidence
10. Available purchasing power

A product with a strong margin and urgent stock risk should normally rank above a slow seller with similar stock.

---

## Recommendation output

A trusted recommendation should show:

- supplier company;
- minimum order;
- recommended total packs;
- product-by-product pack quantities;
- estimated product cost;
- estimated shipping;
- estimated landed cost;
- current purchasing power;
- protected reserve;
- purchasing power remaining;
- expected stock coverage;
- expected gross profit;
- confidence level;
- plain-English reasoning.

Example:

> Place one 20-pack Exclusive order. The proposed basket prioritises fast-selling products with the highest stockout risk while keeping the protected reserve intact.

---

## Committed orders

Once an order is approved or placed, its value becomes committed spend.

Committed spend must reduce purchasing power even if the money has not yet left the account.

Order statuses should eventually include:

- Draft
- Recommended
- Approved
- Ordered
- Part paid
- Paid
- Shipped
- Received
- Cancelled

---

## Cash ledger

Vault OS should maintain a transaction ledger containing:

- Shopify payouts;
- cash sales;
- bank transfers;
- supplier orders;
- postage;
- Meta advertising;
- web development;
- storage and packaging;
- refunds;
- other income;
- other expenses.

The ledger should calculate running balances automatically.

Manual running-balance calculations should not be required.

---

## Human control

Vault Brain provides recommendations, not final authority.

Tom must be able to:

- change the protected reserve;
- change the available purchasing budget;
- edit product costs;
- change suggested basket quantities;
- reject a recommendation;
- defer an order;
- approve an override;
- record the final order placed.

---

## Safety rule

Vault Brain must never describe an order as approved merely because stock is low.

A purchase is only considered safe when:

- supplier rules are satisfied;
- the product data is trusted;
- the order is affordable;
- committed spend is considered;
- the protected reserve remains intact;
- Tom has not disabled reordering for the relevant products.
---

## Return on Capital

Vault Brain must assess how efficiently each product uses business capital.

A product should not be prioritised only because it is low in stock.

Vault Brain should consider:

- average capital invested;
- gross profit generated;
- sales velocity;
- average time held in stock;
- stock turnover;
- remaining stock risk;
- expected return from another pack.

Core calculation:

Gross profit generated  
divided by  
average capital invested

The result should be expressed as a percentage.

Example:

Average capital invested: £300  
Gross profit generated: £720  
Return on capital: 240%

---

## Capital efficiency states

### Excellent

High return, strong velocity and healthy margin.

Recommended action:

Increase or maintain investment.

### Healthy

Good return with acceptable stock movement.

Recommended action:

Maintain normal buying levels.

### Weak

Low return or slow stock movement.

Recommended action:

Reduce future purchasing.

### Poor

Capital is tied up with little commercial return.

Recommended action:

Do not restock unless there is a clear strategic reason.

---

## Purchasing priority

When purchasing power is limited, Vault Brain should prioritise products that:

1. Have urgent stock risk
2. Generate strong gross profit
3. Produce a high return on capital
4. Sell quickly
5. Have trusted product configuration
6. Fit within the supplier basket and cash budget

Vault Brain should avoid allocating scarce purchasing power to products with weak capital efficiency unless Tom explicitly overrides the recommendation.