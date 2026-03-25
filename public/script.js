let score = 0;
let questionCount = 0;
let timeBonus = 200;
let difficulty = 'easy';
let draggableElements = [];
let elementsEasyMedium = [];
let elementsHard = [];
let currentQuestionProperty = null;
let socket;
let userRole = null;
let roomCode = null;
let userName = null;
let elementsPlaced = 0;
let correctlyPlacedNumbers = new Set();
let dropAttempts = 0;
let isProcessing = false; 
let mediumModeFinished = false;

async function loadElements() {
    try {
        const responseEasyMedium = await fetch('data.json');
        elementsEasyMedium = await responseEasyMedium.json();
        if (!elementsEasyMedium.length) throw new Error('Empty data.json');
        
        elementsEasyMedium = elementsEasyMedium.map(element => {
            const atomicNumber = parseInt(element.number);
            if (atomicNumber >= 57 && atomicNumber <= 71) { const col = (atomicNumber - 56) + 3; return { ...element, row: 8, col }; }
            else if (atomicNumber >= 89 && atomicNumber <= 103) { const col = (atomicNumber - 88) + 3; return { ...element, row: 9, col }; }
            return element;
        });
        elementsEasyMedium.sort((a, b) => parseInt(a.number) - parseInt(b.number));

        const responseHard = await fetch('data2.json');
        const dataHard = await responseHard.json();
        if (!dataHard.length) throw new Error('Empty data2.json');
        
        elementsHard = dataHard.map(element => {
            const atomicNumber = parseInt(element.AtomicNumber);
            let row, col;
            if (atomicNumber >= 57 && atomicNumber <= 71) { row = 8; col = (atomicNumber - 57) + 4; }
            else if (atomicNumber >= 89 && atomicNumber <= 103) { row = 9; col = (atomicNumber - 89) + 4; }
            else if (atomicNumber === 1) { row = 1; col = 1; }
            else if (atomicNumber === 2) { row = 1; col = 18; }
            else if (atomicNumber >= 3 && atomicNumber <= 4) { row = 2; col = atomicNumber - 2; }
            else if (atomicNumber >= 5 && atomicNumber <= 10) { row = 2; col = atomicNumber + 8; }
            else if (atomicNumber >= 11 && atomicNumber <= 12) { row = 3; col = atomicNumber - 10; }
            else if (atomicNumber >= 13 && atomicNumber <= 18) { row = 3; col = atomicNumber; }
            else if (atomicNumber >= 19 && atomicNumber <= 36) { row = 4; col = atomicNumber - 18; }
            else if (atomicNumber >= 37 && atomicNumber <= 54) { row = 5; col = atomicNumber - 36; }
            else if (atomicNumber === 55) { row = 6; col = 1; }
            else if (atomicNumber === 56) { row = 6; col = 2; }
            else if (atomicNumber >= 72 && atomicNumber <= 86) { row = 6; col = atomicNumber - 68; }
            else if (atomicNumber === 87) { row = 7; col = 1; }
            else if (atomicNumber === 88) { row = 7; col = 2; }
            else if (atomicNumber >= 104 && atomicNumber <= 118) { row = 7; col = atomicNumber - 100; }
            else { row = 0; col = 0; }

            return {
                number: element.AtomicNumber, symbol: element.Symbol, name: element.Name,
                mass: element.AtomicMass, row, col, group: element.GroupBlock,
                electronConfiguration: element.ElectronConfiguration, atomicRadius: element.AtomicRadius
            };
        });
        elementsHard.sort((a, b) => parseInt(a.number) - parseInt(b.number));
    } catch (error) {
        console.error('Error loading elements:', error);
        Swal.fire({ title: 'Error', text: 'Failed to load element data!', icon: 'error' });
        return false;
    }
    return true;
}

