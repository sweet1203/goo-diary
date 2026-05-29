export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { password } = req.body || {};
  if (!password) return res.status(400).json({ ok: false, error: '비밀번호를 입력해주세요.' });

  if (password === process.env.DEV_PASSWORD) {
    return res.status(200).json({ ok: true, token: password });
  }
  return res.status(401).json({ ok: false, error: '비밀번호가 틀렸어요.' });
}
