// v2 - SearchAPI.io integration
const Anthropic = require('@anthropic-ai/sdk');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { handle, nome } = req.body;
  if (!handle) return res.status(400).json({ error: 'Handle não informado' });

  const slug = handle.replace('@', '').trim();

  let resumoAnuncios = null;
  let totalAnuncios = 0;
  let paginaEncontrada = `@${slug}`;

  try {
    // Passo 1: resolve handle -> page_id via Graph API básica
    const appToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
    const pageRes = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(slug)}?fields=id,name&access_token=${appToken}`
    );
    const pageData = await pageRes.json();

    if (pageData.id) {
      const pageId = pageData.id;
      paginaEncontrada = pageData.name || `@${slug}`;

      // Passo 2: busca anúncios via SearchAPI.io
      const searchUrl = `https://www.searchapi.io/api/v1/search?engine=meta_ad_library&page_id=${pageId}&ad_type=all&country=ALL&api_key=${process.env.SEARCHAPI_KEY}`;
      const searchRes = await fetch(searchUrl);
      const searchData = await searchRes.json();

      const ads = searchData.ads || [];
      if (ads.length > 0) {
        totalAnuncios = ads.length;
        resumoAnuncios = ads.slice(0, 15).map((ad, i) => {
          const body = ad.ad_creative_bodies?.join(' | ') || ad.body || ad.description || 'Sem texto';
          const title = ad.ad_creative_link_titles?.join(' | ') || ad.title || '';
          const platforms = ad.publisher_platforms?.join(', ') || ad.platforms?.join(', ') || '';
          const startDate = ad.ad_delivery_start_time || ad.start_date || '';
          return `ANÚNCIO ${i + 1}\nPlataformas: ${platforms}\nData: ${startDate}\nTexto: ${body}\nTítulo: ${title}`;
        }).join('\n\n---\n\n');
      }
    }
  } catch (e) {
    console.error('Erro ao buscar anúncios:', e.message);
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let prompt;

  if (resumoAnuncios) {
    prompt = `Você é Eduardo Schuman, especialista em tráfego pago exclusivamente para clínicas de estética há 6 anos. Antes do marketing, trabalhou 10 anos como vendedor. Sabe exatamente o que funciona e o que não funciona em anúncios para esse nicho.

Analise os anúncios reais abaixo da clínica @${slug} (${paginaEncontrada}) e gere um diagnóstico profissional e personalizado.

ANÚNCIOS ATIVOS ENCONTRADOS (${totalAnuncios} anúncios):
${resumoAnuncios}

INSTRUÇÕES:
- Seja específico: cite o texto REAL dos anúncios ao apontar problemas
- Identifique entre 4 e 7 problemas reais
- Para cada problema, cite o trecho exato do anúncio que ilustra o problema
- Seja direto e técnico, sem enrolação
- No final, gere uma tabela de prioridades com 5 ações concretas

RESPONDA APENAS COM ESTE JSON (sem markdown, sem \`\`\`):
{
  "pagina": "${paginaEncontrada}",
  "total_anuncios": ${totalAnuncios},
  "problemas": [
    { "numero": 1, "titulo": "título curto do problema", "descricao": "explicação detalhada citando o texto real do anúncio" }
  ],
  "prioridades": [
    { "nivel": "Alta", "acao": "ação recomendada" }
  ]
}`;
  } else {
    prompt = `Você é Eduardo Schuman, especialista em tráfego pago exclusivamente para clínicas de estética há 6 anos. Antes do marketing, trabalhou 10 anos como vendedor.

A clínica @${slug} solicitou um diagnóstico. Não foi possível acessar os anúncios específicos dela, mas com base na sua experiência com dezenas de clínicas de estética, gere um diagnóstico dos erros mais comuns nesse mercado.

INSTRUÇÕES:
- Escreva diretamente para o gestor da clínica
- Identifique entre 5 e 6 problemas reais e frequentes em clínicas de estética
- Para cada problema, dê um exemplo concreto de como esse erro aparece nos anúncios
- Não diga que analisou os anúncios específicos da clínica
- Seja direto, técnico, sem enrolação
- No final, gere uma tabela de prioridades com 5 ações concretas

RESPONDA APENAS COM ESTE JSON (sem markdown, sem \`\`\`):
{
  "pagina": "@${slug}",
  "total_anuncios": 0,
  "problemas": [
    { "numero": 1, "titulo": "título curto do problema", "descricao": "explicação detalhada com exemplo concreto de como esse erro aparece em anúncios de clínicas de estética" }
  ],
  "prioridades": [
    { "nivel": "Alta", "acao": "ação recomendada e específica para clínicas de estética" }
  ]
}`;
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });

    const raw = message.content[0].text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const diagnostico = JSON.parse(raw);
    return res.status(200).json({ tipo: 'diagnostico', ...diagnostico });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro interno', detalhe: err.message });
  }
};
