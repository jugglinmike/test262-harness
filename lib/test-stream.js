'use strict';

const Rx = require('rx');
const Test262Stream = require('test262-stream');
const minimatch = require('minimatch');

module.exports = function(test262Dir, includesDir, globPatterns) {
  const patterns = globPatterns.map((glob) => minimatch.makeRe(glob));
  const stream = new Test262Stream(test262Dir, {
    // TODO: deprecate this feature in both projects
    includesDir,
    // TODO: Make this configurable
    acceptVersion: '3.6.0'
  });
  const subject = new Rx.Subject();

  stream.on('data', (test) => {
    const matches = patterns.some((pattern) => pattern.test(test.file));
    if (matches) {
      subject.onNext(test);
    }
  });
  stream.on('error', (error) => subject.onError(error));
  stream.on('end', () => subject.onCompleted());

  return subject;
};
