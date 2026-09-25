import DOMPurify from "dompurify";

/** Defense in depth: callers must also use an iframe sandbox without scripts. */
export function sanitizeMessage(source: string): string {
  const clean = DOMPurify.sanitize(source, { WHOLE_DOCUMENT: true, FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "base", "meta", "link", "svg", "math"], FORBID_ATTR: ["srcdoc", "action", "formaction"] });
  const policy = "default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'; font-src data:; form-action 'none'; base-uri 'none'";
  const doc = new DOMParser().parseFromString(clean, "text/html");
  const csp = doc.createElement("meta"); csp.httpEquiv = "Content-Security-Policy"; csp.content = policy;
  const referrer = doc.createElement("meta"); referrer.name = "referrer"; referrer.content = "no-referrer";
  doc.head.prepend(csp, referrer);
  return "<!doctype html>" + doc.documentElement.outerHTML;
}
