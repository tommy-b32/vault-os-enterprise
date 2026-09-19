"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { CommandCentreCockpitData } from "@/lib/command-centre/CommandCentreCockpit";

type RecentOrder = NonNullable<CommandCentreCockpitData["trading"]["recentOrders"]["value"]>[number];

const KNOWN_ORDERS_KEY = "vault-os-sale-celebration-known-orders-v1";
const PENDING_ORDERS_KEY = "vault-os-sale-celebration-pending-orders-v1";
const BASE_TITLE = "Vault OS";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Celebration persistence is non-critical; the dashboard must keep working.
  }
}

function playKerChing(context: AudioContext) {
  const now = context.currentTime;
  const notes = [
    { frequency: 1046.5, start: 0, duration: 0.11, gain: 0.12 },
    { frequency: 1318.5, start: 0.08, duration: 0.14, gain: 0.1 },
    { frequency: 1568, start: 0.17, duration: 0.42, gain: 0.12 },
    { frequency: 2093, start: 0.22, duration: 0.55, gain: 0.08 },
  ];

  notes.forEach(({ frequency, start, duration, gain }) => {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now + start);
    envelope.gain.setValueAtTime(0.0001, now + start);
    envelope.gain.exponentialRampToValueAtTime(gain, now + start + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
    oscillator.connect(envelope);
    envelope.connect(context.destination);
    oscillator.start(now + start);
    oscillator.stop(now + start + duration + 0.02);
  });
}

