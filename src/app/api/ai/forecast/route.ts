export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getHistory } from "@/lib/market/yahoo";
import * as ti from "technicalindicators";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function padLeft(arr: number[], targetLen: number): number[] {
  const pad = targetLen - arr.length;
  if (pad <= 0) return arr;
  return [...Array(pad).fill(NaN), ...arr];
}

function nextTradingDays(fromSec: number, n: number): number[] {
  const days: number[] = [];
  let d = new Date(fromSec * 1000);
  while (days.length < n) {
    d = new Date(d.getTime() + 86400000);
    if (d.getDay() !== 0 && d.getDay() !== 6)
      days.push(Math.floor(d.getTime() / 1000));
  }
  return days;
}

function fmt(n: number, dec = 2): string {
  return isNaN(n) ? "-   " : n.toFixed(dec);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const ticker   = (sp.get("ticker")    ?? "AAPL").toUpperCase();
  const nHistory  = Math.min(252, Math.max(30,  parseInt(sp.get("nHistory")  ?? "90")));
  const nForecast = Math.min(30,  Math.max(3,   parseInt(sp.get("nForecast") ?? "15")));

  try {
    // Fetch enough calendar days to cover nHistory trading days + warm-up for EMA-200
    const calDays = Math.ceil(Math.max(nHistory, 200) * 1.5) + 30;
    const from = new Date(Date.now() - calDays * 86400000);
    const bars = await getHistory(ticker, "1d", from);

    if (bars.length < 20) {
      return NextResponse.json({ error: "Insufficient historical data" }, { status: 400 });
    }

    // Use last nHistory bars for the prompt; keep extra bars for EMA-200 warm-up
    const allCloses = bars.map(b => b.close);
    const allHighs  = bars.map(b => b.high);
    const allLows   = bars.map(b => b.low);
    const N = bars.length;

    // Compute indicators over full bar set, then slice last nHistory
    const rsiRaw  = padLeft(ti.RSI.calculate({ period: 14, values: allCloses }), N);
    const ema50Raw = padLeft(
      allCloses.length >= 50 ? ti.EMA.calculate({ period: 50, values: allCloses }) : [],
      N
    );
    const ema200Raw = padLeft(
      allCloses.length >= 200 ? ti.EMA.calculate({ period: 200, values: allCloses }) : [],
      N
    );
    const adxRaw = padLeft(
      (ti.ADX.calculate({ close: allCloses, high: allHighs, low: allLows, period: 14 }) as { adx: number }[]).map(r => r.adx),
      N
    );

    // Slice to the requested window for the prompt
    const slice    = bars.slice(-nHistory);
    const rsi      = rsiRaw.slice(-nHistory);
    const ema50    = ema50Raw.slice(-nHistory);
    const ema200   = ema200Raw.slice(-nHistory);
    const adx      = adxRaw.slice(-nHistory);

    const lastClose = slice[slice.length - 1].close;
    const lastDate  = new Date(slice[slice.length - 1].time * 1000).toISOString().split("T")[0];

    // Build compact data table
    const header = "Date       | Close    | RSI(14) | EMA(50)  | EMA(200) | ADX(14) | MA Trend";
    const rows = slice.map((bar, i) => {
      const date  = new Date(bar.time * 1000).toISOString().split("T")[0];
      const trend = !isNaN(ema50[i]) && !isNaN(ema200[i])
        ? ema50[i] > ema200[i] ? "Bull" : "Bear"
        : "  - ";
      return `${date} | ${fmt(bar.close)} | ${fmt(rsi[i], 1).padEnd(7)} | ${fmt(ema50[i]).padEnd(8)} | ${fmt(ema200[i]).padEnd(8)} | ${fmt(adx[i], 1).padEnd(7)} | ${trend}`;
    });

    const systemPrompt = `You are a quantitative price forecasting model. Analyze daily price history and technical indicators, then predict future closing prices under three scenarios.

Output ONLY valid JSON — no other text, no markdown fences:
{"bear":[${nForecast} numbers],"base":[${nForecast} numbers],"bull":[${nForecast} numbers],"analysis":"one concise sentence"}

Rules:
- Each array has exactly ${nForecast} positive numbers (daily closing prices, oldest first)
- Prices must be realistic and anchored to the last close of $${lastClose.toFixed(2)}
- Bear: pessimistic scenario | Base: most likely | Bull: optimistic`;

    const userMessage = `Stock: ${ticker}
Last close (${lastDate}): $${lastClose.toFixed(2)}
Predict the next ${nForecast} trading day closing prices.

Historical data — ${slice.length} trading days, oldest to newest:
${header}
${rows.join("\n")}`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      thinking: { type: "disabled" },
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "";

    // Extract JSON object from response
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`No JSON in response: ${raw.slice(0, 200)}`);

    const parsed = JSON.parse(match[0]) as {
      bear?: unknown; base?: unknown; bull?: unknown; analysis?: string;
    };

    const normalize = (arr: unknown): number[] => {
      if (!Array.isArray(arr)) throw new Error("Scenario is not an array");
      const nums = arr.map(Number).filter(x => isFinite(x) && x > 0);
      while (nums.length < nForecast) nums.push(nums[nums.length - 1] ?? lastClose);
      return nums.slice(0, nForecast);
    };

    const futureDates = nextTradingDays(slice[slice.length - 1].time, nForecast);
    // Return last 120 historical bars for the chart
    const historical = bars.slice(-Math.min(nHistory, 120)).map(b => ({ time: b.time, close: b.close }));

    return NextResponse.json({
      ticker,
      historical,
      lastClose,
      futureDates,
      scenarios: {
        bear: normalize(parsed.bear),
        base: normalize(parsed.base),
        bull: normalize(parsed.bull),
      },
      analysis: typeof parsed.analysis === "string" ? parsed.analysis : "",
      nHistory: slice.length,
      nForecast,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
