/**
 * Converte um manual em Markdown num PDF de texto simples (uma seção `### ...` por página).
 * Serve para gerar PDFs de exemplo/teste sem versionar manuais reais (que têm direitos autorais).
 */
import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";

const PAGE = { width: 595, height: 842, margin: 50 }; // A4 em pontos
const FONT_SIZE = 10;
const LINE_HEIGHT = 14;

function toPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\s)_(.+?)_(?=\s|$|[.,;:)])/g, "$1$2")
    .replace(/\$([^$]+)\$/g, (_, expr: string) => expr.replace(/\\cdot/g, "·").replace(/_(\w)/g, "$1"))
    .replace(/^---$/gm, "")
    .replace(/^(\s*)- /gm, "$1• ");
}

/** Troca caracteres fora do WinAnsi (fonte padrão do PDF) por equivalentes seguros. */
function sanitize(text: string, font: PDFFont): string {
  return [...text]
    .map((char) => {
      try {
        font.encodeText(char);
        return char;
      } catch {
        return "?";
      }
    })
    .join("");
}

function wrap(line: string, font: PDFFont, maxWidth: number): string[] {
  const indent = /^\s*/.exec(line)?.[0] ?? "";
  const words = line.trim().split(/\s+/);
  const lines: string[] = [];
  let current = indent;
  for (const word of words) {
    const candidate = current.trim() ? `${current} ${word}` : `${indent}${word}`;
    if (font.widthOfTextAtSize(candidate, FONT_SIZE) > maxWidth && current.trim()) {
      lines.push(current);
      current = `${indent}  ${word}`;
    } else {
      current = candidate;
    }
  }
  lines.push(current);
  return lines;
}

export async function markdownToPdf(markdown: string, title = "Manual de Serviço"): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const maxWidth = PAGE.width - PAGE.margin * 2;

  // Cada seção de nível 3 (### ...) começa numa página nova, como os capítulos de um manual.
  const sections = markdown.split(/^(?=### )/m).filter((section) => section.trim());

  for (const section of sections) {
    let page = pdf.addPage([PAGE.width, PAGE.height]);
    let y = PAGE.height - PAGE.margin;
    const lines = toPlainText(section)
      .split("\n")
      .flatMap((line) => (line.trim() ? wrap(sanitize(line, font), font, maxWidth) : [""]));

    for (const line of lines) {
      if (y < PAGE.margin) {
        page = pdf.addPage([PAGE.width, PAGE.height]);
        y = PAGE.height - PAGE.margin;
      }
      if (line) page.drawText(line, { x: PAGE.margin, y, size: FONT_SIZE, font });
      y -= LINE_HEIGHT;
    }
  }

  return pdf.save();
}
