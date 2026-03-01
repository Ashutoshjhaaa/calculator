const expressionDisplay = document.getElementById('expressionDisplay');
const resultDisplay = document.getElementById('resultDisplay');
const memoryIndicator = document.getElementById('memoryIndicator');
const buttons = document.querySelectorAll('button');
const liveStatus = document.getElementById('liveStatus');
const modeToggleButton = document.getElementById('modeToggle');
const historyList = document.getElementById('historyList');
const clearHistoryButton = document.getElementById('clearHistoryBtn');
const resetAppButton = document.getElementById('resetAppBtn');
const historySearchInput = document.getElementById('historySearchInput');
const modeSwitchButton = document.getElementById('modeSwitch');
const helpButton = document.getElementById('helpBtn');
const helpModal = document.getElementById('helpModal');
const closeHelpButton = document.getElementById('closeHelp');
const sciSection = document.querySelector('.sci-section');

let expression = '';
let isErrorState = false;
let errorType = '';
let lastDeleteAnnouncementAt = 0;
let angleMode = 'DEG';
let lastAnswer = null;
let memoryValue = 0;
let historyFilterQuery = '';
let isScientificMode = true;

const calculationHistory = [];
const HISTORY_LIMIT = 10;
const HISTORY_STORAGE_KEY = 'scientific_calculator_history_v1';
const UI_STATE_STORAGE_KEY = 'scientific_calculator_ui_state_v1';
const MAX_DECIMAL_PLACES = 10;

const scientificFunctions = ['sin', 'cos', 'tan', 'log', 'ln', '√'];

function announceStatus(message) {
    if (!liveStatus) return;
    liveStatus.textContent = '';
    setTimeout(() => {
        liveStatus.textContent = message;
    }, 10);
}

function formatNumber(value) {
    if (!Number.isFinite(value)) {
        throw new Error('Invalid result');
    }

    const absoluteValue = Math.abs(value);
    if ((absoluteValue !== 0 && absoluteValue < 1e-9) || absoluteValue >= 1e12) {
        return value.toExponential(6).replace(/\.0+e/, 'e').replace(/(\.\d*?)0+e/, '$1e');
    }

    const roundedValue = Number(value.toFixed(MAX_DECIMAL_PLACES));
    return String(roundedValue);
}

function addThousandsSeparators(numberString) {
    if (numberString.includes('e') || numberString.includes('E')) {
        return numberString;
    }

    let sign = '';
    let absoluteString = numberString;

    if (absoluteString.startsWith('-')) {
        sign = '-';
        absoluteString = absoluteString.slice(1);
    }

    const [integerPart, decimalPart] = absoluteString.split('.');
    const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    if (decimalPart === undefined) {
        return `${sign}${groupedInteger}`;
    }

    return `${sign}${groupedInteger}.${decimalPart}`;
}

function getResultPreview() {
    if (isErrorState) {
        return errorType || 'Error';
    }

    if (!expression) {
        return '0';
    }

    const lastChar = expression[expression.length - 1];
    if (isOperator(lastChar) || lastChar === '(' || countUnclosedParentheses(expression) !== 0) {
        return '';
    }

    try {
        const evaluatedValue = evaluateExpression(expression);
        const formattedValue = formatNumber(evaluatedValue);
        return addThousandsSeparators(formattedValue);
    } catch (error) {
        return '';
    }
}

function getExpressionDisplayText() {
    if (!expression) {
        return '0';
    }

    if (isErrorState) {
        return expression;
    }

    const isPlainNumber = /^-?\d+(\.\d+)?$/.test(expression);
    if (!isPlainNumber) {
        return expression;
    }

    return addThousandsSeparators(expression);
}

function formatDisplayNumberString(valueString) {
    if (typeof valueString !== 'string') {
        return valueString;
    }

    const isPlainNumber = /^-?\d+(\.\d+)?$/.test(valueString);
    if (!isPlainNumber) {
        return valueString;
    }

    return addThousandsSeparators(valueString);
}

