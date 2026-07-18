"use strict";

const DASHBOARD_ENDPOINT =
  "https://mzrimaqjyrvtbpaeyooe.supabase.co/functions/v1/dashboard-summary";

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = String(value);
  }
}

function formatPercentage(value) {
  const number = Number(value || 0);

  return `${number.toFixed(2)}%`;
}

function setGreeting() {
  const hour = new Date().getHours();

  let greeting = "Good Evening";

  if (hour < 12) {
    greeting = "Good Morning";
  } else if (hour < 18) {
    greeting = "Good Afternoon";
  }

  setText(
    "vault-greeting",
    `${greeting}, Tom.`
  );
}

function createOperatorBrief(traffic, pageTypes) {
  const totalViews =
    Number(traffic.total_page_views || 0);

  const trackedPercentage =
    Number(traffic.tracked_view_percentage || 0);

  const topPageType =
    pageTypes.length > 0
      ? pageTypes[0]
      : null;

  if (totalViews === 0) {
    return (
      "No page views have been recorded today yet. " +
      "Vault OS is online and monitoring the storefront."
    );
  }

  const topPageMessage = topPageType
    ? `${topPageType.page_type} pages currently lead traffic with ` +
      `${topPageType.total_page_views} views.`
    : "Page-type information is still being collected.";

  return (
    `${totalViews} page views have been recorded today. ` +
    `${trackedPercentage.toFixed(2)}% are connected to consented journeys. ` +
    topPageMessage
  );
}

function renderPageTypes(pageTypes) {
  const container =
    document.getElementById("page-type-list");

  if (!container) return;

  container.innerHTML = "";

  if (!Array.isArray(pageTypes) || pageTypes.length === 0) {
    container.innerHTML =
      '<p class="vault-loading">No traffic recorded yet.</p>';

    return;
  }

  pageTypes.forEach((item) => {
    const row = document.createElement("div");

    row.className = "vault-traffic-row";

    const pageType =
      String(item.page_type || "unknown");

    const totalViews =
      Number(item.total_page_views || 0);

    const trackedViews =
      Number(item.tracked_page_views || 0);

    const privacyViews =
      Number(item.privacy_limited_page_views || 0);

    row.innerHTML = `
      <div>
        <strong>${pageType}</strong>
        <span>
          ${trackedViews} tracked ·
          ${privacyViews} privacy protected
        </span>
      </div>

      <strong class="vault-row-value">
        ${totalViews}
      </strong>
    `;

    container.appendChild(row);
  });
}

async function loadDashboard() {
  const errorPanel =
    document.getElementById("vault-error");

  try {
    const response = await fetch(
      DASHBOARD_ENDPOINT,
      {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      }
    );

    if (!response.ok) {
      throw new Error(
        `Dashboard request failed with status ${response.status}`
      );
    }

    const payload = await response.json();

    if (!payload.success) {
      throw new Error(
        payload.error || "Dashboard response was unsuccessful"
      );
    }

    const traffic = payload.traffic || {};
    const pageTypes = payload.page_types || [];

    setText(
      "total-page-views",
      traffic.total_page_views || 0
    );

    setText(
      "tracked-page-views",
      traffic.tracked_page_views || 0
    );

    setText(
      "privacy-page-views",
      traffic.privacy_limited_page_views || 0
    );

    setText(
      "tracked-sessions",
      traffic.tracked_sessions || 0
    );

    setText(
      "tracked-percentage",
      `${formatPercentage(
        traffic.tracked_view_percentage
      )} of views`
    );

    setText(
      "privacy-percentage",
      `${formatPercentage(
        traffic.privacy_limited_percentage
      )} of views`
    );

    setText(
      "operator-brief",
      createOperatorBrief(
        traffic,
        pageTypes
      )
    );

    renderPageTypes(pageTypes);

    const updatedAt = new Date(
      payload.generated_at
    );

    setText(
      "vault-updated",
      `Updated ${updatedAt.toLocaleTimeString(
        "en-GB",
        {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        }
      )}`
    );

    if (errorPanel) {
      errorPanel.hidden = true;
    }
  } catch (error) {
    console.error("[Vault Command]", error);

    if (errorPanel) {
      errorPanel.hidden = false;
      errorPanel.textContent =
        error instanceof Error
          ? error.message
          : "Vault Command could not load live data.";
    }

    setText(
      "vault-updated",
      "Connection failed"
    );
  }
}

setGreeting();
loadDashboard();

/*
 * Refresh live dashboard data once per minute.
 */
window.setInterval(
  loadDashboard,
  60_000
);