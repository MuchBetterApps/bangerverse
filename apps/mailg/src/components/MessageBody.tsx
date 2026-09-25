"use client";

import { useEffect, useRef } from "react";

export function MessageBody({ messageId, sender }: { messageId: string; sender: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let observer: ResizeObserver | undefined;
    let animation = 0;
    const attach = () => {
      observer?.disconnect();
      const document = frame.contentDocument;
      if (!document?.body) return;
      // Only the parent can measure the document. Email scripts, forms and
      // top-level navigation remain disabled by the iframe sandbox and response CSP.
      const style = document.createElement("style");
      style.textContent = "html,body{height:auto!important;min-height:0!important;max-height:none!important}body{overflow-wrap:anywhere}img{max-width:100%;height:auto}";
      document.head.append(style);
      const measure = () => {
        cancelAnimationFrame(animation);
        animation = requestAnimationFrame(() => {
          const body = document.body;
          const computed = frame.contentWindow!.getComputedStyle(body);
          const margins = (parseFloat(computed.marginTop) || 0) + (parseFloat(computed.marginBottom) || 0);
          const height = Math.ceil(Math.max(body.scrollHeight, body.offsetHeight) + margins);
          frame.style.height = `${Math.max(1, height)}px`;
        });
      };
      observer = new ResizeObserver(measure);
      observer.observe(document.body);
      measure();
    };
    frame.addEventListener("load", attach);
    if (frame.contentDocument?.readyState === "complete") attach();
    return () => {
      frame.removeEventListener("load", attach);
      observer?.disconnect();
      cancelAnimationFrame(animation);
    };
  }, [messageId]);

  return <iframe ref={frameRef} className="mg-message-html" title={`Message from ${sender}`} sandbox="allow-same-origin" src={`/api/banger/messages/${messageId}/html`} />;
}
