import express from "express";
import "dotenv/config";
import WebSocket from "ws";

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   ESTADO GLOBAL DO SISTEMA
========================= */
const state = {
  connected: false,
  isDemo: true,
  banca: 0,
  pnl: 0,
  active: false,
  latencia: 0,
  indicadorTendencia: "NEUTRO",
  lastTick: null,
  logs: [],
  scanner: [
    { symbol: "R_75", preco: 0 },
    { symbol: "R_100", preco: 0 }
  ]
};

let ws;
let lastPing = Date.now();

/* =========================
   DERIV CONNECTION
========================= */
function conectarDeriv() {
  if (ws) try { ws.close(); } catch {}

  ws = new WebSocket(
    `wss://ws.derivws.com/websockets/v3?app_id=${process.env.APP_ID || 1089}`
  );

  ws.on("open", () => {
    state.connected = true;

    ws.send(JSON.stringify({
      authorize: state.isDemo
        ? process.env.DERIV_TOKEN_DEMO
        : process.env.DERIV_TOKEN_REAL
    }));

    addLog("SYSTEM", "Conectado na Deriv");
  });

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    /* AUTH */
    if (data.msg_type === "authorize") {
      ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
      ws.send(JSON.stringify({ ticks: "R_75,R_100", subscribe: 1 }));
      addLog("SYSTEM", "Autorizado na Deriv");
    }

    /* BALANCE */
    if (data.balance) {
      state.banca = Number(data.balance.balance || 0);
      addLog("DATA", `Saldo atualizado: ${state.banca}`);
    }

    /* TICKS */
    if (data.tick) {
      const tick = data.tick;

      state.lastTick = tick;

      const sc = state.scanner.find(s => s.symbol === tick.symbol);
      if (sc) sc.preco = tick.quote;

      addLog("TICK", `${tick.symbol} -> ${tick.quote}`);

      analisarTendencia();
    }

    /* LATÊNCIA SIMPLES */
    state.latencia = Date.now() - lastPing;
  });

  ws.on("close", () => {
    state.connected = false;
    addLog("SYSTEM", "Reconectando...");
    setTimeout(conectarDeriv, 3000);
  });

  ws.on("error", () => {
    state.connected = false;
  });
}

/* =========================
   TENDÊNCIA SIMPLES
========================= */
function analisarTendencia() {
  const r75 = state.scanner.find(s => s.symbol === "R_75")?.preco;

  if (!r75) return;

  if (r75 > 37000) state.indicadorTendencia = "ALTA";
  else if (r75 < 36000) state.indicadorTendencia = "BAIXA";
  else state.indicadorTendencia = "NEUTRO";
}

/* =========================
   LOGS
========================= */
function addLog(type, msg) {
  state.logs.unshift({
    time: new Date().toLocaleTimeString("pt-BR"),
    type,
    msg
  });

  if (state.logs.length > 30) state.logs.pop();
}

/* =========================
   KEEP ALIVE
========================= */
setInterval(() => {
  lastPing = Date.now();

  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ time: 1 }));
  } else {
    conectarDeriv();
  }
}, 5000);

/* START */
conectarDeriv();

/* =========================
   API JSON
========================= */
app.get("/api/state", (req, res) => {
  res.json(state);
});

/* =========================
   DASHBOARD HTML (FIX TELA BRANCA)
========================= */
app.get("/", (req, res) => {
  res.send(`
<!doctype html>
<html>
<head>
  <title>AION CORE</title>
  <style>
    body { background:#050b14; color:#00f2ff; font-family:Arial; }
    .box { border:1px solid #00f2ff; padding:15px; margin:10px; }
  </style>
</head>
<body>

<h1>AION CORE DASHBOARD</h1>

<div class="box">
  <h2>Status: <span id="c"></span></h2>
  <h2>Banca: <span id="b"></span></h2>
  <h2>Tendência: <span id="t"></span></h2>
</div>

<div class="box">
  <h3>Logs</h3>
  <div id="logs"></div>
</div>

<script>
async function load(){
  const r = await fetch('/api/state');
  const d = await r.json();

  document.getElementById('c').innerText = d.connected;
  document.getElementById('b').innerText = d.banca.toFixed(2);
  document.getElementById('t').innerText = d.indicadorTendencia;

  document.getElementById('logs').innerHTML =
    d.logs.map(l => '<div>' + l.time + ' ['+l.type+'] ' + l.msg + '</div>').join('');
}

setInterval(load, 1000);
load();
</script>

</body>
</html>
  `);
});

/* =========================
   START SERVER (RENDER)
========================= */
app.listen(PORT, "0.0.0.0", () => {
  console.log("AION CORE rodando na porta " + PORT);
});
