function safeText(value) {
  return String(value || '').trim();
}

function json(res, statusCode, payload) {
  res.status(statusCode).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Metodo nao permitido' });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.ALERTA_EMAIL_FROM;
  const toEmail = process.env.ALERTA_EMAIL_TO;

  if (!resendApiKey || !fromEmail || !toEmail) {
    return json(res, 500, {
      error: 'Variaveis de ambiente ausentes: RESEND_API_KEY, ALERTA_EMAIL_FROM, ALERTA_EMAIL_TO'
    });
  }

  const body = req.body || {};
  const idHistorico = safeText(body.idHistorico);
  const painel = safeText(body.painel) || 'Nao informado';
  const turno = safeText(body.turno) || 'Nao informado';
  const turma = safeText(body.turma) || 'Nao informado';
  const causa = safeText(body.causa) || 'Nao informada';
  const inicio = safeText(body.inicio) || 'Nao informado';
  const fim = safeText(body.fim) || 'Nao informado';
  const minutos = Number(body.minutosParada || 0);

  if (!Number.isFinite(minutos) || minutos < 180) {
    return json(res, 400, { error: 'Parada abaixo do limite de 3 horas.' });
  }

  const horas = Math.floor(minutos / 60);
  const minutosRestantes = minutos % 60;
  const duracao = `${String(horas).padStart(2, '0')}:${String(minutosRestantes).padStart(2, '0')}`;

  const subject = `[ALERTA] Parada acima de 3h - Painel ${painel}`;
  const html = `
    <h2>Alerta de parada acima de 3 horas</h2>
    <p>Foi identificada uma parada com duracao superior ao limite configurado.</p>
    <ul>
      <li><strong>ID:</strong> ${idHistorico || 'Nao informado'}</li>
      <li><strong>Painel:</strong> ${painel}</li>
      <li><strong>Turno:</strong> ${turno}</li>
      <li><strong>Turma:</strong> ${turma}</li>
      <li><strong>Causa:</strong> ${causa}</li>
      <li><strong>Inicio:</strong> ${inicio}</li>
      <li><strong>Fim:</strong> ${fim}</li>
      <li><strong>Duracao:</strong> ${duracao}</li>
    </ul>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject,
        html
      })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      return json(res, 502, {
        error: 'Falha ao enviar e-mail pelo provedor.',
        provider: result
      });
    }

    return json(res, 200, {
      ok: true,
      id: result.id || null
    });
  } catch (error) {
    return json(res, 500, {
      error: 'Erro interno ao enviar e-mail.',
      details: String(error?.message || error)
    });
  }
}
