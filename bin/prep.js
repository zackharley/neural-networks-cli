#!/usr/bin/env node

// Native
const path = require('path');

// Packages
const mri = require('mri');
const fs = require('fs-extra');
const parse = require('csv-parse/lib/sync');
const stringify = require('csv-stringify/lib/sync');
const chalk = require('chalk');
const untildify = require('untildify');

const pipe = (...fns) => x => fns.reduce((y, f) => f(y), x);
const CURRENCY_DECIMAL_PLACES = 2;
const DATE_CELL = 'Date';
const NOT_APPLICABLE = '-';
const VALUE_CELLS = ['Open', 'High', 'Low', 'Close'];

async function main() {
    const args = mri(process.argv.slice(2), {
        boolean: ['help', 'json', 'csv'],
        alias: { help: 'h', json: 'j', csv: 'c' }
    });

    if (args.help || args.h) {
        help();
        return process.exit(0);
    }

    const csvFile = args._[0];
    if (!csvFile) {
        console.error(error('No data CSV supplied. Please supply a CSV!'));
        return process.exit(1);
    }
    const csvPath = getFilePath(csvFile);

    const DEFAULT_PARSER_OPTIONS = {
        rowDelimiter: '\n'
    };
    const csv = parse(((await fs.readFile(csvPath)).toString()), DEFAULT_PARSER_OPTIONS);
    const headers = csv[0];
    const data = rowsToObjects(csv.slice(1), headers);
    await output(
        pipe(
            sortDataByDate.bind(null, DATE_CELL),
            prepareData
        )(data)
    );
}

function getFilePath(file) {
    if (isHomePath(file)) {
        return untildify(file)
    } else if (isAbsolutePath(file)) {
        return path.resolve(file);
    }
    return path.resolve(process.cwd(), file);
}

function isHomePath(file) {
    return !!file.match(/^~/);
}

function isAbsolutePath(file) {
    return !!file.match(/(^\.\/|^\.\.\/|\w)/);
}

function rowsToObjects(rows, headers) {
    return rows.map(row => (
        row.reduce((accum, elem, i) => (
            Object.assign(accum, { [headers[i]]: elem })
        ), {})
    ));
}

/**
 * This function receives an array of object, each of which has a date key. The array is then sorted in ascending
 * chronological order.
 * @param dateKey - The object key that the date is located at in the array's children
 * @param data - The data to sort
 * @returns {Array.<Object>} - The sorted array of objects
 */
function sortDataByDate(dateKey, data) {
    return data.sort((a, b) => new Date(a[dateKey]) - new Date(b[dateKey]));
}

function prepareData(data) {
    return pipe(
        percentagesChangeInVolume,
        percentagesChangeInPrices,
        ...movingAverages()
    )(data);
}

function numberToCurrencyValue(num) {
    return Number(num).toFixed(CURRENCY_DECIMAL_PLACES);
}

const movingAverage = multiplier => data => data.map((row, i) => {
    const epoch = 'days';
    const avgs = VALUE_CELLS.reduce((avgAccum, cell) => {
        const movingAverageCellName = `${cell} Moving Average - ${multiplier} ${epoch}`;
        if (i < multiplier - 1) {
            avgAccum[movingAverageCellName] = NOT_APPLICABLE;
        } else {
            const sum = data.slice(i + 1 - multiplier, i + 1).reduce((cellAccum, row) => {
                return cellAccum + Number(row[cell]);
            }, 0);
            const movingAverage = sum / multiplier;
            avgAccum[movingAverageCellName] = numberToCurrencyValue(movingAverage);
        }
        return avgAccum;
    }, {});

    return Object.assign(row, avgs);
});

const DEFAULT_MOVING_AVERAGES = [5, 50, 100, 200];

function movingAverages() {
    const args = mri(process.argv.slice(2), {
        string: ['moving-averages']
    });

    const movingAverageLengths = formatInputtedMovingAverages(args['moving-averages']) || DEFAULT_MOVING_AVERAGES;

    return movingAverageLengths.map(len => movingAverage(len));
}

function percentagesChangeInVolume(data) {
    const volumeKey = 'Volume';
    return data.map((row, i) => {
        let change;
        if ((i - 1 >= 0) && row[volumeKey] !== NOT_APPLICABLE && data[i - 1][volumeKey] !== NOT_APPLICABLE) {
            const oldVolume = Number.parseFloat(data[i - 1][volumeKey].replace(/,/g, ''));
            const newVolume = Number.parseFloat(row[volumeKey].replace(/,/g, ''));
            change = (newVolume - oldVolume) / oldVolume * 100;
        } else {
            change = '-';
        }
        return Object.assign(row, { ['Daily Change in Volume']: change });
    })
}

function percentagesChangeInPrices(data) {
    const priceKeys = ['Open', 'High', 'Low', 'Close'];
    return data.map((row, i) => Object.assign(
        row,
        priceKeys.reduce((accum, key) => {
            let change;
            if ((i - 1 > 0) && row[key] !== NOT_APPLICABLE && data[i - 1][key] !== NOT_APPLICABLE) {
                const oldValue = Number.parseFloat(data[i - 1][key].replace(/,/g, ''));
                const newValue = Number.parseFloat(row[key].replace(/,/g, ''));
                change = (newValue - oldValue) / oldValue * 100;
            } else {
                change = '-';
            }
            return Object.assign(accum, { [`${key} - Daily Percentage Change`]: change });
        }, {})
    ));
}

