const STYLE = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
};

export function getConsolePrefix(category, title) {
    return `${STYLE.cyan}[${category}]${STYLE.reset} ${STYLE.dim}${title}:${STYLE.reset}`;
}

export function getConsoleStats(actual, expected) {
    const color = expected === actual ? `${STYLE.green}${STYLE.dim}` : STYLE.yellow;
    return `${color}${actual}/${expected}${STYLE.reset}`;
}


