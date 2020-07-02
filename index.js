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
    if (key.ctrl && key.name === 'c') handleExit();
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

const logger = winston.createLogger({
    level: argv.verbose ? 'http' : 'warn',
    format: winston.format.simple(),
    transports: [
        new winston.transports.File({ filename: 'log.log' })
    ]
});
logger.info(`Initialized logger: ${startTime}`);

for (arg in argv) {
    logger.info(`Argument '${arg}': '${argv[arg]}'`)
}

const omit = (object, keys) =>
    Object.fromEntries(
        Object.entries(object)
            .filter(([key]) => !keys.includes(key))
    )

let verbose = argv.verbose;
verbose && logger.info(`In verbose mode`);

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

logger.info(`Initial URL: ${URL}`)
verbose && console.debug(`Initial URL: ${chalk.gray(URL)}`);

let max = argv.max || Infinity;
let lastCursor = '';
let previousPrograms;
let programs = [];

var file = argv.output + '.json';
fs.readFile(file, (error, data) => {
    if (error) {
        logger.info('No previous programs file found.')
        scrape()
    } else {
        logger.info(`Found previous programs file: ${file}`)
        if (argv.overwrite) {
            logger.info('Overwriting previous file');
            console.log('Overwriting previous file');
            scrape();
        } else {
            try {
                data = JSON.parse(data);
                lastCursor = data[data.length - 1].cursor;
                logger.info(`Using previous stored API cursor: ${lastCursor}`);
                process.stdout.write(`File ${file} already exists. Using stored API cursor`);
                process.stdout.write(verbose ? `: ${chalk.gray(lastCursor)}\n` : '\n');
                data.pop();
                previousPrograms = data;
                scrape(lastCursor);
            } catch (error) {
                logger.info(`Unable to read previous file. Starting with blank cursor`);
                scrape();
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
    var spinner = new Spinner('Starting scraping...', ['◜', '◠', '◝', '◞', '◡', '◟']);
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
            if (programs.length + limit * 2 <= max) {
                max != Infinity && logger.info('Maximum program limit not reached. Sending new request');
                lastCursor = data.cursor;
                setTimeout(scrape, 0, data.cursor);
            }
            for (scratchpad of data.scratchpads) {
                try {
                    scratchpad.thumb = scratchpad.thumb.split('/')[4].slice(0, -4);
                } catch (error) {
                    logger.error(`Invalid program thumbnail: '${scratchpad.thumb}'`)
                    console.error(`${chalk.red('Invalid program thumbnail:')}: '${chalk.gray(scratchpad.thumb)}'`);
                }
                try {
                    scratchpad.url = scratchpad.url.split('/')[5];
                } catch (error) {
                    logger.error(`Invalid program URL: '${scratchpad.URL}'`)
                    console.error(`${chalk.red('Invalid program URL:')}: '${chalk.gray(scratchpad.URL)}'`);
                }
                try {
                    scratchpad.created = new Date(scratchpad.created);
                } catch (error) {
                    logger.error(`Invalid program creation date: '${scratchpad.created}'`)
                    console.error(`${chalk.red('Invalid program creation date:')}: '${chalk.gray(scratchpad.created)}'`);
                }
                try {
                    scratchpad.authorKaid = scratchpad.authorKaid.split('_')[1];
                } catch (error) {
                    logger.error(`Invalid program author: '${scratchpad.authorKaid}'`)
                    console.error(`${chalk.red('Invalid program author:')}: '${chalk.gray(scratchpad.authorKaid)}'`);
                }

                programs.push(omit(scratchpad, ['flaggedByUser', 'key', 'translatedTitle']));
            }
            updateOutputFile();
            if (programs.length + limit > max) {
                handleExit();
            }
            if (max != Infinity) {
                process.stdout.write(progressBar.update(programs.length, max) + '\r');
            } else {
                spinner.message(`${programs.length} programs scraped...`);
            }
        })
    }).on('error', error => {
        logger.error(`Error requesting API: ${error}`);
        console.error(chalk.red(`Error requesting API: ${error}`));
    })
}
function updateOutputFile(final) {
    if (programs == '') {
        logger.warn('Attempted to write empty programs array to file');
    };
    if (final && lastCursor != '') {
        programs.push({ cursor: lastCursor })
    }
    if (typeof previousPrograms == 'object') {
        allPrograms = previousPrograms.concat(programs);
    } else {
        allPrograms = programs;
    }
    fs.writeFile(file, JSON.stringify(allPrograms), function (error) {
        if (error) {
            logger.error(`Error writing to file: ${error}`);
            return console.error(chalk.red(`Error writing to file\n${error}`));
        }
        final && process.exit();
    });
}
function handleExit() {
    let time = new Date() - startTime;
    logger.info(`Completed scraping ${programs.length + limit} programs in ${time}ms`);
    (lastCursor && verbose) && console.log(`\rLast API cursor: ${chalk.gray(lastCursor.substr(8))}`);
    process.stdout.write(`\rCompleted scraping ${chalk.cyan(programs.length)} programs in ${chalk.cyan(time + 'ms')}.\n`);
    updateOutputFile(true);
}
