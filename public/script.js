let currentElement = null;
let score = 0;
let questionCount = 0;
const maxQuestions = 10;
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
let elementsPlaced = 0; // Track elements placed in medium mode

async function loadElements() {
    try {
        const responseEasyMedium = await fetch('data.json');
        elementsEasyMedium = await responseEasyMedium.json();
        if (!elementsEasyMedium.length) throw new Error('Empty data.json');
        elementsEasyMedium = elementsEasyMedium.map(element => {
            const atomicNumber = parseInt(element.number);
            if (atomicNumber >= 57 && atomicNumber <= 71) {
                const col = (atomicNumber - 56) + 3;
                return { ...element, row: 8, col };
            } else if (atomicNumber >= 89 && atomicNumber <= 103) {
                const col = (atomicNumber - 88) + 3;
                return { ...element, row: 9, col };
            }
            return element;
        });
        elementsEasyMedium.sort((a, b) => parseInt(a.number) - parseInt(b.number));

        const responseHard = await fetch('data2.json');
        const dataHard = await responseHard.json();
        if (!dataHard.length) throw new Error('Empty data2.json');
        elementsHard = dataHard.map(element => {
            const atomicNumber = parseInt(element.AtomicNumber);
            let row, col;
            if (atomicNumber >= 57 && atomicNumber <= 71) {
                row = 8;
                col = (atomicNumber - 57) + 4;
            } else if (atomicNumber >= 89 && atomicNumber <= 103) {
                row = 9;
                col = (atomicNumber - 89) + 4;
            } else if (atomicNumber === 1) {
                row = 1;
                col = 1;
            } else if (atomicNumber === 2) {
                row = 1;
                col = 18;
            } else if (atomicNumber >= 3 && atomicNumber <= 4) {
                row = 2;
                col = atomicNumber - 2;
            } else if (atomicNumber >= 5 && atomicNumber <= 10) {
                row = 2;
                col = atomicNumber + 8;
            } else if (atomicNumber >= 11 && atomicNumber <= 12) {
                row = 3;
                col = atomicNumber - 10;
            } else if (atomicNumber >= 13 && atomicNumber <= 18) {
                row = 3;
                col = atomicNumber;
            } else if (atomicNumber >= 19 && atomicNumber <= 36) {
                row = 4;
                col = atomicNumber - 18;
            } else if (atomicNumber >= 37 && atomicNumber <= 54) {
                row = 5;
                col = atomicNumber - 36;
            } else if (atomicNumber === 55) {
                row = 6;
                col = 1;
            } else if (atomicNumber === 56) {
                row = 6;
                col = 2;
            } else if (atomicNumber >= 72 && atomicNumber <= 86) {
                row = 6;
                col = atomicNumber - 68;
            } else if (atomicNumber === 87) {
                row = 7;
                col = 1;
            } else if (atomicNumber === 88) {
                row = 7;
                col = 2;
            } else if (atomicNumber >= 104 && atomicNumber <= 118) {
                row = 7;
                col = atomicNumber - 100;
            } else {
                console.warn(`No row/col defined for atomic number ${atomicNumber}`);
                row = 0;
                col = 0;
            }
            return {
                number: element.AtomicNumber,
                symbol: element.Symbol,
                name: element.Name,
                mass: element.AtomicMass,
                row,
                col,
                group: element.GroupBlock,
                electronConfiguration: element.ElectronConfiguration,
                atomicRadius: element.AtomicRadius
            };
        });
        elementsHard.sort((a, b) => parseInt(a.number) - parseInt(b.number));
    } catch (error) {
        console.error('Error loading elements:', error);
        Swal.fire({
            title: 'Error',
            text: 'Failed to load elements data! Please try again.',
            icon: 'error'
        });
        return false;
    }
    return true;
}

