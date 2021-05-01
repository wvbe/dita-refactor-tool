import chalk from 'chalk';
const SILENT = process.env.NODE_ENV === 'test';
const CONNOTATIONS = {
	warn: {
		color: chalk.yellow,
		symbol: '! '
	},
	error: {
		color: chalk.red,
		symbol: '>> '
	},
	info: {
		color: chalk.gray,
		symbol: ''
	},
	success: {
		color: chalk.blue,
		symbol: ':D '
	}
};
type Message = string | number | boolean | null | undefined;

const FORMATTERS = {
	warn: makeCallbackForColor(CONNOTATIONS.warn),
	error: makeCallbackForColor(CONNOTATIONS.error),
	info: makeCallbackForColor(CONNOTATIONS.info),
	success: makeCallbackForColor(CONNOTATIONS.success)
};

function makeCallbackForColor(c: typeof CONNOTATIONS extends Record<any, infer U> ? U : unknown) {
	return (message: Message) => `${c.color(c.symbol)}${message}`;
}

export function warn(message: Message) {
	if (SILENT) {
		return;
	}
	console.log(FORMATTERS.warn(message));
}

export function info(message: Message) {
	if (SILENT) {
		return;
	}
	console.log(FORMATTERS.info(message));
}
export function error(message: Message) {
	if (SILENT) {
		return;
	}
	console.log(FORMATTERS.error(message));
}

export function success(message: Message) {
	if (SILENT) {
		return;
	}
	console.log(FORMATTERS.success(message));
}
export function prefix(prefix: Message, message: Message) {
	if (SILENT) {
		return;
	}
	console.log(`  ${chalk.blue(prefix)}  ${message}`);
}

export function group(connotation: keyof typeof FORMATTERS, message: Message) {
	const key = FORMATTERS[connotation](message);
	console.group(key);

	return () => console.groupEnd();
}

export function groupEnd() {
	console.groupEnd();
}
