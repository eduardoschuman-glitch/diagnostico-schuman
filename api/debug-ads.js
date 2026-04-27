module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { handle } = req.query;
  if (!handle) return res.status(400).json({ error: 'handle obrigatorio' });

  const slug = handle.replace('@', '').trim();

  // Resolve page_id
  const userToken = process.env.META_ACCESS_TOKEN;
  const appToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
  const token = userToken || appToken;

  const pageRes = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(slug)}?fields=id,name&access_token=${token}`
  );
  const pageData = await pageRes.json();

  if (!pageData.id) {
    return res.status(200).json({ erro: 'page_id nao encontrado', pageData });
  }

  const pageId = pageData.id;

  // Busca anuncios sem filtro extra para ver o maximo de dados
  const searchUrl = `https://www.searchapi.io/api/v1/search?engine=meta_ad_library&page_id=${pageId}&ad_type=all&country=ALL&api_key=${process.env.SEARCHAPI_KEY}`;
  const searchRes = await fetch(searchUrl);
  const searchData = await searchRes.json();

  return res.status(200).json({
    pageId,
    pageName: pageData.name,
    totalAds: (searchData.ads || []).length,
    allKeys: Object.keys(searchData),
    firstAd: searchData.ads?.[0] || null,
    secondAd: searchData.ads?.[1] || null,
    rawSearchData: searchData
  });
};
