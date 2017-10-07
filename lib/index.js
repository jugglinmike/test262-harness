// Copyright (C) 2014, Microsoft Corporation. All rights reserved.
// This code is governed by the BSD License found in the LICENSE file.
'use strict';

const DEFAULT_TEST_TIMEOUT = 10000;

const compile = require('test262-compiler');
const fs = require('fs');
const path = require('path');
const Rx = require('rx');
const util = require('util');
const resultsEmitter = require('./resultsEmitter.js');
const test262Finder = require('./findTest262.js');
const scenariosForTest = require('./scenarios.js');
const findFiles = require('./find-files');

const defaultStages = {
  filter() { return true; },
  transform(test) { return test; },
  validate: require('./validator'),
  child: require('./child')
};

module.exports = function(test262Dir, { child, hostArguments, hostPath, hostType, includesDir, paths, prelude, threadCount, timeout, transform, validate } = {}) {
  if (hostType) {
    hostType = hostType;

    if (!hostPath) {
      console.error('Missing host path. Pass --hostPath with a path to the host executable you want to test.');
      process.exitCode = 1;
      return;
    }

    hostPath = hostPath;
  } else {
    hostType = 'node';

    if (hostPath) {
      hostPath = hostPath;
    } else {
      hostPath = process.execPath;
    }
  }

  const stages = Object.assign({}, defaultStages);
  timeout = timeout || DEFAULT_TEST_TIMEOUT;
  if (child) {
    stages.child = child;
  }
  if (validate) {
    stage.validate = validate;
  }

  if (!threadCount) {
    threadCount = 1;
  }

  // Test Pipeline

  if (!includesDir && !test262Dir) {
    test262Dir = test262Finder(paths.fileEvents[0]);
  }
  const threads = {
    pool: new Set(),
    waiting: new Rx.Subject()
  };
  threads.waiting.forEach(thread => threads.pool.add(thread));

  for (let idx = 0; idx < threadCount; idx++) {
    Promise.resolve(stages.child.create(hostType, hostArguments, hostPath, transform))
      .then(thread => threads.waiting.onNext(thread));
  }

  const tests = paths
    .map(relativePath => findFiles(path.join(test262Dir, relativePath)))
    .reduce((accumulator, moreFiles) => accumulator.merge(moreFiles))
    .map(absolutePath => pathToTestFile(absolutePath, test262Dir))
    .map(file => compileFile(file, test262Dir, prelude, includesDir))
    .flatMap(scenariosForTest)
    .filter(stages.filter)
    .map(stages.transform);

  return Rx.Observable.zip(threads.waiting, tests)
    .flatMap(([thread, test]) => {
      let timeoutId;
      test.status = null;

      const stopPromise = new Promise(resolve => {
          timeoutId = setTimeout(resolve, timeout);
        })
        .then(() => {
          test.status = 'timeout';
          stages.child.stop(thread);
        });
      const runPromise = stages.child.runTest(thread, test)
        .then(() => {
          test.status = 'complete';
          clearTimeout(timeoutId);
        });

      return Promise.race([stopPromise, runPromise]) 
        // Preserve promise value
        .then(() => [thread, test]);
    })
    .tapOnCompleted(() => {
      threads.pool.forEach(stages.child.destroy);
    })
    .map(([thread, test]) => {
      // Recycle thread
      threads.waiting.onNext(thread);
      test.result = stages.validate(test);
      return test;
    });
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
