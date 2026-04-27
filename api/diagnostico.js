// v7 - busca por variações do handle e escolhe melhor resultado
const Anthropic = require('@anthropic-ai/sdk');

async function searchByTerm(term, apiKey) {
  const url = `https://www.searchapi.io/api/v1/search?engine=meta_ad_library&q=${encodeURIComponent(term)}&search_type=page&ad_type=all&country=ALL&api_key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.ads || [];
}

async function searchByPageId(pageId, apiKey) {
  const url = `https://www.searchapi.io/api/v1/search?engine=meta_ad_library&page_id=${pageId}&ad_type=all&country=ALL&api_key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.ads || [];
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { handle, nome, page_id: pageIdDireto, page_nome: pageNomeDireto } = req.body;
  if (!handle) return res.status(400).json({ error: 'Handle não informado' });

  const slug = handle.replace('@', '').trim();

  let melhorAds = [];
  let paginaEncontrada = pageNomeDireto || `@${slug}`;

  try {
    const apiKey = process.env.SEARCHAPI_KEY;

    if (pageIdDireto) {
      // Usuário selecionou da lista — usa page_id diretamente
      melhorAds = await searchByPageId(pageIdDireto, apiKey);
    } else {
      // Busca por variações do handle
      const slugSemPonto = slug.replace(/\./g, '');
      const slugComEspaco = slug.replace(/\./g, ' ');
      const slugComHifen = slug.replace(/\./g, '-');
      const termos = [...new Set([slug, slugSemPonto, slugComEspaco, slugComHifen])];
      const pageIdsTestados = new Set();
      let candidatos = [];

      for (const termo of termos) {
        const ads = await searchByTerm(termo, apiKey);
        for (const ad of ads) {
          const pid = ad.page_id;
          if (pid && !pageIdsTestados.has(pid)) {
            pageIdsTestados.add(pid);
            const todosAds = await searchByPageId(pid, apiKey);
            candidatos.push({
              pageName: ad.page_name || ad.snapshot?.page_name || `@${slug}`,
              ads: todosAds.length > 0 ? todosAds : ads.filter(a => a.page_id === pid)
            });
          }
        }
      }

      if (candidatos.length > 0) {
        candidatos.sort((a, b) => b.ads.length - a.ads.length);
        melhorAds = candidatos[0].ads;
        paginaEncontrada = candidatos[0].pageName;
      }
    }
  } catch (e) {
    console.error('Erro ao buscar anuncios:', e.message);
  }

  if (melhorAds.length === 0) {
    return res.status(200).json({
      tipo: 'sem_anuncios',
      pagina: paginaEncontrada,
      mensagem: 'Nenhum anúncio ativo encontrado na Biblioteca de Anúncios da Meta para esta página.'
    });
  }

  const totalAnuncios = melhorAds.length;

  const resumoAnuncios = melhorAds.slice(0, 15).map((ad, i) => {
    const body = ad.snapshot?.body?.text
      || ad.ad_creative_bodies?.join(' | ')
      || ad.body || 'Sem texto';
    const cta = ad.snapshot?.cta_text || '';
    const linkUrl = ad.snapshot?.link_url || ad.snapshot?.caption || '';
    const format = ad.snapshot?.display_format || '';
    const platforms = ad.publisher_platform?.join(', ') || ad.publisher_platforms?.join(', ') || '';
    const startDate = ad.start_date || ad.ad_delivery_start_time || '';

    return `ANUNCIO ${i + 1}
Plataformas: ${platforms}
Formato: ${format}
Data inicio: ${startDate}
Texto: ${body}
CTA: ${cta}
Destino: ${linkUrl}`;
  }).join('\n\n---\n\n');

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
