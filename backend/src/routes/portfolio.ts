import express, { Router } from 'express';
import { buildPortfolio } from '../services/portfolioService';
import { getStockQuote, getHistoricalData } from '../services/financeService';
import { samplePortfolio } from '../data/samplePortfolio';
import { ApiResponse, Portfolio, StockQuote } from '../types/portfolio';
import { webSocketService } from '../services/websocketService';

const router: Router = express.Router();


router.get('/', async (req, res) => {
  try {
    const portfolio = await buildPortfolio(samplePortfolio);
    
    const response: ApiResponse<Portfolio> = {
      success: true,
      data: portfolio,
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching portfolio:', error);
    const response: ApiResponse<null> = {
      success: false,
      error: 'Failed to fetch portfolio data',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

router.get('/stocks/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const exchange = (req.query.exchange as string) || 'NSE';

    const quote = await getStockQuote(symbol, exchange);
    
    if (!quote) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Stock not found',
        message: `Could not fetch data for ${symbol} on ${exchange}`,
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse<StockQuote> = {
      success: true,
      data: quote,
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching stock data:', error);
    const response: ApiResponse<null> = {
      success: false,
      error: 'Failed to fetch stock data',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

router.post('/trigger-update', async (req, res) => {
  try {
    await webSocketService.triggerUpdate();
    const response: ApiResponse<{ connectedClients: number }> = {
      success: true,
      data: {
        connectedClients: webSocketService.getConnectedClientsCount(),
      },
      message: 'Portfolio update triggered',
    };
    res.json(response);
  } catch (error) {
    console.error('Error triggering update:', error);
    const response: ApiResponse<null> = {
      success: false,
      error: 'Failed to trigger update',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

router.get('/chart-data/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    
    const chartData = webSocketService.getChartData(symbol, limit);
    
    const response: ApiResponse<typeof chartData> = {
      success: true,
      data: chartData,
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching chart data:', error);
    const response: ApiResponse<null> = {
      success: false,
      error: 'Failed to fetch chart data',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

router.get('/historical/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const exchange = (req.query.exchange as string) || 'NSE';
    const period = (req.query.period as any) || '1mo';
    const interval = (req.query.interval as any) || '1d';

    const historicalData = await getHistoricalData(symbol, exchange, period, interval);
    
    const response: ApiResponse<typeof historicalData> = {
      success: true,
      data: historicalData,
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching historical data:', error);
    const response: ApiResponse<null> = {
      success: false,
      error: 'Failed to fetch historical data',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

export default router;

