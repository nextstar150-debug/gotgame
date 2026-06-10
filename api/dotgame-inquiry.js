function send(response, status, body) {
  response.setHeader('cache-control', 'no-store');
  response.status(status).json(body);
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !key) return null;
  return { url, key };
}

function clean(value, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

async function insertInquiry(inquiry) {
  const config = supabaseConfig();
  if (!config) {
    return { ok: false, status: 503, data: { message: 'Supabase is not configured.' } };
  }

  const response = await fetch(`${config.url}/rest/v1/dotgame_inquiries`, {
    method: 'POST',
    headers: {
      apikey: config.key,
      authorization: `Bearer ${config.key}`,
      'content-type': 'application/json',
      prefer: 'return=minimal'
    },
    body: JSON.stringify(inquiry)
  });

  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

async function sendNotification(inquiry) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const endpoint =
      process.env.NEXTSTAR_NOTIFICATION_ENDPOINT ||
      'https://www.nextstar.kr/api/notifications/service-submission';
    const forwarded = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'DotGame 개발 문의',
        type: 'dotgame',
        fields: [
          { label: '이름', value: inquiry.name },
          { label: '이메일', value: inquiry.email },
          { label: '문의 유형', value: inquiry.inquiry_type },
          { label: '회사·소속', value: inquiry.company },
          { label: '희망 일정', value: inquiry.timeline },
          { label: '연락 가능 시간', value: inquiry.available_time },
          { label: '내용', value: inquiry.message }
        ]
      })
    });
    const result = await forwarded.json().catch(() => ({}));
    return { ok: forwarded.ok, status: forwarded.status, result };
  }

  const to = process.env.NOTIFICATION_EMAIL || 'contact@nextstar.kr';
  const from = process.env.RESEND_FROM_EMAIL || 'Nextstar <contact@nextstar.kr>';
  const submittedAt = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const subject = `[DotGame] ${inquiry.inquiry_type} 문의`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:720px;margin:0 auto;color:#111827;">
      <p style="margin:0 0 8px;color:#0066cc;font-weight:700;">DOTGAME · NEXTSTAR</p>
      <h1 style="margin:0 0 10px;font-size:24px;line-height:1.35;">DotGame 문의가 접수되었습니다</h1>
      <p style="margin:0 0 22px;color:#64748b;">${escapeHtml(submittedAt)}</p>
      <table style="width:100%;border-collapse:collapse;border-top:1px solid #e5e7eb;font-size:14px;">
        ${[
          ['이름', inquiry.name],
          ['이메일', inquiry.email],
          ['문의 유형', inquiry.inquiry_type],
          ['회사·소속', inquiry.company],
          ['희망 일정', inquiry.timeline],
          ['연락 가능 시간', inquiry.available_time],
          ['내용', inquiry.message]
        ]
          .filter(([, value]) => value)
          .map(([label, value]) => `
            <tr>
              <th style="width:140px;padding:10px 12px;text-align:left;vertical-align:top;color:#64748b;border-bottom:1px solid #e5e7eb;">${escapeHtml(label)}</th>
              <td style="padding:10px 12px;white-space:pre-wrap;color:#111827;border-bottom:1px solid #e5e7eb;">${escapeHtml(value)}</td>
            </tr>
          `)
          .join('')}
      </table>
    </div>
  `;

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to,
      reply_to: inquiry.email,
      subject,
      html
    })
  });

  const result = await resendResponse.json().catch(() => ({}));
  return { ok: resendResponse.ok, status: resendResponse.status, result };
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return send(response, 405, { ok: false, message: 'Method not allowed' });
  }

  const body = request.body || {};
  const inquiry = {
    name: clean(body.name, 120),
    email: clean(body.email, 240).toLowerCase(),
    inquiry_type: clean(body.inquiryType, 120),
    message: clean(body.message, 4000),
    timeline: clean(body.timeline, 120),
    company: clean(body.company, 160),
    available_time: clean(body.availableTime, 160),
    source: 'dotgame'
  };

  if (!inquiry.name || !inquiry.email || !inquiry.inquiry_type || !inquiry.message) {
    return send(response, 400, { ok: false, message: '필수 항목을 입력해주세요.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inquiry.email)) {
    return send(response, 400, { ok: false, message: '이메일 형식을 확인해주세요.' });
  }

  const insertResult = await insertInquiry(inquiry);
  if (!insertResult.ok) {
    return send(response, insertResult.status, {
      ok: false,
      message: '문의 저장 중 오류가 발생했습니다.',
      detail: insertResult.data
    });
  }

  const notification = await sendNotification(inquiry);
  if (notification.ok === false) {
    return send(response, 202, {
      ok: true,
      message: '문의는 저장되었지만 메일 알림은 실패했습니다.'
    });
  }

  return send(response, 200, { ok: true, message: '잘 받았습니다. 1영업일 안에 답장드릴게요.' });
}