function initGame() {
    socket = io();

    document.getElementById('teacher-btn').addEventListener('click', () => {
        userRole = 'teacher';
        document.getElementById('role-selection').style.display = 'none';
        document.getElementById('teacher-controls').style.display = 'block';
    });

    document.getElementById('student-btn').addEventListener('click', () => {
        userRole = 'student';
        document.getElementById('role-selection').style.display = 'none';
        document.getElementById('student-join').style.display = 'block';
    });

    document.getElementById('individual-btn').addEventListener('click', () => {
        userRole = 'individual';
        document.getElementById('role-selection').style.display = 'none';
        document.getElementById('individual-mode').style.display = 'block';
    });

    document.getElementById('create-room-btn').addEventListener('click', () => {
        userName = document.getElementById('teacher-name').value.trim();
        if (!userName) {
            Swal.fire('Error', 'Please enter your name', 'error');
            return;
        }
        socket.emit('createRoom', userName, ({ roomCode: code, success }) => {
            if (success) {
                roomCode = code;
                document.getElementById('room-code-display').innerHTML = `Room Code: <strong>${roomCode}</strong>`;
                document.getElementById('start-game-btn').style.display = 'inline-block';
            } else {
                Swal.fire('Error', 'Failed to create room', 'error');
            }
        });
    });

    document.getElementById('join-room-btn').addEventListener('click', () => {
        userName = document.getElementById('student-name').value.trim();
        const code = document.getElementById('room-code').value.trim().toUpperCase();
        if (!userName || !code) {
            Swal.fire('Error', 'Please enter your name and room code', 'error');
            return;
        }
        socket.emit('joinRoom', { roomCode: code, studentName: userName }, ({ success, message, roomCode: joinedCode }) => {
            if (success) {
                roomCode = joinedCode;
                document.getElementById('student-join').style.display = 'none';
                document.getElementById('game-area').style.display = 'block';
                Swal.fire('Success', `Joined room ${roomCode}! Waiting for the teacher to start the game.`, 'success');
            } else {
                Swal.fire('Error', message || 'Failed to join room', 'error');
            }
        });
    });

    document.getElementById('start-individual-btn').addEventListener('click', () => {
        if (!elementsEasyMedium.length || !elementsHard.length) {
            Swal.fire('Error', 'Element data not loaded. Please refresh the page.', 'error');
            return;
        }
        difficulty = document.getElementById('individual-difficulty').value;
        userName = 'Player';
        socket.emit('playIndividual', { studentName: userName, difficulty }, ({ success, quizId }) => {
            if (success) {
                roomCode = quizId;
                document.getElementById('individual-mode').style.display = 'none';
                document.getElementById('game-area').style.display = 'block';
                Swal.fire('Success', `Started individual ${difficulty} mode game!`, 'success');
            } else {
                Swal.fire('Error', 'Failed to start individual game', 'error');
            }
        });
    });

    document.getElementById('start-game-btn').addEventListener('click', () => {
        if (!elementsEasyMedium.length || !elementsHard.length) {
            Swal.fire('Error', 'Element data not loaded. Please refresh the page.', 'error');
            return;
        }
        difficulty = document.getElementById('difficulty').value;
        Swal.fire({
            title: 'Starting Game',
            text: 'The game is starting for all students!',
            icon: 'info',
            timer: 1500,
            showConfirmButton: false
        });
        socket.emit('startGame', { roomCode, difficulty });
    });

    document.getElementById('next-question-btn').addEventListener('click', () => {
        socket.emit('nextQuestion', { roomCode });
    });

    document.getElementById('stop-quiz-btn').addEventListener('click', () => {
        socket.emit('stopQuiz', { roomCode });
    });

    document.getElementById('resume-quiz-btn').addEventListener('click', () => {
        socket.emit('resumeQuiz', { roomCode });
    });

    document.getElementById('finish-quiz-btn').addEventListener('click', () => {
        socket.emit('finishQuiz', { roomCode });
    });

    document.getElementById('publish-leaderboard-btn').addEventListener('click', () => {
        socket.emit('publishLeaderboard', { roomCode });
        Swal.fire('Leaderboard Published', 'All students can now see the leaderboard.', 'success');
    });

    socket.on('updateStudents', (students) => {
        if (userRole === 'teacher') {
            updateTeacherLeaderboard(students);
        }
    });

    socket.on('gameStarted', ({ difficulty: gameDifficulty }) => {
        difficulty = gameDifficulty;
        score = 0;
        questionCount = 0;
        elementsPlaced = 0;
        updateScoreDisplay();
        if (userRole === 'student' || userRole === 'individual') {
            createPeriodicTable();
            showDifficultyAlert();
            document.getElementById('game-area').style.display = 'block';
            Swal.fire('Game Started', `The ${userRole === 'individual' ? 'individual' : 'teacher has started the'} ${difficulty} mode game!`, 'success');
        } else {
            document.getElementById('teacher-controls').style.display = 'none';
            document.getElementById('teacher-leaderboard').style.display = 'block';
            document.getElementById('stop-quiz-btn').style.display = 'inline-block';
            document.getElementById('finish-quiz-btn').style.display = 'inline-block';
        }
        document.getElementById('leaderboard').style.display = 'none';
    });

    socket.on('teacherGameStarted', () => {
        startNewGame();
    });

    socket.on('newQuestion', ({ question, questionProperty, questionCount: serverQuestionCount, elements }) => {
        if (userRole !== 'student' && userRole !== 'individual') return;
        currentQuestionProperty = questionProperty;
        questionCount = serverQuestionCount;
        draggableElements = elements || [];
        const questionDisplay = document.getElementById('question-display');
        if (questionDisplay) {
            questionDisplay.innerHTML = question;
        } else {
            console.error('Question display element not found');
        }
        resetTableColors();
        createPeriodicTable();
        updateProgress();
    });

    socket.on('updateTimer', (timeBonusValue) => {
        if (userRole !== 'student' && userRole !== 'individual') return;
        timeBonus = timeBonusValue;
        document.getElementById('timer').textContent = `⏳ Time Bonus: ${timeBonus}`;
    });

    socket.on('answerFeedback', ({ isCorrect, element }) => {
        if (userRole !== 'student' && userRole !== 'individual') return;
        if (isCorrect) {
            score += 100 + timeBonus;
            elementsPlaced++;
            launchConfetti();
            const elementDiv = document.querySelector(`.element[data-number="${element.number}"]`);
            if (elementDiv) {
                elementDiv.classList.add('correct');
                if (difficulty === 'medium' && elementsPlaced === 10) {
                    elementDiv.classList.add('completed');
                    socket.emit('mediumComplete', { roomCode, studentName: userName });
                    if (userRole === 'individual') {
                        Swal.fire('Quiz Completed', 'All elements placed correctly!', 'success');
                    } else {
                        Swal.fire('Your Part Completed', 'Waiting for other students to finish.', 'success');
                    }
                }
            }
        } else {
            score = Math.max(0, score - 50);
            const elementDiv = document.querySelector(`.element[data-number="${element.number}"]`);
            if (elementDiv && difficulty === 'hard') {
                elementDiv.classList.add('highlight-correct');
                setTimeout(() => elementDiv.classList.remove('highlight-correct'), 2000);
            }
        }
        showFeedback(isCorrect, element);
        updateScoreDisplay();
    });

    socket.on('allMediumComplete', () => {
        if (userRole === 'teacher') {
            Swal.fire({
                title: 'All Students Completed',
                text: 'Proceed to the next question?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Next Question',
                cancelButtonText: 'Stay'
            }).then((result) => {
                if (result.isConfirmed) {
                    document.getElementById('next-question-btn').click();
                }
            });
            document.getElementById('next-question-btn').style.display = 'inline-block';
        }
    });

    socket.on('quizStopped', () => {
        if (userRole === 'student') {
            Swal.fire('Quiz Paused', 'The teacher has paused the quiz.', 'info');
            document.getElementById('game-area').style.display = 'none';
            document.getElementById('resume-quiz-btn').style.display = 'inline-block';
        }
    });

    socket.on('quizResumed', () => {
        if (userRole === 'student') {
            Swal.fire('Quiz Resumed', 'The quiz has resumed!', 'success');
            document.getElementById('game-area').style.display = 'block';
            document.getElementById('resume-quiz-btn').style.display = 'none';
        }
    });

    socket.on('quizFinished', ({ students }) => {
        if (userRole === 'student' || userRole === 'individual') {
            document.getElementById('game-area').style.display = 'none';
            Swal.fire('Quiz Ended', userRole === 'individual' ? 'Your individual quiz has ended.' : 'The teacher has ended the quiz.', 'info');
        } else {
            document.getElementById('stop-quiz-btn').style.display = 'none';
            document.getElementById('resume-quiz-btn').style.display = 'none';
            document.getElementById('finish-quiz-btn').style.display = 'none';
            document.getElementById('publish-leaderboard-btn').style.display = 'inline-block';
            updateTeacherLeaderboard(students);
        }
    });

    socket.on('showLeaderboard', ({ students }) => {
        showLeaderboard(students);
    });

    socket.on('roomClosed', () => {
        Swal.fire('Room Closed', 'The teacher has closed the room.', 'info').then(() => {
            resetToRoleSelection();
        });
    });

    socket.on('error', ({ message }) => {
        Swal.fire('Error', message, 'error');
    });
}

