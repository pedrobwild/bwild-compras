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
          required: ["descricao", "motivo", "referencia_projeto"],
          properties: {
            descricao: { type: "string" },
            motivo: { type: "string" },
            referencia_projeto: { type: ["string", "null"] },
          },
        },
      },
      avisos: { type: "array", items: { type: "string" } },
    },
  },
};

const INSTRUCOES = `Você é comprador técnico sênior de uma empresa de reformas de interiores (apartamentos compactos em São Paulo).
Recebe o TEXTO extraído de um projeto executivo em PDF, página por página ("FOLHA NN"). O texto vem de pranchas técnicas: fragmentado, com cotas soltas e legendas quebradas em várias linhas. Reconstrua o sentido.

TAREFA: montar a lista de compras da obra para a equipe de Compras validar.

REGRAS
1. Liste somente o que precisa ser COMPRADO ou CONTRATADO para executar o projeto: acabamentos (tinta, revestimento, piso, rodapé, rejunte), louças, metais, bancadas/pedras, soleiras, bits, iluminação, materiais elétricos citados (tomadas, interruptores, caixas), infraestrutura citada (tubulação frigorígena, mangueira, tubo), box/vidros, portas e kits, eletrodomésticos, ar-condicionado, mobiliário, colchão, cortinas, fechadura, acessórios de banheiro, decoração e MARCENARIA.
2. Marcenaria: um item por móvel/módulo (ex.: "Armário aéreo cozinha"), com acabamento/padrão (ex.: Carvalho Xingu, Sampa, Branco TXT — padrão Casa Azul), profundidade e ferragens especiais (sistema Krok, Tip-on, puxador cava/transpasse/redondo, cabideiro inox) na especificação. Ferragens especiais citadas também viram itens próprios na categoria "Ferragens". Use unidade "un" ou "conj".
3. NÃO coloque em "itens" o que o projeto diz para manter ou aproveitar ("existente", "aproveitamento", "entregue pela construtora", "manter"). Coloque esses em "nao_comprar" com o motivo.
4. Quantidade: use a do projeto (quadros de revestimento, tomadas, luminárias, "02 unidades", "TOTAL PARA COMPRA"). Para revestimento/piso prefira a quantidade que já inclui quebra. Pintura: informe a área em m² na especificação e quantidade em m² se constar. Se não houver quantidade, use null e confianca "media" ou "baixa".
5. especificacao: marca, linha, modelo, cor, dimensões, voltagem, potência, temperatura de cor. Copie exatamente do projeto.
6. referencia_projeto: "Folha NN – <assunto da folha>" (ex.: "Folha 08 – Planta de acabamentos").
7. link_referencia: URL do produto se estiver no projeto, senão null.
8. ambiente: Cozinha, Banho, Dormitório/Estar, Terraço, Área de serviço, Área técnica ou Geral.
9. observacao: condicionantes de compra do projeto (ex.: "verificar medidas in loco antes da compra", "verificar voltagem", "cortesia Bwild", "fornecimento Bwild").
10. confianca: "alta" quando descrição e quantidade estão explícitas; "media" quando você inferiu algo; "baixa" quando o texto é ambíguo.
11. Não duplique itens que aparecem em mais de uma folha (ex.: a mesma tinta citada em várias vistas = 1 item por cor).
12. avisos: alertas que Compras precisa saber antes de comprar (medir in loco, checar voltagem/infra do prédio, restrições de condomínio, prazos). Frases curtas.
13. obra: preencha com os dados da capa/carimbo (proprietário = cliente). area_m2 como número.
Escreva tudo em português do Brasil. Não invente produtos que não estão no texto.`;

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
