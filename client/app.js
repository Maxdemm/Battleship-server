const socket = io('http://localhost:3000');
let roomId = null;
let isMyTurn = false;
let pivotGrid = null;

function getReportConfig(jsonData) {
    return {
        dataSource: { data: jsonData },
        slice: {
            rows: [{ uniqueName: "Поле" }, { uniqueName: "Рядок" }],
            columns: [{ uniqueName: "Стовпець" }],
            measures: [{ uniqueName: "Стан", aggregation: "max" }]
        },
        options: {
            grid: { showHeaders: true, showTotals: false, showSubtotals: false },
            toolbar: false
        }
    };
}

function renderGrid(data) {
    if (!pivotGrid) {
        console.log("Ініціалізація WebDataRocks");
        pivotGrid = new WebDataRocks({
            container: "#wdr-component",
            toolbar: false,
            report: getReportConfig(data),
            customizeCell: cellColorizer,
            ready: function() {
                console.log("WebDataRocks готовий до роботи");
                attachCellClickEvent();
            }
        });
    } else {
        pivotGrid.updateData({ data: data });
    }
}

function cellColorizer(cell, data) {
    if (data.type === "value" && !data.isTotal) {
        const val = data.value;
        const isMyField = data.rows.some(r => r.caption === "Моє");

        if (val === 1) {
            cell.style["background-color"] = "#b2bec3";
            cell.text = "•";
        } else if (val === 2) {
            cell.style["background-color"] = "#ff7675";
            cell.text = "💥";
        } else if (val === 4 && isMyField) {
            cell.style["background-color"] = "#74b9ff";
            cell.text = "🚢";
        } else {
            cell.style["background-color"] = "#3c51ec";
        }
    }
}

function attachCellClickEvent() {
    pivotGrid.on('cellclick', function (cell) {
        console.log("клік по клітинці отримано. Дані клітинки:", cell);
        console.log("зараз мій хід:", isMyTurn);

        if (!isMyTurn) {
            console.log("Зараз хід суперника!!!");
            return;
        }

        if (cell.type === "value" && cell.rows && cell.columns) {
        
            const fieldType = cell.rows.find(r => r.hierarchyName === "Поле")?.caption || cell.rows[0]?.caption;
            const rowLetter = cell.rows.find(r => r.hierarchyName === "Рядок")?.caption || cell.rows[1]?.caption;
            const colNumber = cell.columns.find(c => c.hierarchyName === "Стовпець")?.caption || cell.columns[0]?.caption;

            console.log(`координати: ${fieldType}, Рядок: ${rowLetter}, Стовпець: ${colNumber}`);

            if (!fieldType || !rowLetter || !colNumber) {
                console.error("❌ не вдалося розпізнати координати", cell.rows, cell.columns);
                return;
            }
        
            if (fieldType.trim() === "Супротивника") {
                console.log(`🚀 постріл, кімната: ${roomId} на [${rowLetter}-${colNumber}]`);
                
                socket.emit('shot', {
                    roomId: roomId,
                    row: rowLetter,
                    col: colNumber
                });
            } else {
                console.log(`це поле '${fieldType}'. Стріляти можна тільки по полю суперника!`);
            }
        } else {
            console.log("клік відбувся не по клітинці зі значенням");
        }
    });
}

socket.on('waiting', (msg) => {
    updateScoreboard(msg, 'wait-turn');
});

socket.on('game_start', (data) => {
    console.log("Подія 'game_start' отримана з сервера! ID кімнати:", data.roomId);
    roomId = data.roomId;
    manageTurn(data.turn);
});

socket.on('turn_update', (data) => {
    console.log("Подія 'turn_update'. Новий хід гравця:", data.turn);
    manageTurn(data.turn);
});

socket.on('board_data', (boardData) => {
    console.log("Оновлення поля отримано. Дані:", boardData);
    renderGrid(boardData);
});

socket.on('game_over', (data) => {
    if (data.winner === socket.id) {
        updateScoreboard("ПЕРЕМОГА! Ви знищили кораблі суперника", "your-turn");
        alert("Вітаємо! Ви перемогли! 🏆");
    } else {
        updateScoreboard("Ви програли! Ваші кораблі повністю знищено", "wait-turn");
        alert("На жаль, ви програли");
    }
    isMyTurn = false;
});

socket.on('opponent_disconnected', () => {
    updateScoreboard("Суперник залишив гру. Ви перемогли!", "your-turn");
    isMyTurn = false;
});

function manageTurn(turnId) {
    if (turnId === socket.id) {
        isMyTurn = true;
        updateScoreboard("Ваш хід! Оберіть клітинку на полі суперника", "your-turn");
    } else {
        isMyTurn = false;
        updateScoreboard("Хід суперника... Очікуйте на його постріл", "wait-turn");
    }
}

function updateScoreboard(text, className) {
    const el = document.getElementById('status-text');
    if (el) {
        el.innerText = text;
        el.className = className;
    }
}