function updateTeacherLeaderboard(students) {
    const tbody = document.getElementById('teacher-leaderboard-body');
    tbody.innerHTML = '';
    students.sort((a, b) => b.score - a.score).forEach((student, index) => {
        const row = document.createElement('tr');
        row.classList.add('leaderboard-row');
        const rankBadge = index < 3 ? `<span class="rank-badge rank-${index + 1}">${index + 1}</span>` : index + 1;
        row.innerHTML = `<td>${rankBadge}</td><td>${student.name}</td><td>${student.score}</td><td>${student.elementsPlaced || 0}/10</td>`;
        tbody.appendChild(row);
        row.classList.add('slide-in');
        setTimeout(() => row.classList.remove('slide-in'), 500);
    });
}

function showDifficultyAlert() {
    let title, html;
    switch (difficulty) {
        case 'easy':
            title = 'Easy Mode: Periodic Table Challenge';
            html = `Click on the correct element in the periodic table!<br>
                <ul class="text-start">
                    <li>✅ Correct: 100 + time bonus points</li>
                    <li>❌ Wrong: -50 points</li>
                    <li>⏳ Time bonus starts at 200, decreases over time</li>
                    <li>🎯 Find the prompted element quickly!</li>
                </ul>`;
            break;
        case 'medium':
            title = 'Medium Mode: Periodic Table Challenge';
            html = `Drag and drop 10 elements to their correct positions!<br>
                <ul class="text-start">
                    <li>✅ Correct: 100 + time bonus points per element</li>
                    <li>❌ Wrong: -50 points, element moves to correct position</li>
                    <li>⏳ Time bonus starts at 200, decreases over time</li>
                    <li>🎯 Place all 10 elements accurately!</li>
                </ul>`;
            break;
        case 'hard':
            title = 'Hard Mode: Periodic Table Challenge';
            html = `Click on the element matching the given property!<br>
                <ul class="text-start">
                    <li>✅ Correct: 100 + time bonus points</li>
                    <li>❌ Wrong: -50 points, correct element highlighted for 2 seconds</li>
                    <li>⏳ Time bonus starts at 200, decreases over time</li>
                    <li>🎯 Identify elements by properties like Atomic Number, Atomic Mass, Atomic Radius!</li>
                </ul>`;
            break;
    }
    Swal.fire({
        title,
        html,
        confirmButtonText: 'Start Game!'
    });
}

