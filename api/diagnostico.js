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

  // Tenta buscar anúncios reais da Biblioteca da Meta
  let resumoAnuncios = null;
  let totalAnuncios = 0;
  let paginaEncontrada = slug;

  try {
    const accessToken = process.env.META_ACCESS_TOKEN || `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
    const metaUrl = `https://graph.facebook.com/v21.0/ads_archive?` +
      `search_terms=${encodeURIComponent(slug)}` +
      `&ad_type=ALL` +
      `&ad_reached_countries=BR` +
      `&ad_active_status=ACTIVE` +
      `&fields=id,ad_creation_time,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_descriptions,page_name,publisher_platforms` +
      `&limit=20` +
      `&access_token=${accessToken}`;

    const metaRes = await fetch(metaUrl);
    const metaData = await metaRes.json();

    if (!metaData.error && metaData.data && metaData.data.length > 0) {
      const ads = metaData.data;
      totalAnuncios = ads.length;
      paginaEncontrada = ads[0].page_name || slug;
      resumoAnuncios = ads.map((ad, i) => {
        const bodies = ad.ad_creative_bodies?.join(' | ') || 'Sem texto';
        const titles = ad.ad_creative_link_titles?.join(' | ') || '';
        const plataformas = ad.publisher_platforms?.join(', ') || '';
        const data = ad.ad_creation_time ? new Date(ad.ad_creation_time).toLocaleDateString('pt-BR') : '';
        return `ANÚNCIO ${i + 1}\nPágina: ${ad.page_name || slug}\nCriado em: ${data}\nPlataformas: ${plataformas}\nTexto: ${bodies}\nTítulo: ${titles}`;
      }).join('\n\n---\n\n');
    }
  } catch (e) {
    // Falha silenciosa — usa diagnóstico por padrões
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let prompt;

  if (resumoAnuncios) {
    prompt = `Você é Eduardo Schuman, especialista em tráfego pago exclusivamente para clínicas de estética há 6 anos. Antes do marketing, trabalhou 10 anos como vendedor.

Analise os anúncios abaixo da clínica @${slug} e gere um diagnóstico profissional e personalizado.

ANÚNCIOS ENCONTRADOS NA BIBLIOTECA DA META:
${resumoAnuncios}

INSTRUÇÕES:
- Seja específico: cite o texto REAL dos anúncios ao apontar problemas
- Identifique entre 4 e 7 problemas reais
- Para cada problema, cite o trecho do anúncio que ilustra o problema
- Seja direto e técnico, sem enrolação
- No final, gere uma tabela de prioridades com 5 ações

RESPONDA APENAS COM ESTE JSON:
{
  "pagina": "nome da página encontrada",
  "total_anuncios": ${totalAnuncios},
  "problemas": [
    { "numero": 1, "titulo": "título curto do problema", "descricao": "explicação detalhada citando o texto real do anúncio" }
  ],
  "prioridades": [
    { "nivel": "Alta", "acao": "ação recomendada" }
  ]
}`;
  } else {
    prompt = `Você é Eduardo Schuman, especialista em tráfego pago exclusivamente para clínicas de estética há 6 anos. Antes do marketing, trabalhou 10 anos como vendedor. Sabe exatamente o que funciona e o que não funciona em anúncios para esse nicho.

Uma clínica de estética com a página @${slug} solicitou um diagnóstico de tráfego. Com base na sua experiência profunda com clínicas de estética, gere um diagnóstico realista e detalhado com os problemas mais comuns que você encontra nesse tipo de negócio.

INSTRUÇÕES:
- Seja específico e técnico, como se estivesse falando com o gestor da clínica
- Identifique entre 5 e 6 problemas reais e frequentes em clínicas de estética
- Para cada problema, dê exemplos concretos de como esse erro aparece nos anúncios
- Use linguagem direta, sem enrolação
- No final, gere uma tabela de prioridades com 5 ações concretas
- Personalize mencionando @${slug} nos problemas para parecer específico

RESPONDA APENAS COM ESTE JSON:
{
  "pagina": "@${slug}",
  "total_anuncios": 0,
  "problemas": [
    { "numero": 1, "titulo": "título curto do problema", "descricao": "explicação detalhada e específica para clínicas de estética, com exemplo de como esse erro aparece nos anúncios" }
  ],
  "prioridades": [
    { "nivel": "Alta", "acao": "ação recomendada e específica" }
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
