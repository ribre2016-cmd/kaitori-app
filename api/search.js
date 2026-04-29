import * as cheerio from "cheerio";

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function normalizeSearchKeywords(input) {
  const raw = String(input || "").trim();
  const bookoff = raw.replace(/-/g, "");

  if (/^\d{8,14}$/.test(bookoff)) {
    return { surugaya: bookoff, bookoff };
  }

  const surugaya = bookoff.replace(
    /^([a-zA-Z]{2,8})(\d{2,6}[a-zA-Z]?)$/,
    "$1-$2"
  );

  return { surugaya, bookoff };
}

function toHalfWidth(str) {
  return String(str || "").replace(/[０-９，]/g, (s) => {
    if (s === "，") return ",";
    return String.fromCharCode(s.charCodeAt(0) - 0xfee0);
  });
}

function cleanText(str) {
  return toHalfWidth(String(str || ""))
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function extractPrices(text) {
  const normalized = cleanText(text);
  const prices = [];
  const re = /([0-9][0-9,]{1,8})\s*円/g;
  let m;
  while ((m = re.exec(normalized))) {
    const n = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0 && n < 10000000) {
      prices.push(n);
    }
  }
  return [...new Set(prices)];
}

function pickBuyPrice(text) {
  const normalized = cleanText(text);

  const patterns = [
    /買取価格[^0-9]{0,40}([0-9][0-9,]{1,8})\s*円/,
    /買取[^0-9]{0,40}([0-9][0-9,]{1,8})\s*円/,
    /価格[^0-9]{0,40}([0-9][0-9,]{1,8})\s*円/
  ];

  for (const p of patterns) {
    const m = normalized.match(p);
    if (m) return Number(m[1].replace(/,/g, ""));
  }

  const prices = extractPrices(normalized);
  if (!prices.length) return null;
  return Math.max(...prices);
}

function extractReleaseDate(text) {
  const normalized = cleanText(text);
  const patterns = [
    /発売日[:：]?\s*([0-9]{4}[\/年.-][0-9]{1,2}[\/月.-][0-9]{1,2}日?)/,
    /発売年月日[:：]?\s*([0-9]{4}[\/年.-][0-9]{1,2}[\/月.-][0-9]{1,2}日?)/,
    /([0-9]{4}[\/年.-][0-9]{1,2}[\/月.-][0-9]{1,2}日?)\s*発売/
  ];
  for (const p of patterns) {
    const m = normalized.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractModel(text, q) {
  const normalized = cleanText(text);
  const qText = String(q || "").trim();

  if (qText && !/^\d{8,14}$/.test(qText)) return qText;

  const patterns = [
    /型番[:：]?\s*([A-Za-z0-9-]{3,20})/,
    /規格品番[:：]?\s*([A-Za-z0-9-]{3,20})/,
    /\b([A-Z]{2,8}-?\d{2,6}[A-Z]?)\b/
  ];

  for (const p of patterns) {
    const m = normalized.match(p);
    if (m) return m[1];
  }

  return null;
}

function extractGenre($, text) {
  const crumbs = [];
  $("a, span, li").each((_, el) => {
    const t = cleanText($(el).text());
    if (
      t &&
      t.length <= 30 &&
      /(CD|DVD|Blu-ray|ブルーレイ|フィギュア|ゲーム|本|コミック|アニメ|洋楽|邦楽|おもちゃ|ホビー)/.test(t)
    ) {
      crumbs.push(t);
    }
  });

  const unique = [...new Set(crumbs)];
  if (unique.length) return unique.slice(0, 3).join(" / ");

  const m = cleanText(text).match(/(洋楽CD|邦楽CD|アニメ系CD|中古CD|DVD|Blu-ray|ゲーム|フィギュア|コミック|書籍)/);
  return m ? m[1] : null;
}

function extractTitle($) {
  const candidates = [];
  ["h1", "h2", ".title", ".item_title", ".product-title", "title"].forEach((sel) => {
    $(sel).each((_, el) => {
      const t = cleanText($(el).text());
      if (t && t.length > 2 && t.length < 180) candidates.push(t);
    });
  });
  return candidates[0] || null;
}

function firstLink($, baseUrl) {
  const hrefs = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const text = cleanText($(el).text());
    if (!href) return;
    if (/(detail|product|item|goods|kaitori)/i.test(href) || /買取|中古|商品/.test(text)) {
      try {
        hrefs.push(new URL(href, baseUrl).toString());
      } catch {}
    }
  });
  return hrefs[0] || baseUrl;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
    },
    redirect: "follow"
  });

  const html = await res.text();

  return {
    ok: res.ok,
    status: res.status,
    finalUrl: res.url,
    html
  };
}

function parseHtml(html, baseUrl, q) {
  const $ = cheerio.load(html);
  const text = $("body").text() || html;

  return {
    price: pickBuyPrice(text),
    title: extractTitle($),
    genre: extractGenre($, text),
    releaseDate: extractReleaseDate(text),
    model: extractModel(text, q),
    detailUrl: firstLink($, baseUrl),
    pricesFound: extractPrices(text).slice(0, 12)
  };
}

async function fetchShop(kind, keyword) {
  const isA = kind === "A";
  const url = isA
    ? `https://www.suruga-ya.jp/kaitori/search_buy?category=&search_word=${encodeURIComponent(keyword)}&searchbox=1`
    : `https://www.bookoffonline.co.jp/boleccontent/bolbuysearch/buysearch/display?q=${encodeURIComponent(keyword)}`;

  try {
    const got = await fetchHtml(url);
    const parsed = parseHtml(got.html, got.finalUrl || url, keyword);

    return {
      ok: got.ok,
      status: got.status,
      keyword,
      url,
      finalUrl: got.finalUrl,
      ...parsed
    };
  } catch (error) {
    return {
      ok: false,
      keyword,
      url,
      price: null,
      title: null,
      genre: null,
      releaseDate: null,
      model: null,
      detailUrl: url,
      error: error.message || String(error)
    };
  }
}

export default async function handler(req, res) {
  const q = String(req.query.q || "").trim();

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  if (!q) {
    return res.status(400).json({ ok: false, error: "q is required" });
  }

  const { surugaya, bookoff } = normalizeSearchKeywords(q);

  const [a, b] = await Promise.all([
    fetchShop("A", surugaya),
    fetchShop("B", bookoff)
  ]);

  const diff =
    typeof a.price === "number" && typeof b.price === "number"
      ? a.price - b.price
      : null;

  res.status(200).json({
    ok: true,
    input: q,
    normalized: { A: surugaya, B: bookoff },
    A: a,
    B: b,
    diff
  });
}