function createPeriodicTable() {
    const table = document.getElementById('periodic-table');
    const draggableContainer = document.getElementById('draggable-container');
    const groupNumbers = document.querySelector('.group-numbers');
    const periodNumbers = document.querySelector('.period-numbers');

    table.className = 'modern-table';
    if (difficulty === 'easy') {
        table.classList.add('easy-mode');
    }

    table.innerHTML = '<div class="row-gap"></div>';
    draggableContainer.innerHTML = '';
    groupNumbers.innerHTML = '';
    periodNumbers.innerHTML = '';

    for (let i = 1; i <= 18; i++) {
        const div = document.createElement('div');
        div.textContent = i;
        groupNumbers.appendChild(div);
    }

    for (let i = 1; i <= 7; i++) {
        const div = document.createElement('div');
        div.className = 'period-number';
        div.textContent = i;
        periodNumbers.appendChild(div);
    }

    const disabledCells = [
        { row: 6, col: 3 },
        { row: 7, col: 3 }
    ];

    disabledCells.forEach(cell => {
        const div = document.createElement('div');
        div.className = 'element empty';
        div.style.gridRow = cell.row;
        div.style.gridColumn = cell.col;
        table.appendChild(div);
    });

    const elements = difficulty === 'hard' ? elementsHard : elementsEasyMedium;

    if (difficulty === 'medium') {
        elements.forEach(element => {
            if ((element.row === 6 && element.col === 3) || (element.row === 7 && element.col === 3)) {
                return;
            }
            if (element.row > 9 || element.col > 18 || element.col < 1) {
                console.warn(`Element ${element.name} (Z=${element.number}) has invalid position (row ${element.row}, col ${element.col}). Skipping.`);
                return;
            }
            const div = document.createElement('div');
            div.className = `element droppable group-block-${element.group}`;
            div.dataset.number = element.number;
            const gridRow = element.row + (element.row >= 8 ? 1 : 0);
            div.style.gridRow = gridRow;
            div.style.gridColumn = element.col;

            if (element.name === 'Hydrogen') {
                div.classList.add('hydrogen-block');
            } else if (element.name === 'Helium') {
                div.classList.add('helium-block');
            }

            table.appendChild(div);
        });

        draggableElements = elements
            .filter(el => !(el.row === 6 && el.col === 3) && !(el.row === 7 && el.col === 3) && el.row <= 9 && el.col <= 18 && el.col >= 1)
            .sort(() => Math.random() - 0.5)
            .slice(0, 10);
        draggableElements.forEach(element => {
            const div = document.createElement('div');
            div.className = `draggable element group-block-${element.group}`;
            div.draggable = true;
            div.dataset.number = element.number;
            div.innerHTML = `
                <div class="number">${element.number}</div>
                <div class="symbol">${element.symbol}</div>
                <div class="atomic-mass">${element.mass.toFixed(3)}</div>
            `;
            div.addEventListener('dragstart', (e) => {
                e.target.classList.add('dragging');
                e.dataTransfer.setData('text/plain', e.target.dataset.number);
            });
            div.addEventListener('dragend', (e) => e.target.classList.remove('dragging'));
            draggableContainer.appendChild(div);
        });

        interact('.draggable').draggable({
            inertia: true,
            modifiers: [
                interact.modifiers.restrictRect({
                    restriction: 'parent',
                    endOnly: true
                })
            ],
            listeners: {
                start(event) {
                    event.target.classList.add('dragging');
                },
                move(event) {
                    const target = event.target;
                    const x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
                    const y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;
                    target.style.transform = `translate(${x}px, ${y}px)`;
                    target.setAttribute('data-x', x);
                    target.setAttribute('data-y', y);
                },
                end(event) {
                    event.target.classList.remove('dragging');
                    event.target.style.transform = '';
                    event.target.removeAttribute('data-x');
                    event.target.removeAttribute('data-y');
                }
            }
        });

        interact('.droppable').dropzone({
            accept: '.draggable',
            overlap: 0.5,
            ondrop(event) {
                const droppedNumber = parseInt(event.relatedTarget.dataset.number);
                const targetNumber = parseInt(event.target.dataset.number);
                socket.emit('submitAnswer', { roomCode, answerNumber: droppedNumber, studentName: userName });
                event.relatedTarget.remove();
            }
        });
    } else {
        elements.forEach(element => {
            if ((element.row === 6 && element.col === 3) || (element.row === 7 && element.col === 3)) {
                return;
            }
            if (element.row > 9 || element.col > 18 || element.col < 1) {
                console.warn(`Element ${element.name} (Z=${element.number}) has invalid position (row ${element.row}, col ${element.col}). Skipping.`);
                return;
            }
            const div = document.createElement('div');
            div.className = `element group-block-${element.group}`;
            div.dataset.number = element.number;
            const gridRow = element.row + (element.row >= 8 ? 1 : 0);
            div.style.gridRow = gridRow;
            div.style.gridColumn = element.col;
            let elementHTML = `<div class="symbol">${element.symbol}</div>`;
            if (difficulty !== 'hard' || currentQuestionProperty !== 'number') {
                elementHTML = `<div class="number">${element.number}</div>` + elementHTML;
            }
            if (difficulty !== 'hard' || currentQuestionProperty !== 'mass') {
                elementHTML += `<div class="atomic-mass">${element.mass.toFixed(3)}</div>`;
            }
            div.innerHTML = elementHTML;
            div.addEventListener('click', () => handleElementClick(element));
            table.appendChild(div);
        });
    }
}

