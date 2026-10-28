import { extractText, getDocumentProxy } from "unpdf";

export const isPdf = (header: Uint8Array) =>
  header.length >= 5 && Buffer.from(header.subarray(0, 5)).toString("latin1") === "%PDF-";

/** Extrai o texto de cada página (índice 0 = página 1). */
export async function extractPdfPages(data: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(data);
  try {
    const { text } = await extractText(pdf, { mergePages: false });
    return text;
  } finally {
    await pdf.loadingTask.destroy();
  }
}
