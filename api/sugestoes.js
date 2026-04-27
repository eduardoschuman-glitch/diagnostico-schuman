module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q } = req.query;
  if (!q || q.replace('@','').trim().length < 3) return res.status(200).json({ sugestoes: [] });

  const slug = q.replace('@', '').trim();

  // Múltiplas variações para superar limitações de fuzzy match do SearchAPI
  const partes = slug.split(/[._\-\s]+/).filter(p => p.length >= 2);
  const variacoes = [...new Set([
    slug,                            // draaline.garcia
    slug.replace(/\./g, ''),         // draalinegarcia
    slug.replace(/\./g, ' '),        // draaline garcia
    slug.replace(/\./g, '-'),        // draaline-garcia
    partes.join(' '),                // separa nas pontuações
    partes[partes.length - 1] || '', // só a última parte (sobrenome)
  ])].filter(v => v.length >= 3);

  const apiKey = process.env.SEARCHAPI_KEY;
  const paginasMap = {};

  // Função pra registrar uma página candidata
  const registrarAd = (ad, prioridade) => {
    const pid = ad.page_id;
    if (!pid) return;

    const snap = ad.snapshot || {};
    let instagramHandle = null;
    if (snap.link_url?.includes('instagram.com')) {
      const parte = snap.link_url.replace(/.*instagram\.com\/?/, '').replace(/\/.*$/, '').trim();
      if (parte) instagramHandle = '@' + parte;
    }

    // Boost: se o handle do Instagram bate exatamente com o que foi digitado, prioriza muito
    const matchExato = instagramHandle && instagramHandle.toLowerCase() === '@' + slug.toLowerCase();
    const score = (matchExato ? 1000 : 0) + (snap.page_like_count || 0) + prioridade;

    if (!paginasMap[pid] || paginasMap[pid].score < score) {
      paginasMap[pid] = {
        page_id: pid,
        nome: ad.page_name || snap.page_name || slug,
        instagram: instagramHandle,
        foto: snap.page_profile_picture_url || null,
        curtidas: snap.page_like_count || 0,
        categorias: snap.page_categories?.join(', ') || '',
        score
      };
    }
  };

  try {
    // Busca por nome de página em cada variação
    for (let i = 0; i < variacoes.length; i++) {
      const variacao = variacoes[i];
      const url = `https://www.searchapi.io/api/v1/search?engine=meta_ad_library&q=${encodeURIComponent(variacao)}&search_type=page&ad_type=all&country=BR&api_key=${apiKey}`;
      const searchRes = await fetch(url);
      const searchData = await searchRes.json();
      const ads = searchData.ads || [];
      // Variações do início têm prioridade maior
      const prioridade = (variacoes.length - i) * 10;
      for (const ad of ads) registrarAd(ad, prioridade);
    }
  } catch (e) {
    console.error('Erro sugestoes:', e.message);
  }

  // Ordena por score (match exato + curtidas) e limita a 8
  const sugestoes = Object.values(paginasMap)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ score, ...rest }) => rest);

  return res.status(200).json({ sugestoes });
};
