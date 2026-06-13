const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

const PORT = 3000;
let rooms = {};

function createEmptyBoard() {
    const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    const board = [];
    
    for (let r of rows) {
        for (let c = 1; c <= 10; c++) {
            board.push({ r, c: c.toString(), status: 0 });
        }
    }

    const ships = [];
    while (ships.length < 12) {
        const randomRow = rows[Math.floor(Math.random() * rows.length)];
        const randomCol = (Math.floor(Math.random() * 10) + 1).toString();
        
        if (!ships.some(s => s.r === randomRow && s.c === randomCol)) {
            ships.push({ r: randomRow, c: randomCol });
        }
    }

    ships.forEach(s => {
        const cell = board.find(item => item.r === s.r && item.c === s.c);
        if (cell) cell.status = 4;
    });
    return board;
}

io.on('connection', (socket) => {
    console.log(`Підключився новий користувач: ${socket.id}`);

    let roomId = null;
    for (let id in rooms) {
        if (rooms[id].players.length < 2) {
            roomId = id;
            break;
        }
    }

    if (!roomId) {
        roomId = `room_${socket.id}`;
        rooms[roomId] = { players: [], boards: {}, turn: null };
    }

    socket.join(roomId);
    rooms[roomId].players.push(socket.id);
    rooms[roomId].boards[socket.id] = createEmptyBoard();

    console.log(`Гравець ${socket.id} доданий у кімнату: ${roomId} (Всього в кімнаті: ${rooms[roomId].players.length})`);

    if (rooms[roomId].players.length === 2) {
        rooms[roomId].turn = rooms[roomId].players[0];

        console.log(`Кімната ${roomId}: Двоє гравців на місці. Надсилаємо 'game_start'`);
        io.to(roomId).emit('game_start', {
            roomId: roomId,
            turn: rooms[roomId].turn
        });
        sendBoardsUpdate(roomId);
    } else {
        socket.emit('waiting', 'Очікування суперника...');
    }

    socket.on('shot', (data) => {
        console.log(`Отримано подію 'shot' від ${socket.id}`, data);

        if (!data || !data.roomId) {
            console.log(`Помилка: клієнт не передав roomId у події 'shot'`);
            return;
        }

        const room = rooms[data.roomId];
        if (!room) {
            console.log(`Помилка: кімнату з ID ${data.roomId} не знайдено на сервері.`);
            return;
        }

        if (room.turn !== socket.id) {
            console.log(`Гравець вистрілив не в свій хід. Зараз хід гравця: ${room.turn}`);
            return;
        }

        const opponentId = room.players.find(id => id !== socket.id);
        const opponentBoard = room.boards[opponentId];
        const target = opponentBoard.find(cell => cell.r === data.row && cell.c === data.col);

        if (!target) {
            console.log(`Помилка: Клітинку з координатами рядок:${data.row}, стовпець:${data.col} не знайдено.`);
            return;
        }

        if (target.status === 1 || target.status === 2) {
            console.log(`Сюди вже стріляли. статус ${target.status}`);
            return;
        }

        if (target.status === 4) {
            console.log(`Гравець ${socket.id} підбив корабель на ${data.row}${data.col}`);
            target.status = 2;
            
            const lostAll = !opponentBoard.some(cell => cell.status === 4);
            if (lostAll) {
                console.log(`🏆 ГРА ЗАКІНЧЕНА! Переміг ${socket.id}`);
                io.to(data.roomId).emit('game_over', { winner: socket.id });
                delete rooms[data.roomId];
                return;
            }
        } else {
            console.log(`Мимо! Постріл на ${data.row}${data.col}. Хід переходить до супротивника.`);
            target.status = 1;
            room.turn = opponentId;
        }

        io.to(data.roomId).emit('turn_update', { turn: room.turn });
        sendBoardsUpdate(data.roomId);
    });

    socket.on('disconnect', () => {
        console.log(`Гравець відключився: ${socket.id}`);
        if (rooms[roomId]) {
            socket.to(roomId).emit('opponent_disconnected');
            delete rooms[roomId];
        }
    });
});

function sendBoardsUpdate(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    room.players.forEach(playerId => {
        const opponentId = room.players.find(id => id !== playerId);
        
        const myBoard = room.boards[playerId];
        const oppBoard = room.boards[opponentId];

        let payload = [];

        myBoard.forEach(c => {
            payload.push({ "Поле": "Моє", "Рядок": c.r, "Стовпець": c.c, "Стан": c.status });
        });

        oppBoard.forEach(c => {
            let displayStatus = c.status === 4 ? 0 : c.status;
            payload.push({ "Поле": "Супротивника", "Рядок": c.r, "Стовпець": c.c, "Стан": displayStatus });
        });

        io.to(playerId).emit('board_data', payload);
    });
    console.log(`Кімната ${roomId}: Оновлені масиви полів відправлені обом гравцям.`);
}

server.listen(PORT, () => {
    console.log(`Сервер працює на порту ${PORT}`);
});