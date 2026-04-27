module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q } = req.query;
  if (!q || q.length < 3) return res.status(200).json({ sugestoes: [] });

  const slug = q.replace('@', '').trim();

  try {
    const apiKey = process.env.SEARCHAPI_KEY;
    const url = `https://www.searchapi.io/api/v1/search?engine=meta_ad_library&q=${encodeURIComponent(slug)}&search_type=page&ad_type=all&country=ALL&api_key=${apiKey}`;
    const searchRes = await fetch(url);
    const searchData = await searchRes.json();

    const ads = searchData.ads || [];

    // Agrupa por page_id para evitar duplicatas
    const paginasMap = {};
    for (const ad of ads) {
      const pid = ad.page_id;
      if (!pid || paginasMap[pid]) continue;

      const snap = ad.snapshot || {};
      const instagramHandle = snap.link_url?.includes('instagram.com')
        ? '@' + snap.link_url.replace(/.*instagram\.com\/?/, '').replace(/\/?$/, '')
        : null;

      paginasMap[pid] = {
        page_id: pid,
        nome: ad.page_name || snap.page_name || slug,
        instagram: instagramHandle,
        foto: snap.page_profile_picture_url || null,
        curtidas: snap.page_like_count || 0,
        categorias: snap.page_categories?.join(', ') || ''
      };
    }

    const sugestoes = Object.values(paginasMap).slice(0, 6);
    return res.status(200).json({ sugestoes });
  } catch (e) {
    console.error('Erro sugestoes:', e.message);
    return res.status(200).json({ sugestoes: [] });
  }
};
