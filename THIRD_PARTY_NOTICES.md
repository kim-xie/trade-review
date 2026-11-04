# 第三方组件声明（Third-party notices）

本项目在浏览器端打包了以下开源组件。Apache-2.0 组件的许可证全文见 <http://www.apache.org/licenses/LICENSE-2.0>，
各组件的 LICENSE 随 npm 包分发（`node_modules/<包名>/LICENSE`）。

## TradingView Lightweight Charts™ —— Apache-2.0

用于 K 线复盘图表（`src/components/KlineChart.tsx`）。按其 README 要求：在页面中保留 NOTICE 归属文字，并提供到
<https://www.tradingview.com/> 的链接。本项目：图表上开启 `attributionLogo`（TradingView logo 链接），K 线复盘图下方、
工具页“设置 → K 线图表”和全站页脚均有文字链接。

NOTICE 原文（<https://github.com/tradingview/lightweight-charts/blob/master/NOTICE>）：

```
TradingView Lightweight Charts™
Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/
```

## Apache ECharts —— Apache-2.0

用于资金曲线（`src/components/EquityChart.tsx`）。NOTICE 原文（`node_modules/echarts/NOTICE`）：

```
Apache ECharts
Copyright 2017-2026 The Apache Software Foundation

This product includes software developed at
The Apache Software Foundation (https://www.apache.org/).
```

## 其他

| 组件 | 许可证 | 用途 |
|---|---|---|
| Dexie.js | Apache-2.0 | IndexedDB 封装 |
| SheetJS Community Edition（xlsx） | Apache-2.0 | xlsx / xls 解析 |
| Papa Parse | MIT | CSV 解析 |
| Next.js / React | MIT | 框架 |
