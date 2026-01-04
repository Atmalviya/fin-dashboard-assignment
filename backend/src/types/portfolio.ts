export interface StockHolding {
  particulars: string;
  purchasePrice: number;
  quantity: number;
  investment: number;
  portfolioPercent: number;
  exchange: string;
  sector: string;
  cmp?: number;
  presentValue?: number;
  gainLoss?: number;
  peRatio?: number;
  latestEarnings?: number;
}

export interface SectorSummary {
  sector: string;
  totalInvestment: number;
  totalPresentValue: number;
  totalGainLoss: number;
  stocks: StockHolding[];
}

export interface Portfolio {
  stocks: StockHolding[];
  sectors: SectorSummary[];
  totalInvestment: number;
  totalPresentValue: number;
  totalGainLoss: number;
}

export interface StockQuote {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  peRatio?: number;
  trailingPE?: number;
  forwardPE?: number;
  earningsPerShare?: number;
  trailingEps?: number;
  forwardEps?: number;
  currency?: string;
  exchange?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface CandlestickData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface ChartDataPoint {
  timestamp: number;
  price: number;
  volume?: number;
}

export interface StockPriceUpdate {
  symbol: string;
  exchange: string;
  price: number;
  previousPrice?: number;
  change?: number;
  changePercent?: number;
  timestamp: number;
}

export interface WebSocketMessage {
  type: 'portfolio_update' | 'stock_price_update' | 'chart_data' | 'error' | 'connected' | 'subscribed';
  data?: Portfolio | StockPriceUpdate | ChartDataPoint[];
  stocks?: StockPriceUpdate[];
  error?: string;
  timestamp?: number;
  symbol?: string;
}

