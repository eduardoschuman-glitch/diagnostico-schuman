module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { handle } = req.query;
  if (!handle) return res.status(400).json({ error: 'handle obrigatorio' });

  const slug = handle.replace('@', '').trim();

  // Passo 1: busca pelo handle no SearchAPI para descobrir o page_id
  const step1Url = `https://www.searchapi.io/api/v1/search?engine=meta_ad_library&q=${encodeURIComponent(slug)}&search_type=page&ad_type=all&country=ALL&api_key=${process.env.SEARCHAPI_KEY}`;
  const step1Res = await fetch(step1Url);
  const step1Data = await step1Res.json();

  const firstAd = step1Data.ads?.[0] || null;
  const pageId = firstAd?.page_id || null;

  let step2Data = null;
  if (pageId) {
    // Passo 2: busca todos os anúncios pelo page_id
    const step2Url = `https://www.searchapi.io/api/v1/search?engine=meta_ad_library&page_id=${pageId}&ad_type=all&country=ALL&api_key=${process.env.SEARCHAPI_KEY}`;
    const step2Res = await fetch(step2Url);
    step2Data = await step2Res.json();
  }

  return res.status(200).json({
    slug,
    step1_totalAds: (step1Data.ads || []).length,
    step1_firstAd: firstAd,
    pageIdFound: pageId,
    step2_totalAds: (step2Data?.ads || []).length,
    step2_firstAd: step2Data?.ads?.[0] || null,
  });
};