function initGame() {
    socket = io();

    // Role Selection Buttons
    document.getElementById('teacher-btn').addEventListener('click', () => { 
        userRole = 'teacher'; 
        document.getElementById('role-selection').style.display = 'none'; 
        document.getElementById('teacher-controls').style.display = 'block';
        // Hide Instructions when role is selected
        document.getElementById('instructions-panel').style.display = 'none';
    });
    
    document.getElementById('student-btn').addEventListener('click', () => { 
        userRole = 'student'; 
        document.getElementById('role-selection').style.display = 'none'; 
        document.getElementById('student-join').style.display = 'block';
        // Hide Instructions when role is selected
        document.getElementById('instructions-panel').style.display = 'none';
    });
    
    document.getElementById('individual-btn').addEventListener('click', () => { 
        userRole = 'individual'; 
        document.getElementById('role-selection').style.display = 'none'; 
        document.getElementById('individual-mode').style.display = 'block';
        // Hide Instructions when role is selected
        document.getElementById('instructions-panel').style.display = 'none';
    });

    document.getElementById('create-room-btn').addEventListener('click', () => {
        userName = document.getElementById('teacher-name').value.trim();
        if (!userName) return Swal.fire('Error', 'Please enter your name', 'error');
        socket.emit('createRoom', userName, ({ roomCode: code, success }) => {
            if (success) { roomCode = code; document.getElementById('room-code-display').innerHTML = `Room Code: <strong>${roomCode}</strong>`; document.getElementById('student-list').innerHTML = '<h4>Students:</h4><ul id="student-list-ul"></ul>'; document.getElementById('start-game-btn').style.display = 'inline-block'; }
        });
    });
    
    document.getElementById('start-game-btn').addEventListener('click', () => { difficulty = document.getElementById('difficulty').value; socket.emit('startGame', { roomCode, difficulty }); });
    document.getElementById('stop-quiz-btn').addEventListener('click', () => socket.emit('stopQuiz', { roomCode }));
    document.getElementById('resume-quiz-btn').addEventListener('click', () => socket.emit('resumeQuiz', { roomCode }));
    document.getElementById('finish-quiz-btn').addEventListener('click', () => socket.emit('finishQuiz', { roomCode }));
    document.getElementById('publish-leaderboard-btn').addEventListener('click', () => socket.emit('publishLeaderboard', { roomCode }));
    document.getElementById('close-room-btn').addEventListener('click', () => socket.emit('closeRoom', { roomCode }));

    document.getElementById('join-room-btn').addEventListener('click', () => {
        userName = document.getElementById('student-name').value.trim();
        const code = document.getElementById('room-code').value.trim().toUpperCase();
        if (!userName || !code) return Swal.fire('Error', 'Name and Code required', 'error');
        socket.emit('joinRoom', { roomCode: code, studentName: userName }, ({ success, message }) => {
            if (success) { roomCode = code; document.getElementById('student-join').style.display = 'none'; document.getElementById('game-area').style.display = 'block'; }
            else { Swal.fire('Error', message || 'Failed to join', 'error'); }
        });
    });

    document.getElementById('start-individual-btn').addEventListener('click', () => {
        difficulty = document.getElementById('individual-difficulty').value; userName = 'Player';
        socket.emit('playIndividual', { studentName: userName, difficulty }, ({ success, quizId }) => {
            if (success) { roomCode = quizId; document.getElementById('individual-mode').style.display = 'none'; document.getElementById('game-area').style.display = 'block'; createPeriodicTable(); showDifficultyAlert(); }
        });
    });

    // --- SOCKET EVENTS ---

    socket.on('gameStarted', ({ difficulty: d }) => {
        difficulty = d; score = 0; questionCount = 0; elementsPlaced = 0; dropAttempts = 0;
        correctlyPlacedNumbers.clear(); draggableElements = [];
        mediumModeFinished = false;
        updateScoreDisplay();
        if (userRole === 'student' || userRole === 'individual') {
            createPeriodicTable(); showDifficultyAlert();
        } else {
            document.getElementById('teacher-controls').style.display = 'none';
            document.getElementById('teacher-leaderboard').style.display = 'block';
            document.getElementById('stop-quiz-btn').style.display = 'inline-block';
            document.getElementById('resume-quiz-btn').style.display = 'none';
            document.getElementById('finish-quiz-btn').style.display = 'inline-block';
            document.getElementById('publish-leaderboard-btn').style.display = 'none';
            document.getElementById('close-room-btn').style.display = 'none'; 
        }
    });

    socket.on('newQuestion', ({ question, questionCount: qc, elements, questionProperty }) => {
        if (userRole !== 'student' && userRole !== 'individual') return;
        if (difficulty === 'medium' && mediumModeFinished) return;

        document.getElementById('question-display').innerHTML = question;
        questionCount = qc;
        currentQuestionProperty = questionProperty; 
        isProcessing = false; 
        
        if (difficulty === 'medium') {
            if (draggableElements.length === 0 || (elements && elements.length !== draggableElements.length)) draggableElements = elements || [];
            createPeriodicTable();
        } else {
            resetTableColors();
            if (difficulty === 'hard') createPeriodicTable();
        }
        updateProgress();
    });

    socket.on('updateTimer', (t) => { timeBonus = t; document.getElementById('timer').textContent = `⏳ Time Bonus: ${timeBonus}`; });

    socket.on('answerFeedback', (result) => {
        if (userRole !== 'student' && userRole !== 'individual') return;
        const { isCorrect, element, targetNumber, score: serverScore, elementsPlaced: serverPlaced } = result;
        if (!element) return;
        
        isProcessing = false; 
        
        if (serverScore !== undefined) score = serverScore;
        if (serverPlaced !== undefined) elementsPlaced = serverPlaced;

        if (difficulty === 'medium') {
            draggableElements = draggableElements.filter(e => parseInt(e.number || e.AtomicNumber) !== parseInt(element.number || element.AtomicNumber));
            if (isCorrect) { correctlyPlacedNumbers.add(parseInt(element.number || element.AtomicNumber)); launchConfetti(); }
            
            if (elementsPlaced >= 10 || draggableElements.length === 0) {
                mediumModeFinished = true;
                createPeriodicTable();
                if (userRole === 'individual') {
                    document.getElementById('game-area').style.display = 'none';
                } else {
                    document.getElementById('game-area').style.display = 'none';
                    Swal.fire({ title: 'Done!', text: 'Waiting for teacher...', allowOutsideClick: false, showConfirmButton: false });
                }
            } else { createPeriodicTable(); }
        } else {
            if (isCorrect) { const elDiv = document.querySelector(`.element[data-number="${element.number || element.AtomicNumber}"]`); if(elDiv) elDiv.classList.add('correct'); }
            showFeedback(isCorrect, element);
        }
        updateScoreDisplay();
    });

    socket.on('waitForTeacher', () => { mediumModeFinished = true; document.getElementById('game-area').style.display = 'none'; Swal.fire({ title: 'Done!', text: 'Waiting for teacher...', allowOutsideClick: false, showConfirmButton: false }); });
    socket.on('quizEnded', () => { if (userRole === 'student') { Swal.close(); Swal.fire({ title: 'Quiz Ended', text: 'Waiting for results...', allowOutsideClick: false, showConfirmButton: false }); }});
    socket.on('quizStopped', () => { if (userRole === 'student') { document.getElementById('leaderboard').style.display = 'none'; Swal.fire({ title: 'Paused', allowOutsideClick: false, showConfirmButton: false }); document.getElementById('game-area').style.display = 'none'; } else { document.getElementById('stop-quiz-btn').style.display = 'none'; document.getElementById('resume-quiz-btn').style.display = 'inline-block'; document.getElementById('finish-quiz-btn').style.display = 'none'; } });
    socket.on('quizResumed', () => { if (userRole === 'student') { Swal.close(); document.getElementById('game-area').style.display = 'block'; } else { document.getElementById('stop-quiz-btn').style.display = 'inline-block'; document.getElementById('resume-quiz-btn').style.display = 'none'; document.getElementById('finish-quiz-btn').style.display = 'inline-block'; } });
    
    socket.on('quizFinished', ({ students }) => {
        if (userRole === 'teacher') {
            document.getElementById('stop-quiz-btn').style.display = 'none';
            document.getElementById('resume-quiz-btn').style.display = 'none';
            document.getElementById('finish-quiz-btn').style.display = 'none';
            document.getElementById('publish-leaderboard-btn').style.display = 'inline-block';
            document.getElementById('close-room-btn').style.display = 'inline-block'; 
            updateTeacherLeaderboard(students);
        } else {
            endGame(students);
        }
    });

    socket.on('showLeaderboard', ({ students }) => {
        if (userRole === 'student') {
            Swal.close(); 
            showReviewScreen(students);
        }
    });

    socket.on('roomClosed', () => { Swal.fire('Room Closed', 'The teacher has closed the room.', 'info').then(() => resetToRoleSelection()); });
    socket.on('updateStudents', (students) => { if (userRole === 'teacher') { document.getElementById('student-list-ul').innerHTML = students.map(s => `<li>${s.name} (${s.score})</li>`).join(''); updateTeacherLeaderboard(students); } });
}

