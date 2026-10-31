const { patternCatalog: legacyPatterns } = require("../lib/dragonx");
const { getPatternCatalog, patternCount } = require("../lib/pattern-engine");
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Use GET" });
  const advanced = getPatternCatalog();
  return res.status(200).json({
    engine: "DRAGON-X-880", version: "2.0.0", count: patternCount,
    banks: { "30S-trend": 220, "1M-trend": 220, "30S-number": 220, "1M-number": 220 },
    legacyPatternCount: legacyPatterns.length,
    patterns: advanced
  });
};