export function VaultSaleCelebration({
  recentOrders,
}: {
  recentOrders: CommandCentreCockpitData["trading"]["recentOrders"];
}) {
  const [pending, setPending] = useState<RecentOrder[]>([]);
  const [ready, setReady] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const currentOrders = useMemo(
    () => recentOrders.value ?? [],
    [recentOrders.value],
  );

  useEffect(() => {
    const unlockAudio = () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      if (audioContextRef.current.state === "suspended") {
        void audioContextRef.current.resume();
      }
    };

    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  useEffect(() => {
    const storedPending = readJson<RecentOrder[]>(PENDING_ORDERS_KEY, []);
    setPending(storedPending);

    const known = readJson<string[] | null>(KNOWN_ORDERS_KEY, null);
    if (known === null) {
      writeJson(KNOWN_ORDERS_KEY, currentOrders.map((order) => order.id));
    }
    setReady(true);
    // Establish the first-load baseline once. New orders are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !currentOrders.length) return;

    const knownIds = new Set(readJson<string[]>(KNOWN_ORDERS_KEY, []));
    const newlyDetected = currentOrders.filter((order) => !knownIds.has(order.id));
    if (!newlyDetected.length) return;

    currentOrders.forEach((order) => knownIds.add(order.id));
    writeJson(KNOWN_ORDERS_KEY, Array.from(knownIds).slice(-100));

    setPending((existing) => {
      const pendingIds = new Set(existing.map((order) => order.id));
      const additions = newlyDetected.filter((order) => !pendingIds.has(order.id));
      const next = [...additions, ...existing];
      writeJson(PENDING_ORDERS_KEY, next);
      return next;
    });

    newlyDetected.forEach((_, index) => {
      window.setTimeout(() => {
        const context = audioContextRef.current;
        if (!context || context.state !== "running") return;
        playKerChing(context);
      }, index * 850);
    });
  }, [currentOrders, ready]);

  useEffect(() => {
    if (!ready) return;
    document.title = pending.length
      ? `💷 (${pending.length}) NEW ORDER${pending.length === 1 ? "" : "S"} | Vault OS`
      : BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [pending.length, ready]);

  if (!ready) return null;

  const totalRevenue = pending.reduce((sum, order) => sum + order.netRevenue, 0);
  const currency = pending[0]?.currency ?? "GBP";
  const totalItems = pending.reduce((sum, order) => sum + (order.quantity ?? 0), 0);
  const formatter = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const acknowledge = () => {
    setPending([]);
    writeJson(PENDING_ORDERS_KEY, []);
  };

  const triggerTestSale = () => {
    const testOrder: RecentOrder = {
      id: `test-${Date.now()}`,
      displayName: "#TEST",
      fulfilmentStatus: "unfulfilled",
      quantity: 2,
      netRevenue: 70,
      currency: "GBP",
      createdAt: new Date().toISOString(),
      destination: "/orders",
      items: [
        { id: "test-tee-1", title: "Vault Premium Tee", variantTitle: "Black · Large", quantity: 1 },
        { id: "test-tee-2", title: "Vault Premium Tee", variantTitle: "White · Large", quantity: 1 },
      ],
    };
    setPending((existing) => {
      const next = [testOrder, ...existing];
      writeJson(PENDING_ORDERS_KEY, next);
      return next;
    });
    const context = audioContextRef.current;
    if (context?.state === "running") playKerChing(context);
  };

  return (
    <>
      {process.env.NODE_ENV === "development" && !pending.length ? (
        <button className="vault-test-sale-button" type="button" onClick={triggerTestSale}>£ TEST SALE</button>
      ) : null}
      {pending.length ? <div className="vault-sale-celebration" aria-live="assertive">
      <div className="vault-money-rain" aria-hidden="true">
        {Array.from({ length: 34 }, (_, index) => (
          <span
            key={index}
            style={{
              left: `${(index * 37) % 97}%`,
              animationDelay: `-${(index * 0.43) % 7}s`,
              animationDuration: `${5.2 + (index % 7) * 0.48}s`,
              fontSize: `${22 + (index % 5) * 5}px`,
            }}
          >
            {index % 6 === 0 ? <i className="vault-note vault-note-50">£50</i> : index % 4 === 0 ? <i className="vault-note vault-note-20">£20</i> : "£"}
          </span>
        ))}
      </div>

      <section className="vault-sale-card" role="alert">
        <div className="vault-sale-kicker">ACCESS GRANTED</div>
        <div className="vault-sale-title">
          {pending.length === 1 ? "NEW VAULT ORDER" : `${pending.length} NEW VAULT ORDERS`}
        </div>
        <strong>{formatter.format(totalRevenue)}</strong>
        <p className="vault-order-meta">
          {pending.length === 1
            ? `${pending[0].displayName} · ${pending[0].quantity ?? "?"} item${pending[0].quantity === 1 ? "" : "s"}`
            : `${totalItems || "?"} items · ${pending.map((order) => order.displayName).join(" · ")}`}
        </p>
        {pending.length === 1 && pending[0].items?.length ? (
          <div className="vault-sale-items">
            {pending[0].items.slice(0, 4).map((item) => (
              <div className="vault-sale-item" key={item.id}>
                <div className="vault-sale-item-thumb" aria-hidden="true">V</div>
                <div><b>{item.title}</b><span>{item.variantTitle ?? "Vault item"}{item.quantity > 1 ? ` · Qty ${item.quantity}` : ""}</span></div>
              </div>
            ))}
          </div>
        ) : null}
        <button type="button" onClick={acknowledge}>
          ✓ ACKNOWLEDGE {pending.length === 1 ? "ORDER" : `${pending.length} ORDERS`}
        </button>
      </section>

      </div> : null}
      <style>{`
        .vault-test-sale-button{position:fixed;right:18px;bottom:18px;z-index:9998;min-height:38px;padding:0 14px;border:1px solid rgba(232,188,67,.65);border-radius:7px;background:#111613;color:#e8bc43;font:800 11px/1 inherit;letter-spacing:.06em;cursor:pointer;box-shadow:0 8px 22px rgba(0,0,0,.35)}.vault-test-sale-button:hover{background:#191f1b}.vault-test-sale-button:focus-visible{outline:2px solid #fff;outline-offset:3px}
        .vault-sale-celebration{position:fixed;inset:0;z-index:9999;pointer-events:none;overflow:hidden}
        .vault-money-rain{position:absolute;inset:-15vh 0 0;overflow:hidden}
        .vault-money-rain span{position:absolute;top:-12vh;color:#e8bc43;font-weight:900;text-shadow:0 2px 8px #000,0 0 16px rgba(232,188,67,.35);opacity:.9;animation:vault-money-fall linear infinite;will-change:transform}
        .vault-note{display:grid;width:54px;height:27px;place-items:center;border:1px solid rgba(82,55,28,.55);border-radius:3px;background:linear-gradient(135deg,#d5a58a,#f0c6a8 48%,#b97f68);color:#49301f;font:900 12px/1 Georgia,serif;box-shadow:0 3px 10px #0007;transform:rotate(-4deg)}.vault-note-20{background:linear-gradient(135deg,#b7a4bb,#ded1df 48%,#9885a1);color:#403646}
        .vault-sale-card{pointer-events:auto;position:absolute;top:26px;left:50%;width:min(470px,calc(100vw - 32px));transform:translateX(-50%);padding:22px 24px 20px;border:1px solid rgba(232,188,67,.72);border-radius:12px;background:linear-gradient(145deg,rgba(20,25,23,.98),rgba(7,10,9,.99));box-shadow:0 22px 70px rgba(0,0,0,.65),0 0 38px rgba(232,188,67,.12),inset 0 1px 0 rgba(255,255,255,.05);text-align:center;color:#f5f1e7}
        .vault-sale-kicker{color:#e8bc43;font-size:11px;font-weight:900;letter-spacing:.18em}
        .vault-sale-title{margin-top:5px;color:#fff;font-size:17px;font-weight:800;letter-spacing:.08em}
        .vault-sale-card>strong{display:block;margin:8px 0 2px;color:#61dc88;font-size:36px;line-height:1.05}
        .vault-sale-card p{margin:8px 0 12px;color:#b8bdb8;font-size:12px;line-height:1.45}.vault-sale-items{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0 0 16px;text-align:left}.vault-sale-item{display:grid;grid-template-columns:42px minmax(0,1fr);gap:9px;align-items:center;padding:7px;border:1px solid rgba(232,188,67,.18);border-radius:7px;background:rgba(255,255,255,.025)}.vault-sale-item-thumb{display:grid;width:42px;height:42px;place-items:center;border:1px solid rgba(232,188,67,.35);border-radius:6px;background:linear-gradient(145deg,#171d1a,#080b0a);color:#e8bc43;font-weight:900}.vault-sale-item b,.vault-sale-item span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.vault-sale-item b{color:#f4f1e8;font-size:11px}.vault-sale-item span{margin-top:3px;color:#969e98;font-size:10px}
        .vault-sale-card button{min-height:42px;padding:0 20px;border:1px solid #e8bc43;border-radius:7px;background:linear-gradient(180deg,#e8bc43,#c99a25);color:#10130f;font:800 12px/1 inherit;letter-spacing:.055em;cursor:pointer;box-shadow:0 7px 18px rgba(0,0,0,.28)}
        .vault-sale-card button:hover{filter:brightness(1.08)}
        .vault-sale-card button:focus-visible{outline:2px solid #fff;outline-offset:3px}
        @keyframes vault-money-fall{0%{transform:translate3d(0,-12vh,0) rotate(-16deg);opacity:0}8%{opacity:.9}50%{transform:translate3d(28px,55vh,0) rotate(150deg)}92%{opacity:.9}100%{transform:translate3d(-18px,118vh,0) rotate(330deg);opacity:0}}
        @media (prefers-reduced-motion:reduce){.vault-money-rain span{animation-duration:14s!important}}
        @media (max-width:600px){.vault-sale-card{top:14px;padding:18px}.vault-sale-card>strong{font-size:30px}.vault-sale-items{grid-template-columns:1fr}}
      `}</style>
    </>
  );
}
