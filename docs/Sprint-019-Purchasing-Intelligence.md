# Sprint 019 — Purchasing Intelligence Engine

## Objective

Enable Vault Brain to build the best supplier order based on stock requirements, supplier ordering rules and available purchasing power.

---

# Core Principle

Vault Brain must never recommend purchases that cannot realistically be afforded.

Recommendations must maximise business value while protecting cash flow.

---

# Purchasing Power

Vault Brain calculates:

Current Business Cash

Less Protected Reserve

Less Outstanding Purchase Orders

Equals

Purchasing Power

---

# Supplier Rules

Every supplier stores:

Supplier Name

Minimum Packs Per Order

Mixed Products Allowed

Lead Time

Currency

Shipping Method

Average Shipping Cost

Payment Terms

---

# Product Costs

Every stocked product stores:

Supplier

Cost Per Pack

Units Per Pack

Estimated Shipping Per Pack

Landed Cost Per Pack

Gross Margin

Average Selling Price

---

# Recommendation Rules

Vault Brain should optimise:

Prevent stockouts

Protect cash

Maintain supplier MOQ

Prioritise profitable products

Prioritise fast-selling products

Reduce broken size runs

Avoid overstock

---

# Recommendation Output

Supplier

Recommended Basket

Total Packs

Estimated Cost

Remaining Purchasing Power

Protected Reserve Maintained

Confidence Score

Reasoning

---

# Future Expansion

Supplier Discounts

Currency Exchange

Seasonality

Purchase Order Tracking

Forecast Demand

Automatic Purchase Orders