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

// Load data
const elementsDataEasy = require('./public/data.json');
const elementsDataHard = require('./public/data2.json');

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Helper to safely get element details
function getElementDisplay(el) {
    if (!el) return { name: 'Unknown', symbol: '?', number: '?' };
    return {
        name: el.name || el.Name || 'Unknown',
        symbol: el.symbol || el.Symbol || '?',
        number: el.number || el.AtomicNumber || '?'
    };
}

// --- QUIZ GENERATION ---
function generateQuizSet(difficulty) {
    const questions = [];
    const sourceData = difficulty === 'hard' ? elementsDataHard : elementsDataEasy;
    
    if (difficulty === 'medium') {
        const elements = sourceData.filter(el => !(el.row === 6 && el.col === 3) && !(el.row === 7 && el.col === 3) && el.row <= 9 && el.col <= 18 && el.col >= 1).sort(() => Math.random() - 0.5).slice(0, 10);
        questions.push({ question: `Drag and drop the 10 elements to their correct positions`, elements: elements, type: 'medium' });
    } else {
        // Use WHILE loop to guarantee exactly 10 questions
        let attempts = 0; // Safety break
        while (questions.length < 10 && attempts < 100) {
            attempts++;
            if (difficulty === 'easy') {
                const el = sourceData[Math.floor(Math.random() * sourceData.length)];
                questions.push({ question: `Find: <strong>${el.name}</strong>`, answer: el, type: 'easy' });
            } else { // Hard
                const el = sourceData[Math.floor(Math.random() * sourceData.length)];
                const props = [
                    { key: 'AtomicNumber', display: 'Atomic Number', value: el.AtomicNumber },
                    { key: 'AtomicMass', display: 'Atomic Mass', value: el.AtomicMass ? parseFloat(el.AtomicMass).toFixed(3) : null },
                    { key: 'ElectronConfiguration', display: 'Electron Configuration', value: el.ElectronConfiguration },
                    { key: 'AtomicRadius', display: 'Atomic Radius', value: el.AtomicRadius }
                ].filter(p => p.value && String(p.value).trim() !== '');
                
                if (props.length === 0) continue; 
                
                const prop = props[Math.floor(Math.random() * props.length)];
                questions.push({ 
                    question: `Which element has ${prop.display} = ${prop.value}?`, 
                    answer: el, 
                    property: prop.key.toLowerCase(),
                    type: 'hard'
                });
            }
        }
        console.log(`Generated ${questions.length} questions for ${difficulty} mode.`);
    }
    return questions;
}

