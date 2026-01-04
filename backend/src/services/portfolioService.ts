import { StockHolding, Portfolio, SectorSummary } from '../types/portfolio';
import { getMultipleStockQuotes } from './financeService';

export function calculateStockMetrics(stock: StockHolding): StockHolding {
  const investment = stock.purchasePrice * stock.quantity;
  const presentValue = stock.cmp ? stock.cmp * stock.quantity : 0;
  const gainLoss = presentValue - investment;

  return {
    ...stock,
    investment,
    presentValue,
    gainLoss,
  };
}

export function calculatePortfolioPercentages(stocks: StockHolding[]): StockHolding[] {
  const totalInvestment = stocks.reduce((sum, stock) => {
    return sum + (stock.purchasePrice * stock.quantity);
  }, 0);

  if (totalInvestment === 0) {
    return stocks;
  }

  return stocks.map(stock => {
    const investment = stock.purchasePrice * stock.quantity;
    const portfolioPercent = (investment / totalInvestment) * 100;
    
    return {
      ...stock,
      portfolioPercent: Math.round(portfolioPercent * 100) / 100,
    };
  });
}

export function groupBySector(stocks: StockHolding[]): SectorSummary[] {
  const sectorMap = new Map<string, StockHolding[]>();

  stocks.forEach(stock => {
    const sector = stock.sector || 'Unknown';
    if (!sectorMap.has(sector)) {
      sectorMap.set(sector, []);
    }
    sectorMap.get(sector)!.push(stock);
  });

  const sectorSummaries: SectorSummary[] = [];
  
  sectorMap.forEach((sectorStocks, sector) => {
    const totalInvestment = sectorStocks.reduce((sum, stock) => {
      return sum + (stock.purchasePrice * stock.quantity);
    }, 0);

    const totalPresentValue = sectorStocks.reduce((sum, stock) => {
      return sum + (stock.presentValue || 0);
    }, 0);

    const totalGainLoss = totalPresentValue - totalInvestment;

    sectorSummaries.push({
      sector,
      totalInvestment: Math.round(totalInvestment * 100) / 100,
      totalPresentValue: Math.round(totalPresentValue * 100) / 100,
      totalGainLoss: Math.round(totalGainLoss * 100) / 100,
      stocks: sectorStocks,
    });
  });

  return sectorSummaries.sort((a, b) => b.totalInvestment - a.totalInvestment);
}

export async function enrichStocksWithMarketData(stocks: StockHolding[]): Promise<StockHolding[]> {
  const symbols = stocks.map(stock => ({
    symbol: stock.particulars,
    exchange: stock.exchange,
  }));

  const quotes = await getMultipleStockQuotes(symbols);

  return stocks.map(stock => {
    const quote = quotes.get(stock.particulars);
    
    if (quote) {
      const cmp = quote.regularMarketPrice || undefined;
      const peRatio = quote.peRatio || undefined;
      const latestEarnings = quote.earningsPerShare || undefined;
      const presentValue = cmp ? cmp * stock.quantity : undefined;
      const investment = stock.purchasePrice * stock.quantity;
      const gainLoss = presentValue !== undefined ? presentValue - investment : undefined;

      return {
        ...stock,
        cmp,
        peRatio,
        latestEarnings,
        presentValue,
        gainLoss,
      };
    }

    return stock;
  });
}

export async function buildPortfolio(rawStocks: StockHolding[]): Promise<Portfolio> {
  let enrichedStocks = await enrichStocksWithMarketData(rawStocks);

  enrichedStocks = enrichedStocks.map(calculateStockMetrics);

  enrichedStocks = calculatePortfolioPercentages(enrichedStocks);

  const sectors = groupBySector(enrichedStocks);

  const totalInvestment = enrichedStocks.reduce((sum, stock) => {
    return sum + (stock.purchasePrice * stock.quantity);
  }, 0);

  const totalPresentValue = enrichedStocks.reduce((sum, stock) => {
    return sum + (stock.presentValue || 0);
  }, 0);

  const totalGainLoss = totalPresentValue - totalInvestment;

  return {
    stocks: enrichedStocks,
    sectors,
    totalInvestment: Math.round(totalInvestment * 100) / 100,
    totalPresentValue: Math.round(totalPresentValue * 100) / 100,
    totalGainLoss: Math.round(totalGainLoss * 100) / 100,
  };
}

