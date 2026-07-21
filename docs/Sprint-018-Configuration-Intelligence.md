# Sprint 018 — Configuration Intelligence

## Objective

Create the Configuration Intelligence Engine.

This engine measures how complete every product configuration is before Vault Brain is allowed to make recommendations.

---

# Product Health Score

Every product receives a configuration score.

Maximum score:

100%

---

## Supplier Assigned

Weight

20%

Requirement

Supplier company selected.

---

## Inventory Strategy

Weight

20%

Requirement

Inventory strategy selected.

Examples

- Stocked
- Dropship
- Do Not Restock
- Service

---

## Pack Profile

Weight

20%

Requirement

Valid pack profile selected.

Examples

- tee_5_piece
- polo_6_piece
- hoodie
- custom

---

## Supplier MOQ

Weight

20%

Requirement

Valid MOQ entered.

Dropship products are exempt.

Do Not Restock products are exempt.

---

## Target Stock Days

Weight

20%

Requirement

Target stock days entered.

Dropship products are exempt.

Do Not Restock products are exempt.

---

# Product States

## Ready

Configuration Score

100%

Status

Ready

Vault Brain

Trusted

---

## Almost Ready

Configuration Score

80%

Status

Minor configuration required

Vault Brain

Limited confidence

---

## Needs Configuration

Configuration Score

Below 80%

Status

Configuration required

Vault Brain

Ignored for AI recommendations

---

# Special Rules

## Dropship

Supplier required

Inventory strategy required

MOQ not required

Target stock days not required

---

## Do Not Restock

Supplier optional

MOQ ignored

Target stock ignored

Excluded from reorder recommendations

---

## Service

Excluded from inventory intelligence.

---

# Command Centre

Only products with trusted configuration may appear in AI reorder recommendations.

---

# Future Expansion

Additional health points may later include:

- Supplier lead time
- Profit margin
- Sales velocity
- Seasonality
- Return rate
- Supplier accuracy
- Advertising performance

Maximum future score

200+