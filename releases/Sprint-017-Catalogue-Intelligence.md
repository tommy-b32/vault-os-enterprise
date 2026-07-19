# Sprint 017 — Catalogue Intelligence

## Status

Completed.

## Summary

Sprint 017 introduced the first working version of Catalogue Intelligence and the Vault Product Master.

Vault OS can now store product-specific business rules separately from Shopify and use them as the foundation for future inventory and reorder recommendations.

## Features completed

- Catalogue Intelligence workspace
- Product search and selection
- Live product inventory summaries
- Supplier company assignment
- Inventory strategy selection
- Pack profile selection
- Supplier MOQ settings
- Target stock days
- Restock enabled control
- Decision reason
- Private product notes
- Persistent Supabase product settings
- Saving state and successful-save confirmation

## Database

- `database/011_supplier_master_data.sql`
- `database/012_product_settings.sql`

## Frontend

- Catalogue page
- Product editor
- Product list
- Product search
- Product statistics
- Product save button
- Catalogue server actions

## Next sprint

Sprint 018 — Configuration Intelligence

Planned improvements:

- Specific setup warnings
- Ready / incomplete product states
- Missing supplier detection
- Missing pack-profile detection
- Missing MOQ detection
- Product configuration health
- Bulk product configuration