import * as cheerio from "cheerio";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";

function normalize(input) {
  const raw = String(input || "").trim();
  const bookoff = raw.replace(/-/g, "");

  if (/^\d{8,14}$/.test(bookoff)) {
    return { A: bookoff, B: bookoff };
  }

  const A = bookoff.replace(/^([A-Za-z]{2,8})(\d{2,6}[A-Za-z]?)$/, "$1-$2");
  return { A, B: bookoff };
}

function clean(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
    .trim();
}

function extractPrice(text) {
  const t = clean(text);
  const patterns = [
    /買取価格[^0-9]{0,50}([0-9,]+)\s*円/,
    /買取[^0-9]{0,50}([0-9,]+)\s*円/,
    /([0-9,]+)\s*円/
  ];

  for (const p of patterns) {
    const m = t.match(p);
    if (m) return Number(m[1].replace(/,/g, ""));
  }

  return null;
}

function extractTitle($) {
  const candidates = [
    $("h1").first().text(),
    $("h2").first().text(),
    $("title").text()
  ].map(clean).filter(Boolean);

  return candidates[0] || null;
}

function extractReleaseDate(text) {
  const t = clean(text);
  const m =
    t.match(/発売日[:：]?\s*([0-9]{4}[\/年.-][0-9]{1,2}[\/月.-][0-9]{1,2}日?)/) ||
    t.match(/([0-9]{4}[\/年.-][0-9]{1,2}[\/月.-][0-9]{1,2}日?)\s*発売/);

  return m ? m[1] : null;
}

function extractModel(text, keyword) {
  if (!/^\d{8,14}$/.test(keyword)) return keyword;

  const t = clean(text);
  const m =
    t.match(/型番[:：]?\s*([A-Za-z0-9-]{3,30})/) ||
    t.match(/規格品番[:：]?\s*([A-Za-z0-9-]{3,30})/) ||
    t.match(/\b([A-Z]{2,8}-?\d{2,6}[A-Z]?)\b/);

  return m ? m[1] : null;
}

function extractGenre(text) {
  const t = clean(text);
  const m = t.match(
    /(洋楽CD|邦楽CD|アニメ系CD|中古CD|DVD|Blu-ray|ブルーレイ|ゲーム|フィギュア|コミック|書籍|おもちゃ|ホビー)/
  );
  return m ? m[1] : null;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.8"
    }
  });

  return {
    ok: res.ok,
    status: res.status,
    url: res.url,
    html: await res.text()
  };
}

async function searchShop(name, keyword) {
  const url =
    name === "A"
      ? `https://www.suruga-ya.jp/kaitori/search_buy?category=&search_word=${encodeURIComponent(keyword)}&searchbox=1`
      : `https://www.bookoffonline.co.jp/boleccontent/bolbuysearch/buysearch/display?q=${encodeURIComponent(keyword)}`;

  try {
    const result = await fetchHtml(url);
    const $ = cheerio.load(result.html);
    const bodyText = $("body").text();

    return {
      ok: true,
      keyword,
      url,
      detailUrl: result.url || url,
      price: extractPrice(bodyText),
      title: extractTitle($),
      genre: extractGenre(bodyText),
      releaseDate: extractReleaseDate(bodyText),
      model: extractModel(bodyText, keyword)
    };
  } catch (e) {
    return {
      ok: false,
      keyword,
      url,
      detailUrl: url,
      price: null,
      title: null,
      genre: null,
      releaseDate: null,
      model: null,
      error: e.message
    };
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  const q = String(req.query.q || req.query.jan || "").trim();

  if (!q) {
    return res.status(400).json({
      ok: false,
      error: "検索ワードがありません"
    });
  }

  const normalized = normalize(q);

  const [A, B] = await Promise.all([
    searchShop("A", normalized.A),
    searchShop("B", normalized.B)
  ]);

  const diff =
    typeof A.price === "number" && typeof B.price === "number"
      ? A.price - B.price
      : null;

  return res.status(200).json({
    ok: true,
    input: q,
    normalized,
    A,
    B,
    diff
  });
}
