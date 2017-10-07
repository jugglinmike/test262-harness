'use strict';

const path = require('path');

const harness = require('.');
const test262Dir = path.join(__dirname, '..', 'test262');

function polyfill() {
  // TODO: Update the Node.js "host" in `eshost` to inject `require` function
  // to fully support this use case. See
  // https://github.com/bterlson/test262-harness/issues/45
  // TODO: Figure out why timeout out tests eventually cause the test runner
  // itself to hang
  const myCode = `function isNaN(value) {
	if (Math.random() > 0.9) { while(true) {} }
    return Number(value) !== Number(value);
  }`;
  const stream = harness(test262Dir, {
    paths: ['test/built-ins/isNaN'],
    prelude: myCode,
	timeout: 1000
  });

  stream.forEach(test => {
    console.log(test.result);
  });
}

function cli(argv) {
  const resultsEmitter = require('../lib/resultsEmitter.js');
  // defaults to 'simple'
  let reporter;
  let reporterOpts = {};
  if (fs.existsSync(Path.join(__dirname, '../lib/reporters', `${argv.reporter}.js`))) {
    reporter = require(`../lib/reporters/${argv.reporter}.js`);
  } else {
    console.error(`Reporter ${argv.reporter} not found.`);
    process.exitCode = 1;
    return;
  }

  const stream = harness(argv.test262Dir, {
    paths: argv._,
    prelude: argv.prelude,
    execute: require('../lib/execute'),
    validate: require('../lib/validate')
  });
  const resultEmitter = resultsEmitter(stream);
  reporter(resultEmitter, reporterOpts);
}

function parser() {
  const jshint = require('jshint').JSHINT;
  const stream = harness(test262Dir, {
    execute: test => {
      jshint(test.contents);
      test.results = jshint.data();
      return test;
    },
    validate: result => {

    }
  });
}

function transpiler() {

}

function runtime() {
  const stream = harness(test262Dir, {
    child: {
      create() {},
      runTest(child, test) {},
      destroy() {}
    }
  });
}

polyfill();
