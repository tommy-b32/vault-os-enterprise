{{ 'vault-os-brain.js' | asset_url | script_tag }}

{% comment %}
╔══════════════════════════════════════════════════════╗
║                                                      ║
║              FABRIC VAULT OS v1.0                    ║
║                                                      ║
║ Module : Vault Inventory                             ║
║ Status : Development                                 ║
║ Build  : 2026.07.10                                  ║
║                                                      ║
║ "Luxury isn't louder. It's smarter."                 ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
{% endcomment %}

{%- liquid
  assign tfv_vaultcare_handle = 'returns-label'
  assign tfv_vaultcare_variant_id = 57053091955066

  assign tfv_total_items = cart.item_count
  assign tfv_inventory_value = cart.total_price

  assign tfv_qualifying_items = 0
  assign tfv_qualifying_pairs = 0
  assign tfv_unpaired_qualifying_items = 0
  assign tfv_non_qualifying_items = 0

  assign tfv_vaultcare_active = false
  assign tfv_vaultcare_quantity = 0

  for item in cart.items
    if item.product.handle == tfv_vaultcare_handle
      assign tfv_vaultcare_active = true
      assign tfv_vaultcare_quantity = tfv_vaultcare_quantity | plus: item.quantity
    elsif item.product.tags contains '2-for-70'
      assign tfv_qualifying_items = tfv_qualifying_items | plus: item.quantity
    else
      assign tfv_non_qualifying_items = tfv_non_qualifying_items | plus: item.quantity
    endif
  endfor

  assign tfv_qualifying_pairs = tfv_qualifying_items | divided_by: 2
  assign tfv_unpaired_qualifying_items = tfv_qualifying_items | modulo: 2

  assign tfv_offer_unlocked = false
  if tfv_qualifying_pairs > 0
    assign tfv_offer_unlocked = true
  endif

  assign tfv_customer_item_count = tfv_total_items | minus: tfv_vaultcare_quantity

  assign tfv_dispatch_ready = false
  if tfv_customer_item_count > 0
    assign tfv_dispatch_ready = true
  endif

-%}

<div
  id="cart-drawer-vaultos"
  class="tfv-os-drawer"
  style="display: none;"
  role="dialog"
  aria-modal="true"
  aria-labelledby="tfv-os-drawer-title"
  data-vaultcare-variant-id="{{ tfv_vaultcare_variant_id }}"
  data-qualifying-items="{{ tfv_qualifying_items }}"
  data-qualifying-pairs="{{ tfv_qualifying_pairs }}"
  data-secured-saving="{{ tfv_qualifying_pairs | times: 10 }}"
  data-vaultcare-active="{% if tfv_vaultcare_active %}true{% else %}false{% endif %}"
>
  <div
    class="tfv-os-drawer__backdrop"
    data-tfv-close="true"
    onclick="window.closeAllVaultDrawers()"
    aria-hidden="true"
  ></div>

  <aside class="tfv-os-drawer__panel">
    <!-- =====================================
     MODULE 01 — COMMAND HEADER
====================================== -->

{%- render 'vault-os-header',
  customer_item_count: tfv_customer_item_count
-%}

    <!-- =====================================
         DYNAMIC MODULE AREA
    ====================================== -->

    <div
      class="tfv-os-drawer__content"
      id="tfv-os-drawer-content"
    >
      <!-- Module 02: Vault Status -->

      <!-- =====================================
     MODULE 02 — VAULT STATUS
====================================== -->

{%- render 'vault-os-status',
  customer_item_count: tfv_customer_item_count,
  dispatch_ready: tfv_dispatch_ready,
  vaultcare_active: tfv_vaultcare_active
-%}

<!-- =====================================
     BUNDLE INTELLIGENCE MOVED TO PRODUCT VAULT OPERATOR
====================================== -->

<!-- =====================================
     MODULE 04 — INVENTORY ITEMS
====================================== -->

{%- render 'vault-os-items',
  tfv_customer_item_count: tfv_customer_item_count,
  tfv_vaultcare_handle: tfv_vaultcare_handle
-%}
<!-- =====================================
     MODULE 05 — VAULTCARE PROTECTION
====================================== -->

{%- render 'vault-os-vaultcare',
  tfv_customer_item_count: tfv_customer_item_count,
  tfv_vaultcare_active: tfv_vaultcare_active,
  tfv_vaultcare_handle: tfv_vaultcare_handle,
  tfv_vaultcare_variant_id: tfv_vaultcare_variant_id
-%}

<!-- =====================================
     MODULE 06 — SECURE DISPATCH
====================================== -->

{%- render 'vault-os-checkout',
  tfv_customer_item_count: tfv_customer_item_count,
  tfv_inventory_value: tfv_inventory_value,
  tfv_vaultcare_active: tfv_vaultcare_active
-%}
    </div>

    <!-- =====================================
         INTERNAL OS FOOTER
    ====================================== -->

    {%- render 'vault-os-footer' -%}
  </aside>
  <!-- =====================================
     SECURE CHECKOUT TRANSITION
====================================== -->

<div
  class="tfv-os-transition"
  id="tfv-os-transition"
  aria-hidden="true"
  role="status"
  aria-live="polite"
>
  <div class="tfv-os-transition__ambient" aria-hidden="true"></div>

  <div class="tfv-os-transition__content">
    <div class="tfv-os-transition__mark" aria-hidden="true">
      <svg
        width="54"
        height="54"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.15"
      >
        <circle cx="12" cy="12" r="9"></circle>
        <circle cx="12" cy="12" r="2.4"></circle>
        <path d="M12 3v6.6"></path>
        <path d="M12 14.4V21"></path>
        <path d="M3 12h6.6"></path>
        <path d="M14.4 12H21"></path>
      </svg>
    </div>

    <span class="tfv-os-transition__brand">
      The Fabric Vault
    </span>

    <h3 id="tfv-os-transition-title">
      Locking Inventory
    </h3>

    <p id="tfv-os-transition-message">
      Securing your reserved items...
    </p>

    <div class="tfv-os-transition__progress" aria-hidden="true">
      <span id="tfv-os-transition-progress"></span>
    </div>

    <div class="tfv-os-transition__system">
      <span class="tfv-os-transition__system-led"></span>
      <span id="tfv-os-transition-system-text">
        Authorisation initiated
      </span>
    </div>
  </div>
</div>
</div>

<style>

/* =========================================
   SHARED OS MODULES
========================================= */

.tfv-os-module {
  position: relative;
  overflow: hidden;
  margin-bottom: 16px;
  padding: 18px;
  background:
    linear-gradient(
      145deg,
      rgba(255, 255, 255, 0.028),
      transparent 42%
    ),
    #101010;
  border: 1px solid rgba(197, 157, 95, 0.2);
  border-radius: 14px;
  box-shadow:
    0 13px 35px rgba(0, 0, 0, 0.32),
    inset 0 1px 0 rgba(255, 255, 255, 0.035);
}