function formatInputtedMovingAverages(avgsString) {
    if (!avgsString) return null;
    return avgsString
        .split(',')
        .map(a => a.trim())
        .map(a => {
            if (isNaN(a)) {
                console.error(error('Supplied moving averages list contains something other than a number. Pleas supply only comma-separated numbers!'));
                return process.exit(1);
            }
            return Number(a);
        });
}

async function output(data) {
    const args = mri(process.argv.slice(2), {
        boolean: ['json', 'csv'],
        alias: { json: 'j', csv: 'c' }
    });

    if (hasMultipleOutputTypes(args)) {
        console.error(error('Multiple output types specified. Please only supply one output type!'));
        process.exit(1);
    }

    const outputFormat = ((args.json || args.j) && 'json') || 'csv';

    const filename = getOutputFilename(outputFormat);

    switch (outputFormat) {
        case 'json':
            await saveToFile(filename, convertToJson(data));
            break;
        default:
            await saveToFile(getFilePath(filename), convertToCsv(data));
            break;
    }
}

function getOutputFilename(extension) {
    const args = mri(process.argv.slice(2), {
        string: ['output'],
        alias: { output: 'o' }
    });

    const outputFile = args.output || args.o;
    if (outputFile) {
        if (outputFile.match(new RegExp(`\.${extension}$`))) {
            return getFilePath(outputFile);
        }
        return getFilePath(`${outputFile}.${extension}`);
    }

    const inputFilePath = getFilePath(args._[0]);
    const inputFilename = inputFilePath.split('/').pop().replace(/\.csv$/, '');
    return `${inputFilename}.normalized.${extension}`;
}

function convertToJson(data) {
    return JSON.stringify(data, null, 4);
}

function convertToCsv(data) {
    const headers = Object.keys(data[0]);
    const body = data.slice(1).map(row => Object.values(row));
    return stringify([headers, ...body]);

}

async function saveToFile(pathToFile, data) {
    try {
        await fs.writeFile(pathToFile, data);
        console.log(`\n${chalk.bold(chalk.green('Success!'))} File saved to ${pathToFile}`)
    } catch (e) {
        console.log(e);
        process.exit(1);
    }
}

function hasMultipleOutputTypes(args) {
    let count = 0;
    if (args.json || args.j) {
        count++;
    }
    if (args.csv || args.c) {
        count++;
    }
    return count > 1;
}

function help() {
    console.log(`
  ${chalk.white('normalize')} [options] <path | file>
  
    path | file             A path to a CSV or a CSV filename to load into the normalizer
    
  ${chalk.gray('Options:')}
      
    -h, --help                          Output usage information
    -c, --csv                           Output normalized data as a CSV ${chalk.bold(chalk.white('(default)'))}
    -j, --json                          Output normalized data as a JSON
    -o ${chalk.bold(chalk.underline(chalk.white('FILE')))}, -output=${chalk.bold(chalk.underline(chalk.white('FILE')))}               The filename for the normalized data. ${chalk.white(chalk.bold('NOTE:'))} The output type file extension will be appended to the supplied filename. ${chalk.white(chalk.bold(`(defaults to ${chalk.underline('<INPUT_FILE>.normalized.<EXTENSION>')})`))}
    --moving-averages=${chalk.bold(chalk.underline(chalk.white('AVG_1,...,AVG_N')))}   The moving averages to use. ${chalk.white(chalk.bold(`(defaults to ${chalk.underline('5,50,100,200')})`))}
    
  ${chalk.gray('Examples:')}
  
  - Normalize a CSV referenced by a relative path
  
    ${chalk.cyan('$ normalize my-data.csv')}
    
  - Normalize a CSV referenced by a relative path
  
    ${chalk.cyan('$ normalize /Users/Me/Documents/my-data.csv')}
    
  - Specify output to be JSON
  
    ${chalk.cyan('$ normalize --json my-data.csv')}
    
  - Specify an output path
  
    ${chalk.cyan('$ normalize -o my-normalized-data.csv my-data.csv')}
    
    ${chalk.gray('or')}
    
    ${chalk.cyan('$ normalize --output="/Users/Me/Documents/my-normalized-data.csv" my-data.csv')}
  
  - Specify custom moving averages
  
    ${chalk.cyan('$ normalize --moving-averages="2,3,4,5" my-data.csv')}
    `);
}

function error(message) {
    return `\n${chalk.red('> Error!')} ${message}`
}

function handleUnexpected(err) {
    console.error(error(`An unexpected error occurred!\n  ${err.stack}`));
    process.exit(1);
}

function handleRejection(err) {
    if (err) {
        if (err instanceof Error) {
            handleUnexpected(err);
        } else {
            console.error(error(`An unexpected rejection occurred\n  ${err}`));
        }
    } else {
        console.error(error('An unexpected empty rejection occurred'));
    }

    process.exit(1);
}

process.on('unhandledRejection', handleRejection);
process.on('uncaughtException', handleUnexpected);

main().catch(handleRejection);
