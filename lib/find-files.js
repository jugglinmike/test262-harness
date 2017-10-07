'use strict';
const fs = require('fs');
const path = require('path');

const Rx = require('rx');

const fixturePattern = /_FIXTURE\.[jJ][sS]$/;

module.exports = function findFiles(targetPath, includeHidden) {
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
};
