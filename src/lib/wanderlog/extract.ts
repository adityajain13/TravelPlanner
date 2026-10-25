import type { RawItem } from "./parse";

/** Read a PDF in the browser with pdf.js (lazy-loaded; only the import screen pays for it). */
export async function extractPdf(file: File): Promise<{ pages: RawItem[][]; title?: string }> {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: RawItem[][] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const tc = await (await pdf.getPage(p)).getTextContent();
    pages.push(
      tc.items.flatMap((i) => ("str" in i ? [{ str: i.str, x: i.transform[4], y: i.transform[5], h: i.height }] : [])),
    );
  }
  const meta = await pdf.getMetadata().catch(() => null);
  const title = (meta?.info as { Title?: string } | undefined)?.Title?.replace(/\s+–\s+Wanderlog$/, "");
  return { pages, title };
}
