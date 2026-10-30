// 訪客留言板 API：GET 取得留言列表，POST 新增一則留言。
// 資料存在 Neon Postgres，連線字串來自環境變數 DATABASE_URL。
import { neon } from '@neondatabase/serverless';

const NAME_MAX = 30;
const MESSAGE_MAX = 140;

let tableReady;

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error('缺少環境變數 DATABASE_URL');
  }
  return neon(process.env.DATABASE_URL);
}

function ensureTable(sql) {
  if (!tableReady) {
    tableReady = sql`
      CREATE TABLE IF NOT EXISTS guestbook (
        id SERIAL PRIMARY KEY,
        name VARCHAR(${NAME_MAX}) NOT NULL,
        message VARCHAR(${MESSAGE_MAX}) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `.catch((err) => { tableReady = undefined; throw err; });
  }
  return tableReady;
}

function clean(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    const sql = getSql();
    await ensureTable(sql);

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, name, message, created_at
        FROM guestbook
        ORDER BY created_at DESC, id DESC
        LIMIT 100
      `;
      return res.status(200).json({ entries: rows });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const name = clean(body.name, NAME_MAX);
      const message = clean(body.message, MESSAGE_MAX);

      if (!name || !message) {
        return res.status(400).json({ error: '名字和留言都要填喔。' });
      }

      const [entry] = await sql`
        INSERT INTO guestbook (name, message)
        VALUES (${name}, ${message})
        RETURNING id, name, message, created_at
      `;
      return res.status(201).json({ entry });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('guestbook error:', err);
    return res.status(500).json({ error: '伺服器暫時無法處理，請稍後再試。' });
  }
}