function renderDisplay() {
    if (expressionDisplay) {
        expressionDisplay.textContent = getExpressionDisplayText();
    }

    if (resultDisplay) {
        resultDisplay.textContent = getResultPreview();
    }

    if (memoryIndicator) {
        if (memoryValue !== 0) {
            const formattedMemory = formatNumber(memoryValue);
            memoryIndicator.textContent = `M: ${addThousandsSeparators(formattedMemory)}`;
            memoryIndicator.style.display = 'block';
            memoryIndicator.setAttribute('aria-label', `Memory value: ${formattedMemory}`);
            memoryIndicator.setAttribute('aria-hidden', 'false');
        } else {
            memoryIndicator.textContent = '';
            memoryIndicator.style.display = 'none';
            memoryIndicator.setAttribute('aria-hidden', 'true');
        }
    }

    saveUiStateToStorage();
}

function renderAngleMode() {
    if (!modeToggleButton) return;
    modeToggleButton.textContent = angleMode;
    modeToggleButton.setAttribute('aria-label', `Toggle angle mode. Current mode ${angleMode}`);
}

function formatHistoryTimestamp(timestamp) {
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
        return '';
    }

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toLocaleString([], {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function renderHistory() {
    if (!historyList) return;

    historyList.innerHTML = '';

    const normalizedQuery = historyFilterQuery.trim().toLowerCase();
    const filteredHistory = normalizedQuery
        ? calculationHistory.filter((entry) => {
            const searchableText = `${entry.expression} ${entry.result}`.toLowerCase();
            return searchableText.includes(normalizedQuery);
        })
        : calculationHistory;

    filteredHistory.forEach((entry) => {
        const item = document.createElement('li');
        const formattedExpression = formatDisplayNumberString(entry.expression);
        const formattedResult = formatDisplayNumberString(entry.result);

        const mainText = document.createElement('div');
        mainText.className = 'history-item-main';
        mainText.textContent = `${formattedExpression} = ${formattedResult}`;

        const timeText = document.createElement('div');
        timeText.className = 'history-item-time';
        timeText.textContent = formatHistoryTimestamp(entry.timestamp);

        item.appendChild(mainText);
        item.appendChild(timeText);
        item.className = 'history-item';
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');
        item.setAttribute('aria-label', `Reuse expression ${entry.expression}`);
        item.dataset.expression = entry.expression;
        historyList.appendChild(item);
    });
}

function loadExpressionFromHistory(expressionText) {
    if (!expressionText) {
        return;
    }
    expression = expressionText;
    isErrorState = false;
    renderDisplay();
    announceStatus('Expression loaded from history');
}

function saveHistoryToStorage() {
    try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(calculationHistory));
    } catch (error) {
    }
}

function saveUiStateToStorage() {
    try {
        localStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify({
            expression,
            angleMode,
            lastAnswer,
            memoryValue,
            isScientificMode,
        }));
    } catch (error) {
    }
}

function loadUiStateFromStorage() {
    try {
        const savedUiState = localStorage.getItem(UI_STATE_STORAGE_KEY);
        if (!savedUiState) {
            return;
        }

        const parsedUiState = JSON.parse(savedUiState);
        if (!parsedUiState || typeof parsedUiState !== 'object') {
            return;
        }

        if (parsedUiState.angleMode === 'DEG' || parsedUiState.angleMode === 'RAD') {
            angleMode = parsedUiState.angleMode;
        }

        if (typeof parsedUiState.expression === 'string') {
            expression = parsedUiState.expression;
            isErrorState = expression === 'Error' || expression.includes('Error');
        }

        if (typeof parsedUiState.lastAnswer === 'number' && Number.isFinite(parsedUiState.lastAnswer)) {
            lastAnswer = parsedUiState.lastAnswer;
        }

        if (typeof parsedUiState.memoryValue === 'number' && Number.isFinite(parsedUiState.memoryValue)) {
            memoryValue = parsedUiState.memoryValue;
        }

        if (typeof parsedUiState.isScientificMode === 'boolean') {
            isScientificMode = parsedUiState.isScientificMode;
            if (!isScientificMode && sciSection) {
                sciSection.classList.add('hidden');
                if (modeSwitchButton) {
                    modeSwitchButton.textContent = 'Basic ▲';
                }
            }
        }
    } catch (error) {
    }
}

function loadHistoryFromStorage() {
    try {
        const savedHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
        if (!savedHistory) {
            return;
        }

        const parsedHistory = JSON.parse(savedHistory);
        if (!Array.isArray(parsedHistory)) {
            return;
        }

        calculationHistory.length = 0;
        parsedHistory.slice(0, HISTORY_LIMIT).forEach((entry) => {
            if (
                entry &&
                typeof entry.expression === 'string' &&
                typeof entry.result === 'string'
            ) {
                calculationHistory.push({
                    expression: entry.expression,
                    result: entry.result,
                    timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : Date.now(),
                });
            }
        });

        if (calculationHistory.length > 0) {
            const latestResult = Number(calculationHistory[0].result);
            if (!Number.isNaN(latestResult) && Number.isFinite(latestResult)) {
                lastAnswer = latestResult;
            }
        }
    } catch (error) {
    }
}

