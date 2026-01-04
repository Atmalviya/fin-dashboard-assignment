import yahooFinance from 'yahoo-finance2';
import { StockQuote } from '../types/portfolio';
import { cache } from '../utils/cache';

export function formatSymbolForYahoo(symbol: string, exchange: string): string {
  const cleanSymbol = symbol.toUpperCase().trim();
  
  if (exchange.toUpperCase() === 'NSE') {
    return `${cleanSymbol}.NS`;
  } else if (exchange.toUpperCase() === 'BSE') {
    return `${cleanSymbol}.BO`;
  }
  
  return `${cleanSymbol}.NS`;
}

export async function getStockQuote(symbol: string, exchange: string): Promise<StockQuote | null> {
  try {
    const yahooSymbol = formatSymbolForYahoo(symbol, exchange);
    const cacheKey = `quote_${yahooSymbol}`;

    const cachedData = cache.get<StockQuote>(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const quote = await yahooFinance.quote(yahooSymbol);
    
    if (!quote) {
      return null;
    }

    const quoteAny = quote as any;
    
    const stockQuote: StockQuote = {
      symbol: yahooSymbol,
      regularMarketPrice: quote.regularMarketPrice,
      regularMarketPreviousClose: quote.regularMarketPreviousClose,
      peRatio: quote.trailingPE || quote.forwardPE,
      trailingPE: quote.trailingPE,
      forwardPE: quote.forwardPE,
      earningsPerShare: quoteAny.trailingEps || quoteAny.forwardEps || quoteAny.epsTrailingTwelveMonths || quoteAny.epsForward || undefined,
      trailingEps: quoteAny.trailingEps || quoteAny.epsTrailingTwelveMonths || undefined,
      forwardEps: quoteAny.forwardEps || quoteAny.epsForward || undefined,
      currency: quote.currency,
      exchange: quote.exchange,
    };

    cache.set(cacheKey, stockQuote, 15000);

    return stockQuote;
  } catch (error) {
    console.error(`Error fetching quote for ${symbol} (${exchange}):`, error);
    return null;
  }
}

export async function getMultipleStockQuotes(
  symbols: Array<{ symbol: string; exchange: string }>
): Promise<Map<string, StockQuote>> {
  const results = new Map<string, StockQuote>();
  
  const batchSize = 5;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    
    const promises = batch.map(async ({ symbol, exchange }) => {
      const quote = await getStockQuote(symbol, exchange);
      if (quote) {
        results.set(symbol, quote);
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    await Promise.all(promises);
    
    if (i + batchSize < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return results;
}

export async function getCurrentMarketPrice(symbol: string, exchange: string): Promise<number | null> {
  const quote = await getStockQuote(symbol, exchange);
  return quote?.regularMarketPrice || null;
}

export async function getPERatio(symbol: string, exchange: string): Promise<number | null> {
  const quote = await getStockQuote(symbol, exchange);
  return quote?.peRatio || null;
}

export async function getLatestEarnings(symbol: string, exchange: string): Promise<number | null> {
  const quote = await getStockQuote(symbol, exchange);
  return quote?.earningsPerShare || null;
}

export interface CandlestickData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export async function getHistoricalData(
  symbol: string,
  exchange: string,
  period: '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | 'max' = '1mo',
  interval: '1m' | '5m' | '15m' | '30m' | '1h' | '1d' | '1wk' | '1mo' = '1d'
): Promise<CandlestickData[]> {
  try {
    const yahooSymbol = formatSymbolForYahoo(symbol, exchange);
    const cacheKey = `historical_${yahooSymbol}_${period}_${interval}`;

    const cachedData = cache.get<CandlestickData[]>(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const now = new Date();
    const period1 = new Date();
    
    switch (period) {
      case '1d':
        period1.setDate(now.getDate() - 1);
        break;
      case '5d':
        period1.setDate(now.getDate() - 5);
        break;
      case '1mo':
        period1.setMonth(now.getMonth() - 1);
        break;
      case '3mo':
        period1.setMonth(now.getMonth() - 3);
        break;
      case '6mo':
        period1.setMonth(now.getMonth() - 6);
        break;
      case '1y':
        period1.setFullYear(now.getFullYear() - 1);
        break;
      case '2y':
        period1.setFullYear(now.getFullYear() - 2);
        break;
      case '5y':
        period1.setFullYear(now.getFullYear() - 5);
        break;
      case 'max':
        period1.setFullYear(now.getFullYear() - 10);
        break;
      default:
        period1.setMonth(now.getMonth() - 1);
    }

    const chartInterval = interval === '1m' ? '1m' :
                         interval === '5m' ? '5m' :
                         interval === '15m' ? '15m' :
                         interval === '30m' ? '30m' :
                         interval === '1h' ? '1h' :
                         interval === '1d' ? '1d' :
                         interval === '1wk' ? '1wk' :
                         interval === '1mo' ? '1mo' : '1d';

    const chartData = await yahooFinance.chart(yahooSymbol, {
      period1: period1,
      period2: now,
      interval: chartInterval as any,
    });

    if (!chartData || !chartData.quotes || chartData.quotes.length === 0) {
      console.warn(`No chart data returned for ${yahooSymbol}`);
      return [];
    }

    const candlestickData: CandlestickData[] = chartData.quotes.map((quote: any) => {
      const timestamp = quote.date ? Math.floor(new Date(quote.date).getTime() / 1000) : Math.floor(Date.now() / 1000);
      return {
        time: timestamp,
        open: quote.open || 0,
        high: quote.high || 0,
        low: quote.low || 0,
        close: quote.close || 0,
        volume: quote.volume || 0,
      };
    }).filter((item: CandlestickData) => item.open > 0 && item.close > 0);

    if (candlestickData.length === 0) {
      console.warn(`No valid candlestick data for ${yahooSymbol}`);
      return [];
    }

    const cacheTTL = interval.includes('m') || interval.includes('h') ? 60000 : 300000;
    cache.set(cacheKey, candlestickData, cacheTTL);

    console.log(`Fetched ${candlestickData.length} candlestick data points for ${yahooSymbol}`);
    return candlestickData;
  } catch (error) {
    console.error(`Error fetching historical data for ${symbol} (${exchange}):`, error);
    return [];
  }
}


