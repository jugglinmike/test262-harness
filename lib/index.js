// Copyright (C) 2014, Microsoft Corporation. All rights reserved.
// This code is governed by the BSD License found in the LICENSE file.
'use strict';

const DEFAULT_TEST_TIMEOUT = 10000;

const compile = require('test262-compiler');
const fs = require('fs');
const Path = require('path');
const globber = require('./globber.js');
const Rx = require('rx');
const util = require('util');
const resultsEmitter = require('./resultsEmitter.js');
const thread = require('./thread');
const test262Finder = require('./findTest262.js');
const scenariosForTest = require('./scenarios.js');

const defaultStages = {
  filter() { return true; },
  map(test) { return test; },
  validate: require('./validator')
};

module.exports = function(test262Dir, { includesDir, prelude } = {}) {
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
  const threads = {
    pool: new Set(),
    waiting: new Rx.Subject()
  };
  threads.waiting.forEach(thread => threads.pool.add(thread));

  for (let idx = 0; idx < argv.threads; idx++) {
    Promise.resolve(thread.create())
      .then(thread => threadPool.onNext(thread));
  }

  const tests = paths.map(pathToTestFile)
    .map(file => compileFile(file, test262Dir, prelude, includesDir))
    .flatMap(scenariosForTest)
    .filter(stages.filter)
    .map(stages.map);

  return Rx.Observable.zip(threadPool, tests)
    .flatMap(([thread, test]) => {
      return thread.runTest(thread, test)
        // Preserve promise value
        .then(() => [thread, test]);
    })
    .tapOnComplete(() => {
      threads.pool.forEach(thread.destroy);
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
