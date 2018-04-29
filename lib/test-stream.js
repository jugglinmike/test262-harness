'use strict';

const path = require('path');

const Rx = require('rx');
const Test262Stream = require('test262-stream');
const minimatch = require('minimatch');

function patternsToDirectories(patterns) {
  return patterns.map((pattern) => {
    const parts = [];

    pattern.split(path.sep).every((part) => {
      if (part.indexOf('*') > -1 || part.slice(-3).toLowerCase() === '.js') {
        return false;
      }

      parts.push(part);

      return true;
    });

    return parts.join(path.sep);
  }).filter((name) => name !== '');
}

module.exports = function(test262Dir, includesDir, acceptVersion, globPatterns) {
  const paths = patternsToDirectories(globPatterns);
  const stream = new Test262Stream(test262Dir, {
    includesDir, paths, acceptVersion
  });
  const subject = new Rx.Subject();

  stream.on('data', (test) => {
    if (!globPatterns.some((pattern) => minimatch(test.file, pattern))) {
      return;
    }

    subject.onNext(test);
  });
  stream.on('error', (error) => subject.onError(error));
  stream.on('end', () => subject.onCompleted());

  return subject;
};
