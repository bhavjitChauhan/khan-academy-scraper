#!/usr/bin/env node

const https = require('https'),
    fs = require('fs'),
    readline = require('readline'),
    clui = require('clui'),
    chalk = require('chalk'),
    winston = require('winston');

let startTime = new Date();

readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdin.on('keypress', (str, key) => {
    if (key.ctrl && key.name === 'c' && !exiting) handleExit();
});

const argv = require('yargs')
    .command('$0', 'Scrape Khan Academy programs.', () => { }, (argv) => { })
    .option('max', {
        alias: 'm',
        describe: 'Maximum number of programs scraped',
        type: 'number'
    })
    .option('limit', {
        alias: 'l',
        default: 1000,
        describe: 'Number of programs to fetch per API request',
        type: 'number'
    })
    .option('cursor', {
        alias: 'c',
        describe: 'Specify starting API cursor',
        type: 'string'
    })
    .option('sort', {
        alias: 's',
        default: 'top',
        describe: 'Program list to scrape',
        choices: ['recent', 'hot', 'contests', 'top']
    })
    .option('output', {
        alias: 'o',
        default: 'programs',
        describe: 'File name to store programs in',
        type: 'string'
    })
    .option('overwrite', {
        alias: 'w',
        default: false,
        describe: 'Overwrite any previous output file',
        type: 'boolean'
    })
    .option('verbose', {
        alias: 'v',
        default: false,
        describe: 'Run in verbose mode',
        type: 'boolean'
    })
    .option('silent', {
        default: false,
        describe: 'Supress logging to file',
        type: 'boolean'
    })
    .check((argv) => {
        if (argv.limit > argv.max) {
            logger.warn(`Limit given (${argv.limit}) is greater tham maximum program limit (${argv.max})`);
            return 'Limit must be equal to or less than maximum.'
        }
        return true;
    }, global = true)
    .help('h')
    .alias('h', 'help')
    .argv;

let transport;
if (argv.silent) {
    transport = new winston.transports.Console({ silent: true });
} else {
    transport = new winston.transports.File({ filename: 'log.log' });
}
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.simple(),
    transports: [transport]
});
logger.info(`Initialized logger: ${startTime}`);


let verbose = argv.verbose;
verbose && logger.info(`In verbose mode`);

for (arg in argv) {
    logger.info(`Argument '${arg}': '${argv[arg]}'`)
}

const omit = (object, keys) =>
    Object.fromEntries(
        Object.entries(object)
            .filter(([key]) => !keys.includes(key))
    )

let URL = 'https://www.khanacademy.org/api/internal/scratchpads/top?';

let sortOptions = ['recent', 'hot', 'contest', 'top'];
let sort = sortOptions.indexOf(argv.sort) + 2;

let limit = argv.limit;
let params = {
    'sort': sort,
    'limit': limit,
    'topic_id': 'xffde7c31'
};

for (param in params) {
    URL += `${param}=${params[param]}&`;
    logger.info(`URL parameter '${param}': '${params[param]}'`);
}
URL = URL.slice(0, -1);

let exiting = false;
let max = argv.max || Infinity;
let lastCursor = '';
let numberOfPrograms = 0;

var file = argv.output + '.json';
fs.readFile(file, (error, data) => {
    if (error) {
        logger.info('No previous programs file found.');
        logger.info(`Initial URL: ${URL}`);
        verbose && console.debug(`Initial URL: ${chalk.gray(URL)}`);
        scrape();
    } else {
        logger.info(`Found previous programs file: ${file}`);
        if (argv.overwrite) {
            logger.info('Overwriting previous file');
            console.log('Overwriting previous file');
            fs.writeFile(file, '[{}', error => {
                if (error) {
                    logger.error(`Error writing to file ${file}: ${error}`);
                    console.error(chalk.red(`Error writing to file ${file}: ${error}`));
                }
            });
            logger.info(`Initial URL: ${URL}`);
            verbose && console.debug(`Initial URL: ${chalk.gray(URL)}`);
            scrape();
        } else {
            try {
                data = JSON.parse(data);
                lastCursor = data[data.length - 1].cursor;
                if (!lastCursor) {
                    logger.error('No previous cursor found')
                    console.error(chalk.red('No previous cursor found'));
                    throw error;
                }
                logger.info(`Using previous stored API cursor: '${lastCursor}'`);
                process.stdout.write(`File ${file} already exists. Using stored API cursor`);
                process.stdout.write(verbose ? `: ${chalk.gray(lastCursor)}\n` : '\n');
                data.pop();
                fs.writeFile(file, '[' + JSON.stringify(data).slice(1, -1), error => {
                    if (error) {
                        logger.error(`Error writing to file ${file}: ${error}`);
                        console.error(chalk.red(`Error writing to file ${file}: ${error}`));
                    }
                });
                logger.info(`Initial URL: ${URL}`);
                verbose && console.debug(`Initial URL: ${chalk.gray(URL + '&cursor=' + lastCursor)}`);
                scrape(lastCursor);
            } catch (error) {
                logger.error(`Unable to read previous file: ${error}`);
                console.error(chalk.red(`Unable to read previous file: ${error}`));
                console.error('Use the `--overwrite` flag to overwrite previous file');
                process.exit();
            }
        }
    }
});

