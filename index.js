#!/usr/bin/env node

const https = require('https'),
    fs = require('fs'),
    clui = require('clui'),
    chalk = require('chalk');

var startTime = new Date();

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
        describe: 'File name to store programs in'
    })
    .option('verbose', {
        alias: 'v',
        default: false,
        describe: 'Run in verbose mode',
        type: 'boolean'
    })
    .check((argv) => {
        if (argv.limit > argv.max) {
            return 'Limit must be equal to or less than maximum.'
        }
        return true;
    }, global=true)
    .help('h')
    .alias('h', 'help')
    .argv;

const omit = (object, keys) =>
    Object.fromEntries(
        Object.entries(object)
            .filter(([key]) => !keys.includes(key))
    )

let verbose = argv.verbose;
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
}
URL = URL.slice(0, -1);

verbose && console.debug(`Initial URL: ${chalk.gray(URL)}`);

let programs = [];
let max = argv.max || Infinity;

function scrape(cursor) {
    cursor = cursor && `&cursor=${cursor}` || '';
    https.get(URL + cursor, response => {
        let data = '';
        response.on('data', chunk => {
            data += chunk;
        })
        response.on('end', () => {
            data = JSON.parse(data);
            if (programs.length + limit * 2 <= max) {
                setTimeout(scrape, 0, data.cursor);
            }
            for (scratchpad of data.scratchpads) {
                scratchpad.thumb = scratchpad.thumb.split('/')[4].slice(0, -4);
                scratchpad.url = scratchpad.url.split('/')[5];
                scratchpad.created = new Date(scratchpad.created);
                scratchpad.authorKaid = scratchpad.authorKaid.split('_')[1];

                programs.push(omit(scratchpad, ['flaggedByUser', 'key', 'translatedTitle']));
            }
            fs.writeFile(argv.output + '.json', JSON.stringify(programs), function (error) {
                if (error) return console.error(chalk.red(error));
            });
            if (programs.length + limit > max) {
                cursor && console.log(`Last API cursor: ${chalk.gray(cursor.substr(8))}`)
                process.stdout.write(`Completed scraping ${chalk.cyan(programs.length + limit)} programs in ${chalk.cyan(new Date() - startTime + 'ms')}.\n`);
            }
            if (max != Infinity) {
                process.stdout.write(progressBar.update(programs.length, max) + '\r');
            } else {
                spinner.message(`${programs.length} programs scraped...`);
            }
        })
    }).on('error', error => {
        console.error(chalk.red(`Error: ${error}`));
    })
}

scrape(argv.cursor);

if (max != Infinity) {
    const Progress = clui.Progress;
    var progressBar = new Progress(20);
    process.stdout.write(progressBar.update(0, max) + '\r')
} else {
    const Spinner = clui.Spinner;
    var spinner = new Spinner('Starting scraping...', ['◜', '◠', '◝', '◞', '◡', '◟']);
    spinner.start();
}
