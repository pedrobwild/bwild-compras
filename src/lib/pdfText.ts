export interface PaginaTexto {
  numero: number;
  texto: string;
}

export class PdfSemTextoError extends Error {
  constructor() {
    super("Este PDF parece ser uma imagem escaneada; não foi possível ler automaticamente.");
  }
}

/** Extrai o texto de cada página do PDF no navegador, ordenado por linha. */
export async function extrairTextoPdf(
  file: File | Blob,
  onProgress?: (atual: number, total: number) => void,
): Promise<PaginaTexto[]> {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerSrc } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const paginas: PaginaTexto[] = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      onProgress?.(n, pdf.numPages);
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const linhas: { y: number; itens: { x: number; s: string }[] }[] = [];
      for (const it of content.items) {
        if (!("str" in it) || !it.str.trim()) continue;
        const x = it.transform[4] as number;
        const y = it.transform[5] as number;
        let linha = linhas.find((l) => Math.abs(l.y - y) <= 2);
        if (!linha) {
          linha = { y, itens: [] };
          linhas.push(linha);
        }
        linha.itens.push({ x, s: it.str });
      }
      linhas.sort((a, b) => b.y - a.y);
      const texto = linhas
        .map((l) => l.itens.sort((a, b) => a.x - b.x).map((i) => i.s).join(" ").replace(/\s+/g, " ").trim())
        .join("\n");
      paginas.push({ numero: n, texto });
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
  const total = paginas.reduce((a, p) => a + p.texto.length, 0);
  if (total < 40) throw new PdfSemTextoError();
  return paginas;
}
