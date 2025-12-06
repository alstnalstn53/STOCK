// /api/quotes.js
// Vercel 서버리스 함수 – Polygon에서 여러 종목 가격을 한 번에 가져와서 프론트에 전달

export default async function handler(req, res) {
  // CORS (필수는 아니지만 안전하게)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const apiKey = process.env.POLYGON_KEY;
  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "POLYGON_KEY is not set in environment variables",
    });
  }

  const { symbols } = req.query;
  if (!symbols || typeof symbols !== "string") {
    return res
      .status(400)
      .json({ success: false, error: "Query param ?symbols=SYM1,SYM2,... is required" });
  }

  // "AAPL, msft , nvda" → ["AAPL","MSFT","NVDA"]
  const tickers = symbols
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (tickers.length === 0) {
    return res
      .status(400)
      .json({ success: false, error: "No valid symbols provided" });
  }

  // Polygon 스냅샷 API는 한 번에 여러 종목을 받을 수 있으므로
  // 너무 많을 때를 대비해 배치로 나눔 (예: 40개씩)
  const BATCH_SIZE = 40;
  const quotes = {};

  try {
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE);
      const tickersParam = encodeURIComponent(batch.join(","));

      const url =
        `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers` +
        `?tickers=${tickersParam}&apiKey=${apiKey}`;

      const resp = await fetch(url);
      if (!resp.ok) {
        console.error("Polygon HTTP error", resp.status, await resp.text());
        continue;
      }

      const data = await resp.json();
      if (!data || !Array.isArray(data.tickers)) continue;

      data.tickers.forEach((t) => {
        const sym = (t.ticker || "").toUpperCase();
        const price = t.lastTrade && typeof t.lastTrade.p === "number"
          ? t.lastTrade.p
          : null;
        const change =
          typeof t.todaysChange === "number" ? t.todaysChange : null;
        const changePct =
          typeof t.todaysChangePerc === "number" ? t.todaysChangePerc : null;

        quotes[sym] = { price, change, changePct };
      });
    }

    return res.status(200).json({
      success: true,
      count: Object.keys(quotes).length,
      quotes,
    });
  } catch (err) {
    console.error("Polygon fetch error", err);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch quotes from Polygon",
    });
  }
}
