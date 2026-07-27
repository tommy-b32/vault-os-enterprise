export default function MemoryInsightsStyles() {
  return (
    <style>{`
      .memory-insights-section {
        margin-top: 22px;
      }

      .memory-insights-count {
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

      .memory-insights-grid {
        display: grid;
        grid-template-columns:
          minmax(0, 1.25fr)
          minmax(340px, 0.75fr);
        gap: 16px;
        margin-top: 12px;
      }

      .memory-featured-learning {
        position: relative;
        min-width: 0;
        padding: 26px;
        overflow: hidden;
        border-color: rgba(212, 168, 70, 0.42);
        background:
          radial-gradient(
            circle at 88% 12%,
            rgba(212, 168, 70, 0.11),
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

      .memory-featured-learning::after {
        position: absolute;
        width: 240px;
        height: 240px;
        top: -110px;
        right: -98px;
        border: 1px solid rgba(212, 168, 70, 0.08);
        border-radius: 50%;
        content: "";
        box-shadow:
          0 0 0 36px rgba(212, 168, 70, 0.018),
          0 0 0 72px rgba(212, 168, 70, 0.01);
        pointer-events: none;
      }

      .memory-learning-topline {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 18px;
      }

      .memory-learning-identity {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        min-width: 0;
      }

      .memory-learning-identity > div {
        min-width: 0;
      }

      .memory-learning-icon {
        display: grid;
        width: 38px;
        height: 38px;
        flex: 0 0 38px;
        place-items: center;
        border: 1px solid rgba(212, 168, 70, 0.28);
        border-radius: 11px;
        color: #dfb449;
        background: rgba(212, 168, 70, 0.075);
        box-shadow: 0 0 24px rgba(212, 168, 70, 0.06);
      }

      .memory-learning-status {
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

      .memory-learning-confidence {
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

      .memory-featured-learning h3 {
        position: relative;
        z-index: 1;
        max-width: 720px;
        margin: 22px 0 0;
        color: #f5f5f3;
        font-size: clamp(22px, 2.1vw, 30px);
        letter-spacing: -0.03em;
        line-height: 1.2;
      }

      .memory-learning-pattern {
        position: relative;
        z-index: 1;
        max-width: 760px;
        margin: 12px 0 0;
        color: #94989b;
        font-size: 13px;
        line-height: 1.65;
      }

      .memory-learning-consequence {
        position: relative;
        z-index: 1;
        margin-top: 20px;
        padding: 16px 17px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 11px;
        background: rgba(0, 0, 0, 0.22);
      }

      .memory-learning-consequence > span,
      .memory-learning-recommendation > span {
        display: block;
        color: #7d8184;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.11em;
        text-transform: uppercase;
      }

      .memory-learning-consequence strong {
        display: block;
        margin-top: 7px;
        color: #ededeb;
        font-size: 14px;
        line-height: 1.5;
      }

      .memory-learning-recommendation {
        position: relative;
        z-index: 1;
        margin-top: 12px;
        padding: 17px;
        border: 1px solid rgba(212, 168, 70, 0.16);
        border-radius: 11px;
        background:
          linear-gradient(
            135deg,
            rgba(212, 168, 70, 0.055),
            transparent 58%
          ),
          rgba(0, 0, 0, 0.18);
      }

      .memory-learning-recommendation strong {
        display: block;
        margin-top: 7px;
        color: #f0f0ee;
        font-size: 15px;
        line-height: 1.4;
      }

      .memory-learning-recommendation p {
        margin: 7px 0 0;
        color: #85898c;
        font-size: 11px;
        line-height: 1.6;
      }

      .memory-learning-action {
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

      .memory-learning-action:hover {
        color: #f0c75e;
        transform: translateX(2px);
      }

      .memory-learning-footer {
        position: relative;
        z-index: 1;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 16px;
      }

      .memory-learning-footer span {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        padding: 4px 9px;
        border: 1px solid rgba(255, 255, 255, 0.075);
        border-radius: 999px;
        color: #777b7e;
        background: rgba(255, 255, 255, 0.022);
        font-size: 9px;
        font-weight: 600;
      }

      .memory-learning-list {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        min-width: 0;
      }

      .memory-learning-card {
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

      .memory-learning-card:hover {
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

      .memory-learning-card-topline {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .memory-learning-card-topline > div {
        display: flex;
        align-items: flex-end;
        flex-direction: column;
        gap: 5px;
        min-width: 0;
      }

      .memory-learning-card-topline
        > div
        > span:last-child {
        color: #727679;
        font-size: 9px;
        white-space: nowrap;
      }

      .memory-learning-card h3 {
        margin: 16px 0 0;
        color: #eceeed;
        font-size: 14px;
        line-height: 1.4;
      }

      .memory-learning-card > p {
        margin: 8px 0 0;
        color: #7f8386;
        font-size: 10px;
        line-height: 1.55;
      }

      .memory-learning-card-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-top: auto;
        padding-top: 14px;
      }

      .memory-learning-card-footer > span {
        color: #686c6f;
        font-size: 9px;
      }

      .memory-learning-card-footer a {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: #d6ab43;
        font-size: 9px;
        font-weight: 700;
        text-decoration: none;
      }

      .memory-learning-card-footer a:hover {
        color: #efc65c;
      }

      .memory-learning-positive
        .memory-learning-icon {
        border-color: rgba(65, 176, 108, 0.3);
        color: #8fd7aa;
        background: rgba(41, 119, 72, 0.16);
      }

      .memory-learning-positive
        .memory-learning-status {
        border-color: rgba(65, 176, 108, 0.2);
        color: #8fd7aa;
        background: rgba(41, 119, 72, 0.12);
      }

      .memory-learning-warning
        .memory-learning-icon,
      .memory-learning-critical
        .memory-learning-icon {
        border-color: rgba(224, 181, 63, 0.34);
        color: #e6bc4d;
        background: rgba(126, 92, 8, 0.19);
      }

      .memory-learning-warning
        .memory-learning-status,
      .memory-learning-critical
        .memory-learning-status {
        border-color: rgba(224, 181, 63, 0.24);
        color: #e4ba49;
        background: rgba(126, 92, 8, 0.14);
      }

      .memory-learning-critical {
        border-color: rgba(221, 91, 80, 0.28);
      }

      .memory-learning-critical
        .memory-learning-icon {
        border-color: rgba(221, 91, 80, 0.34);
        color: #ffaaa5;
        background: rgba(129, 31, 26, 0.2);
      }

      .memory-learning-critical
        .memory-learning-status {
        border-color: rgba(221, 91, 80, 0.26);
        color: #ffaaa5;
        background: rgba(129, 31, 26, 0.14);
      }

      .memory-learning-info
        .memory-learning-icon {
        border-color: rgba(70, 144, 193, 0.26);
        color: #8bc8eb;
        background: rgba(29, 89, 126, 0.15);
      }

      .memory-learning-neutral
        .memory-learning-icon {
        border-color: rgba(255, 255, 255, 0.11);
        color: #a4a7aa;
        background: rgba(255, 255, 255, 0.03);
      }

      @media (max-width: 1280px) {
        .memory-insights-grid {
          grid-template-columns: 1fr;
        }

        .memory-learning-list {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 760px) {
        .memory-learning-list {
          grid-template-columns: 1fr;
        }

        .memory-featured-learning {
          padding: 20px;
        }

        .memory-learning-topline {
          align-items: flex-start;
          flex-direction: column;
        }

        .memory-learning-confidence {
          align-self: flex-start;
        }
      }

      @media (max-width: 520px) {
        .memory-learning-card-topline {
          align-items: flex-start;
          flex-direction: column;
        }

        .memory-learning-card-topline > div {
          align-items: flex-start;
        }

        .memory-learning-card-footer {
          align-items: flex-start;
          flex-direction: column;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .memory-learning-card,
        .memory-learning-action {
          transition: none;
        }
      }
    `}</style>
  );
}