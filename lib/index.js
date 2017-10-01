// Copyright (C) 2014, Microsoft Corporation. All rights reserved.
// This code is governed by the BSD License found in the LICENSE file.
'use strict';

const DEFAULT_TEST_TIMEOUT = 10000;

const compile = require('test262-compiler');
const fs = require('fs');
const Path = require('path');
const globber = require('./globber.js');
const validator = require('./validator.js');
const Rx = require('rx');
const util = require('util');
const resultsEmitter = require('./resultsEmitter.js');
const agentPool = require('./agentPool.js');
const test262Finder = require('./findTest262.js');
const scenariosForTest = require('./scenarios.js');


module.exports = function(test262Dir, { includesDir, prelude } = {}) {
// test262 directory (used to locate includes unless overridden with includesDir)
let test262Dir = argv.test262Dir;
// where to load includes from (usually a subdirectory of test262dir)
let includesDir = argv.includesDir;

// Select hostType and hostPath. hostType defaults to 'node'.
// If using default hostType, hostPath defaults to the current node executable location.
let hostType;
let hostPath;

if (argv.hostType) {
  hostType = argv.hostType;

  if (!argv.hostPath) {
    console.error('Missing host path. Pass --hostPath with a path to the host executable you want to test.');
    process.exitCode = 1;
    return;
  }

  hostPath = argv.hostPath;
} else {
  hostType = 'node';

  if (argv.hostPath) {
    hostPath = argv.hostPath;
  } else {
    hostPath = process.execPath;
  }
}

argv.timeout = argv.timeout || DEFAULT_TEST_TIMEOUT;

const stages = Object.assign({}, defaultStages, stages);

// Test Pipeline

const paths = globber(argv._);
if (!includesDir && !test262Dir) {
  test262Dir = test262Finder(paths.fileEvents[0]);
}
const files = ;
const tests = paths.map(pathToTestFile)
  .map(file => compileFile(file, test262Dir, prelude, includesDir))
  .flatMap(scenariosForTest)
  .filter(stages.filter)
  .map(stages.map)
  .map(stages.execute);
const results = rawResults.map(test => {
  test.result = validator(test);
  return test;
});
const resultEmitter = resultsEmitter(results);
reporter(resultEmitter, reporterOpts);

}

const defaultStages = {
  filter() { return true; },
  map(test) { return test; },
  execute() {
    const pool = agentPool(Number(argv.threads), hostType, argv.hostArgs, hostPath,
                       { timeout: argv.timeout });
    return function(scenario) {
      return pool.toPromise()
        .then(agent => {
          return pool.runTest([agent, scenario]);
        })
        .then(test => {
          test.result = validator(test);
          return test;
        });
        // ???
        //.tapOnCompleted(() => pool.destroy());
    }
  }
};

function pathToTestFile(absolutePath, test262Dir) {
  const relativePath = path.relative(test262Dir, absolutePath);
  const contents = fs.readFileSync(absolutePath, 'utf-8');
  return { file: relativePath, contents };
}

function compileFile(test, test262Dir, prelude, includesDir) {
  const endFrontmatterRe = /---\*\/\r?\n/g;
  const match = endFrontmatterRe.exec(test.contents);
  if (match) {
    test.contents = test.contents.slice(0, endFrontmatterRe.lastIndex)
                    + prelude
                    + test.contents.slice(endFrontmatterRe.lastIndex);
  } else {
    test.contents = prelude + test.contents;
  }
  return compile(test, { test262Dir, includesDir });
}

function findFiles(targetPath, includeHidden) {
  const files = new Rx.Subject();

  fs.exists(targetPath, (exists) => {
    if (!exists) {
      files.onError(new Error(`Path does not exist: "${targetPath}"`));
      files.onCompleted();
      return;
    }

    fs.stat(targetPath, (err, stat) => {
      if (err) {
        files.onError(err);
        files.onCompleted();
        return;
      }

      if (stat.isFile()) {
        if (!fixturePattern.test(targetPath) &&
          (includeHidden || path.basename(targetPath)[0] !== '.')) {
          files.onNext(Rx.Observable.just(targetPath));
        }

        files.onCompleted();
        return;
      }

      fs.readdir(targetPath, (err, contents) => {
        if (err) {
          files.onError(err);
          files.onCompleted();
          return;
        }

        contents.forEach(childPath =>
          files.onNext(findFiles(path.join(targetPath, childPath)))
        );

        files.onCompleted();
      });
    });
  });
  return files.mergeAll();
}
