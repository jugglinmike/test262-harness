// Copyright (C) 2014, Microsoft Corporation. All rights reserved.
// This code is governed by the BSD License found in the LICENSE file.

module.exports = ConsoleRunner;

var Runner = require('../runner');
var fs = require('fs');
var cp = require('child_process');
var counter = 0;

var batchDoneFn = function $DONE(err) {
    if(err) {
        if(typeof err === "object" && err !== null && "name" in err) {
            if("stack" in err) $LOG("test262/error " + err.stack)
            else $LOG("test262/error " + err.name + ": " + err.message)
        }
        else $LOG("test262/error Error: " + err);
    }
    $ERROR('test262/test-end');
    if(tests.length > 0) runNext();
}.toString()


function ConsoleRunner(args) {
    this.command = args.consoleCommand;
    this.printCommand = args.consolePrintCommand || "console.log";

    if(args.batch) {
        // Control flow functions are defined by the parent context
        this.needsCtrlFlow = false;

        if(args.batchConfig) {
            this._createEnv = args.batchConfig.createEnv;
            this._runBatched = args.batchConfig.runBatched;
            this._setRealmValue = args.batchConfig.setRealmValue;
        }
    }

    if(!this.command) throw "--consoleCommand option required for console runner";
    if (!this._setRealmValue) {
        this._setRealmValue = function(env, property, value) {
            env[property] = value;
        }.toString();
    }

    Runner.apply(this, arguments);
}
ConsoleRunner.prototype = Object.create(Runner.prototype);

ConsoleRunner.prototype.doneFnSrc = function $DONE(err) {
    if(err) $ERROR(err);
    $ERROR('test262/done');
}.toString();

ConsoleRunner.prototype._print = function(str) {
    return this.printCommand + '(' + str + ');\n';
}
Object.defineProperty(ConsoleRunner.prototype, 'logFnSrc', {
    get: memoize(function() {
        return 'function $LOG(str) { ' + this._print('str') + '}';
    })
});

Object.defineProperty(ConsoleRunner.prototype, 'runNextFn', {
    get: memoize(function() {
        if(!this._createEnv) throw "Don't know how to create an environment";
        if(!this._runBatched) throw "Don't know how to run a batched tests";

        var runNextFn = function runNext() {
            var testInfo = tests.shift();
            var test = testInfo.contents;
            var env = $1;
            $setRealmValue(env, "$DONE", $DONE);

            try {
                $2;
                if (testInfo.attrs.flags.raw) {
                  $DONE();
                }
            } catch(e) {
                $DONE(e);
            }
        }.toString();

        return runNextFn.replace("$1", this._createEnv)
                        .replace("$2", this._runBatched)
    })
});

ConsoleRunner.prototype.execute = function(test, cb) {
    var runner = this;
    var file = '__tmp' + counter++ + '.js';

    var command = this.command + ' ' + file;

    fs.writeFile(file, test.contents, function(err) {
        cp.exec(command, function(err, stdout, stderr) {
            fs.unlink(file);
            var match;
            var result = {
                log: stdout.split(/\r?\n/),
                errorString: stderr
            }

            runner.validateResult(test, result);

            cb();
        });
    }); 
}

ConsoleRunner.prototype.executeBatch = function(batch, batchDone) {
    var runner = this;
    var scriptFile = '__tmp' + counter++ + '.js';
    var script = this.logFnSrc + '\n' +
                 batchDoneFn + '\n' + 
                 'var $setRealmValue = ' +  this._setRealmValue + ';\n' +
                 this.runNextFn + '\n';

    script += 'var tests = ' + JSON.stringify(batch.map(function(test, i) {
        return test
    })).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029") + '\n';

    script += 'runNext();'

    fs.writeFileSync(scriptFile, script);

    cp.exec(this.command + " " + scriptFile, function(err, stdout, stderr) {
        var results = { log: [] };
        var lines = stdout.split(/\r?\n/);
        var index = 0;

        tmpLog('exec complete');
        lines.forEach(function(line) {
            switch(line) {
                case 'test262/test-start':
                    break;
                default:
                    results.log.push(line);
            }
        })

        stderr.split(/\r?\n/).forEach(function(line) {
          if (line.indexOf('test262/test-end') > -1) {
            tmpLog('found end');
            var test = batch[index++];
            runner.validateResult(test, results);
            results = { log: [] };
          }
        });

        tmpLog('batch done');
        fs.unlink(scriptFile);
        batchDone();
    });
}



function memoize(getter) {
    var val = null;

    return function() {
        if(val) return val;
        return val = getter.apply(this);
    }
}
