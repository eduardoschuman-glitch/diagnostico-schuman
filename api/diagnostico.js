// v8 - country=BR + email via Resend + match Instagram exato
const Anthropic = require('@anthropic-ai/sdk');

async function searchByTerm(term, apiKey) {
  const url = `https://www.searchapi.io/api/v1/search?engine=meta_ad_library&q=${encodeURIComponent(term)}&search_type=page&ad_type=all&country=BR&api_key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.ads || [];
}

async function searchByPageId(pageId, apiKey) {
  const url = `https://www.searchapi.io/api/v1/search?engine=meta_ad_library&page_id=${pageId}&ad_type=all&country=BR&api_key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.ads || [];
}

// Verifica se algum ad tem instagram link batendo com o handle
function instagramBate(ad, slug) {
  const linkUrl = ad.snapshot?.link_url || '';
  if (!linkUrl.includes('instagram.com')) return false;
  const handle = linkUrl.replace(/.*instagram\.com\/?/, '').replace(/\/.*$/, '').trim().toLowerCase();
  return handle === slug.toLowerCase();
}

async function enviarEmailDiagnostico({ destinatario, nomeDestinatario, paginaNome, diagnostico, totalAnuncios }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('RESEND_API_KEY nao configurado - email nao enviado');
    return false;
  }

  const problemasHtml = diagnostico.problemas.map(p => `
    <div style="margin:24px 0; padding:20px; background:#fafafa; border-left:4px solid #d4a857; border-radius:4px;">
      <div style="color:#888; font-size:12px; font-weight:600; margin-bottom:6px;">// PROBLEMA ${String(p.numero).padStart(2,'0')}</div>
      <div style="color:#111; font-size:18px; font-weight:700; margin-bottom:8px;">${p.titulo}</div>
      <div style="color:#444; font-size:14px; line-height:1.6;">${p.descricao}</div>
    </div>`).join('');

  const prioridadesHtml = diagnostico.prioridades.map(p => `
    <tr>
      <td style="padding:12px; border-bottom:1px solid #eee; color:${p.nivel.toLowerCase()==='alta'?'#c0392b':'#888'}; font-weight:600; white-space:nowrap;">${p.nivel}</td>
      <td style="padding:12px; border-bottom:1px solid #eee; color:#333;">${p.acao}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width:640px; margin:0 auto; padding:32px 20px; background:#fff; color:#222;">
  <div style="text-align:center; margin-bottom:32px;">
    <div style="color:#888; font-size:12px; letter-spacing:2px; font-weight:600;">DIAGNÓSTICO DE TRÁFEGO</div>
    <h1 style="color:#111; font-size:28px; margin:8px 0;">${paginaNome}</h1>
    <div style="color:#666; font-size:14px;">${totalAnuncios} anúncio${totalAnuncios>1?'s':''} ativo${totalAnuncios>1?'s':''} analisado${totalAnuncios>1?'s':''}</div>
  </div>
  <div style="margin:32px 0;">
    <h2 style="color:#c0392b; font-size:16px; margin-bottom:8px;">⚠ PROBLEMAS IDENTIFICADOS</h2>
    ${problemasHtml}
  </div>
  <div style="margin:40px 0;">
    <h2 style="color:#d4a857; font-size:16px; margin-bottom:12px;">🎯 PRIORIDADES DE MELHORIA</h2>
    <table style="width:100%; border-collapse:collapse; background:#fafafa; border-radius:6px; overflow:hidden;">
      <thead><tr style="background:#222; color:#fff;"><th style="padding:12px; text-align:left;">Prioridade</th><th style="padding:12px; text-align:left;">Ação</th></tr></thead>
      <tbody>${prioridadesHtml}</tbody>
    </table>
  </div>
  <div style="margin-top:48px; padding:24px; background:#f5e9c8; border-radius:8px; text-align:center;">
    <div style="color:#222; font-size:16px; font-weight:600; margin-bottom:8px;">Quer que eu te ajude a corrigir esses problemas?</div>
    <div style="color:#444; font-size:14px; margin-bottom:16px;">Agende uma call de 20 min comigo, sem compromisso.</div>
    <a href="https://wa.me/55SEUNUMERO?text=${encodeURIComponent('Olá Eduardo, recebi meu diagnóstico por email e quero conversar.')}" style="display:inline-block; background:#222; color:#d4a857; padding:14px 32px; text-decoration:none; border-radius:6px; font-weight:600;">FALAR COM EDUARDO</a>
  </div>
  <div style="margin-top:32px; padding-top:24px; border-top:1px solid #eee; color:#888; font-size:12px; text-align:center;">
    Eduardo Schuman · Tráfego Pago para Clínicas de Estética
  </div>
</body></html>`;

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Eduardo Schuman <onboarding@resend.dev>',
        to: [destinatario],
        subject: `Seu diagnóstico de tráfego: ${paginaNome}`,
        html
      })
    });
    const result = await resp.json();
    console.log('Email enviado:', resp.status, result.id || result.message);
    return resp.ok;
  } catch (e) {
    console.error('Erro ao enviar email:', e.message);
    return false;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { handle, nome, email, page_id: pageIdDireto, page_nome: pageNomeDireto } = req.body;
  if (!handle) return res.status(400).json({ error: 'Handle não informado' });

  const slug = handle.replace('@', '').trim();

  let melhorAds = [];
  let paginaEncontrada = pageNomeDireto || `@${slug}`;

  try {
    const apiKey = process.env.SEARCHAPI_KEY;

    if (pageIdDireto) {
      melhorAds = await searchByPageId(pageIdDireto, apiKey);
    } else {
      const partes = slug.split(/[._\-\s]+/).filter(p => p.length >= 2);
      const termos = [...new Set([
        slug,
        slug.replace(/\./g, ''),
        slug.replace(/\./g, ' '),
        slug.replace(/\./g, '-'),
        partes.join(' '),
        partes[partes.length - 1] || '',
      ])].filter(v => v.length >= 3);

      const pageIdsTestados = new Set();
      let candidatos = [];

      for (const termo of termos) {
        const ads = await searchByTerm(termo, apiKey);
        for (const ad of ads) {
          const pid = ad.page_id;
          if (pid && !pageIdsTestados.has(pid)) {
            pageIdsTestados.add(pid);
            const todosAds = await searchByPageId(pid, apiKey);
            const adsDessaPagina = todosAds.length > 0 ? todosAds : ads.filter(a => a.page_id === pid);
            const matchInstagram = adsDessaPagina.some(a => instagramBate(a, slug));
            candidatos.push({
              pageName: ad.page_name || ad.snapshot?.page_name || `@${slug}`,
              ads: adsDessaPagina,
              score: (matchInstagram ? 10000 : 0) + adsDessaPagina.length
            });
          }
        }
      }

      if (candidatos.length > 0) {
        candidatos.sort((a, b) => b.score - a.score);
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
      mensagem: 'Não encontramos anúncios ativos. Eduardo vai analisar manualmente sua conta e entrar em contato pelo WhatsApp em até 24h com a análise completa.'
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

    // Envia por email se tiver email do usuário
    let emailEnviado = false;
    if (email) {
      emailEnviado = await enviarEmailDiagnostico({
        destinatario: email,
        nomeDestinatario: nome,
        paginaNome: paginaEncontrada,
        diagnostico,
        totalAnuncios
      });
    }

    return res.status(200).json({ tipo: 'diagnostico', email_enviado: emailEnviado, ...diagnostico });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro interno', detalhe: err.message });
  }
};
