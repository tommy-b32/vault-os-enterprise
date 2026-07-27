export default function PredictionInsightsStyles() {
  return (
    <style>{`
      .prediction-insights-section {
        margin-top: 22px;
      }

      .prediction-summary-status {
        display: inline-flex;
        align-items: center;
        min-height: 26px;
        padding: 5px 10px;
        border: 1px solid rgba(212, 168, 70, 0.22);
        border-radius: 999px;
        color: #d9b14b;
        background: rgba(212, 168, 70, 0.07);
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .prediction-insights-grid {
        display: grid;
        grid-template-columns:
          minmax(0, 1.25fr)
          minmax(340px, 0.75fr);
        gap: 16px;
        margin-top: 12px;
      }

      .prediction-featured {
        position: relative;
        min-width: 0;
        padding: 26px;
        overflow: hidden;
        border-color: rgba(212, 168, 70, 0.42);
        background:
          radial-gradient(
            circle at 88% 12%,
            rgba(212, 168, 70, 0.12),
            transparent 34%
          ),
          linear-gradient(
            145deg,
            rgba(212, 168, 70, 0.06),
            rgba(255, 255, 255, 0.012) 48%
          ),
          #101210;
        box-shadow:
          inset 0 0 0 1px rgba(212, 168, 70, 0.035),
          0 20px 58px rgba(0, 0, 0, 0.24);
      }

      .prediction-featured::after {
        position: absolute;
        width: 250px;
        height: 250px;
        top: -118px;
        right: -104px;
        border: 1px solid rgba(212, 168, 70, 0.08);
        border-radius: 50%;
        content: "";
        box-shadow:
          0 0 0 38px rgba(212, 168, 70, 0.018),
          0 0 0 76px rgba(212, 168, 70, 0.01);
        pointer-events: none;
      }

      .prediction-featured-topline {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 18px;
      }

      .prediction-identity {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        min-width: 0;
      }

      .prediction-identity > div {
        min-width: 0;
      }

      .prediction-icon {
        display: grid;
        width: 40px;
        height: 40px;
        flex: 0 0 40px;
        place-items: center;
        border: 1px solid rgba(212, 168, 70, 0.3);
        border-radius: 12px;
        color: #dfb449;
        background: rgba(212, 168, 70, 0.08);
        box-shadow: 0 0 24px rgba(212, 168, 70, 0.07);
      }

      .prediction-status {
        display: inline-flex;
        align-items: center;
        min-height: 22px;
        margin-top: 7px;
        padding: 4px 8px;
        border: 1px solid rgba(212, 168, 70, 0.2);
        border-radius: 999px;
        color: #d4aa42;
        background: rgba(212, 168, 70, 0.06);
        font-size: 8px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .prediction-confidence {
        position: relative;
        z-index: 1;
        flex: 0 0 auto;
        padding: 6px 10px;
        border: 1px solid rgba(65, 176, 108, 0.28);
        border-radius: 999px;
        color: #8fd7aa;
        background: rgba(41, 119, 72, 0.14);
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.07em;
        text-transform: uppercase;
      }

      .prediction-window {
        position: relative;
        z-index: 1;
        display: inline-flex;
        align-items: center;
        gap: 10px;
        margin-top: 18px;
        padding: 7px 10px;
        border: 1px solid rgba(255, 255, 255, 0.075);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.024);
      }

      .prediction-window span {
        color: #73777a;
        font-size: 8px;
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
      }

      .prediction-window strong {
        color: #e7e8e6;
        font-size: 9px;
        font-weight: 700;
      }

      .prediction-featured h3 {
        position: relative;
        z-index: 1;
        max-width: 760px;
        margin: 20px 0 0;
        color: #f5f5f3;
        font-size: clamp(22px, 2.1vw, 30px);
        letter-spacing: -0.03em;
        line-height: 1.2;
      }

      .prediction-summary {
        position: relative;
        z-index: 1;
        max-width: 780px;
        margin: 12px 0 0;
        color: #94989b;
        font-size: 13px;
        line-height: 1.65;
      }

      .prediction-measures {
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
        margin-top: 20px;
      }

      .prediction-measures > div {
        min-width: 0;
        padding: 14px;
        border: 1px solid rgba(255, 255, 255, 0.075);
        border-radius: 10px;
        background: rgba(0, 0, 0, 0.22);
      }

      .prediction-measures span {
        display: block;
        color: #73777a;
        font-size: 8px;
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
      }

      .prediction-measures strong {
        display: block;
        margin-top: 7px;
        overflow: hidden;
        color: #f0f1ef;
        font-size: 17px;
        line-height: 1.3;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .prediction-recommendation {
        position: relative;
        z-index: 1;
        margin-top: 14px;
        padding: 17px;
        border: 1px solid rgba(212, 168, 70, 0.18);
        border-radius: 11px;
        background:
          linear-gradient(
            135deg,
            rgba(212, 168, 70, 0.055),
            transparent 58%
          ),
          rgba(0, 0, 0, 0.18);
      }

      .prediction-recommendation > span {
        display: block;
        color: #7d8184;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.11em;
        text-transform: uppercase;
      }

      .prediction-recommendation strong {
        display: block;
        margin-top: 7px;
        color: #f0f0ee;
        font-size: 15px;
        line-height: 1.4;
      }

      .prediction-recommendation p {
        margin: 7px 0 0;
        color: #85898c;
        font-size: 11px;
        line-height: 1.6;
      }

      .prediction-action {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        margin-top: 12px;
        color: #d8ad43;
        font-size: 10px;
        font-weight: 700;
        text-decoration: none;
        transition:
          color 150ms ease,
          transform 150ms ease;
      }

      .prediction-action:hover {
        color: #f0c75e;
        transform: translateX(2px);
      }

      .prediction-list {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        min-width: 0;
      }

      .prediction-card {
        display: flex;
        min-width: 0;
        flex-direction: column;
        padding: 17px;
        overflow: hidden;
        transition:
          border-color 160ms ease,
          background 160ms ease,
          transform 160ms ease,
          box-shadow 160ms ease;
      }

      .prediction-card:hover {
        border-color: rgba(212, 168, 70, 0.22);
        background:
          linear-gradient(
            145deg,
            rgba(212, 168, 70, 0.03),
            transparent 56%
          ),
          #101210;
        box-shadow: 0 14px 36px rgba(0, 0, 0, 0.18);
        transform: translateY(-2px);
      }

      .prediction-card-topline {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .prediction-card-topline > div {
        display: flex;
        align-items: flex-end;
        flex-direction: column;
        gap: 5px;
        min-width: 0;
      }

      .prediction-card-topline
        > div
        > span:last-child {
        color: #727679;
        font-size: 9px;
        white-space: nowrap;
      }

      .prediction-card-window {
        display: inline-flex;
        align-self: flex-start;
        margin-top: 14px;
        padding: 4px 8px;
        border: 1px solid rgba(255, 255, 255, 0.075);
        border-radius: 999px;
        color: #7d8184;
        background: rgba(255, 255, 255, 0.022);
        font-size: 8px;
        font-weight: 700;
        letter-spacing: 0.07em;
        text-transform: uppercase;
      }

      .prediction-card h3 {
        margin: 14px 0 0;
        color: #eceeed;
        font-size: 14px;
        line-height: 1.4;
      }

      .prediction-card > p {
        margin: 8px 0 0;
        color: #7f8386;
        font-size: 10px;
        line-height: 1.55;
      }

      .prediction-card-value {
        margin-top: 12px;
        padding: 11px 12px;
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-radius: 9px;
        background: rgba(0, 0, 0, 0.18);
      }

      .prediction-card-value span {
        display: block;
        color: #6f7376;
        font-size: 8px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .prediction-card-value strong {
        display: block;
        margin-top: 5px;
        color: #eceeed;
        font-size: 14px;
        line-height: 1.35;
      }

      .prediction-card-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-top: auto;
        padding-top: 14px;
      }

      .prediction-card-footer > span {
        color: #686c6f;
        font-size: 9px;
      }

      .prediction-card-footer a {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: #d6ab43;
        font-size: 9px;
        font-weight: 700;
        text-decoration: none;
      }

      .prediction-card-footer a:hover {
        color: #efc65c;
      }

      .prediction-positive
        .prediction-icon {
        border-color: rgba(65, 176, 108, 0.3);
        color: #8fd7aa;
        background: rgba(41, 119, 72, 0.16);
      }

      .prediction-positive
        .prediction-status {
        border-color: rgba(65, 176, 108, 0.2);
        color: #8fd7aa;
        background: rgba(41, 119, 72, 0.12);
      }

      .prediction-warning
        .prediction-icon,
      .prediction-critical
        .prediction-icon {
        border-color: rgba(224, 181, 63, 0.34);
        color: #e6bc4d;
        background: rgba(126, 92, 8, 0.19);
      }

      .prediction-warning
        .prediction-status,
      .prediction-critical
        .prediction-status {
        border-color: rgba(224, 181, 63, 0.24);
        color: #e4ba49;
        background: rgba(126, 92, 8, 0.14);
      }

      .prediction-critical {
        border-color: rgba(221, 91, 80, 0.3);
      }

      .prediction-critical
        .prediction-icon {
        border-color: rgba(221, 91, 80, 0.34);
        color: #ffaaa5;
        background: rgba(129, 31, 26, 0.2);
      }

      .prediction-critical
        .prediction-status {
        border-color: rgba(221, 91, 80, 0.26);
        color: #ffaaa5;
        background: rgba(129, 31, 26, 0.14);
      }

      .prediction-info
        .prediction-icon {
        border-color: rgba(70, 144, 193, 0.26);
        color: #8bc8eb;
        background: rgba(29, 89, 126, 0.15);
      }

      .prediction-neutral
        .prediction-icon {
        border-color: rgba(255, 255, 255, 0.11);
        color: #a4a7aa;
        background: rgba(255, 255, 255, 0.03);
      }

      @media (max-width: 1280px) {
        .prediction-insights-grid {
          grid-template-columns: 1fr;
        }

        .prediction-list {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 900px) {
        .prediction-measures {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 760px) {
        .prediction-list {
          grid-template-columns: 1fr;
        }

        .prediction-featured {
          padding: 20px;
        }

        .prediction-featured-topline {
          align-items: flex-start;
          flex-direction: column;
        }

        .prediction-confidence {
          align-self: flex-start;
        }
      }

      @media (max-width: 520px) {
        .prediction-measures {
          grid-template-columns: 1fr;
        }

        .prediction-card-topline {
          align-items: flex-start;
          flex-direction: column;
        }

        .prediction-card-topline > div {
          align-items: flex-start;
        }

        .prediction-card-footer {
          align-items: flex-start;
          flex-direction: column;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .prediction-card,
        .prediction-action {
          transition: none;
        }
      }
    `}</style>
  );
}