// shared/email-brand.ts
function hexColor(value) {
  const text = value.trim().replace(/^#/, "").toLowerCase();
  if (/^[a-f0-9]{3}$/.test(text)) return `#${[...text].map((c) => c + c).join("")}`;
  return /^[a-f0-9]{6}$/.test(text) ? `#${text}` : "#000000";
}
function mixColor(from, to, amount) {
  const a = hexColor(from), b = hexColor(to);
  const channel = (at) => Math.round(parseInt(a.slice(at, at + 2), 16) * (1 - amount) + parseInt(b.slice(at, at + 2), 16) * amount).toString(16).padStart(2, "0");
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}
function luminance(color) {
  const hex = hexColor(color);
  const rgb = [1, 3, 5].map((at) => {
    const c = parseInt(hex.slice(at, at + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrastRatio(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function colorOn(background) {
  if (contrastRatio("#171a1f", background) >= 4.5) return "#171a1f";
  if (contrastRatio("#ffffff", background) >= 4.5) return "#ffffff";
  return "#000000";
}
function textColorOn(preferred, background) {
  if (contrastRatio(preferred, background) >= 4.5) return hexColor(preferred);
  const ink = colorOn(background);
  for (let step = 1; step <= 100; step++) {
    const candidate = mixColor(preferred, ink, step / 100);
    if (contrastRatio(candidate, background) >= 4.5) return candidate;
  }
  return ink;
}
function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("'", "&#39;");
}
function brandLogoHtml(url, name, maxWidth = 180) {
  return `<img src="${escapeHtml(url)}" alt="${escapeHtml(name || "Logo")}" height="32" style="display:block;width:auto;height:auto;max-height:32px;max-width:${maxWidth}px;object-fit:contain;border:0;border-radius:0;padding:0;background:transparent">`;
}
function brandHeaderHtml(brand, text) {
  const name = brand.company_name || "Logo";
  const logo = brand.logo_url;
  const wordmark = brand.wordmark_url;
  if (logo && wordmark && logo !== wordmark) {
    return `<table role="presentation" cellspacing="0" cellpadding="0" style="background:transparent"><tr><td valign="middle" style="padding:0 12px 0 0;background:transparent">${brandLogoHtml(logo, `${name} logo`, 32)}</td><td valign="middle" style="padding:0;background:transparent">${brandLogoHtml(wordmark, name)}</td></tr></table>`;
  }
  if (wordmark || logo) return brandLogoHtml(wordmark || logo, name);
  return `<span style="font-family:${brand.heading_font_family};font-size:20px;font-weight:700;color:${text}">${escapeHtml(brand.company_name || "{{company_name}}")}</span>`;
}

// shared/email-art.ts
var BRAND_ART_STYLES = ["arcs", "blocks", "horizon", "confetti", "frame", "bands", "dots"];
function brandArtQuery(palette) {
  const hex = (value) => hexColor(value).slice(1);
  return `p=${hex(palette.primary)}&a=${hex(palette.accent)}&s=${hex(palette.surface)}&b=${hex(palette.background)}`;
}

// shared/email-palette.ts
var srgbToLinear = (c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
var linearToSrgb = (c) => c <= 31308e-7 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
function hexToRgb(hex) {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#000000";
  return [1, 3, 5].map((at) => parseInt(value.slice(at, at + 2), 16) / 255);
}
function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("")}`;
}
function linearToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function oklabToLinear([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
function toneOfLinear([r, g, b]) {
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : 24389 / 27 * y;
}
function hexToOklch(hex) {
  const [L, a, b] = linearToOklab(hexToRgb(hex).map(srgbToLinear));
  return { l: L, c: Math.hypot(a, b), h: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360 };
}
function toneOf(hex) {
  return toneOfLinear(hexToRgb(hex).map(srgbToLinear));
}
var inGamut = ([r, g, b]) => [r, g, b].every((v) => v >= -1e-4 && v <= 1 + 1e-4);
function fromTone(hue, chroma, tone) {
  if (tone <= 0) return "#000000";
  if (tone >= 100) return "#ffffff";
  const rad = hue * Math.PI / 180;
  const solve = (c) => {
    let lo2 = 0, hi2 = 1, found;
    for (let i = 0; i < 28; i++) {
      const mid = (lo2 + hi2) / 2;
      const linear = oklabToLinear([mid, c * Math.cos(rad), c * Math.sin(rad)]);
      const t = toneOfLinear(linear.map((v) => Math.min(1, Math.max(0, v))));
      if (t < tone) lo2 = mid;
      else hi2 = mid;
      found = linear;
    }
    return found && inGamut(found) ? found : void 0;
  };
  let lo = 0, hi = chroma, best = solve(0);
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const rgb = solve(mid);
    if (rgb) {
      best = rgb;
      lo = mid;
    } else hi = mid;
  }
  const full = solve(chroma);
  return rgbToHex((full || best).map((v) => linearToSrgb(Math.min(1, Math.max(0, v)))));
}
function tonalPalette(hue, chroma) {
  const cache = /* @__PURE__ */ new Map();
  const chromaAt = (t) => t >= 95 ? Math.min(chroma, 0.03) : t >= 88 ? Math.min(chroma, 0.055) : t >= 80 ? Math.min(chroma, 0.1) : chroma;
  return { hue, chroma, tone: (t) => {
    if (!cache.has(t)) cache.set(t, fromTone(hue, chromaAt(t), t));
    return cache.get(t);
  } };
}
var UNCHOSEN_ACCENT = "#2f6fed";
function brandPalettes(seed, accent) {
  const { c, h } = hexToOklch(seed);
  const achromatic = c < 0.03;
  const hue = achromatic ? 60 : h;
  const chroma = achromatic ? 0.02 : Math.max(c, 0.09);
  const accentSeed = accent && accent.toLowerCase() !== UNCHOSEN_ACCENT ? hexToOklch(accent) : void 0;
  const primary = tonalPalette(hue, chroma);
  const tertiary = accentSeed && accentSeed.c >= 0.05 ? tonalPalette(accentSeed.h, Math.max(accentSeed.c, 0.09)) : primary;
  return {
    seed,
    seedTone: toneOf(seed),
    achromatic,
    primary,
    monochrome: tertiary === primary,
    secondary: tonalPalette(hue, Math.min(chroma / 3, 0.05)),
    tertiary,
    neutral: tonalPalette(hue, achromatic ? 6e-3 : 0.012),
    neutralVariant: tonalPalette(hue, achromatic ? 0.012 : 0.025)
  };
}
function readableOn(fill, ink) {
  const contrast = (a, b) => {
    const x = toneLuminance(a), y = toneLuminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const best = [ink, "#ffffff", "#000000"].map((c) => ({ c, r: contrast(c, fill) })).find((o) => o.r >= 4.5);
  return best ? best.c : contrast("#ffffff", fill) > contrast("#000000", fill) ? "#ffffff" : "#000000";
}
function toneLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function emailScheme(palettes) {
  const { primary: p, tertiary: t, neutral: n, neutralVariant: nv, seedTone } = palettes;
  const band = seedTone >= 12 && seedTone <= 42 && !palettes.achromatic ? palettes.seed : palettes.achromatic ? n.tone(10) : p.tone(25);
  const onBand = toneOf(band) > 55 ? p.tone(10) : "#ffffff";
  const scheme = {
    brand: palettes.seed,
    onBrand: readableOn(palettes.seed, p.tone(10)),
    band,
    onBand,
    onBandMuted: toneOf(band) > 55 ? p.tone(30) : p.tone(palettes.achromatic ? 80 : 85),
    accentOnBand: palettes.monochrome && palettes.achromatic ? n.tone(85) : t.tone(80),
    container: palettes.achromatic ? n.tone(94) : p.tone(94),
    onContainer: palettes.achromatic ? n.tone(15) : p.tone(20),
    // Monochrome accents are a lighter step of the brand (grey for black brands); chosen accents use their own tone 60.
    accent: palettes.monochrome ? palettes.achromatic ? n.tone(35) : p.tone(seedTone > 60 ? 45 : 65) : t.tone(60),
    onAccent: "",
    accentContainer: palettes.monochrome ? palettes.achromatic ? n.tone(92) : p.tone(90) : t.tone(93),
    onAccentContainer: palettes.monochrome ? palettes.achromatic ? n.tone(15) : p.tone(20) : t.tone(20),
    canvas: n.tone(96),
    surface: n.tone(99),
    onSurface: n.tone(10),
    onSurfaceVariant: nv.tone(38),
    outline: nv.tone(88),
    darkCanvas: n.tone(6),
    darkSurface: palettes.achromatic ? n.tone(12) : p.tone(12),
    onDark: n.tone(96),
    onDarkMuted: nv.tone(72),
    accentOnDark: palettes.monochrome && palettes.achromatic ? n.tone(85) : t.tone(80),
    brandText: seedTone <= 45 ? palettes.seed : p.tone(35)
  };
  scheme.onAccent = readableOn(scheme.accent, t.tone(10));
  return scheme;
}

// shared/email-styles.ts
var EMAIL_STYLE_KEYS = ["material", "clarity", "editorial", "bold", "luxe", "playful", "plain"];
var BRAND_STYLE = "brand";
var ALL_STYLE_KEYS = [BRAND_STYLE, ...EMAIL_STYLE_KEYS];
var SYSTEM_SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
var CLARITY_SANS = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif";
var EMAIL_STYLES = {
  material: {
    key: "material",
    label: "Material",
    description: "Tonal surfaces, rounded cards, pill buttons.",
    fonts: { heading: "'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif", body: "'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif", headingWeight: "500" },
    structure: { card: true, cardRadius: 28, cardBorder: false, align: "left", padX: 36, imageInset: 16, imageRadius: 20, panelRadius: 16, masthead: false },
    type: { case: "none", tracking: "-.01em", lineHeight: 1.12, hero: 44, title: 32, small: 24, eyebrowTracking: ".06em", eyebrowCase: "none" },
    button: { radius: 999, outline: false, case: "none", tracking: ".01em", size: 15, pad: "14px 26px" },
    colors: (s) => ({ canvas: s.container, band: s.container, onBand: s.onContainer, onBandMuted: s.onContainer, panel: s.canvas })
  },
  clarity: {
    key: "clarity",
    label: "Clarity",
    description: "White space, centered, big tight headlines, product first.",
    fonts: { heading: CLARITY_SANS, body: CLARITY_SANS, headingWeight: "600" },
    structure: { card: false, cardRadius: 0, cardBorder: false, align: "center", padX: 44, imageInset: 24, imageRadius: 18, panelRadius: 18, masthead: false },
    type: { case: "none", tracking: "-.028em", lineHeight: 1.06, hero: 52, title: 38, small: 26, eyebrowTracking: "0", eyebrowCase: "none" },
    button: { radius: 999, outline: false, case: "none", tracking: "0", size: 15, pad: "12px 24px" },
    colors: () => ({ canvas: "#ffffff", surface: "#ffffff", band: "#f5f5f7", onBand: "#1d1d1f", onBandMuted: "#6e6e73", onSurface: "#1d1d1f", onSurfaceVariant: "#6e6e73", outline: "#d2d2d7", panel: "#f5f5f7" })
  },
  editorial: {
    key: "editorial",
    label: "Editorial",
    description: "A magazine: masthead, light serif, square photos.",
    fonts: { heading: "'Fraunces', Georgia, 'Times New Roman', serif", body: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif", headingWeight: "400" },
    structure: { card: false, cardRadius: 0, cardBorder: false, align: "left", padX: 40, imageInset: 0, imageRadius: 0, panelRadius: 0, masthead: true },
    type: { case: "none", tracking: "-.02em", lineHeight: 1.04, hero: 50, title: 40, small: 28, eyebrowTracking: ".22em", eyebrowCase: "uppercase" },
    button: { radius: 0, outline: false, case: "uppercase", tracking: ".12em", size: 13, pad: "15px 26px" },
    colors: (s) => ({ canvas: s.surface, band: s.surface, onBand: s.onSurface, onBandMuted: s.onSurfaceVariant, panel: s.canvas })
  },
  bold: {
    key: "bold",
    label: "Bold",
    description: "Poster energy: heavy uppercase type, color blocks, square edges.",
    fonts: { heading: "'Archivo', 'Helvetica Neue', Helvetica, Arial, sans-serif", body: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif", headingWeight: "800" },
    structure: { card: true, cardRadius: 0, cardBorder: false, align: "left", padX: 36, imageInset: 0, imageRadius: 0, panelRadius: 0, masthead: false },
    type: { case: "uppercase", tracking: "-.03em", lineHeight: 0.95, hero: 54, title: 40, small: 28, eyebrowTracking: ".2em", eyebrowCase: "uppercase" },
    button: { radius: 0, outline: false, case: "uppercase", tracking: ".08em", size: 15, pad: "18px 30px" },
    colors: (s) => ({ panel: s.container })
  },
  luxe: {
    key: "luxe",
    label: "Luxe",
    description: "Centered, airy, tracked capitals, outline buttons.",
    fonts: { heading: "'Cormorant Garamond', Georgia, 'Times New Roman', serif", body: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif", headingWeight: "500" },
    structure: { card: true, cardRadius: 0, cardBorder: true, align: "center", padX: 48, imageInset: 28, imageRadius: 0, panelRadius: 0, masthead: false },
    type: { case: "none", tracking: ".005em", lineHeight: 1.12, hero: 46, title: 36, small: 26, eyebrowTracking: ".34em", eyebrowCase: "uppercase" },
    button: { radius: 0, outline: true, case: "uppercase", tracking: ".22em", size: 12, pad: "16px 34px" },
    colors: (s) => ({ band: s.canvas, onBand: s.onSurface, onBandMuted: s.onSurfaceVariant, panel: s.canvas })
  },
  playful: {
    key: "playful",
    label: "Playful",
    description: "Big radii, tinted canvas, friendly and centered.",
    fonts: { heading: "'Bricolage Grotesque', 'Helvetica Neue', Helvetica, Arial, sans-serif", body: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif", headingWeight: "700" },
    structure: { card: true, cardRadius: 36, cardBorder: false, align: "center", padX: 36, imageInset: 20, imageRadius: 28, panelRadius: 24, masthead: false },
    type: { case: "none", tracking: "-.025em", lineHeight: 1.05, hero: 46, title: 34, small: 26, eyebrowTracking: ".08em", eyebrowCase: "uppercase" },
    button: { radius: 999, outline: false, case: "none", tracking: "0", size: 16, pad: "16px 30px" },
    colors: (s) => ({ canvas: s.accentContainer, panel: s.container })
  },
  plain: {
    key: "plain",
    label: "Plain",
    description: "Almost text: system fonts, no decoration, reads like a person wrote it.",
    fonts: { heading: SYSTEM_SANS, body: SYSTEM_SANS, headingWeight: "700" },
    structure: { card: false, cardRadius: 0, cardBorder: false, align: "left", padX: 28, imageInset: 0, imageRadius: 6, panelRadius: 8, masthead: false },
    type: { case: "none", tracking: "-.01em", lineHeight: 1.2, hero: 32, title: 26, small: 22, eyebrowTracking: ".04em", eyebrowCase: "none" },
    button: { radius: 6, outline: false, case: "none", tracking: "0", size: 15, pad: "12px 20px" },
    colors: (s) => ({ canvas: s.surface, band: s.surface, onBand: s.onSurface, onBandMuted: s.onSurfaceVariant, panel: s.canvas })
  }
};
function isEmailStyle(value) {
  return typeof value === "string" && ALL_STYLE_KEYS.includes(value);
}
function suggestedEmailStyle(business) {
  return { saas: "clarity", shop: "luxe", creator: "editorial", services: "material", local: "playful", community: "playful" }[business || ""] || "material";
}
var FONT_FAMILIES = [
  [/cormorant|playfair|didot|bodoni|garamond|cinzel|italiana|marcellus|prata|gilda|bellefair/i, "luxe"],
  [/fraunces|lora|merriweather|newsreader|source serif|libre baskerville|crimson|spectral|pt serif|noto serif|charter|tiempos|georgia/i, "editorial"],
  [/anton|bebas|oswald|archivo black|league gothic|impact|druk|big shoulders|alfa slab|black ops|space grotesk|syne|clash/i, "bold"],
  [/nunito|quicksand|poppins|baloo|fredoka|bricolage|comfortaa|rubik|varela|lexend|outfit|urbanist|sora|chewy|grandstander/i, "playful"],
  [/roboto|google sans|product sans|open sans|noto sans/i, "material"],
  [/inter|helvetica|sf pro|-apple-system|manrope|plus jakarta|figtree|geist|satoshi|söhne|sohne|neue haas|dm sans|work sans|ibm plex sans/i, "clarity"],
  [/arial|verdana|tahoma|system-ui|segoe/i, "plain"]
];
var firstFont = (stack) => (stack || "").split(",")[0].replace(/["']/g, "").trim();
var isDefaultHeading = (stack) => !stack || /^\s*Georgia\b/i.test(stack);
var isDefaultBody = (stack) => !stack || /^\s*(Helvetica Neue|Helvetica|Arial)\b/i.test(stack);
function styleForFont(name) {
  return FONT_FAMILIES.find(([pattern]) => pattern.test(name))?.[1];
}
function hexChroma(hex) {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return void 0;
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return { chroma: max - min, lightness: (max + min) / 2 };
}
function closestEmailStyle(brand = {}, business) {
  if (!isDefaultHeading(brand.heading_font_family)) {
    const match = styleForFont(firstFont(brand.heading_font_family));
    if (match) return match;
  }
  if (!isDefaultBody(brand.body_font_family)) {
    const match = styleForFont(firstFont(brand.body_font_family));
    if (match && match !== "editorial" && match !== "luxe") return match;
  }
  const primary = hexChroma(brand.primary_color);
  if (primary && primary.chroma < 0.08) return "clarity";
  if (primary && primary.chroma > 0.55 && primary.lightness > 0.55) return "playful";
  const background = hexChroma(brand.background_color);
  if (background && background.chroma > 0.06 && background.lightness > 0.85) return "material";
  return suggestedEmailStyle(business);
}

// shared/email-brand-tokens.ts
var DEFAULT_ART_BASE_URL = "https://api.bangermail.com";
var escapeHtml2 = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
function mixHex(from, to, amount) {
  const hex = (value) => {
    const text = value.trim().toLowerCase().replace(/^#/, "");
    if (/^[0-9a-f]{3}$/.test(text)) return `#${[...text].map((ch) => ch + ch).join("")}`;
    return /^[0-9a-f]{6}$/.test(text) ? `#${text}` : "#000000";
  };
  const a = hex(from), b = hex(to);
  const channel = (index) => {
    const x = parseInt(a.slice(index, index + 2), 16);
    const y = parseInt(b.slice(index, index + 2), 16);
    return Math.round(x + (y - x) * amount).toString(16).padStart(2, "0");
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}
function brandArtUrl(style, brand, baseUrl = DEFAULT_ART_BASE_URL) {
  const query = brandArtQuery({ primary: brand.primary_color, accent: brand.accent_color, surface: brand.surface_color, background: brand.background_color });
  return `${baseUrl.replace(/\/+$/, "")}/v1/art/${style}.png?${query}`;
}
var plain = (hex) => hexToOklch(hex).c < 0.02;
function brandScheme(input) {
  const scheme = emailScheme(brandPalettes(input.primary_color, input.accent_color));
  return {
    ...scheme,
    canvas: plain(input.background_color) ? scheme.canvas : input.background_color,
    surface: plain(input.surface_color) ? scheme.surface : input.surface_color,
    onSurface: plain(input.text_color) ? scheme.onSurface : input.text_color,
    onSurfaceVariant: plain(input.muted_text_color) ? scheme.onSurfaceVariant : input.muted_text_color
  };
}
var GOOGLE_FONTS = /* @__PURE__ */ new Set([
  "Fraunces",
  "Inter",
  "DM Sans",
  "DM Serif Display",
  "Playfair Display",
  "Lora",
  "Merriweather",
  "Poppins",
  "Montserrat",
  "Roboto",
  "Open Sans",
  "Lato",
  "Raleway",
  "Nunito",
  "Work Sans",
  "Source Sans 3",
  "Libre Baskerville",
  "Cormorant Garamond",
  "EB Garamond",
  "Space Grotesk",
  "Manrope",
  "Plus Jakarta Sans",
  "Outfit",
  "Figtree",
  "Archivo",
  "Bricolage Grotesque",
  "Instrument Serif",
  "Newsreader",
  "Karla",
  "Rubik",
  "Mulish",
  "Josefin Sans",
  "Oswald",
  "Crimson Pro",
  "Spectral",
  "Syne",
  "Sora",
  "Urbanist",
  "Lexend"
]);
function firstFamily(stack) {
  return (stack.split(",")[0] || "").replace(/["']/g, "").trim();
}
var FONT_AXES = {
  Fraunces: ":opsz,wght@9..144,400;9..144,500;9..144,600",
  "Cormorant Garamond": ":wght@400;500;600;700",
  "Instrument Serif": "",
  "DM Serif Display": "",
  Roboto: ":wght@400;500;700",
  Archivo: ":wght@400;600;800"
};
function brandTypography(input, style = EMAIL_STYLES.material, useBrandFonts = true) {
  const defaultHeading = !useBrandFonts || /^\s*Georgia\b/i.test(input.heading_font_family);
  const heading = defaultHeading ? style.fonts.heading : input.heading_font_family;
  const body = !useBrandFonts || /^\s*(Helvetica Neue|Helvetica|Arial)\b/i.test(input.body_font_family) ? style.fonts.body : input.body_font_family;
  const families = [...new Set([firstFamily(heading), firstFamily(body)].filter((name) => GOOGLE_FONTS.has(name)))];
  const spec = (name) => `family=${name.replaceAll(" ", "+")}${FONT_AXES[name] ?? ":wght@400;600;700;800"}`;
  const link = families.length ? `<link href="https://fonts.googleapis.com/css2?${families.map(spec).join("&amp;")}&amp;display=swap" rel="stylesheet">` : "";
  const brandWeight = /Instrument Serif|DM Serif Display/i.test(firstFamily(heading)) ? "400" : /Fraunces|Playfair|Cormorant/i.test(firstFamily(heading)) ? "500" : "700";
  const headingWeight = style.type.headWeight || (defaultHeading ? style.fonts.headingWeight : style.key === "bold" ? "800" : brandWeight);
  return { heading, body, link, headingWeight };
}
function emailBrandTokens(input, media = {}, styleKey) {
  const key = isEmailStyle(styleKey) ? styleKey : isEmailStyle(input.email_style) ? input.email_style : BRAND_STYLE;
  const style = EMAIL_STYLES[key === BRAND_STYLE ? closestEmailStyle(input) : key];
  const styled = style.colors(brandScheme(input));
  const scheme = { ...brandScheme(input), ...styled };
  const panel = styled.panel || scheme.canvas;
  const type = brandTypography(input, style, key === BRAND_STYLE);
  const st = style.structure, ty = style.type, bt = style.button;
  const text = textColorOn(scheme.onSurface, scheme.surface);
  const muted = textColorOn(scheme.onSurfaceVariant, scheme.surface);
  const brand = {
    ...input,
    heading_font_family: type.heading,
    body_font_family: type.body,
    background_color: scheme.canvas,
    surface_color: scheme.surface,
    text_color: text,
    muted_text_color: muted,
    accent_color: scheme.accent
  };
  const company = escapeHtml2(brand.company_name || "{{company_name}}");
  const website = brand.website_url ? `<a href="${escapeHtml2(brand.website_url)}" style="color:inherit;text-decoration:underline">Website</a>` : "";
  const companyAddress = `${company}${brand.footer_address ? ` \xB7 ${escapeHtml2(brand.footer_address)}` : ""}`;
  const artBase = media.art_base_url || DEFAULT_ART_BASE_URL;
  const artColors = { primary_color: scheme.band, accent_color: scheme.accent, surface_color: scheme.surface, background_color: scheme.container };
  const art = Object.fromEntries(BRAND_ART_STYLES.map((style2) => [`brand.art_${style2.replaceAll("-", "_")}_url`, brandArtUrl(style2, artColors, artBase)]));
  return {
    "brand.primary_color": scheme.brand,
    "brand.on_primary_color": scheme.onBrand,
    "brand.on_primary_muted_color": mixHex(scheme.onBrand, scheme.brand, 0.35),
    "brand.primary_text_color": textColorOn(scheme.brandText, scheme.surface),
    "brand.primary_color_deep": scheme.band,
    "brand.primary_tint_color": scheme.container,
    "brand.on_primary_tint_color": scheme.onContainer,
    "brand.accent_color": scheme.accent,
    "brand.on_accent_color": scheme.onAccent,
    "brand.accent_text_color": textColorOn(scheme.accent, scheme.surface),
    "brand.accent_tint_color": scheme.accentContainer,
    "brand.on_accent_tint_color": scheme.onAccentContainer,
    "brand.band_color": scheme.band,
    "brand.on_band_color": scheme.onBand,
    "brand.on_band_muted_color": scheme.onBandMuted,
    "brand.accent_on_band_color": textColorOn(scheme.accentOnBand, scheme.band),
    "brand.background_color": scheme.canvas,
    "brand.surface_color": scheme.surface,
    "brand.text_color": text,
    "brand.muted_text_color": muted,
    "brand.background_text_color": textColorOn(scheme.onSurface, scheme.canvas),
    "brand.background_muted_text_color": textColorOn(scheme.onSurfaceVariant, scheme.canvas),
    "brand.footer_text_color": textColorOn(scheme.onSurfaceVariant, scheme.canvas),
    "brand.line_color": scheme.outline,
    "brand.dark_background_color": scheme.darkCanvas,
    "brand.dark_surface_color": scheme.darkSurface,
    "brand.on_dark_color": scheme.onDark,
    "brand.on_dark_muted_color": textColorOn(scheme.onDarkMuted, scheme.darkSurface),
    "brand.accent_on_dark_color": textColorOn(scheme.accentOnDark, scheme.darkSurface),
    "brand.heading_font_family": type.heading,
    "brand.body_font_family": type.body,
    "brand.heading_weight": type.headingWeight,
    "brand.font_head": type.link,
    "brand.company_name": company,
    "brand.logo_block": brandHeaderHtml(brand, text),
    "brand.dark_logo_block": brandHeaderHtml(brand, scheme.onDark),
    "brand.primary_logo_block": brandHeaderHtml(brand, scheme.onBrand),
    "brand.band_logo_block": brandHeaderHtml(brand, scheme.onBand),
    "brand.footer_block": `${companyAddress}<br><a href="{{unsubscribe_url}}" style="color:inherit;text-decoration:underline">Unsubscribe</a>${website ? ` \xB7 ${website}` : ""}`,
    "brand.product_footer_block": `${companyAddress}${website ? ` \xB7 ${website}` : ""}`,
    // Style: structure and type, resolved like colors so one layout can wear any style.
    "brand.s_key": key,
    "brand.s_canvas": scheme.canvas,
    "brand.s_card_bg": st.card ? scheme.surface : scheme.canvas,
    "brand.s_card_radius": String(st.cardRadius),
    "brand.s_card_border": st.cardBorder ? `1px solid ${scheme.outline}` : "0",
    "brand.s_panel_bg": panel,
    "brand.s_panel_text_color": textColorOn(scheme.onSurface, panel),
    "brand.s_panel_muted_color": textColorOn(scheme.onSurfaceVariant, panel),
    "brand.s_panel_radius": String(st.panelRadius),
    "brand.s_align": st.align,
    "brand.s_pad_x": String(st.padX),
    "brand.s_image_inset": String(st.imageInset),
    "brand.s_image_radius": String(st.imageRadius),
    "brand.s_masthead_rule": st.masthead ? `1px solid ${text}` : "0",
    "brand.s_masthead_pad": st.masthead ? "16" : "0",
    "brand.s_logo_align": st.masthead ? "center" : st.align,
    "brand.s_head_case": ty.case,
    "brand.s_head_tracking": ty.tracking,
    "brand.s_head_lh": String(ty.lineHeight),
    "brand.s_hero_size": String(ty.hero),
    "brand.s_title_size": String(ty.title),
    "brand.s_small_size": String(ty.small),
    "brand.s_eyebrow_tracking": ty.eyebrowTracking,
    "brand.s_eyebrow_case": ty.eyebrowCase,
    "brand.s_btn_radius": String(bt.radius),
    "brand.s_btn_bg": bt.outline ? "transparent" : scheme.brand,
    "brand.s_btn_fg": bt.outline ? text : scheme.onBrand,
    "brand.s_btn_border": bt.outline ? `1.5px solid ${text}` : "0",
    "brand.s_btn_case": bt.case,
    "brand.s_btn_tracking": bt.tracking,
    "brand.s_btn_size": String(bt.size),
    "brand.s_btn_pad": bt.pad,
    ...art,
    "brand.hero_image_url": media.hero_image_url ? media.hero_image_url.replaceAll('"', "%22").replaceAll("<", "%3C").replaceAll(">", "%3E") : art["brand.art_horizon_url"]
  };
}
var BRAND_TOKEN = /\{\{\s*(brand\.[a-z_]+)\s*\}\}/g;
function applyEmailBrandTokens(text, tokens) {
  return text.replace(BRAND_TOKEN, (match, key) => tokens[key] ?? match);
}

// ../../../../../../../../private/tmp/claude-501/-Users-tgloureiro-Documents-mba-mba--claude-worktrees-email-templates-redesign-bae5d9/a4acafcb-4610-4a3b-a33b-39e95313b7db/scratchpad/bangerverse/templates/lib/entry.ts
var DEFAULTS = { primary_color: "#1f2933", accent_color: "#2f6fed", background_color: "#f4f5f7", surface_color: "#ffffff", text_color: "#171a1f", muted_text_color: "#5f6b7a", heading_font_family: "Georgia, 'Times New Roman', serif", body_font_family: "Helvetica Neue, Helvetica, Arial, sans-serif" };
function brandTokens(brand, media = {}, style) {
  const clean = Object.fromEntries(Object.entries(brand).filter(([, value]) => typeof value === "string" && value.trim()));
  return emailBrandTokens({ ...DEFAULTS, ...clean }, media, style);
}
var applyBrandTokens = applyEmailBrandTokens;
export {
  applyBrandTokens,
  brandTokens
};
