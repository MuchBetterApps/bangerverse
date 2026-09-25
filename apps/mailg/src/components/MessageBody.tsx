"use client";

import { useEffect, useRef, useState } from "react";

export function MessageBody({ messageId, sender }: { messageId: string; sender: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    setReady(false);
    let observer: ResizeObserver | undefined;
    let animation = 0;
    const attach = () => {
      observer?.disconnect();
      const document = frame.contentDocument;
      // The initial about:blank document is not the loaded email.
      if (!document?.body || document.URL === "about:blank") return;
      const style = document.createElement("style");
      style.textContent = "html,body{height:auto!important;min-height:0!important;max-height:none!important}body{overflow-wrap:anywhere}img{max-width:100%;object-fit:contain}";
      document.head.append(style);
      // Measure a content box, never body.scrollHeight: in quirks-mode email
      // documents that includes the iframe viewport and causes a resize loop.
      const content = document.createElement("div");
      content.style.cssText = "display:flow-root!important;height:auto!important;min-height:0!important";
      content.dataset.mailgContent = "true";
      while (document.body.firstChild) content.append(document.body.firstChild);
      document.body.append(content);
      const measure = () => {
        cancelAnimationFrame(animation);
        animation = requestAnimationFrame(() => {
          const computed = frame.contentWindow!.getComputedStyle(document.body);
          const number = (value: string) => parseFloat(value) || 0;
          const outside = number(computed.marginTop) + number(computed.marginBottom)
            + number(computed.paddingTop) + number(computed.paddingBottom)
            + number(computed.borderTopWidth) + number(computed.borderBottomWidth);
          const height = Math.max(1, Math.ceil(Math.max(content.getBoundingClientRect().height, content.scrollHeight) + outside));
          if (frame.style.height !== `${height}px`) frame.style.height = `${height}px`;
          setReady(true);
        });
      };
      observer = new ResizeObserver(measure);
      observer.observe(content);
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

  return <div className="mg-message-html-container" aria-busy={!ready}>
    {!ready && <div className="mg-message-placeholder" role="status">Loading message…</div>}
    <iframe ref={frameRef} className={`mg-message-html${ready ? " ready" : ""}`} title={`Message from ${sender}`} sandbox="allow-same-origin" referrerPolicy="no-referrer" src={`/api/banger/messages/${messageId}/html`} />
  </div>;
}
