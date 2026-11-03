const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let players = []; // { id, name, socket, hand }
let field = [];
let turnIndex = 0;
let lastPlayerIndex = null;
let gameStarted = false;
let needsSpade3 = true; // 最初に♠3を出す必要があるか

function createDeck() {
  const suits = ['S', 'H', 'D', 'C'];
  let deck = [];
  for (let s of suits) {
    for (let n = 1; n <= 13; n++) {
      let val = n === 1 ? 14 : (n === 2 ? 15 : n);
      deck.push({ suit: s, num: val, orig: n });
    }
  }
  return deck.sort(() => Math.random() - 0.5);
}

function startGame() {
  if (players.length < 1) return;
  const deck = createDeck();
  let pIdx = 0;
  players.forEach(p => p.hand = []);
  while (deck.length > 0) {
    players[pIdx].hand.push(deck.pop());
    pIdx = (pIdx + 1) % players.length;
  }
  players.forEach(p => p.hand.sort((a, b) => a.num - b.num));
  
  field = [];
  gameStarted = true;
  needsSpade3 = true;

  // ♠3を持っているプレイヤーを探して最初のターンにする
  let spade3Owner = players.findIndex(p => p.hand.some(c => c.suit === 'S' && c.orig === 3));
  turnIndex = spade3Owner !== -1 ? spade3Owner : 0;
  lastPlayerIndex = null;

  broadcastState();
}

function broadcastState() {
  players.forEach((p, idx) => {
    p.socket.emit('updateState', {
      gameStarted: gameStarted,
      isHost: idx === 0,
      players: players.map((pl, i) => ({ name: pl.name, cardCount: pl.hand.length, isHost: i === 0 })),
      field: field,
      turnIndex: turnIndex,
      hand: p.hand,
      isMyTurn: gameStarted && (idx === turnIndex),
      needsSpade3: needsSpade3 && gameStarted
    });
  });
}

io.on('connection', (socket) => {
  socket.on('join', (name) => {
    const isFirst = players.length === 0;
    players.push({ id: socket.id, name: name, socket: socket, hand: [] });
    broadcastState();
  });

  socket.on('start-game', () => {
    // ホスト（最初に入った人）だけがスタート可能
    if (players.length > 0 && players[0].id === socket.id) {
      startGame();
    }
  });

  socket.on('playCards', (indices) => {
    const pIdx = players.findIndex(p => p.id === socket.id);
    if (!gameStarted || pIdx !== turnIndex) return;

    const selected = indices.map(i => players[pIdx].hand[i]).filter(Boolean);
    if (selected.length === 0) return;

    // 初回：♠3縛りのチェック
    if (needsSpade3) {
      const hasSpade3 = selected.some(c => c.suit === 'S' && c.orig === 3);
      if (!hasSpade3) {
        socket.emit('alert', '最初は「♠3」を含めて出してください。');
        return;
      }
    }

    // 枚数チェック
    if (field.length > 0 && selected.length !== field.length) {
      socket.emit('alert', '出すカードの枚数が場と一致しません。');
      return;
    }

    // 強さチェック
    const cardVal = selected[0].num;
    if (field.length > 0) {
      const fieldVal = field[0].num;
      if (cardVal <= fieldVal) {
        socket.emit('alert', 'もっと強いカードを出してください。');
        return;
      }
    }

    // 手札から削除
    indices.sort((a, b) => b - a).forEach(i => players[pIdx].hand.splice(i, 1));
    field = selected;
    lastPlayerIndex = pIdx;
    needsSpade3 = false; // 一度出たら解除

    // 上がり判定
    if (players[pIdx].hand.length === 0) {
      io.emit('alert', `🎉 ${players[pIdx].name} が上がりました！`);
      gameStarted = false;
      setTimeout(() => { broadcastState(); }, 2000);
      return;
    }

    turnIndex = (turnIndex + 1) % players.length;
    broadcastState();
  });

  socket.on('pass', () => {
    const pIdx = players.findIndex(p => p.id === socket.id);
    if (!gameStarted || pIdx !== turnIndex) return;

    if (needsSpade3) {
      socket.emit('alert', '最初はパスできません。♠3を出してください。');
      return;
    }

    turnIndex = (turnIndex + 1) % players.length;

    if (lastPlayerIndex !== null && turnIndex === lastPlayerIndex) {
      field = [];
      lastPlayerIndex = null;
    }
    broadcastState();
  });

  socket.on('disconnect', () => {
    const pIdx = players.findIndex(p => p.id === socket.id);
    if (pIdx !== -1) {
      players.splice(pIdx, 1);
      if (players.length === 0) {
        gameStarted = false;
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
