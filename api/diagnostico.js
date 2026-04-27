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
  const accessToken = process.env.META_ACCESS_TOKEN || `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;

  try {
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

    if (metaData.error) {
      return res.status(500).json({ error: 'Erro ao acessar a Biblioteca de Anúncios', detalhe: metaData.error.message });
    }

    const ads = metaData.data || [];

    if (ads.length === 0) {
      return res.status(200).json({
        tipo: 'sem_anuncios',
        mensagem: `Não encontrei anúncios ativos públicos para @${slug}. Verifique se o @ está correto e se a página tem anúncios ativos no momento.`
      });
    }

    const resumoAnuncios = ads.map((ad, i) => {
      const bodies = ad.ad_creative_bodies?.join(' | ') || 'Sem texto';
      const titles = ad.ad_creative_link_titles?.join(' | ') || '';
      const plataformas = ad.publisher_platforms?.join(', ') || '';
      const data = ad.ad_creation_time ? new Date(ad.ad_creation_time).toLocaleDateString('pt-BR') : '';
      return `ANÚNCIO ${i + 1}\nPágina: ${ad.page_name || slug}\nCriado em: ${data}\nPlataformas: ${plataformas}\nTexto: ${bodies}\nTítulo: ${titles}`;
    }).join('\n\n---\n\n');

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prompt = `Você é Eduardo Schuman, especialista em tráfego pago exclusivamente para clínicas de estética há 6 anos. Antes do marketing, trabalhou 10 anos como vendedor.

Analise os anúncios abaixo da clínica @${slug} e gere um diagnóstico profissional e personalizado.

ANÚNCIOS ENCONTRADOS:
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
  "total_anuncios": número,
  "problemas": [
    {
      "numero": 1,
      "titulo": "título curto do problema",
      "descricao": "explicação detalhada citando o texto real do anúncio"
    }
  ],
  "prioridades": [
    { "nivel": "Alta", "acao": "ação recomendada" }
  ]
}`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });

    const diagnostico = JSON.parse(message.content[0].text);
    return res.status(200).json({ tipo: 'diagnostico', ...diagnostico });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro interno', detalhe: err.message });
  }
};
