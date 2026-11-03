const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 超軽量なインラインフロントエンド（HTML + CSS + JS）
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>シンプル大富豪</title>
<style>
  body { font-family: sans-serif; background: #111; color: #fff; margin: 0; padding: 10px; display: flex; flex-direction: column; align-items: center; justify-content: space-between; height: 95vh; box-sizing: border-box; }
  h2 { margin: 5px 0; font-size: 1.2rem; }
  .box { background: #222; border: 1px solid #444; padding: 10px; border-radius: 6px; width: 100%; max-width: 500px; text-align: center; margin-bottom: 8px; }
  #field { min-height: 70px; display: flex; justify-content: center; align-items: center; gap: 5px; flex-wrap: wrap; }
  .card { background: #fff; color: #000; border-radius: 4px; width: 40px; height: 60px; display: flex; flex-direction: column; justify-content: space-between; padding: 3px; font-weight: bold; cursor: pointer; user-select: none; border: 1px solid #ccc; font-size: 0.9rem; }
  .card.red { color: #d00; }
  .card.selected { transform: translateY(-10px); border-color: #ff0; background: #fffae6; }
  .hand-container { display: flex; gap: 5px; flex-wrap: wrap; justify-content: center; min-height: 70px; align-items: center; }
  button { background: #333; color: #fff; border: 1px solid #666; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 1rem; }
  button:hover { background: #555; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  #log { font-size: 0.85rem; height: 50px; overflow-y: auto; text-align: left; background: #1a1a1a; padding: 5px; border-radius: 4px; }
  .players-list { display: flex; justify-content: space-around; font-size: 0.85rem; width: 100%; max-width: 500px; margin-bottom: 5px; }
  .player-item { padding: 3px 8px; border-radius: 4px; background: #222; }
  .player-item.active { border: 1px solid #0f0; color: #0f0; }
</style>
</head>
<body>
  <div>
    <h2>大富豪オンライン</h2>
    <div id="login-screen" class="box">
      <input type="text" id="nameInput" placeholder="プレイヤー名" maxlength="10" style="padding: 6px; font-size: 1rem;">
      <button onclick="joinGame()">入室する</button>
    </div>
    
    <div id="game-screen" style="display:none; width:100%; max-width:500px; display:none; flex-direction:column; align-items:center;">
      <div class="players-list" id="playersList"></div>
      <div class="box">
        <div style="font-size:0.8rem; color:#aaa; margin-bottom:3px;">場札</div>
        <div id="field">パス（場は空）</div>
      </div>
      <div class="box" style="flex-grow:1; display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <div style="font-size:0.8rem; color:#aaa; margin-bottom:3px;">あなたの手札</div>
          <div id="hand" class="hand-container"></div>
        </div>
        <div style="margin-top:10px; display:flex; gap:10px; justify-content:center;">
          <button id="btnPlay" onclick="playCards()" disabled>提出する</button>
          <button id="btnPass" onclick="passTurn()" disabled>パス</button>
        </div>
      </div>
      <div class="box" style="margin-bottom:0;">
        <div id="log"></div>
      </div>
    </div>
  </div>

<script src="/socket.io/socket.io.js"></script>
<script>
  const socket = io();
  let myHand = [];
  let selectedIndices = new Set();
  let isMyTurn = false;

  function joinGame() {
    const name = document.getElementById('nameInput').value.trim();
    if (!name) return alert('名前を入力してください');
    socket.emit('join', name);
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';
  }

  socket.on('updateState', (state) => {
    // プレイヤー一覧
    const pList = document.getElementById('playersList');
    pList.innerHTML = state.players.map((p, idx) => 
      \`<div class="player-item \${idx === state.turnIndex ? 'active' : ''}">\${p.name} (\${p.cardCount})</div>\`
    ).join('');

    // 場札
    const field = document.getElementById('field');
    if (state.field.length === 0) {
      field.innerHTML = '<span style="color:#777">場は流れています</span>';
    } else {
      field.innerHTML = state.field.map(c => renderCardHtml(c)).join('');
    }

    // 手札
    myHand = state.hand || [];
    selectedIndices.clear();
    renderHand();

    // ターン判定
    isMyTurn = state.isMyTurn;
    document.getElementById('btnPlay').disabled = !isMyTurn;
    document.getElementById('btnPass').disabled = !isMyTurn;
  });

  socket.on('log', (msg) => {
    const logDiv = document.getElementById('log');
    logDiv.innerHTML += msg + '<br>';
    logDiv.scrollTop = logDiv.scrollHeight;
  });

  function renderCardHtml(card) {
    const suits = { S: '♠', H: '♥', D: '♦', C: '♣' };
    const numMap = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K', 14: '2' };
    const numStr = numMap[card.num] || card.num;
    const isRed = card.suit === 'H' || card.suit === 'D';
    return \`<div class="card \${isRed ? 'red' : ''}"><span>\${numStr}</span><span style="align-self:center; font-size:1.2rem;">\${suits[card.suit]}</span><span style="align-self:flex-end;">\${numStr}</span></div>\`;
  }

  function renderHand() {
    const handDiv = document.getElementById('hand');
    handDiv.innerHTML = myHand.map((card, idx) => {
      const suits = { S: '♠', H: '♥', D: '♦', C: '♣' };
      const numMap = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K', 14: '2' };
      const numStr = numMap[card.num] || card.num;
      const isRed = card.suit === 'H' || card.suit === 'D';
      const isSelected = selectedIndices.has(idx);
      return \`<div class="card \${isRed ? 'red' : ''} \${isSelected ? 'selected' : ''}" onclick="toggleSelect(\${idx})">
        <span>\${numStr}</span><span style="align-self:center; font-size:1.2rem;">\${suits[card.suit]}</span><span style="align-self:flex-end;">\${numStr}</span>
      </div>\`;
    }).join('');
  }

  function toggleSelect(idx) {
    if (!isMyTurn) return;
    if (selectedIndices.has(idx)) {
      selectedIndices.delete(idx);
    } else {
      selectedIndices.add(idx);
    }
    renderHand();
  }

  function playCards() {
    const indices = Array.from(selectedIndices);
    if (indices.length === 0) return;
    socket.emit('playCards', indices);
  }

  function passTurn() {
    socket.emit('pass');
  }
</script>
</body>
</html>`);
});

// ゲームの状態管理
let players = []; // { id, name, socket, hand }
let field = [];
let turnIndex = 0;
let lastPlayerIndex = null;

function createDeck() {
  const suits = ['S', 'H', 'D', 'C'];
  let deck = [];
  for (let s of suits) {
    for (let n = 1; n <= 13; n++) {
      // 大富豪の強さ調整 (3〜13, 1=A(14), 2=14)
      let val = n === 1 ? 14 : (n === 2 ? 15 : n);
      deck.push({ suit: s, num: val, orig: n });
    }
  }
  // シャッフル
  return deck.sort(() => Math.random() - 0.5);
}

function startGame() {
  if (players.length < 1) return;
  const deck = createDeck();
  let pIdx = 0;
  while (deck.length > 0) {
    players[pIdx].hand.push(deck.pop());
    pIdx = (pIdx + 1) % players.length;
  }
  // 手札を強さ順にソート
  players.forEach(p => p.hand.sort((a, b) => a.num - b.num));
  field = [];
  turnIndex = 0;
  lastPlayerIndex = null;
  io.emit('log', '--- ゲームが開始されました ---');
  broadcastState();
}

function broadcastState() {
  players.forEach((p, idx) => {
    p.socket.emit('updateState', {
      players: players.map(pl => ({ name: pl.name, cardCount: pl.hand.length })),
      field: field,
      turnIndex: turnIndex,
      hand: p.hand,
      isMyTurn: idx === turnIndex && players.length > 0
    });
  });
}

io.on('connection', (socket) => {
  socket.on('join', (name) => {
    players.push({ id: socket.id, name: name, socket: socket, hand: [] });
    io.emit('log', `${name}さんが参加しました。`);
    
    // 2人以上揃ったら自動スタート（または1人でもテスト可能に）
    if (players.length >= 2 && field.length === 0 && players[0].hand.length === 0) {
      startGame();
    } else {
      broadcastState();
    }
  });

  socket.on('playCards', (indices) => {
    const pIdx = players.findIndex(p => p.id === socket.id);
    if (pIdx !== turnIndex) return;

    // 選択されたカードの取得
    const selected = indices.map(i => players[pIdx].hand[i]).filter(Boolean);
    if (selected.length === 0) return;

    // 枚数チェック
    if (field.length > 0 && selected.length !== field.length) {
      socket.emit('log', '出すカードの枚数が場と一致しません。');
      return;
    }

    // 強さチェック
    const cardVal = selected[0].num;
    if (field.length > 0) {
      const fieldVal = field[0].num;
      if (cardVal <= fieldVal) {
        socket.emit('log', 'もっと強いカードを出してください。');
        return;
      }
    }

    // 手札から削除
    indices.sort((a, b) => b - a).forEach(i => players[pIdx].hand.splice(i, 1));
    field = selected;
    lastPlayerIndex = pIdx;
    io.emit('log', `${players[pIdx].name} が ${selected.length}枚 出しました。`);

    // 上がり判定
    if (players[pIdx].hand.length === 0) {
      io.emit('log', `🎉 ${players[pIdx].name} が上がりました！`);
      setTimeout(() => { startGame(); }, 3000);
      return;
    }

    // 次のターンへ
    turnIndex = (turnIndex + 1) % players.length;
    broadcastState();
  });

  socket.on('pass', () => {
    const pIdx = players.findIndex(p => p.id === socket.id);
    if (pIdx !== turnIndex) return;

    io.emit('log', `${players[pIdx].name} がパスしました。`);
    turnIndex = (turnIndex + 1) % players.length;

    // 全員一周して流れた場合
    if (lastPlayerIndex !== null && turnIndex === lastPlayerIndex) {
      field = [];
      lastPlayerIndex = null;
      io.emit('log', '場が流れました。');
    }
    broadcastState();
  });

  socket.on('disconnect', () => {
    const pIdx = players.findIndex(p => p.id === socket.id);
    if (pIdx !== -1) {
      io.emit('log', `${players[pIdx].name}さんが退出しました。`);
      players.splice(pIdx, 1);
      if (players.length === 0) {
        field = [];
        turnIndex = 0;
      } else {
        turnIndex = turnIndex % players.length;
        broadcastState();
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});