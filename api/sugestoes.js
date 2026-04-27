module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q } = req.query;
  if (!q || q.replace('@','').trim().length < 3) return res.status(200).json({ sugestoes: [] });

  const slug = q.replace('@', '').trim();

  // Gera variações para ampliar a busca
  const variacoes = [...new Set([
    slug,                            // draaline.garcia
    slug.replace(/\./g, ''),         // draalinegarcia
    slug.replace(/\./g, ' '),        // draaline garcia
    slug.replace(/\./g, '-'),        // draaline-garcia
    slug.split('.')[0],              // draaline (só a primeira parte)
  ])].filter(v => v.length >= 3);

  const apiKey = process.env.SEARCHAPI_KEY;
  const paginasMap = {};

  try {
    for (const variacao of variacoes) {
      const url = `https://www.searchapi.io/api/v1/search?engine=meta_ad_library&q=${encodeURIComponent(variacao)}&search_type=page&ad_type=all&country=ALL&api_key=${apiKey}`;
      const searchRes = await fetch(url);
      const searchData = await searchRes.json();
      const ads = searchData.ads || [];

      for (const ad of ads) {
        const pid = ad.page_id;
        if (!pid || paginasMap[pid]) continue;

        const snap = ad.snapshot || {};

        // Extrai handle do Instagram a partir do link_url
        let instagramHandle = null;
        if (snap.link_url?.includes('instagram.com')) {
          const parte = snap.link_url.replace(/.*instagram\.com\/?/, '').replace(/\/.*$/, '').trim();
          if (parte) instagramHandle = '@' + parte;
        }

        paginasMap[pid] = {
          page_id: pid,
          nome: ad.page_name || snap.page_name || slug,
          instagram: instagramHandle,
          foto: snap.page_profile_picture_url || null,
          curtidas: snap.page_like_count || 0,
          categorias: snap.page_categories?.join(', ') || ''
        };
      }
    }
  } catch (e) {
    console.error('Erro sugestoes:', e.message);
  }

  // Ordena por curtidas (mais conhecido primeiro) e limita a 6
  const sugestoes = Object.values(paginasMap)
    .sort((a, b) => b.curtidas - a.curtidas)
    .slice(0, 6);

  return res.status(200).json({ sugestoes });
};
