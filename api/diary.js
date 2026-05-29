// api/diary.js — Notion DB 프록시 (goo-diary)
// GET  ?date=YYYY-MM-DD  → 특정 날짜 일기 조회
// GET  (no date)         → 전체 날짜 목록 (캘린더용)
// POST  { date, content } → 생성
// PATCH { notionId, content } → 수정

const NOTION_VERSION = '2022-06-28';
const NOTION_API = 'https://api.notion.com/v1';
const DB_ID = process.env.NOTION_DB_ID || 'a401df2b-d59d-443d-b0aa-2ecd26ea4c17';

function isAuthorized(req) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  return token === process.env.DEV_PASSWORD;
}

function notionHeaders() {
  return {
    'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

function pageToEntry(page) {
  const richText = page.properties['내용']?.rich_text || [];
  const content = richText.map(t => t.plain_text).join('');
  return {
    notionId: page.id,
    date: page.properties['날짜']?.date?.start || '',
    content,
    preview: content.slice(0, 80),
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!isAuthorized(req)) return res.status(401).json({ error: '인증 필요' });

  try {
    // ── GET: 특정 날짜 조회 ──────────────────────────────
    if (req.method === 'GET' && req.query.date) {
      const date = req.query.date;
      const r = await fetch(`${NOTION_API}/databases/${DB_ID}/query`, {
        method: 'POST',
        headers: notionHeaders(),
        body: JSON.stringify({
          filter: { property: '날짜', date: { equals: date } },
        }),
      });
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: data.message });
      const entry = data.results[0] ? pageToEntry(data.results[0]) : null;
      return res.status(200).json({ entry });
    }

    // ── GET: 전체 날짜 목록 (캘린더) ────────────────────
    if (req.method === 'GET') {
      const r = await fetch(`${NOTION_API}/databases/${DB_ID}/query`, {
        method: 'POST',
        headers: notionHeaders(),
        body: JSON.stringify({
          sorts: [{ property: '날짜', direction: 'descending' }],
          page_size: 100,
        }),
      });
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({
        error: data.message,
        notion_code: data.code,
        db_id: DB_ID,
        token_prefix: (process.env.NOTION_TOKEN || '').slice(0, 10) + '...',
      });
      const entries = data.results.map(pageToEntry);
      return res.status(200).json({ entries });
    }

    // ── POST: 일기 생성 ──────────────────────────────────
    if (req.method === 'POST') {
      const { date, content } = req.body || {};
      if (!date || !content) return res.status(400).json({ error: '날짜와 내용이 필요합니다.' });

      const r = await fetch(`${NOTION_API}/pages`, {
        method: 'POST',
        headers: notionHeaders(),
        body: JSON.stringify({
          parent: { database_id: DB_ID },
          properties: {
            '제목': { title: [{ text: { content: date } }] },
            '날짜': { date: { start: date } },
            '내용': { rich_text: [{ text: { content } }] },
          },
        }),
      });
      const page = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: page.message });
      return res.status(201).json({ notionId: page.id });
    }

    // ── PATCH: 일기 수정 ─────────────────────────────────
    if (req.method === 'PATCH') {
      const { notionId, content } = req.body || {};
      if (!notionId) return res.status(400).json({ error: 'notionId 필요' });

      const r = await fetch(`${NOTION_API}/pages/${notionId}`, {
        method: 'PATCH',
        headers: notionHeaders(),
        body: JSON.stringify({
          properties: {
            '내용': { rich_text: [{ text: { content: content || '' } }] },
          },
        }),
      });
      if (!r.ok) { const e = await r.json(); return res.status(r.status).json({ error: e.message }); }
      return res.status(200).json({ ok: true });
    }

    // ── DELETE: 일기 아카이브 ────────────────────────────
    if (req.method === 'DELETE') {
      const { notionId } = req.body || {};
      if (!notionId) return res.status(400).json({ error: 'notionId 필요' });
      await fetch(`${NOTION_API}/pages/${notionId}`, {
        method: 'PATCH', headers: notionHeaders(),
        body: JSON.stringify({ archived: true }),
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