function addHistoryEntry(expressionText, resultText) {
    calculationHistory.unshift({
        expression: expressionText,
        result: resultText,
        timestamp: Date.now(),
    });
    if (calculationHistory.length > HISTORY_LIMIT) {
        calculationHistory.length = HISTORY_LIMIT;
    }
    renderHistory();
    saveHistoryToStorage();
}

function clearHistory() {
    if (calculationHistory.length === 0) {
        announceStatus('History already empty');
        return;
    }

    calculationHistory.length = 0;
    historyFilterQuery = '';
    if (historySearchInput) {
        historySearchInput.value = '';
    }
    renderHistory();
    saveHistoryToStorage();
    announceStatus('History cleared');
}

function isMemoryCommand(value) {
    return value === 'MC' || value === 'MR' || value === 'M+' || value === 'M-';
}

function getCurrentValueForMemory() {
    if (isErrorState) {
        return null;
    }

    if (!expression) {
        return typeof lastAnswer === 'number' && Number.isFinite(lastAnswer) ? lastAnswer : null;
    }

    const lastChar = expression[expression.length - 1];
    if (isOperator(lastChar) || lastChar === '(' || countUnclosedParentheses(expression) !== 0) {
        return null;
    }

    try {
        const result = evaluateExpression(expression);
        if (!Number.isFinite(result)) {
            return null;
        }
        return result;
    } catch (error) {
        return null;
    }
}

function appendMemoryRecall() {
    if (isErrorState) {
        expression = '';
        isErrorState = false;
    }

    const memoryString = String(memoryValue);
    if (memoryString.includes('e') || memoryString.includes('E')) {
        announceStatus('Memory value too large to recall');
        return;
    }

    if (!expression) {
        expression = memoryString;
        renderDisplay();
        announceStatus('Memory recalled');
        return;
    }

    const lastChar = expression[expression.length - 1];
    if (isValueBoundaryChar(lastChar) || endsWithAnsToken(expression)) {
        if (memoryValue < 0) {
            expression += `*(${memoryString})`;
        } else {
            expression += `*${memoryString}`;
        }
    } else {
        expression += memoryString;
    }

    renderDisplay();
    announceStatus('Memory recalled');
}

function handleMemoryCommand(value) {
    if (value === 'MC') {
        memoryValue = 0;
        saveUiStateToStorage();
        announceStatus('Memory cleared');
        return;
    }

    if (value === 'MR') {
        appendMemoryRecall();
        return;
    }

    const currentValue = getCurrentValueForMemory();
    if (currentValue === null) {
        announceStatus('No valid value for memory');
        return;
    }

    if (value === 'M+') {
        memoryValue += currentValue;
        saveUiStateToStorage();
        announceStatus('Added to memory');
        return;
    }

    if (value === 'M-') {
        memoryValue -= currentValue;
        saveUiStateToStorage();
        announceStatus('Subtracted from memory');
    }
}

function resetAppState() {
    expression = '';
    isErrorState = false;
    lastDeleteAnnouncementAt = 0;
    angleMode = 'DEG';
    lastAnswer = null;
    memoryValue = 0;
    historyFilterQuery = '';
    calculationHistory.length = 0;

    if (historySearchInput) {
        historySearchInput.value = '';
    }

    renderAngleMode();
    renderDisplay();
    renderHistory();

    try {
        localStorage.removeItem(HISTORY_STORAGE_KEY);
        localStorage.removeItem(UI_STATE_STORAGE_KEY);
    } catch (error) {
    }

    announceStatus('App reset complete');
}

function clearAll(shouldAnnounce = false) {
    expression = '';
    isErrorState = false;
    errorType = '';
    renderDisplay();
    if (shouldAnnounce) {
        announceStatus('Cleared');
    }
}

function toggleAngleMode() {
    angleMode = angleMode === 'DEG' ? 'RAD' : 'DEG';
    renderAngleMode();
    saveUiStateToStorage();
    announceStatus(`Angle mode ${angleMode}`);
}

