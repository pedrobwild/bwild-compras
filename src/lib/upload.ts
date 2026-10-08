import { toast } from "sonner";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, BUCKET } from "@/integrations/supabase/client";
import { sanitizeFileName } from "@/lib/format";

export const ACCEPT = ".pdf,.dwg,.jpg,.jpeg,.png,.xlsx";
export const MAX_BYTES = 50 * 1024 * 1024;

/** Envia um arquivo ao bucket com progresso e registra em solicitacao_anexos. */
export async function uploadAnexo(solicitacaoId: string, file: File, onProgress: (pct: number) => void) {
  if (file.size > MAX_BYTES) throw new Error(`${file.name} excede 50 MB`);
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada");
  const path = `${solicitacaoId}/${Date.now()}-${sanitizeFileName(file.name)}`;
  const encoded = path.split("/").map(encodeURIComponent).join("/");

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encoded}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", SUPABASE_PUBLISHABLE_KEY);
    xhr.setRequestHeader("x-upsert", "false");
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Falha ao enviar ${file.name}`)));
    xhr.onerror = () => reject(new Error(`Falha de rede ao enviar ${file.name}`));
    xhr.send(file);
  });

  const { error } = await supabase.from("solicitacao_anexos").insert({
    solicitacao_id: solicitacaoId,
    nome_arquivo: file.name,
    storage_path: path,
    tamanho_bytes: file.size,
    tipo_mime: file.type || null,
  });
  if (error) throw error;
  onProgress(100);
}

/** Envia um anexo de cotação ao bucket (sem registrar em solicitacao_anexos) e devolve o path. */
export async function uploadArquivoCotacao(solicitacaoId: string, cotacaoId: string, file: File) {
  if (file.size > MAX_BYTES) throw new Error(`${file.name} excede 50 MB`);
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada");
  const path = `${solicitacaoId}/cotacoes/${cotacaoId}/${Date.now()}-${sanitizeFileName(file.name)}`;
  const encoded = path.split("/").map(encodeURIComponent).join("/");

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encoded}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", SUPABASE_PUBLISHABLE_KEY);
    xhr.setRequestHeader("x-upsert", "false");
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Falha ao enviar ${file.name}`)));
    xhr.onerror = () => reject(new Error(`Falha de rede ao enviar ${file.name}`));
    xhr.send(file);
  });
  return path;
}

export async function signedUrl(path: string, download?: string) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600, download ? { download } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Abre (ou baixa) um arquivo do bucket. Chame direto no clique.
 * A aba é aberta antes de buscar o link: o Safari/iPhone bloqueia como pop-up
 * qualquer window.open feito depois de um await, e o botão "não fazia nada".
 */
export async function abrirArquivo(path: string, download?: string) {
  const aba = download ? null : window.open("", "_blank");
  try {
    const url = await signedUrl(path, download);
    if (download) {
      // O link assinado com download responde como anexo: baixa sem sair da página.
      window.location.assign(url);
    } else if (aba) {
      aba.opener = null;
      aba.location.href = url;
    } else {
      // Pop-up bloqueado: oferece o link (o toque no botão libera a nova aba) sem sair do app.
      toast("Arquivo pronto", {
        duration: 15000,
        action: { label: "Abrir", onClick: () => window.open(url, "_blank", "noopener") },
      });
    }
  } catch (e) {
    aba?.close();
    throw e;
  }
}
