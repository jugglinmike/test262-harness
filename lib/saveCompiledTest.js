'use strict';

const fs = require('fs');
const path = require('path');

module.exports = function saveCompiledTest(test, options) {
  let outcome = test.result.pass ? 'pass' : 'fail';
  let savedTestPath = path.normalize(
    path.join(
      options.test262Dir,
      `${test.file}.${options.hostType}.${outcome}`
    )
  );
  fs.writeFileSync(savedTestPath, test.compiled);
  return savedTestPath;
}