function startNewGame() {
    if (userRole !== 'teacher') return;
    if (questionCount >= maxQuestions) {
        socket.emit('finishQuiz', { roomCode });
        return;
    }

    if (difficulty === 'easy') {
        currentElement = elementsEasyMedium[Math.floor(Math.random() * elementsEasyMedium.length)];
        socket.emit('setQuestion', {
            roomCode,
            question: `Find: <strong>${currentElement.name}</strong>`,
            element: currentElement,
            questionProperty: null,
            questionCount: questionCount + 1
        });
    } else if (difficulty === 'medium') {
        const selectedElements = elementsEasyMedium
            .filter(el => !(el.row === 6 && el.col === 3) && !(el.row === 7 && el.col === 3) && el.row <= 9 && el.col <= 18 && el.col >= 1)
            .sort(() => Math.random() - 0.5)
            .slice(0, 10);
        socket.emit('setQuestion', {
            roomCode,
            question: `Drag and drop the 10 elements to their correct positions`,
            element: null,
            questionProperty: null,
            questionCount: questionCount + 1,
            elements: selectedElements
        });
    } else if (difficulty === 'hard') {
        currentElement = elementsHard[Math.floor(Math.random() * elementsHard.length)];
        const properties = [
            { key: 'number', display: 'Atomic Number', value: currentElement.number },
            { key: 'mass', display: 'Atomic Mass', value: currentElement.mass.toFixed(3) },
            { key: 'electronConfiguration', display: 'Electron Configuration', value: currentElement.electronConfiguration },
            { key: 'atomicRadius', display: 'Atomic Radius', value: currentElement.atomicRadius }
        ].filter(prop => prop.value && prop.value !== '');
        if (properties.length === 0) {
            console.warn(`No valid properties for element ${currentElement.name} (Z=${currentElement.number}). Selecting another element.`);
            return startNewGame();
        }
        const questionProp = properties[Math.floor(Math.random() * properties.length)];
        currentQuestionProperty = questionProp.key;
        socket.emit('setQuestion', {
            roomCode,
            question: `Which element has ${questionProp.display} = ${questionProp.value}?`,
            element: currentElement,
            questionProperty: questionProp.key,
            questionCount: questionCount + 1
        });
    }
    questionCount++;
}

