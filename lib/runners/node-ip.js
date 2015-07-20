// Copyright (C) 2014, Microsoft Corporation. All rights reserved.
// This code is governed by the BSD License found in the LICENSE file.

module.exports = NodeRunner;

var vm = require('vm');
var Runner = require('../runner');

function Test262Error(message) {
    if (message) this.message = message;
}

Test262Error.prototype.toString = function () {
    return this.message;
};

function NodeRunner() { Runner.apply(this, arguments); }
NodeRunner.prototype = Object.create(Runner.prototype);
NodeRunner.prototype.doneFn = ";";
NodeRunner.prototype.logFn = ";";
NodeRunner.prototype.execute = function(test, cb) {
    var contents = test.contents;
    var error;
    var result = {log: []};
    
    var context = {
        $ERROR: function(err) {
            if(typeof err === "object" && err !== null && "name" in err)
                throw err;
            else throw new Test262Error(err);
        },
        $DONE: function(err) {
            error = err;
            result.doneCalled = true;
        },
        $LOG: function(log) {
            result.log.push(log);
        },
        process: process,
        Test262Error: Test262Error
    }

    try {
        vm.runInNewContext(contents, context, {displayErrors: false});
    } catch(e) {
        error = e;
    }

    process.nextTick(function () {
        if(error) {
            if(typeof error === 'object') {
                // custom thrown errors won't have a name property.
                result.errorName = error.name || "Test262Error";
                result.errorMessage = error.message;
                result.errorStack = error.stack
            } else {
                result.errorName = "Error";
                result.errorMessage = error;
            }
        }

        this.validateResult(test, result);
        cb();
    }.bind(this));
}