io.on('connection', (socket) => {
    
    // --- ROOM CREATION ---
    socket.on('createRoom', (teacherName, callback) => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            teacher: socket.id,
            teacherName,
            students: [],
            running: false,
            difficulty: 'easy',
            quizSet: [],
            timeBonus: 200,
            timerInterval: null
        };
        socket.join('teacher-' + roomCode);
        socket.join(roomCode);
        callback({ roomCode, success: true });
    });

    // --- JOIN RESTRICTION ---
    socket.on('joinRoom', ({ roomCode, studentName }, callback) => {
        const room = rooms[roomCode];
        if (!room) return callback({ success: false, message: 'Room not found' });
        if (room.running) return callback({ success: false, message: 'Game already started. Cannot join now.' });
        if (room.students.find(s => s.name === studentName)) return callback({ success: false, message: 'Name taken' });

        const student = { 
            id: socket.id, 
            name: studentName, 
            score: 0, 
            elementsPlaced: 0, 
            dropAttempts: 0,
            currentQuestionIndex: 0, 
            finished: false,
            mediumElements: [],
            answerHistory: [] 
        };
        room.students.push(student);
        socket.join(roomCode);
        io.to('teacher-' + roomCode).emit('updateStudents', room.students);
        callback({ success: true, roomCode });
    });

    socket.on('playIndividual', ({ studentName, difficulty }, callback) => {
        const quizId = generateRoomCode();
        const quizSet = generateQuizSet(difficulty);
        
        individualQuizzes[quizId] = {
            studentId: socket.id,
            studentName,
            score: 0,
            elementsPlaced: 0,
            dropAttempts: 0,
            difficulty,
            quizSet: quizSet,
            currentQuestionIndex: 0,
            finished: false,
            timeBonus: 200,
            timerInterval: null,
            answerHistory: [] 
        };
        socket.join(quizId);
        callback({ success: true, quizId });
        startTimer(quizId, true);
        sendQuestionToStudentIndividual(quizId);
    });

    socket.on('startGame', ({ roomCode, difficulty }) => {
        const room = rooms[roomCode];
        if (!room || socket.id !== room.teacher) return;

        room.difficulty = difficulty;
        room.running = true;
        room.quizSet = generateQuizSet(difficulty);
        
        room.students.forEach(s => {
            s.score = 0; s.elementsPlaced = 0; s.dropAttempts = 0;
            s.currentQuestionIndex = 0; s.finished = false; 
            s.answerHistory = []; 
            if (room.difficulty === 'medium' && room.quizSet[0]) {
                s.mediumElements = [...room.quizSet[0].elements];
            } else {
                s.mediumElements = [];
            }
        });

        io.to(roomCode).emit('gameStarted', { difficulty: room.difficulty });
        io.to('teacher-' + roomCode).emit('updateStudents', room.students);
        startTimer(roomCode, false);
        room.students.forEach(student => sendQuestionToStudent(room, student));
    });

    // --- TIMER LOGIC ---
    function startTimer(id, isIndividual) {
        const entity = isIndividual ? individualQuizzes[id] : rooms[id];
        if (!entity) return;
        clearInterval(entity.timerInterval);
        entity.timeBonus = 200;
        io.to(isIndividual ? entity.studentId : id).emit('updateTimer', entity.timeBonus);
        entity.timerInterval = setInterval(() => {
            if (isIndividual) { if (!individualQuizzes[id]) { clearInterval(entity.timerInterval); return; } }
            else { if (!rooms[id] || !rooms[id].running) { clearInterval(entity.timerInterval); return; } }
            entity.timeBonus = Math.max(0, entity.timeBonus - 2);
            io.to(isIndividual ? entity.studentId : id).emit('updateTimer', entity.timeBonus);
        }, 100);
    }

    // --- SUBMIT ANSWER ---
    socket.on('submitAnswer', ({ roomCode, answerNumber, studentName, targetNumber }) => {
        const room = rooms[roomCode] || individualQuizzes[roomCode];
        const isIndividual = !!individualQuizzes[roomCode];
        if (!room) return;

        const student = isIndividual ? room : room.students.find(s => s.name === studentName);
        if (!student || student.finished) return;

        const currentBonus = room.timeBonus;

        // MEDIUM MODE LOGIC
        if (room.difficulty === 'medium') {
            let elementsList = isIndividual ? room.quizSet[0].elements : student.mediumElements;
            const targetEl = elementsList.find(el => parseInt(el.number || el.AtomicNumber) === parseInt(answerNumber));
            
            if (targetEl) {
                const isCorrect = parseInt(answerNumber) === parseInt(targetNumber);
                const correctInfo = getElementDisplay(targetEl);
                
                if (isIndividual) {
                    room.quizSet[0].elements = room.quizSet[0].elements.filter(el => parseInt(el.number || el.AtomicNumber) !== parseInt(answerNumber));
                    room.dropAttempts++;
                } else {
                    student.mediumElements = student.mediumElements.filter(el => parseInt(el.number || el.AtomicNumber) !== parseInt(answerNumber));
                    student.dropAttempts++;
                }

                if (isCorrect) { student.score += 100 + currentBonus; student.elementsPlaced++; }
                else { student.score = Math.max(0, student.score - 50); }

                // STORE HISTORY
                student.answerHistory.push({
                    questionText: `Place: ${correctInfo.name}`,
                    correctAnswer: `${correctInfo.name} (${correctInfo.symbol}) [${correctInfo.number}]`,
                    userAnswer: isCorrect ? 
                        `${correctInfo.name} (${correctInfo.symbol}) [${correctInfo.number}]` : 
                        `Wrong Position`,
                    isCorrect: isCorrect
                });

                const elementsLeft = isIndividual ? room.quizSet[0].elements.length : student.mediumElements.length;
                socket.emit('answerFeedback', { isCorrect, element: targetEl, targetNumber, score: student.score, elementsPlaced: student.elementsPlaced });

                if (elementsLeft === 0 || student.dropAttempts >= 10) {
                    student.finished = true;
                    if (isIndividual) { clearInterval(room.timerInterval); sendGameOver(socket, student, room, true); }
                    else { socket.emit('waitForTeacher'); io.to('teacher-' + roomCode).emit('updateStudents', room.students); }
                } else { if (!isIndividual) io.to('teacher-' + roomCode).emit('updateStudents', room.students); }
            } else {
                 // Safety: if element not found, just return (client is already processing=false from previous answer ideally, but let's ensure)
                 // Ideally we emit an error here, but for now we just prevent crash.
                 console.log("Medium mode error: Element not found in list");
            }
            return;
        }

        // EASY / HARD LOGIC
        const currentQ = room.quizSet[student.currentQuestionIndex];
        if (!currentQ) {
            console.log("Error: Question not found at index " + student.currentQuestionIndex);
            return; 
        }

        const correctId = currentQ.answer.number || currentQ.answer.AtomicNumber;
        const clickedEl = (room.difficulty === 'hard' ? elementsDataHard : elementsDataEasy).find(el => parseInt(el.number || el.AtomicNumber) === parseInt(answerNumber));
        
        let isCorrect = parseInt(answerNumber) === parseInt(correctId);
        
        const correctInfo = getElementDisplay(currentQ.answer);
        const clickedInfo = getElementDisplay(clickedEl);

        if (isCorrect) { student.score += 100 + currentBonus; student.elementsPlaced++; }
        else { student.score = Math.max(0, student.score - 50); }

        // STORE HISTORY
        student.answerHistory.push({
            questionText: currentQ.question,
            correctAnswer: `${correctInfo.name} (${correctInfo.symbol}) [${correctInfo.number}]`,
            userAnswer: clickedEl ? `${clickedInfo.name} (${clickedInfo.symbol}) [${clickedInfo.number}]` : "No Answer",
            isCorrect: isCorrect
        });

        socket.emit('answerFeedback', { isCorrect, element: clickedEl || currentQ.answer, targetNumber: null, score: student.score, elementsPlaced: student.elementsPlaced });
        
        student.currentQuestionIndex++;

        if (student.currentQuestionIndex >= 10) {
            student.finished = true;
            if (isIndividual) { clearInterval(room.timerInterval); sendGameOver(socket, student, room, true); }
            else { socket.emit('waitForTeacher'); io.to('teacher-' + roomCode).emit('updateStudents', room.students); }
        } else {
            if (isIndividual) { startTimer(roomCode, true); sendQuestionToStudentIndividual(roomCode); }
            else { if (room.running) startTimer(roomCode, false); sendQuestionToStudent(room, student); }
        }
        if (!isIndividual) io.to('teacher-' + roomCode).emit('updateStudents', room.students);
    });

    // --- CONTROLS ---
    socket.on('stopQuiz', ({ roomCode }) => { const room = rooms[roomCode]; if (!room) return; room.running = false; clearInterval(room.timerInterval); io.to(roomCode).emit('quizStopped'); });
    socket.on('resumeQuiz', ({ roomCode }) => { const room = rooms[roomCode]; if (!room) return; room.running = true; startTimer(roomCode, false); io.to(roomCode).emit('quizResumed'); });
    
    socket.on('finishQuiz', ({ roomCode }) => { 
        const room = rooms[roomCode]; if (!room) return;
        room.running = false; clearInterval(room.timerInterval);
        io.to(roomCode).emit('quizEnded');
        socket.emit('quizFinished', { students: room.students });
    });
    
    socket.on('publishLeaderboard', ({ roomCode }) => { 
        const room = rooms[roomCode]; if (!room) return;
        io.to(roomCode).emit('showLeaderboard', { students: room.students });
    });
    
    socket.on('closeRoom', ({ roomCode }) => { const room = rooms[roomCode]; if (!room) return; io.to(roomCode).emit('roomClosed'); delete rooms[roomCode]; });

    // --- HELPERS ---
    function sendQuestionToStudent(room, student) {
        if (room.difficulty === 'medium' && student.mediumElements.length === 0 && room.quizSet[0].elements.length < 10) return;
        const qIndex = student.currentQuestionIndex;
        const qData = room.difficulty === 'medium' ? room.quizSet[0] : room.quizSet[qIndex];
        if (!qData) return;
        const elementsToSend = room.difficulty === 'medium' ? student.mediumElements : qData.elements;
        io.to(student.id).emit('newQuestion', { question: qData.question, questionProperty: qData.property, questionCount: qIndex + 1, elements: elementsToSend });
    }

    function sendQuestionToStudentIndividual(quizId) {
        const room = individualQuizzes[quizId];
        const qIndex = room.currentQuestionIndex;
        const qData = room.difficulty === 'medium' ? room.quizSet[0] : room.quizSet[qIndex];
        if (!qData) return;
        io.to(room.studentId).emit('newQuestion', { question: qData.question, questionProperty: qData.property, questionCount: qIndex + 1, elements: qData.elements });
    }

    function sendGameOver(socket, student, room, isIndividual) {
        console.log("Sending Game Over. History Length:", student.answerHistory.length);
        if (isIndividual) {
            socket.emit('quizFinished', { 
                students: [{ 
                    name: student.studentName, 
                    score: student.score, 
                    elementsPlaced: student.elementsPlaced,
                    answerHistory: student.answerHistory
                }] 
            });
        } else {
            socket.emit('quizFinished', { students: [student] });
        }
    }

    socket.on('disconnect', () => {
        for (let roomCode in rooms) {
            const room = rooms[roomCode];
            if (room.teacher === socket.id) { io.to(roomCode).emit('roomClosed'); delete rooms[roomCode]; }
            else { const idx = room.students.findIndex(s => s.id === socket.id); if (idx !== -1) { room.students.splice(idx, 1); io.to('teacher-' + roomCode).emit('updateStudents', room.students); } }
        }
        for (let quizId in individualQuizzes) { if (individualQuizzes[quizId].studentId === socket.id) delete individualQuizzes[quizId]; }
    });
});

http.listen(3000, () => console.log('Server running on http://localhost:3000'));
