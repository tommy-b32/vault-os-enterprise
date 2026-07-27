export default function VaultBrainStartupStyles() {
  return (
    <style>{`
      .vault-brain-startup-root {
        min-width: 0;
        flex: 1;
      }

      .vault-brain-startup {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: grid;
        min-height: 100vh;
        padding: 32px;
        place-items: center;
        overflow: hidden;
        background:
          radial-gradient(
            circle at 50% 42%,
            rgba(212, 168, 70, 0.075),
            transparent 34%
          ),
          linear-gradient(
            180deg,
            rgba(7, 9, 7, 0.98),
            rgba(5, 7, 5, 0.995)
          );
        transition:
          opacity 240ms ease,
          visibility 240ms ease;
      }

      .vault-brain-startup::before {
        position: absolute;
        width: 540px;
        height: 540px;
        border: 1px solid rgba(212, 168, 70, 0.055);
        border-radius: 50%;
        content: "";
        box-shadow:
          0 0 0 72px rgba(212, 168, 70, 0.018),
          0 0 0 144px rgba(212, 168, 70, 0.01);
        pointer-events: none;
      }

      .vault-brain-startup.is-visible {
        visibility: visible;
        opacity: 1;
        pointer-events: auto;
      }

      .vault-brain-startup.is-hidden {
        visibility: hidden;
        opacity: 0;
        pointer-events: none;
      }

      .vault-brain-startup-card {
        position: relative;
        z-index: 1;
        width: min(100%, 660px);
        max-height: calc(100vh - 64px);
        padding: 28px;
        overflow-y: auto;
        border: 1px solid rgba(212, 168, 70, 0.26);
        border-radius: 18px;
        background:
          linear-gradient(
            145deg,
            rgba(212, 168, 70, 0.055),
            rgba(255, 255, 255, 0.012) 48%
          ),
          rgba(14, 16, 14, 0.97);
        box-shadow:
          inset 0 0 0 1px rgba(255, 255, 255, 0.018),
          0 28px 90px rgba(0, 0, 0, 0.52);
        scrollbar-width: thin;
        scrollbar-color:
          rgba(212, 168, 70, 0.28)
          transparent;
      }

      .vault-brain-startup-card::-webkit-scrollbar {
        width: 6px;
      }

      .vault-brain-startup-card::-webkit-scrollbar-track {
        background: transparent;
      }

      .vault-brain-startup-card::-webkit-scrollbar-thumb {
        border-radius: 999px;
        background: rgba(212, 168, 70, 0.28);
      }

      .vault-brain-startup-brand {
        display: flex;
        align-items: flex-start;
        gap: 15px;
      }

      .vault-brain-startup-brand > div {
        min-width: 0;
      }

      .vault-brain-startup-icon {
        display: grid;
        width: 48px;
        height: 48px;
        flex: 0 0 48px;
        place-items: center;
        border: 1px solid rgba(212, 168, 70, 0.32);
        border-radius: 14px;
        color: #e1b64b;
        background: rgba(212, 168, 70, 0.085);
        box-shadow: 0 0 28px rgba(212, 168, 70, 0.08);
      }

      .vault-brain-startup-brand h2 {
        max-width: 390px;
        margin: 7px 0 0;
        color: #f5f5f3;
        font-size: clamp(22px, 3vw, 30px);
        letter-spacing: -0.035em;
        line-height: 1.15;
      }

      .vault-brain-startup-progress {
        margin-top: 26px;
      }

      .vault-brain-startup-progress > span {
        display: block;
        color: #8e9295;
        font-size: 12px;
        line-height: 1.5;
      }

      .vault-brain-startup-track {
        height: 4px;
        margin-top: 11px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.07);
      }

      .vault-brain-startup-track > span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(
          90deg,
          #9b741c,
          #e3b746,
          #f3d27a
        );
        box-shadow: 0 0 18px rgba(227, 183, 70, 0.35);
        transition: width 110ms ease;
      }

      .vault-brain-narrator {
        position: relative;
        min-height: 92px;
        margin-top: 20px;
        padding: 17px 18px;
        overflow: hidden;
        border: 1px solid rgba(212, 168, 70, 0.18);
        border-radius: 12px;
        background:
          linear-gradient(
            135deg,
            rgba(212, 168, 70, 0.07),
            rgba(255, 255, 255, 0.012) 55%
          ),
          rgba(0, 0, 0, 0.24);
      }

      .vault-brain-narrator::after {
        position: absolute;
        width: 110px;
        height: 110px;
        right: -46px;
        bottom: -66px;
        border: 1px solid rgba(212, 168, 70, 0.08);
        border-radius: 50%;
        content: "";
        box-shadow:
          0 0 0 20px rgba(212, 168, 70, 0.018),
          0 0 0 40px rgba(212, 168, 70, 0.01);
        pointer-events: none;
      }

      .vault-brain-narrator-status {
        position: relative;
        z-index: 1;
        display: block;
        color: #d8ad43;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.11em;
        line-height: 1.3;
        text-transform: uppercase;
      }

      .vault-brain-narrator strong {
        position: relative;
        z-index: 1;
        display: block;
        max-width: 540px;
        margin-top: 7px;
        color: #f0f1ef;
        font-size: 14px;
        font-weight: 600;
        line-height: 1.55;
      }

      .vault-brain-startup-steps {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 9px;
        margin-top: 18px;
      }

      .vault-brain-startup-step {
        display: flex;
        align-items: flex-start;
        gap: 9px;
        min-width: 0;
        min-height: 66px;
        padding: 10px 11px;
        border: 1px solid rgba(255, 255, 255, 0.055);
        border-radius: 10px;
        color: #676b6e;
        background: rgba(255, 255, 255, 0.012);
        font-size: 11px;
        transition:
          color 150ms ease,
          border-color 150ms ease,
          background 150ms ease,
          transform 150ms ease,
          box-shadow 150ms ease;
      }

      .vault-brain-startup-step.is-active {
        border-color: rgba(212, 168, 70, 0.34);
        color: #f0f0ee;
        background:
          linear-gradient(
            135deg,
            rgba(212, 168, 70, 0.09),
            rgba(255, 255, 255, 0.015)
          ),
          rgba(0, 0, 0, 0.18);
        box-shadow:
          inset 0 0 0 1px rgba(212, 168, 70, 0.035),
          0 8px 24px rgba(0, 0, 0, 0.16);
        transform: translateY(-1px);
      }

      .vault-brain-startup-step.is-complete {
        border-color: rgba(65, 176, 108, 0.18);
        color: #d4d8d5;
        background: rgba(42, 126, 74, 0.075);
      }

      .vault-brain-startup-step-copy {
        min-width: 0;
      }

      .vault-brain-startup-step-copy > span {
        display: block;
        overflow: hidden;
        color: inherit;
        font-size: 11px;
        font-weight: 650;
        line-height: 1.35;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .vault-brain-startup-step-copy small {
        display: -webkit-box;
        margin-top: 4px;
        overflow: hidden;
        color: #63676a;
        font-size: 9px;
        font-weight: 400;
        line-height: 1.4;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }

      .vault-brain-startup-step.is-active
        .vault-brain-startup-step-copy
        small {
        color: #a7aaad;
      }

      .vault-brain-startup-step.is-complete
        .vault-brain-startup-step-copy
        small {
        color: #7c8f82;
      }

      .vault-brain-startup-check {
        display: grid;
        width: 22px;
        height: 22px;
        flex: 0 0 22px;
        place-items: center;
        border: 1px solid rgba(255, 255, 255, 0.09);
        border-radius: 50%;
        color: #8fd7aa;
        background: rgba(255, 255, 255, 0.025);
        transition:
          border-color 150ms ease,
          background 150ms ease,
          box-shadow 150ms ease;
      }

      .vault-brain-startup-check i {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: #55595c;
      }

      .vault-brain-startup-step.is-active
        .vault-brain-startup-check {
        border-color: rgba(212, 168, 70, 0.45);
        background: rgba(212, 168, 70, 0.1);
        box-shadow:
          0 0 0 4px rgba(212, 168, 70, 0.035),
          0 0 18px rgba(212, 168, 70, 0.1);
      }

      .vault-brain-startup-step.is-active
        .vault-brain-startup-check
        i {
        background: #e2b648;
        box-shadow: 0 0 8px rgba(226, 182, 72, 0.7);
        animation: vault-brain-startup-pulse 700ms ease-in-out infinite;
      }

      .vault-brain-startup-step.is-complete
        .vault-brain-startup-check {
        border-color: rgba(65, 176, 108, 0.3);
        background: rgba(41, 119, 72, 0.18);
      }

      .vault-brain-startup-footer {
        margin-top: 20px;
        padding-top: 17px;
        border-top: 1px solid rgba(255, 255, 255, 0.065);
        color: #d5ab42;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .vault-brain-startup-content {
        min-width: 0;
        transform-origin: top center;
        transition:
          opacity 300ms ease,
          transform 360ms cubic-bezier(0.22, 1, 0.36, 1),
          filter 300ms ease;
      }

      .vault-brain-startup-content.is-waiting {
        opacity: 0;
        filter: blur(4px);
        transform: translateY(8px) scale(0.995);
        pointer-events: none;
      }

      .vault-brain-startup-content.is-ready {
        opacity: 1;
        filter: blur(0);
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }

      @keyframes vault-brain-startup-pulse {
        0%,
        100% {
          opacity: 0.55;
          transform: scale(0.82);
        }

        50% {
          opacity: 1;
          transform: scale(1.2);
        }
      }

      @media (max-width: 680px) {
        .vault-brain-startup {
          padding: 18px;
        }

        .vault-brain-startup-card {
          max-height: calc(100vh - 36px);
          padding: 21px;
          border-radius: 15px;
        }

        .vault-brain-startup-steps {
          grid-template-columns: 1fr;
        }

        .vault-brain-startup-brand h2 {
          font-size: 23px;
        }

        .vault-brain-narrator {
          min-height: 104px;
        }
      }

      @media (max-height: 760px) and (min-width: 681px) {
        .vault-brain-startup {
          padding: 18px;
        }

        .vault-brain-startup-card {
          max-height: calc(100vh - 36px);
          padding: 22px;
        }

        .vault-brain-startup-progress {
          margin-top: 18px;
        }

        .vault-brain-narrator {
          min-height: 76px;
          margin-top: 15px;
          padding: 13px 15px;
        }

        .vault-brain-startup-steps {
          margin-top: 14px;
        }

        .vault-brain-startup-step {
          min-height: 56px;
          padding: 8px 10px;
        }

        .vault-brain-startup-footer {
          margin-top: 14px;
          padding-top: 12px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .vault-brain-startup,
        .vault-brain-startup-content,
        .vault-brain-startup-track > span,
        .vault-brain-startup-step,
        .vault-brain-startup-check {
          transition: none;
        }

        .vault-brain-startup-step.is-active
          .vault-brain-startup-check
          i {
          animation: none;
        }
      }
    `}</style>
  );
}