function deleteLast() {
    if (isErrorState) {
        clearAll();
        return;
    }

    if (!expression) {
        return;
    }

    expression = expression.slice(0, -1);
    renderDisplay();

    const now = Date.now();
    if (now - lastDeleteAnnouncementAt > 800) {
        announceStatus('Deleted');
        lastDeleteAnnouncementAt = now;
    }
}

function isOperator(token) {
    return token === '+' || token === '-' || token === '*' || token === '/' || token === '%' || token === '^';
}

function isFunctionToken(token) {
    return scientificFunctions.includes(token);
}

function isConstantToken(token) {
    return token === 'π' || token === 'e';
}

function isAnsToken(token) {
    return token === 'Ans';
}

function isValueBoundaryChar(char) {
    if (!char) return false;
    return ((char >= '0' && char <= '9') || char === '.' || char === ')' || char === 'π' || char === 'e');
}

function endsWithAnsToken(exp) {
    return exp.endsWith('Ans');
}

function isRightAssociative(operator) {
    return operator === '^';
}

function precedence(operator) {
    if (operator === '+' || operator === '-') return 1;
    if (operator === '*' || operator === '/' || operator === '%') return 2;
    if (operator === '^') return 3;
    return 0;
}

function countUnclosedParentheses(exp) {
    let count = 0;
    for (let i = 0; i < exp.length; i += 1) {
        if (exp[i] === '(') count += 1;
        if (exp[i] === ')') count -= 1;
    }
    return count;
}

function tokenize(exp) {
    const tokens = [];
    let numberBuffer = '';

    function flushNumberBuffer() {
        if (numberBuffer === '') return;
        if (numberBuffer === '-') {
            throw new Error('Invalid expression');
        }
        tokens.push(numberBuffer);
        numberBuffer = '';
    }

    for (let i = 0; i < exp.length; i += 1) {
        const char = exp[i];

        if (char === ' ') {
            continue;
        }

        if ((char >= '0' && char <= '9') || char === '.') {
            numberBuffer += char;
            continue;
        }

        if (char === '(' || char === ')') {
            flushNumberBuffer();
            tokens.push(char);
            continue;
        }

        if (isOperator(char)) {
            flushNumberBuffer();

            const previousToken = tokens[tokens.length - 1];
            const isUnaryMinus = char === '-' && (tokens.length === 0 || isOperator(previousToken) || previousToken === '(');
            if (isUnaryMinus) {
                const nextChar = exp[i + 1];
                if (nextChar === '(' || nextChar === '√' || /[a-zA-Z]/.test(nextChar || '')) {
                    tokens.push('0');
                    tokens.push('-');
                    continue;
                }
                numberBuffer = '-';
                continue;
            }

            tokens.push(char);
            continue;
        }

        if (char === 'π' || char === 'e') {
            flushNumberBuffer();
            tokens.push(char);
            continue;
        }

        if (char === '√') {
            flushNumberBuffer();
            tokens.push('√');
            continue;
        }

        if (/[a-zA-Z]/.test(char)) {
            flushNumberBuffer();

            let identifier = '';
            while (i < exp.length && /[a-zA-Z]/.test(exp[i])) {
                identifier += exp[i];
                i += 1;
            }
            i -= 1;

            const normalizedIdentifier = identifier.toLowerCase();
            if (normalizedIdentifier === 'pi') {
                tokens.push('π');
                continue;
            }

            if (normalizedIdentifier === 'e') {
                tokens.push('e');
                continue;
            }

            if (isFunctionToken(normalizedIdentifier)) {
                tokens.push(normalizedIdentifier);
                continue;
            }

            if (normalizedIdentifier === 'ans') {
                tokens.push('Ans');
                continue;
            }

            throw new Error('Invalid expression');
        }

        throw new Error('Invalid character');
    }

    flushNumberBuffer();

    return tokens;
}

function applyOperator(a, b, operator) {
    if (operator === '+') return a + b;
    if (operator === '-') return a - b;
    if (operator === '*') return a * b;
    if (operator === '/') {
        if (b === 0) throw new Error('Division by zero');
        return a / b;
    }
    if (operator === '%') {
        if (b === 0) throw new Error('Division by zero');
        return a % b;
    }
    if (operator === '^') return a ** b;
    throw new Error('Unknown operator');
}

