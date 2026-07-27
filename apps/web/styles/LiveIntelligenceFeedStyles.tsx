export default function LiveIntelligenceFeedStyles() {
  return (
    <style>{`
      .vault-live-section {
        margin-top: 22px;
      }

      .vault-live-status {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        color: #8fd7aa;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .vault-live-status i {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #5dcf87;
        box-shadow:
          0 0 0 4px rgba(93, 207, 135, 0.08),
          0 0 18px rgba(93, 207, 135, 0.38);
        animation: vault-live-pulse 1.8s ease-in-out infinite;
      }

      .vault-live-panel {
        margin-top: 12px;
        padding: 20px;
        overflow: hidden;
        background:
          linear-gradient(
            145deg,
            rgba(255, 255, 255, 0.022),
            transparent 52%
          ),
          #101210;
      }

      .vault-live-summary {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 18px;
        padding-bottom: 17px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.07);
      }

      .vault-live-summary > div {
        min-width: 0;
      }

      .vault-live-summary strong {
        display: block;
        max-width: 620px;
        margin-top: 6px;
        color: #f0f1ef;
        font-size: 15px;
        line-height: 1.45;
      }

      .vault-live-confidence {
        flex: 0 0 auto;
        padding: 5px 9px;
        border: 1px solid rgba(212, 168, 70, 0.22);
        border-radius: 999px;
        color: #d9b14b;
        background: rgba(212, 168, 70, 0.075);
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .vault-live-timeline {
        display: grid;
        gap: 0;
        margin-top: 4px;
      }

      .vault-live-event {
        display: grid;
        grid-template-columns: 64px minmax(0, 1fr);
        gap: 14px;
        min-width: 0;
      }

      .vault-live-time {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        min-height: 100%;
        padding-top: 18px;
      }

      .vault-live-time::after {
        width: 1px;
        flex: 1;
        margin-top: 8px;
        background: rgba(255, 255, 255, 0.07);
        content: "";
      }

      .vault-live-event:last-child
        .vault-live-time::after {
        display: none;
      }

      .vault-live-time span {
        color: #777b7e;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
      }

      .vault-live-time i {
        width: 8px;
        height: 8px;
        margin-top: 8px;
        border: 2px solid #101210;
        border-radius: 50%;
        background: #d4a846;
        box-shadow:
          0 0 0 2px rgba(212, 168, 70, 0.2),
          0 0 14px rgba(212, 168, 70, 0.18);
      }

      .vault-live-event-card {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        min-width: 0;
        margin: 8px 0;
        padding: 14px;
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-radius: 11px;
        background: rgba(255, 255, 255, 0.016);
        transition:
          border-color 160ms ease,
          background 160ms ease,
          transform 160ms ease;
      }

      .vault-live-event-card:hover {
        border-color: rgba(212, 168, 70, 0.22);
        background: rgba(212, 168, 70, 0.025);
        transform: translateY(-1px);
      }

      .vault-live-event-icon {
        display: grid;
        width: 34px;
        height: 34px;
        flex: 0 0 34px;
        place-items: center;
        border: 1px solid rgba(212, 168, 70, 0.22);
        border-radius: 10px;
        color: #d8ad43;
        background: rgba(212, 168, 70, 0.065);
      }

      .vault-live-event-copy {
        min-width: 0;
        flex: 1;
      }

      .vault-live-event-topline {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .vault-live-event-topline > span:first-child {
        overflow: hidden;
        color: #9a9da0;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-overflow: ellipsis;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .vault-live-event-topline > span:last-child {
        flex: 0 0 auto;
        color: #6d7174;
        font-size: 9px;
      }

      .vault-live-event-copy > strong {
        display: block;
        margin-top: 6px;
        color: #eceeed;
        font-size: 13px;
        line-height: 1.4;
      }

      .vault-live-event-copy > p {
        margin: 5px 0 0;
        color: #7f8386;
        font-size: 11px;
        line-height: 1.55;
      }

      .vault-live-action {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        margin-top: 10px;
        color: #d7ad45;
        font-size: 10px;
        font-weight: 700;
        text-decoration: none;
      }

      .vault-live-action:hover {
        color: #f0c85f;
      }

      .live-intelligence-critical
        .vault-live-event-card,
      .live-intelligence-warning
        .vault-live-event-card {
        border-color: rgba(224, 181, 63, 0.19);
        background:
          linear-gradient(
            135deg,
            rgba(212, 168, 70, 0.035),
            transparent 58%
          ),
          rgba(255, 255, 255, 0.015);
      }

      .live-intelligence-critical
        .vault-live-event-icon,
      .live-intelligence-warning
        .vault-live-event-icon {
        border-color: rgba(224, 181, 63, 0.32);
        color: #e6bc4d;
        background: rgba(126, 92, 8, 0.18);
      }

      .live-intelligence-positive
        .vault-live-event-icon {
        border-color: rgba(65, 176, 108, 0.28);
        color: #8fd7aa;
        background: rgba(41, 119, 72, 0.15);
      }

      .live-intelligence-positive
        .vault-live-time i {
        background: #6ecb91;
        box-shadow:
          0 0 0 2px rgba(110, 203, 145, 0.18),
          0 0 14px rgba(110, 203, 145, 0.2);
      }

      .live-intelligence-info
        .vault-live-event-icon {
        border-color: rgba(70, 144, 193, 0.24);
        color: #8bc8eb;
        background: rgba(29, 89, 126, 0.15);
      }

      .live-intelligence-neutral
        .vault-live-event-icon {
        border-color: rgba(255, 255, 255, 0.11);
        color: #a4a7aa;
        background: rgba(255, 255, 255, 0.03);
      }

      @keyframes vault-live-pulse {
        0%,
        100% {
          opacity: 0.58;
          transform: scale(0.86);
        }

        50% {
          opacity: 1;
          transform: scale(1.18);
        }
      }

      @media (max-width: 680px) {
        .vault-live-summary {
          align-items: flex-start;
          flex-direction: column;
        }

        .vault-live-event {
          grid-template-columns: 48px minmax(0, 1fr);
          gap: 10px;
        }

        .vault-live-time span {
          font-size: 9px;
        }

        .vault-live-event-card {
          padding: 12px;
        }

        .vault-live-event-topline {
          align-items: flex-start;
          flex-direction: column;
          gap: 4px;
        }

        .vault-live-event-topline
          > span:last-child {
          white-space: nowrap;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .vault-live-status i,
        .vault-live-event-card {
          animation: none;
          transition: none;
        }
      }
    `}</style>
  );
}