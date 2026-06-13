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
  active: false,
  latencia: 0,
  lastTick: null,
  logs: [],
};

let ws;
let pingTime = Date.now();

// ================= DERIV =================
function connectDeriv() {
  if (ws) ws.terminate();

  ws = new WebSocket(
    `wss://ws.derivws.com/websockets/v3?app_id=${process.env.APP_ID}`
  );

  ws.on("open", () => {
    console.log("🟢 DERIV CONNECTED");

    ws.send(
      JSON.stringify({
        authorize: process.env.DERIV_TOKEN_DEMO,
      })
    );
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

      if (state.logs.length > 20) state.logs.pop();
    }

    if (data.msg_type === "time") {
      state.latencia = Date.now() - pingTime;
    }
  });

  ws.on("close", () => {
    console.log("🔴 reconnecting...");
    setTimeout(connectDeriv, 3000);
  });
}

setInterval(() => {
  if (ws && ws.readyState === 1) {
    pingTime = Date.now();
    ws.send(JSON.stringify({ time: 1 }));
  }
}, 2000);

connectDeriv();

// ================= API =================
app.get("/api/state", (req, res) => {
  res.json(state);
});

// ================= FRONT =================
app.get("/", (req, res) => {
  res.send(`
  <html style="background:#000;color:#0ff;font-family:monospace">
  <h1>AION CORE CLEAN</h1>
  <pre id="out">loading...</pre>

  <script>
    async function load(){
      const r = await fetch('/api/state');
      const j = await r.json();
      document.getElementById('out').innerText = JSON.stringify(j,null,2);
    }
    setInterval(load,1000);
    load();
  </script>
  </html>
  `);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 RUNNING ON", PORT);
});
