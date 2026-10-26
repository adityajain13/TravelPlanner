// Intl formatters are slow to construct (~0.1–1 ms each); building one per call added up to
// hundreds of ms when a trip opened. These return a shared instance per locale + options.
const dt = new Map<string, Intl.DateTimeFormat>();
const nf = new Map<string, Intl.NumberFormat>();

export function dtf(locale: string | undefined, opts: Intl.DateTimeFormatOptions) {
  const k = `${locale ?? ""}|${JSON.stringify(opts)}`;
  let f = dt.get(k);
  if (!f) dt.set(k, (f = new Intl.DateTimeFormat(locale, opts)));
  return f;
}

export function nfmt(locale: string | undefined, opts: Intl.NumberFormatOptions) {
  const k = `${locale ?? ""}|${JSON.stringify(opts)}`;
  let f = nf.get(k);
  if (!f) nf.set(k, (f = new Intl.NumberFormat(locale, opts)));
  return f;
}