function applyScientificFunction(name, value) {
    if (name === 'sin' || name === 'cos' || name === 'tan') {
        const angleValue = angleMode === 'DEG' ? (value * Math.PI) / 180 : value;
        if (name === 'sin') return Math.sin(angleValue);
        if (name === 'cos') return Math.cos(angleValue);
        return Math.tan(angleValue);
    }

    if (name === 'log') {
        if (value <= 0) throw new Error('Math domain error');
        return Math.log10(value);
    }

    if (name === 'ln') {
        if (value <= 0) throw new Error('Math domain error');
        return Math.log(value);
    }

    if (name === '√') {
        if (value < 0) throw new Error('Math domain error');
        return Math.sqrt(value);
    }

    throw new Error('Unknown function');
}

function evaluateExpression(exp) {
    const tokens = tokenize(exp);
    if (tokens.length === 0) throw new Error('Empty expression');

    const values = [];
    const operators = [];

    function applyTopOperator() {
        const operator = operators.pop();

        if (isFunctionToken(operator)) {
            const operand = values.pop();
            if (operand === undefined) {
                throw new Error('Invalid expression');
            }
            values.push(applyScientificFunction(operator, operand));
            return;
        }

        const right = values.pop();
        const left = values.pop();

        if (left === undefined || right === undefined) {
            throw new Error('Invalid expression');
        }

        values.push(applyOperator(left, right, operator));
    }

    tokens.forEach((token) => {
        if (!isNaN(token)) {
            values.push(Number(token));
            return;
        }

        if (isConstantToken(token)) {
            values.push(token === 'π' ? Math.PI : Math.E);
            return;
        }

        if (isAnsToken(token)) {
            if (lastAnswer === null) {
                throw new Error('No previous answer');
            }
            values.push(lastAnswer);
            return;
        }

        if (isFunctionToken(token)) {
            operators.push(token);
            return;
        }

        if (token === '(') {
            operators.push(token);
            return;
        }

        if (token === ')') {
            while (operators.length > 0 && operators[operators.length - 1] !== '(') {
                applyTopOperator();
            }

            if (operators.length === 0 || operators[operators.length - 1] !== '(') {
                throw new Error('Invalid expression');
            }

            operators.pop();

            if (operators.length > 0 && isFunctionToken(operators[operators.length - 1])) {
                applyTopOperator();
            }
            return;
        }

        while (
            operators.length > 0 &&
            operators[operators.length - 1] !== '(' &&
            (
                isFunctionToken(operators[operators.length - 1]) ||
                precedence(operators[operators.length - 1]) > precedence(token) ||
                (
                    precedence(operators[operators.length - 1]) === precedence(token) &&
                    !isRightAssociative(token)
                )
            )
        ) {
            applyTopOperator();
        }

        operators.push(token);
    });

    while (operators.length > 0) {
        if (operators[operators.length - 1] === '(' || operators[operators.length - 1] === ')') {
            throw new Error('Invalid expression');
        }
        applyTopOperator();
    }

    if (values.length !== 1 || Number.isNaN(values[0]) || !Number.isFinite(values[0])) {
        throw new Error('Invalid expression');
    }

    return values[0];
}

