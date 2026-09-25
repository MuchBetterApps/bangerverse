"use client";

import { useEffect, useRef } from "react";

export function SignInGate({ onSignIn, onDemo }: { onSignIn: () => void; onDemo: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="mg-signin-gate" aria-labelledby="mailg-welcome-title" onCancel={event => event.preventDefault()}>
    <div className="mg-signin-brand"><img src="/mailg-mark.svg" alt="" width={40} height={32}/><span>mailG</span></div>
    <h1 id="mailg-welcome-title">Your mail, all together.</h1>
    <p>Connect your Banger account to open your mailboxes.</p>
    <button className="mg-signin-primary" onClick={onSignIn}>Sign in with Banger</button>
    <button className="mg-signin-demo" onClick={onDemo}>Try demo</button>
  </dialog>;
}