function handleElementClick(element) {
    if (userRole !== 'student' && userRole !== 'individual') return;
    socket.emit('submitAnswer', {
        roomCode: roomCode,
        answerNumber: element.number,
        studentName: userName
    });
}

function resetTableColors() {
    document.querySelectorAll('.element').forEach(el => {
        el.classList.remove('correct', 'wrong', 'highlight-correct', 'completed');
        if (difficulty === 'medium' && !el.innerHTML && !el.classList.contains('empty')) {
            const elementData = elementsEasyMedium.find(e => parseInt(e.number) === parseInt(el.dataset.number));
            if (elementData) {
                el.className = `element droppable group-block-${elementData.group}`;
                if (elementData.name === 'Hydrogen') {
                    el.classList.add('hydrogen-block');
                } else if (elementData.name === 'Helium') {
                    el.classList.add('helium-block');
                }
            }
        }
    });
}

function launchConfetti() {
    const duration = 3000;
    const end = Date.now() + duration;
    (function frame() {
        confetti({
            particleCount: 5,
            angle: 60,
            spread: 55,
            origin: { x: 0 }
        });
        confetti({
            particleCount: 5,
            angle: 120,
            spread: 55,
            origin: { x: 1 }
        });
        if (Date.now() < end) {
            requestAnimationFrame(frame);
        }
    })();
}

function updateScoreDisplay() {
    document.getElementById('score-display').textContent = `🏆 Score: ${score}`;
    document.getElementById('question-count').textContent = `${questionCount}/${maxQuestions}`;
}