function appendValue(value) {
    if (isErrorState) {
        if ((value >= '0' && value <= '9') || value === '.' || value === '(' || isFunctionToken(value) || isConstantToken(value) || isAnsToken(value)) {
            expression = '';
            isErrorState = false;
        } else {
            return;
        }
    }

    const lastChar = expression[expression.length - 1];

    if (value === 'DEG' || value === 'RAD') {
        toggleAngleMode();
        return;
    }

    if (isFunctionToken(value)) {
        if (!expression || isOperator(lastChar) || lastChar === '(') {
            expression += `${value}(`;
            renderDisplay();
            return;
        }

        if (isValueBoundaryChar(lastChar)) {
            expression += `*${value}(`;
            renderDisplay();
        }
        return;
    }

    if (isConstantToken(value)) {
        if (!expression || isOperator(lastChar) || lastChar === '(') {
            expression += value;
            renderDisplay();
            return;
        }

        if (isValueBoundaryChar(lastChar) || endsWithAnsToken(expression)) {
            expression += `*${value}`;
            renderDisplay();
        }
        return;
    }

    if (isAnsToken(value)) {
        if (lastAnswer === null) {
            announceStatus('No previous answer');
            return;
        }

        if (!expression || isOperator(lastChar) || lastChar === '(') {
            expression += 'Ans';
            renderDisplay();
            return;
        }

        if (isValueBoundaryChar(lastChar) || endsWithAnsToken(expression)) {
            expression += '*Ans';
            renderDisplay();
        }
        return;
    }

    if (value === '(') {
        if (!expression || isOperator(lastChar) || lastChar === '(') {
            expression += '(';
            renderDisplay();
            return;
        }

        if ((lastChar >= '0' && lastChar <= '9') || lastChar === '.' || lastChar === ')') {
            expression += '*(';
            renderDisplay();
        }
        return;
    }

    if (value === ')') {
        if (!expression || isOperator(lastChar) || lastChar === '(') {
            return;
        }

        if (countUnclosedParentheses(expression) > 0) {
            expression += ')';
            renderDisplay();
        }
        return;
    }

    if (isOperator(value)) {
        if (!expression) {
            if (value === '-') {
                expression = '-';
                renderDisplay();
            }
            return;
        }

        if (lastChar === '(' && value !== '-') {
            return;
        }

        if (isOperator(lastChar)) {
            expression = expression.slice(0, -1) + value;
        } else {
            expression += value;
        }

        renderDisplay();
        return;
    }

    if (value === '.') {
        const parts = expression.split(/[+\-*/%^()]/);
        const currentNumber = parts[parts.length - 1];
        if (currentNumber.includes('.')) {
            return;
        }

        if (expression === '' || isOperator(lastChar) || lastChar === '(') {
            expression += '0.';
        } else if (lastChar === ')' || lastChar === 'π' || lastChar === 'e' || endsWithAnsToken(expression)) {
            expression += '*0.';
        } else {
            expression += '.';
        }
        renderDisplay();
        return;
    }

    if ((value >= '0' && value <= '9') || value === '00') {
        if (lastChar === ')' || lastChar === 'π' || lastChar === 'e' || endsWithAnsToken(expression)) {
            expression += `*${value}`;
            renderDisplay();
            return;
        }
    }

    expression += value;
    renderDisplay();
}

function calculateResult() {
    if (
        isErrorState ||
        expression === '' ||
        isOperator(expression[expression.length - 1]) ||
        countUnclosedParentheses(expression) !== 0
    ) {
        return;
    }

    try {
        const evaluatedExpression = expression;
        const result = evaluateExpression(expression);
        const formattedResult = formatNumber(result);
        expression = formattedResult;
        isErrorState = false;
        errorType = '';
        lastAnswer = result;
        saveUiStateToStorage();
        renderDisplay();
        addHistoryEntry(evaluatedExpression, formattedResult);
        announceStatus(`Result is ${expression}`);
    } catch (error) {
        let specificError = 'Math Error';
        if (error.message.includes('Division by zero')) {
            specificError = 'Division Error';
        } else if (error.message.includes('domain error')) {
            specificError = 'Math Error';
        } else if (error.message.includes('Invalid expression') || error.message.includes('Syntax')) {
            specificError = 'Syntax Error';
        } else if (error.message.includes('No previous answer')) {
            specificError = 'No Ans';
        }
        expression = specificError;
        errorType = specificError;
        isErrorState = true;
        renderDisplay();
        announceStatus(`${specificError}: ${error.message}`);
    }
}

function handleInput(value) {
    if (value === 'AC') {
        clearAll(true);
        return;
    }

    if (value === 'DEL') {
        deleteLast();
        return;
    }

    if (value === '=') {
        calculateResult();
        return;
    }

    if (isMemoryCommand(value)) {
        handleMemoryCommand(value);
        return;
    }

    if (value === 'DEG' || value === 'RAD') {
        toggleAngleMode();
        return;
    }

    if (value === 'Ans') {
        appendValue('Ans');
        return;
    }

    appendValue(value);
}

buttons.forEach((button) => {
    button.addEventListener('click', (event) => {
        // Skip special buttons that have their own handlers
        if (button === modeSwitchButton || button === helpButton || button === closeHelpButton || 
            button === clearHistoryButton || button === resetAppButton) {
            return;
        }
        handleInput(event.target.textContent.trim());
    });
});

