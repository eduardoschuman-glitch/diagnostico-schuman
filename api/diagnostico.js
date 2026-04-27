// v6 - estrutura correta SearchAPI: snapshot.body.text + two-step sem Graph API
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
    const apiKey = process.env.SEARCHAPI_KEY;

    // Passo 1: busca por nome para descobrir o page_id
    const step1Url = `https://www.searchapi.io/api/v1/search?engine=meta_ad_library&q=${encodeURIComponent(slug)}&search_type=page&ad_type=all&country=ALL&api_key=${apiKey}`;
    const step1Res = await fetch(step1Url);
    const step1Data = await step1Res.json();

    let ads = step1Data.ads || [];
    const pageId = ads[0]?.page_id || null;

    if (pageId) {
      // Passo 2: busca todos os anúncios pelo page_id (mais completo)
      const step2Url = `https://www.searchapi.io/api/v1/search?engine=meta_ad_library&page_id=${pageId}&ad_type=all&country=ALL&api_key=${apiKey}`;
      const step2Res = await fetch(step2Url);
      const step2Data = await step2Res.json();
      if ((step2Data.ads || []).length > 0) {
        ads = step2Data.ads;
      }
    }

    if (ads.length > 0) {
      // Pega o nome da página do primeiro anúncio
      paginaEncontrada = ads[0].page_name || ads[0].snapshot?.page_name || `@${slug}`;
      totalAnuncios = ads.length;

      resumoAnuncios = ads.slice(0, 15).map((ad, i) => {
        // Texto principal: snapshot.body.text
        const body = ad.snapshot?.body?.text
          || ad.ad_creative_bodies?.join(' | ')
          || ad.body || 'Sem texto';

        // Título/CTA
        const cta = ad.snapshot?.cta_text || '';
        const caption = ad.snapshot?.caption || '';
        const linkUrl = ad.snapshot?.link_url || '';

        // Formato e plataformas
        const format = ad.snapshot?.display_format || '';
        const platforms = ad.publisher_platform?.join(', ') || ad.publisher_platforms?.join(', ') || '';
        const startDate = ad.start_date || ad.ad_delivery_start_time || '';

        return `ANUNCIO ${i + 1}
Plataformas: ${platforms}
Formato: ${format}
Data inicio: ${startDate}
Texto: ${body}
CTA: ${cta}
Destino: ${linkUrl || caption}`;
      }).join('\n\n---\n\n');
    }
  } catch (e) {
    console.error('Erro ao buscar anuncios:', e.message);
  }

  if (!resumoAnuncios) {
    return res.status(200).json({
      tipo: 'sem_anuncios',
      pagina: paginaEncontrada,
      mensagem: 'Nenhum anúncio ativo encontrado na Biblioteca de Anúncios da Meta para esta página.'
    });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `Você é Eduardo Schuman, especialista em tráfego pago exclusivamente para clínicas de estética há 6 anos. Antes do marketing, trabalhou 10 anos como vendedor. Sabe exatamente o que funciona e o que não funciona em anúncios para esse nicho.

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
