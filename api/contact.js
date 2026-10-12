const allowedServices = new Set([
  'Sito Basic — SEO (€300)',
  'Sito Basic — SEO + GEO (€500)',
  'Sito Premium 2D (€600–1.000)',
  'Sito Premium 3D (€1.000–3.000)',
  'SEO e GEO avanzata',
  'Web app mobile',
  'E-commerce',
  'Manutenzione e assistenza',
  'Video editing e avatar AI',
  'Demo personalizzata / non so ancora'
]);

function reply(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return reply(res, 405, { ok: false, message: 'Metodo non consentito.' });
  }

  const origin = req.headers.origin;
  const allowedOrigin = process.env.SITE_ORIGIN;
  if (origin && allowedOrigin && origin !== allowedOrigin) {
    return reply(res, 403, { ok: false, message: 'Origine non autorizzata.' });
  }

  const body = req.body || {};
  // Honeypot anti-spam: scarta silenziosamente i bot che compilano il campo nascosto.
  if (body.website) return reply(res, 200, { ok: true });

  const fullName = String(body.name || '').trim().slice(0, 160);
  const businessName = String(body.business || '').trim().slice(0, 200);
  const email = String(body.email || '').trim().slice(0, 254);
  const phone = String(body.phone || '').trim().slice(0, 50);
  const service = String(body.service || '').trim().slice(0, 160);
  const message = String(body.message || '').trim().slice(0, 5000);
  const leadSource = String(body.leadSource || '').trim().slice(0, 100);
  const consent = body.privacyConsent === true;

  if (!fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !allowedServices.has(service) || !message || !consent) {
    return reply(res, 400, { ok: false, message: 'Controlla i campi obbligatori e il consenso privacy.' });
  }

  if (!process.env.RESEND_API_KEY) {
    return reply(res, 503, { ok: false, message: 'Il servizio email non è ancora configurato. Contatta Valentina tramite un recapito alternativo.' });
  }

  try {
    const mailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || 'Il Tuo Sito Online <onboarding@resend.dev>',
        to: ['latuassistente@mail.com'],
        reply_to: email,
        subject: `Nuova richiesta dal sito: ${service}`,
        text: [
          'Nuova richiesta ricevuta dal sito Il Tuo Sito Online.',
          '',
          `Nome: ${fullName}`,
          `Attività: ${businessName || 'Non indicata'}`,
          `Email: ${email}`,
          `Telefono: ${phone || 'Non indicato'}`,
          `Servizio: ${service}`,
          `Lead source: ${leadSource || 'Non indicata'}`,
          '',
          'Richiesta:',
          message,
          '',
          'Consenso privacy dichiarato: sì'
        ].join('\n')
      })
    });

    if (!mailResponse.ok) {
      const errorText = (await mailResponse.text()).slice(0, 500);
      console.error('Email provider rejected contact notification', errorText);
      return reply(res, 502, {
        ok: false,
        message: 'Non è stato possibile inviare la richiesta. Riprova oppure contatta Valentina tramite un recapito alternativo.'
      });
    }

    return reply(res, 200, {
      ok: true,
      message: 'Richiesta inviata correttamente. Ti ricontatterò appena possibile.'
    });
  } catch (error) {
    console.error('Contact notification failed', error);
    return reply(res, 500, { ok: false, message: 'Si è verificato un errore durante l’invio. Riprova più tardi.' });
  }
}