// --- HELPER FUNCTIONS ---

function createPeriodicTable() {
    const table = document.getElementById('periodic-table');
    const draggableContainer = document.getElementById('draggable-container');
    table.innerHTML = '<div class="row-gap"></div>';
    draggableContainer.innerHTML = '';
    
    const elements = difficulty === 'hard' ? elementsHard : elementsEasyMedium;
    
    elements.forEach(element => {
        if ((element.row === 6 && element.col === 3) || (element.row === 7 && element.col === 3)) return;
        if (element.row > 9 || element.col > 18) return;

        const div = document.createElement('div');
        div.className = `element group-block-${element.group}`;
        div.dataset.number = element.number || element.AtomicNumber;
        
        const gridRow = element.row + (element.row >= 8 ? 1 : 0);
        div.style.gridRow = gridRow;
        div.style.gridColumn = element.col;

        const atomicNum = element.number || element.AtomicNumber;
        const isPlaced = correctlyPlacedNumbers.has(parseInt(atomicNum));

        if (isPlaced) {
            div.classList.add('correct');
            div.innerHTML = `<div class="number">${atomicNum}</div><div class="symbol">${element.symbol}</div>`;
        } else if (difficulty === 'medium') {
            div.classList.add('droppable');
            div.addEventListener('dragover', (e) => e.preventDefault());
            div.addEventListener('drop', handleDrop);
        } else {
            let numHTML = `<div class="number">${atomicNum}</div>`;
            if (difficulty === 'hard' && currentQuestionProperty === 'atomicnumber') numHTML = `<div class="number">?</div>`;
            let massHTML = `<div class="atomic-mass">${element.mass ? element.mass.toFixed(3) : '...'}</div>`;
            if (difficulty === 'hard' && currentQuestionProperty === 'atomicmass') massHTML = `<div class="atomic-mass">?</div>`;
            div.innerHTML = `${numHTML}<div class="symbol">${element.symbol}</div>${massHTML}`;
            div.addEventListener('click', () => handleElementClick(element));
        }
        table.appendChild(div);
    });

    if (difficulty === 'medium') {
        draggableContainer.style.display = 'flex';
        draggableElements.forEach(element => {
            const div = document.createElement('div');
            div.className = `draggable element group-block-${element.group}`;
            div.draggable = true;
            div.dataset.number = element.number || element.AtomicNumber;
            div.innerHTML = `<div class="number">${div.dataset.number}</div><div class="symbol">${element.symbol}</div>`;
            div.addEventListener('dragstart', (e) => { if(isProcessing) return; e.target.classList.add('dragging'); e.dataTransfer.setData('text/plain', e.target.dataset.number); });
            div.addEventListener('dragend', (e) => e.target.classList.remove('dragging'));
            draggableContainer.appendChild(div);
        });
    } else { draggableContainer.style.display = 'none'; }
}

