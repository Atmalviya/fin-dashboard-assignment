import { WebSocketServer, WebSocket } from 'ws';
import { buildPortfolio } from './portfolioService';
import { getStockQuote, getMultipleStockQuotes } from './financeService';
import { samplePortfolio } from '../data/samplePortfolio';
import { Portfolio, WebSocketMessage, StockPriceUpdate, ChartDataPoint } from '../types/portfolio';

interface ClientSubscription {
  ws: WebSocket & { isAlive?: boolean };
  subscribedStocks?: Set<string>;
  subscribedToPortfolio: boolean;
}

class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, ClientSubscription> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;
  private stockUpdateInterval: NodeJS.Timeout | null = null;
  private updateIntervalMs: number = 15000;
  private stockUpdateIntervalMs: number = 5000;
  private priceHistory: Map<string, ChartDataPoint[]> = new Map();
  private maxHistoryPoints: number = 100;

  initialize(server: any): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket & { isAlive?: boolean }) => {
      console.log('New WebSocket client connected');
      ws.isAlive = true;
      
      const subscription: ClientSubscription = {
        ws,
        subscribedStocks: new Set(),
        subscribedToPortfolio: true,
      };
      this.clients.set(ws, subscription);

      this.sendToClient(ws, {
        type: 'connected',
        timestamp: Date.now(),
      });

      this.broadcastPortfolioUpdate();

      ws.on('message', (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleClientMessage(ws, data);
        } catch (error) {
          console.error('Error parsing client message:', error);
        }
      });

      ws.on('close', () => {
        console.log('WebSocket client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error: Error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });

      ws.on('pong', () => {
        ws.isAlive = true;
      });
    });

    this.startPeriodicUpdates();
    this.startStockPriceUpdates();

    setInterval(() => {
      this.clients.forEach((subscription) => {
        const ws = subscription.ws;
        if (ws.isAlive === false) {
          this.clients.delete(ws);
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    console.log('WebSocket server initialized on /ws');
    console.log('Dashboard and live charts support enabled');
  }

  private handleClientMessage(ws: WebSocket, data: any): void {
    const subscription = this.clients.get(ws);
    if (!subscription) return;

    if (data.type === 'subscribe_stocks' && Array.isArray(data.symbols)) {
      data.symbols.forEach((symbol: string) => {
        subscription.subscribedStocks?.add(symbol);
      });
      this.sendToClient(ws, {
        type: 'subscribed',
        symbol: data.symbols.join(','),
        timestamp: Date.now(),
      });
    }

    if (data.type === 'unsubscribe_stocks' && Array.isArray(data.symbols)) {
      data.symbols.forEach((symbol: string) => {
        subscription.subscribedStocks?.delete(symbol);
      });
    }

    if (data.type === 'subscribe_portfolio') {
      subscription.subscribedToPortfolio = true;
    }
    if (data.type === 'unsubscribe_portfolio') {
      subscription.subscribedToPortfolio = false;
    }
  }

  private startPeriodicUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(async () => {
      await this.broadcastPortfolioUpdate();
    }, this.updateIntervalMs);

    console.log(`Started periodic portfolio updates every ${this.updateIntervalMs}ms`);
  }

  private startStockPriceUpdates(): void {
    if (this.stockUpdateInterval) {
      clearInterval(this.stockUpdateInterval);
    }

    this.stockUpdateInterval = setInterval(async () => {
      await this.broadcastStockPriceUpdates();
    }, this.stockUpdateIntervalMs);

    console.log(`Started periodic stock price updates every ${this.stockUpdateIntervalMs}ms for live charts`);
  }

  async broadcastPortfolioUpdate(): Promise<void> {
    const subscribedClients = Array.from(this.clients.values()).filter(
      (sub) => sub.subscribedToPortfolio
    );

    if (subscribedClients.length === 0) {
      return;
    }

    try {
      const portfolio = await buildPortfolio(samplePortfolio);
      const message: WebSocketMessage = {
        type: 'portfolio_update',
        data: portfolio,
        timestamp: Date.now(),
      };

      subscribedClients.forEach((subscription) => {
        this.sendToClient(subscription.ws, message);
      });
    } catch (error) {
      console.error('Error broadcasting portfolio update:', error);
      const errorMessage: WebSocketMessage = {
        type: 'error',
        error: error instanceof Error ? error.message : 'Failed to fetch portfolio data',
        timestamp: Date.now(),
      };
      this.broadcast(errorMessage);
    }
  }

  async broadcastStockPriceUpdates(): Promise<void> {
    const subscribedStocks = new Set<string>();
    this.clients.forEach((subscription) => {
      subscription.subscribedStocks?.forEach((symbol) => {
        subscribedStocks.add(symbol);
      });
    });

    if (subscribedStocks.size === 0) {
      return;
    }

    try {
      const symbols = Array.from(subscribedStocks).map((symbol) => {
        const [stockSymbol, exchange] = symbol.includes(':')
          ? symbol.split(':')
          : [symbol, 'NSE'];
        return { symbol: stockSymbol, exchange };
      });

      const quotes = await getMultipleStockQuotes(symbols);

      const stockUpdates: StockPriceUpdate[] = [];
      const now = Date.now();

      quotes.forEach((quote, originalSymbol) => {
        const symbolKey = Array.from(subscribedStocks).find((s) => {
          const [sym] = s.includes(':') ? s.split(':') : [s, 'NSE'];
          return sym === originalSymbol;
        });

        if (symbolKey && quote.regularMarketPrice) {
          const history = this.priceHistory.get(symbolKey) || [];
          const previousPrice = history.length > 0 ? history[history.length - 1].price : undefined;

          const update: StockPriceUpdate = {
            symbol: originalSymbol,
            exchange: quote.exchange || 'NSE',
            price: quote.regularMarketPrice,
            previousPrice,
            change: previousPrice ? quote.regularMarketPrice - previousPrice : undefined,
            changePercent: previousPrice
              ? ((quote.regularMarketPrice - previousPrice) / previousPrice) * 100
              : undefined,
            timestamp: now,
          };

          stockUpdates.push(update);

          this.updatePriceHistory(symbolKey, quote.regularMarketPrice, now);
        }
      });

      if (stockUpdates.length === 0) {
        return;
      }

      this.clients.forEach((subscription) => {
        if (subscription.subscribedStocks && subscription.subscribedStocks.size > 0) {
          const clientUpdates = stockUpdates.filter((update) =>
            subscription.subscribedStocks?.has(update.symbol)
          );

          if (clientUpdates.length > 0) {
            if (clientUpdates.length === 1) {
              this.sendToClient(subscription.ws, {
                type: 'stock_price_update',
                data: clientUpdates[0],
                timestamp: now,
              });
            } else {
              this.sendToClient(subscription.ws, {
                type: 'stock_price_update',
                stocks: clientUpdates,
                timestamp: now,
              });
            }
          }
        }
      });
    } catch (error) {
      console.error('Error broadcasting stock price updates:', error);
    }
  }

  private updatePriceHistory(symbol: string, price: number, timestamp: number): void {
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
    }

    const history = this.priceHistory.get(symbol)!;
    history.push({ timestamp, price });

    if (history.length > this.maxHistoryPoints) {
      history.shift();
    }
  }

  getChartData(symbol: string, limit?: number): ChartDataPoint[] {
    const history = this.priceHistory.get(symbol) || [];
    if (limit) {
      return history.slice(-limit);
    }
    return history;
  }

  private broadcast(message: WebSocketMessage): void {
    const data = JSON.stringify(message);
    this.clients.forEach((subscription) => {
      const ws = subscription.ws;
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(data);
        } catch (error) {
          console.error('Error sending message to client:', error);
          this.clients.delete(ws);
        }
      }
    });
  }

  private sendToClient(client: WebSocket & { isAlive?: boolean }, message: WebSocketMessage): void {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending message to client:', error);
        this.clients.delete(client);
      }
    }
  }

  async triggerUpdate(): Promise<void> {
    await this.broadcastPortfolioUpdate();
  }

  setUpdateInterval(intervalMs: number): void {
    this.updateIntervalMs = intervalMs;
    this.startPeriodicUpdates();
  }

  setStockUpdateInterval(intervalMs: number): void {
    this.stockUpdateIntervalMs = intervalMs;
    this.startStockPriceUpdates();
  }

  getConnectedClientsCount(): number {
    return this.clients.size;
  }

  async triggerStockUpdate(): Promise<void> {
    await this.broadcastStockPriceUpdates();
  }

  close(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.stockUpdateInterval) {
      clearInterval(this.stockUpdateInterval);
      this.stockUpdateInterval = null;
    }

    this.clients.forEach((subscription) => {
      subscription.ws.close();
    });
    this.clients.clear();
    this.priceHistory.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    console.log('WebSocket server closed');
  }
}

export const webSocketService = new WebSocketService();

