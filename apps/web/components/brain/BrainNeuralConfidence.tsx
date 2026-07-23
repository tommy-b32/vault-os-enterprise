"use client";

import { useMemo } from "react";

type Props = {
  confidence: number;
  label?: string;
};

type NeuralNode = {
  id: number;
  x: number;
  y: number;
  active: boolean;
};

const NODE_POSITIONS = [
  { x: 50, y: 12 },
  { x: 24, y: 24 },
  { x: 76, y: 24 },
  { x: 14, y: 48 },
  { x: 38, y: 44 },
  { x: 62, y: 44 },
  { x: 86, y: 48 },
  { x: 24, y: 72 },
  { x: 50, y: 66 },
  { x: 76, y: 72 },
  { x: 50, y: 90 },
];

const CONNECTIONS = [
  [0, 1],
  [0, 2],
  [1, 3],
  [1, 4],
  [2, 5],
  [2, 6],
  [3, 7],
  [4, 7],
  [4, 8],
  [5, 8],
  [5, 9],
  [6, 9],
  [7, 10],
  [8, 10],
  [9, 10],
];

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

export function BrainNeuralConfidence({
  confidence,
  label = "Vault Brain confidence",
}: Props) {
  const safeConfidence =
    clampPercentage(confidence);

  const activeNodeCount = Math.max(
    1,
    Math.round(
      (safeConfidence / 100) *
        NODE_POSITIONS.length,
    ),
  );

  const nodes = useMemo<NeuralNode[]>(
    () =>
      NODE_POSITIONS.map((position, index) => ({
        id: index,
        x: position.x,
        y: position.y,
        active: index < activeNodeCount,
      })),
    [activeNodeCount],
  );

  return (
    <section className="brain-neural-confidence">
      <div className="brain-neural-copy">
        <p className="vault-eyebrow">
          Neural Confidence
        </p>

        <h3>{label}</h3>

        <strong>{safeConfidence}%</strong>

        <p>
          The network activates as catalogue,
          supplier and commercial data becomes
          more trusted.
        </p>
      </div>

      <div
        className="brain-neural-map"
        role="img"
        aria-label={`${label}: ${safeConfidence}%`}
      >
        <svg
          viewBox="0 0 100 100"
          aria-hidden="true"
        >
          {CONNECTIONS.map(
            ([startIndex, endIndex]) => {
              const start = nodes[startIndex];
              const end = nodes[endIndex];

              const isActive =
                start.active && end.active;

              return (
                <line
                  key={`${startIndex}-${endIndex}`}
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  className={
                    isActive
                      ? "is-active"
                      : ""
                  }
                />
              );
            },
          )}
        </svg>

        {nodes.map((node) => (
          <span
            key={node.id}
            className={[
              "brain-neural-node",
              node.active ? "is-active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{
              left: `${node.x}%`,
              top: `${node.y}%`,
            }}
          />
        ))}

        <div className="brain-neural-core">
          <span>{safeConfidence}%</span>
        </div>
      </div>
    </section>
  );
}