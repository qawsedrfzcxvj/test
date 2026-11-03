const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// 部屋ごとの状態を管理するオブジェクト
// rooms[roomName] = { players, field, turnIndex, lastPlayerIndex, gameStarted, needsSpade3 }
const rooms = {};

function getRoom(roomName) {
  if (!rooms[roomName]) {
    rooms[roomName] = {
      players: [],
      field: [],
      turnIndex: 0,
      lastPlayerIndex: null,
      gameStarted: false,
      needsSpade3: true
    };
  }
  return rooms[roomName];
}

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

function startGame(room) {
  if (room.players.length < 1) return;
  const deck = createDeck();
  let pIdx = 0;
  room.players.forEach(p => p.hand = []);
  while (deck.length > 0) {
    room.players[pIdx].hand.push(deck.pop());
    pIdx = (pIdx + 1) % room.players.length;
  }
  room.players.forEach(p => p.hand.sort((a, b) => a.num - b.num));
  
  room.field = [];
  room.gameStarted = true;
  room.needsSpade3 = true;

  let spade3Owner = room.players.findIndex(p => p.hand.some(c => c.suit === 'S' && c.orig === 3));
  room.turnIndex = spade3Owner !== -1 ? spade3Owner : 0;
  room.lastPlayerIndex = null;

  broadcastState(room);
}

function broadcastState(room) {
  room.players.forEach((p, idx) => {
    p.socket.emit('updateState', {
      gameStarted: room.gameStarted,
      isHost: idx === 0,
      players: room.players.map((pl, i) => ({ name: pl.name, cardCount: pl.hand.length, isHost: i === 0 })),
      field: room.field,
      turnIndex: room.turnIndex,
      hand: p.hand,
      isMyTurn: room.gameStarted && (idx === room.turnIndex),
      needsSpade3: room.needsSpade3 && room.gameStarted
    });
  });
}

io.on('connection', (socket) => {
  let currentRoomName = 'default';
  let currentPlayerName = '';

  socket.on('join', ({ roomName, name }) => {
    currentRoomName = roomName || 'default';
    currentPlayerName = name;
    socket.join(currentRoomName);

    const room = getRoom(currentRoomName);
    room.players.push({ id: socket.id, name: name, socket: socket, hand: [] });
    broadcastState(room);
  });

  socket.on('start-game', () => {
    const room = getRoom(currentRoomName);
    if (room.players.length > 0 && room.players[0].id === socket.id) {
      startGame(room);
    }
  });

  socket.on('playCards', (indices) => {
    const room = getRoom(currentRoomName);
    const pIdx = room.players.findIndex(p => p.id === socket.id);
    if (!room.gameStarted || pIdx !== room.turnIndex) return;

    const selected = indices.map(i => room.players[pIdx].hand[i]).filter(Boolean);
    if (selected.length === 0) return;

    if (room.needsSpade3) {
      const hasSpade3 = selected.some(c => c.suit === 'S' && c.orig === 3);
      if (!hasSpade3) {
        socket.emit('alert', '最初は「♠3」を含めて出してください。');
        return;
      }
    }

    if (room.field.length > 0 && selected.length !== room.field.length) {
      socket.emit('alert', '出すカードの枚数が場と一致しません。');
      return;
    }

    const cardVal = selected[0].num;
    if (room.field.length > 0) {
      const fieldVal = room.field[0].num;
      if (cardVal <= fieldVal) {
        socket.emit('alert', 'もっと強いカードを出してください。');
        return;
      }
    }

    indices.sort((a, b) => b - a).forEach(i => room.players[pIdx].hand.splice(i, 1));
    room.field = selected;
    room.lastPlayerIndex = pIdx;
    room.needsSpade3 = false;

    if (room.players[pIdx].hand.length === 0) {
      io.to(currentRoomName).emit('alert', `🎉 ${room.players[pIdx].name} が上がりました！`);
      room.gameStarted = false;
      setTimeout(() => { broadcastState(room); }, 2000);
      return;
    }

    room.turnIndex = (room.turnIndex + 1) % room.players.length;
    broadcastState(room);
  });

  socket.on('pass', () => {
    const room = getRoom(currentRoomName);
    const pIdx = room.players.findIndex(p => p.id === socket.id);
    if (!room.gameStarted || pIdx !== room.turnIndex) return;

    if (room.needsSpade3) {
      socket.emit('alert', '最初はパスできません。♠3を出してください。');
      return;
    }

    room.turnIndex = (room.turnIndex + 1) % room.players.length;

    if (room.lastPlayerIndex !== null && room.turnIndex === room.lastPlayerIndex) {
      room.field = [];
      room.lastPlayerIndex = null;
    }
    broadcastState(room);
  });

  socket.on('disconnect', () => {
    const room = getRoom(currentRoomName);
    if (!room) return;
    const pIdx = room.players.findIndex(p => p.id === socket.id);
    if (pIdx !== -1) {
      room.players.splice(pIdx, 1);
      if (room.players.length === 0) {
        delete rooms[currentRoomName];
      } else {
        room.turnIndex = room.turnIndex % room.players.length;
        broadcastState(room);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
