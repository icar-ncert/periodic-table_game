const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const rooms = {};
const individualQuizzes = {};

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function startTimer(roomCode, isIndividual = false) {
    const room = isIndividual ? individualQuizzes[roomCode] : rooms[roomCode];
    if (!room || !room.running) return;

    let timeBonus = 200;
    const timer = setInterval(() => {
        if (!room || !room.running) {
            clearInterval(timer);
            return;
        }
        timeBonus = Math.max(0, timeBonus - 10);
        io.to(isIndividual ? room.studentId : roomCode).emit('updateTimer', timeBonus);
        room.timeBonus = timeBonus;
    }, 1000);

    room.timer = timer;
}

function setNextQuestion(roomCode, isIndividual = false) {
    const room = isIndividual ? individualQuizzes[roomCode] : rooms[roomCode];
    if (!room) {
        console.error(`Room ${roomCode} not found in setNextQuestion`);
        return;
    }

    room.questionCount++;
    room.answeredStudents = new Set();
    room.completedStudents = new Set();
    console.log(`Room ${roomCode}: Setting question ${room.questionCount}/${room.maxQuestions}`);

    if (room.questionCount > room.maxQuestions) {
        console.log(`Room ${roomCode}: Quiz finished`);
        if (isIndividual) {
            io.to(room.studentId).emit('quizFinished', { students: [{ name: room.studentName, score: room.score, elementsPlaced: room.elementsPlaced || 0 }] });
            delete individualQuizzes[roomCode];
        } else {
            io.to(roomCode).emit('quizFinished', { students: room.students });
            room.running = false;
        }
        clearInterval(room.timer);
        if (room.timeout) clearTimeout(room.timeout);
        return;
    }

    let question, questionProperty, element, elements;
    try {
        if (room.difficulty === 'easy') {
            const elementsData = require('./public/data.json');
            element = elementsData[Math.floor(Math.random() * elementsData.length)];
            question = `Find: <strong>${element.name}</strong>`;
            questionProperty = null;
        } else if (room.difficulty === 'medium') {
            const elementsData = require('./public/data.json');
            elements = elementsData
                .filter(el => !(el.row === 6 && el.col === 3) && !(el.row === 7 && el.col === 3) && el.row <= 9 && el.col <= 18 && el.col >= 1)
                .sort(() => Math.random() - 0.5)
                .slice(0, 10);
            question = `Drag and drop the 10 elements to their correct positions`;
            element = null;
            questionProperty = null;
        } else if (room.difficulty === 'hard') {
            const elementsData = require('./public/data2.json');
            element = elementsData[Math.floor(Math.random() * elementsData.length)];
            const properties = [
                { key: 'AtomicNumber', display: 'Atomic Number', value: element.AtomicNumber },
                { key: 'AtomicMass', display: 'Atomic Mass', value: parseFloat(element.AtomicMass).toFixed(3) },
                { key: 'ElectronConfiguration', display: 'Electron Configuration', value: element.ElectronConfiguration },
                { key: 'AtomicRadius', display: 'Atomic Radius', value: element.AtomicRadius }
            ].filter(prop => prop.value && prop.value !== '');
            if (properties.length === 0) {
                console.warn(`No valid properties for element ${element.Name}. Retrying.`);
                return setNextQuestion(roomCode, isIndividual);
            }
            const prop = properties[Math.floor(Math.random() * properties.length)];
            question = `Which element has ${prop.display} = ${prop.value}?`;
            questionProperty = prop.key.toLowerCase();
        }

        room.currentElement = element;
        room.currentQuestion = question;
        room.currentQuestionProperty = questionProperty;
        room.currentElements = elements || [];
        io.to(isIndividual ? room.studentId : roomCode).emit('newQuestion', {
            question,
            questionProperty,
            questionCount: room.questionCount,
            elements
        });

        if (room.timeout) clearTimeout(room.timeout);
        room.timeout = setTimeout(() => {
            console.log(`Room ${roomCode}: Timeout triggered for question ${room.questionCount}`);
            setNextQuestion(roomCode, isIndividual);
        }, 30000);
    } catch (error) {
        console.error(`Error setting question for room ${roomCode}:`, error);
        io.to(isIndividual ? room.studentId : roomCode).emit('error', { message: 'Failed to load question' });
    }
}

