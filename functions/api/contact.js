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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  if (origin && env.SITE_ORIGIN) {
    try {
      if (new URL(origin).origin !== new URL(env.SITE_ORIGIN).origin) {
        return json({ ok: false, message: 'Origine non autorizzata.' }, 403);
      }
    } catch {
      return json({ ok: false, message: 'Configurazione del sito non valida.' }, 500);
    }
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: 'Richiesta non valida.' }, 400);
  }

  // Campo esca anti-spam: i bot vengono scartati senza inviare email.
  if (body.website) return json({ ok: true });

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
    return json({ ok: false, message: 'Controlla i campi obbligatori e il consenso privacy.' }, 400);
  }

  if (!env.RESEND_API_KEY) {
    return json({
      ok: false,
      message: 'Il servizio email non è ancora configurato. Riprova più tardi oppure contatta Valentina tramite un recapito alternativo.'
    }, 503);
  }

  try {
    const mailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: env.MAIL_FROM || 'Il Tuo Sito Online <onboarding@resend.dev>',
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
      return json({
        ok: false,
        message: 'Non è stato possibile inviare la richiesta. Riprova oppure contatta Valentina tramite un recapito alternativo.'
      }, 502);
    }

    return json({
      ok: true,
      message: 'Richiesta inviata correttamente. Ti ricontatterò appena possibile.'
    });
  } catch (error) {
    console.error('Contact notification failed', error);
    return json({
      ok: false,
      message: 'Si è verificato un errore durante l’invio. Riprova più tardi.'
    }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, message: 'Metodo non consentito.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Allow': 'POST', 'Cache-Control': 'no-store' }
    });
  }
  return onRequestPost(context);
}
