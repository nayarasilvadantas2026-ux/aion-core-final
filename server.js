import express from "express";
import WebSocket from "ws";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ================= STATE =================
const state = {
  connected: false,
  banca: 0,
  pnl: 0,
  latencia: 0,
  lastTick: null,
  logs: [],
};

let ws;
let pingTime = Date.now();

// ================= DERIV =================
function connect() {
  ws = new WebSocket(
    `wss://ws.derivws.com/websockets/v3?app_id=${process.env.APP_ID}`
  );

  ws.on("open", () => {
    ws.send(JSON.stringify({
      authorize: process.env.DERIV_TOKEN_DEMO
    }));
  });

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.msg_type === "authorize") {
      state.connected = true;
      ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
      ws.send(JSON.stringify({ ticks: "R_75", subscribe: 1 }));
    }

    if (data.msg_type === "balance") {
      state.banca = data.balance.balance;
    }

    if (data.tick) {
      state.lastTick = data.tick;

      state.logs.unshift({
        time: new Date().toLocaleTimeString(),
        msg: `${data.tick.symbol} ${data.tick.quote}`,
      });

      if (state.logs.length > 10) state.logs.pop();
    }

    if (data.msg_type === "time") {
      state.latencia = Date.now() - pingTime;
    }
  });

  ws.on("close", () => setTimeout(connect, 3000));
}

setInterval(() => {
  if (ws && ws.readyState === 1) {
    pingTime = Date.now();
    ws.send(JSON.stringify({ time: 1 }));
  }
}, 2000);

connect();

// ================= API =================
app.get("/api/state", (req, res) => {
  res.json(state);
});

// ================= DASHBOARD =================
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<title>AION CORE</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{margin:0;background:#05070d;color:#00f2ff;font-family:Arial}
.header{padding:20px;text-align:center;font-size:28px;font-weight:bold}
.card{margin:15px;padding:15px;background:#0b1220;border-radius:12px}
.big{font-size:40px;font-weight:bold}
.row{display:flex;justify-content:space-around}
.green{color:#00ff88}
.red{color:#ff4444}
</style>
</head>

<body>

<div class="header">⚡ AION CORE DASHBOARD</div>

<div class="card">
  <div>STATUS: <span id="status">...</span></div>
  <div>BALANCE</div>
  <div class="big" id="banca">0</div>
</div>

<div class="card">
  <div>LATÊNCIA: <span id="lat">0</span> ms</div>
  <div>ÚLTIMO TICK:</div>
  <div id="tick">--</div>
</div>

<div class="card">
  <div>LOGS</div>
  <div id="logs"></div>
</div>

<script>

async function load(){
  const r = await fetch('/api/state');
  const d = await r.json();

  document.getElementById('status').innerText =
    d.connected ? "CONECTADO" : "DESCONECTANDO";

  document.getElementById('banca').innerText =
    Number(d.banca).toFixed(2);

  document.getElementById('lat').innerText =
    d.latencia;

  document.getElementById('tick').innerText =
    d.lastTick ? d.lastTick.quote : "--";

  document.getElementById('logs').innerHTML =
    d.logs.map(l => `<div>• ${l.time} - ${l.msg}</div>`).join('');
}

setInterval(load, 1000);
load();

</script>

</body>
</html>
  `);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("RUNNING", PORT);
});