function handleElementClick(element) {
    if (userRole !== 'student' && userRole !== 'individual') return;
    if (isProcessing) return; 
    isProcessing = true;
    socket.emit('submitAnswer', { roomCode, answerNumber: element.number || element.AtomicNumber, studentName: userName });
}

function handleDrop(e) {
    e.preventDefault();
    if (isProcessing) return; 
    isProcessing = true;
    const droppedNumber = parseInt(e.dataTransfer.getData('text/plain'));
    const targetElement = e.target.closest('.element');
    if (!targetElement) { isProcessing = false; return; }
    const targetNumber = parseInt(targetElement.dataset.number);
    const draggedEl = document.querySelector(`#draggable-container .element[data-number="${droppedNumber}"]`);
    if (draggedEl) draggedEl.style.visibility = 'hidden';
    socket.emit('submitAnswer', { roomCode, answerNumber: droppedNumber, targetNumber, studentName: userName });
}

function showFeedback(isCorrect, element) {
    const elementName = element ? (element.name || element.Name) : 'Unknown Element';
    Swal.fire({ title: isCorrect ? '🎉 Correct!' : '❌ Incorrect !', html: isCorrect ? `+${100 + timeBonus} points!` : `You clicked: <strong>${elementName}</strong>`, timer: 2000, showConfirmButton: false });
}

// --- REVIEW LOGIC ---

function endGame(students) {
    document.getElementById('game-area').style.display = 'none';
    if (userRole === 'individual') launchConfetti();
    showReviewScreen(students);
}

