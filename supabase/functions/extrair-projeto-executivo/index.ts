// Edge Function: extrair-projeto-executivo
// Recebe o texto do projeto executivo (extraído no navegador, página a página),
// identifica dados da obra e itens de compra com IA e devolve JSON para validação.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CATEGORIAS = [
  "Marcenaria", "Ferragens", "Revestimentos e pisos", "Pintura", "Iluminação",
  "Elétrica", "Hidráulica", "Louças e metais", "Bancadas e pedras", "Vidros e box",
  "Portas e esquadrias", "Eletrodomésticos", "Climatização", "Mobiliário",
  "Cortinas e persianas", "Decoração", "Acessórios de banheiro", "Drywall e gesso", "Outros",
];

const MAX_CHARS = 90_000;

type Pagina = { numero: number; texto: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// Limpa ruído típico de prancha: cotas soltas, carimbo repetido, dados pessoais
function limparPagina(texto: string): string {
  const linhas: string[] = [];
  for (const bruta of texto.split(/\r?\n/)) {
    const l = bruta.replace(/\s+/g, " ").trim();
    if (!l) continue;
    if (/^[\d\s,.xX/*+\-]+$/.test(l)) continue; // só números/cotas
    if (/^(RESPONSÁVEL TÉCNICO|TODAS AS MEDIDAS DEVEM|CONTEÚDO:|REVISÃO:|FOLHA:|ARQUITETO:|DATA:)$/i.test(l)) continue;
    linhas.push(l);
  }
  let out = linhas.join(" | ");
  out = out.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF removido]");
  out = out.replace(/RESPONSÁVEL TÉCNICO:[^|]*\|?/gi, "").replace(/TODAS AS MEDIDAS DEVEM SER CONFERIDAS[^|]*\|?/gi, "");
  return out.trim();
}

const SCHEMA = {
  name: "extracao_projeto_executivo",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["obra", "itens", "nao_comprar", "avisos"],
    properties: {
      obra: {
        type: "object",
        additionalProperties: false,
        required: ["cliente", "empreendimento", "unidade", "endereco", "area_m2", "prazo_obra", "data_projeto", "revisao", "arquiteto"],
        properties: {
          cliente: { type: ["string", "null"] },
          empreendimento: { type: ["string", "null"] },
          unidade: { type: ["string", "null"] },
          endereco: { type: ["string", "null"] },
          area_m2: { type: ["number", "null"] },
          prazo_obra: { type: ["string", "null"] },
          data_projeto: { type: ["string", "null"], description: "dd/mm/aaaa" },
          revisao: { type: ["string", "null"] },
          arquiteto: { type: ["string", "null"] },
        },
      },
      itens: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["descricao", "categoria", "quantidade", "unidade", "ambiente", "especificacao", "referencia_projeto", "link_referencia", "observacao", "confianca"],
          properties: {
            descricao: { type: "string" },
            categoria: { type: "string", enum: CATEGORIAS },
            quantidade: { type: ["number", "null"] },
            unidade: { type: "string", enum: ["un", "m²", "m", "m³", "kg", "cx", "pç", "rolo", "galão", "lata", "saco", "jogo", "kit", "conj", "vb"] },
            ambiente: { type: ["string", "null"], description: "Cozinha | Banho | Dormitório/Estar | Terraço | Área de serviço | Área técnica | Geral" },
            especificacao: { type: ["string", "null"] },
            referencia_projeto: { type: ["string", "null"] },
            link_referencia: { type: ["string", "null"] },
            observacao: { type: ["string", "null"] },
            confianca: { type: "string", enum: ["alta", "media", "baixa"] },
          },
        },
      },
      nao_comprar: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["descricao", "motivo", "ambiente", "referencia_projeto"],
          properties: {
            descricao: { type: "string" },
            motivo: { type: "string" },
            ambiente: { type: ["string", "null"], description: "Cozinha | Banho | Dormitório/Estar | Terraço | Área de serviço | Área técnica | Geral | null se incerto" },
            referencia_projeto: { type: ["string", "null"] },
          },
        },
      },
      avisos: { type: "array", items: { type: "string" } },
    },
  },
};


// Marcenaria é comprada como um pacote único (contrato com o marceneiro):
// consolida qualquer item de marcenaria ou ferragem de marcenaria em 1 item "Marcenaria".
type Item = {
  descricao: string; categoria: string; quantidade: number | null; unidade: string; ambiente: string | null;
  especificacao: string | null; referencia_projeto: string | null; link_referencia: string | null;
  observacao: string | null; confianca: string;
};
const RE_FERRAGEM_MARCENARIA = /(puxador|tip[- ]?on|krok|cabideiro|corredi[çc]a|dobradi[çc]a|amortecedor|fecho toque|push)/i;

function ehMarcenaria(i: Item): boolean {
  if (i.categoria === "Marcenaria") return true;
  if (i.categoria === "Ferragens") {
    const ref = `${i.referencia_projeto ?? ""} ${i.observacao ?? ""}`;
    return /marcenaria/i.test(ref) || RE_FERRAGEM_MARCENARIA.test(i.descricao);
  }
  return false;
}

function unicos(lista: (string | null | undefined)[]): string[] {
  const vistos = new Set<string>(); const out: string[] = [];
  for (const v of lista) {
    const t = (v ?? "").trim(); if (!t) continue;
    const k = t.toLowerCase(); if (vistos.has(k)) continue;
    vistos.add(k); out.push(t);
  }
  return out;
}

function consolidarMarcenaria(itens: Item[]): Item[] {
  const grupo = itens.filter(ehMarcenaria);
  if (!grupo.length) return itens;
  const principal = grupo.find((i) => /^marcenaria$/i.test(i.descricao.trim()));
  const ambientes = unicos(grupo.map((i) => i.ambiente));
  const folhas = unicos(grupo.flatMap((i) => (i.referencia_projeto ?? "").match(/\d{1,2}/g) ?? [])).map(Number).sort((a, b) => a - b);
  const refFolhas = folhas.length
    ? (folhas.length === 1 ? `Folha ${String(folhas[0]).padStart(2, "0")} – Marcenaria` : `Folhas ${folhas.map((f) => String(f).padStart(2, "0")).join(", ")} – Marcenaria`)
    : null;
  // detalhe da marcenaria fica no projeto: sem lista de móveis
  let espec = principal?.especificacao?.trim() || "";
  if (espec.length > 160) espec = espec.slice(0, 157) + "...";
  const consolidado: Item = {
    descricao: "Marcenaria",
    categoria: "Marcenaria",
    quantidade: 1,
    unidade: "vb",
    ambiente: ambientes.length === 1 ? ambientes[0] : "Geral",
    especificacao: espec || null,
    referencia_projeto: principal?.referencia_projeto?.trim() || refFolhas,
    link_referencia: null,
    observacao: unicos(grupo.map((i) => i.observacao)).join(" | ") || null,
    confianca: "alta",
  };
  const pos = itens.findIndex(ehMarcenaria);
  const resto = itens.filter((i) => !ehMarcenaria(i));
  resto.splice(Math.min(pos, resto.length), 0, consolidado);
  return resto;
}

// Rede de segurança: "Fornecimento/Cortesia Bwild" = a Bwild compra. Se a IA mandar para "não comprar", devolve para os itens.
const RE_BWILD = /(fornecimento|cortesia)\s+bwild/i;
const MAPA_CATEGORIA: [RegExp, string][] = [
  [/(tv|televis|geladeira|refrigerador|cooktop|micro-?ondas|forno|fryer|purificador|lava|secadora|coifa|depurador|frigobar)/i, "Eletrodomésticos"],
  [/(ar[- ]condicionado|split|evaporadora|condensadora)/i, "Climatização"],
  [/(cadeira|mesa|sof[aá]|colch[aã]o|box ba[uú]|cama|poltrona|banqueta|rack|estante)/i, "Mobiliário"],
  [/(cortina|persiana)/i, "Cortinas e persianas"],
  [/(assento|bacia|vaso|cuba|torneira|chuveiro|ducha|misturador|registro)/i, "Louças e metais"],
  [/(toalheiro|papeleira|cabide|porta shampoo|porta toalha|acess[oó]rio)/i, "Acessórios de banheiro"],
  [/(lumin[aá]ria|spot|pendente|trilho|led|abajur)/i, "Iluminação"],
  [/(fechadura|porta)/i, "Portas e esquadrias"],
  [/(quadro|espelho|vaso decorativo|tapete|almofada|planta|decora)/i, "Decoração"],
];
function categoriaPorNome(nome: string): string {
  for (const [re, cat] of MAPA_CATEGORIA) if (re.test(nome)) return cat;
  return "Outros";
}
function recuperarFornecimentoBwild(res: { itens: Item[]; nao_comprar: { descricao: string; motivo: string; referencia_projeto: string | null }[] }) {
  const manter: typeof res.nao_comprar = [];
  for (const n of res.nao_comprar ?? []) {
    const texto = `${n.motivo ?? ""} ${n.descricao ?? ""}`;
    if (!RE_BWILD.test(texto) || /construtora|existente|aproveit/i.test(texto)) { manter.push(n); continue; }
    const m = n.descricao.match(/\(?\s*(\d{1,3})\s*(unidades?|un\b|p[cç]s?|pe[cç]as?)\s*\)?/i);
    const qtd = m ? Number(m[1]) : 1;
    const descricao = n.descricao.replace(/\s*\(\s*\d{1,3}\s*(unidades?|un|p[cç]s?|pe[cç]as?)\s*\)\s*/i, " ").trim();
    res.itens.push({
      descricao, categoria: categoriaPorNome(descricao), quantidade: qtd, unidade: "un", ambiente: null,
      especificacao: null, referencia_projeto: n.referencia_projeto ?? null, link_referencia: null,
      observacao: (n.motivo.match(RE_BWILD)?.[0] ?? "Fornecimento Bwild").replace(/^./, (c) => c.toUpperCase()),
      confianca: "media",
    });
  }
  res.nao_comprar = manter;
}

// "Não comprar": só remove notas repetidas (a lista é de apoio; o detalhe fica no projeto)
const norm = (t: string | null | undefined) => (t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const IGNORAR = new Set(["aproveitamento", "aproveitar", "existente", "existentes", "entregue", "entregues", "construtora", "pela", "todos", "todas", "conforme", "manter", "area", "para"]);
const chave = (t: string) => new Set(norm(t).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !IGNORAR.has(w)));
function revisarNaoComprar(res: { nao_comprar: { descricao: string; motivo: string; ambiente?: string | null; referencia_projeto: string | null }[]; avisos: string[] }) {
  const lista = res.nao_comprar;
  const remover = new Set<number>();
  lista.forEach((n, i) => {
    const kn = chave(n.descricao);
    lista.forEach((m, j) => {
      if (i === j || remover.has(i) || remover.has(j)) return;
      const km = chave(m.descricao);
      if ([...kn].every((w) => km.has(w)) && (kn.size < km.size || i > j)) remover.add(i);
    });
  });
  res.nao_comprar = lista.filter((_, i) => !remover.has(i));
  res.avisos = (res.avisos ?? []).slice(0, 5);
}

// Peças que já estão dentro de um kit listado (ex.: "Kit acessórios 6 peças: papeleira, porta toalha...") saem da lista
function removerPecasDeKit(itens: Item[]): Item[] {
  const kits = itens.filter((i) => /\b(kit|conjunto|jogo)\b/i.test(i.descricao) && (i.especificacao ?? "").length > 0);
  if (!kits.length) return itens;
  return itens.filter((i) => {
    if (kits.includes(i)) return true;
    const d = norm(i.descricao).trim();
    if (d.length < 5) return true;
    return !kits.some((k) => k.categoria === i.categoria && norm(k.especificacao).includes(d));
  });
}

const INSTRUCOES = `Você é comprador de uma empresa de reformas de interiores (apartamentos compactos em São Paulo).
Recebe o TEXTO extraído de um projeto executivo em PDF, folha por folha ("FOLHA NN"). O texto vem de pranchas: fragmentado, com cotas soltas. Reconstrua o sentido.

OBJETIVO: a LISTA DO QUE PRECISA SER COMPRADO. Detalhes técnicos serão consultados no próprio projeto; não detalhe além do necessário para identificar o item.

REGRAS
1. Liste tudo o que precisa ser comprado ou contratado: acabamentos (tinta, revestimento, piso, rodapé, rejunte), louças e metais, bancadas, soleiras e bits, iluminação, infraestrutura e material elétrico/hidráulico citados com quantidade ou metragem (ex.: tubulação frigorígena do ar-condicionado, mangueira, tubo de passagem), box e vidros, portas e fechaduras, eletrodomésticos, ar-condicionado, mobiliário, colchão, cortinas, acessórios de banheiro, decoração e marcenaria. Não deixe nenhum item comprável de fora.
2. MARCENARIA = 1 ÚNICO ITEM: descricao "Marcenaria", categoria "Marcenaria", quantidade 1, unidade "vb", ambiente "Geral", especificacao null, referencia_projeto com as folhas de marcenaria. Ferragens, puxadores, painéis, nichos e carenagens do marceneiro fazem parte dela e não viram itens separados.
3. "FORNECIMENTO BWILD" e "CORTESIA BWILD" = a Bwild compra: sempre em "itens", com observacao "Fornecimento Bwild" ou "Cortesia Bwild".
4. "NOVO/NOVA X" ou "REMOÇÃO DE X" = X entra na compra. Só fica fora o que o projeto manda manter ou aproveitar (existente, aproveitamento, entregue pela construtora).
5. descricao: nome curto e reconhecível do item, com marca/modelo/cor quando constar (ex.: "Piso vinílico Trevi Linha Vita", "Geladeira Consul 333L inox").
6. especificacao: no máximo uma linha curta com o essencial que não coube na descrição (medida, voltagem). Se não houver, null.
7. quantidade: a do projeto (quadros, "02 unidades", "total para compra"); revestimento/piso com quebra. Sem quantidade no projeto: null e confianca "media".
8. referencia_projeto: só "Folha NN". link_referencia: URL se constar, senão null. ambiente: Cozinha, Banho, Dormitório/Estar, Terraço, Área de serviço, Área técnica ou Geral.
9. observacao: só condicionante de compra relevante (ex.: "verificar voltagem", "medir no local", "Fornecimento Bwild"). Senão null.
10. confianca: "alta" se item e quantidade estão claros; "media" se inferiu; "baixa" se ambíguo.
11. Um item por produto: não duplique o mesmo produto citado em várias folhas. Se o projeto indica um KIT/CONJUNTO (ex.: "kit acessórios 6 peças"), liste só o kit; as peças que fazem parte dele não viram itens separados.
12. nao_comprar: lista curta do que o projeto manda aproveitar, uma linha por nota, sem repetir; ambiente null se não tiver certeza.
13. avisos: no máximo 5 frases curtas que afetam a compra (verificar voltagem, medir no local, infra do prédio).
14. obra: dados da capa/carimbo (proprietário = cliente); area_m2 como número.
Português do Brasil. Não invente itens que não estão no texto.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Faça login para usar a leitura do projeto." }, 401);

  let body: { nome_arquivo?: string; paginas?: Pagina[] };
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const paginas = (body.paginas ?? []).filter((p) => p && typeof p.texto === "string");
  if (!paginas.length) return json({ error: "Nenhum texto recebido. O PDF pode ser apenas imagem (escaneado)." }, 400);

  let texto = paginas
    .map((p) => `===== FOLHA ${String(p.numero).padStart(2, "0")} =====\n${limparPagina(p.texto)}`)
    .join("\n\n");
  const truncado = texto.length > MAX_CHARS;
  if (truncado) texto = texto.slice(0, MAX_CHARS);

  if (texto.replace(/=+ FOLHA \d+ =+/g, "").trim().length < 200) {
    return json({ error: "O PDF não tem texto suficiente para leitura automática (provavelmente é escaneado). Preencha os itens manualmente." }, 422);
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json({ error: "Leitura automática indisponível: configure o segredo OPENAI_API_KEY nas Edge Functions do Supabase." }, 503);
  const modelo = Deno.env.get("EXTRACAO_MODEL") ?? "gpt-4.1";

  const { data: ext } = await supabase.from("extracoes_projeto").insert({
    usuario_id: userData.user.id, nome_arquivo: body.nome_arquivo ?? null,
    paginas: paginas.length, caracteres: texto.length, modelo,
  }).select("id").single();
  const extracaoId = ext?.id ?? null;

  const t0 = Date.now();
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelo,
        temperature: 0.1,
        response_format: { type: "json_schema", json_schema: SCHEMA },
        messages: [
          { role: "system", content: INSTRUCOES },
          { role: "user", content: `Arquivo: ${body.nome_arquivo ?? "projeto.pdf"}\nTotal de folhas: ${paginas.length}\n\n${texto}` },
        ],
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error?.message ?? `OpenAI HTTP ${resp.status}`);
    const conteudo = data.choices?.[0]?.message?.content;
    const resultado = JSON.parse(conteudo);
    resultado.itens = resultado.itens ?? [];
    resultado.nao_comprar = resultado.nao_comprar ?? [];
    recuperarFornecimentoBwild(resultado);
    resultado.itens = removerPecasDeKit(consolidarMarcenaria(resultado.itens));
    resultado.avisos = resultado.avisos ?? [];
    revisarNaoComprar(resultado);
    if (truncado) resultado.avisos.unshift("O projeto é muito extenso; parte final do texto não foi lida. Confira as últimas folhas.");

    const uso = { tokens_entrada: data.usage?.prompt_tokens ?? null, tokens_saida: data.usage?.completion_tokens ?? null };
    if (extracaoId) {
      await supabase.from("extracoes_projeto").update({
        status: "concluida", resultado, duracao_ms: Date.now() - t0, ...uso,
      }).eq("id", extracaoId);
    }
    return json({ extracao_id: extracaoId, modelo, paginas: paginas.length, ...uso, resultado });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (extracaoId) await supabase.from("extracoes_projeto").update({ status: "erro", erro: msg, duracao_ms: Date.now() - t0 }).eq("id", extracaoId);
    return json({ error: "Falha na leitura automática do projeto: " + msg, extracao_id: extracaoId }, 502);
  }
});