if (historyList) {
    historyList.addEventListener('click', (event) => {
        const historyItem = event.target.closest('.history-item');
        if (!historyItem) {
            return;
        }
        loadExpressionFromHistory(historyItem.dataset.expression);
    });

    historyList.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }

        const historyItem = event.target.closest('.history-item');
        if (!historyItem) {
            return;
        }

        event.preventDefault();
        loadExpressionFromHistory(historyItem.dataset.expression);

        if (event.key === 'Enter' && event.shiftKey) {
            calculateResult();
        }
    });

    historyList.addEventListener('dblclick', (event) => {
        const historyItem = event.target.closest('.history-item');
        if (!historyItem) {
            return;
        }

        loadExpressionFromHistory(historyItem.dataset.expression);
        calculateResult();
    });
}

if (clearHistoryButton) {
    clearHistoryButton.addEventListener('click', () => {
        clearHistory();
    });
}

if (resetAppButton) {
    resetAppButton.addEventListener('click', () => {
        const shouldReset = window.confirm('Reset app? This will clear display, mode, answer, history, and saved data.');
        if (!shouldReset) {
            announceStatus('Reset cancelled');
            return;
        }
        resetAppState();
    });
}

if (historySearchInput) {
    historySearchInput.addEventListener('input', (event) => {
        historyFilterQuery = event.target.value;
        renderHistory();
    });
}

document.addEventListener('keydown', (event) => {
    const { key } = event;
    const normalizedKey = key.toLowerCase();

    if (historySearchInput && event.target === historySearchInput) {
        return;
    }

    if ((key >= '0' && key <= '9') || key === '00') {
        handleInput(key);
        return;
    }

    if (key === '+' || key === '-' || key === '*' || key === '/' || key === '%' || key === '^') {
        handleInput(key);
        return;
    }

    if (key === '(' || key === ')') {
        handleInput(key);
        return;
    }

    if (key === '.') {
        handleInput('.');
        return;
    }

    if (key === 'Enter' || key === '=') {
        event.preventDefault();
        handleInput('=');
        return;
    }

    if (key === 'Backspace') {
        handleInput('DEL');
        return;
    }

    if (key === 'Escape') {
        handleInput('AC');
        return;
    }

    if (normalizedKey === 's') {
        handleInput('sin');
        return;
    }

    if (normalizedKey === 'c') {
        handleInput('cos');
        return;
    }

    if (normalizedKey === 't') {
        handleInput('tan');
        return;
    }

    if (normalizedKey === 'l') {
        handleInput('log');
        return;
    }

    if (normalizedKey === 'n') {
        handleInput('ln');
        return;
    }

    if (normalizedKey === 'q') {
        handleInput('√');
        return;
    }

    if (normalizedKey === 'p') {
        handleInput('π');
        return;
    }

    if (normalizedKey === 'e') {
        handleInput('e');
        return;
    }

    if (normalizedKey === 'a') {
        handleInput('Ans');
        return;
    }

    if (normalizedKey === 'r') {
        toggleAngleMode();
        return;
    }

    if (normalizedKey === 'm') {
        handleInput('MR');
    }
});

// Mode toggle functionality
function toggleCalculatorMode() {
    isScientificMode = !isScientificMode;
    if (sciSection) {
        sciSection.classList.toggle('hidden', !isScientificMode);
    }
    if (modeSwitchButton) {
        modeSwitchButton.textContent = isScientificMode ? 'Scientific ▼' : 'Basic ▲';
        modeSwitchButton.setAttribute('aria-label', isScientificMode ? 'Switch to Basic mode' : 'Switch to Scientific mode');
    }
    announceStatus(isScientificMode ? 'Scientific mode' : 'Basic mode');
}

if (modeSwitchButton) {
    modeSwitchButton.addEventListener('click', toggleCalculatorMode);
}

// Help modal functionality
function openHelpModal() {
    if (helpModal) {
        helpModal.classList.add('show');
        helpModal.setAttribute('aria-hidden', 'false');
        closeHelpButton?.focus();
    }
}

function closeHelpModalFunc() {
    if (helpModal) {
        helpModal.classList.remove('show');
        helpModal.setAttribute('aria-hidden', 'true');
        helpButton?.focus();
    }
}

if (helpButton) {
    helpButton.addEventListener('click', openHelpModal);
}

if (closeHelpButton) {
    closeHelpButton.addEventListener('click', closeHelpModalFunc);
}

if (helpModal) {
    helpModal.addEventListener('click', (e) => {
        if (e.target === helpModal) {
            closeHelpModalFunc();
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && helpModal.classList.contains('show')) {
            closeHelpModalFunc();
        }
    });
}

loadHistoryFromStorage();
loadUiStateFromStorage();
renderAngleMode();
renderDisplay();
renderHistory();