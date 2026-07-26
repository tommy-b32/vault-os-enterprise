# Vault Brain Architecture

Version: 1.0

---

# Overview

Vault Brain is not an intelligence engine.

Vault Brain is the orchestration layer of Vault OS.

Its responsibility is to understand everything happening inside the business and decide what deserves the retailer's attention.

Every engine inside Vault OS exists to provide information to Vault Brain.

Vault Brain transforms that information into understanding.

---

# High Level Architecture

                External Systems
      Shopify • Suppliers • Customers
                    │
                    ▼
               Event Engine
                    │
                    ▼
        ┌───────────┼────────────┐
        │           │            │
        ▼           ▼            ▼

 Inventory     Commercial     Supplier
 Intelligence  Intelligence   Intelligence

        ▼           ▼            ▼

 Catalogue    Purchasing      Customer
 Intelligence Intelligence   Intelligence

        └───────────┼────────────┘
                    │
                    ▼
               Signal Engine
                    │
                    ▼
               Impact Engine
                    │
                    ▼
              Mission Engine
                    │
                    ▼
               Vault Brain
                    │
                    ▼
             Morning Briefing

---

# Event Engine

Every meaningful change inside the business creates an Event.

Examples

Order Received

Catalogue Uploaded

Supplier Price Changed

Inventory Adjusted

Purchase Order Approved

Customer Review Received

Refund Issued

Shipment Delivered

Events are facts.

Events never contain opinions.

---

# Intelligence Engines

Each Intelligence Engine specialises in understanding one area of the business.

Inventory Intelligence

Commercial Intelligence

Supplier Intelligence

Catalogue Intelligence

Purchasing Intelligence

Customer Intelligence

Each engine produces Signals.

Nothing else.

---

# Signal Engine

Signals are observations.

Examples

Demand increasing

Stock decreasing

Supplier reliability improving

Margin reducing

Catalogue quality improving

Duplicate products detected

Cash position strengthening

Signals never tell the retailer what to do.

They only describe reality.

---

# Impact Engine

The Impact Engine answers one question.

"So what?"

It connects signals together.

Example

Signal

Demand increasing.

+

Signal

Inventory reducing.

↓

Impact

Projected stock-out in six days.

↓

Potential lost revenue

£3,420

---

# Mission Engine

The Mission Engine transforms impacts into actions.

Every mission answers three questions.

What happened?

Why does it matter?

What should happen next?

Example

Restock Mission

Demand increased.

Current stock covers six days.

Supplier lead time twelve days.

Recommendation

Review Purchase Order.

---

# Morning Briefing

The Morning Briefing is generated from Missions.

Not Signals.

Not Events.

Not Dashboards.

Only the highest-value actions should appear.

The homepage should answer:

What happened while I was away?

Why does it matter?

What should I do first?

---

# Business Signals

Signals remain visible throughout the day.

They are supporting information.

Examples

Revenue

Orders

Profit

Cash

Inventory Health

Business Health

Signals explain the current condition of the business.

Missions explain what requires attention.

---

# Feedback Loop

Every retailer interaction improves Vault Brain.

If recommendations are ignored...

Learn.

If quantities are changed...

Learn.

If suppliers are switched...

Learn.

If pricing is overridden...

Learn.

Every action improves future recommendations.

---

# Design Philosophy

Events become Signals.

Signals become Impacts.

Impacts become Missions.

Missions become Decisions.

Decisions improve the business.

This is the operating cycle of Vault Brain.