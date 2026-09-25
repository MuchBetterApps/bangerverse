"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function OnboardingDialog({ children, titleId, className = "", onDismiss }: { children: ReactNode; titleId: string; className?: string; onDismiss?: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = ref.current; node?.showModal(); return () => node?.close(); }, []);
  return <dialog ref={ref} className={`mg-onboarding-dialog ${className}`} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onDismiss?.(); }}>{children}</dialog>;
}

const sourceUrl = "https://github.com/MuchBetterApps/bangerverse/tree/main/apps/mailg";
const starterPrompt = `Help me customize mailG, the open-source email app powered by Banger.
Source: ${sourceUrl}
Clone git@github.com:MuchBetterApps/bangerverse.git and check out main. Work in apps/mailg; read AGENTS.md and README.md first.
Copy .env.example to .env.local only if it does not exist, run npm ci, then npm run dev. Start in demo mode. Preserve existing environment settings and keep credentials on the server.
Ask what I want to change, then implement it and verify the result. Preserve Banger OAuth, mailbox isolation, and email HTML sandboxing. Do not send, delete, or modify real mail while testing.
My idea: [describe the design, feature, or AI workflow I want]`;

export function CustomizeDialog({ onDismiss }: { onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(false);
  return <OnboardingDialog titleId="mailg-customize-title" className="mg-customize-dialog" onDismiss={onDismiss}>
    <div className="mg-signin-brand"><img src="/mailg-mark.svg" alt="" width={40} height={32}/><span>mailG</span></div>
    <h2 id="mailg-customize-title">Make this inbox yours.</h2>
    <p>This app is a starting point. Change its design, add AI workflows, or build something entirely different.</p>
    <div className="mg-customize-tip">Copy the starter prompt into your favorite coding agent. Tell it what you want to build.</div>
    <button className="mg-signin-primary" onClick={async () => { try { await navigator.clipboard.writeText(starterPrompt); setCopied(true); } catch { setFallback(true); } }}>{copied ? "Prompt copied!" : "Copy prompt to customize"}</button>
    <span role="status" className="mg-customize-status">{copied ? "Ready to paste into your coding agent." : ""}</span>
    {fallback && <label className="mg-prompt-fallback">Copy this prompt:<textarea readOnly value={starterPrompt} onFocus={event => event.target.select()}/></label>}
    <a className="mg-source-link" href={sourceUrl} target="_blank" rel="noreferrer">View source ↗</a>
    <button className="mg-signin-demo" onClick={onDismiss}>Maybe later</button>
  </OnboardingDialog>;
}
