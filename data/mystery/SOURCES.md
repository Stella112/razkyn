# Mystery Market Day sources

All price data: Binance public spot klines, 1-minute interval, from https://data.binance.vision (free).
Tower = SOLUSDT, Factory = BTCUSDT, Harbor = ETHUSDT. Each day is one 300-minute window, closes rebased to 100.0000 at step 0.
Window rule: "volatile" days use the 300-minute window with the largest BTC high–low range; "ordinary" days use 14:00–19:00 UTC.
Which dates are in the set is private until after the demo (the files below list only what was fetched).

Days fetched: 23. Skipped (data missing): none.

Files downloaded (one per symbol per day):

- https://data.binance.vision/data/spot/daily/klines/SOLUSDT/1m/SOLUSDT-1m-<YYYY-MM-DD>.zip
- https://data.binance.vision/data/spot/daily/klines/BTCUSDT/1m/BTCUSDT-1m-<YYYY-MM-DD>.zip
- https://data.binance.vision/data/spot/daily/klines/ETHUSDT/1m/ETHUSDT-1m-<YYYY-MM-DD>.zip
