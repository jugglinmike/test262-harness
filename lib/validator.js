module.exports = function validate(test) {
  if (test.status === 'timeout') {
    return {
      pass: false,
      message: 'Test timed out',
    };
  }
  const error = test.rawResult.error;
  const isNegative = test.attrs.flags.negative || test.attrs.negative;
  const ranToFinish = test.rawResult.stdout.indexOf('test262/done') > -1;
  const desc = (test.attrs.description || '').trim();

  if (!isNegative) {
    if (error !== null) {
      if (error.name === 'Test262Error') {
        return {
          pass: false,
          message: error.message,
        };
      } else {
        return {
          pass: false,
          message: `Expected no error, got ${error.name}: ${error.message}`,
        };
      }
    } else if (!ranToFinish && !test.attrs.flags.raw) {
      return {
        pass: false,
        message: `Test did not run to completion`,
      };
    } else {
      return { pass: true };
    }
  } else {
    if (test.attrs.flags.negative) {
      if (error) {
        return { pass: true };
      } else {
        return {
          pass: false,
          message: `Expected test to throw some error`,
        };
      }
    } else {
      if (!error) {
        return {
          pass: false,
          message: `Expected test to throw error of type ${test.attrs.negative.type}, but did not throw error`,
        };
      } else if (error.name == test.attrs.negative.type) {
        return { pass: true };
      } else {
        return {
          pass: false,
          message: `Expected test to throw error of type ${test.attrs.negative.type}, got ${error.name}: ${error.message}`,
        };
      }
    }
  }
};