function updateProgress() {
    const progress = (questionCount / maxQuestions) * 100;
    document.getElementById('progress').style.width = `${progress}%`;
}

function showEasyFeedback(isCorrect, element) {
    Swal.fire({
        title: isCorrect ? '' : '❌ Try Again!',
        html: isCorrect ? 
            `<img src="subi.gif" alt="Subi Animation" style="width: 100%; height: 100%; object-fit: contain; margin: 0;">` :
            `You clicked: ${element.name} (${element.symbol}) ${element.number}`,
        icon: isCorrect ? null : 'error',
        timer: 3000,
        showConfirmButton: false,
        allowOutsideClick: !isCorrect,
        customClass: {
            popup: isCorrect ? 'swal-gif-popup' : ''
        }
    });
}

function showMediumFeedback(isCorrect, element) {
    Swal.fire({
        title: isCorrect ? '🎉 Correct!' : '❌ Try Again!',
        html: isCorrect ? 
            `+${100 + timeBonus} points!<br>${element.name} (${element.symbol})<br>Elements Placed: ${elementsPlaced}/10` :
            `You dropped on: ${element.name} (${element.symbol}).`,
        icon: isCorrect ? 'success' : 'error',
        timer: 3500,
        showConfirmButton: false,
        allowOutsideClick: !isCorrect
    });
}

function showHardFeedback(isCorrect, element) {
    Swal.fire({
        title: isCorrect ? '🎉 Correct!' : '❌ Try Again!',
        html: isCorrect ? 
            `+${100 + timeBonus} points!<br>${element.name} (${element.symbol})` :
            `You clicked: ${element.name} (${element.symbol}) ${element.number}`,
        icon: isCorrect ? 'success' : 'error',
        timer: 3500,
        showConfirmButton: false,
        allowOutsideClick: !isCorrect
    });
}

function showFeedback(isCorrect, element) {
    switch (difficulty) {
        case 'easy': showEasyFeedback(isCorrect, element); break;
        case 'medium': showMediumFeedback(isCorrect, element); break;
        case 'hard': showHardFeedback(isCorrect, element); break;
    }
}

function showLeaderboard(students) {
    document.getElementById('game-area').style.display = 'none';
    document.getElementById('leaderboard').style.display = 'block';
    const tbody = document.getElementById('leaderboard-body');
    tbody.innerHTML = '';
    students.sort((a, b) => b.score - a.score).forEach((student, index) => {
        const row = document.createElement('tr');
        row.classList.add('leaderboard-row');
        if ((userRole === 'student' || userRole === 'individual') && student.name === userName) {
            row.classList.add('user-row');
        }
        const rankBadge = index < 3 ? `<span class="rank-badge rank-${index + 1}">${index + 1}</span>` : index + 1;
        row.innerHTML = `<td>${rankBadge}</td><td>${student.name}</td><td>${student.score}</td>`;
        tbody.appendChild(row);
        row.classList.add('slide-in');
        setTimeout(() => row.classList.remove('slide-in'), 500);
    });
}

function resetToRoleSelection() {
    userRole = null;
    roomCode = null;
    userName = null;
    score = 0;
    questionCount = 0;
    elementsPlaced = 0;
    document.getElementById('game-area').style.display = 'none';
    document.getElementById('teacher-controls').style.display = 'none';
    document.getElementById('teacher-leaderboard').style.display = 'none';
    document.getElementById('student-join').style.display = 'none';
    document.getElementById('individual-mode').style.display = 'none';
    document.getElementById('leaderboard').style.display = 'none';
    document.getElementById('role-selection').style.display = 'block';
    updateScoreDisplay();
}

window.onload = async () => {
    const elementsLoaded = await loadElements();
    if (!elementsLoaded) return;
    Swal.fire({
        title: 'Periodic Table Challenge',
        html: `Select a role to begin!<br>
            <ul class="text-start">
                <li><b>Teacher:</b> Create a room and manage the quiz</li>
                <li><b>Student:</b> Join a room and answer questions</li>
                <li><b>Individual Play:</b> Play the quiz on your own</li>
            </ul>`,
        confirmButtonText: 'Start!'
    }).then(() => {
        initGame();
    });
};