function showReviewScreen(students) {
    const myData = students.find(s => s.name === userName);
    if (!myData) return;

    const history = myData.answerHistory || [];
    const correctCount = history.filter(a => a.isCorrect).length;
    const wrongCount = history.length - correctCount;

    let tableRows = '';
    if (history.length > 0) {
        history.forEach((item, index) => {
            const icon = item.isCorrect ? '✅' : '❌';
            const rowClass = item.isCorrect ? 'review-correct' : 'review-wrong';
            
            tableRows += `
                <tr class="${rowClass}">
                    <td>${index + 1}</td>
                    <td>${item.questionText}</td>
                    <td><b>${item.correctAnswer}</b></td>
                    <td><b>${item.userAnswer}</b></td>
                    <td style="text-align:center; font-size: 1.2em;">${icon}</td>
                </tr>
            `;
        });
    } else {
        tableRows = '<tr><td colspan="5" class="text-center">No questions answered.</td></tr>';
    }

    const htmlContent = `
        <div class="review-container">
            <h3>📊 Detailed Performance Review</h3>
            <div class="review-summary">
                <div class="review-stat"><span class="label">Score:</span> <span class="value">${myData.score}</span></div>
                <div class="review-stat"><span class="label">Correct:</span> <span class="value" style="color:green">${correctCount}</span></div>
                <div class="review-stat"><span class="label">Wrong:</span> <span class="value" style="color:red">${wrongCount}</span></div>
            </div>
            
            <div style="max-height: 400px; overflow-y: auto;">
                <table class="table table-bordered table-striped review-table">
                    <thead class="table-dark">
                        <tr>
                            <th style="width: 5%">#</th>
                            <th style="width: 35%">Question</th>
                            <th style="width: 20%">Correct Answer</th>
                            <th style="width: 20%">Your Answer</th>
                            <th style="width: 10%">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
            
            <div class="mt-4">
                ${userRole === 'individual' ? 
                    `<button id="play-again-btn" class="btn modern-btn">Play Again</button> 
                     <button id="go-home-btn" class="btn modern-btn" style="background: linear-gradient(45deg, #ef9a9a, #f44336);">Home</button>` :
                    `<button id="close-review-btn" class="btn modern-btn">Close</button>`
                }
            </div>
        </div>
    `;

    Swal.fire({
        title: '<span style="font-size: 1.5rem">Quiz Complete!</span>',
        html: htmlContent,
        width: '90%',
        showConfirmButton: false,
        showCloseButton: false,
        allowOutsideClick: false
    });

    // Handle Button Clicks
    setTimeout(() => {
        const playAgainBtn = document.getElementById('play-again-btn');
        const goHomeBtn = document.getElementById('go-home-btn');
        const closeReviewBtn = document.getElementById('close-review-btn');

        if (playAgainBtn) {
            playAgainBtn.addEventListener('click', () => {
                Swal.close();
                score = 0; elementsPlaced = 0; correctlyPlacedNumbers.clear(); draggableElements = []; dropAttempts = 0; mediumModeFinished = false;
                document.getElementById('game-area').style.display = 'block';
                socket.emit('playIndividual', { studentName: 'Player', difficulty }, ({ success, quizId }) => { if(success) roomCode = quizId; });
            });
        }
        if (goHomeBtn) {
            goHomeBtn.addEventListener('click', () => {
                Swal.close();
                resetToRoleSelection();
            });
        }
        if (closeReviewBtn) {
            closeReviewBtn.addEventListener('click', () => {
                Swal.close();
                document.getElementById('leaderboard').style.display = 'block';
            });
        }
    }, 100);
}

function updateScoreDisplay() { document.getElementById('score-display').textContent = `🏆 Score: ${score}`; document.getElementById('question-count').textContent = `${questionCount}/10`; }
function updateProgress() { document.getElementById('progress').style.width = `${(questionCount/10)*100}%`; }
function resetTableColors() { document.querySelectorAll('.element').forEach(e => e.classList.remove('correct', 'wrong')); }
function launchConfetti() { confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } }); }
function showDifficultyAlert() {
    let text = difficulty === 'easy' ? 'Click the element.' : (difficulty === 'medium' ? 'Drag elements to correct spots.' : 'Identify by property.');
    Swal.fire({ title: `${difficulty.toUpperCase()} Mode`, text, confirmButtonText: 'Start' });
}

function resetToRoleSelection() {
    userRole = null; roomCode = null; userName = null; score = 0; questionCount = 0;
    document.getElementById('game-area').style.display = 'none';
    document.getElementById('teacher-controls').style.display = 'none';
    document.getElementById('teacher-leaderboard').style.display = 'none';
    document.getElementById('student-join').style.display = 'none';
    document.getElementById('individual-mode').style.display = 'none';
    document.getElementById('leaderboard').style.display = 'none';
    document.getElementById('role-selection').style.display = 'block';
    // Show instructions again when going home
    document.getElementById('instructions-panel').style.display = 'block';
}

window.onload = async () => { if(await loadElements()) initGame(); };