io.on('connection', (socket) => {
    socket.on('createRoom', (teacherName, callback) => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            teacher: socket.id,
            teacherName,
            students: [],
            running: false,
            difficulty: 'easy',
            questionCount: 0,
            maxQuestions: 10,
            currentElement: null,
            currentQuestion: null,
            currentQuestionProperty: null,
            currentElements: [],
            answeredStudents: new Set(),
            completedStudents: new Set(),
            timer: null,
            timeBonus: 200,
            timeout: null
        };
        socket.join('teacher-' + roomCode);
        socket.join(roomCode);
        callback({ roomCode, success: true });
        console.log(`Room ${roomCode} created by ${teacherName}`);
    });

    socket.on('joinRoom', ({ roomCode, studentName }, callback) => {
        const room = rooms[roomCode];
        if (!room) {
            callback({ success: false, message: 'Room not found' });
            return;
        }
        if (room.students.find(s => s.name === studentName)) {
            callback({ success: false, message: 'Student name already taken' });
            return;
        }
        room.students.push({ id: socket.id, name: studentName, score: 0, elementsPlaced: 0 });
        socket.join(roomCode);
        io.to('teacher-' + roomCode).emit('updateStudents', room.students);
        callback({ 
            success: true, 
            roomCode, 
            isRunning: room.running, 
            difficulty: room.difficulty 
        });
        if (room.running) {
            socket.emit('gameStarted', { difficulty: room.difficulty });
            socket.emit('newQuestion', {
                question: room.currentQuestion,
                questionProperty: room.currentQuestionProperty,
                questionCount: room.questionCount,
                elements: room.currentElements
            });
            socket.emit('updateTimer', room.timeBonus);
        }
        console.log(`Student ${studentName} joined room ${roomCode}`);
    });

    socket.on('playIndividual', ({ studentName, difficulty }, callback) => {
        const quizId = generateRoomCode();
        individualQuizzes[quizId] = {
            studentId: socket.id,
            studentName,
            score: 0,
            elementsPlaced: 0,
            running: true,
            difficulty,
            questionCount: 0,
            maxQuestions: 10,
            currentElement: null,
            currentQuestion: null,
            currentQuestionProperty: null,
            currentElements: [],
            answeredStudents: new Set(),
            timer: null,
            timeBonus: 200,
            timeout: null
        };
        socket.join(quizId);
        callback({ success: true, quizId });
        startTimer(quizId, true);
        setNextQuestion(quizId, true);
        console.log(`Individual quiz ${quizId} started for ${studentName}`);
    });

    socket.on('startGame', ({ roomCode, difficulty }) => {
        const room = rooms[roomCode];
        if (!room || socket.id !== room.teacher) return;
        if (room.running) {
            socket.emit('error', { message: 'Game already running' });
            return;
        }
        room.difficulty = difficulty;
        room.running = true;
        room.questionCount = 0;
        room.students.forEach(student => {
            student.score = 0;
            student.elementsPlaced = 0;
        });
        io.to(roomCode).emit('gameStarted', { difficulty });
        io.to('teacher-' + roomCode).emit('teacherGameStarted');
        startTimer(roomCode);
        setNextQuestion(roomCode);
        console.log(`Room ${roomCode}: Game started in ${difficulty} mode`);
    });

    socket.on('setQuestion', ({ roomCode, question, element, questionProperty, questionCount, elements }) => {
        const room = rooms[roomCode];
        if (!room || socket.id !== room.teacher) return;
        room.currentElement = element;
        room.currentQuestion = question;
        room.currentQuestionProperty = questionProperty;
        room.currentElements = elements || [];
        room.questionCount = questionCount;
        room.answeredStudents = new Set();
        room.completedStudents = new Set();
        io.to(roomCode).emit('newQuestion', { question, questionProperty, questionCount, elements });
        if (room.timeout) clearTimeout(room.timeout);
        room.timeout = setTimeout(() => {
            console.log(`Room ${roomCode}: Timeout triggered for question ${room.questionCount}`);
            setNextQuestion(roomCode);
        }, 30000);
    });

    socket.on('nextQuestion', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (!room || socket.id !== room.teacher) return;
        room.answeredStudents = new Set();
        room.completedStudents = new Set();
        room.students.forEach(student => student.elementsPlaced = 0);
        io.to('teacher-' + roomCode).emit('updateStudents', room.students);
        setNextQuestion(roomCode);
        console.log(`Room ${roomCode}: Next question triggered`);
    });

    socket.on('submitAnswer', ({ roomCode, answerNumber, studentName }) => {
        const room = rooms[roomCode] || individualQuizzes[roomCode];
        const isIndividual = !!individualQuizzes[roomCode];
        if (!room || !room.running) return;

        if (isIndividual) {
            let isCorrect = false;
            let element = room.currentElement;
            if (room.difficulty === 'easy' || room.difficulty === 'hard') {
                isCorrect = element && parseInt(element.number || element.AtomicNumber) === parseInt(answerNumber);
            } else if (room.difficulty === 'medium') {
                const elements = room.currentElements;
                const targetElement = elements.find(el => parseInt(el.number) === parseInt(answerNumber));
                isCorrect = targetElement && parseInt(targetElement.number) === parseInt(answerNumber);
                element = targetElement;
            }
            if (isCorrect) {
                room.score += 100 + room.timeBonus;
                room.elementsPlaced = (room.elementsPlaced || 0) + 1;
            } else {
                room.score = Math.max(0, room.score - 50);
            }
            io.to(room.studentId).emit('answerFeedback', { isCorrect, element });
            if (room.difficulty !== 'medium' || room.elementsPlaced >= 10) {
                setNextQuestion(roomCode, true);
            }
        } else {
            const student = room.students.find(s => s.name === studentName);
            if (!student || room.answeredStudents.has(studentName)) return;
            room.answeredStudents.add(studentName);
            let isCorrect = false;
            let element = room.currentElement;
            console.log(`Room ${roomCode}: ${studentName} answered ${answerNumber}, Question ${room.questionCount}`);
            if (room.difficulty === 'easy' || room.difficulty === 'hard') {
                isCorrect = element && parseInt(element.number || element.AtomicNumber) === parseInt(answerNumber);
            } else if (room.difficulty === 'medium') {
                const elements = room.currentElements;
                const targetElement = elements.find(el => parseInt(el.number) === parseInt(answerNumber));
                isCorrect = targetElement && parseInt(targetElement.number) === parseInt(answerNumber);
                element = targetElement;
            }
            if (isCorrect) {
                student.score += 100 + room.timeBonus;
                student.elementsPlaced = (student.elementsPlaced || 0) + 1;
            } else {
                student.score = Math.max(0, student.score - 50);
            }
            io.to(student.id).emit('answerFeedback', { isCorrect, element });
            io.to('teacher-' + roomCode).emit('updateStudents', room.students);
            console.log(`Room ${roomCode}: ${room.answeredStudents.size}/${room.students.length} students answered`);
            if (room.difficulty !== 'medium' && room.answeredStudents.size >= room.students.length) {
                if (room.timeout) clearTimeout(room.timeout);
                setNextQuestion(roomCode);
            }
        }
    });

    socket.on('mediumComplete', ({ roomCode, studentName }) => {
        const room = rooms[roomCode];
        if (!room || room.difficulty !== 'medium') return;
        room.completedStudents.add(studentName);
        console.log(`Room ${roomCode}: ${studentName} completed medium mode (${room.completedStudents.size}/${room.students.length})`);
        io.to('teacher-' + roomCode).emit('updateStudents', room.students);
        if (room.completedStudents.size >= room.students.length) {
            io.to('teacher-' + roomCode).emit('allMediumComplete');
            if (room.timeout) clearTimeout(room.timeout);
        }
    });

    socket.on('stopQuiz', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (!room) return;
        room.running = false;
        clearInterval(room.timer);
        if (room.timeout) clearTimeout(room.timeout);
        io.to(roomCode).emit('quizStopped');
        console.log(`Room ${roomCode}: Quiz stopped`);
    });

    socket.on('resumeQuiz', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (!room) return;
        room.running = true;
        startTimer(roomCode);
        io.to(roomCode).emit('quizResumed');
        setNextQuestion(roomCode);
        console.log(`Room ${roomCode}: Quiz resumed`);
    });

    socket.on('finishQuiz', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (!room) return;
        room.running = false;
        clearInterval(room.timer);
        if (room.timeout) clearTimeout(room.timeout);
        io.to(roomCode).emit('quizFinished', { students: room.students });
        console.log(`Room ${roomCode}: Quiz finished`);
    });

    socket.on('finishIndividualQuiz', ({ quizId }) => {
        const quiz = individualQuizzes[quizId];
        if (!quiz) return;
        quiz.running = false;
        clearInterval(quiz.timer);
        if (quiz.timeout) clearTimeout(quiz.timeout);
        io.to(quiz.studentId).emit('quizFinished', { students: [{ name: quiz.studentName, score: quiz.score, elementsPlaced: quiz.elementsPlaced || 0 }] });
        delete individualQuizzes[quizId];
        console.log(`Individual quiz ${quizId}: Finished`);
    });

    socket.on('publishLeaderboard', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (!room) return;
        io.to(roomCode).emit('showLeaderboard', { students: room.students });
        console.log(`Room ${roomCode}: Leaderboard published`);
    });

    socket.on('restartQuiz', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (!room || socket.id !== room.teacher) return;
        room.running = true;
        room.questionCount = 0;
        room.answeredStudents = new Set();
        room.completedStudents = new Set();
        room.currentElement = null;
        room.currentQuestion = null;
        room.currentQuestionProperty = null;
        room.currentElements = [];
        room.timeBonus = 200;
        room.students.forEach(student => {
            student.score = 0;
            student.elementsPlaced = 0;
        });
        io.to(roomCode).emit('quizRestarted', { difficulty: room.difficulty });
        io.to('teacher-' + roomCode).emit('updateStudents', room.students);
        startTimer(roomCode);
        setNextQuestion(roomCode);
        console.log(`Room ${roomCode}: Quiz restarted`);
    });

    socket.on('disconnect', () => {
        for (let roomCode in rooms) {
            const room = rooms[roomCode];
            if (room.teacher === socket.id) {
                room.teacher = null;
                io.to(roomCode).emit('roomClosed');
                delete rooms[roomCode];
                console.log(`Room ${roomCode}: Teacher disconnected, room closed`);
            } else {
                const studentIndex = room.students.findIndex(s => s.id === socket.id);
                if (studentIndex !== -1) {
                    const studentName = room.students[studentIndex].name;
                    room.students.splice(studentIndex, 1);
                    io.to('teacher-' + roomCode).emit('updateStudents', room.students);
                    console.log(`Student ${studentName} disconnected from room ${roomCode}`);
                    if (room.students.length === 0 && !room.teacher) {
                        delete rooms[roomCode];
                        console.log(`Room ${roomCode} deleted (no students or teacher)`);
                    }
                }
            }
        }
        for (let quizId in individualQuizzes) {
            if (individualQuizzes[quizId].studentId === socket.id) {
                delete individualQuizzes[quizId];
                console.log(`Individual quiz ${quizId} deleted (student disconnected)`);
            }
        }
    });
});

http.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});