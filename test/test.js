const tap = require('tap');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const binPath = path.join(__dirname, '..', 'bin', 'run.js');

const tests = [
  [['test/**/*.js'], { cwd: 'test/collateral-with-harness' }],
  [['--test262Dir', './test/collateral-with-harness', 'test/collateral-with-harness/test/**/*.js']],
  [['--test262Dir', './collateral-with-harness', 'collateral-with-harness/test/**/*.js'], { cwd: 'test' }],
  [['--includesDir', './test/test-includes', 'test/collateral/test/**/*.js']],
  [['test/collateral-with-harness/test/**/*.js']],
  [['--includesDir', './test-includes', 'collateral/test/**/*.js'], { cwd: 'test' }],
  [['collateral-with-harness/test/**/*.js'], { cwd: 'test' }],
  [['--includesDir', './test/test-includes', '--prelude', './test/fixtures/prelude.js', 'test/collateral/test/bothStrict.js'], { prelude: true }],
  [['--includesDir', './test/test-includes', '--reporter-keys', 'attrs,result', 'test/collateral/test/bothStrict.js'], { noRawResult: true }],
  [['--includesDir', './test/test-includes', '--reporter-keys', 'rawResult,attrs,result', 'test/collateral/test/bothStrict.js']],
  [['--includesDir', './test/test-includes', '--reporter-keys', 'attrs,rawResult,result', 'test/collateral/test/bothStrict.js']],
  [['--includesDir', './test/test-includes', '--reporter-keys', 'attrs,result,rawResult', 'test/collateral/test/bothStrict.js']],
  [['--includesDir', './test/test-includes', '--babelPresets', 'stage-3', '--reporter-keys', 'attrs,result,rawResult', 'test/babel-collateral/test/spread-sngl-obj-ident.js']]
];

Promise.all(tests.map(args => run(...args).then(validate)))
  .catch(reportRunError);

function reportRunError(error) {
  console.error('Error running tests');
  console.error(error.stack);
  process.exit(1);
}

function run(extraArgs, options) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let args = [
        '--hostType', 'node',
        '--hostPath', process.execPath,
        '-r', 'json',
      ].concat(extraArgs);
    let cwd = options && options.cwd;

    const child = cp.fork(binPath, args, { cwd, silent: true });

    child.stdout.on('data', (data) => { stdout += data });
    child.stderr.on('data', (data) => { stderr += data });
    child.on('exit', () => {
      if (stderr) {
        return reject(new Error(`Got stderr: ${stderr.toString()}`));
      }

      try {
        resolve({
          records: JSON.parse(stdout),
          options
        });
      } catch(e) {
        reject(e);
      }
    });
  });
}

function validate({ records, options = { prelude: false } }) {
  records.forEach(record => {

    const description = options.prelude ?
      `${record.attrs.description} with prelude` :
      record.attrs.description;

    tap.test(description, test => {

      if (typeof record.scenario !== 'undefined') {
        if (record.contents.startsWith('"use strict"')) {
          test.equal(record.scenario, 'strict mode');
        } else {
          test.equal(record.scenario, 'default');
        }
      }

      test.assert(record.attrs.expected, 'Test has an "expected" frontmatter');
      if (!record.attrs.expected) {
        // can't do anything else
        test.end();
        return;
      }

      test.equal(record.result.pass, record.attrs.expected.pass, 'Test passes or fails as expected');

      if (record.attrs.expected.message) {
        test.equal(record.result.message, record.attrs.expected.message, 'Test fails with appropriate message');
      }

      if (options.prelude) {
        test.assert(record.rawResult.stdout.indexOf('prelude!') > -1, 'Has prelude content');
      }

      if (options.noRawResult) {
        test.equal(record.rawResult, undefined);
      } else {
        test.equal(typeof record.rawResult, 'object');
      }

      test.end();
    });
  });
}

tap.test('unsupported version without `acceptVersion`', (test) => {
  run(['test/collateral-future-version/test/**/*.js'])
    .then(() => {
      test.fail('Expected command to fail, but it succeeded.');
    }, () => {})
    .then(test.done);
});

tap.test('unsupported version with matching `acceptVersion`', (test) => {
  run(['test/collateral-future-version/test/**/*.js',  '--acceptVersion', '99.0.0'])
    .catch(test.fail)
    .then(test.done);
});

tap.test('unsupported version with non-matching `acceptVersion`', (test) => {
  run(['test/collateral-future-version/test/**/*.js',  '--acceptVersion', '98.0.0'])
    .then(() => {
      test.fail('Expected command to fail, but it succeeded.');
    }, () => {})
    .then(test.done);
});
