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
        { id: "test-tee-1", title: "Vault Premium Tee", variantTitle: "Black · Large", quantity: 1, imageUrl: null },
        { id: "test-tee-2", title: "Vault Premium Tee", variantTitle: "White · Large", quantity: 1, imageUrl: null },
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
            {index % 6 === 0 ? <img className="vault-note-image vault-note-50-image" src="/sale-celebration/gbp-50.png" alt="" /> : index % 4 === 0 ? <img className="vault-note-image vault-note-20-image" src="/sale-celebration/gbp-20.png" alt="" /> : "£"}
          </span>
        ))}
      </div>

      <div className="vault-sale-backdrop" aria-hidden="true" />
      <div className="vault-sale-burst" aria-hidden="true" />
      <section className="vault-sale-card" role="alert">
        <div className="vault-sale-logo" aria-label="The Fabric Vault"><img src="/sale-celebration/fabric-vault-logo.png" alt="The Fabric Vault" /></div>
        <div className="vault-sale-brand">FABRIC VAULT<span>WHERE LUXURY MEETS AFFORDABILITY</span></div>
        <div className="vault-sale-kicker"><i />ACCESS GRANTED<i /></div>
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
                <div className="vault-sale-item-thumb" aria-hidden="true">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : "V"}</div>
                <div className="vault-sale-item-copy"><b>{item.title}</b><span>{item.variantTitle ?? "Vault item"}</span><em>× {item.quantity}</em></div>
              </div>
            ))}
          </div>
        ) : null}
        <button type="button" onClick={acknowledge}>
          ✓ ACKNOWLEDGE {pending.length === 1 ? "ORDER" : `${pending.length} ORDERS`}
        </button>
        <div className="vault-sale-footer">ANOTHER STEP FORWARD <b>V</b></div>
      </section>

      </div> : null}
      <style>{`
        .vault-test-sale-button{position:fixed;right:18px;bottom:18px;z-index:9998;min-height:38px;padding:0 14px;border:1px solid rgba(232,188,67,.65);border-radius:7px;background:#111613;color:#e8bc43;font:800 11px/1 inherit;letter-spacing:.06em;cursor:pointer;box-shadow:0 8px 22px rgba(0,0,0,.35)}.vault-test-sale-button:hover{background:#191f1b}.vault-test-sale-button:focus-visible{outline:2px solid #fff;outline-offset:3px}
        .vault-sale-celebration{position:fixed;inset:0;z-index:9999;pointer-events:none;overflow:hidden}.vault-sale-backdrop{position:absolute;inset:0;z-index:1;background:rgba(0,0,0,.58);backdrop-filter:blur(1.5px)}.vault-sale-burst{position:absolute;z-index:2;left:50%;top:44%;width:min(900px,90vw);height:min(720px,80vh);transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,rgba(241,191,61,.32) 0,rgba(218,159,31,.13) 25%,rgba(218,159,31,.045) 48%,transparent 70%);filter:blur(9px);animation:vault-burst 2.2s ease-in-out infinite alternate}
        .vault-money-rain{position:absolute;inset:-15vh 0 0;overflow:hidden;z-index:4;filter:none}
        .vault-money-rain span{position:absolute;top:-12vh;color:#e8bc43;font-weight:900;text-shadow:0 2px 8px #000,0 0 16px rgba(232,188,67,.35);opacity:.9;animation:vault-money-fall linear infinite;will-change:transform}
        .vault-note-image{display:block;width:112px;height:auto;filter:drop-shadow(0 8px 10px rgba(0,0,0,.62));border-radius:2px;transform:rotate(-4deg);user-select:none}.vault-note-20-image{width:116px}.vault-note-50-image{width:108px}
        .vault-sale-card{pointer-events:auto;position:absolute;z-index:3;top:50%;left:50%;width:min(690px,calc(100vw - 32px));transform:translate(-50%,-50%);padding:30px 40px 24px;border:2px solid rgba(255,199,67,.9);border-radius:13px;background:radial-gradient(circle at 50% 28%,rgba(122,76,8,.22),transparent 38%),linear-gradient(145deg,rgba(20,20,15,.97),rgba(5,8,7,.99));box-shadow:0 24px 90px rgba(0,0,0,.72),0 0 18px rgba(255,190,42,.5),0 0 70px rgba(232,157,20,.24),inset 0 0 55px rgba(225,155,22,.08);text-align:center;color:#f5f1e7}.vault-sale-card:before{content:"";position:absolute;inset:-2px;z-index:-1;border-radius:13px;box-shadow:0 0 28px rgba(255,190,42,.7);animation:vault-card-glow 1.6s ease-in-out infinite alternate}
        .vault-sale-logo{width:104px;height:92px;margin:-18px auto 3px;display:grid;place-items:center;overflow:hidden;filter:drop-shadow(0 0 24px rgba(255,191,43,.38))}.vault-sale-logo img{width:132px;height:132px;object-fit:cover;object-position:50% 35%;transform:scale(1.05)}.vault-sale-brand{margin:0 0 15px;color:#f2c454;font-size:15px;font-weight:800;letter-spacing:.28em}.vault-sale-brand span{display:block;margin-top:5px;color:#9e7a2e;font-size:7px;letter-spacing:.13em}.vault-sale-kicker{display:flex;align-items:center;justify-content:center;gap:13px;color:#f3ce69;font-size:12px;font-weight:900;letter-spacing:.28em}.vault-sale-kicker i{width:46px;height:1px;background:linear-gradient(90deg,transparent,#e8bc43)}.vault-sale-kicker i:last-child{transform:scaleX(-1)}
        .vault-sale-title{margin-top:14px;padding-top:16px;border-top:1px solid rgba(232,188,67,.2);color:#fff7df;font-size:34px;font-weight:900;letter-spacing:.055em;text-shadow:0 2px 0 #7e5819,0 0 18px rgba(255,203,83,.22)}
        .vault-sale-card>strong{display:block;margin:8px 0 2px;color:#fff0b8;font-size:66px;text-shadow:0 2px 0 #8d5e12,0 0 12px #e9a91e,0 0 34px rgba(255,190,45,.55);line-height:1.05}
        .vault-sale-card p{margin:8px 0 14px;color:#ded7c8;font-size:12px;font-weight:700;letter-spacing:.08em;line-height:1.45}.vault-sale-items{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:0 auto 18px;max-width:500px;text-align:left}.vault-sale-item{display:block;padding:8px;border:1px solid rgba(232,188,67,.55);border-radius:9px;background:linear-gradient(145deg,rgba(26,26,21,.95),rgba(8,11,10,.98));box-shadow:0 0 18px rgba(225,157,26,.08)}.vault-sale-item-thumb{display:grid;width:100%;height:118px;place-items:center;border:1px solid rgba(232,188,67,.35);border-radius:6px;background:linear-gradient(145deg,#171d1a,#080b0a);color:#e8bc43;font-weight:900;overflow:hidden}.vault-sale-item-thumb img{width:100%;height:100%;object-fit:cover;display:block}.vault-sale-item-copy{padding:8px 3px 2px}.vault-sale-item b,.vault-sale-item span,.vault-sale-item em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.vault-sale-item b{color:#fff8e8;font-size:12px}.vault-sale-item span{margin-top:4px;color:#b9b1a1;font-size:11px}.vault-sale-item em{margin-top:4px;color:#fff;font-size:13px;font-style:normal;font-weight:800}
        .vault-sale-card button{width:100%;min-height:52px;padding:0 20px;border:1px solid #e8bc43;border-radius:7px;background:linear-gradient(180deg,#fff0b3 0%,#f6c94f 48%,#dca420 100%);color:#0b0d0b;font:900 14px/1 inherit;letter-spacing:.045em;cursor:pointer;box-shadow:0 0 22px rgba(255,190,43,.42),0 8px 22px rgba(0,0,0,.4),inset 0 1px 0 #fff7d8}
        .vault-sale-card button:hover{filter:brightness(1.08)}
        .vault-sale-card button:focus-visible{outline:2px solid #fff;outline-offset:3px}
        .vault-sale-footer{margin-top:20px;color:#e3b94c;font-size:10px;font-weight:800;letter-spacing:.34em}.vault-sale-footer b{margin-left:8px;color:#f6ce68;font-size:20px;text-shadow:0 0 12px rgba(255,190,43,.45)}@keyframes vault-card-glow{from{opacity:.55}to{opacity:1}}@keyframes vault-burst{from{transform:translate(-50%,-50%) scale(.96);opacity:.72}to{transform:translate(-50%,-50%) scale(1.06);opacity:1}}@keyframes vault-money-fall{0%{transform:translate3d(0,-12vh,0) rotate(-16deg);opacity:0}8%{opacity:.9}50%{transform:translate3d(28px,55vh,0) rotate(150deg)}92%{opacity:.9}100%{transform:translate3d(-18px,118vh,0) rotate(330deg);opacity:0}}
        @media (prefers-reduced-motion:reduce){.vault-money-rain span{animation-duration:14s!important}}
        @media (max-width:600px){.vault-sale-card{top:50%;padding:20px}.vault-sale-title{font-size:22px}.vault-sale-card>strong{font-size:42px}.vault-sale-items{grid-template-columns:1fr}.vault-sale-logo{width:76px;height:64px;margin-top:-8px}.vault-sale-logo img{width:96px;height:96px}}
      `}</style>
    </>
  );
}
