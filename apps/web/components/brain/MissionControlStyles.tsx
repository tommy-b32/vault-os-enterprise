export default function MissionControlStyles() {
  return (
    <style>{`
        .mission-control-content {
          display: block;
        }

        .mission-control-workspace {
          width: 100%;
          min-width: 0;
        }

        .mission-control-header {
          display: grid;
          grid-template-columns:
            minmax(280px, 1fr)
            minmax(560px, 1.2fr);
          align-items: end;
          gap: 32px;
        }

        .mission-control-header
          .vault-page-heading
          > p:last-child {
          max-width: 620px;
          color: var(--vault-muted, #95989c);
          line-height: 1.65;
        }

        .mission-metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .mission-metric-card {
          min-height: 112px;
          padding: 18px;
        }

        .mission-metric-label {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #b6b6b6;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .mission-metric-card > strong {
          display: block;
          margin-top: 12px;
          color: #f7f7f7;
          font-size: 27px;
          line-height: 1;
        }

        .mission-featured-section,
        .mission-queue-section {
          margin-top: 22px;
        }

        .mission-ranking-note {
          color: #6f7378;
          font-size: 12px;
        }

        .mission-card {
          padding: 20px;
          overflow: hidden;
        }

        .mission-card-featured {
          padding: 24px;
          border-color: rgba(212, 168, 70, 0.55);
          background:
            radial-gradient(
              circle at 72% 18%,
              rgba(212, 168, 70, 0.08),
              transparent 32%
            ),
            linear-gradient(
              135deg,
              rgba(212, 168, 70, 0.055),
              rgba(255, 255, 255, 0.012) 45%
            ),
            #101210;
          box-shadow:
            inset 0 0 0 1px rgba(212, 168, 70, 0.04),
            0 18px 55px rgba(0, 0, 0, 0.24);
        }

        .mission-card-topline {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .mission-card-identity {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .mission-priority {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-height: 25px;
          padding: 4px 11px;
          border: 1px solid;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
        }

        .mission-priority i {
          opacity: 0.55;
          font-style: normal;
        }

        .mission-priority-critical {
          color: #ffaaa5;
          border-color: rgba(230, 73, 64, 0.56);
          background: rgba(129, 31, 26, 0.3);
        }

        .mission-priority-high {
          color: #f1cb4e;
          border-color: rgba(212, 168, 70, 0.55);
          background: rgba(104, 77, 4, 0.26);
        }

        .mission-priority-medium {
          color: #91d8f3;
          border-color: rgba(44, 151, 193, 0.55);
          background: rgba(15, 76, 101, 0.32);
        }

        .mission-priority-low {
          color: #a4a7aa;
          border-color: rgba(255, 255, 255, 0.15);
          background: rgba(255, 255, 255, 0.035);
        }

        .mission-source {
          overflow: hidden;
          color: #74777a;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-overflow: ellipsis;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .mission-confidence {
          color: #888b8e;
          font-size: 11px;
          white-space: nowrap;
        }

        .mission-confidence strong {
          color: #d4a846;
          font-weight: 700;
        }

        .mission-copy {
          margin-top: 18px;
        }

        .mission-copy h3 {
          margin: 0;
          color: #f7f7f7;
          font-size: 19px;
          line-height: 1.25;
        }

        .mission-card-featured .mission-copy h3 {
          font-size: clamp(24px, 2vw, 30px);
        }

        .mission-copy p {
          margin: 10px 0 0;
          color: #96999c;
          font-size: 13px;
          line-height: 1.6;
        }

        .mission-outcome {
          display: flex;
          align-items: center;
          gap: 13px;
          margin-top: 18px;
          padding: 13px 15px;
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 10px;
          background: rgba(0, 0, 0, 0.22);
        }

        .mission-outcome-icon {
          display: grid;
          width: 34px;
          height: 34px;
          flex: 0 0 34px;
          place-items: center;
          border: 1px solid rgba(212, 168, 70, 0.28);
          border-radius: 50%;
          color: #e0b53f;
          background: rgba(212, 168, 70, 0.08);
        }

        .mission-outcome p {
          margin: 4px 0 0;
          color: #d6d6d6;
          font-size: 12px;
          line-height: 1.45;
        }

        .mission-evidence-grid {
          display: grid;
          grid-template-columns: repeat(
            3,
            minmax(0, 1fr)
          );
          gap: 10px;
          margin-top: 12px;
        }

        .mission-evidence {
          min-width: 0;
          padding: 12px 14px;
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 9px;
          background: rgba(255, 255, 255, 0.022);
        }

        .mission-evidence span {
          display: block;
          overflow: hidden;
          color: #777b7e;
          font-size: 10px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .mission-evidence strong {
          display: block;
          margin-top: 6px;
          color: #f0f0f0;
          font-size: 13px;
          line-height: 1.3;
        }

        .mission-card-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 14px;
        }

        .mission-action-button,
        .mission-secondary-action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          text-decoration: none;
        }

        .mission-queue-grid {
          display: grid;
          grid-template-columns: repeat(
            3,
            minmax(0, 1fr)
          );
          gap: 14px;
        }

        .mission-queue-grid .mission-card {
          display: flex;
          min-width: 0;
          flex-direction: column;
        }

        .mission-queue-grid
          .mission-card-actions {
          margin-top: auto;
          padding-top: 14px;
        }

        .mission-empty-state {
          margin-top: 24px;
          padding: 42px;
          text-align: center;
        }

        .mission-empty-state h2 {
          margin: 10px 0 0;
        }

        .mission-empty-state p {
          color: #898c8f;
        }


        .morning-briefing {
          display: grid;
          grid-template-columns: minmax(0, 1.55fr) minmax(320px, 0.75fr);
          gap: 16px;
          margin-top: 22px;
        }

        .morning-briefing-panel,
        .morning-impact-panel {
          min-width: 0;
          overflow: hidden;
        }

        .morning-briefing-panel {
          position: relative;
          padding: 26px;
          border-color: rgba(212, 168, 70, 0.45);
          background:
            radial-gradient(
              circle at 88% 12%,
              rgba(212, 168, 70, 0.12),
              transparent 34%
            ),
            linear-gradient(
              145deg,
              rgba(212, 168, 70, 0.06),
              rgba(255, 255, 255, 0.012) 46%
            ),
            #101210;
          box-shadow:
            inset 0 0 0 1px rgba(212, 168, 70, 0.035),
            0 18px 55px rgba(0, 0, 0, 0.2);
        }

        .morning-briefing-panel::after {
          position: absolute;
          width: 230px;
          height: 230px;
          right: -92px;
          top: -102px;
          border: 1px solid rgba(212, 168, 70, 0.08);
          border-radius: 50%;
          content: "";
          box-shadow:
            0 0 0 34px rgba(212, 168, 70, 0.018),
            0 0 0 68px rgba(212, 168, 70, 0.012);
          pointer-events: none;
        }

        .morning-briefing-introduction {
          position: relative;
          z-index: 1;
          max-width: 720px;
        }

        .morning-briefing-introduction h2 {
          margin: 8px 0 0;
          color: #f7f7f7;
          font-size: clamp(25px, 2.2vw, 34px);
          letter-spacing: -0.035em;
          line-height: 1.12;
        }

        .morning-briefing-introduction > p {
          max-width: 620px;
          margin: 11px 0 0;
          color: #92969a;
          font-size: 13px;
          line-height: 1.65;
        }

        .morning-briefing-metrics {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-top: 24px;
        }

        .morning-briefing-metric {
          display: flex;
          align-items: flex-start;
          gap: 11px;
          min-width: 0;
          padding: 14px;
          border: 1px solid rgba(255, 255, 255, 0.085);
          border-radius: 11px;
          background: rgba(0, 0, 0, 0.19);
        }

        .morning-briefing-metric-icon {
          display: grid;
          width: 34px;
          height: 34px;
          flex: 0 0 34px;
          place-items: center;
          border: 1px solid rgba(212, 168, 70, 0.28);
          border-radius: 9px;
          color: #deb449;
          background: rgba(212, 168, 70, 0.075);
        }

        .morning-briefing-metric > div {
          min-width: 0;
        }

        .morning-briefing-metric div > span {
          display: block;
          color: #8b8f92;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .morning-briefing-metric strong {
          display: block;
          margin-top: 4px;
          color: #f4f4f4;
          font-size: 23px;
          line-height: 1;
        }

        .morning-briefing-metric p {
          overflow: hidden;
          margin: 6px 0 0;
          color: #707478;
          font-size: 10px;
          line-height: 1.35;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .morning-impact-panel {
          padding: 22px;
          background:
            linear-gradient(
              155deg,
              rgba(255, 255, 255, 0.025),
              transparent 58%
            ),
            #101210;
        }

        .morning-impact-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
        }

        .morning-impact-heading h3 {
          margin: 7px 0 0;
          color: #f2f2f2;
          font-size: 16px;
          line-height: 1.35;
        }

        .morning-impact-status {
          flex: 0 0 auto;
          padding: 5px 9px;
          border: 1px solid rgba(63, 181, 111, 0.28);
          border-radius: 999px;
          color: #8fd7aa;
          background: rgba(40, 124, 73, 0.14);
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .morning-impact-list {
          display: grid;
          gap: 9px;
          margin-top: 17px;
        }

        .morning-impact-item {
          display: flex;
          align-items: flex-start;
          gap: 11px;
          padding: 12px;
          border: 1px solid rgba(255, 255, 255, 0.075);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.018);
        }

        .morning-impact-icon {
          display: grid;
          width: 30px;
          height: 30px;
          flex: 0 0 30px;
          place-items: center;
          border: 1px solid rgba(212, 168, 70, 0.22);
          border-radius: 50%;
          color: #d8ad43;
          background: rgba(212, 168, 70, 0.065);
        }

        .morning-impact-item > div {
          min-width: 0;
        }

        .morning-impact-item strong {
          display: block;
          color: #e7e7e7;
          font-size: 12px;
          line-height: 1.4;
        }

        .morning-impact-item p {
          margin: 4px 0 0;
          color: #7e8286;
          font-size: 10px;
          line-height: 1.45;
        }

        .morning-impact-warning .morning-impact-icon {
          border-color: rgba(224, 181, 63, 0.34);
          color: #e5bd4c;
          background: rgba(126, 92, 8, 0.2);
        }

        .morning-impact-positive .morning-impact-icon {
          border-color: rgba(65, 176, 108, 0.3);
          color: #8fd7aa;
          background: rgba(41, 119, 72, 0.17);
        }



        .morning-briefing-title-row {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
        }

        .morning-briefing-ready {
          display: inline-flex;
          align-items: center;
          min-height: 26px;
          flex: 0 0 auto;
          padding: 5px 10px;
          border: 1px solid rgba(63, 181, 111, 0.28);
          border-radius: 999px;
          color: #8fd7aa;
          background: rgba(40, 124, 73, 0.14);
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .morning-briefing-period {
          max-width: 700px;
          margin: 12px 0 0;
          color: #92969a;
          font-size: 13px;
          line-height: 1.65;
        }

        .morning-briefing-narrative {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: minmax(190px, 0.65fr) minmax(0, 1.35fr);
          gap: 22px;
          margin-top: 22px;
          padding: 18px;
          border: 1px solid rgba(212, 168, 70, 0.16);
          border-radius: 12px;
          background: rgba(0, 0, 0, 0.22);
        }

        .morning-narrative-heading {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }

        .morning-narrative-heading > div {
          min-width: 0;
        }

        .morning-narrative-heading strong {
          display: block;
          margin-top: 6px;
          color: #f1f1f1;
          font-size: 15px;
          line-height: 1.35;
        }

        .morning-narrative-icon {
          display: grid;
          width: 34px;
          height: 34px;
          flex: 0 0 34px;
          place-items: center;
          border: 1px solid rgba(212, 168, 70, 0.28);
          border-radius: 50%;
          color: #dfb449;
          background: rgba(212, 168, 70, 0.075);
        }

        .morning-narrative-copy {
          display: grid;
          gap: 8px;
          min-width: 0;
        }

        .morning-narrative-copy p {
          position: relative;
          margin: 0;
          padding-left: 14px;
          color: #d4d6d8;
          font-size: 13px;
          line-height: 1.55;
        }

        .morning-narrative-copy p::before {
          position: absolute;
          top: 0.66em;
          left: 0;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #d4a846;
          content: "";
          transform: translateY(-50%);
        }

        .morning-briefing-summary-heading {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          margin-top: 22px;
        }

        .morning-briefing-summary-heading > span:last-child {
          color: #6f7378;
          font-size: 10px;
        }

        @media (max-width: 1280px) {
          .mission-control-header {
            grid-template-columns: 1fr;
          }

          .morning-briefing {
            grid-template-columns: 1fr;
          }

          .morning-briefing-narrative {
            grid-template-columns: 1fr;
          }

          .mission-metrics {
            max-width: none;
          }

          .mission-queue-grid {
            grid-template-columns: repeat(
              2,
              minmax(0, 1fr)
            );
          }
        }

        @media (max-width: 900px) {
          .mission-metrics,
          .morning-briefing-metrics {
            grid-template-columns: repeat(
              2,
              minmax(0, 1fr)
            );
          }

          .mission-queue-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 680px) {
          .mission-control-header {
            gap: 20px;
          }

          .morning-briefing-panel,
          .morning-impact-panel {
            padding: 18px;
          }

          .morning-briefing-metrics {
            grid-template-columns: 1fr;
          }

          .morning-impact-heading,
          .morning-briefing-title-row,
          .morning-briefing-summary-heading {
            align-items: flex-start;
            flex-direction: column;
          }

          .mission-card-topline {
            align-items: flex-start;
            flex-direction: column;
          }

          .mission-evidence-grid {
            grid-template-columns: 1fr;
          }

          .mission-card-featured {
            padding: 18px;
          }

          .mission-ranking-note {
            display: none;
          }
        }

    `}</style>
  );
}