if (max != Infinity) {
    logger.info('Maximum program limit set')
    const Progress = clui.Progress;
    var progressBar = new Progress(20);
    process.stdout.write(progressBar.update(0, max) + '\r')
} else {
    logger.info('No maximum program limit set')
    const Spinner = clui.Spinner;
    var spinner = new Spinner('Started scraping... ');
    spinner.start();
}

function scrape(cursor) {
    logger.info(`New request. Using API cursor: '${cursor}'`);
    cursor = cursor && `&cursor=${cursor}` || '';
    https.get(URL + cursor, response => {
        let data = '';
        response.on('data', chunk => {
            data += chunk;
            logger.http(`Recieved chunk: '${chunk}'`);
        })
        response.on('end', () => {
            logger.http(`Recieved all chunks: '${data}'`);
            data = JSON.parse(data);
            lastCursor = data.cursor;
            if (numberOfPrograms + limit * 2 <= max) {
                max != Infinity && logger.info('Maximum program limit not reached. Sending new request');
                setTimeout(scrape, 0, lastCursor);
            }
            for (scratchpad of data.scratchpads) {
                try {
                    scratchpad.thumb = scratchpad.thumb.split('/')[4].slice(0, -4);
                } catch (error) {
                    logger.http(`Invalid program thumbnail: '${scratchpad.thumb}'`)
                }
                try {
                    scratchpad.url = scratchpad.url.split('/')[5];
                } catch (error) {
                    logger.http(`Invalid program URL: '${scratchpad.URL}'`)
                }
                try {
                    scratchpad.created = new Date(scratchpad.created);
                } catch (error) {
                    logger.http(`Invalid program creation date: '${scratchpad.created}'`)
                }
                try {
                    scratchpad.authorKaid = scratchpad.authorKaid.split('_')[1];
                } catch (error) {
                    logger.http(`Invalid program author: '${scratchpad.authorKaid}'`)
                }
                if (!exiting) {
                    fs.appendFile(file, ',' + JSON.stringify(omit(scratchpad, ['flaggedByUser', 'key', 'translatedTitle'])), error => {
                        if (error) {
                            logger.error(`Error appending program to file: ${error}`);
                            console.error(chalk.red(`Error appending program to file: ${error}`));
                        }
                    });
                }
                numberOfPrograms++;
                if (max != Infinity) {
                    process.stdout.write(progressBar.update(numberOfPrograms, max) + '\r');
                } else {
                    spinner.message(`${numberOfPrograms} programs scraped... `);
                }
            }
            if (numberOfPrograms + limit > max) {
                handleExit();
            }
        })
    }).on('error', error => {
        logger.error(`Error requesting API: ${error}`);
        console.error(chalk.red(`Error requesting API: ${error}`));
    })
}
function handleExit() {
    let time = new Date() - startTime;
    exiting = true;
    let cursorObject = {
        cursor: lastCursor
    };
    spinner.stop();
    process.stdout.write(chalk.gray('Safely exiting...\r'));
    setTimeout(() => {
        fs.appendFile(file, (lastCursor != '' ? ',' + JSON.stringify(cursorObject) : '') + ']', error => {
            if (error) {
                logger.error(`Error appending program to file: ${error}`);
                console.error(chalk.red(`Error appending program to file: ${error}`));
            }
            logger.info(`Completed scraping ${numberOfPrograms + limit} programs in ${time}ms`);
            (lastCursor && verbose) && console.log(`\rLast API cursor: ${chalk.gray(lastCursor)}`);
            process.stdout.write(`\rCompleted scraping ${chalk.cyan(numberOfPrograms)} programs in ${chalk.cyan(time + 'ms')}.\n`);
            process.exit();
        });
    }, 1000);
}