.tfv-os-module__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.tfv-os-module__identity {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.tfv-os-module__led {
  width: 9px;
  height: 9px;
  flex: 0 0 9px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
}

.tfv-os-module__led--active {
  background: var(--tfv-os-gold);
  box-shadow:
    0 0 11px rgba(197, 157, 95, 0.85),
    0 0 22px rgba(197, 157, 95, 0.3);
  animation: tfvOsLedPulse 1.8s ease-in-out infinite;
}

.tfv-os-module__led--verified {
  background: var(--tfv-os-green);
  box-shadow:
    0 0 11px rgba(74, 222, 128, 0.8),
    0 0 23px rgba(74, 222, 128, 0.26);
}

.tfv-os-module__kicker,
.tfv-os-module__title {
  display: block;
}

.tfv-os-module__kicker {
  margin-bottom: 4px;
  color: var(--tfv-os-gold);
  font-size: 9px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.tfv-os-module__title {
  color: #ffffff;
  font-size: 0.87rem;
  line-height: 1.25;
}

.tfv-os-module__footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
  padding-top: 13px;
  color: rgba(255, 255, 255, 0.35);
  border-top: 1px solid rgba(255, 255, 255, 0.065);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

/* =========================================
   MODULE 02 — VAULT STATUS
========================================= */

.tfv-os-status__count {
  flex: 0 0 auto;
  padding: 7px 10px;
  color: var(--tfv-os-gold-light);
  background: rgba(197, 157, 95, 0.08);
  border: 1px solid rgba(197, 157, 95, 0.24);
  border-radius: 999px;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.tfv-os-status__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 16px;
}

.tfv-os-status__metric {
  min-width: 0;
  padding: 11px 9px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.065);
  border-radius: 8px;
}

.tfv-os-status__metric span,
.tfv-os-status__metric strong {
  display: block;
}

.tfv-os-status__metric span {
  color: rgba(255, 255, 255, 0.34);
  font-size: 7px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.tfv-os-status__metric strong {
  margin-top: 4px;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.79);
  font-size: 0.68rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* =========================================
   MODULE 03 — VAULT INTELLIGENCE
========================================= */

.tfv-os-intelligence::after {
  content: "";
  position: absolute;
  top: -70px;
  right: -65px;
  width: 150px;
  height: 150px;
  border-radius: 50%;
  background: rgba(197, 157, 95, 0.09);
  filter: blur(40px);
  pointer-events: none;
}

.tfv-os-intelligence--unlocked {
  border-color: rgba(74, 222, 128, 0.31);
}

.tfv-os-intelligence--unlocked::after {
  background: rgba(74, 222, 128, 0.09);
}

.tfv-os-intelligence__scan {
  color: rgba(255, 255, 255, 0.28);
  font-size: 7px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.tfv-os-intelligence__message {
  position: relative;
  z-index: 1;
  margin-top: 17px;
}

.tfv-os-intelligence__message p {
  margin: 0;
  color: #ffffff;
  font-size: 0.84rem;
  font-weight: 650;
  line-height: 1.55;
}

.tfv-os-intelligence__message > span {
  display: block;
  margin-top: 7px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.75rem;
  line-height: 1.55;
}

.tfv-os-intelligence__eyebrow {
  margin-bottom: 7px;
  color: var(--tfv-os-gold) !important;
  font-size: 8px !important;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.tfv-os-intelligence__offer {
  display: block;
  margin-top: 10px;
  color: var(--tfv-os-gold-light);
  font-family: "Playfair Display", serif;
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  text-shadow: 0 0 20px rgba(197, 157, 95, 0.18);
}

.tfv-os-intelligence__saving {
  color: var(--tfv-os-gold) !important;
  font-size: 8px !important;
  font-weight: 800;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.tfv-os-intelligence__saving--verified {
  color: var(--tfv-os-green) !important;
}

.tfv-os-progress {
  position: relative;
  height: 4px;
  margin-top: 16px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.075);
  border-radius: 999px;
}

.tfv-os-progress__fill {
  display: block;
  height: 100%;
  background: linear-gradient(
    90deg,
    #9d6c30,
    var(--tfv-os-gold-light)
  );
  border-radius: inherit;
  box-shadow: 0 0 13px rgba(197, 157, 95, 0.35);
}

.tfv-os-progress__labels {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 7px;
  color: rgba(255, 255, 255, 0.29);
  font-size: 7px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tfv-os-intelligence__action {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 15px;
  color: var(--tfv-os-gold-light);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-decoration: none;
  text-transform: uppercase;
}

.tfv-os-intelligence__action span {
  transition: transform 200ms ease;
}

.tfv-os-intelligence__action:hover span {
  transform: translateX(3px);
}

.tfv-os-intelligence__verified {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 11px;
  margin-top: 17px;
  padding: 12px;
  background: rgba(74, 222, 128, 0.08);
  border: 1px solid rgba(74, 222, 128, 0.26);
  border-radius: 9px;
}

.tfv-os-intelligence__verified-icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  color: #07140b;
  background: var(--tfv-os-green);
  border-radius: 50%;
  font-weight: 900;
}

.tfv-os-intelligence__verified span,
.tfv-os-intelligence__verified strong {
  display: block;
}

.tfv-os-intelligence__verified span {
  color: var(--tfv-os-green);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.tfv-os-intelligence__verified strong {
  margin-top: 3px;
  color: #ffffff;
  font-size: 0.75rem;
}

.tfv-os-intelligence__checks {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 7px;
  margin-top: 17px;
  padding-top: 15px;
  border-top: 1px solid rgba(255, 255, 255, 0.065);
}

.tfv-os-intelligence__checks > div {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.69rem;
}

.tfv-os-intelligence__checks > div span {
  color: var(--tfv-os-gold);
  font-weight: 900;
}

.tfv-os-intelligence--unlocked
.tfv-os-intelligence__checks > div span {
  color: var(--tfv-os-green);
}

    /* =========================================
   MODULE 07 — SECURE DISPATCH
========================================= */

.tfv-os-checkout {
  position: relative;
  overflow: hidden;
  margin-bottom: 16px;
  padding: 18px;

  background:
    linear-gradient(
      145deg,
      rgba(197, 157, 95, 0.09),
      rgba(255, 255, 255, 0.02) 48%,
      transparent
    ),
    #101010;

  border: 1px solid rgba(197, 157, 95, 0.28);
  border-radius: 14px;

  box-shadow:
    0 16px 40px rgba(0, 0, 0, 0.36),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.tfv-os-checkout__glow {
  position: absolute;
  top: -80px;
  right: -70px;

  width: 175px;
  height: 175px;

  border-radius: 50%;
  background: var(--tfv-os-gold);

  opacity: 0.12;
  filter: blur(48px);

  pointer-events: none;
}

.tfv-os-checkout__header {
  position: relative;
  z-index: 1;

  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.tfv-os-checkout__identity {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}

.tfv-os-checkout__led {
  width: 9px;
  height: 9px;
  flex: 0 0 9px;

  border-radius: 50%;
  background: var(--tfv-os-green);

  box-shadow:
    0 0 11px rgba(74, 222, 128, 0.78),
    0 0 22px rgba(74, 222, 128, 0.24);

  animation: tfvOsCheckoutLed 1.8s ease-in-out infinite;
}

.tfv-os-checkout__kicker {
  display: block;
  margin-bottom: 4px;

  color: var(--tfv-os-gold);

  font-size: 8px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.tfv-os-checkout__header h3 {
  margin: 0;

  color: #ffffff;

  font-family: "Playfair Display", serif;
  font-size: 1.02rem;
  font-weight: 750;
  line-height: 1.25;
}

.tfv-os-checkout__status {
  flex: 0 0 auto;

  padding: 7px 9px;

  color: var(--tfv-os-green);

  background: rgba(74, 222, 128, 0.06);

  border: 1px solid rgba(74, 222, 128, 0.22);
  border-radius: 999px;

  font-size: 7px;
  font-weight: 850;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.tfv-os-checkout__checks {
  position: relative;
  z-index: 1;

  display: grid;
  gap: 8px;

  margin-top: 16px;
  padding: 13px;

  background: rgba(255, 255, 255, 0.018);

  border: 1px solid rgba(255, 255, 255, 0.065);
  border-radius: 9px;
}

.tfv-os-checkout__checks > div {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tfv-os-checkout__check {
  display: grid;
  place-items: center;

  width: 23px;
  height: 23px;
  flex: 0 0 23px;

  color: #07140b;
  background: var(--tfv-os-green);

  border-radius: 50%;

  font-size: 0.65rem;
  font-weight: 900;
}

.tfv-os-checkout__check--optional {
  color: var(--tfv-os-gold);
  background: rgba(197, 157, 95, 0.08);
  border: 1px solid rgba(197, 157, 95, 0.24);
}

.tfv-os-checkout__checks small,
.tfv-os-checkout__checks strong {
  display: block;
}

.tfv-os-checkout__checks small {
  color: rgba(255, 255, 255, 0.3);

  font-size: 6.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tfv-os-checkout__checks strong {
  margin-top: 3px;

  color: rgba(255, 255, 255, 0.77);

  font-size: 0.68rem;
  font-weight: 650;
}

.tfv-os-checkout__total {
  position: relative;
  z-index: 1;

  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;

  margin-top: 12px;
  padding: 14px;

  background:
    linear-gradient(
      135deg,
      rgba(197, 157, 95, 0.09),
      rgba(255, 255, 255, 0.014)
    );

  border: 1px solid rgba(197, 157, 95, 0.19);
  border-radius: 9px;
}

.tfv-os-checkout__total span,
.tfv-os-checkout__total strong {
  display: block;
}

.tfv-os-checkout__total > div:first-child > span {
  color: rgba(255, 255, 255, 0.34);

  font-size: 7px;
  font-weight: 750;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.tfv-os-checkout__total > div:first-child > strong {
  margin-top: 5px;

  color: var(--tfv-os-gold-light);

  font-family: "Playfair Display", serif;
  font-size: 1.45rem;
  line-height: 1;
}

.tfv-os-checkout__lock {
  display: inline-flex;
  align-items: center;
  gap: 6px;

  color: var(--tfv-os-green);

  font-size: 7px;
  font-weight: 800;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.tfv-os-checkout__form {
  position: relative;
  z-index: 1;

  margin-top: 13px;
}

.tfv-os-checkout__button {
  position: relative;

  display: flex;
  align-items: center;
  justify-content: center;
  gap: 11px;

  width: 100%;
  min-height: 56px;
  padding: 14px 17px;

  overflow: hidden;

  color: #080808;

  background:
    linear-gradient(
      135deg,
      #a87536,
      #f7dc94 50%,
      #9c692d
    );

  border: 1px solid rgba(247, 220, 148, 0.72);
  border-radius: 9px;

  cursor: pointer;

  box-shadow:
    0 15px 36px rgba(0, 0, 0, 0.4),
    0 0 28px rgba(197, 157, 95, 0.15);

  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.11em;
  text-transform: uppercase;

  transition:
    transform 180ms ease,
    box-shadow 240ms ease,
    filter 220ms ease;
}

.tfv-os-checkout__button::before {
  content: "";

  position: absolute;
  top: -35%;
  bottom: -35%;
  left: -42%;

  width: 25%;

  opacity: 0;
  transform: skewX(-18deg);

  background:
    linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.62),
      transparent
    );
}

.tfv-os-checkout__button::after {
  content: "";

  position: absolute;
  top: 0;
  right: -35%;
  bottom: 0;

  width: 25%;

  opacity: 0.3;
  transform: skewX(-18deg);

  background:
    linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.32),
      transparent
    );

  animation: tfvOsCheckoutIdleSheen 7s ease-in-out infinite;
}

.tfv-os-checkout__button:hover {
  transform: translateY(-2px);

  box-shadow:
    0 19px 43px rgba(0, 0, 0, 0.46),
    0 0 38px rgba(197, 157, 95, 0.25);
}

.tfv-os-checkout__button:hover::before {
  animation: tfvOsCheckoutSheen 820ms ease forwards;
}

.tfv-os-checkout__button:active {
  transform: scale(0.98);
}

.tfv-os-checkout__button:disabled {
  cursor: wait;
  opacity: 0.7;
}

.tfv-os-checkout__button-icon {
  display: flex;

  transition: transform 500ms cubic-bezier(.2, .8, .2, 1);
}

.tfv-os-checkout__button.is-processing
.tfv-os-checkout__button-icon {
  transform: rotate(90deg);
}

.tfv-os-checkout__button-text {
  position: relative;
  z-index: 2;
}

.tfv-os-checkout__button-arrow {
  position: relative;
  z-index: 2;

  font-size: 1rem;

  transition: transform 200ms ease;
}

.tfv-os-checkout__button:hover
.tfv-os-checkout__button-arrow {
  transform: translateX(3px);
}

.tfv-os-checkout__security {
  position: relative;
  z-index: 1;

  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;

  margin-top: 10px;

  color: rgba(255, 255, 255, 0.31);

  font-size: 7px;
  letter-spacing: 0.05em;
}

/* =========================================
   CHECKOUT TRANSITION
========================================= */

.tfv-os-transition {
  position: absolute;
  inset: 0;
  z-index: 50;

  display: grid;
  place-items: center;

  padding: 28px;

  color: #ffffff;
  background: rgba(5, 5, 5, 0.97);

  opacity: 0;
  visibility: hidden;
  pointer-events: none;

  transition:
    opacity 300ms ease,
    visibility 300ms ease;
}

.tfv-os-transition.is-active {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}

.tfv-os-transition__ambient {
  position: absolute;
  inset: 0;

  background:
    radial-gradient(
      circle at 50% 42%,
      rgba(197, 157, 95, 0.15),
      transparent 35%
    ),
    linear-gradient(
      145deg,
      rgba(255, 255, 255, 0.018),
      transparent 45%
    );

  pointer-events: none;
}

.tfv-os-transition__content {
  position: relative;
  z-index: 2;

  width: min(310px, 100%);

  text-align: center;
}

.tfv-os-transition__mark {
  display: grid;
  place-items: center;

  width: 88px;
  height: 88px;

  margin: 0 auto 22px;

  color: var(--tfv-os-gold);

  background: rgba(197, 157, 95, 0.05);

  border: 1px solid rgba(197, 157, 95, 0.24);
  border-radius: 50%;

  box-shadow:
    0 0 35px rgba(197, 157, 95, 0.09);

  animation: tfvOsTransitionRotate 3.2s linear infinite;
}

.tfv-os-transition__brand {
  display: block;

  color: var(--tfv-os-gold);

  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.tfv-os-transition h3 {
  margin: 10px 0 0;

  color: #ffffff;

  font-family: "Playfair Display", serif;
  font-size: 1.55rem;
  font-weight: 800;
}

.tfv-os-transition p {
  margin: 8px 0 0;

  color: rgba(255, 255, 255, 0.47);

  font-size: 0.74rem;
}

.tfv-os-transition__progress {
  height: 3px;

  margin-top: 24px;

  overflow: hidden;

  background: rgba(255, 255, 255, 0.075);

  border-radius: 999px;
}

.tfv-os-transition__progress span {
  display: block;

  width: 0;
  height: 100%;

  background:
    linear-gradient(
      90deg,
      #8d5e27,
      var(--tfv-os-gold-light),
      #8d5e27
    );

  border-radius: inherit;

  box-shadow:
    0 0 13px rgba(197, 157, 95, 0.42);

  transition: width 360ms ease;
}

.tfv-os-transition__system {
  display: inline-flex;
  align-items: center;
  gap: 7px;

  margin-top: 16px;

  color: rgba(255, 255, 255, 0.33);

  font-size: 7px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.tfv-os-transition__system-led {
  width: 6px;
  height: 6px;

  border-radius: 50%;

  background: var(--tfv-os-gold);

  box-shadow:
    0 0 9px rgba(197, 157, 95, 0.68);

  animation: tfvOsCheckoutLed 1.3s ease-in-out infinite;
}

/* =========================================
   CHECKOUT ANIMATIONS
========================================= */

@keyframes tfvOsCheckoutLed {
  0%,
  100% {
    opacity: 0.45;
    transform: scale(0.88);
  }

  50% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes tfvOsCheckoutSheen {
  from {
    left: -42%;
    opacity: 0;
  }

  20% {
    opacity: 1;
  }

  to {
    left: 125%;
    opacity: 0;
  }
}

@keyframes tfvOsCheckoutIdleSheen {
  0%,
  75% {
    right: -35%;
    opacity: 0;
  }

  84% {
    opacity: 0.33;
  }

  100% {
    right: 125%;
    opacity: 0;
  }
}

@keyframes tfvOsTransitionRotate {
  from {
    transform: rotate(0);
  }

  to {
    transform: rotate(360deg);
  }
}
  /* =========================================
     FABRIC VAULT OS — FOUNDATION
  ========================================= */

  .tfv-os-drawer {
    --tfv-os-gold: #c59d5f;
    --tfv-os-gold-light: #f7dc94;
    --tfv-os-green: #4ade80;
    --tfv-os-black: #080808;
    --tfv-os-panel: #0d0d0d;
    --tfv-os-border: rgba(255, 255, 255, 0.09);

    position: fixed;
    inset: 0;
    z-index: 100000;
    color: #ffffff;
  }

  .tfv-os-drawer.is-open {
    display: block !important;
  }

  .tfv-os-drawer__backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.74);
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
    opacity: 0;
    transition: opacity 350ms ease;
  }

  .tfv-os-drawer.is-open .tfv-os-drawer__backdrop {
    opacity: 1;
  }

  .tfv-os-drawer__panel {
    position: absolute;
    top: 0;
    right: 0;

    display: flex;
    flex-direction: column;

    width: 100%;
    max-width: 440px;
    height: 100%;

    overflow: hidden;

    background:
      linear-gradient(
        145deg,
        rgba(255, 255, 255, 0.018),
        transparent 38%
      ),
      var(--tfv-os-black);

    border-left: 1px solid rgba(197, 157, 95, 0.16);

    box-shadow:
      -18px 0 65px rgba(0, 0, 0, 0.75);

    transform: translateX(100%);

    transition:
      transform 420ms cubic-bezier(.2, .8, .2, 1);
  }

  .tfv-os-drawer.is-open .tfv-os-drawer__panel {
    transform: translateX(0);
  }

  /* =========================================
     MODULE 01 — COMMAND HEADER
  ========================================= */

  .tfv-os-header {
    position: relative;

    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;

    min-height: 112px;
    padding: 24px;

    overflow: hidden;

    background:
      radial-gradient(
        circle at 15% 45%,
        rgba(197, 157, 95, 0.13),
        transparent 40%
      ),
      linear-gradient(
        145deg,
        rgba(255, 255, 255, 0.025),
        transparent 42%
      ),
      #0b0b0b;

    border-bottom:
      1px solid rgba(197, 157, 95, 0.21);
  }

  .tfv-os-header::before {
    content: "";

    position: absolute;
    top: 0;
    left: 50%;

    width: 74%;
    height: 1px;

    transform: translateX(-50%);

    background:
      linear-gradient(
        90deg,
        transparent,
        rgba(247, 220, 148, 0.82),
        transparent
      );

    box-shadow:
      0 0 18px rgba(197, 157, 95, 0.3);
  }

  .tfv-os-header::after {
    content: "";

    position: absolute;
    top: -65px;
    right: -48px;

    width: 140px;
    height: 140px;

    border-radius: 50%;

    background: rgba(197, 157, 95, 0.12);

    filter: blur(40px);

    pointer-events: none;
  }

  .tfv-os-header__content {
    position: relative;
    z-index: 2;
  }

  .tfv-os-header__status {
    display: inline-flex;
    align-items: center;
    gap: 8px;

    margin-bottom: 10px;

    color: rgba(255, 255, 255, 0.56);

    font-size: 9px;
    font-weight: 800;
    line-height: 1;
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }

  .tfv-os-header__led {
    width: 7px;
    height: 7px;
    flex: 0 0 7px;

    border-radius: 50%;

    background: var(--tfv-os-gold);

    box-shadow:
      0 0 9px rgba(197, 157, 95, 0.85),
      0 0 20px rgba(197, 157, 95, 0.35);

    animation:
      tfvOsLedPulse 1.8s ease-in-out infinite;
  }

  .tfv-os-header__title {
    margin: 0;

    color: #ffffff;

    font-family: "Playfair Display", serif;
    font-size: 1.58rem;
    font-weight: 800;
    line-height: 1.05;
    letter-spacing: 0.025em;

    text-shadow:
      0 0 22px rgba(197, 157, 95, 0.13);
  }

  .tfv-os-header__subtitle {
    margin: 7px 0 0;

    color: rgba(255, 255, 255, 0.5);

    font-size: 10px;
    font-weight: 700;
    line-height: 1.4;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .tfv-os-header__close {
    position: relative;
    z-index: 3;

    display: grid;
    place-items: center;

    width: 40px;
    height: 40px;
    flex: 0 0 40px;
    padding: 0;

    color: rgba(255, 255, 255, 0.76);
    background: rgba(255, 255, 255, 0.025);

    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 50%;

    cursor: pointer;

    transition:
      color 220ms ease,
      background 220ms ease,
      border-color 220ms ease,
      transform 180ms ease,
      box-shadow 220ms ease;
  }

  .tfv-os-header__close:hover {
    color: var(--tfv-os-gold-light);

    background: rgba(197, 157, 95, 0.1);

    border-color: rgba(197, 157, 95, 0.45);

    box-shadow:
      0 0 20px rgba(197, 157, 95, 0.12);

    transform: rotate(4deg);
  }

  .tfv-os-header__close:active {
    transform: scale(0.94);
  }

  /* =========================================
     DYNAMIC CONTENT
  ========================================= */

  .tfv-os-drawer__content {
    flex: 1;

    overflow-y: auto;
    overscroll-behavior: contain;

    padding: 20px;

    scrollbar-width: thin;
    scrollbar-color:
      rgba(197, 157, 95, 0.45)
      rgba(255, 255, 255, 0.03);
  }

  .tfv-os-drawer__content::-webkit-scrollbar {
    width: 4px;
  }

  .tfv-os-drawer__content::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.03);
  }

  .tfv-os-drawer__content::-webkit-scrollbar-thumb {
    background: rgba(197, 157, 95, 0.45);
    border-radius: 999px;
  }

  .tfv-os-development-module {
    display: flex;
    align-items: center;
    gap: 13px;

    padding: 18px;

    background:
      linear-gradient(
        145deg,
        rgba(255, 255, 255, 0.025),
        transparent
      ),
      #101010;

    border: 1px solid rgba(197, 157, 95, 0.2);
    border-radius: 13px;

    box-shadow:
      0 12px 32px rgba(0, 0, 0, 0.32);
  }

  .tfv-os-development-module__led {
    width: 9px;
    height: 9px;
    flex: 0 0 9px;

    border-radius: 50%;

    background: var(--tfv-os-gold);

    box-shadow:
      0 0 12px rgba(197, 157, 95, 0.72);
  }

  .tfv-os-development-module strong,
  .tfv-os-development-module span {
    display: block;
  }

  .tfv-os-development-module strong {
    color: var(--tfv-os-gold-light);

    font-size: 0.72rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .tfv-os-development-module div > span {
    margin-top: 4px;

    color: rgba(255, 255, 255, 0.52);

    font-size: 0.7rem;
  }

@media (max-width: 360px) {
  .tfv-os-status__grid {
    grid-template-columns: 1fr;
  }
}

  /* =========================================
   MODULE 04 — INVENTORY ITEMS
========================================= */

.tfv-os-inventory {
  margin-bottom: 16px;
}

.tfv-os-inventory__heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 15px;
  margin-bottom: 12px;
  padding: 0 2px;
}

.tfv-os-inventory__kicker {
  display: block;
  margin-bottom: 4px;
  color: var(--tfv-os-gold);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.tfv-os-inventory__heading h3 {
  margin: 0;
  color: #ffffff;
  font-family: "Playfair Display", serif;
  font-size: 1.08rem;
  font-weight: 750;
}

.tfv-os-inventory__count {
  color: rgba(255, 255, 255, 0.34);
  font-size: 8px;
  font-weight: 750;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.tfv-os-inventory__list {
  display: grid;
  gap: 11px;
}

.tfv-os-item {
  position: relative;
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 14px;
  overflow: hidden;
  padding: 11px;
  background:
    linear-gradient(
      145deg,
      rgba(255, 255, 255, 0.026),
      transparent 42%
    ),
    #101010;
  border: 1px solid rgba(255, 255, 255, 0.075);
  border-radius: 12px;
  box-shadow:
    0 12px 30px rgba(0, 0, 0, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.025);
  transition:
    border-color 220ms ease,
    transform 220ms ease,
    box-shadow 220ms ease;
}

.tfv-os-item--releasing{
    opacity:0;
    transform:
        translateX(-40px)
        scale(.94);

    filter:blur(2px);

    transition:
        opacity .35s ease,
        transform .35s cubic-bezier(.25,.8,.25,1),
        filter .35s ease;
}

.tfv-os-item:hover,
.tfv-os-item:focus-within {
  border-color: rgba(197, 157, 95, 0.28);
  transform: translateY(-1px);
  box-shadow:
    0 15px 36px rgba(0, 0, 0, 0.34),
    0 0 20px rgba(197, 157, 95, 0.055);
}

.tfv-os-item__image {
  position: relative;
  display: block;
  width: 92px;
  height: 116px;
  overflow: hidden;
  color: var(--tfv-os-gold);
  background:
    radial-gradient(
      circle at 50% 35%,
      rgba(197, 157, 95, 0.1),
      transparent 48%
    ),
    #171717;
  border-radius: 8px;
  text-decoration: none;
}

.tfv-os-item__image img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 500ms cubic-bezier(.2, .8, .2, 1);
}

.tfv-os-item:hover .tfv-os-item__image img {
  transform: scale(1.025);
}

.tfv-os-item__image > span:first-child {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  font-family: "Playfair Display", serif;
  font-size: 1.2rem;
  font-weight: 800;
}

.tfv-os-item__image-frame {
  position: absolute;
  inset: 5px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 5px;
  pointer-events: none;
}

.tfv-os-item__details {
  min-width: 0;
}

.tfv-os-item__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 9px;
}

.tfv-os-item__classification,
.tfv-os-item__id {
  display: block;
}

.tfv-os-item__classification {
  color: #ffffff;
  font-size: 0.76rem;
  font-weight: 800;
  line-height: 1.3;
  letter-spacing: 0.025em;
  text-transform: uppercase;
}

.tfv-os-item__id {
  margin-top: 4px;
  color: rgba(255, 255, 255, 0.28);
  font-size: 6.5px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.tfv-os-item__offer-badge {
  flex: 0 0 auto;
  padding: 5px 7px;
  color: #080808;
  background: linear-gradient(
    135deg,
    #ad7d3d,
    #f7dc94,
    #9d6b2e
  );
  border: 1px solid rgba(247, 220, 148, 0.55);
  border-radius: 999px;
  font-size: 6px;
  font-weight: 900;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.tfv-os-item__variant {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 11px;
  padding: 7px 8px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.055);
  border-radius: 6px;
}

.tfv-os-item__variant span {
  color: rgba(255, 255, 255, 0.3);
  font-size: 6.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tfv-os-item__variant strong {
  overflow: hidden;
  color: rgba(255, 255, 255, 0.75);
  font-size: 0.66rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tfv-os-item__status-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
}

.tfv-os-item__reserved {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.48);
  font-size: 7px;
  font-weight: 800;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.tfv-os-item__reserved-led {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--tfv-os-gold);
  box-shadow: 0 0 9px rgba(197, 157, 95, 0.66);
}

.tfv-os-item__value {
  text-align: right;
}

.tfv-os-item__value span,
.tfv-os-item__value strong {
  display: block;
}

.tfv-os-item__value span {
  color: rgba(255, 255, 255, 0.28);
  font-size: 6px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.tfv-os-item__value strong {
  margin-top: 2px;
  color: var(--tfv-os-gold-light);
  font-size: 0.8rem;
}

.tfv-os-item__controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
  margin-top: 11px;
}

.tfv-os-quantity {
  display: inline-grid;
  grid-template-columns: 28px 29px 28px;
  min-height: 29px;
  overflow: hidden;
  background: #0a0a0a;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 6px;
}

.tfv-os-quantity button,
.tfv-os-quantity span {
  display: grid;
  place-items: center;
  min-width: 0;
  padding: 0;
}

.tfv-os-quantity button {
  color: rgba(255, 255, 255, 0.7);
  background: transparent;
  border: 0;
  cursor: pointer;
  font-size: 0.9rem;
  transition:
    color 180ms ease,
    background 180ms ease;
}

.tfv-os-quantity button:hover {
  color: #080808;
  background: var(--tfv-os-gold);
}

.tfv-os-quantity span {
  color: #ffffff;
  border-right: 1px solid rgba(255, 255, 255, 0.07);
  border-left: 1px solid rgba(255, 255, 255, 0.07);
  font-size: 0.68rem;
  font-weight: 800;
}

.tfv-os-item__release {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 0;
  color: rgba(255, 255, 255, 0.34);
  background: transparent;
  border: 0;
  cursor: pointer;
  font-size: 7px;
  font-weight: 750;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  transition: color 180ms ease;
}

.tfv-os-item__release:hover {
  color: var(--tfv-os-gold-light);
}

/* =========================================
   EMPTY INVENTORY
========================================= */

.tfv-os-empty {
  display: grid;
  justify-items: center;
  padding: 36px 20px;
  color: rgba(255, 255, 255, 0.55);
  text-align: center;
  background:
    radial-gradient(
      circle at 50% 35%,
      rgba(197, 157, 95, 0.08),
      transparent 43%
    ),
    #101010;
  border: 1px solid rgba(197, 157, 95, 0.17);
  border-radius: 14px;
}

.tfv-os-empty__vault {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  color: var(--tfv-os-gold);
  background: rgba(197, 157, 95, 0.06);
  border: 1px solid rgba(197, 157, 95, 0.22);
  border-radius: 50%;
  box-shadow:
    0 0 28px rgba(197, 157, 95, 0.08);
}

.tfv-os-empty__status {
  margin-top: 18px;
  color: var(--tfv-os-gold);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.tfv-os-empty h3 {
  margin: 8px 0 0;
  color: #ffffff;
  font-family: "Playfair Display", serif;
  font-size: 1.22rem;
}

.tfv-os-empty p {
  max-width: 240px;
  margin: 8px 0 0;
  font-size: 0.76rem;
  line-height: 1.55;
}

.tfv-os-empty__action {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  margin-top: 19px;
  padding: 11px 15px;
  color: #080808;
  background: linear-gradient(
    135deg,
    #ad7d3d,
    #f7dc94,
    #9d6b2e
  );
  border-radius: 7px;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-decoration: none;
  text-transform: uppercase;
}

.tfv-os-empty__action span {
  transition: transform 180ms ease;
}

.tfv-os-empty__action:hover span {
  transform: translateX(3px);
}

@media (max-width: 360px) {
  .tfv-os-item {
    grid-template-columns: 78px minmax(0, 1fr);
    gap: 10px;
  }

  .tfv-os-item__image {
    width: 78px;
    height: 102px;
  }

  .tfv-os-item__offer-badge {
    display: none;
  }
}

/* =========================================
   MODULE 05 — VAULTCARE PROTECTION
========================================= */

.tfv-os-protection {
  position: relative;
  overflow: hidden;
  margin-bottom: 16px;
  padding: 18px;

  background:
    linear-gradient(
      145deg,
      rgba(197, 157, 95, 0.11),
      rgba(255, 255, 255, 0.018) 48%,
      transparent
    ),
    #101010;

  border: 1px solid rgba(197, 157, 95, 0.32);
  border-radius: 14px;

  box-shadow:
    0 14px 36px rgba(0, 0, 0, 0.34),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);

  transition:
    border-color 240ms ease,
    box-shadow 240ms ease,
    transform 220ms ease;
}

.tfv-os-protection:hover {
  border-color: rgba(197, 157, 95, 0.48);

  box-shadow:
    0 17px 42px rgba(0, 0, 0, 0.4),
    0 0 26px rgba(197, 157, 95, 0.07);

  transform: translateY(-1px);
}

.tfv-os-protection--active {
  background:
    linear-gradient(
      145deg,
      rgba(74, 222, 128, 0.1),
      rgba(255, 255, 255, 0.018) 48%,
      transparent
    ),
    #101010;

  border-color: rgba(74, 222, 128, 0.34);
}

.tfv-os-protection--active:hover {
  border-color: rgba(74, 222, 128, 0.5);

  box-shadow:
    0 17px 42px rgba(0, 0, 0, 0.4),
    0 0 26px rgba(74, 222, 128, 0.08);
}

.tfv-os-protection__glow {
  position: absolute;
  top: -75px;
  right: -65px;

  width: 160px;
  height: 160px;

  border-radius: 50%;

  background: var(--tfv-os-gold);
  opacity: 0.12;
  filter: blur(44px);

  pointer-events: none;
}

.tfv-os-protection--active .tfv-os-protection__glow {
  background: var(--tfv-os-green);
}

.tfv-os-protection__header {
  position: relative;
  z-index: 1;

  display: flex;
  align-items: center;
  gap: 12px;
}

.tfv-os-protection__shield {
  display: grid;
  place-items: center;

  width: 46px;
  height: 46px;
  flex: 0 0 46px;

  color: var(--tfv-os-gold);

  background: rgba(197, 157, 95, 0.09);

  border: 1px solid rgba(197, 157, 95, 0.3);
  border-radius: 12px;

  box-shadow:
    inset 0 0 16px rgba(197, 157, 95, 0.04);
}

.tfv-os-protection--active .tfv-os-protection__shield {
  color: var(--tfv-os-green);

  background: rgba(74, 222, 128, 0.08);

  border-color: rgba(74, 222, 128, 0.3);

  box-shadow:
    0 0 20px rgba(74, 222, 128, 0.08);
}

.tfv-os-protection__identity {
  flex: 1;
  min-width: 0;
}

.tfv-os-protection__kicker,
.tfv-os-protection__identity strong,
.tfv-os-protection__price {
  display: block;
}

.tfv-os-protection__kicker {
  margin-bottom: 4px;

  color: var(--tfv-os-gold);

  font-size: 8px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.tfv-os-protection--active .tfv-os-protection__kicker {
  color: var(--tfv-os-green);
}

.tfv-os-protection__identity strong {
  color: #ffffff;

  font-size: 0.96rem;
  line-height: 1.2;
}

.tfv-os-protection__price {
  margin-top: 3px;

  color: rgba(255, 255, 255, 0.4);

  font-size: 0.67rem;
}

.tfv-os-protection__status {
  display: inline-flex;
  align-items: center;
  gap: 6px;

  flex: 0 0 auto;

  padding: 7px 9px;

  color: var(--tfv-os-gold-light);

  background: rgba(197, 157, 95, 0.07);

  border: 1px solid rgba(197, 157, 95, 0.23);
  border-radius: 999px;

  font-size: 7px;
  font-weight: 850;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.tfv-os-protection__status span {
  width: 6px;
  height: 6px;

  border-radius: 50%;

  background: var(--tfv-os-gold);

  box-shadow:
    0 0 8px rgba(197, 157, 95, 0.68);
}

.tfv-os-protection__status--active {
  color: var(--tfv-os-green);

  background: rgba(74, 222, 128, 0.07);

  border-color: rgba(74, 222, 128, 0.25);
}

.tfv-os-protection__status--active span {
  background: var(--tfv-os-green);

  box-shadow:
    0 0 9px rgba(74, 222, 128, 0.7);
}

.tfv-os-protection__description {
  position: relative;
  z-index: 1;

  margin: 16px 0 0;

  color: rgba(255, 255, 255, 0.53);

  font-size: 0.74rem;
  line-height: 1.6;
}

.tfv-os-protection__benefits {
  position: relative;
  z-index: 1;

  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;

  margin-top: 15px;
  padding-top: 14px;

  border-top: 1px solid rgba(255, 255, 255, 0.065);
}

.tfv-os-protection__benefits > div {
  display: flex;
  align-items: flex-start;
  gap: 7px;

  color: rgba(255, 255, 255, 0.51);

  font-size: 0.66rem;
  line-height: 1.4;
}

.tfv-os-protection__benefits > div span {
  color: var(--tfv-os-gold);
  font-weight: 900;
}

.tfv-os-protection--active
.tfv-os-protection__benefits > div span {
  color: var(--tfv-os-green);
}

.tfv-os-protection__verified {
  position: relative;
  z-index: 1;

  display: flex;
  align-items: center;
  gap: 11px;

  margin-top: 15px;
  padding: 12px;

  background: rgba(74, 222, 128, 0.07);

  border: 1px solid rgba(74, 222, 128, 0.24);
  border-radius: 9px;
}

.tfv-os-protection__verified-icon {
  display: grid;
  place-items: center;

  width: 29px;
  height: 29px;
  flex: 0 0 29px;

  color: #07140b;
  background: var(--tfv-os-green);

  border-radius: 50%;

  font-size: 0.8rem;
  font-weight: 900;
}

.tfv-os-protection__verified strong,
.tfv-os-protection__verified p {
  display: block;
}

.tfv-os-protection__verified strong {
  color: var(--tfv-os-green);

  font-size: 0.73rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.tfv-os-protection__verified p {
  margin: 4px 0 0;

  color: rgba(255, 255, 255, 0.48);

  font-size: 0.66rem;
  line-height: 1.45;
}

.tfv-os-protection__button {
  position: relative;
  z-index: 1;

  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;

  width: 100%;
  min-height: 45px;

  margin-top: 16px;
  padding: 11px 14px;

  overflow: hidden;

  color: #080808;

  background:
    linear-gradient(
      135deg,
      #ad7d3d,
      #f7dc94 52%,
      #9d6b2e
    );

  border: 1px solid rgba(247, 220, 148, 0.63);
  border-radius: 8px;

  cursor: pointer;

  box-shadow:
    0 10px 25px rgba(0, 0, 0, 0.31),
    0 0 20px rgba(197, 157, 95, 0.1);

  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.09em;
  text-transform: uppercase;

  transition:
    transform 180ms ease,
    box-shadow 220ms ease,
    opacity 220ms ease;
}

.tfv-os-protection__button::before {
  content: "";

  position: absolute;
  top: -30%;
  bottom: -30%;
  left: -40%;

  width: 24%;

  opacity: 0;
  transform: skewX(-18deg);

  background:
    linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.55),
      transparent
    );
}

.tfv-os-protection__button:hover {
  transform: translateY(-1px);

  box-shadow:
    0 13px 30px rgba(0, 0, 0, 0.38),
    0 0 28px rgba(197, 157, 95, 0.18);
}

.tfv-os-protection__button:hover::before {
  animation: tfvOsProtectionSheen 800ms ease forwards;
}

.tfv-os-protection__button:active {
  transform: scale(0.98);
}

.tfv-os-protection__button:disabled {
  cursor: wait;
  opacity: 0.62;
}

.tfv-os-protection__button-price {
  flex: 0 0 auto;

  padding-left: 13px;

  border-left: 1px solid rgba(0, 0, 0, 0.22);
}

.tfv-os-protection.is-adding .tfv-os-protection__shield {
  animation: tfvOsShieldPulse 720ms ease-in-out infinite;
}

@keyframes tfvOsProtectionSheen {
  from {
    left: -40%;
    opacity: 0;
  }

  20% {
    opacity: 1;
  }

  to {
    left: 125%;
    opacity: 0;
  }
}

@keyframes tfvOsShieldPulse {
  0%,
  100% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.07);

    box-shadow:
      0 0 23px rgba(197, 157, 95, 0.24);
  }
}

@media (max-width: 380px) {
  .tfv-os-protection__benefits {
    grid-template-columns: 1fr;
  }

  .tfv-os-protection__status {
    padding: 6px 7px;
    font-size: 6px;
  }
}

  /* =========================================
     INTERNAL FOOTER
  ========================================= */

  .tfv-os-footer {
    display: flex;
    justify-content: space-between;
    gap: 15px;

    padding: 13px 20px;

    color: rgba(255, 255, 255, 0.27);

    background: #080808;

    border-top: 1px solid rgba(255, 255, 255, 0.055);

    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  /* =========================================
     ANIMATIONS
  ========================================= */

  @keyframes tfvOsLedPulse {
    0%,
    100% {
      opacity: 0.4;
      transform: scale(0.86);
    }

    50% {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* =========================================
     MOBILE
  ========================================= */

  @media (max-width: 480px) {
    .tfv-os-drawer__panel {
      max-width: 100%;
    }

    .tfv-os-header {
      min-height: 104px;
      padding: 21px 19px;
    }

    .tfv-os-header__title {
      font-size: 1.42rem;
    }

    .tfv-os-header__close {
      width: 38px;
      height: 38px;
      flex-basis: 38px;
    }

    .tfv-os-drawer__content {
      padding: 16px;
    }
  }

  /* =========================================
     ACCESSIBILITY
  ========================================= */

  .tfv-os-drawer button:focus-visible,
  .tfv-os-drawer a:focus-visible {
    outline: 2px solid var(--tfv-os-gold-light);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .tfv-os-drawer__panel,
    .tfv-os-drawer__backdrop,
    .tfv-os-header__led {
      animation: none !important;
      transition: none !important;
    }
  }


  /* =========================================
     MODULE 08 — AJAX CONTROLLER STATES
  ========================================= */

  .tfv-os-drawer.is-busy .tfv-os-drawer__content {
    pointer-events: none;
  }

  .tfv-os-item.is-updating {
    opacity: 0.58;
    transform: scale(0.985);
  }

  .tfv-os-item.is-releasing {
    opacity: 0;
    transform: translateX(24px) scale(0.97);
    max-height: 0;
    margin: 0;
    padding-top: 0;
    padding-bottom: 0;
    border-width: 0;
  }

  .tfv-os-item,
  .tfv-os-item.is-releasing {
    transition:
      opacity 220ms ease,
      transform 260ms cubic-bezier(.2, .8, .2, 1),
      max-height 300ms ease,
      margin 300ms ease,
      padding 300ms ease,
      border-width 300ms ease;
  }

  .tfv-os-protection.is-adding .tfv-os-protection__button-text::after {
    content: "...";
  }

  .tfv-os-controller-message {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 100100;
    max-width: min(340px, calc(100vw - 36px));
    padding: 12px 14px;
    color: #ffffff;
    background: #111111;
    border: 1px solid rgba(197, 157, 95, 0.34);
    border-radius: 9px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
    font-size: 0.76rem;
    line-height: 1.45;
    opacity: 0;
    transform: translateY(10px);
    transition: opacity 180ms ease, transform 180ms ease;
  }

  .tfv-os-controller-message.is-visible {
    opacity: 1;
    transform: translateY(0);
  }

  .tfv-os-protection__remove {
  position: relative;
  z-index: 1;

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;

  width: 100%;
  min-height: 40px;

  margin-top: 14px;
  padding: 10px 13px;

  color: rgba(255, 255, 255, 0.56);
  background: rgba(255, 255, 255, 0.025);

  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 8px;

  cursor: pointer;

  font-size: 7px;
  font-weight: 800;
  letter-spacing: 0.09em;
  text-transform: uppercase;

  transition:
    color 180ms ease,
    border-color 180ms ease,
    background 180ms ease,
    transform 180ms ease;
}

.tfv-os-protection__remove:hover {
  color: var(--tfv-os-gold-light);
  background: rgba(197, 157, 95, 0.07);
  border-color: rgba(197, 157, 95, 0.28);
  transform: translateY(-1px);
}

.tfv-os-protection__remove:active {
  transform: scale(0.98);
}

</style>

<script>
  /* =========================================
     MODULE 08 — FABRIC VAULT OS CONTROLLER
  ========================================= */

  (() => {
    if (window.__tfvVaultOsControllerLoaded) return;
    window.__tfvVaultOsControllerLoaded = true;

    const ROOT =
      (window.Shopify &&
        window.Shopify.routes &&
        window.Shopify.routes.root) ||
      '/';

    const DRAWER_ID = 'cart-drawer-vaultos';
    const VAULTCARE_HANDLE = 'returns-label';
    let requestInFlight = false;

    const delay = (ms) =>
      new Promise((resolve) => window.setTimeout(resolve, ms));

    function getDrawer() {
      return document.getElementById(DRAWER_ID);
    }

    function setBusy(isBusy) {
      const drawer = getDrawer();
      if (!drawer) return;

      drawer.classList.toggle('is-busy', isBusy);
      drawer.setAttribute('aria-busy', isBusy ? 'true' : 'false');
    }

    function showMessage(message) {
      let toast =
        document.getElementById('tfv-os-controller-message');

      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'tfv-os-controller-message';
        toast.className = 'tfv-os-controller-message';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        document.body.appendChild(toast);
      }

      toast.textContent = message;

      requestAnimationFrame(() => {
        toast.classList.add('is-visible');
      });

      window.clearTimeout(toast._tfvTimer);

      toast._tfvTimer = window.setTimeout(() => {
        toast.classList.remove('is-visible');
      }, 3200);
    }

    function updateCartBadges(cart) {
      if (!cart || typeof cart.item_count === 'undefined') return;

      document.dispatchEvent(
        new CustomEvent('tfv:cart-updated', {
          detail: { cart }
        })
      );
    }

    function internalFetch(url, options = {}) {
      const headers = new Headers(options.headers || {});
      headers.set('X-TFV-Internal', '1');

      return window.fetch(url, {
        ...options,
        headers
      });
    }

    async function fetchFreshDrawerMarkup() {
      const url = new URL(window.location.href);
      url.searchParams.set(
        '_tfv_refresh',
        Date.now().toString()
      );

      const response = await internalFetch(url.toString(), {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      if (!response.ok) {
        throw new Error(
          `Drawer refresh failed (${response.status})`
        );
      }

      const html = await response.text();
      const parsed =
        new DOMParser().parseFromString(html, 'text/html');

      const freshDrawer =
        parsed.getElementById(DRAWER_ID);

      if (!freshDrawer) {
        throw new Error(
          'Fresh Vault OS drawer markup was not found.'
        );
      }

      return freshDrawer;
    }

    async function refreshDrawer(cart, options = {}) {
      const currentDrawer = getDrawer();
      if (!currentDrawer) return;

      const previousQualifyingPairs =
        Math.max(
          0,
          Number(currentDrawer.dataset.qualifyingPairs) || 0
        );

      const shouldOpen = options.open !== false;

      const currentHeader =
        currentDrawer.querySelector('.tfv-os-header');

      const currentContent =
        currentDrawer.querySelector(
          '.tfv-os-drawer__content'
        );

      const previousScroll =
        currentContent
          ? currentContent.scrollTop
          : 0;

      const freshDrawer =
        await fetchFreshDrawerMarkup();

      const freshHeader =
        freshDrawer.querySelector('.tfv-os-header');

      const freshContent =
        freshDrawer.querySelector(
          '.tfv-os-drawer__content'
        );

      const nextQualifyingPairs =
        Math.max(
          0,
          Number(freshDrawer.dataset.qualifyingPairs) || 0
        );

      const securedSaving =
        Math.max(
          0,
          Number(freshDrawer.dataset.securedSaving) || 0
        );

      const bundleUnlocked =
        nextQualifyingPairs > previousQualifyingPairs;

      /*
       * Keep the live drawer shell mounted.
       * Only refresh the header and dynamic module area,
       * preventing the drawer from closing and reopening.
       */
      if (currentHeader && freshHeader) {
        currentHeader.innerHTML =
          freshHeader.innerHTML;
      }

      if (currentContent && freshContent) {
        currentContent.innerHTML =
          freshContent.innerHTML;

        currentContent.scrollTop =
          previousScroll;
      }

      currentDrawer.dataset.qualifyingPairs =
        String(nextQualifyingPairs);

      currentDrawer.dataset.securedSaving =
        String(securedSaving);

      currentDrawer.style.display =
        shouldOpen ? 'block' : 'none';

      currentDrawer.setAttribute(
        'aria-hidden',
        shouldOpen ? 'false' : 'true'
      );

      currentDrawer.classList.toggle(
        'is-open',
        shouldOpen
      );

      if (shouldOpen) {
        document.body.classList.add(
          'overflow-hidden'
        );

        const overlay =
          document.getElementById(
            'drawer-overlay'
          );

        if (overlay) {
          overlay.classList.add(
            'is-active'
          );
        }
      }

      updateCartBadges(cart);

      document.dispatchEvent(
        new CustomEvent(
          'tfv:vault-updated',
          {
            detail: {
              cart,
              operation:
                options.operation ||
                'synchronise-inventory',
              bundleUnlocked,
              qualifyingPairs: nextQualifyingPairs,
              securedSaving
            }
          }
        )
      );
    }

    async function postCartChange(id, quantity) {
      const response = await internalFetch(
        `${ROOT}cart/change.js`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify({
            id,
            quantity
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.description ||
          result.message ||
          'Unable to update inventory.'
        );
      }

      return result;
    }

    async function removeOrphanedVaultCare(cart) {
      if (!cart || !Array.isArray(cart.items)) {
        return cart;
      }

      const customerItems =
        cart.items.filter(
          (item) => item.handle !== VAULTCARE_HANDLE
        );

      const vaultCareItem =
        cart.items.find(
          (item) => item.handle === VAULTCARE_HANDLE
        );

      if (
        customerItems.length === 0 &&
        vaultCareItem
      ) {
        return postCartChange(vaultCareItem.key, 0);
      }

      return cart;
    }

    window.tfvOsUpdateCart = async function tfvOsUpdateCart(key, quantity) {
      if (requestInFlight) return;

      const safeQuantity =
        Math.max(0, Number(quantity) || 0);

      const escapedKey =
        window.CSS && CSS.escape
          ? CSS.escape(key)
          : key.replace(/"/g, '\\"');

      const item =
        document.querySelector(
          `.tfv-os-item[data-cart-key="${escapedKey}"]`
        );

      const currentQuantity =
        item
          ? Math.max(
              0,
              Number(item.dataset.itemQuantity) || 0
            )
          : 0;

      let operation = 'synchronise-inventory';

      if (!item && safeQuantity === 0) {
        operation = 'remove-vaultcare';
      } else if (safeQuantity === 0) {
        operation = 'release-inventory';
      } else if (safeQuantity > currentQuantity) {
        operation = 'increase-inventory';
      } else if (safeQuantity < currentQuantity) {
        operation = 'decrease-inventory';
      }

      requestInFlight = true;
      setBusy(true);

      if (item) {
        if (safeQuantity === 0) {
          item.classList.add('tfv-os-item--releasing');

          await new Promise((resolve) => {
            window.setTimeout(resolve, 320);
          });
        } else {
          item.classList.add('is-updating');
        }
      }

      try {
        let cart =
          await postCartChange(key, safeQuantity);

        cart =
          await removeOrphanedVaultCare(cart);

        await refreshDrawer(cart, {
          operation
        });
      } catch (error) {
        console.error(
          '[Fabric Vault OS] Cart update failed:',
          error
        );

        if (item) {
          item.classList.remove(
            'tfv-os-item--releasing',
            'is-releasing',
            'is-updating'
          );
        }

        showMessage(
          error.message ||
          'Inventory could not be updated. Please try again.'
        );
      } finally {
        requestInFlight = false;
        setBusy(false);
      }
    };

    async function activateVaultCare(button) {
      if (requestInFlight || !button) return;

      const variantId =
        Number(button.dataset.vaultcareVariantId);

      if (!variantId) {
        showMessage(
          'VaultCare could not be activated because its variant ID is missing.'
        );

        return;
      }

      requestInFlight = true;
      setBusy(true);

      const module =
        button.closest('.tfv-os-protection');

      const text =
        button.querySelector(
          '.tfv-os-protection__button-text'
        );

      const originalText =
        text ? text.textContent : '';

      button.disabled = true;

      if (module) {
        module.classList.add('is-adding');
      }

      if (text) {
        text.textContent = 'Activating Protection';
      }

      try {
        const response = await internalFetch(
          `${ROOT}cart/add.js`,
          {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json'
            },
            body: JSON.stringify({
              items: [
                {
                  id: variantId,
                  quantity: 1
                }
              ]
            })
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.description ||
            result.message ||
            'VaultCare could not be activated.'
          );
        }

        const cartResponse = await internalFetch(
          `${ROOT}cart.js`,
          {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: {
              Accept: 'application/json'
            }
          }
        );

        const cart = await cartResponse.json();

        await refreshDrawer(cart, {
          operation: 'activate-vaultcare'
        });

        showMessage(
          'VaultCare protection is now active.'
        );
      } catch (error) {
        console.error(
          '[Fabric Vault OS] VaultCare activation failed:',
          error
        );

        button.disabled = false;

        if (module) {
          module.classList.remove('is-adding');
        }

        if (text) {
          text.textContent =
            originalText || 'Activate VaultCare';
        }

        showMessage(
          error.message ||
          'VaultCare could not be activated. Please try again.'
        );
      } finally {
        requestInFlight = false;
        setBusy(false);
      }
    }

    function beginCheckout() {
      const drawer = getDrawer();

      const transition =
        document.getElementById('tfv-os-transition');

      const button =
        document.getElementById(
          'tfv-os-checkout-button'
        );

      const buttonText =
        document.getElementById(
          'tfv-os-checkout-button-text'
        );

      const title =
        document.getElementById(
          'tfv-os-transition-title'
        );

      const message =
        document.getElementById(
          'tfv-os-transition-message'
        );

      const progress =
        document.getElementById(
          'tfv-os-transition-progress'
        );

      const systemText =
        document.getElementById(
          'tfv-os-transition-system-text'
        );

      if (!transition) {
        window.location.assign(`${ROOT}checkout`);
        return;
      }

      if (button) {
        button.disabled = true;
        button.classList.add('is-processing');
      }

      if (buttonText) {
        buttonText.textContent = 'Securing Inventory';
      }

      transition.classList.add('is-active');
      transition.setAttribute('aria-hidden', 'false');

      if (drawer) {
        drawer.setAttribute('aria-busy', 'true');
      }

      requestAnimationFrame(() => {
        if (progress) {
          progress.style.width = '34%';
        }
      });

      window.setTimeout(() => {
        if (title) {
          title.textContent = 'Authorising Dispatch';
        }

        if (message) {
          message.textContent =
            'Preparing secure Shopify checkout...';
        }

        if (systemText) {
          systemText.textContent =
            'Payment gateway verified';
        }

        if (progress) {
          progress.style.width = '72%';
        }
      }, 420);

      window.setTimeout(() => {
        if (title) {
          title.textContent = 'Access Granted';
        }

        if (message) {
          message.textContent =
            'Transferring to secure checkout...';
        }

        if (systemText) {
          systemText.textContent =
            'Dispatch authorisation complete';
        }

        if (progress) {
          progress.style.width = '100%';
        }
      }, 820);

      window.setTimeout(() => {
        window.location.assign(`${ROOT}checkout`);
      }, 1180);
    }

    document.addEventListener('click', (event) => {
      const closeControl =
        event.target.closest('[data-tfv-close="true"]');

      if (
        closeControl &&
        typeof window.closeAllVaultDrawers === 'function'
      ) {
        event.preventDefault();
        window.closeAllVaultDrawers();
        return;
      }

      const vaultCareButton =
        event.target.closest('#tfv-os-add-vaultcare');

      if (vaultCareButton) {
        event.preventDefault();
        activateVaultCare(vaultCareButton);
      }
    });

    document.addEventListener('submit', (event) => {
      const form =
        event.target.closest('#tfv-os-checkout-form');

      if (!form) return;

      event.preventDefault();

      if (requestInFlight) return;

      beginCheckout();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;

      const drawer = getDrawer();

      if (
        drawer &&
        drawer.classList.contains('is-open') &&
        typeof window.closeAllVaultDrawers === 'function'
      ) {
        window.closeAllVaultDrawers();
      }
    });

    if (!window.__tfvVaultOsFetchPatched) {
      window.__tfvVaultOsFetchPatched = true;

      const originalFetch = window.fetch.bind(window);

      window.fetch = async function (...args) {
        const response =
          await originalFetch(...args);

        try {
          const requestUrl =
            typeof args[0] === 'string'
              ? args[0]
              : args[0] && args[0].url
                ? args[0].url
                : '';

          const options = args[1] || {};
          const headers =
            new Headers(options.headers || {});

          const isInternal =
            headers.get('X-TFV-Internal') === '1';

          const isCartAdd =
            requestUrl.includes('/cart/add');

          if (
            !isInternal &&
            isCartAdd &&
            response.ok
          ) {
            window.setTimeout(async () => {
              try {
                const cartResponse =
                  await originalFetch(
                    `${ROOT}cart.js`,
                    {
                      credentials: 'same-origin',
                      cache: 'no-store',
                      headers: {
                        Accept: 'application/json'
                      }
                    }
                  );

                if (!cartResponse.ok) return;

                const cart =
                  await cartResponse.json();

                        await refreshDrawer(cart, {
                  operation: 'secure-inventory',
                  open: false
                });

                const cartTrigger =
                  document.getElementById(
                    'tfv-cart-trigger'
                  );

                if (cartTrigger) {
                  cartTrigger.classList.remove(
                    'tfv-wheel-turn'
                  );

                  void cartTrigger.offsetWidth;

                  cartTrigger.classList.add(
                    'tfv-wheel-turn'
                  );

                  window.setTimeout(() => {
                    cartTrigger.classList.remove(
                      'tfv-wheel-turn'
                    );
                  }, 720);
                }

                document
                  .querySelectorAll(
                    '.cart-count-badge'
                  )
                  .forEach((badge) => {
                    badge.classList.remove(
                      'tfv-badge-pop'
                    );

                    void badge.offsetWidth;

                    badge.classList.add(
                      'tfv-badge-pop'
                    );
                  });

                showMessage(
                  'Inventory secured in your vault.'
                );
              } catch (error) {
                console.error(
                  '[Fabric Vault OS] External cart sync failed:',
                  error
                );
              }
            }, 180);
          }
        } catch (error) {
          console.error(
            '[Fabric Vault OS] Fetch monitoring failed:',
            error
          );
        }

        return response;
      };
    }
  })();
</script>