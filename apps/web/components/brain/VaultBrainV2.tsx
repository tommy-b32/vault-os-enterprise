import Link from "next/link";

import type {
  VaultBrainEvidenceState,
  VaultBrainIntelligence,
} from "@/lib/brain/getVaultBrainIntelligence";

function labelForEvidence(state: VaultBrainEvidenceState): string {
  return state === "proven" ? "Proven" : state === "blocked" ? "Blocked" : state === "gathering_evidence" ? "Gathering evidence" : "Unknown";
}

function freshness(value: string | null): string {
  return value ? `Source current as of ${new Date(value).toLocaleString("en-GB")}` : "Source freshness unavailable";
}

export function VaultBrainV2({ data }: { data: VaultBrainIntelligence }) {
  const primary = data.primaryConclusion;
  return <main className="vault-brain-v2">
    <header className="vault-brain-v2-header">
      <p className="vault-eyebrow">VAULT BRAIN</p>
      <h1>Executive Intelligence</h1>
      <p>Governed conclusions, their evidence, and the limits of what Vault OS currently knows.</p>
    </header>

    <section aria-labelledby="executive-understanding">
      <div className="vault-brain-v2-heading"><p className="vault-eyebrow">EXECUTIVE UNDERSTANDING</p><h2 id="executive-understanding">What requires attention now</h2></div>
      {data.conclusions.length ? <div className="vault-brain-v2-conclusions">
        {data.conclusions.map((conclusion) => <article className="vault-brain-v2-card" key={conclusion.id}>
          <div className="vault-brain-v2-card-topline"><span className={`vault-brain-v2-state is-${conclusion.evidenceState}`}>{labelForEvidence(conclusion.evidenceState)}</span><span>{conclusion.priority}</span></div>
          <h3>{conclusion.title}</h3>
          {conclusion.description ? <p>{conclusion.description}</p> : null}
          <small>{freshness(conclusion.freshness)}</small>
          <Link href={conclusion.destination}>Open authoritative surface →</Link>
        </article>)}
      </div> : <article className="vault-brain-v2-card"><h3>No governed executive conclusion is currently available</h3><p>Vault Brain will not infer an operational conclusion when Command Centre evidence is unavailable.</p></article>}
    </section>

    <section aria-labelledby="reasoning-evidence">
      <div className="vault-brain-v2-heading"><p className="vault-eyebrow">REASONING &amp; EVIDENCE</p><h2 id="reasoning-evidence">Why Vault OS holds the current position</h2></div>
      <article className="vault-brain-v2-card vault-brain-v2-evidence">
        {primary ? <><h3>{primary.title}</h3><p>{primary.description ?? "The governed source did not provide further explanation."}</p></> : <p>No primary conclusion can be explained until authoritative evidence is available.</p>}
        {data.noTrustedCandidate ? <p className="vault-brain-v2-safety">No trusted buying candidate is available. Vault Brain explains this governed state; it does not create a buying recommendation.</p> : null}
        <div className="vault-brain-v2-evidence-grid">
          {data.domains.map((domain) => <div key={domain.domain}><strong>{domain.domain}</strong><span>{domain.state.replaceAll("_", " ")}</span><p>{domain.detail}</p></div>)}
          {data.supportingEvidence.map((item) => <div key={item}><strong>Evidence</strong><p>{item}</p></div>)}
        </div>
        {primary ? <Link href={primary.destination}>Review governing evidence →</Link> : null}
      </article>
    </section>

    <section className="vault-brain-v2-secondary-grid">
      <article className="vault-brain-v2-card"><p className="vault-eyebrow">CHANGES &amp; MEMORY</p><h2>Comparable governed history is not available yet</h2><p>Vault Brain does not use legacy mixed operational snapshots. Review current executive remediation in Command Centre.</p><Link href="/">Open Command Centre →</Link></article>
      <article className="vault-brain-v2-card"><p className="vault-eyebrow">LEARNED INTELLIGENCE</p><h2>No governed learned patterns available yet</h2><p>Patterns will appear only when supported by sufficient verified evidence.</p><Link href="/intelligence">Open Store Intelligence →</Link></article>
    </section>
    <style>{`
      .vault-brain-v2{max-width:1240px;margin:0 auto;padding:44px 30px 80px;color:#f3f1eb}.vault-brain-v2-header{max-width:680px;margin-bottom:46px}.vault-brain-v2 h1{margin:6px 0 12px;font:600 clamp(32px,5vw,54px)/1.02 Georgia,serif}.vault-brain-v2 h2{margin:4px 0 0;font:600 23px/1.2 Georgia,serif}.vault-brain-v2 h3{margin:12px 0 9px;font-size:18px}.vault-brain-v2 p{color:#b8bcb7;line-height:1.6}.vault-brain-v2-heading{margin:36px 0 14px}.vault-brain-v2-conclusions{display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:14px}.vault-brain-v2-card{padding:22px;border:1px solid rgba(220,181,72,.23);border-radius:12px;background:linear-gradient(145deg,rgba(220,181,72,.07),rgba(255,255,255,.02));box-shadow:inset 0 1px rgba(255,255,255,.04)}.vault-brain-v2-card a{display:inline-block;margin-top:15px;color:#e5bb53;font-size:13px;text-decoration:none}.vault-brain-v2-card small{display:block;margin-top:14px;color:#7f8780;font-size:11px}.vault-brain-v2-card-topline{display:flex;justify-content:space-between;gap:12px;color:#a4a9a2;font-size:11px;text-transform:uppercase}.vault-brain-v2-state{padding:3px 7px;border-radius:99px}.vault-brain-v2-state.is-proven{background:rgba(68,172,102,.18);color:#8ce4aa}.vault-brain-v2-state.is-blocked{background:rgba(202,104,85,.18);color:#f09b87}.vault-brain-v2-state.is-gathering_evidence,.vault-brain-v2-state.is-unknown{background:rgba(217,177,76,.16);color:#e8c26a}.vault-brain-v2-evidence-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:20px 0}.vault-brain-v2-evidence-grid>div{padding:13px;border-left:2px solid rgba(220,181,72,.55);background:rgba(0,0,0,.16)}.vault-brain-v2-evidence-grid span{display:block;margin-top:4px;color:#d9ae47;font-size:11px;text-transform:capitalize}.vault-brain-v2-evidence-grid p{margin:7px 0 0;font-size:12px}.vault-brain-v2-safety{padding:12px 14px;border-left:3px solid #d7a83e;background:rgba(215,168,62,.1);color:#eee5cb}.vault-brain-v2-secondary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:36px}@media(max-width:720px){.vault-brain-v2{padding:30px 17px}.vault-brain-v2-secondary-grid{grid-template-columns:1fr}}
    `}</style>
  </main>;
}
