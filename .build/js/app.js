(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (process,global){
// Copyright (c) Microsoft Open Technologies, Inc. All rights reserved. See License.txt in the project root for license information.

;(function (undefined) {
  var objectTypes = {
    boolean: false,
    "function": true,
    object: true,
    number: false,
    string: false,
    undefined: false
  };

  var root = objectTypes[typeof window] && window || this,
      freeExports = objectTypes[typeof exports] && exports && !exports.nodeType && exports,
      freeModule = objectTypes[typeof module] && module && !module.nodeType && module,
      moduleExports = freeModule && freeModule.exports === freeExports && freeExports,
      freeGlobal = objectTypes[typeof global] && global;

  if (freeGlobal && (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal)) {
    root = freeGlobal;
  }

  var Rx = {
    internals: {},
    config: {
      Promise: root.Promise
    },
    helpers: {}
  };

  // Defaults
  var noop = Rx.helpers.noop = function () {},
      notDefined = Rx.helpers.notDefined = function (x) {
    return typeof x === "undefined";
  },
      isScheduler = Rx.helpers.isScheduler = function (x) {
    return x instanceof Rx.Scheduler;
  },
      identity = Rx.helpers.identity = function (x) {
    return x;
  },
      pluck = Rx.helpers.pluck = function (property) {
    return function (x) {
      return x[property];
    };
  },
      just = Rx.helpers.just = function (value) {
    return function () {
      return value;
    };
  },
      defaultNow = Rx.helpers.defaultNow = Date.now,
      defaultComparer = Rx.helpers.defaultComparer = function (x, y) {
    return isEqual(x, y);
  },
      defaultSubComparer = Rx.helpers.defaultSubComparer = function (x, y) {
    return x > y ? 1 : x < y ? -1 : 0;
  },
      defaultKeySerializer = Rx.helpers.defaultKeySerializer = function (x) {
    return x.toString();
  },
      defaultError = Rx.helpers.defaultError = function (err) {
    throw err;
  },
      isPromise = Rx.helpers.isPromise = function (p) {
    return !!p && typeof p.then === "function";
  },
      asArray = Rx.helpers.asArray = function () {
    return Array.prototype.slice.call(arguments);
  },
      not = Rx.helpers.not = function (a) {
    return !a;
  },
      isFunction = Rx.helpers.isFunction = (function () {
    var isFn = function (value) {
      return typeof value == "function" || false;
    };

    // fallback for older versions of Chrome and Safari
    if (isFn(/x/)) {
      isFn = function (value) {
        return typeof value == "function" && toString.call(value) == "[object Function]";
      };
    }

    return isFn;
  })();

  // Errors
  var sequenceContainsNoElements = "Sequence contains no elements.";
  var argumentOutOfRange = "Argument out of range";
  var objectDisposed = "Object has been disposed";
  function checkDisposed(self) {
    if (self.isDisposed) {
      throw new Error(objectDisposed);
    }
  }
  function cloneArray(arr) {
    for (var a = [], i = 0, len = arr.length; i < len; i++) {
      a.push(arr[i]);
    }return a;
  }

  Rx.config.longStackSupport = false;
  var hasStacks = false;
  try {
    throw new Error();
  } catch (e) {
    hasStacks = !!e.stack;
  }

  // All code after this point will be filtered from stack traces reported by RxJS
  var rStartingLine = captureLine(),
      rFileName;

  var STACK_JUMP_SEPARATOR = "From previous event:";

  function makeStackTraceLong(error, observable) {
    // If possible, transform the error stack trace by removing Node and RxJS
    // cruft, then concatenating with the stack trace of `observable`.
    if (hasStacks && observable.stack && typeof error === "object" && error !== null && error.stack && error.stack.indexOf(STACK_JUMP_SEPARATOR) === -1) {
      var stacks = [];
      for (var o = observable; !!o; o = o.source) {
        if (o.stack) {
          stacks.unshift(o.stack);
        }
      }
      stacks.unshift(error.stack);

      var concatedStacks = stacks.join("\n" + STACK_JUMP_SEPARATOR + "\n");
      error.stack = filterStackString(concatedStacks);
    }
  }

  function filterStackString(stackString) {
    var lines = stackString.split("\n"),
        desiredLines = [];
    for (var i = 0, len = lines.length; i < len; i++) {
      var line = lines[i];

      if (!isInternalFrame(line) && !isNodeFrame(line) && line) {
        desiredLines.push(line);
      }
    }
    return desiredLines.join("\n");
  }

  function isInternalFrame(stackLine) {
    var fileNameAndLineNumber = getFileNameAndLineNumber(stackLine);
    if (!fileNameAndLineNumber) {
      return false;
    }
    var fileName = fileNameAndLineNumber[0],
        lineNumber = fileNameAndLineNumber[1];

    return fileName === rFileName && lineNumber >= rStartingLine && lineNumber <= rEndingLine;
  }

  function isNodeFrame(stackLine) {
    return stackLine.indexOf("(module.js:") !== -1 || stackLine.indexOf("(node.js:") !== -1;
  }

  function captureLine() {
    if (!hasStacks) {
      return;
    }

    try {
      throw new Error();
    } catch (e) {
      var lines = e.stack.split("\n");
      var firstLine = lines[0].indexOf("@") > 0 ? lines[1] : lines[2];
      var fileNameAndLineNumber = getFileNameAndLineNumber(firstLine);
      if (!fileNameAndLineNumber) {
        return;
      }

      rFileName = fileNameAndLineNumber[0];
      return fileNameAndLineNumber[1];
    }
  }

  function getFileNameAndLineNumber(stackLine) {
    // Named functions: "at functionName (filename:lineNumber:columnNumber)"
    var attempt1 = /at .+ \((.+):(\d+):(?:\d+)\)$/.exec(stackLine);
    if (attempt1) {
      return [attempt1[1], Number(attempt1[2])];
    }

    // Anonymous functions: "at filename:lineNumber:columnNumber"
    var attempt2 = /at ([^ ]+):(\d+):(?:\d+)$/.exec(stackLine);
    if (attempt2) {
      return [attempt2[1], Number(attempt2[2])];
    }

    // Firefox style: "function@filename:lineNumber or @filename:lineNumber"
    var attempt3 = /.*@(.+):(\d+)$/.exec(stackLine);
    if (attempt3) {
      return [attempt3[1], Number(attempt3[2])];
    }
  }

  // Shim in iterator support
  var $iterator$ = typeof Symbol === "function" && Symbol.iterator || "_es6shim_iterator_";
  // Bug for mozilla version
  if (root.Set && typeof new root.Set()["@@iterator"] === "function") {
    $iterator$ = "@@iterator";
  }

  var doneEnumerator = Rx.doneEnumerator = { done: true, value: undefined };

  var isIterable = Rx.helpers.isIterable = function (o) {
    return o[$iterator$] !== undefined;
  };

  var isArrayLike = Rx.helpers.isArrayLike = function (o) {
    return o && o.length !== undefined;
  };

  Rx.helpers.iterator = $iterator$;

  var bindCallback = Rx.internals.bindCallback = function (func, thisArg, argCount) {
    if (typeof thisArg === "undefined") {
      return func;
    }
    switch (argCount) {
      case 0:
        return function () {
          return func.call(thisArg);
        };
      case 1:
        return function (arg) {
          return func.call(thisArg, arg);
        };
      case 2:
        return function (value, index) {
          return func.call(thisArg, value, index);
        };
      case 3:
        return function (value, index, collection) {
          return func.call(thisArg, value, index, collection);
        };
    }

    return function () {
      return func.apply(thisArg, arguments);
    };
  };

  /** Used to determine if values are of the language type Object */
  var dontEnums = ["toString", "toLocaleString", "valueOf", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable", "constructor"],
      dontEnumsLength = dontEnums.length;

  /** `Object#toString` result shortcuts */
  var argsClass = "[object Arguments]",
      arrayClass = "[object Array]",
      boolClass = "[object Boolean]",
      dateClass = "[object Date]",
      errorClass = "[object Error]",
      funcClass = "[object Function]",
      numberClass = "[object Number]",
      objectClass = "[object Object]",
      regexpClass = "[object RegExp]",
      stringClass = "[object String]";

  var toString = Object.prototype.toString,
      hasOwnProperty = Object.prototype.hasOwnProperty,
      supportsArgsClass = toString.call(arguments) == argsClass,
      // For less <IE9 && FF<4
  supportNodeClass,
      errorProto = Error.prototype,
      objectProto = Object.prototype,
      stringProto = String.prototype,
      propertyIsEnumerable = objectProto.propertyIsEnumerable;

  try {
    supportNodeClass = !(toString.call(document) == objectClass && !({ toString: 0 } + ""));
  } catch (e) {
    supportNodeClass = true;
  }

  var nonEnumProps = {};
  nonEnumProps[arrayClass] = nonEnumProps[dateClass] = nonEnumProps[numberClass] = { constructor: true, toLocaleString: true, toString: true, valueOf: true };
  nonEnumProps[boolClass] = nonEnumProps[stringClass] = { constructor: true, toString: true, valueOf: true };
  nonEnumProps[errorClass] = nonEnumProps[funcClass] = nonEnumProps[regexpClass] = { constructor: true, toString: true };
  nonEnumProps[objectClass] = { constructor: true };

  var support = {};
  (function () {
    var ctor = function () {
      this.x = 1;
    },
        props = [];

    ctor.prototype = { valueOf: 1, y: 1 };
    for (var key in new ctor()) {
      props.push(key);
    }
    for (key in arguments) {}

    // Detect if `name` or `message` properties of `Error.prototype` are enumerable by default.
    support.enumErrorProps = propertyIsEnumerable.call(errorProto, "message") || propertyIsEnumerable.call(errorProto, "name");

    // Detect if `prototype` properties are enumerable by default.
    support.enumPrototypes = propertyIsEnumerable.call(ctor, "prototype");

    // Detect if `arguments` object indexes are non-enumerable
    support.nonEnumArgs = key != 0;

    // Detect if properties shadowing those on `Object.prototype` are non-enumerable.
    support.nonEnumShadows = !/valueOf/.test(props);
  })(1);

  var isObject = Rx.internals.isObject = function (value) {
    var type = typeof value;
    return value && (type == "function" || type == "object") || false;
  };

  function keysIn(object) {
    var result = [];
    if (!isObject(object)) {
      return result;
    }
    if (support.nonEnumArgs && object.length && isArguments(object)) {
      object = slice.call(object);
    }
    var skipProto = support.enumPrototypes && typeof object == "function",
        skipErrorProps = support.enumErrorProps && (object === errorProto || object instanceof Error);

    for (var key in object) {
      if (!(skipProto && key == "prototype") && !(skipErrorProps && (key == "message" || key == "name"))) {
        result.push(key);
      }
    }

    if (support.nonEnumShadows && object !== objectProto) {
      var ctor = object.constructor,
          index = -1,
          length = dontEnumsLength;

      if (object === (ctor && ctor.prototype)) {
        var className = object === stringProto ? stringClass : object === errorProto ? errorClass : toString.call(object),
            nonEnum = nonEnumProps[className];
      }
      while (++index < length) {
        key = dontEnums[index];
        if (!(nonEnum && nonEnum[key]) && hasOwnProperty.call(object, key)) {
          result.push(key);
        }
      }
    }
    return result;
  }

  function internalFor(object, callback, keysFunc) {
    var index = -1,
        props = keysFunc(object),
        length = props.length;

    while (++index < length) {
      var key = props[index];
      if (callback(object[key], key, object) === false) {
        break;
      }
    }
    return object;
  }

  function internalForIn(object, callback) {
    return internalFor(object, callback, keysIn);
  }

  function isNode(value) {
    // IE < 9 presents DOM nodes as `Object` objects except they have `toString`
    // methods that are `typeof` "string" and still can coerce nodes to strings
    return typeof value.toString != "function" && typeof (value + "") == "string";
  }

  var isArguments = function (value) {
    return value && typeof value == "object" ? toString.call(value) == argsClass : false;
  };

  // fallback for browsers that can't detect `arguments` objects by [[Class]]
  if (!supportsArgsClass) {
    isArguments = function (value) {
      return value && typeof value == "object" ? hasOwnProperty.call(value, "callee") : false;
    };
  }

  var isEqual = Rx.internals.isEqual = function (x, y) {
    return deepEquals(x, y, [], []);
  };

  /** @private
   * Used for deep comparison
   **/
  function deepEquals(a, b, stackA, stackB) {
    // exit early for identical values
    if (a === b) {
      // treat `+0` vs. `-0` as not equal
      return a !== 0 || 1 / a == 1 / b;
    }

    var type = typeof a,
        otherType = typeof b;

    // exit early for unlike primitive values
    if (a === a && (a == null || b == null || type != "function" && type != "object" && otherType != "function" && otherType != "object")) {
      return false;
    }

    // compare [[Class]] names
    var className = toString.call(a),
        otherClass = toString.call(b);

    if (className == argsClass) {
      className = objectClass;
    }
    if (otherClass == argsClass) {
      otherClass = objectClass;
    }
    if (className != otherClass) {
      return false;
    }
    switch (className) {
      case boolClass:
      case dateClass:
        // coerce dates and booleans to numbers, dates to milliseconds and booleans
        // to `1` or `0` treating invalid dates coerced to `NaN` as not equal
        return +a == +b;

      case numberClass:
        // treat `NaN` vs. `NaN` as equal
        return a != +a ? b != +b : a == 0 ? 1 / a == 1 / b : a == +b;

      case regexpClass:
      case stringClass:
        // coerce regexes to strings (http://es5.github.io/#x15.10.6.4)
        // treat string primitives and their corresponding object instances as equal
        return a == String(b);
    }
    var isArr = className == arrayClass;
    if (!isArr) {
      // exit for functions and DOM nodes
      if (className != objectClass || !support.nodeClass && (isNode(a) || isNode(b))) {
        return false;
      }
      // in older versions of Opera, `arguments` objects have `Array` constructors
      var ctorA = !support.argsObject && isArguments(a) ? Object : a.constructor,
          ctorB = !support.argsObject && isArguments(b) ? Object : b.constructor;

      // non `Object` object instances with different constructors are not equal
      if (ctorA != ctorB && !(hasOwnProperty.call(a, "constructor") && hasOwnProperty.call(b, "constructor")) && !(isFunction(ctorA) && ctorA instanceof ctorA && isFunction(ctorB) && ctorB instanceof ctorB) && ("constructor" in a && "constructor" in b)) {
        return false;
      }
    }
    // assume cyclic structures are equal
    // the algorithm for detecting cyclic structures is adapted from ES 5.1
    // section 15.12.3, abstract operation `JO` (http://es5.github.io/#x15.12.3)
    var initedStack = !stackA;
    stackA || (stackA = []);
    stackB || (stackB = []);

    var length = stackA.length;
    while (length--) {
      if (stackA[length] == a) {
        return stackB[length] == b;
      }
    }
    var size = 0;
    var result = true;

    // add `a` and `b` to the stack of traversed objects
    stackA.push(a);
    stackB.push(b);

    // recursively compare objects and arrays (susceptible to call stack limits)
    if (isArr) {
      // compare lengths to determine if a deep comparison is necessary
      length = a.length;
      size = b.length;
      result = size == length;

      if (result) {
        // deep compare the contents, ignoring non-numeric properties
        while (size--) {
          var index = length,
              value = b[size];

          if (!(result = deepEquals(a[size], value, stackA, stackB))) {
            break;
          }
        }
      }
    } else {
      // deep compare objects using `forIn`, instead of `forOwn`, to avoid `Object.keys`
      // which, in this case, is more costly
      internalForIn(b, function (value, key, b) {
        if (hasOwnProperty.call(b, key)) {
          // count the number of properties.
          size++;
          // deep compare each property value.
          return result = hasOwnProperty.call(a, key) && deepEquals(a[key], value, stackA, stackB);
        }
      });

      if (result) {
        // ensure both objects have the same number of properties
        internalForIn(a, function (value, key, a) {
          if (hasOwnProperty.call(a, key)) {
            // `size` will be `-1` if `a` has more properties than `b`
            return result = --size > -1;
          }
        });
      }
    }
    stackA.pop();
    stackB.pop();

    return result;
  }

  var hasProp = ({}).hasOwnProperty,
      slice = Array.prototype.slice;

  var inherits = this.inherits = Rx.internals.inherits = function (child, parent) {
    function __() {
      this.constructor = child;
    }
    __.prototype = parent.prototype;
    child.prototype = new __();
  };

  var addProperties = Rx.internals.addProperties = function (obj) {
    for (var sources = [], i = 1, len = arguments.length; i < len; i++) {
      sources.push(arguments[i]);
    }
    for (var idx = 0, ln = sources.length; idx < ln; idx++) {
      var source = sources[idx];
      for (var prop in source) {
        obj[prop] = source[prop];
      }
    }
  };

  // Rx Utils
  var addRef = Rx.internals.addRef = function (xs, r) {
    return new AnonymousObservable(function (observer) {
      return new CompositeDisposable(r.getDisposable(), xs.subscribe(observer));
    });
  };

  function arrayInitialize(count, factory) {
    var a = new Array(count);
    for (var i = 0; i < count; i++) {
      a[i] = factory();
    }
    return a;
  }

  // Collections
  function IndexedItem(id, value) {
    this.id = id;
    this.value = value;
  }

  IndexedItem.prototype.compareTo = function (other) {
    var c = this.value.compareTo(other.value);
    c === 0 && (c = this.id - other.id);
    return c;
  };

  // Priority Queue for Scheduling
  var PriorityQueue = Rx.internals.PriorityQueue = function (capacity) {
    this.items = new Array(capacity);
    this.length = 0;
  };

  var priorityProto = PriorityQueue.prototype;
  priorityProto.isHigherPriority = function (left, right) {
    return this.items[left].compareTo(this.items[right]) < 0;
  };

  priorityProto.percolate = function (index) {
    if (index >= this.length || index < 0) {
      return;
    }
    var parent = index - 1 >> 1;
    if (parent < 0 || parent === index) {
      return;
    }
    if (this.isHigherPriority(index, parent)) {
      var temp = this.items[index];
      this.items[index] = this.items[parent];
      this.items[parent] = temp;
      this.percolate(parent);
    }
  };

  priorityProto.heapify = function (index) {
    +index || (index = 0);
    if (index >= this.length || index < 0) {
      return;
    }
    var left = 2 * index + 1,
        right = 2 * index + 2,
        first = index;
    if (left < this.length && this.isHigherPriority(left, first)) {
      first = left;
    }
    if (right < this.length && this.isHigherPriority(right, first)) {
      first = right;
    }
    if (first !== index) {
      var temp = this.items[index];
      this.items[index] = this.items[first];
      this.items[first] = temp;
      this.heapify(first);
    }
  };

  priorityProto.peek = function () {
    return this.items[0].value;
  };

  priorityProto.removeAt = function (index) {
    this.items[index] = this.items[--this.length];
    this.items[this.length] = undefined;
    this.heapify();
  };

  priorityProto.dequeue = function () {
    var result = this.peek();
    this.removeAt(0);
    return result;
  };

  priorityProto.enqueue = function (item) {
    var index = this.length++;
    this.items[index] = new IndexedItem(PriorityQueue.count++, item);
    this.percolate(index);
  };

  priorityProto.remove = function (item) {
    for (var i = 0; i < this.length; i++) {
      if (this.items[i].value === item) {
        this.removeAt(i);
        return true;
      }
    }
    return false;
  };
  PriorityQueue.count = 0;

  /**
   * Represents a group of disposable resources that are disposed together.
   * @constructor
   */
  var CompositeDisposable = Rx.CompositeDisposable = function () {
    var args = [];
    if (Array.isArray(arguments[0])) {
      args = arguments[0];
    } else {
      for (var i = 0, len = arguments.length; i < len; i++) {
        args.push(arguments[i]);
      }
    }
    this.disposables = args;
    this.isDisposed = false;
    this.length = this.disposables.length;
  };

  var CompositeDisposablePrototype = CompositeDisposable.prototype;

  /**
   * Adds a disposable to the CompositeDisposable or disposes the disposable if the CompositeDisposable is disposed.
   * @param {Mixed} item Disposable to add.
   */
  CompositeDisposablePrototype.add = function (item) {
    if (this.isDisposed) {
      item.dispose();
    } else {
      this.disposables.push(item);
      this.length++;
    }
  };

  /**
   * Removes and disposes the first occurrence of a disposable from the CompositeDisposable.
   * @param {Mixed} item Disposable to remove.
   * @returns {Boolean} true if found; false otherwise.
   */
  CompositeDisposablePrototype.remove = function (item) {
    var shouldDispose = false;
    if (!this.isDisposed) {
      var idx = this.disposables.indexOf(item);
      if (idx !== -1) {
        shouldDispose = true;
        this.disposables.splice(idx, 1);
        this.length--;
        item.dispose();
      }
    }
    return shouldDispose;
  };

  /**
   *  Disposes all disposables in the group and removes them from the group.
   */
  CompositeDisposablePrototype.dispose = function () {
    if (!this.isDisposed) {
      this.isDisposed = true;
      for (var currentDisposables = [], i = 0, len = this.disposables.length; i < len; i++) {
        currentDisposables.push(this.disposables[i]);
      }
      this.disposables = [];
      this.length = 0;

      for (i = 0, len = currentDisposables.length; i < len; i++) {
        currentDisposables[i].dispose();
      }
    }
  };

  /**
   * Converts the existing CompositeDisposable to an array of disposables
   * @returns {Array} An array of disposable objects.
   */
  CompositeDisposablePrototype.toArray = function () {
    for (var currentDisposables = [], ix = 0, len = this.disposables.length; i < len; i++) {
      currentDisposables.push(this.disposables[i]);
    }
    return currentDisposables;
  };

  /**
   * Provides a set of static methods for creating Disposables.
   *
   * @constructor
   * @param {Function} dispose Action to run during the first call to dispose. The action is guaranteed to be run at most once.
   */
  var Disposable = Rx.Disposable = function (action) {
    this.isDisposed = false;
    this.action = action || noop;
  };

  /** Performs the task of cleaning up resources. */
  Disposable.prototype.dispose = function () {
    if (!this.isDisposed) {
      this.action();
      this.isDisposed = true;
    }
  };

  /**
   * Creates a disposable object that invokes the specified action when disposed.
   * @param {Function} dispose Action to run during the first call to dispose. The action is guaranteed to be run at most once.
   * @return {Disposable} The disposable object that runs the given action upon disposal.
   */
  var disposableCreate = Disposable.create = function (action) {
    return new Disposable(action);
  };

  /**
   * Gets the disposable that does nothing when disposed.
   */
  var disposableEmpty = Disposable.empty = { dispose: noop };

  var SingleAssignmentDisposable = Rx.SingleAssignmentDisposable = (function () {
    function BooleanDisposable() {
      this.isDisposed = false;
      this.current = null;
    }

    var booleanDisposablePrototype = BooleanDisposable.prototype;

    /**
     * Gets the underlying disposable.
     * @return The underlying disposable.
     */
    booleanDisposablePrototype.getDisposable = function () {
      return this.current;
    };

    /**
     * Sets the underlying disposable.
     * @param {Disposable} value The new underlying disposable.
     */
    booleanDisposablePrototype.setDisposable = function (value) {
      var shouldDispose = this.isDisposed;
      if (!shouldDispose) {
        var old = this.current;
        this.current = value;
      }
      old && old.dispose();
      shouldDispose && value && value.dispose();
    };

    /**
     * Disposes the underlying disposable as well as all future replacements.
     */
    booleanDisposablePrototype.dispose = function () {
      if (!this.isDisposed) {
        this.isDisposed = true;
        var old = this.current;
        this.current = null;
      }
      old && old.dispose();
    };

    return BooleanDisposable;
  })();
  var SerialDisposable = Rx.SerialDisposable = SingleAssignmentDisposable;

  /**
   * Represents a disposable resource that only disposes its underlying disposable resource when all dependent disposable objects have been disposed.
   */
  var RefCountDisposable = Rx.RefCountDisposable = (function () {
    function InnerDisposable(disposable) {
      this.disposable = disposable;
      this.disposable.count++;
      this.isInnerDisposed = false;
    }

    InnerDisposable.prototype.dispose = function () {
      if (!this.disposable.isDisposed && !this.isInnerDisposed) {
        this.isInnerDisposed = true;
        this.disposable.count--;
        if (this.disposable.count === 0 && this.disposable.isPrimaryDisposed) {
          this.disposable.isDisposed = true;
          this.disposable.underlyingDisposable.dispose();
        }
      }
    };

    /**
     * Initializes a new instance of the RefCountDisposable with the specified disposable.
     * @constructor
     * @param {Disposable} disposable Underlying disposable.
      */
    function RefCountDisposable(disposable) {
      this.underlyingDisposable = disposable;
      this.isDisposed = false;
      this.isPrimaryDisposed = false;
      this.count = 0;
    }

    /**
     * Disposes the underlying disposable only when all dependent disposables have been disposed
     */
    RefCountDisposable.prototype.dispose = function () {
      if (!this.isDisposed && !this.isPrimaryDisposed) {
        this.isPrimaryDisposed = true;
        if (this.count === 0) {
          this.isDisposed = true;
          this.underlyingDisposable.dispose();
        }
      }
    };

    /**
     * Returns a dependent disposable that when disposed decreases the refcount on the underlying disposable.
     * @returns {Disposable} A dependent disposable contributing to the reference count that manages the underlying disposable's lifetime.
     */
    RefCountDisposable.prototype.getDisposable = function () {
      return this.isDisposed ? disposableEmpty : new InnerDisposable(this);
    };

    return RefCountDisposable;
  })();

  var ScheduledItem = Rx.internals.ScheduledItem = function (scheduler, state, action, dueTime, comparer) {
    this.scheduler = scheduler;
    this.state = state;
    this.action = action;
    this.dueTime = dueTime;
    this.comparer = comparer || defaultSubComparer;
    this.disposable = new SingleAssignmentDisposable();
  };

  ScheduledItem.prototype.invoke = function () {
    this.disposable.setDisposable(this.invokeCore());
  };

  ScheduledItem.prototype.compareTo = function (other) {
    return this.comparer(this.dueTime, other.dueTime);
  };

  ScheduledItem.prototype.isCancelled = function () {
    return this.disposable.isDisposed;
  };

  ScheduledItem.prototype.invokeCore = function () {
    return this.action(this.scheduler, this.state);
  };

  /** Provides a set of static properties to access commonly used schedulers. */
  var Scheduler = Rx.Scheduler = (function () {
    function Scheduler(now, schedule, scheduleRelative, scheduleAbsolute) {
      this.now = now;
      this._schedule = schedule;
      this._scheduleRelative = scheduleRelative;
      this._scheduleAbsolute = scheduleAbsolute;
    }

    function invokeAction(scheduler, action) {
      action();
      return disposableEmpty;
    }

    var schedulerProto = Scheduler.prototype;

    /**
     * Schedules an action to be executed.
     * @param {Function} action Action to execute.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
     */
    schedulerProto.schedule = function (action) {
      return this._schedule(action, invokeAction);
    };

    /**
     * Schedules an action to be executed.
     * @param state State passed to the action to be executed.
     * @param {Function} action Action to be executed.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
     */
    schedulerProto.scheduleWithState = function (state, action) {
      return this._schedule(state, action);
    };

    /**
     * Schedules an action to be executed after the specified relative due time.
     * @param {Function} action Action to execute.
     * @param {Number} dueTime Relative time after which to execute the action.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
     */
    schedulerProto.scheduleWithRelative = function (dueTime, action) {
      return this._scheduleRelative(action, dueTime, invokeAction);
    };

    /**
     * Schedules an action to be executed after dueTime.
     * @param state State passed to the action to be executed.
     * @param {Function} action Action to be executed.
     * @param {Number} dueTime Relative time after which to execute the action.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
     */
    schedulerProto.scheduleWithRelativeAndState = function (state, dueTime, action) {
      return this._scheduleRelative(state, dueTime, action);
    };

    /**
     * Schedules an action to be executed at the specified absolute due time.
     * @param {Function} action Action to execute.
     * @param {Number} dueTime Absolute time at which to execute the action.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
      */
    schedulerProto.scheduleWithAbsolute = function (dueTime, action) {
      return this._scheduleAbsolute(action, dueTime, invokeAction);
    };

    /**
     * Schedules an action to be executed at dueTime.
     * @param {Mixed} state State passed to the action to be executed.
     * @param {Function} action Action to be executed.
     * @param {Number}dueTime Absolute time at which to execute the action.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
     */
    schedulerProto.scheduleWithAbsoluteAndState = function (state, dueTime, action) {
      return this._scheduleAbsolute(state, dueTime, action);
    };

    /** Gets the current time according to the local machine's system clock. */
    Scheduler.now = defaultNow;

    /**
     * Normalizes the specified TimeSpan value to a positive value.
     * @param {Number} timeSpan The time span value to normalize.
     * @returns {Number} The specified TimeSpan value if it is zero or positive; otherwise, 0
     */
    Scheduler.normalize = function (timeSpan) {
      timeSpan < 0 && (timeSpan = 0);
      return timeSpan;
    };

    return Scheduler;
  })();

  var normalizeTime = Scheduler.normalize;

  (function (schedulerProto) {
    function invokeRecImmediate(scheduler, pair) {
      var state = pair.first,
          action = pair.second,
          group = new CompositeDisposable(),
          recursiveAction = function (state1) {
        action(state1, function (state2) {
          var isAdded = false,
              isDone = false,
              d = scheduler.scheduleWithState(state2, function (scheduler1, state3) {
            if (isAdded) {
              group.remove(d);
            } else {
              isDone = true;
            }
            recursiveAction(state3);
            return disposableEmpty;
          });
          if (!isDone) {
            group.add(d);
            isAdded = true;
          }
        });
      };
      recursiveAction(state);
      return group;
    }

    function invokeRecDate(scheduler, pair, method) {
      var state = pair.first,
          action = pair.second,
          group = new CompositeDisposable(),
          recursiveAction = function (state1) {
        action(state1, function (state2, dueTime1) {
          var isAdded = false,
              isDone = false,
              d = scheduler[method](state2, dueTime1, function (scheduler1, state3) {
            if (isAdded) {
              group.remove(d);
            } else {
              isDone = true;
            }
            recursiveAction(state3);
            return disposableEmpty;
          });
          if (!isDone) {
            group.add(d);
            isAdded = true;
          }
        });
      };
      recursiveAction(state);
      return group;
    }

    function scheduleInnerRecursive(action, self) {
      action(function (dt) {
        self(action, dt);
      });
    }

    /**
     * Schedules an action to be executed recursively.
     * @param {Function} action Action to execute recursively. The parameter passed to the action is used to trigger recursive scheduling of the action.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
     */
    schedulerProto.scheduleRecursive = function (action) {
      return this.scheduleRecursiveWithState(action, function (_action, self) {
        _action(function () {
          self(_action);
        });
      });
    };

    /**
     * Schedules an action to be executed recursively.
     * @param {Mixed} state State passed to the action to be executed.
     * @param {Function} action Action to execute recursively. The last parameter passed to the action is used to trigger recursive scheduling of the action, passing in recursive invocation state.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
     */
    schedulerProto.scheduleRecursiveWithState = function (state, action) {
      return this.scheduleWithState({ first: state, second: action }, invokeRecImmediate);
    };

    /**
     * Schedules an action to be executed recursively after a specified relative due time.
     * @param {Function} action Action to execute recursively. The parameter passed to the action is used to trigger recursive scheduling of the action at the specified relative time.
     * @param {Number}dueTime Relative time after which to execute the action for the first time.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
     */
    schedulerProto.scheduleRecursiveWithRelative = function (dueTime, action) {
      return this.scheduleRecursiveWithRelativeAndState(action, dueTime, scheduleInnerRecursive);
    };

    /**
     * Schedules an action to be executed recursively after a specified relative due time.
     * @param {Mixed} state State passed to the action to be executed.
     * @param {Function} action Action to execute recursively. The last parameter passed to the action is used to trigger recursive scheduling of the action, passing in the recursive due time and invocation state.
     * @param {Number}dueTime Relative time after which to execute the action for the first time.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
     */
    schedulerProto.scheduleRecursiveWithRelativeAndState = function (state, dueTime, action) {
      return this._scheduleRelative({ first: state, second: action }, dueTime, function (s, p) {
        return invokeRecDate(s, p, "scheduleWithRelativeAndState");
      });
    };

    /**
     * Schedules an action to be executed recursively at a specified absolute due time.
     * @param {Function} action Action to execute recursively. The parameter passed to the action is used to trigger recursive scheduling of the action at the specified absolute time.
     * @param {Number}dueTime Absolute time at which to execute the action for the first time.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
     */
    schedulerProto.scheduleRecursiveWithAbsolute = function (dueTime, action) {
      return this.scheduleRecursiveWithAbsoluteAndState(action, dueTime, scheduleInnerRecursive);
    };

    /**
     * Schedules an action to be executed recursively at a specified absolute due time.
     * @param {Mixed} state State passed to the action to be executed.
     * @param {Function} action Action to execute recursively. The last parameter passed to the action is used to trigger recursive scheduling of the action, passing in the recursive due time and invocation state.
     * @param {Number}dueTime Absolute time at which to execute the action for the first time.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
     */
    schedulerProto.scheduleRecursiveWithAbsoluteAndState = function (state, dueTime, action) {
      return this._scheduleAbsolute({ first: state, second: action }, dueTime, function (s, p) {
        return invokeRecDate(s, p, "scheduleWithAbsoluteAndState");
      });
    };
  })(Scheduler.prototype);

  (function (schedulerProto) {
    /**
     * Schedules a periodic piece of work by dynamically discovering the scheduler's capabilities. The periodic task will be scheduled using window.setInterval for the base implementation.
     * @param {Number} period Period for running the work periodically.
     * @param {Function} action Action to be executed.
     * @returns {Disposable} The disposable object used to cancel the scheduled recurring action (best effort).
     */
    Scheduler.prototype.schedulePeriodic = function (period, action) {
      return this.schedulePeriodicWithState(null, period, action);
    };

    /**
     * Schedules a periodic piece of work by dynamically discovering the scheduler's capabilities. The periodic task will be scheduled using window.setInterval for the base implementation.
     * @param {Mixed} state Initial state passed to the action upon the first iteration.
     * @param {Number} period Period for running the work periodically.
     * @param {Function} action Action to be executed, potentially updating the state.
     * @returns {Disposable} The disposable object used to cancel the scheduled recurring action (best effort).
     */
    Scheduler.prototype.schedulePeriodicWithState = function (state, period, action) {
      if (typeof root.setInterval === "undefined") {
        throw new Error("Periodic scheduling not supported.");
      }
      var s = state;

      var id = root.setInterval(function () {
        s = action(s);
      }, period);

      return disposableCreate(function () {
        root.clearInterval(id);
      });
    };
  })(Scheduler.prototype);

  /** Gets a scheduler that schedules work immediately on the current thread. */
  var immediateScheduler = Scheduler.immediate = (function () {
    function scheduleNow(state, action) {
      return action(this, state);
    }

    function scheduleRelative(state, dueTime, action) {
      var dt = this.now() + normalizeTime(dueTime);
      while (dt - this.now() > 0) {}
      return action(this, state);
    }

    function scheduleAbsolute(state, dueTime, action) {
      return this.scheduleWithRelativeAndState(state, dueTime - this.now(), action);
    }

    return new Scheduler(defaultNow, scheduleNow, scheduleRelative, scheduleAbsolute);
  })();

  /**
   * Gets a scheduler that schedules work as soon as possible on the current thread.
   */
  var currentThreadScheduler = Scheduler.currentThread = (function () {
    var queue;

    function runTrampoline(q) {
      while (q.length > 0) {
        var item = q.dequeue();
        if (!item.isCancelled()) {
          // Note, do not schedule blocking work!
          while (item.dueTime - Scheduler.now() > 0) {}
          !item.isCancelled() && item.invoke();
        }
      }
    }

    function scheduleNow(state, action) {
      return this.scheduleWithRelativeAndState(state, 0, action);
    }

    function scheduleRelative(state, dueTime, action) {
      var dt = this.now() + Scheduler.normalize(dueTime),
          si = new ScheduledItem(this, state, action, dt);

      if (!queue) {
        queue = new PriorityQueue(4);
        queue.enqueue(si);
        try {
          runTrampoline(queue);
        } catch (e) {
          throw e;
        } finally {
          queue = null;
        }
      } else {
        queue.enqueue(si);
      }
      return si.disposable;
    }

    function scheduleAbsolute(state, dueTime, action) {
      return this.scheduleWithRelativeAndState(state, dueTime - this.now(), action);
    }

    var currentScheduler = new Scheduler(defaultNow, scheduleNow, scheduleRelative, scheduleAbsolute);

    currentScheduler.scheduleRequired = function () {
      return !queue;
    };
    currentScheduler.ensureTrampoline = function (action) {
      if (!queue) {
        this.schedule(action);
      } else {
        action();
      }
    };

    return currentScheduler;
  })();

  var SchedulePeriodicRecursive = Rx.internals.SchedulePeriodicRecursive = (function () {
    function tick(command, recurse) {
      recurse(0, this._period);
      try {
        this._state = this._action(this._state);
      } catch (e) {
        this._cancel.dispose();
        throw e;
      }
    }

    function SchedulePeriodicRecursive(scheduler, state, period, action) {
      this._scheduler = scheduler;
      this._state = state;
      this._period = period;
      this._action = action;
    }

    SchedulePeriodicRecursive.prototype.start = function () {
      var d = new SingleAssignmentDisposable();
      this._cancel = d;
      d.setDisposable(this._scheduler.scheduleRecursiveWithRelativeAndState(0, this._period, tick.bind(this)));

      return d;
    };

    return SchedulePeriodicRecursive;
  })();

  var scheduleMethod,
      clearMethod = noop;
  var localTimer = (function () {
    var localSetTimeout,
        localClearTimeout = noop;
    if ("WScript" in this) {
      localSetTimeout = function (fn, time) {
        WScript.Sleep(time);
        fn();
      };
    } else if (!!root.setTimeout) {
      localSetTimeout = root.setTimeout;
      localClearTimeout = root.clearTimeout;
    } else {
      throw new Error("No concurrency detected!");
    }

    return {
      setTimeout: localSetTimeout,
      clearTimeout: localClearTimeout
    };
  })();
  var localSetTimeout = localTimer.setTimeout,
      localClearTimeout = localTimer.clearTimeout;

  (function () {
    var reNative = RegExp("^" + String(toString).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/toString| for [^\]]+/g, ".*?") + "$");

    var setImmediate = typeof (setImmediate = freeGlobal && moduleExports && freeGlobal.setImmediate) == "function" && !reNative.test(setImmediate) && setImmediate,
        clearImmediate = typeof (clearImmediate = freeGlobal && moduleExports && freeGlobal.clearImmediate) == "function" && !reNative.test(clearImmediate) && clearImmediate;

    function postMessageSupported() {
      // Ensure not in a worker
      if (!root.postMessage || root.importScripts) {
        return false;
      }
      var isAsync = false,
          oldHandler = root.onmessage;
      // Test for async
      root.onmessage = function () {
        isAsync = true;
      };
      root.postMessage("", "*");
      root.onmessage = oldHandler;

      return isAsync;
    }

    // Use in order, setImmediate, nextTick, postMessage, MessageChannel, script readystatechanged, setTimeout
    if (typeof setImmediate === "function") {
      scheduleMethod = setImmediate;
      clearMethod = clearImmediate;
    } else if (typeof process !== "undefined" && ({}).toString.call(process) === "[object process]") {
      scheduleMethod = process.nextTick;
    } else if (postMessageSupported()) {
      var MSG_PREFIX = "ms.rx.schedule" + Math.random(),
          tasks = {},
          taskId = 0;

      var onGlobalPostMessage = function (event) {
        // Only if we're a match to avoid any other global events
        if (typeof event.data === "string" && event.data.substring(0, MSG_PREFIX.length) === MSG_PREFIX) {
          var handleId = event.data.substring(MSG_PREFIX.length),
              action = tasks[handleId];
          action();
          delete tasks[handleId];
        }
      };

      if (root.addEventListener) {
        root.addEventListener("message", onGlobalPostMessage, false);
      } else {
        root.attachEvent("onmessage", onGlobalPostMessage, false);
      }

      scheduleMethod = function (action) {
        var currentId = taskId++;
        tasks[currentId] = action;
        root.postMessage(MSG_PREFIX + currentId, "*");
      };
    } else if (!!root.MessageChannel) {
      var channel = new root.MessageChannel(),
          channelTasks = {},
          channelTaskId = 0;

      channel.port1.onmessage = function (event) {
        var id = event.data,
            action = channelTasks[id];
        action();
        delete channelTasks[id];
      };

      scheduleMethod = function (action) {
        var id = channelTaskId++;
        channelTasks[id] = action;
        channel.port2.postMessage(id);
      };
    } else if ("document" in root && "onreadystatechange" in root.document.createElement("script")) {
      scheduleMethod = function (action) {
        var scriptElement = root.document.createElement("script");
        scriptElement.onreadystatechange = function () {
          action();
          scriptElement.onreadystatechange = null;
          scriptElement.parentNode.removeChild(scriptElement);
          scriptElement = null;
        };
        root.document.documentElement.appendChild(scriptElement);
      };
    } else {
      scheduleMethod = function (action) {
        return localSetTimeout(action, 0);
      };
      clearMethod = localClearTimeout;
    }
  })();

  /**
   * Gets a scheduler that schedules work via a timed callback based upon platform.
   */
  var timeoutScheduler = Scheduler.timeout = (function () {
    function scheduleNow(state, action) {
      var scheduler = this,
          disposable = new SingleAssignmentDisposable();
      var id = scheduleMethod(function () {
        if (!disposable.isDisposed) {
          disposable.setDisposable(action(scheduler, state));
        }
      });
      return new CompositeDisposable(disposable, disposableCreate(function () {
        clearMethod(id);
      }));
    }

    function scheduleRelative(state, dueTime, action) {
      var scheduler = this,
          dt = Scheduler.normalize(dueTime);
      if (dt === 0) {
        return scheduler.scheduleWithState(state, action);
      }
      var disposable = new SingleAssignmentDisposable();
      var id = localSetTimeout(function () {
        if (!disposable.isDisposed) {
          disposable.setDisposable(action(scheduler, state));
        }
      }, dt);
      return new CompositeDisposable(disposable, disposableCreate(function () {
        localClearTimeout(id);
      }));
    }

    function scheduleAbsolute(state, dueTime, action) {
      return this.scheduleWithRelativeAndState(state, dueTime - this.now(), action);
    }

    return new Scheduler(defaultNow, scheduleNow, scheduleRelative, scheduleAbsolute);
  })();

  /**
   *  Represents a notification to an observer.
   */
  var Notification = Rx.Notification = (function () {
    function Notification(kind, hasValue) {
      this.hasValue = hasValue == null ? false : hasValue;
      this.kind = kind;
    }

    /**
     * Invokes the delegate corresponding to the notification or the observer's method corresponding to the notification and returns the produced result.
     *
     * @memberOf Notification
     * @param {Any} observerOrOnNext Delegate to invoke for an OnNext notification or Observer to invoke the notification on..
     * @param {Function} onError Delegate to invoke for an OnError notification.
     * @param {Function} onCompleted Delegate to invoke for an OnCompleted notification.
     * @returns {Any} Result produced by the observation.
     */
    Notification.prototype.accept = function (observerOrOnNext, onError, onCompleted) {
      return observerOrOnNext && typeof observerOrOnNext === "object" ? this._acceptObservable(observerOrOnNext) : this._accept(observerOrOnNext, onError, onCompleted);
    };

    /**
     * Returns an observable sequence with a single notification.
     *
     * @memberOf Notifications
     * @param {Scheduler} [scheduler] Scheduler to send out the notification calls on.
     * @returns {Observable} The observable sequence that surfaces the behavior of the notification upon subscription.
     */
    Notification.prototype.toObservable = function (scheduler) {
      var notification = this;
      isScheduler(scheduler) || (scheduler = immediateScheduler);
      return new AnonymousObservable(function (observer) {
        return scheduler.schedule(function () {
          notification._acceptObservable(observer);
          notification.kind === "N" && observer.onCompleted();
        });
      });
    };

    return Notification;
  })();

  /**
   * Creates an object that represents an OnNext notification to an observer.
   * @param {Any} value The value contained in the notification.
   * @returns {Notification} The OnNext notification containing the value.
   */
  var notificationCreateOnNext = Notification.createOnNext = (function () {
    function _accept(onNext) {
      return onNext(this.value);
    }
    function _acceptObservable(observer) {
      return observer.onNext(this.value);
    }
    function toString() {
      return "OnNext(" + this.value + ")";
    }

    return function (value) {
      var notification = new Notification("N", true);
      notification.value = value;
      notification._accept = _accept;
      notification._acceptObservable = _acceptObservable;
      notification.toString = toString;
      return notification;
    };
  })();

  /**
   * Creates an object that represents an OnError notification to an observer.
   * @param {Any} error The exception contained in the notification.
   * @returns {Notification} The OnError notification containing the exception.
   */
  var notificationCreateOnError = Notification.createOnError = (function () {
    function _accept(onNext, onError) {
      return onError(this.exception);
    }
    function _acceptObservable(observer) {
      return observer.onError(this.exception);
    }
    function toString() {
      return "OnError(" + this.exception + ")";
    }

    return function (e) {
      var notification = new Notification("E");
      notification.exception = e;
      notification._accept = _accept;
      notification._acceptObservable = _acceptObservable;
      notification.toString = toString;
      return notification;
    };
  })();

  /**
   * Creates an object that represents an OnCompleted notification to an observer.
   * @returns {Notification} The OnCompleted notification.
   */
  var notificationCreateOnCompleted = Notification.createOnCompleted = (function () {
    function _accept(onNext, onError, onCompleted) {
      return onCompleted();
    }
    function _acceptObservable(observer) {
      return observer.onCompleted();
    }
    function toString() {
      return "OnCompleted()";
    }

    return function () {
      var notification = new Notification("C");
      notification._accept = _accept;
      notification._acceptObservable = _acceptObservable;
      notification.toString = toString;
      return notification;
    };
  })();

  var Enumerator = Rx.internals.Enumerator = function (next) {
    this._next = next;
  };

  Enumerator.prototype.next = function () {
    return this._next();
  };

  Enumerator.prototype[$iterator$] = function () {
    return this;
  };

  var Enumerable = Rx.internals.Enumerable = function (iterator) {
    this._iterator = iterator;
  };

  Enumerable.prototype[$iterator$] = function () {
    return this._iterator();
  };

  Enumerable.prototype.concat = function () {
    var sources = this;
    return new AnonymousObservable(function (o) {
      var e = sources[$iterator$]();

      var isDisposed,
          subscription = new SerialDisposable();
      var cancelable = immediateScheduler.scheduleRecursive(function (self) {
        if (isDisposed) {
          return;
        }
        try {
          var currentItem = e.next();
        } catch (ex) {
          return o.onError(ex);
        }

        if (currentItem.done) {
          return o.onCompleted();
        }

        // Check if promise
        var currentValue = currentItem.value;
        isPromise(currentValue) && (currentValue = observableFromPromise(currentValue));

        var d = new SingleAssignmentDisposable();
        subscription.setDisposable(d);
        d.setDisposable(currentValue.subscribe(function (x) {
          o.onNext(x);
        }, function (err) {
          o.onError(err);
        }, self));
      });

      return new CompositeDisposable(subscription, cancelable, disposableCreate(function () {
        isDisposed = true;
      }));
    });
  };

  Enumerable.prototype.catchError = function () {
    var sources = this;
    return new AnonymousObservable(function (o) {
      var e = sources[$iterator$]();

      var isDisposed,
          subscription = new SerialDisposable();
      var cancelable = immediateScheduler.scheduleRecursiveWithState(null, function (lastException, self) {
        if (isDisposed) {
          return;
        }

        try {
          var currentItem = e.next();
        } catch (ex) {
          return observer.onError(ex);
        }

        if (currentItem.done) {
          if (lastException !== null) {
            o.onError(lastException);
          } else {
            o.onCompleted();
          }
          return;
        }

        // Check if promise
        var currentValue = currentItem.value;
        isPromise(currentValue) && (currentValue = observableFromPromise(currentValue));

        var d = new SingleAssignmentDisposable();
        subscription.setDisposable(d);
        d.setDisposable(currentValue.subscribe(function (x) {
          o.onNext(x);
        }, self, function () {
          o.onCompleted();
        }));
      });
      return new CompositeDisposable(subscription, cancelable, disposableCreate(function () {
        isDisposed = true;
      }));
    });
  };


  Enumerable.prototype.catchErrorWhen = function (notificationHandler) {
    var sources = this;
    return new AnonymousObservable(function (o) {
      var exceptions = new Subject(),
          notifier = new Subject(),
          handled = notificationHandler(exceptions),
          notificationDisposable = handled.subscribe(notifier);

      var e = sources[$iterator$]();

      var isDisposed,
          lastException,
          subscription = new SerialDisposable();
      var cancelable = immediateScheduler.scheduleRecursive(function (self) {
        if (isDisposed) {
          return;
        }

        try {
          var currentItem = e.next();
        } catch (ex) {
          return o.onError(ex);
        }

        if (currentItem.done) {
          if (lastException) {
            o.onError(lastException);
          } else {
            o.onCompleted();
          }
          return;
        }

        // Check if promise
        var currentValue = currentItem.value;
        isPromise(currentValue) && (currentValue = observableFromPromise(currentValue));

        var outer = new SingleAssignmentDisposable();
        var inner = new SingleAssignmentDisposable();
        subscription.setDisposable(new CompositeDisposable(inner, outer));
        outer.setDisposable(currentValue.subscribe(function (x) {
          o.onNext(x);
        }, function (exn) {
          inner.setDisposable(notifier.subscribe(self, function (ex) {
            o.onError(ex);
          }, function () {
            o.onCompleted();
          }));

          exceptions.onNext(exn);
        }, function () {
          o.onCompleted();
        }));
      });

      return new CompositeDisposable(notificationDisposable, subscription, cancelable, disposableCreate(function () {
        isDisposed = true;
      }));
    });
  };

  var enumerableRepeat = Enumerable.repeat = function (value, repeatCount) {
    if (repeatCount == null) {
      repeatCount = -1;
    }
    return new Enumerable(function () {
      var left = repeatCount;
      return new Enumerator(function () {
        if (left === 0) {
          return doneEnumerator;
        }
        if (left > 0) {
          left--;
        }
        return { done: false, value: value };
      });
    });
  };

  var enumerableOf = Enumerable.of = function (source, selector, thisArg) {
    if (selector) {
      var selectorFn = bindCallback(selector, thisArg, 3);
    }
    return new Enumerable(function () {
      var index = -1;
      return new Enumerator(function () {
        return ++index < source.length ? { done: false, value: !selector ? source[index] : selectorFn(source[index], index, source) } : doneEnumerator;
      });
    });
  };

  /**
   * Supports push-style iteration over an observable sequence.
   */
  var Observer = Rx.Observer = function () {};

  /**
   *  Creates an observer from the specified OnNext, along with optional OnError, and OnCompleted actions.
   * @param {Function} [onNext] Observer's OnNext action implementation.
   * @param {Function} [onError] Observer's OnError action implementation.
   * @param {Function} [onCompleted] Observer's OnCompleted action implementation.
   * @returns {Observer} The observer object implemented using the given actions.
   */
  var observerCreate = Observer.create = function (onNext, onError, onCompleted) {
    onNext || (onNext = noop);
    onError || (onError = defaultError);
    onCompleted || (onCompleted = noop);
    return new AnonymousObserver(onNext, onError, onCompleted);
  };

  /**
   * Abstract base class for implementations of the Observer class.
   * This base class enforces the grammar of observers where OnError and OnCompleted are terminal messages.
   */
  var AbstractObserver = Rx.internals.AbstractObserver = (function (__super__) {
    inherits(AbstractObserver, __super__);

    /**
     * Creates a new observer in a non-stopped state.
     */
    function AbstractObserver() {
      this.isStopped = false;
      __super__.call(this);
    }

    /**
     * Notifies the observer of a new element in the sequence.
     * @param {Any} value Next element in the sequence.
     */
    AbstractObserver.prototype.onNext = function (value) {
      if (!this.isStopped) {
        this.next(value);
      }
    };

    /**
     * Notifies the observer that an exception has occurred.
     * @param {Any} error The error that has occurred.
     */
    AbstractObserver.prototype.onError = function (error) {
      if (!this.isStopped) {
        this.isStopped = true;
        this.error(error);
      }
    };

    /**
     * Notifies the observer of the end of the sequence.
     */
    AbstractObserver.prototype.onCompleted = function () {
      if (!this.isStopped) {
        this.isStopped = true;
        this.completed();
      }
    };

    /**
     * Disposes the observer, causing it to transition to the stopped state.
     */
    AbstractObserver.prototype.dispose = function () {
      this.isStopped = true;
    };

    AbstractObserver.prototype.fail = function (e) {
      if (!this.isStopped) {
        this.isStopped = true;
        this.error(e);
        return true;
      }

      return false;
    };

    return AbstractObserver;
  })(Observer);

  /**
   * Class to create an Observer instance from delegate-based implementations of the on* methods.
   */
  var AnonymousObserver = Rx.AnonymousObserver = (function (__super__) {
    inherits(AnonymousObserver, __super__);

    /**
     * Creates an observer from the specified OnNext, OnError, and OnCompleted actions.
     * @param {Any} onNext Observer's OnNext action implementation.
     * @param {Any} onError Observer's OnError action implementation.
     * @param {Any} onCompleted Observer's OnCompleted action implementation.
     */
    function AnonymousObserver(onNext, onError, onCompleted) {
      __super__.call(this);
      this._onNext = onNext;
      this._onError = onError;
      this._onCompleted = onCompleted;
    }

    /**
     * Calls the onNext action.
     * @param {Any} value Next element in the sequence.
     */
    AnonymousObserver.prototype.next = function (value) {
      this._onNext(value);
    };

    /**
     * Calls the onError action.
     * @param {Any} error The error that has occurred.
     */
    AnonymousObserver.prototype.error = function (error) {
      this._onError(error);
    };

    /**
     *  Calls the onCompleted action.
     */
    AnonymousObserver.prototype.completed = function () {
      this._onCompleted();
    };

    return AnonymousObserver;
  })(AbstractObserver);

  var observableProto;

  /**
   * Represents a push-style collection.
   */
  var Observable = Rx.Observable = (function () {
    function Observable(subscribe) {
      if (Rx.config.longStackSupport && hasStacks) {
        try {
          throw new Error();
        } catch (e) {
          this.stack = e.stack.substring(e.stack.indexOf("\n") + 1);
        }

        var self = this;
        this._subscribe = function (observer) {
          var oldOnError = observer.onError.bind(observer);

          observer.onError = function (err) {
            makeStackTraceLong(err, self);
            oldOnError(err);
          };

          return subscribe.call(self, observer);
        };
      } else {
        this._subscribe = subscribe;
      }
    }

    observableProto = Observable.prototype;

    /**
     *  Subscribes an observer to the observable sequence.
     *  @param {Mixed} [observerOrOnNext] The object that is to receive notifications or an action to invoke for each element in the observable sequence.
     *  @param {Function} [onError] Action to invoke upon exceptional termination of the observable sequence.
     *  @param {Function} [onCompleted] Action to invoke upon graceful termination of the observable sequence.
     *  @returns {Diposable} A disposable handling the subscriptions and unsubscriptions.
     */
    observableProto.subscribe = observableProto.forEach = function (observerOrOnNext, onError, onCompleted) {
      return this._subscribe(typeof observerOrOnNext === "object" ? observerOrOnNext : observerCreate(observerOrOnNext, onError, onCompleted));
    };

    /**
     * Subscribes to the next value in the sequence with an optional "this" argument.
     * @param {Function} onNext The function to invoke on each element in the observable sequence.
     * @param {Any} [thisArg] Object to use as this when executing callback.
     * @returns {Disposable} A disposable handling the subscriptions and unsubscriptions.
     */
    observableProto.subscribeOnNext = function (onNext, thisArg) {
      return this._subscribe(observerCreate(typeof thisArg !== "undefined" ? function (x) {
        onNext.call(thisArg, x);
      } : onNext));
    };

    /**
     * Subscribes to an exceptional condition in the sequence with an optional "this" argument.
     * @param {Function} onError The function to invoke upon exceptional termination of the observable sequence.
     * @param {Any} [thisArg] Object to use as this when executing callback.
     * @returns {Disposable} A disposable handling the subscriptions and unsubscriptions.
     */
    observableProto.subscribeOnError = function (onError, thisArg) {
      return this._subscribe(observerCreate(null, typeof thisArg !== "undefined" ? function (e) {
        onError.call(thisArg, e);
      } : onError));
    };

    /**
     * Subscribes to the next value in the sequence with an optional "this" argument.
     * @param {Function} onCompleted The function to invoke upon graceful termination of the observable sequence.
     * @param {Any} [thisArg] Object to use as this when executing callback.
     * @returns {Disposable} A disposable handling the subscriptions and unsubscriptions.
     */
    observableProto.subscribeOnCompleted = function (onCompleted, thisArg) {
      return this._subscribe(observerCreate(null, null, typeof thisArg !== "undefined" ? function () {
        onCompleted.call(thisArg);
      } : onCompleted));
    };

    return Observable;
  })();

  var ScheduledObserver = Rx.internals.ScheduledObserver = (function (__super__) {
    inherits(ScheduledObserver, __super__);

    function ScheduledObserver(scheduler, observer) {
      __super__.call(this);
      this.scheduler = scheduler;
      this.observer = observer;
      this.isAcquired = false;
      this.hasFaulted = false;
      this.queue = [];
      this.disposable = new SerialDisposable();
    }

    ScheduledObserver.prototype.next = function (value) {
      var self = this;
      this.queue.push(function () {
        self.observer.onNext(value);
      });
    };

    ScheduledObserver.prototype.error = function (e) {
      var self = this;
      this.queue.push(function () {
        self.observer.onError(e);
      });
    };

    ScheduledObserver.prototype.completed = function () {
      var self = this;
      this.queue.push(function () {
        self.observer.onCompleted();
      });
    };

    ScheduledObserver.prototype.ensureActive = function () {
      var isOwner = false,
          parent = this;
      if (!this.hasFaulted && this.queue.length > 0) {
        isOwner = !this.isAcquired;
        this.isAcquired = true;
      }
      if (isOwner) {
        this.disposable.setDisposable(this.scheduler.scheduleRecursive(function (self) {
          var work;
          if (parent.queue.length > 0) {
            work = parent.queue.shift();
          } else {
            parent.isAcquired = false;
            return;
          }
          try {
            work();
          } catch (ex) {
            parent.queue = [];
            parent.hasFaulted = true;
            throw ex;
          }
          self();
        }));
      }
    };

    ScheduledObserver.prototype.dispose = function () {
      __super__.prototype.dispose.call(this);
      this.disposable.dispose();
    };

    return ScheduledObserver;
  })(AbstractObserver);

  var ObservableBase = Rx.ObservableBase = (function (__super__) {
    inherits(ObservableBase, __super__);

    // Fix subscriber to check for undefined or function returned to decorate as Disposable
    function fixSubscriber(subscriber) {
      if (subscriber && typeof subscriber.dispose === "function") {
        return subscriber;
      }

      return typeof subscriber === "function" ? disposableCreate(subscriber) : disposableEmpty;
    }

    function setDisposable(s, state) {
      var ado = state[0],
          self = state[1];
      try {
        ado.setDisposable(fixSubscriber(self.subscribeCore(ado)));
      } catch (e) {
        if (!ado.fail(e)) {
          throw e;
        }
      }
    }

    function subscribe(observer) {
      var ado = new AutoDetachObserver(observer),
          state = [ado, this];

      if (currentThreadScheduler.scheduleRequired()) {
        currentThreadScheduler.scheduleWithState(state, setDisposable);
      } else {
        setDisposable(null, state);
      }

      return ado;
    }

    function ObservableBase() {
      __super__.call(this, subscribe);
    }

    ObservableBase.prototype.subscribeCore = function (observer) {
      throw new Error("Not implemeneted");
    };

    return ObservableBase;
  })(Observable);

  /**
   * Creates an array from an observable sequence.
   * @returns {Observable} An observable sequence containing a single element with a list containing all the elements of the source sequence.
   */
  observableProto.toArray = function () {
    var source = this;
    return new AnonymousObservable(function (observer) {
      var arr = [];
      return source.subscribe(function (x) {
        arr.push(x);
      }, function (e) {
        observer.onError(e);
      }, function () {
        observer.onNext(arr);
        observer.onCompleted();
      });
    }, source);
  };

  /**
   *  Creates an observable sequence from a specified subscribe method implementation.
   * @example
   *  var res = Rx.Observable.create(function (observer) { return function () { } );
   *  var res = Rx.Observable.create(function (observer) { return Rx.Disposable.empty; } );
   *  var res = Rx.Observable.create(function (observer) { } );
   * @param {Function} subscribe Implementation of the resulting observable sequence's subscribe method, returning a function that will be wrapped in a Disposable.
   * @returns {Observable} The observable sequence with the specified implementation for the Subscribe method.
   */
  Observable.create = Observable.createWithDisposable = function (subscribe, parent) {
    return new AnonymousObservable(subscribe, parent);
  };

  /**
   *  Returns an observable sequence that invokes the specified factory function whenever a new observer subscribes.
   *
   * @example
   *  var res = Rx.Observable.defer(function () { return Rx.Observable.fromArray([1,2,3]); });
   * @param {Function} observableFactory Observable factory function to invoke for each observer that subscribes to the resulting sequence or Promise.
   * @returns {Observable} An observable sequence whose observers trigger an invocation of the given observable factory function.
   */
  var observableDefer = Observable.defer = function (observableFactory) {
    return new AnonymousObservable(function (observer) {
      var result;
      try {
        result = observableFactory();
      } catch (e) {
        return observableThrow(e).subscribe(observer);
      }
      isPromise(result) && (result = observableFromPromise(result));
      return result.subscribe(observer);
    });
  };

  /**
   *  Returns an empty observable sequence, using the specified scheduler to send out the single OnCompleted message.
   *
   * @example
   *  var res = Rx.Observable.empty();
   *  var res = Rx.Observable.empty(Rx.Scheduler.timeout);
   * @param {Scheduler} [scheduler] Scheduler to send the termination call on.
   * @returns {Observable} An observable sequence with no elements.
   */
  var observableEmpty = Observable.empty = function (scheduler) {
    isScheduler(scheduler) || (scheduler = immediateScheduler);
    return new AnonymousObservable(function (observer) {
      return scheduler.schedule(function () {
        observer.onCompleted();
      });
    });
  };

  var maxSafeInteger = Math.pow(2, 53) - 1;

  function StringIterable(str) {
    this._s = s;
  }

  StringIterable.prototype[$iterator$] = function () {
    return new StringIterator(this._s);
  };

  function StringIterator(str) {
    this._s = s;
    this._l = s.length;
    this._i = 0;
  }

  StringIterator.prototype[$iterator$] = function () {
    return this;
  };

  StringIterator.prototype.next = function () {
    if (this._i < this._l) {
      var val = this._s.charAt(this._i++);
      return { done: false, value: val };
    } else {
      return doneEnumerator;
    }
  };

  function ArrayIterable(a) {
    this._a = a;
  }

  ArrayIterable.prototype[$iterator$] = function () {
    return new ArrayIterator(this._a);
  };

  function ArrayIterator(a) {
    this._a = a;
    this._l = toLength(a);
    this._i = 0;
  }

  ArrayIterator.prototype[$iterator$] = function () {
    return this;
  };

  ArrayIterator.prototype.next = function () {
    if (this._i < this._l) {
      var val = this._a[this._i++];
      return { done: false, value: val };
    } else {
      return doneEnumerator;
    }
  };

  function numberIsFinite(value) {
    return typeof value === "number" && root.isFinite(value);
  }

  function isNan(n) {
    return n !== n;
  }

  function getIterable(o) {
    var i = o[$iterator$],
        it;
    if (!i && typeof o === "string") {
      it = new StringIterable(o);
      return it[$iterator$]();
    }
    if (!i && o.length !== undefined) {
      it = new ArrayIterable(o);
      return it[$iterator$]();
    }
    if (!i) {
      throw new TypeError("Object is not iterable");
    }
    return o[$iterator$]();
  }

  function sign(value) {
    var number = +value;
    if (number === 0) {
      return number;
    }
    if (isNaN(number)) {
      return number;
    }
    return number < 0 ? -1 : 1;
  }

  function toLength(o) {
    var len = +o.length;
    if (isNaN(len)) {
      return 0;
    }
    if (len === 0 || !numberIsFinite(len)) {
      return len;
    }
    len = sign(len) * Math.floor(Math.abs(len));
    if (len <= 0) {
      return 0;
    }
    if (len > maxSafeInteger) {
      return maxSafeInteger;
    }
    return len;
  }

  /**
   * This method creates a new Observable sequence from an array-like or iterable object.
   * @param {Any} arrayLike An array-like or iterable object to convert to an Observable sequence.
   * @param {Function} [mapFn] Map function to call on every element of the array.
   * @param {Any} [thisArg] The context to use calling the mapFn if provided.
   * @param {Scheduler} [scheduler] Optional scheduler to use for scheduling.  If not provided, defaults to Scheduler.currentThread.
   */
  var observableFrom = Observable.from = function (iterable, mapFn, thisArg, scheduler) {
    if (iterable == null) {
      throw new Error("iterable cannot be null.");
    }
    if (mapFn && !isFunction(mapFn)) {
      throw new Error("mapFn when provided must be a function");
    }
    if (mapFn) {
      var mapper = bindCallback(mapFn, thisArg, 2);
    }
    isScheduler(scheduler) || (scheduler = currentThreadScheduler);
    var list = Object(iterable),
        it = getIterable(list);
    return new AnonymousObservable(function (observer) {
      return scheduler.scheduleRecursiveWithState(0, function (i, self) {
        try {
          var next = it.next();
        } catch (e) {
          observer.onError(e);
          return;
        }
        if (next.done) {
          observer.onCompleted();
          return;
        }

        var result = next.value;

        if (mapper) {
          try {
            result = mapper(result, i);
          } catch (e) {
            observer.onError(e);
            return;
          }
        }

        observer.onNext(result);
        self(i + 1);
      });
    });
  };

  var FromArrayObservable = (function (__super__) {
    inherits(FromArrayObservable, __super__);
    function FromArrayObservable(args, scheduler) {
      this.args = args;
      this.scheduler = scheduler || currentThreadScheduler;
      __super__.call(this);
    }

    FromArrayObservable.prototype.subscribeCore = function (observer) {
      var sink = new FromArraySink(observer, this);
      return sink.run();
    };

    return FromArrayObservable;
  })(ObservableBase);

  var FromArraySink = (function () {
    function FromArraySink(observer, parent) {
      this.observer = observer;
      this.parent = parent;
    }

    function loopRecursive(state, recurse) {
      if (state.i < state.len) {
        state.observer.onNext(state.args[state.i++]);
        recurse(state);
      } else {
        state.observer.onCompleted();
      }
    }

    FromArraySink.prototype.run = function () {
      return this.parent.scheduler.scheduleRecursiveWithState({ i: 0, args: this.parent.args, len: this.parent.args.length, observer: this.observer }, loopRecursive);
    };

    return FromArraySink;
  })();

  /**
  *  Converts an array to an observable sequence, using an optional scheduler to enumerate the array.
  * @deprecated use Observable.from or Observable.of
  * @param {Scheduler} [scheduler] Scheduler to run the enumeration of the input sequence on.
  * @returns {Observable} The observable sequence whose elements are pulled from the given enumerable sequence.
  */
  var observableFromArray = Observable.fromArray = function (array, scheduler) {
    return new FromArrayObservable(array, scheduler);
  };

  /**
   *  Returns a non-terminating observable sequence, which can be used to denote an infinite duration (e.g. when using reactive joins).
   * @returns {Observable} An observable sequence whose observers will never get called.
   */
  var observableNever = Observable.never = function () {
    return new AnonymousObservable(function () {
      return disposableEmpty;
    });
  };

  function observableOf(scheduler, array) {
    isScheduler(scheduler) || (scheduler = currentThreadScheduler);
    return new AnonymousObservable(function (observer) {
      var count = 0,
          len = array.length;
      return scheduler.scheduleRecursive(function (self) {
        if (count < len) {
          observer.onNext(array[count++]);
          self();
        } else {
          observer.onCompleted();
        }
      });
    });
  }

  /**
   *  This method creates a new Observable instance with a variable number of arguments, regardless of number or type of the arguments.
   * @returns {Observable} The observable sequence whose elements are pulled from the given arguments.
   */
  Observable.of = function () {
    for (var args = [], i = 0, len = arguments.length; i < len; i++) {
      args.push(arguments[i]);
    }
    return observableOf(null, args);
  };

  /**
   *  This method creates a new Observable instance with a variable number of arguments, regardless of number or type of the arguments.
   * @param {Scheduler} scheduler A scheduler to use for scheduling the arguments.
   * @returns {Observable} The observable sequence whose elements are pulled from the given arguments.
   */
  Observable.ofWithScheduler = function (scheduler) {
    for (var args = [], i = 1, len = arguments.length; i < len; i++) {
      args.push(arguments[i]);
    }
    return observableOf(scheduler, args);
  };

  /**
   * Convert an object into an observable sequence of [key, value] pairs.
   * @param {Object} obj The object to inspect.
   * @param {Scheduler} [scheduler] Scheduler to run the enumeration of the input sequence on.
   * @returns {Observable} An observable sequence of [key, value] pairs from the object.
   */
  Observable.pairs = function (obj, scheduler) {
    scheduler || (scheduler = Rx.Scheduler.currentThread);
    return new AnonymousObservable(function (observer) {
      var keys = Object.keys(obj),
          len = keys.length;
      return scheduler.scheduleRecursiveWithState(0, function (idx, self) {
        if (idx < len) {
          var key = keys[idx];
          observer.onNext([key, obj[key]]);
          self(idx + 1);
        } else {
          observer.onCompleted();
        }
      });
    });
  };

  /**
   *  Generates an observable sequence of integral numbers within a specified range, using the specified scheduler to send out observer messages.
   *
   * @example
   *  var res = Rx.Observable.range(0, 10);
   *  var res = Rx.Observable.range(0, 10, Rx.Scheduler.timeout);
   * @param {Number} start The value of the first integer in the sequence.
   * @param {Number} count The number of sequential integers to generate.
   * @param {Scheduler} [scheduler] Scheduler to run the generator loop on. If not specified, defaults to Scheduler.currentThread.
   * @returns {Observable} An observable sequence that contains a range of sequential integral numbers.
   */
  Observable.range = function (start, count, scheduler) {
    isScheduler(scheduler) || (scheduler = currentThreadScheduler);
    return new AnonymousObservable(function (observer) {
      return scheduler.scheduleRecursiveWithState(0, function (i, self) {
        if (i < count) {
          observer.onNext(start + i);
          self(i + 1);
        } else {
          observer.onCompleted();
        }
      });
    });
  };

  /**
   *  Generates an observable sequence that repeats the given element the specified number of times, using the specified scheduler to send out observer messages.
   *
   * @example
   *  var res = Rx.Observable.repeat(42);
   *  var res = Rx.Observable.repeat(42, 4);
   *  3 - res = Rx.Observable.repeat(42, 4, Rx.Scheduler.timeout);
   *  4 - res = Rx.Observable.repeat(42, null, Rx.Scheduler.timeout);
   * @param {Mixed} value Element to repeat.
   * @param {Number} repeatCount [Optiona] Number of times to repeat the element. If not specified, repeats indefinitely.
   * @param {Scheduler} scheduler Scheduler to run the producer loop on. If not specified, defaults to Scheduler.immediate.
   * @returns {Observable} An observable sequence that repeats the given element the specified number of times.
   */
  Observable.repeat = function (value, repeatCount, scheduler) {
    isScheduler(scheduler) || (scheduler = currentThreadScheduler);
    return observableReturn(value, scheduler).repeat(repeatCount == null ? -1 : repeatCount);
  };

  /**
   *  Returns an observable sequence that contains a single element, using the specified scheduler to send out observer messages.
   *  There is an alias called 'just', and 'returnValue' for browsers <IE9.
   * @param {Mixed} value Single element in the resulting observable sequence.
   * @param {Scheduler} scheduler Scheduler to send the single element on. If not specified, defaults to Scheduler.immediate.
   * @returns {Observable} An observable sequence containing the single specified element.
   */
  var observableReturn = Observable["return"] = Observable.just = function (value, scheduler) {
    isScheduler(scheduler) || (scheduler = immediateScheduler);
    return new AnonymousObservable(function (observer) {
      return scheduler.schedule(function () {
        observer.onNext(value);
        observer.onCompleted();
      });
    });
  };

  /** @deprecated use return or just */
  Observable.returnValue = function () {
    //deprecate('returnValue', 'return or just');
    return observableReturn.apply(null, arguments);
  };

  /**
   *  Returns an observable sequence that terminates with an exception, using the specified scheduler to send out the single onError message.
   *  There is an alias to this method called 'throwError' for browsers <IE9.
   * @param {Mixed} error An object used for the sequence's termination.
   * @param {Scheduler} scheduler Scheduler to send the exceptional termination call on. If not specified, defaults to Scheduler.immediate.
   * @returns {Observable} The observable sequence that terminates exceptionally with the specified exception object.
   */
  var observableThrow = Observable["throw"] = Observable.throwError = function (error, scheduler) {
    isScheduler(scheduler) || (scheduler = immediateScheduler);
    return new AnonymousObservable(function (observer) {
      return scheduler.schedule(function () {
        observer.onError(error);
      });
    });
  };

  /** @deprecated use #some instead */
  Observable.throwException = function () {
    //deprecate('throwException', 'throwError');
    return Observable.throwError.apply(null, arguments);
  };

  function observableCatchHandler(source, handler) {
    return new AnonymousObservable(function (observer) {
      var d1 = new SingleAssignmentDisposable(),
          subscription = new SerialDisposable();
      subscription.setDisposable(d1);
      d1.setDisposable(source.subscribe(observer.onNext.bind(observer), function (exception) {
        var d, result;
        try {
          result = handler(exception);
        } catch (ex) {
          observer.onError(ex);
          return;
        }
        isPromise(result) && (result = observableFromPromise(result));

        d = new SingleAssignmentDisposable();
        subscription.setDisposable(d);
        d.setDisposable(result.subscribe(observer));
      }, observer.onCompleted.bind(observer)));

      return subscription;
    }, source);
  }

  /**
   * Continues an observable sequence that is terminated by an exception with the next observable sequence.
   * @example
   * 1 - xs.catchException(ys)
   * 2 - xs.catchException(function (ex) { return ys(ex); })
   * @param {Mixed} handlerOrSecond Exception handler function that returns an observable sequence given the error that occurred in the first sequence, or a second observable sequence used to produce results when an error occurred in the first sequence.
   * @returns {Observable} An observable sequence containing the first sequence's elements, followed by the elements of the handler sequence in case an exception occurred.
   */
  observableProto["catch"] = observableProto.catchError = function (handlerOrSecond) {
    return typeof handlerOrSecond === "function" ? observableCatchHandler(this, handlerOrSecond) : observableCatch([this, handlerOrSecond]);
  };

  /**
   * @deprecated use #catch or #catchError instead.
   */
  observableProto.catchException = function (handlerOrSecond) {
    //deprecate('catchException', 'catch or catchError');
    return this.catchError(handlerOrSecond);
  };

  /**
   * Continues an observable sequence that is terminated by an exception with the next observable sequence.
   * @param {Array | Arguments} args Arguments or an array to use as the next sequence if an error occurs.
   * @returns {Observable} An observable sequence containing elements from consecutive source sequences until a source sequence terminates successfully.
   */
  var observableCatch = Observable.catchError = Observable["catch"] = Observable.catchException = function () {
    var items = [];
    if (Array.isArray(arguments[0])) {
      items = arguments[0];
    } else {
      for (var i = 0, len = arguments.length; i < len; i++) {
        items.push(arguments[i]);
      }
    }
    return enumerableOf(items).catchError();
  };

  /**
   * Merges the specified observable sequences into one observable sequence by using the selector function whenever any of the observable sequences or Promises produces an element.
   * This can be in the form of an argument list of observables or an array.
   *
   * @example
   * 1 - obs = observable.combineLatest(obs1, obs2, obs3, function (o1, o2, o3) { return o1 + o2 + o3; });
   * 2 - obs = observable.combineLatest([obs1, obs2, obs3], function (o1, o2, o3) { return o1 + o2 + o3; });
   * @returns {Observable} An observable sequence containing the result of combining elements of the sources using the specified result selector function.
   */
  observableProto.combineLatest = function () {
    for (var args = [], i = 0, len = arguments.length; i < len; i++) {
      args.push(arguments[i]);
    }
    if (Array.isArray(args[0])) {
      args[0].unshift(this);
    } else {
      args.unshift(this);
    }
    return combineLatest.apply(this, args);
  };

  /**
   * Merges the specified observable sequences into one observable sequence by using the selector function whenever any of the observable sequences or Promises produces an element.
   *
   * @example
   * 1 - obs = Rx.Observable.combineLatest(obs1, obs2, obs3, function (o1, o2, o3) { return o1 + o2 + o3; });
   * 2 - obs = Rx.Observable.combineLatest([obs1, obs2, obs3], function (o1, o2, o3) { return o1 + o2 + o3; });
   * @returns {Observable} An observable sequence containing the result of combining elements of the sources using the specified result selector function.
   */
  var combineLatest = Observable.combineLatest = function () {
    for (var args = [], i = 0, len = arguments.length; i < len; i++) {
      args.push(arguments[i]);
    }
    var resultSelector = args.pop();

    if (Array.isArray(args[0])) {
      args = args[0];
    }

    return new AnonymousObservable(function (observer) {
      var falseFactory = function () {
        return false;
      },
          n = args.length,
          hasValue = arrayInitialize(n, falseFactory),
          hasValueAll = false,
          isDone = arrayInitialize(n, falseFactory),
          values = new Array(n);

      function next(i) {
        var res;
        hasValue[i] = true;
        if (hasValueAll || (hasValueAll = hasValue.every(identity))) {
          try {
            res = resultSelector.apply(null, values);
          } catch (ex) {
            observer.onError(ex);
            return;
          }
          observer.onNext(res);
        } else if (isDone.filter(function (x, j) {
          return j !== i;
        }).every(identity)) {
          observer.onCompleted();
        }
      }

      function done(i) {
        isDone[i] = true;
        if (isDone.every(identity)) {
          observer.onCompleted();
        }
      }

      var subscriptions = new Array(n);
      for (var idx = 0; idx < n; idx++) {
        (function (i) {
          var source = args[i],
              sad = new SingleAssignmentDisposable();
          isPromise(source) && (source = observableFromPromise(source));
          sad.setDisposable(source.subscribe(function (x) {
            values[i] = x;
            next(i);
          }, function (e) {
            observer.onError(e);
          }, function () {
            done(i);
          }));
          subscriptions[i] = sad;
        })(idx);
      }

      return new CompositeDisposable(subscriptions);
    }, this);
  };

  /**
   * Concatenates all the observable sequences.  This takes in either an array or variable arguments to concatenate.
   * @returns {Observable} An observable sequence that contains the elements of each given sequence, in sequential order.
   */
  observableProto.concat = function () {
    for (var args = [], i = 0, len = arguments.length; i < len; i++) {
      args.push(arguments[i]);
    }
    args.unshift(this);
    return observableConcat.apply(null, args);
  };

  /**
   * Concatenates all the observable sequences.
   * @param {Array | Arguments} args Arguments or an array to concat to the observable sequence.
   * @returns {Observable} An observable sequence that contains the elements of each given sequence, in sequential order.
   */
  var observableConcat = Observable.concat = function () {
    var items = [];
    if (Array.isArray(arguments[0])) {
      items = arguments[0];
    } else {
      for (var i = 0, len = arguments.length; i < len; i++) {
        items.push(arguments[i]);
      }
    }
    return enumerableOf(items).concat();
  };

  /**
   * Concatenates an observable sequence of observable sequences.
   * @returns {Observable} An observable sequence that contains the elements of each observed inner sequence, in sequential order.
   */
  observableProto.concatAll = observableProto.concatObservable = function () {
    return this.merge(1);
  };

  /**
   * Merges an observable sequence of observable sequences into an observable sequence, limiting the number of concurrent subscriptions to inner sequences.
   * Or merges two observable sequences into a single observable sequence.
   *
   * @example
   * 1 - merged = sources.merge(1);
   * 2 - merged = source.merge(otherSource);
   * @param {Mixed} [maxConcurrentOrOther] Maximum number of inner observable sequences being subscribed to concurrently or the second observable sequence.
   * @returns {Observable} The observable sequence that merges the elements of the inner sequences.
   */
  observableProto.merge = function (maxConcurrentOrOther) {
    if (typeof maxConcurrentOrOther !== "number") {
      return observableMerge(this, maxConcurrentOrOther);
    }
    var sources = this;
    return new AnonymousObservable(function (o) {
      var activeCount = 0,
          group = new CompositeDisposable(),
          isStopped = false,
          q = [];

      function subscribe(xs) {
        var subscription = new SingleAssignmentDisposable();
        group.add(subscription);

        // Check for promises support
        isPromise(xs) && (xs = observableFromPromise(xs));

        subscription.setDisposable(xs.subscribe(function (x) {
          o.onNext(x);
        }, function (e) {
          o.onError(e);
        }, function () {
          group.remove(subscription);
          if (q.length > 0) {
            subscribe(q.shift());
          } else {
            activeCount--;
            isStopped && activeCount === 0 && o.onCompleted();
          }
        }));
      }
      group.add(sources.subscribe(function (innerSource) {
        if (activeCount < maxConcurrentOrOther) {
          activeCount++;
          subscribe(innerSource);
        } else {
          q.push(innerSource);
        }
      }, function (e) {
        o.onError(e);
      }, function () {
        isStopped = true;
        activeCount === 0 && o.onCompleted();
      }));
      return group;
    }, sources);
  };

  /**
   * Merges all the observable sequences into a single observable sequence.
   * The scheduler is optional and if not specified, the immediate scheduler is used.
   * @returns {Observable} The observable sequence that merges the elements of the observable sequences.
   */
  var observableMerge = Observable.merge = function () {
    var scheduler,
        sources = [],
        i,
        len = arguments.length;
    if (!arguments[0]) {
      scheduler = immediateScheduler;
      for (i = 1; i < len; i++) {
        sources.push(arguments[i]);
      }
    } else if (isScheduler(arguments[0])) {
      scheduler = arguments[0];
      for (i = 1; i < len; i++) {
        sources.push(arguments[i]);
      }
    } else {
      scheduler = immediateScheduler;
      for (i = 0; i < len; i++) {
        sources.push(arguments[i]);
      }
    }
    if (Array.isArray(sources[0])) {
      sources = sources[0];
    }
    return observableOf(scheduler, sources).mergeAll();
  };

  /**
   * Merges an observable sequence of observable sequences into an observable sequence.
   * @returns {Observable} The observable sequence that merges the elements of the inner sequences.
   */
  observableProto.mergeAll = function () {
    var sources = this;
    return new AnonymousObservable(function (o) {
      var group = new CompositeDisposable(),
          isStopped = false,
          m = new SingleAssignmentDisposable();

      group.add(m);
      m.setDisposable(sources.subscribe(function (innerSource) {
        var innerSubscription = new SingleAssignmentDisposable();
        group.add(innerSubscription);

        // Check for promises support
        isPromise(innerSource) && (innerSource = observableFromPromise(innerSource));

        innerSubscription.setDisposable(innerSource.subscribe(function (x) {
          o.onNext(x);
        }, function (e) {
          o.onError(e);
        }, function () {
          group.remove(innerSubscription);
          isStopped && group.length === 1 && o.onCompleted();
        }));
      }, function (e) {
        o.onError(e);
      }, function () {
        isStopped = true;
        group.length === 1 && o.onCompleted();
      }));
      return group;
    }, sources);
  };

  /**
   * @deprecated use #mergeAll instead.
   */
  observableProto.mergeObservable = function () {
    //deprecate('mergeObservable', 'mergeAll');
    return this.mergeAll.apply(this, arguments);
  };

  /**
   * Returns the values from the source observable sequence only after the other observable sequence produces a value.
   * @param {Observable | Promise} other The observable sequence or Promise that triggers propagation of elements of the source sequence.
   * @returns {Observable} An observable sequence containing the elements of the source sequence starting from the point the other sequence triggered propagation.
   */
  observableProto.skipUntil = function (other) {
    var source = this;
    return new AnonymousObservable(function (o) {
      var isOpen = false;
      var disposables = new CompositeDisposable(source.subscribe(function (left) {
        isOpen && o.onNext(left);
      }, function (e) {
        o.onError(e);
      }, function () {
        isOpen && o.onCompleted();
      }));

      isPromise(other) && (other = observableFromPromise(other));

      var rightSubscription = new SingleAssignmentDisposable();
      disposables.add(rightSubscription);
      rightSubscription.setDisposable(other.subscribe(function () {
        isOpen = true;
        rightSubscription.dispose();
      }, function (e) {
        o.onError(e);
      }, function () {
        rightSubscription.dispose();
      }));

      return disposables;
    }, source);
  };

  /**
   * Transforms an observable sequence of observable sequences into an observable sequence producing values only from the most recent observable sequence.
   * @returns {Observable} The observable sequence that at any point in time produces the elements of the most recent inner observable sequence that has been received.
   */
  observableProto["switch"] = observableProto.switchLatest = function () {
    var sources = this;
    return new AnonymousObservable(function (observer) {
      var hasLatest = false,
          innerSubscription = new SerialDisposable(),
          isStopped = false,
          latest = 0,
          subscription = sources.subscribe(function (innerSource) {
        var d = new SingleAssignmentDisposable(),
            id = ++latest;
        hasLatest = true;
        innerSubscription.setDisposable(d);

        // Check if Promise or Observable
        isPromise(innerSource) && (innerSource = observableFromPromise(innerSource));

        d.setDisposable(innerSource.subscribe(function (x) {
          latest === id && observer.onNext(x);
        }, function (e) {
          latest === id && observer.onError(e);
        }, function () {
          if (latest === id) {
            hasLatest = false;
            isStopped && observer.onCompleted();
          }
        }));
      }, function (e) {
        observer.onError(e);
      }, function () {
        isStopped = true;
        !hasLatest && observer.onCompleted();
      });
      return new CompositeDisposable(subscription, innerSubscription);
    }, sources);
  };

  /**
   * Returns the values from the source observable sequence until the other observable sequence produces a value.
   * @param {Observable | Promise} other Observable sequence or Promise that terminates propagation of elements of the source sequence.
   * @returns {Observable} An observable sequence containing the elements of the source sequence up to the point the other sequence interrupted further propagation.
   */
  observableProto.takeUntil = function (other) {
    var source = this;
    return new AnonymousObservable(function (o) {
      isPromise(other) && (other = observableFromPromise(other));
      return new CompositeDisposable(source.subscribe(o), other.subscribe(function () {
        o.onCompleted();
      }, function (e) {
        o.onError(e);
      }, noop));
    }, source);
  };

  /**
   * Merges the specified observable sequences into one observable sequence by using the selector function only when the (first) source observable sequence produces an element.
   *
   * @example
   * 1 - obs = obs1.withLatestFrom(obs2, obs3, function (o1, o2, o3) { return o1 + o2 + o3; });
   * 2 - obs = obs1.withLatestFrom([obs2, obs3], function (o1, o2, o3) { return o1 + o2 + o3; });
   * @returns {Observable} An observable sequence containing the result of combining elements of the sources using the specified result selector function.
   */
  observableProto.withLatestFrom = function () {
    for (var args = [], i = 0, len = arguments.length; i < len; i++) {
      args.push(arguments[i]);
    }
    var resultSelector = args.pop(),
        source = this;

    if (typeof source === "undefined") {
      throw new Error("Source observable not found for withLatestFrom().");
    }
    if (typeof resultSelector !== "function") {
      throw new Error("withLatestFrom() expects a resultSelector function.");
    }
    if (Array.isArray(args[0])) {
      args = args[0];
    }

    return new AnonymousObservable(function (observer) {
      var falseFactory = function () {
        return false;
      },
          n = args.length,
          hasValue = arrayInitialize(n, falseFactory),
          hasValueAll = false,
          values = new Array(n);

      var subscriptions = new Array(n + 1);
      for (var idx = 0; idx < n; idx++) {
        (function (i) {
          var other = args[i],
              sad = new SingleAssignmentDisposable();
          isPromise(other) && (other = observableFromPromise(other));
          sad.setDisposable(other.subscribe(function (x) {
            values[i] = x;
            hasValue[i] = true;
            hasValueAll = hasValue.every(identity);
          }, observer.onError.bind(observer), function () {}));
          subscriptions[i] = sad;
        })(idx);
      }

      var sad = new SingleAssignmentDisposable();
      sad.setDisposable(source.subscribe(function (x) {
        var res;
        var allValues = [x].concat(values);
        if (!hasValueAll) return;
        try {
          res = resultSelector.apply(null, allValues);
        } catch (ex) {
          observer.onError(ex);
          return;
        }
        observer.onNext(res);
      }, observer.onError.bind(observer), function () {
        observer.onCompleted();
      }));
      subscriptions[n] = sad;

      return new CompositeDisposable(subscriptions);
    }, this);
  };

  function zipArray(second, resultSelector) {
    var first = this;
    return new AnonymousObservable(function (observer) {
      var index = 0,
          len = second.length;
      return first.subscribe(function (left) {
        if (index < len) {
          var right = second[index++],
              result;
          try {
            result = resultSelector(left, right);
          } catch (e) {
            return observer.onError(e);
          }
          observer.onNext(result);
        } else {
          observer.onCompleted();
        }
      }, function (e) {
        observer.onError(e);
      }, function () {
        observer.onCompleted();
      });
    }, first);
  }

  function falseFactory() {
    return false;
  }
  function emptyArrayFactory() {
    return [];
  }

  /**
   * Merges the specified observable sequences into one observable sequence by using the selector function whenever all of the observable sequences or an array have produced an element at a corresponding index.
   * The last element in the arguments must be a function to invoke for each series of elements at corresponding indexes in the args.
   *
   * @example
   * 1 - res = obs1.zip(obs2, fn);
   * 1 - res = x1.zip([1,2,3], fn);
   * @returns {Observable} An observable sequence containing the result of combining elements of the args using the specified result selector function.
   */
  observableProto.zip = function () {
    for (var args = [], i = 0, len = arguments.length; i < len; i++) {
      args.push(arguments[i]);
    }
    if (Array.isArray(args[0])) {
      return zipArray.apply(this, args);
    }
    var parent = this,
        resultSelector = args.pop();
    args.unshift(parent);
    return new AnonymousObservable(function (observer) {
      var n = args.length,
          queues = arrayInitialize(n, emptyArrayFactory),
          isDone = arrayInitialize(n, falseFactory);

      function next(i) {
        var res, queuedValues;
        if (queues.every(function (x) {
          return x.length > 0;
        })) {
          try {
            queuedValues = queues.map(function (x) {
              return x.shift();
            });
            res = resultSelector.apply(parent, queuedValues);
          } catch (ex) {
            observer.onError(ex);
            return;
          }
          observer.onNext(res);
        } else if (isDone.filter(function (x, j) {
          return j !== i;
        }).every(identity)) {
          observer.onCompleted();
        }
      };

      function done(i) {
        isDone[i] = true;
        if (isDone.every(function (x) {
          return x;
        })) {
          observer.onCompleted();
        }
      }

      var subscriptions = new Array(n);
      for (var idx = 0; idx < n; idx++) {
        (function (i) {
          var source = args[i],
              sad = new SingleAssignmentDisposable();
          isPromise(source) && (source = observableFromPromise(source));
          sad.setDisposable(source.subscribe(function (x) {
            queues[i].push(x);
            next(i);
          }, function (e) {
            observer.onError(e);
          }, function () {
            done(i);
          }));
          subscriptions[i] = sad;
        })(idx);
      }

      return new CompositeDisposable(subscriptions);
    }, parent);
  };

  /**
   * Merges the specified observable sequences into one observable sequence by using the selector function whenever all of the observable sequences have produced an element at a corresponding index.
   * @param arguments Observable sources.
   * @param {Function} resultSelector Function to invoke for each series of elements at corresponding indexes in the sources.
   * @returns {Observable} An observable sequence containing the result of combining elements of the sources using the specified result selector function.
   */
  Observable.zip = function () {
    for (var args = [], i = 0, len = arguments.length; i < len; i++) {
      args.push(arguments[i]);
    }
    var first = args.shift();
    return first.zip.apply(first, args);
  };

  /**
   * Merges the specified observable sequences into one observable sequence by emitting a list with the elements of the observable sequences at corresponding indexes.
   * @param arguments Observable sources.
   * @returns {Observable} An observable sequence containing lists of elements at corresponding indexes.
   */
  Observable.zipArray = function () {
    var sources = [];
    if (Array.isArray(arguments[0])) {
      sources = arguments[0];
    } else {
      for (var i = 0, len = arguments.length; i < len; i++) {
        sources.push(arguments[i]);
      }
    }
    return new AnonymousObservable(function (observer) {
      var n = sources.length,
          queues = arrayInitialize(n, function () {
        return [];
      }),
          isDone = arrayInitialize(n, function () {
        return false;
      });

      function next(i) {
        if (queues.every(function (x) {
          return x.length > 0;
        })) {
          var res = queues.map(function (x) {
            return x.shift();
          });
          observer.onNext(res);
        } else if (isDone.filter(function (x, j) {
          return j !== i;
        }).every(identity)) {
          observer.onCompleted();
          return;
        }
      };

      function done(i) {
        isDone[i] = true;
        if (isDone.every(identity)) {
          observer.onCompleted();
          return;
        }
      }

      var subscriptions = new Array(n);
      for (var idx = 0; idx < n; idx++) {
        (function (i) {
          subscriptions[i] = new SingleAssignmentDisposable();
          subscriptions[i].setDisposable(sources[i].subscribe(function (x) {
            queues[i].push(x);
            next(i);
          }, function (e) {
            observer.onError(e);
          }, function () {
            done(i);
          }));
        })(idx);
      }

      return new CompositeDisposable(subscriptions);
    });
  };

  /**
   *  Hides the identity of an observable sequence.
   * @returns {Observable} An observable sequence that hides the identity of the source sequence.
   */
  observableProto.asObservable = function () {
    var source = this;
    return new AnonymousObservable(function (o) {
      return source.subscribe(o);
    }, this);
  };

  /**
   * Dematerializes the explicit notification values of an observable sequence as implicit notifications.
   * @returns {Observable} An observable sequence exhibiting the behavior corresponding to the source sequence's notification values.
   */
  observableProto.dematerialize = function () {
    var source = this;
    return new AnonymousObservable(function (o) {
      return source.subscribe(function (x) {
        return x.accept(o);
      }, function (e) {
        o.onError(e);
      }, function () {
        o.onCompleted();
      });
    }, this);
  };

  /**
   *  Returns an observable sequence that contains only distinct contiguous elements according to the keySelector and the comparer.
   *
   *  var obs = observable.distinctUntilChanged();
   *  var obs = observable.distinctUntilChanged(function (x) { return x.id; });
   *  var obs = observable.distinctUntilChanged(function (x) { return x.id; }, function (x, y) { return x === y; });
   *
   * @param {Function} [keySelector] A function to compute the comparison key for each element. If not provided, it projects the value.
   * @param {Function} [comparer] Equality comparer for computed key values. If not provided, defaults to an equality comparer function.
   * @returns {Observable} An observable sequence only containing the distinct contiguous elements, based on a computed key value, from the source sequence.
   */
  observableProto.distinctUntilChanged = function (keySelector, comparer) {
    var source = this;
    comparer || (comparer = defaultComparer);
    return new AnonymousObservable(function (o) {
      var hasCurrentKey = false,
          currentKey;
      return source.subscribe(function (value) {
        var key = value;
        if (keySelector) {
          try {
            key = keySelector(value);
          } catch (e) {
            o.onError(e);
            return;
          }
        }
        if (hasCurrentKey) {
          try {
            var comparerEquals = comparer(currentKey, key);
          } catch (e) {
            o.onError(e);
            return;
          }
        }
        if (!hasCurrentKey || !comparerEquals) {
          hasCurrentKey = true;
          currentKey = key;
          o.onNext(value);
        }
      }, function (e) {
        o.onError(e);
      }, function () {
        o.onCompleted();
      });
    }, this);
  };

  /**
   *  Invokes an action for each element in the observable sequence and invokes an action upon graceful or exceptional termination of the observable sequence.
   *  This method can be used for debugging, logging, etc. of query behavior by intercepting the message stream to run arbitrary actions for messages on the pipeline.
   * @param {Function | Observer} observerOrOnNext Action to invoke for each element in the observable sequence or an observer.
   * @param {Function} [onError]  Action to invoke upon exceptional termination of the observable sequence. Used if only the observerOrOnNext parameter is also a function.
   * @param {Function} [onCompleted]  Action to invoke upon graceful termination of the observable sequence. Used if only the observerOrOnNext parameter is also a function.
   * @returns {Observable} The source sequence with the side-effecting behavior applied.
   */
  observableProto["do"] = observableProto.tap = observableProto.doAction = function (observerOrOnNext, onError, onCompleted) {
    var source = this,
        tapObserver = typeof observerOrOnNext === "function" || typeof observerOrOnNext === "undefined" ? observerCreate(observerOrOnNext || noop, onError || noop, onCompleted || noop) : observerOrOnNext;
    return new AnonymousObservable(function (observer) {
      return source.subscribe(function (x) {
        try {
          tapObserver.onNext(x);
        } catch (e) {
          observer.onError(e);
        }
        observer.onNext(x);
      }, function (err) {
        try {
          tapObserver.onError(err);
        } catch (e) {
          observer.onError(e);
        }
        observer.onError(err);
      }, function () {
        try {
          tapObserver.onCompleted();
        } catch (e) {
          observer.onError(e);
        }
        observer.onCompleted();
      });
    }, this);
  };

  /**
   *  Invokes an action for each element in the observable sequence.
   *  This method can be used for debugging, logging, etc. of query behavior by intercepting the message stream to run arbitrary actions for messages on the pipeline.
   * @param {Function} onNext Action to invoke for each element in the observable sequence.
   * @param {Any} [thisArg] Object to use as this when executing callback.
   * @returns {Observable} The source sequence with the side-effecting behavior applied.
   */
  observableProto.doOnNext = observableProto.tapOnNext = function (onNext, thisArg) {
    return this.tap(typeof thisArg !== "undefined" ? function (x) {
      onNext.call(thisArg, x);
    } : onNext);
  };

  /**
   *  Invokes an action upon exceptional termination of the observable sequence.
   *  This method can be used for debugging, logging, etc. of query behavior by intercepting the message stream to run arbitrary actions for messages on the pipeline.
   * @param {Function} onError Action to invoke upon exceptional termination of the observable sequence.
   * @param {Any} [thisArg] Object to use as this when executing callback.
   * @returns {Observable} The source sequence with the side-effecting behavior applied.
   */
  observableProto.doOnError = observableProto.tapOnError = function (onError, thisArg) {
    return this.tap(noop, typeof thisArg !== "undefined" ? function (e) {
      onError.call(thisArg, e);
    } : onError);
  };

  /**
   *  Invokes an action upon graceful termination of the observable sequence.
   *  This method can be used for debugging, logging, etc. of query behavior by intercepting the message stream to run arbitrary actions for messages on the pipeline.
   * @param {Function} onCompleted Action to invoke upon graceful termination of the observable sequence.
   * @param {Any} [thisArg] Object to use as this when executing callback.
   * @returns {Observable} The source sequence with the side-effecting behavior applied.
   */
  observableProto.doOnCompleted = observableProto.tapOnCompleted = function (onCompleted, thisArg) {
    return this.tap(noop, null, typeof thisArg !== "undefined" ? function () {
      onCompleted.call(thisArg);
    } : onCompleted);
  };

  /**
   *  Invokes a specified action after the source observable sequence terminates gracefully or exceptionally.
   * @param {Function} finallyAction Action to invoke after the source observable sequence terminates.
   * @returns {Observable} Source sequence with the action-invoking termination behavior applied.
   */
  observableProto["finally"] = observableProto.ensure = function (action) {
    var source = this;
    return new AnonymousObservable(function (observer) {
      var subscription;
      try {
        subscription = source.subscribe(observer);
      } catch (e) {
        action();
        throw e;
      }
      return disposableCreate(function () {
        try {
          subscription.dispose();
        } catch (e) {
          throw e;
        } finally {
          action();
        }
      });
    }, this);
  };

  /**
   * @deprecated use #finally or #ensure instead.
   */
  observableProto.finallyAction = function (action) {
    //deprecate('finallyAction', 'finally or ensure');
    return this.ensure(action);
  };

  /**
   *  Ignores all elements in an observable sequence leaving only the termination messages.
   * @returns {Observable} An empty observable sequence that signals termination, successful or exceptional, of the source sequence.
   */
  observableProto.ignoreElements = function () {
    var source = this;
    return new AnonymousObservable(function (o) {
      return source.subscribe(noop, function (e) {
        o.onError(e);
      }, function () {
        o.onCompleted();
      });
    }, source);
  };

  /**
   *  Materializes the implicit notifications of an observable sequence as explicit notification values.
   * @returns {Observable} An observable sequence containing the materialized notification values from the source sequence.
   */
  observableProto.materialize = function () {
    var source = this;
    return new AnonymousObservable(function (observer) {
      return source.subscribe(function (value) {
        observer.onNext(notificationCreateOnNext(value));
      }, function (e) {
        observer.onNext(notificationCreateOnError(e));
        observer.onCompleted();
      }, function () {
        observer.onNext(notificationCreateOnCompleted());
        observer.onCompleted();
      });
    }, source);
  };

  /**
   *  Repeats the observable sequence a specified number of times. If the repeat count is not specified, the sequence repeats indefinitely.
   * @param {Number} [repeatCount]  Number of times to repeat the sequence. If not provided, repeats the sequence indefinitely.
   * @returns {Observable} The observable sequence producing the elements of the given sequence repeatedly.
   */
  observableProto.repeat = function (repeatCount) {
    return enumerableRepeat(this, repeatCount).concat();
  };

  /**
   *  Repeats the source observable sequence the specified number of times or until it successfully terminates. If the retry count is not specified, it retries indefinitely.
   *  Note if you encounter an error and want it to retry once, then you must use .retry(2);
   *
   * @example
   *  var res = retried = retry.repeat();
   *  var res = retried = retry.repeat(2);
   * @param {Number} [retryCount]  Number of times to retry the sequence. If not provided, retry the sequence indefinitely.
   * @returns {Observable} An observable sequence producing the elements of the given sequence repeatedly until it terminates successfully.
   */
  observableProto.retry = function (retryCount) {
    return enumerableRepeat(this, retryCount).catchError();
  };

  /**
   *  Repeats the source observable sequence upon error each time the notifier emits or until it successfully terminates. 
   *  if the notifier completes, the observable sequence completes.
   *
   * @example
   *  var timer = Observable.timer(500);
   *  var source = observable.retryWhen(timer);
   * @param {Observable} [notifier] An observable that triggers the retries or completes the observable with onNext or onCompleted respectively.
   * @returns {Observable} An observable sequence producing the elements of the given sequence repeatedly until it terminates successfully.
   */
  observableProto.retryWhen = function (notifier) {
    return enumerableRepeat(this).catchErrorWhen(notifier);
  };
  /**
   *  Applies an accumulator function over an observable sequence and returns each intermediate result. The optional seed value is used as the initial accumulator value.
   *  For aggregation behavior with no intermediate results, see Observable.aggregate.
   * @example
   *  var res = source.scan(function (acc, x) { return acc + x; });
   *  var res = source.scan(0, function (acc, x) { return acc + x; });
   * @param {Mixed} [seed] The initial accumulator value.
   * @param {Function} accumulator An accumulator function to be invoked on each element.
   * @returns {Observable} An observable sequence containing the accumulated values.
   */
  observableProto.scan = function () {
    var hasSeed = false,
        seed,
        accumulator,
        source = this;
    if (arguments.length === 2) {
      hasSeed = true;
      seed = arguments[0];
      accumulator = arguments[1];
    } else {
      accumulator = arguments[0];
    }
    return new AnonymousObservable(function (o) {
      var hasAccumulation, accumulation, hasValue;
      return source.subscribe(function (x) {
        !hasValue && (hasValue = true);
        try {
          if (hasAccumulation) {
            accumulation = accumulator(accumulation, x);
          } else {
            accumulation = hasSeed ? accumulator(seed, x) : x;
            hasAccumulation = true;
          }
        } catch (e) {
          o.onError(e);
          return;
        }

        o.onNext(accumulation);
      }, function (e) {
        o.onError(e);
      }, function () {
        !hasValue && hasSeed && o.onNext(seed);
        o.onCompleted();
      });
    }, source);
  };

  /**
   *  Bypasses a specified number of elements at the end of an observable sequence.
   * @description
   *  This operator accumulates a queue with a length enough to store the first `count` elements. As more elements are
   *  received, elements are taken from the front of the queue and produced on the result sequence. This causes elements to be delayed.
   * @param count Number of elements to bypass at the end of the source sequence.
   * @returns {Observable} An observable sequence containing the source sequence elements except for the bypassed ones at the end.
   */
  observableProto.skipLast = function (count) {
    var source = this;
    return new AnonymousObservable(function (o) {
      var q = [];
      return source.subscribe(function (x) {
        q.push(x);
        q.length > count && o.onNext(q.shift());
      }, function (e) {
        o.onError(e);
      }, function () {
        o.onCompleted();
      });
    }, source);
  };

  /**
   *  Prepends a sequence of values to an observable sequence with an optional scheduler and an argument list of values to prepend.
   *  @example
   *  var res = source.startWith(1, 2, 3);
   *  var res = source.startWith(Rx.Scheduler.timeout, 1, 2, 3);
   * @param {Arguments} args The specified values to prepend to the observable sequence
   * @returns {Observable} The source sequence prepended with the specified values.
   */
  observableProto.startWith = function () {
    var values,
        scheduler,
        start = 0;
    if (!!arguments.length && isScheduler(arguments[0])) {
      scheduler = arguments[0];
      start = 1;
    } else {
      scheduler = immediateScheduler;
    }
    for (var args = [], i = start, len = arguments.length; i < len; i++) {
      args.push(arguments[i]);
    }
    return enumerableOf([observableFromArray(args, scheduler), this]).concat();
  };

  /**
   *  Returns a specified number of contiguous elements from the end of an observable sequence.
   * @description
   *  This operator accumulates a buffer with a length enough to store elements count elements. Upon completion of
   *  the source sequence, this buffer is drained on the result sequence. This causes the elements to be delayed.
   * @param {Number} count Number of elements to take from the end of the source sequence.
   * @returns {Observable} An observable sequence containing the specified number of elements from the end of the source sequence.
   */
  observableProto.takeLast = function (count) {
    var source = this;
    return new AnonymousObservable(function (o) {
      var q = [];
      return source.subscribe(function (x) {
        q.push(x);
        q.length > count && q.shift();
      }, function (e) {
        o.onError(e);
      }, function () {
        while (q.length > 0) {
          o.onNext(q.shift());
        }
        o.onCompleted();
      });
    }, source);
  };

  function concatMap(source, selector, thisArg) {
    var selectorFunc = bindCallback(selector, thisArg, 3);
    return source.map(function (x, i) {
      var result = selectorFunc(x, i, source);
      isPromise(result) && (result = observableFromPromise(result));
      (isArrayLike(result) || isIterable(result)) && (result = observableFrom(result));
      return result;
    }).concatAll();
  }

  /**
   *  One of the Following:
   *  Projects each element of an observable sequence to an observable sequence and merges the resulting observable sequences into one observable sequence.
   *
   * @example
   *  var res = source.concatMap(function (x) { return Rx.Observable.range(0, x); });
   *  Or:
   *  Projects each element of an observable sequence to an observable sequence, invokes the result selector for the source element and each of the corresponding inner sequence's elements, and merges the results into one observable sequence.
   *
   *  var res = source.concatMap(function (x) { return Rx.Observable.range(0, x); }, function (x, y) { return x + y; });
   *  Or:
   *  Projects each element of the source observable sequence to the other observable sequence and merges the resulting observable sequences into one observable sequence.
   *
   *  var res = source.concatMap(Rx.Observable.fromArray([1,2,3]));
   * @param {Function} selector A transform function to apply to each element or an observable sequence to project each element from the
   * source sequence onto which could be either an observable or Promise.
   * @param {Function} [resultSelector]  A transform function to apply to each element of the intermediate sequence.
   * @returns {Observable} An observable sequence whose elements are the result of invoking the one-to-many transform function collectionSelector on each element of the input sequence and then mapping each of those sequence elements and their corresponding source element to a result element.
   */
  observableProto.selectConcat = observableProto.concatMap = function (selector, resultSelector, thisArg) {
    if (isFunction(selector) && isFunction(resultSelector)) {
      return this.concatMap(function (x, i) {
        var selectorResult = selector(x, i);
        isPromise(selectorResult) && (selectorResult = observableFromPromise(selectorResult));
        (isArrayLike(selectorResult) || isIterable(selectorResult)) && (selectorResult = observableFrom(selectorResult));

        return selectorResult.map(function (y, i2) {
          return resultSelector(x, y, i, i2);
        });
      });
    }
    return isFunction(selector) ? concatMap(this, selector, thisArg) : concatMap(this, function () {
      return selector;
    });
  };

  var MapObservable = (function (__super__) {
    inherits(MapObservable, __super__);

    function MapObservable(source, selector, thisArg) {
      this.source = source;
      this.selector = bindCallback(selector, thisArg, 3);
      __super__.call(this);
    }

    MapObservable.prototype.internalMap = function (selector, thisArg) {
      var self = this;
      return new MapObservable(this.source, function (x, i, o) {
        return selector(self.selector(x, i, o), i, o);
      }, thisArg);
    };

    MapObservable.prototype.subscribeCore = function (observer) {
      return this.source.subscribe(new MapObserver(observer, this.selector, this));
    };

    return MapObservable;
  })(ObservableBase);

  function MapObserver(observer, selector, source) {
    this.observer = observer;
    this.selector = selector;
    this.source = source;
    this.index = 0;
    this.isStopped = false;
  }

  MapObserver.prototype.onNext = function (x) {
    if (this.isStopped) {
      return;
    }
    try {
      var result = this.selector(x, this.index++, this.source);
    } catch (e) {
      return this.observer.onError(e);
    }
    this.observer.onNext(result);
  };
  MapObserver.prototype.onError = function (e) {
    if (!this.isStopped) {
      this.isStopped = true;this.observer.onError(e);
    }
  };
  MapObserver.prototype.onCompleted = function () {
    if (!this.isStopped) {
      this.isStopped = true;this.observer.onCompleted();
    }
  };
  MapObserver.prototype.dispose = function () {
    this.isStopped = true;
  };
  MapObserver.prototype.fail = function (e) {
    if (!this.isStopped) {
      this.isStopped = true;
      this.observer.onError(e);
      return true;
    }

    return false;
  };

  /**
  * Projects each element of an observable sequence into a new form by incorporating the element's index.
  * @param {Function} selector A transform function to apply to each source element; the second parameter of the function represents the index of the source element.
  * @param {Any} [thisArg] Object to use as this when executing callback.
  * @returns {Observable} An observable sequence whose elements are the result of invoking the transform function on each element of source.
  */
  observableProto.map = observableProto.select = function (selector, thisArg) {
    var selectorFn = typeof selector === "function" ? selector : function () {
      return selector;
    };
    return this instanceof MapObservable ? this.internalMap(selector, thisArg) : new MapObservable(this, selectorFn, thisArg);
  };

  /**
   * Retrieves the value of a specified nested property from all elements in
   * the Observable sequence.
   * @param {Arguments} arguments The nested properties to pluck.
   * @returns {Observable} Returns a new Observable sequence of property values.
   */
  observableProto.pluck = function () {
    var args = arguments,
        len = arguments.length;
    if (len === 0) {
      throw new Error("List of properties cannot be empty.");
    }
    return this.map(function (x) {
      var currentProp = x;
      for (var i = 0; i < len; i++) {
        var p = currentProp[args[i]];
        if (typeof p !== "undefined") {
          currentProp = p;
        } else {
          return undefined;
        }
      }
      return currentProp;
    });
  };

  function flatMap(source, selector, thisArg) {
    var selectorFunc = bindCallback(selector, thisArg, 3);
    return source.map(function (x, i) {
      var result = selectorFunc(x, i, source);
      isPromise(result) && (result = observableFromPromise(result));
      (isArrayLike(result) || isIterable(result)) && (result = observableFrom(result));
      return result;
    }).mergeAll();
  }

  /**
   *  One of the Following:
   *  Projects each element of an observable sequence to an observable sequence and merges the resulting observable sequences into one observable sequence.
   *
   * @example
   *  var res = source.selectMany(function (x) { return Rx.Observable.range(0, x); });
   *  Or:
   *  Projects each element of an observable sequence to an observable sequence, invokes the result selector for the source element and each of the corresponding inner sequence's elements, and merges the results into one observable sequence.
   *
   *  var res = source.selectMany(function (x) { return Rx.Observable.range(0, x); }, function (x, y) { return x + y; });
   *  Or:
   *  Projects each element of the source observable sequence to the other observable sequence and merges the resulting observable sequences into one observable sequence.
   *
   *  var res = source.selectMany(Rx.Observable.fromArray([1,2,3]));
   * @param {Function} selector A transform function to apply to each element or an observable sequence to project each element from the source sequence onto which could be either an observable or Promise.
   * @param {Function} [resultSelector]  A transform function to apply to each element of the intermediate sequence.
   * @param {Any} [thisArg] Object to use as this when executing callback.
   * @returns {Observable} An observable sequence whose elements are the result of invoking the one-to-many transform function collectionSelector on each element of the input sequence and then mapping each of those sequence elements and their corresponding source element to a result element.
   */
  observableProto.selectMany = observableProto.flatMap = function (selector, resultSelector, thisArg) {
    if (isFunction(selector) && isFunction(resultSelector)) {
      return this.flatMap(function (x, i) {
        var selectorResult = selector(x, i);
        isPromise(selectorResult) && (selectorResult = observableFromPromise(selectorResult));
        (isArrayLike(selectorResult) || isIterable(selectorResult)) && (selectorResult = observableFrom(selectorResult));

        return selectorResult.map(function (y, i2) {
          return resultSelector(x, y, i, i2);
        });
      }, thisArg);
    }
    return isFunction(selector) ? flatMap(this, selector, thisArg) : flatMap(this, function () {
      return selector;
    });
  };

  /**
   *  Projects each element of an observable sequence into a new sequence of observable sequences by incorporating the element's index and then
   *  transforms an observable sequence of observable sequences into an observable sequence producing values only from the most recent observable sequence.
   * @param {Function} selector A transform function to apply to each source element; the second parameter of the function represents the index of the source element.
   * @param {Any} [thisArg] Object to use as this when executing callback.
   * @returns {Observable} An observable sequence whose elements are the result of invoking the transform function on each element of source producing an Observable of Observable sequences
   *  and that at any point in time produces the elements of the most recent inner observable sequence that has been received.
   */
  observableProto.selectSwitch = observableProto.flatMapLatest = observableProto.switchMap = function (selector, thisArg) {
    return this.select(selector, thisArg).switchLatest();
  };

  /**
   * Bypasses a specified number of elements in an observable sequence and then returns the remaining elements.
   * @param {Number} count The number of elements to skip before returning the remaining elements.
   * @returns {Observable} An observable sequence that contains the elements that occur after the specified index in the input sequence.
   */
  observableProto.skip = function (count) {
    if (count < 0) {
      throw new Error(argumentOutOfRange);
    }
    var source = this;
    return new AnonymousObservable(function (o) {
      var remaining = count;
      return source.subscribe(function (x) {
        if (remaining <= 0) {
          o.onNext(x);
        } else {
          remaining--;
        }
      }, function (e) {
        o.onError(e);
      }, function () {
        o.onCompleted();
      });
    }, source);
  };

  /**
   *  Bypasses elements in an observable sequence as long as a specified condition is true and then returns the remaining elements.
   *  The element's index is used in the logic of the predicate function.
   *
   *  var res = source.skipWhile(function (value) { return value < 10; });
   *  var res = source.skipWhile(function (value, index) { return value < 10 || index < 10; });
   * @param {Function} predicate A function to test each element for a condition; the second parameter of the function represents the index of the source element.
   * @param {Any} [thisArg] Object to use as this when executing callback.
   * @returns {Observable} An observable sequence that contains the elements from the input sequence starting at the first element in the linear series that does not pass the test specified by predicate.
   */
  observableProto.skipWhile = function (predicate, thisArg) {
    var source = this,
        callback = bindCallback(predicate, thisArg, 3);
    return new AnonymousObservable(function (o) {
      var i = 0,
          running = false;
      return source.subscribe(function (x) {
        if (!running) {
          try {
            running = !callback(x, i++, source);
          } catch (e) {
            o.onError(e);
            return;
          }
        }
        running && o.onNext(x);
      }, function (e) {
        o.onError(e);
      }, function () {
        o.onCompleted();
      });
    }, source);
  };

  /**
   *  Returns a specified number of contiguous elements from the start of an observable sequence, using the specified scheduler for the edge case of take(0).
   *
   *  var res = source.take(5);
   *  var res = source.take(0, Rx.Scheduler.timeout);
   * @param {Number} count The number of elements to return.
   * @param {Scheduler} [scheduler] Scheduler used to produce an OnCompleted message in case <paramref name="count count</paramref> is set to 0.
   * @returns {Observable} An observable sequence that contains the specified number of elements from the start of the input sequence.
   */
  observableProto.take = function (count, scheduler) {
    if (count < 0) {
      throw new RangeError(argumentOutOfRange);
    }
    if (count === 0) {
      return observableEmpty(scheduler);
    }
    var source = this;
    return new AnonymousObservable(function (o) {
      var remaining = count;
      return source.subscribe(function (x) {
        if (remaining-- > 0) {
          o.onNext(x);
          remaining === 0 && o.onCompleted();
        }
      }, function (e) {
        o.onError(e);
      }, function () {
        o.onCompleted();
      });
    }, source);
  };

  /**
   *  Returns elements from an observable sequence as long as a specified condition is true.
   *  The element's index is used in the logic of the predicate function.
   * @param {Function} predicate A function to test each element for a condition; the second parameter of the function represents the index of the source element.
   * @param {Any} [thisArg] Object to use as this when executing callback.
   * @returns {Observable} An observable sequence that contains the elements from the input sequence that occur before the element at which the test no longer passes.
   */
  observableProto.takeWhile = function (predicate, thisArg) {
    var source = this,
        callback = bindCallback(predicate, thisArg, 3);
    return new AnonymousObservable(function (o) {
      var i = 0,
          running = true;
      return source.subscribe(function (x) {
        if (running) {
          try {
            running = callback(x, i++, source);
          } catch (e) {
            o.onError(e);
            return;
          }
          if (running) {
            o.onNext(x);
          } else {
            o.onCompleted();
          }
        }
      }, function (e) {
        o.onError(e);
      }, function () {
        o.onCompleted();
      });
    }, source);
  };

  var FilterObservable = (function (__super__) {
    inherits(FilterObservable, __super__);

    function FilterObservable(source, predicate, thisArg) {
      this.source = source;
      this.predicate = bindCallback(predicate, thisArg, 3);
      __super__.call(this);
    }

    FilterObservable.prototype.subscribeCore = function (observer) {
      return this.source.subscribe(new FilterObserver(observer, this.predicate, this));
    };

    FilterObservable.prototype.internalFilter = function (predicate, thisArg) {
      var self = this;
      return new FilterObservable(this.source, function (x, i, o) {
        return self.predicate(x, i, o) && predicate(x, i, o);
      }, thisArg);
    };

    return FilterObservable;
  })(ObservableBase);

  function FilterObserver(observer, predicate, source) {
    this.observer = observer;
    this.predicate = predicate;
    this.source = source;
    this.index = 0;
    this.isStopped = false;
  }

  FilterObserver.prototype.onNext = function (x) {
    try {
      var shouldYield = this.predicate(x, this.index++, this.source);
    } catch (e) {
      return this.observer.onError(e);
    }
    shouldYield && this.observer.onNext(x);
  };

  FilterObserver.prototype.onError = function (e) {
    if (!this.isStopped) {
      this.isStopped = true;this.observer.onError(e);
    }
  };
  FilterObserver.prototype.onCompleted = function () {
    if (!this.isStopped) {
      this.isStopped = true;this.observer.onCompleted();
    }
  };
  FilterObserver.prototype.dispose = function () {
    this.isStopped = true;
  };
  FilterObserver.prototype.fail = function (e) {
    if (!this.isStopped) {
      this.isStopped = true;
      this.observer.onError(e);
      return true;
    }

    return false;
  };



  /**
  *  Filters the elements of an observable sequence based on a predicate by incorporating the element's index.
  * @param {Function} predicate A function to test each source element for a condition; the second parameter of the function represents the index of the source element.
  * @param {Any} [thisArg] Object to use as this when executing callback.
  * @returns {Observable} An observable sequence that contains elements from the input sequence that satisfy the condition.
  */
  observableProto.filter = observableProto.where = function (predicate, thisArg) {
    return this instanceof FilterObservable ? this.internalFilter(predicate, thisArg) : new FilterObservable(this, predicate, thisArg);
  };

  /**
   * Converts a callback function to an observable sequence.
   *
   * @param {Function} function Function with a callback as the last parameter to convert to an Observable sequence.
   * @param {Mixed} [context] The context for the func parameter to be executed.  If not specified, defaults to undefined.
   * @param {Function} [selector] A selector which takes the arguments from the callback to produce a single item to yield on next.
   * @returns {Function} A function, when executed with the required parameters minus the callback, produces an Observable sequence with a single value of the arguments to the callback as an array.
   */
  Observable.fromCallback = function (func, context, selector) {
    return function () {
      for (var args = [], i = 0, len = arguments.length; i < len; i++) {
        args.push(arguments[i]);
      }

      return new AnonymousObservable(function (observer) {
        function handler() {
          var results = arguments;

          if (selector) {
            try {
              results = selector(results);
            } catch (err) {
              return observer.onError(err);
            }

            observer.onNext(results);
          } else {
            if (results.length <= 1) {
              observer.onNext.apply(observer, results);
            } else {
              observer.onNext(results);
            }
          }

          observer.onCompleted();
        }

        args.push(handler);
        func.apply(context, args);
      }).publishLast().refCount();
    };
  };

  /**
   * Converts a Node.js callback style function to an observable sequence.  This must be in function (err, ...) format.
   * @param {Function} func The function to call
   * @param {Mixed} [context] The context for the func parameter to be executed.  If not specified, defaults to undefined.
   * @param {Function} [selector] A selector which takes the arguments from the callback minus the error to produce a single item to yield on next.
   * @returns {Function} An async function which when applied, returns an observable sequence with the callback arguments as an array.
   */
  Observable.fromNodeCallback = function (func, context, selector) {
    return function () {
      for (var args = [], i = 0, len = arguments.length; i < len; i++) {
        args.push(arguments[i]);
      }

      return new AnonymousObservable(function (observer) {
        function handler(err) {
          if (err) {
            observer.onError(err);
            return;
          }

          for (var results = [], i = 1, len = arguments.length; i < len; i++) {
            results.push(arguments[i]);
          }

          if (selector) {
            try {
              results = selector(results);
            } catch (e) {
              return observer.onError(e);
            }
            observer.onNext(results);
          } else {
            if (results.length <= 1) {
              observer.onNext.apply(observer, results);
            } else {
              observer.onNext(results);
            }
          }

          observer.onCompleted();
        }

        args.push(handler);
        func.apply(context, args);
      }).publishLast().refCount();
    };
  };

  function createListener(element, name, handler) {
    if (element.addEventListener) {
      element.addEventListener(name, handler, false);
      return disposableCreate(function () {
        element.removeEventListener(name, handler, false);
      });
    }
    throw new Error("No listener found");
  }

  function createEventListener(el, eventName, handler) {
    var disposables = new CompositeDisposable();

    // Asume NodeList
    if (Object.prototype.toString.call(el) === "[object NodeList]") {
      for (var i = 0, len = el.length; i < len; i++) {
        disposables.add(createEventListener(el.item(i), eventName, handler));
      }
    } else if (el) {
      disposables.add(createListener(el, eventName, handler));
    }

    return disposables;
  }

  /**
   * Configuration option to determine whether to use native events only
   */
  Rx.config.useNativeEvents = false;

  /**
   * Creates an observable sequence by adding an event listener to the matching DOMElement or each item in the NodeList.
   *
   * @example
   *   var source = Rx.Observable.fromEvent(element, 'mouseup');
   *
   * @param {Object} element The DOMElement or NodeList to attach a listener.
   * @param {String} eventName The event name to attach the observable sequence.
   * @param {Function} [selector] A selector which takes the arguments from the event handler to produce a single item to yield on next.
   * @returns {Observable} An observable sequence of events from the specified element and the specified event.
   */
  Observable.fromEvent = function (element, eventName, selector) {
    // Node.js specific
    if (element.addListener) {
      return fromEventPattern(function (h) {
        element.addListener(eventName, h);
      }, function (h) {
        element.removeListener(eventName, h);
      }, selector);
    }

    // Use only if non-native events are allowed
    if (!Rx.config.useNativeEvents) {
      // Handles jq, Angular.js, Zepto, Marionette
      if (typeof element.on === "function" && typeof element.off === "function") {
        return fromEventPattern(function (h) {
          element.on(eventName, h);
        }, function (h) {
          element.off(eventName, h);
        }, selector);
      }
      if (!!root.Ember && typeof root.Ember.addListener === "function") {
        return fromEventPattern(function (h) {
          Ember.addListener(element, eventName, h);
        }, function (h) {
          Ember.removeListener(element, eventName, h);
        }, selector);
      }
    }
    return new AnonymousObservable(function (observer) {
      return createEventListener(element, eventName, function handler(e) {
        var results = e;

        if (selector) {
          try {
            results = selector(arguments);
          } catch (err) {
            observer.onError(err);
            return;
          }
        }

        observer.onNext(results);
      });
    }).publish().refCount();
  };

  /**
   * Creates an observable sequence from an event emitter via an addHandler/removeHandler pair.
   * @param {Function} addHandler The function to add a handler to the emitter.
   * @param {Function} [removeHandler] The optional function to remove a handler from an emitter.
   * @param {Function} [selector] A selector which takes the arguments from the event handler to produce a single item to yield on next.
   * @returns {Observable} An observable sequence which wraps an event from an event emitter
   */
  var fromEventPattern = Observable.fromEventPattern = function (addHandler, removeHandler, selector) {
    return new AnonymousObservable(function (observer) {
      function innerHandler(e) {
        var result = e;
        if (selector) {
          try {
            result = selector(arguments);
          } catch (err) {
            observer.onError(err);
            return;
          }
        }
        observer.onNext(result);
      }

      var returnValue = addHandler(innerHandler);
      return disposableCreate(function () {
        if (removeHandler) {
          removeHandler(innerHandler, returnValue);
        }
      });
    }).publish().refCount();
  };

  /**
   * Converts a Promise to an Observable sequence
   * @param {Promise} An ES6 Compliant promise.
   * @returns {Observable} An Observable sequence which wraps the existing promise success and failure.
   */
  var observableFromPromise = Observable.fromPromise = function (promise) {
    return observableDefer(function () {
      var subject = new Rx.AsyncSubject();

      promise.then(function (value) {
        subject.onNext(value);
        subject.onCompleted();
      }, subject.onError.bind(subject));

      return subject;
    });
  };

  /*
   * Converts an existing observable sequence to an ES6 Compatible Promise
   * @example
   * var promise = Rx.Observable.return(42).toPromise(RSVP.Promise);
   *
   * // With config
   * Rx.config.Promise = RSVP.Promise;
   * var promise = Rx.Observable.return(42).toPromise();
   * @param {Function} [promiseCtor] The constructor of the promise. If not provided, it looks for it in Rx.config.Promise.
   * @returns {Promise} An ES6 compatible promise with the last value from the observable sequence.
   */
  observableProto.toPromise = function (promiseCtor) {
    promiseCtor || (promiseCtor = Rx.config.Promise);
    if (!promiseCtor) {
      throw new TypeError("Promise type not provided nor in Rx.config.Promise");
    }
    var source = this;
    return new promiseCtor(function (resolve, reject) {
      // No cancellation can be done
      var value,
          hasValue = false;
      source.subscribe(function (v) {
        value = v;
        hasValue = true;
      }, reject, function () {
        hasValue && resolve(value);
      });
    });
  };

  /**
   * Invokes the asynchronous function, surfacing the result through an observable sequence.
   * @param {Function} functionAsync Asynchronous function which returns a Promise to run.
   * @returns {Observable} An observable sequence exposing the function's result value, or an exception.
   */
  Observable.startAsync = function (functionAsync) {
    var promise;
    try {
      promise = functionAsync();
    } catch (e) {
      return observableThrow(e);
    }
    return observableFromPromise(promise);
  };

  /**
   * Multicasts the source sequence notifications through an instantiated subject into all uses of the sequence within a selector function. Each
   * subscription to the resulting sequence causes a separate multicast invocation, exposing the sequence resulting from the selector function's
   * invocation. For specializations with fixed subject types, see Publish, PublishLast, and Replay.
   *
   * @example
   * 1 - res = source.multicast(observable);
   * 2 - res = source.multicast(function () { return new Subject(); }, function (x) { return x; });
   *
   * @param {Function|Subject} subjectOrSubjectSelector
   * Factory function to create an intermediate subject through which the source sequence's elements will be multicast to the selector function.
   * Or:
   * Subject to push source elements into.
   *
   * @param {Function} [selector] Optional selector function which can use the multicasted source sequence subject to the policies enforced by the created subject. Specified only if <paramref name="subjectOrSubjectSelector" is a factory function.
   * @returns {Observable} An observable sequence that contains the elements of a sequence produced by multicasting the source sequence within a selector function.
   */
  observableProto.multicast = function (subjectOrSubjectSelector, selector) {
    var source = this;
    return typeof subjectOrSubjectSelector === "function" ? new AnonymousObservable(function (observer) {
      var connectable = source.multicast(subjectOrSubjectSelector());
      return new CompositeDisposable(selector(connectable).subscribe(observer), connectable.connect());
    }, source) : new ConnectableObservable(source, subjectOrSubjectSelector);
  };

  /**
   * Returns an observable sequence that is the result of invoking the selector on a connectable observable sequence that shares a single subscription to the underlying sequence.
   * This operator is a specialization of Multicast using a regular Subject.
   *
   * @example
   * var resres = source.publish();
   * var res = source.publish(function (x) { return x; });
   *
   * @param {Function} [selector] Selector function which can use the multicasted source sequence as many times as needed, without causing multiple subscriptions to the source sequence. Subscribers to the given source will receive all notifications of the source from the time of the subscription on.
   * @returns {Observable} An observable sequence that contains the elements of a sequence produced by multicasting the source sequence within a selector function.
   */
  observableProto.publish = function (selector) {
    return selector && isFunction(selector) ? this.multicast(function () {
      return new Subject();
    }, selector) : this.multicast(new Subject());
  };

  /**
   * Returns an observable sequence that shares a single subscription to the underlying sequence.
   * This operator is a specialization of publish which creates a subscription when the number of observers goes from zero to one, then shares that subscription with all subsequent observers until the number of observers returns to zero, at which point the subscription is disposed.
   * @returns {Observable} An observable sequence that contains the elements of a sequence produced by multicasting the source sequence.
   */
  observableProto.share = function () {
    return this.publish().refCount();
  };

  /**
   * Returns an observable sequence that is the result of invoking the selector on a connectable observable sequence that shares a single subscription to the underlying sequence containing only the last notification.
   * This operator is a specialization of Multicast using a AsyncSubject.
   *
   * @example
   * var res = source.publishLast();
   * var res = source.publishLast(function (x) { return x; });
   *
   * @param selector [Optional] Selector function which can use the multicasted source sequence as many times as needed, without causing multiple subscriptions to the source sequence. Subscribers to the given source will only receive the last notification of the source.
   * @returns {Observable} An observable sequence that contains the elements of a sequence produced by multicasting the source sequence within a selector function.
   */
  observableProto.publishLast = function (selector) {
    return selector && isFunction(selector) ? this.multicast(function () {
      return new AsyncSubject();
    }, selector) : this.multicast(new AsyncSubject());
  };

  /**
   * Returns an observable sequence that is the result of invoking the selector on a connectable observable sequence that shares a single subscription to the underlying sequence and starts with initialValue.
   * This operator is a specialization of Multicast using a BehaviorSubject.
   *
   * @example
   * var res = source.publishValue(42);
   * var res = source.publishValue(function (x) { return x.select(function (y) { return y * y; }) }, 42);
   *
   * @param {Function} [selector] Optional selector function which can use the multicasted source sequence as many times as needed, without causing multiple subscriptions to the source sequence. Subscribers to the given source will receive immediately receive the initial value, followed by all notifications of the source from the time of the subscription on.
   * @param {Mixed} initialValue Initial value received by observers upon subscription.
   * @returns {Observable} An observable sequence that contains the elements of a sequence produced by multicasting the source sequence within a selector function.
   */
  observableProto.publishValue = function (initialValueOrSelector, initialValue) {
    return arguments.length === 2 ? this.multicast(function () {
      return new BehaviorSubject(initialValue);
    }, initialValueOrSelector) : this.multicast(new BehaviorSubject(initialValueOrSelector));
  };

  /**
   * Returns an observable sequence that shares a single subscription to the underlying sequence and starts with an initialValue.
   * This operator is a specialization of publishValue which creates a subscription when the number of observers goes from zero to one, then shares that subscription with all subsequent observers until the number of observers returns to zero, at which point the subscription is disposed.
   * @param {Mixed} initialValue Initial value received by observers upon subscription.
   * @returns {Observable} An observable sequence that contains the elements of a sequence produced by multicasting the source sequence.
   */
  observableProto.shareValue = function (initialValue) {
    return this.publishValue(initialValue).refCount();
  };

  /**
   * Returns an observable sequence that is the result of invoking the selector on a connectable observable sequence that shares a single subscription to the underlying sequence replaying notifications subject to a maximum time length for the replay buffer.
   * This operator is a specialization of Multicast using a ReplaySubject.
   *
   * @example
   * var res = source.replay(null, 3);
   * var res = source.replay(null, 3, 500);
   * var res = source.replay(null, 3, 500, scheduler);
   * var res = source.replay(function (x) { return x.take(6).repeat(); }, 3, 500, scheduler);
   *
   * @param selector [Optional] Selector function which can use the multicasted source sequence as many times as needed, without causing multiple subscriptions to the source sequence. Subscribers to the given source will receive all the notifications of the source subject to the specified replay buffer trimming policy.
   * @param bufferSize [Optional] Maximum element count of the replay buffer.
   * @param window [Optional] Maximum time length of the replay buffer.
   * @param scheduler [Optional] Scheduler where connected observers within the selector function will be invoked on.
   * @returns {Observable} An observable sequence that contains the elements of a sequence produced by multicasting the source sequence within a selector function.
   */
  observableProto.replay = function (selector, bufferSize, window, scheduler) {
    return selector && isFunction(selector) ? this.multicast(function () {
      return new ReplaySubject(bufferSize, window, scheduler);
    }, selector) : this.multicast(new ReplaySubject(bufferSize, window, scheduler));
  };

  /**
   * Returns an observable sequence that shares a single subscription to the underlying sequence replaying notifications subject to a maximum time length for the replay buffer.
   * This operator is a specialization of replay which creates a subscription when the number of observers goes from zero to one, then shares that subscription with all subsequent observers until the number of observers returns to zero, at which point the subscription is disposed.
   *
   * @example
   * var res = source.shareReplay(3);
   * var res = source.shareReplay(3, 500);
   * var res = source.shareReplay(3, 500, scheduler);
   *
    * @param bufferSize [Optional] Maximum element count of the replay buffer.
   * @param window [Optional] Maximum time length of the replay buffer.
   * @param scheduler [Optional] Scheduler where connected observers within the selector function will be invoked on.
   * @returns {Observable} An observable sequence that contains the elements of a sequence produced by multicasting the source sequence.
   */
  observableProto.shareReplay = function (bufferSize, window, scheduler) {
    return this.replay(null, bufferSize, window, scheduler).refCount();
  };

  var ConnectableObservable = Rx.ConnectableObservable = (function (__super__) {
    inherits(ConnectableObservable, __super__);

    function ConnectableObservable(source, subject) {
      var hasSubscription = false,
          subscription,
          sourceObservable = source.asObservable();

      this.connect = function () {
        if (!hasSubscription) {
          hasSubscription = true;
          subscription = new CompositeDisposable(sourceObservable.subscribe(subject), disposableCreate(function () {
            hasSubscription = false;
          }));
        }
        return subscription;
      };

      __super__.call(this, function (o) {
        return subject.subscribe(o);
      });
    }

    ConnectableObservable.prototype.refCount = function () {
      var connectableSubscription,
          count = 0,
          source = this;
      return new AnonymousObservable(function (observer) {
        var shouldConnect = ++count === 1,
            subscription = source.subscribe(observer);
        shouldConnect && (connectableSubscription = source.connect());
        return function () {
          subscription.dispose();
          --count === 0 && connectableSubscription.dispose();
        };
      });
    };

    return ConnectableObservable;
  })(Observable);

  function observableTimerDate(dueTime, scheduler) {
    return new AnonymousObservable(function (observer) {
      return scheduler.scheduleWithAbsolute(dueTime, function () {
        observer.onNext(0);
        observer.onCompleted();
      });
    });
  }

  function observableTimerDateAndPeriod(dueTime, period, scheduler) {
    return new AnonymousObservable(function (observer) {
      var d = dueTime,
          p = normalizeTime(period);
      return scheduler.scheduleRecursiveWithAbsoluteAndState(0, d, function (count, self) {
        if (p > 0) {
          var now = scheduler.now();
          d = d + p;
          d <= now && (d = now + p);
        }
        observer.onNext(count);
        self(count + 1, d);
      });
    });
  }

  function observableTimerTimeSpan(dueTime, scheduler) {
    return new AnonymousObservable(function (observer) {
      return scheduler.scheduleWithRelative(normalizeTime(dueTime), function () {
        observer.onNext(0);
        observer.onCompleted();
      });
    });
  }

  function observableTimerTimeSpanAndPeriod(dueTime, period, scheduler) {
    return dueTime === period ? new AnonymousObservable(function (observer) {
      return scheduler.schedulePeriodicWithState(0, period, function (count) {
        observer.onNext(count);
        return count + 1;
      });
    }) : observableDefer(function () {
      return observableTimerDateAndPeriod(scheduler.now() + dueTime, period, scheduler);
    });
  }

  /**
   *  Returns an observable sequence that produces a value after each period.
   *
   * @example
   *  1 - res = Rx.Observable.interval(1000);
   *  2 - res = Rx.Observable.interval(1000, Rx.Scheduler.timeout);
   *
   * @param {Number} period Period for producing the values in the resulting sequence (specified as an integer denoting milliseconds).
   * @param {Scheduler} [scheduler] Scheduler to run the timer on. If not specified, Rx.Scheduler.timeout is used.
   * @returns {Observable} An observable sequence that produces a value after each period.
   */
  var observableinterval = Observable.interval = function (period, scheduler) {
    return observableTimerTimeSpanAndPeriod(period, period, isScheduler(scheduler) ? scheduler : timeoutScheduler);
  };

  /**
   *  Returns an observable sequence that produces a value after dueTime has elapsed and then after each period.
   * @param {Number} dueTime Absolute (specified as a Date object) or relative time (specified as an integer denoting milliseconds) at which to produce the first value.
   * @param {Mixed} [periodOrScheduler]  Period to produce subsequent values (specified as an integer denoting milliseconds), or the scheduler to run the timer on. If not specified, the resulting timer is not recurring.
   * @param {Scheduler} [scheduler]  Scheduler to run the timer on. If not specified, the timeout scheduler is used.
   * @returns {Observable} An observable sequence that produces a value after due time has elapsed and then each period.
   */
  var observableTimer = Observable.timer = function (dueTime, periodOrScheduler, scheduler) {
    var period;
    isScheduler(scheduler) || (scheduler = timeoutScheduler);
    if (periodOrScheduler !== undefined && typeof periodOrScheduler === "number") {
      period = periodOrScheduler;
    } else if (isScheduler(periodOrScheduler)) {
      scheduler = periodOrScheduler;
    }
    if (dueTime instanceof Date && period === undefined) {
      return observableTimerDate(dueTime.getTime(), scheduler);
    }
    if (dueTime instanceof Date && period !== undefined) {
      period = periodOrScheduler;
      return observableTimerDateAndPeriod(dueTime.getTime(), period, scheduler);
    }
    return period === undefined ? observableTimerTimeSpan(dueTime, scheduler) : observableTimerTimeSpanAndPeriod(dueTime, period, scheduler);
  };

  function observableDelayTimeSpan(source, dueTime, scheduler) {
    return new AnonymousObservable(function (observer) {
      var active = false,
          cancelable = new SerialDisposable(),
          exception = null,
          q = [],
          running = false,
          subscription;
      subscription = source.materialize().timestamp(scheduler).subscribe(function (notification) {
        var d, shouldRun;
        if (notification.value.kind === "E") {
          q = [];
          q.push(notification);
          exception = notification.value.exception;
          shouldRun = !running;
        } else {
          q.push({ value: notification.value, timestamp: notification.timestamp + dueTime });
          shouldRun = !active;
          active = true;
        }
        if (shouldRun) {
          if (exception !== null) {
            observer.onError(exception);
          } else {
            d = new SingleAssignmentDisposable();
            cancelable.setDisposable(d);
            d.setDisposable(scheduler.scheduleRecursiveWithRelative(dueTime, function (self) {
              var e, recurseDueTime, result, shouldRecurse;
              if (exception !== null) {
                return;
              }
              running = true;
              do {
                result = null;
                if (q.length > 0 && q[0].timestamp - scheduler.now() <= 0) {
                  result = q.shift().value;
                }
                if (result !== null) {
                  result.accept(observer);
                }
              } while (result !== null);
              shouldRecurse = false;
              recurseDueTime = 0;
              if (q.length > 0) {
                shouldRecurse = true;
                recurseDueTime = Math.max(0, q[0].timestamp - scheduler.now());
              } else {
                active = false;
              }
              e = exception;
              running = false;
              if (e !== null) {
                observer.onError(e);
              } else if (shouldRecurse) {
                self(recurseDueTime);
              }
            }));
          }
        }
      });
      return new CompositeDisposable(subscription, cancelable);
    }, source);
  }

  function observableDelayDate(source, dueTime, scheduler) {
    return observableDefer(function () {
      return observableDelayTimeSpan(source, dueTime - scheduler.now(), scheduler);
    });
  }

  /**
   *  Time shifts the observable sequence by dueTime. The relative time intervals between the values are preserved.
   *
   * @example
   *  1 - res = Rx.Observable.delay(new Date());
   *  2 - res = Rx.Observable.delay(new Date(), Rx.Scheduler.timeout);
   *
   *  3 - res = Rx.Observable.delay(5000);
   *  4 - res = Rx.Observable.delay(5000, 1000, Rx.Scheduler.timeout);
   * @memberOf Observable#
   * @param {Number} dueTime Absolute (specified as a Date object) or relative time (specified as an integer denoting milliseconds) by which to shift the observable sequence.
   * @param {Scheduler} [scheduler] Scheduler to run the delay timers on. If not specified, the timeout scheduler is used.
   * @returns {Observable} Time-shifted sequence.
   */
  observableProto.delay = function (dueTime, scheduler) {
    isScheduler(scheduler) || (scheduler = timeoutScheduler);
    return dueTime instanceof Date ? observableDelayDate(this, dueTime.getTime(), scheduler) : observableDelayTimeSpan(this, dueTime, scheduler);
  };

  /**
   *  Ignores values from an observable sequence which are followed by another value before dueTime.
   * @param {Number} dueTime Duration of the debounce period for each value (specified as an integer denoting milliseconds).
   * @param {Scheduler} [scheduler]  Scheduler to run the debounce timers on. If not specified, the timeout scheduler is used.
   * @returns {Observable} The debounced sequence.
   */
  observableProto.debounce = observableProto.throttleWithTimeout = function (dueTime, scheduler) {
    isScheduler(scheduler) || (scheduler = timeoutScheduler);
    var source = this;
    return new AnonymousObservable(function (observer) {
      var cancelable = new SerialDisposable(),
          hasvalue = false,
          value,
          id = 0;
      var subscription = source.subscribe(function (x) {
        hasvalue = true;
        value = x;
        id++;
        var currentId = id,
            d = new SingleAssignmentDisposable();
        cancelable.setDisposable(d);
        d.setDisposable(scheduler.scheduleWithRelative(dueTime, function () {
          hasvalue && id === currentId && observer.onNext(value);
          hasvalue = false;
        }));
      }, function (e) {
        cancelable.dispose();
        observer.onError(e);
        hasvalue = false;
        id++;
      }, function () {
        cancelable.dispose();
        hasvalue && observer.onNext(value);
        observer.onCompleted();
        hasvalue = false;
        id++;
      });
      return new CompositeDisposable(subscription, cancelable);
    }, this);
  };

  /**
   * @deprecated use #debounce or #throttleWithTimeout instead.
   */
  observableProto.throttle = function (dueTime, scheduler) {
    //deprecate('throttle', 'debounce or throttleWithTimeout');
    return this.debounce(dueTime, scheduler);
  };

  /**
   *  Records the timestamp for each value in an observable sequence.
   *
   * @example
   *  1 - res = source.timestamp(); // produces { value: x, timestamp: ts }
   *  2 - res = source.timestamp(Rx.Scheduler.timeout);
   *
   * @param {Scheduler} [scheduler]  Scheduler used to compute timestamps. If not specified, the timeout scheduler is used.
   * @returns {Observable} An observable sequence with timestamp information on values.
   */
  observableProto.timestamp = function (scheduler) {
    isScheduler(scheduler) || (scheduler = timeoutScheduler);
    return this.map(function (x) {
      return { value: x, timestamp: scheduler.now() };
    });
  };

  function sampleObservable(source, sampler) {
    return new AnonymousObservable(function (observer) {
      var atEnd, value, hasValue;

      function sampleSubscribe() {
        if (hasValue) {
          hasValue = false;
          observer.onNext(value);
        }
        atEnd && observer.onCompleted();
      }

      return new CompositeDisposable(source.subscribe(function (newValue) {
        hasValue = true;
        value = newValue;
      }, observer.onError.bind(observer), function () {
        atEnd = true;
      }), sampler.subscribe(sampleSubscribe, observer.onError.bind(observer), sampleSubscribe));
    }, source);
  }

  /**
   *  Samples the observable sequence at each interval.
   *
   * @example
   *  1 - res = source.sample(sampleObservable); // Sampler tick sequence
   *  2 - res = source.sample(5000); // 5 seconds
   *  2 - res = source.sample(5000, Rx.Scheduler.timeout); // 5 seconds
   *
   * @param {Mixed} intervalOrSampler Interval at which to sample (specified as an integer denoting milliseconds) or Sampler Observable.
   * @param {Scheduler} [scheduler]  Scheduler to run the sampling timer on. If not specified, the timeout scheduler is used.
   * @returns {Observable} Sampled observable sequence.
   */
  observableProto.sample = observableProto.throttleLatest = function (intervalOrSampler, scheduler) {
    isScheduler(scheduler) || (scheduler = timeoutScheduler);
    return typeof intervalOrSampler === "number" ? sampleObservable(this, observableinterval(intervalOrSampler, scheduler)) : sampleObservable(this, intervalOrSampler);
  };

  /**
   *  Returns the source observable sequence or the other observable sequence if dueTime elapses.
   * @param {Number} dueTime Absolute (specified as a Date object) or relative time (specified as an integer denoting milliseconds) when a timeout occurs.
   * @param {Observable} [other]  Sequence to return in case of a timeout. If not specified, a timeout error throwing sequence will be used.
   * @param {Scheduler} [scheduler]  Scheduler to run the timeout timers on. If not specified, the timeout scheduler is used.
   * @returns {Observable} The source sequence switching to the other sequence in case of a timeout.
   */
  observableProto.timeout = function (dueTime, other, scheduler) {
    (other == null || typeof other === "string") && (other = observableThrow(new Error(other || "Timeout")));
    isScheduler(scheduler) || (scheduler = timeoutScheduler);

    var source = this,
        schedulerMethod = dueTime instanceof Date ? "scheduleWithAbsolute" : "scheduleWithRelative";

    return new AnonymousObservable(function (observer) {
      var id = 0,
          original = new SingleAssignmentDisposable(),
          subscription = new SerialDisposable(),
          switched = false,
          timer = new SerialDisposable();

      subscription.setDisposable(original);

      function createTimer() {
        var myId = id;
        timer.setDisposable(scheduler[schedulerMethod](dueTime, function () {
          if (id === myId) {
            isPromise(other) && (other = observableFromPromise(other));
            subscription.setDisposable(other.subscribe(observer));
          }
        }));
      }

      createTimer();

      original.setDisposable(source.subscribe(function (x) {
        if (!switched) {
          id++;
          observer.onNext(x);
          createTimer();
        }
      }, function (e) {
        if (!switched) {
          id++;
          observer.onError(e);
        }
      }, function () {
        if (!switched) {
          id++;
          observer.onCompleted();
        }
      }));
      return new CompositeDisposable(subscription, timer);
    }, source);
  };

  /**
   * Returns an Observable that emits only the first item emitted by the source Observable during sequential time windows of a specified duration.
   * @param {Number} windowDuration time to wait before emitting another item after emitting the last item
   * @param {Scheduler} [scheduler] the Scheduler to use internally to manage the timers that handle timeout for each item. If not provided, defaults to Scheduler.timeout.
   * @returns {Observable} An Observable that performs the throttle operation.
   */
  observableProto.throttleFirst = function (windowDuration, scheduler) {
    isScheduler(scheduler) || (scheduler = timeoutScheduler);
    var duration = +windowDuration || 0;
    if (duration <= 0) {
      throw new RangeError("windowDuration cannot be less or equal zero.");
    }
    var source = this;
    return new AnonymousObservable(function (o) {
      var lastOnNext = 0;
      return source.subscribe(function (x) {
        var now = scheduler.now();
        if (lastOnNext === 0 || now - lastOnNext >= duration) {
          lastOnNext = now;
          o.onNext(x);
        }
      }, function (e) {
        o.onError(e);
      }, function () {
        o.onCompleted();
      });
    }, source);
  };

  var PausableObservable = (function (__super__) {
    inherits(PausableObservable, __super__);

    function subscribe(observer) {
      var conn = this.source.publish(),
          subscription = conn.subscribe(observer),
          connection = disposableEmpty;

      var pausable = this.pauser.distinctUntilChanged().subscribe(function (b) {
        if (b) {
          connection = conn.connect();
        } else {
          connection.dispose();
          connection = disposableEmpty;
        }
      });

      return new CompositeDisposable(subscription, connection, pausable);
    }

    function PausableObservable(source, pauser) {
      this.source = source;
      this.controller = new Subject();

      if (pauser && pauser.subscribe) {
        this.pauser = this.controller.merge(pauser);
      } else {
        this.pauser = this.controller;
      }

      __super__.call(this, subscribe, source);
    }

    PausableObservable.prototype.pause = function () {
      this.controller.onNext(false);
    };

    PausableObservable.prototype.resume = function () {
      this.controller.onNext(true);
    };

    return PausableObservable;
  })(Observable);

  /**
   * Pauses the underlying observable sequence based upon the observable sequence which yields true/false.
   * @example
   * var pauser = new Rx.Subject();
   * var source = Rx.Observable.interval(100).pausable(pauser);
   * @param {Observable} pauser The observable sequence used to pause the underlying sequence.
   * @returns {Observable} The observable sequence which is paused based upon the pauser.
   */
  observableProto.pausable = function (pauser) {
    return new PausableObservable(this, pauser);
  };

  function combineLatestSource(source, subject, resultSelector) {
    return new AnonymousObservable(function (o) {
      var hasValue = [false, false],
          hasValueAll = false,
          isDone = false,
          values = new Array(2),
          err;

      function next(x, i) {
        values[i] = x;
        var res;
        hasValue[i] = true;
        if (hasValueAll || (hasValueAll = hasValue.every(identity))) {
          if (err) {
            o.onError(err);
            return;
          }

          try {
            res = resultSelector.apply(null, values);
          } catch (ex) {
            o.onError(ex);
            return;
          }
          o.onNext(res);
        }
        if (isDone && values[1]) {
          o.onCompleted();
        }
      }

      return new CompositeDisposable(source.subscribe(function (x) {
        next(x, 0);
      }, function (e) {
        if (values[1]) {
          o.onError(e);
        } else {
          err = e;
        }
      }, function () {
        isDone = true;
        values[1] && o.onCompleted();
      }), subject.subscribe(function (x) {
        next(x, 1);
      }, function (e) {
        o.onError(e);
      }, function () {
        isDone = true;
        next(true, 1);
      }));
    }, source);
  }

  var PausableBufferedObservable = (function (__super__) {
    inherits(PausableBufferedObservable, __super__);

    function subscribe(o) {
      var q = [],
          previousShouldFire;

      var subscription = combineLatestSource(this.source, this.pauser.distinctUntilChanged().startWith(false), function (data, shouldFire) {
        return { data: data, shouldFire: shouldFire };
      }).subscribe(function (results) {
        if (previousShouldFire !== undefined && results.shouldFire != previousShouldFire) {
          previousShouldFire = results.shouldFire;
          // change in shouldFire
          if (results.shouldFire) {
            while (q.length > 0) {
              o.onNext(q.shift());
            }
          }
        } else {
          previousShouldFire = results.shouldFire;
          // new data
          if (results.shouldFire) {
            o.onNext(results.data);
          } else {
            q.push(results.data);
          }
        }
      }, function (err) {
        // Empty buffer before sending error
        while (q.length > 0) {
          o.onNext(q.shift());
        }
        o.onError(err);
      }, function () {
        // Empty buffer before sending completion
        while (q.length > 0) {
          o.onNext(q.shift());
        }
        o.onCompleted();
      });
      return subscription;
    }

    function PausableBufferedObservable(source, pauser) {
      this.source = source;
      this.controller = new Subject();

      if (pauser && pauser.subscribe) {
        this.pauser = this.controller.merge(pauser);
      } else {
        this.pauser = this.controller;
      }

      __super__.call(this, subscribe, source);
    }

    PausableBufferedObservable.prototype.pause = function () {
      this.controller.onNext(false);
    };

    PausableBufferedObservable.prototype.resume = function () {
      this.controller.onNext(true);
    };

    return PausableBufferedObservable;
  })(Observable);

  /**
   * Pauses the underlying observable sequence based upon the observable sequence which yields true/false,
   * and yields the values that were buffered while paused.
   * @example
   * var pauser = new Rx.Subject();
   * var source = Rx.Observable.interval(100).pausableBuffered(pauser);
   * @param {Observable} pauser The observable sequence used to pause the underlying sequence.
   * @returns {Observable} The observable sequence which is paused based upon the pauser.
   */
  observableProto.pausableBuffered = function (subject) {
    return new PausableBufferedObservable(this, subject);
  };

  var ControlledObservable = (function (__super__) {
    inherits(ControlledObservable, __super__);

    function subscribe(observer) {
      return this.source.subscribe(observer);
    }

    function ControlledObservable(source, enableQueue) {
      __super__.call(this, subscribe, source);
      this.subject = new ControlledSubject(enableQueue);
      this.source = source.multicast(this.subject).refCount();
    }

    ControlledObservable.prototype.request = function (numberOfItems) {
      if (numberOfItems == null) {
        numberOfItems = -1;
      }
      return this.subject.request(numberOfItems);
    };

    return ControlledObservable;
  })(Observable);

  var ControlledSubject = (function (__super__) {
    function subscribe(observer) {
      return this.subject.subscribe(observer);
    }

    inherits(ControlledSubject, __super__);

    function ControlledSubject(enableQueue) {
      enableQueue == null && (enableQueue = true);

      __super__.call(this, subscribe);
      this.subject = new Subject();
      this.enableQueue = enableQueue;
      this.queue = enableQueue ? [] : null;
      this.requestedCount = 0;
      this.requestedDisposable = disposableEmpty;
      this.error = null;
      this.hasFailed = false;
      this.hasCompleted = false;
      this.controlledDisposable = disposableEmpty;
    }

    addProperties(ControlledSubject.prototype, Observer, {
      onCompleted: function () {
        this.hasCompleted = true;
        (!this.enableQueue || this.queue.length === 0) && this.subject.onCompleted();
      },
      onError: function (error) {
        this.hasFailed = true;
        this.error = error;
        (!this.enableQueue || this.queue.length === 0) && this.subject.onError(error);
      },
      onNext: function (value) {
        var hasRequested = false;

        if (this.requestedCount === 0) {
          this.enableQueue && this.queue.push(value);
        } else {
          this.requestedCount !== -1 && this.requestedCount-- === 0 && this.disposeCurrentRequest();
          hasRequested = true;
        }
        hasRequested && this.subject.onNext(value);
      },
      _processRequest: function (numberOfItems) {
        if (this.enableQueue) {
          while (this.queue.length >= numberOfItems && numberOfItems > 0) {
            this.subject.onNext(this.queue.shift());
            numberOfItems--;
          }

          return this.queue.length !== 0 ? { numberOfItems: numberOfItems, returnValue: true } : { numberOfItems: numberOfItems, returnValue: false };
        }

        if (this.hasFailed) {
          this.subject.onError(this.error);
          this.controlledDisposable.dispose();
          this.controlledDisposable = disposableEmpty;
        } else if (this.hasCompleted) {
          this.subject.onCompleted();
          this.controlledDisposable.dispose();
          this.controlledDisposable = disposableEmpty;
        }

        return { numberOfItems: numberOfItems, returnValue: false };
      },
      request: function (number) {
        this.disposeCurrentRequest();
        var self = this,
            r = this._processRequest(number);

        var number = r.numberOfItems;
        if (!r.returnValue) {
          this.requestedCount = number;
          this.requestedDisposable = disposableCreate(function () {
            self.requestedCount = 0;
          });

          return this.requestedDisposable;
        } else {
          return disposableEmpty;
        }
      },
      disposeCurrentRequest: function () {
        this.requestedDisposable.dispose();
        this.requestedDisposable = disposableEmpty;
      }
    });

    return ControlledSubject;
  })(Observable);

  /**
   * Attaches a controller to the observable sequence with the ability to queue.
   * @example
   * var source = Rx.Observable.interval(100).controlled();
   * source.request(3); // Reads 3 values
   * @param {Observable} pauser The observable sequence used to pause the underlying sequence.
   * @returns {Observable} The observable sequence which is paused based upon the pauser.
   */
  observableProto.controlled = function (enableQueue) {
    if (enableQueue == null) {
      enableQueue = true;
    }
    return new ControlledObservable(this, enableQueue);
  };

  /**
   * Executes a transducer to transform the observable sequence
   * @param {Transducer} transducer A transducer to execute
   * @returns {Observable} An Observable sequence containing the results from the transducer.
   */
  observableProto.transduce = function (transducer) {
    var source = this;

    function transformForObserver(observer) {
      return {
        init: function () {
          return observer;
        },
        step: function (obs, input) {
          return obs.onNext(input);
        },
        result: function (obs) {
          return obs.onCompleted();
        }
      };
    }

    return new AnonymousObservable(function (observer) {
      var xform = transducer(transformForObserver(observer));
      return source.subscribe(function (v) {
        try {
          xform.step(observer, v);
        } catch (e) {
          observer.onError(e);
        }
      }, observer.onError.bind(observer), function () {
        xform.result(observer);
      });
    }, source);
  };

  var AnonymousObservable = Rx.AnonymousObservable = (function (__super__) {
    inherits(AnonymousObservable, __super__);

    // Fix subscriber to check for undefined or function returned to decorate as Disposable
    function fixSubscriber(subscriber) {
      if (subscriber && typeof subscriber.dispose === "function") {
        return subscriber;
      }

      return typeof subscriber === "function" ? disposableCreate(subscriber) : disposableEmpty;
    }

    function setDisposable(s, state) {
      var ado = state[0],
          subscribe = state[1];
      try {
        ado.setDisposable(fixSubscriber(subscribe(ado)));
      } catch (e) {
        if (!ado.fail(e)) {
          throw e;
        }
      }
    }

    function AnonymousObservable(subscribe, parent) {
      this.source = parent;

      function s(observer) {
        var ado = new AutoDetachObserver(observer),
            state = [ado, subscribe];

        if (currentThreadScheduler.scheduleRequired()) {
          currentThreadScheduler.scheduleWithState(state, setDisposable);
        } else {
          setDisposable(null, state);
        }

        return ado;
      }

      __super__.call(this, s);
    }

    return AnonymousObservable;
  })(Observable);

  var AutoDetachObserver = (function (__super__) {
    inherits(AutoDetachObserver, __super__);

    function AutoDetachObserver(observer) {
      __super__.call(this);
      this.observer = observer;
      this.m = new SingleAssignmentDisposable();
    }

    var AutoDetachObserverPrototype = AutoDetachObserver.prototype;

    AutoDetachObserverPrototype.next = function (value) {
      var noError = false;
      try {
        this.observer.onNext(value);
        noError = true;
      } catch (e) {
        throw e;
      } finally {
        !noError && this.dispose();
      }
    };

    AutoDetachObserverPrototype.error = function (err) {
      try {
        this.observer.onError(err);
      } catch (e) {
        throw e;
      } finally {
        this.dispose();
      }
    };

    AutoDetachObserverPrototype.completed = function () {
      try {
        this.observer.onCompleted();
      } catch (e) {
        throw e;
      } finally {
        this.dispose();
      }
    };

    AutoDetachObserverPrototype.setDisposable = function (value) {
      this.m.setDisposable(value);
    };
    AutoDetachObserverPrototype.getDisposable = function () {
      return this.m.getDisposable();
    };

    AutoDetachObserverPrototype.dispose = function () {
      __super__.prototype.dispose.call(this);
      this.m.dispose();
    };

    return AutoDetachObserver;
  })(AbstractObserver);

  var InnerSubscription = function (subject, observer) {
    this.subject = subject;
    this.observer = observer;
  };

  InnerSubscription.prototype.dispose = function () {
    if (!this.subject.isDisposed && this.observer !== null) {
      var idx = this.subject.observers.indexOf(this.observer);
      this.subject.observers.splice(idx, 1);
      this.observer = null;
    }
  };

  /**
   *  Represents an object that is both an observable sequence as well as an observer.
   *  Each notification is broadcasted to all subscribed observers.
   */
  var Subject = Rx.Subject = (function (__super__) {
    function subscribe(observer) {
      checkDisposed(this);
      if (!this.isStopped) {
        this.observers.push(observer);
        return new InnerSubscription(this, observer);
      }
      if (this.hasError) {
        observer.onError(this.error);
        return disposableEmpty;
      }
      observer.onCompleted();
      return disposableEmpty;
    }

    inherits(Subject, __super__);

    /**
     * Creates a subject.
     */
    function Subject() {
      __super__.call(this, subscribe);
      this.isDisposed = false, this.isStopped = false, this.observers = [];
      this.hasError = false;
    }

    addProperties(Subject.prototype, Observer.prototype, {
      /**
       * Indicates whether the subject has observers subscribed to it.
       * @returns {Boolean} Indicates whether the subject has observers subscribed to it.
       */
      hasObservers: function () {
        return this.observers.length > 0;
      },
      /**
       * Notifies all subscribed observers about the end of the sequence.
       */
      onCompleted: function () {
        checkDisposed(this);
        if (!this.isStopped) {
          this.isStopped = true;
          for (var i = 0, os = cloneArray(this.observers), len = os.length; i < len; i++) {
            os[i].onCompleted();
          }

          this.observers.length = 0;
        }
      },
      /**
       * Notifies all subscribed observers about the exception.
       * @param {Mixed} error The exception to send to all observers.
       */
      onError: function (error) {
        checkDisposed(this);
        if (!this.isStopped) {
          this.isStopped = true;
          this.error = error;
          this.hasError = true;
          for (var i = 0, os = cloneArray(this.observers), len = os.length; i < len; i++) {
            os[i].onError(error);
          }

          this.observers.length = 0;
        }
      },
      /**
       * Notifies all subscribed observers about the arrival of the specified element in the sequence.
       * @param {Mixed} value The value to send to all observers.
       */
      onNext: function (value) {
        checkDisposed(this);
        if (!this.isStopped) {
          for (var i = 0, os = cloneArray(this.observers), len = os.length; i < len; i++) {
            os[i].onNext(value);
          }
        }
      },
      /**
       * Unsubscribe all observers and release resources.
       */
      dispose: function () {
        this.isDisposed = true;
        this.observers = null;
      }
    });

    /**
     * Creates a subject from the specified observer and observable.
     * @param {Observer} observer The observer used to send messages to the subject.
     * @param {Observable} observable The observable used to subscribe to messages sent from the subject.
     * @returns {Subject} Subject implemented using the given observer and observable.
     */
    Subject.create = function (observer, observable) {
      return new AnonymousSubject(observer, observable);
    };

    return Subject;
  })(Observable);

  /**
   *  Represents the result of an asynchronous operation.
   *  The last value before the OnCompleted notification, or the error received through OnError, is sent to all subscribed observers.
   */
  var AsyncSubject = Rx.AsyncSubject = (function (__super__) {
    function subscribe(observer) {
      checkDisposed(this);

      if (!this.isStopped) {
        this.observers.push(observer);
        return new InnerSubscription(this, observer);
      }

      if (this.hasError) {
        observer.onError(this.error);
      } else if (this.hasValue) {
        observer.onNext(this.value);
        observer.onCompleted();
      } else {
        observer.onCompleted();
      }

      return disposableEmpty;
    }

    inherits(AsyncSubject, __super__);

    /**
     * Creates a subject that can only receive one value and that value is cached for all future observations.
     * @constructor
     */
    function AsyncSubject() {
      __super__.call(this, subscribe);

      this.isDisposed = false;
      this.isStopped = false;
      this.hasValue = false;
      this.observers = [];
      this.hasError = false;
    }

    addProperties(AsyncSubject.prototype, Observer, {
      /**
       * Indicates whether the subject has observers subscribed to it.
       * @returns {Boolean} Indicates whether the subject has observers subscribed to it.
       */
      hasObservers: function () {
        checkDisposed(this);
        return this.observers.length > 0;
      },
      /**
       * Notifies all subscribed observers about the end of the sequence, also causing the last received value to be sent out (if any).
       */
      onCompleted: function () {
        var i, len;
        checkDisposed(this);
        if (!this.isStopped) {
          this.isStopped = true;
          var os = cloneArray(this.observers),
              len = os.length;

          if (this.hasValue) {
            for (i = 0; i < len; i++) {
              var o = os[i];
              o.onNext(this.value);
              o.onCompleted();
            }
          } else {
            for (i = 0; i < len; i++) {
              os[i].onCompleted();
            }
          }

          this.observers.length = 0;
        }
      },
      /**
       * Notifies all subscribed observers about the error.
       * @param {Mixed} error The Error to send to all observers.
       */
      onError: function (error) {
        checkDisposed(this);
        if (!this.isStopped) {
          this.isStopped = true;
          this.hasError = true;
          this.error = error;

          for (var i = 0, os = cloneArray(this.observers), len = os.length; i < len; i++) {
            os[i].onError(error);
          }

          this.observers.length = 0;
        }
      },
      /**
       * Sends a value to the subject. The last value received before successful termination will be sent to all subscribed and future observers.
       * @param {Mixed} value The value to store in the subject.
       */
      onNext: function (value) {
        checkDisposed(this);
        if (this.isStopped) {
          return;
        }
        this.value = value;
        this.hasValue = true;
      },
      /**
       * Unsubscribe all observers and release resources.
       */
      dispose: function () {
        this.isDisposed = true;
        this.observers = null;
        this.exception = null;
        this.value = null;
      }
    });

    return AsyncSubject;
  })(Observable);

  var AnonymousSubject = Rx.AnonymousSubject = (function (__super__) {
    inherits(AnonymousSubject, __super__);

    function subscribe(observer) {
      return this.observable.subscribe(observer);
    }

    function AnonymousSubject(observer, observable) {
      this.observer = observer;
      this.observable = observable;
      __super__.call(this, subscribe);
    }

    addProperties(AnonymousSubject.prototype, Observer.prototype, {
      onCompleted: function () {
        this.observer.onCompleted();
      },
      onError: function (error) {
        this.observer.onError(error);
      },
      onNext: function (value) {
        this.observer.onNext(value);
      }
    });

    return AnonymousSubject;
  })(Observable);

  /**
   *  Represents a value that changes over time.
   *  Observers can subscribe to the subject to receive the last (or initial) value and all subsequent notifications.
   */
  var BehaviorSubject = Rx.BehaviorSubject = (function (__super__) {
    function subscribe(observer) {
      checkDisposed(this);
      if (!this.isStopped) {
        this.observers.push(observer);
        observer.onNext(this.value);
        return new InnerSubscription(this, observer);
      }
      if (this.hasError) {
        observer.onError(this.error);
      } else {
        observer.onCompleted();
      }
      return disposableEmpty;
    }

    inherits(BehaviorSubject, __super__);

    /**
     *  Initializes a new instance of the BehaviorSubject class which creates a subject that caches its last value and starts with the specified value.
     *  @param {Mixed} value Initial value sent to observers when no other value has been received by the subject yet.
     */
    function BehaviorSubject(value) {
      __super__.call(this, subscribe);
      this.value = value, this.observers = [], this.isDisposed = false, this.isStopped = false, this.hasError = false;
    }

    addProperties(BehaviorSubject.prototype, Observer, {
      /**
       * Indicates whether the subject has observers subscribed to it.
       * @returns {Boolean} Indicates whether the subject has observers subscribed to it.
       */
      hasObservers: function () {
        return this.observers.length > 0;
      },
      /**
       * Notifies all subscribed observers about the end of the sequence.
       */
      onCompleted: function () {
        checkDisposed(this);
        if (this.isStopped) {
          return;
        }
        this.isStopped = true;
        for (var i = 0, os = cloneArray(this.observers), len = os.length; i < len; i++) {
          os[i].onCompleted();
        }

        this.observers.length = 0;
      },
      /**
       * Notifies all subscribed observers about the exception.
       * @param {Mixed} error The exception to send to all observers.
       */
      onError: function (error) {
        checkDisposed(this);
        if (this.isStopped) {
          return;
        }
        this.isStopped = true;
        this.hasError = true;
        this.error = error;

        for (var i = 0, os = cloneArray(this.observers), len = os.length; i < len; i++) {
          os[i].onError(error);
        }

        this.observers.length = 0;
      },
      /**
       * Notifies all subscribed observers about the arrival of the specified element in the sequence.
       * @param {Mixed} value The value to send to all observers.
       */
      onNext: function (value) {
        checkDisposed(this);
        if (this.isStopped) {
          return;
        }
        this.value = value;
        for (var i = 0, os = cloneArray(this.observers), len = os.length; i < len; i++) {
          os[i].onNext(value);
        }
      },
      /**
       * Unsubscribe all observers and release resources.
       */
      dispose: function () {
        this.isDisposed = true;
        this.observers = null;
        this.value = null;
        this.exception = null;
      }
    });

    return BehaviorSubject;
  })(Observable);

  /**
   * Represents an object that is both an observable sequence as well as an observer.
   * Each notification is broadcasted to all subscribed and future observers, subject to buffer trimming policies.
   */
  var ReplaySubject = Rx.ReplaySubject = (function (__super__) {
    function createRemovableDisposable(subject, observer) {
      return disposableCreate(function () {
        observer.dispose();
        !subject.isDisposed && subject.observers.splice(subject.observers.indexOf(observer), 1);
      });
    }

    function subscribe(observer) {
      var so = new ScheduledObserver(this.scheduler, observer),
          subscription = createRemovableDisposable(this, so);
      checkDisposed(this);
      this._trim(this.scheduler.now());
      this.observers.push(so);

      for (var i = 0, len = this.q.length; i < len; i++) {
        so.onNext(this.q[i].value);
      }

      if (this.hasError) {
        so.onError(this.error);
      } else if (this.isStopped) {
        so.onCompleted();
      }

      so.ensureActive();
      return subscription;
    }

    inherits(ReplaySubject, __super__);

    /**
     *  Initializes a new instance of the ReplaySubject class with the specified buffer size, window size and scheduler.
     *  @param {Number} [bufferSize] Maximum element count of the replay buffer.
     *  @param {Number} [windowSize] Maximum time length of the replay buffer.
     *  @param {Scheduler} [scheduler] Scheduler the observers are invoked on.
     */
    function ReplaySubject(bufferSize, windowSize, scheduler) {
      this.bufferSize = bufferSize == null ? Number.MAX_VALUE : bufferSize;
      this.windowSize = windowSize == null ? Number.MAX_VALUE : windowSize;
      this.scheduler = scheduler || currentThreadScheduler;
      this.q = [];
      this.observers = [];
      this.isStopped = false;
      this.isDisposed = false;
      this.hasError = false;
      this.error = null;
      __super__.call(this, subscribe);
    }

    addProperties(ReplaySubject.prototype, Observer.prototype, {
      /**
       * Indicates whether the subject has observers subscribed to it.
       * @returns {Boolean} Indicates whether the subject has observers subscribed to it.
       */
      hasObservers: function () {
        return this.observers.length > 0;
      },
      _trim: function (now) {
        while (this.q.length > this.bufferSize) {
          this.q.shift();
        }
        while (this.q.length > 0 && now - this.q[0].interval > this.windowSize) {
          this.q.shift();
        }
      },
      /**
       * Notifies all subscribed observers about the arrival of the specified element in the sequence.
       * @param {Mixed} value The value to send to all observers.
       */
      onNext: function (value) {
        checkDisposed(this);
        if (this.isStopped) {
          return;
        }
        var now = this.scheduler.now();
        this.q.push({ interval: now, value: value });
        this._trim(now);

        for (var i = 0, os = cloneArray(this.observers), len = os.length; i < len; i++) {
          var observer = os[i];
          observer.onNext(value);
          observer.ensureActive();
        }
      },
      /**
       * Notifies all subscribed observers about the exception.
       * @param {Mixed} error The exception to send to all observers.
       */
      onError: function (error) {
        checkDisposed(this);
        if (this.isStopped) {
          return;
        }
        this.isStopped = true;
        this.error = error;
        this.hasError = true;
        var now = this.scheduler.now();
        this._trim(now);
        for (var i = 0, os = cloneArray(this.observers), len = os.length; i < len; i++) {
          var observer = os[i];
          observer.onError(error);
          observer.ensureActive();
        }
        this.observers.length = 0;
      },
      /**
       * Notifies all subscribed observers about the end of the sequence.
       */
      onCompleted: function () {
        checkDisposed(this);
        if (this.isStopped) {
          return;
        }
        this.isStopped = true;
        var now = this.scheduler.now();
        this._trim(now);
        for (var i = 0, os = cloneArray(this.observers), len = os.length; i < len; i++) {
          var observer = os[i];
          observer.onCompleted();
          observer.ensureActive();
        }
        this.observers.length = 0;
      },
      /**
       * Unsubscribe all observers and release resources.
       */
      dispose: function () {
        this.isDisposed = true;
        this.observers = null;
      }
    });

    return ReplaySubject;
  })(Observable);

  /**
  * Used to pause and resume streams.
  */
  Rx.Pauser = (function (__super__) {
    inherits(Pauser, __super__);

    function Pauser() {
      __super__.call(this);
    }

    /**
     * Pauses the underlying sequence.
     */
    Pauser.prototype.pause = function () {
      this.onNext(false);
    };

    /**
    * Resumes the underlying sequence.
    */
    Pauser.prototype.resume = function () {
      this.onNext(true);
    };

    return Pauser;
  })(Subject);

  if (typeof define == "function" && typeof define.amd == "object" && define.amd) {
    root.Rx = Rx;

    define(function () {
      return Rx;
    });
  } else if (freeExports && freeModule) {
    // in Node.js or RingoJS
    if (moduleExports) {
      (freeModule.exports = Rx).Rx = Rx;
    } else {
      freeExports.Rx = Rx;
    }
  } else {
    // in a browser or Rhino
    root.Rx = Rx;
  }

  // All code before this point will be filtered from stack traces.
  var rEndingLine = captureLine();
}).call(this);
// but treat `-0` vs. `+0` as not equal

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"oMfpAn":3}],2:[function(require,module,exports){
/*! VelocityJS.org (1.2.1). (C) 2014 Julian Shapiro. MIT @license: en.wikipedia.org/wiki/MIT_License */

/*************************
   Velocity jQuery Shim
*************************/

/*! VelocityJS.org jQuery Shim (1.0.1). (C) 2014 The jQuery Foundation. MIT @license: en.wikipedia.org/wiki/MIT_License. */

/* This file contains the jQuery functions that Velocity relies on, thereby removing Velocity's dependency on a full copy of jQuery, and allowing it to work in any environment. */
/* These shimmed functions are only used if jQuery isn't present. If both this shim and jQuery are loaded, Velocity defaults to jQuery proper. */
/* Browser support: Using this shim instead of jQuery proper removes support for IE8. */

;(function (window) {
    /***************
         Setup
    ***************/

    /* If jQuery is already loaded, there's no point in loading this shim. */
    if (window.jQuery) {
        return;
    }

    /* jQuery base. */
    var $ = function (selector, context) {
        return new $.fn.init(selector, context);
    };

    /********************
       Private Methods
    ********************/

    /* jQuery */
    $.isWindow = function (obj) {
        /* jshint eqeqeq: false */
        return obj != null && obj == obj.window;
    };

    /* jQuery */
    $.type = function (obj) {
        if (obj == null) {
            return obj + "";
        }

        return typeof obj === "object" || typeof obj === "function" ? class2type[toString.call(obj)] || "object" : typeof obj;
    };

    /* jQuery */
    $.isArray = Array.isArray || function (obj) {
        return $.type(obj) === "array";
    };

    /* jQuery */
    function isArraylike(obj) {
        var length = obj.length,
            type = $.type(obj);

        if (type === "function" || $.isWindow(obj)) {
            return false;
        }

        if (obj.nodeType === 1 && length) {
            return true;
        }

        return type === "array" || length === 0 || typeof length === "number" && length > 0 && length - 1 in obj;
    }

    /***************
       $ Methods
    ***************/

    /* jQuery: Support removed for IE<9. */
    $.isPlainObject = function (obj) {
        var key;

        if (!obj || $.type(obj) !== "object" || obj.nodeType || $.isWindow(obj)) {
            return false;
        }

        try {
            if (obj.constructor && !hasOwn.call(obj, "constructor") && !hasOwn.call(obj.constructor.prototype, "isPrototypeOf")) {
                return false;
            }
        } catch (e) {
            return false;
        }

        for (key in obj) {}

        return key === undefined || hasOwn.call(obj, key);
    };

    /* jQuery */
    $.each = function (obj, callback, args) {
        var value,
            i = 0,
            length = obj.length,
            isArray = isArraylike(obj);

        if (args) {
            if (isArray) {
                for (; i < length; i++) {
                    value = callback.apply(obj[i], args);

                    if (value === false) {
                        break;
                    }
                }
            } else {
                for (i in obj) {
                    value = callback.apply(obj[i], args);

                    if (value === false) {
                        break;
                    }
                }
            }
        } else {
            if (isArray) {
                for (; i < length; i++) {
                    value = callback.call(obj[i], i, obj[i]);

                    if (value === false) {
                        break;
                    }
                }
            } else {
                for (i in obj) {
                    value = callback.call(obj[i], i, obj[i]);

                    if (value === false) {
                        break;
                    }
                }
            }
        }

        return obj;
    };

    /* Custom */
    $.data = function (node, key, value) {
        /* $.getData() */
        if (value === undefined) {
            var id = node[$.expando],
                store = id && cache[id];

            if (key === undefined) {
                return store;
            } else if (store) {
                if (key in store) {
                    return store[key];
                }
            }
            /* $.setData() */
        } else if (key !== undefined) {
            var id = node[$.expando] || (node[$.expando] = ++$.uuid);

            cache[id] = cache[id] || {};
            cache[id][key] = value;

            return value;
        }
    };

    /* Custom */
    $.removeData = function (node, keys) {
        var id = node[$.expando],
            store = id && cache[id];

        if (store) {
            $.each(keys, function (_, key) {
                delete store[key];
            });
        }
    };

    /* jQuery */
    $.extend = function () {
        var src,
            copyIsArray,
            copy,
            name,
            options,
            clone,
            target = arguments[0] || {},
            i = 1,
            length = arguments.length,
            deep = false;

        if (typeof target === "boolean") {
            deep = target;

            target = arguments[i] || {};
            i++;
        }

        if (typeof target !== "object" && $.type(target) !== "function") {
            target = {};
        }

        if (i === length) {
            target = this;
            i--;
        }

        for (; i < length; i++) {
            if ((options = arguments[i]) != null) {
                for (name in options) {
                    src = target[name];
                    copy = options[name];

                    if (target === copy) {
                        continue;
                    }

                    if (deep && copy && ($.isPlainObject(copy) || (copyIsArray = $.isArray(copy)))) {
                        if (copyIsArray) {
                            copyIsArray = false;
                            clone = src && $.isArray(src) ? src : [];
                        } else {
                            clone = src && $.isPlainObject(src) ? src : {};
                        }

                        target[name] = $.extend(deep, clone, copy);
                    } else if (copy !== undefined) {
                        target[name] = copy;
                    }
                }
            }
        }

        return target;
    };

    /* jQuery 1.4.3 */
    $.queue = function (elem, type, data) {
        function $makeArray(arr, results) {
            var ret = results || [];

            if (arr != null) {
                if (isArraylike(Object(arr))) {
                    /* $.merge */
                    (function (first, second) {
                        var len = +second.length,
                            j = 0,
                            i = first.length;

                        while (j < len) {
                            first[i++] = second[j++];
                        }

                        if (len !== len) {
                            while (second[j] !== undefined) {
                                first[i++] = second[j++];
                            }
                        }

                        first.length = i;

                        return first;
                    })(ret, typeof arr === "string" ? [arr] : arr);
                } else {
                    [].push.call(ret, arr);
                }
            }

            return ret;
        }

        if (!elem) {
            return;
        }

        type = (type || "fx") + "queue";

        var q = $.data(elem, type);

        if (!data) {
            return q || [];
        }

        if (!q || $.isArray(data)) {
            q = $.data(elem, type, $makeArray(data));
        } else {
            q.push(data);
        }

        return q;
    };

    /* jQuery 1.4.3 */
    $.dequeue = function (elems, type) {
        /* Custom: Embed element iteration. */
        $.each(elems.nodeType ? [elems] : elems, function (i, elem) {
            type = type || "fx";

            var queue = $.queue(elem, type),
                fn = queue.shift();

            if (fn === "inprogress") {
                fn = queue.shift();
            }

            if (fn) {
                if (type === "fx") {
                    queue.unshift("inprogress");
                }

                fn.call(elem, function () {
                    $.dequeue(elem, type);
                });
            }
        });
    };

    /******************
       $.fn Methods
    ******************/

    /* jQuery */
    $.fn = $.prototype = {
        init: function (selector) {
            /* Just return the element wrapped inside an array; don't proceed with the actual jQuery node wrapping process. */
            if (selector.nodeType) {
                this[0] = selector;

                return this;
            } else {
                throw new Error("Not a DOM node.");
            }
        },

        offset: function () {
            /* jQuery altered code: Dropped disconnected DOM node checking. */
            var box = this[0].getBoundingClientRect ? this[0].getBoundingClientRect() : { top: 0, left: 0 };

            return {
                top: box.top + (window.pageYOffset || document.scrollTop || 0) - (document.clientTop || 0),
                left: box.left + (window.pageXOffset || document.scrollLeft || 0) - (document.clientLeft || 0)
            };
        },

        position: function () {
            /* jQuery */
            function offsetParent() {
                var offsetParent = this.offsetParent || document;

                while (offsetParent && (!offsetParent.nodeType.toLowerCase === "html" && offsetParent.style.position === "static")) {
                    offsetParent = offsetParent.offsetParent;
                }

                return offsetParent || document;
            }

            /* Zepto */
            var elem = this[0],
                offsetParent = offsetParent.apply(elem),
                offset = this.offset(),
                parentOffset = /^(?:body|html)$/i.test(offsetParent.nodeName) ? { top: 0, left: 0 } : $(offsetParent).offset();

            offset.top -= parseFloat(elem.style.marginTop) || 0;
            offset.left -= parseFloat(elem.style.marginLeft) || 0;

            if (offsetParent.style) {
                parentOffset.top += parseFloat(offsetParent.style.borderTopWidth) || 0;
                parentOffset.left += parseFloat(offsetParent.style.borderLeftWidth) || 0;
            }

            return {
                top: offset.top - parentOffset.top,
                left: offset.left - parentOffset.left
            };
        }
    };

    /**********************
       Private Variables
    **********************/

    /* For $.data() */
    var cache = {};
    $.expando = "velocity" + new Date().getTime();
    $.uuid = 0;

    /* For $.queue() */
    var class2type = {},
        hasOwn = class2type.hasOwnProperty,
        toString = class2type.toString;

    var types = "Boolean Number String Function Array Date RegExp Object Error".split(" ");
    for (var i = 0; i < types.length; i++) {
        class2type["[object " + types[i] + "]"] = types[i].toLowerCase();
    }

    /* Makes $(node) possible, without having to call init. */
    $.fn.init.prototype = $.fn;

    /* Globalize Velocity onto the window, and assign its Utilities property. */
    window.Velocity = { Utilities: $ };
})(window);

/******************
    Velocity.js
******************/

;(function (factory) {
    /* CommonJS module. */
    if (typeof module === "object" && typeof module.exports === "object") {
        module.exports = factory();
        /* AMD module. */
    } else if (typeof define === "function" && define.amd) {
        define(factory);
        /* Browser globals. */
    } else {
        factory();
    }
})(function () {
    return (function (global, window, document, undefined) {
        /***************
            Summary
        ***************/

        /*
        - CSS: CSS stack that works independently from the rest of Velocity.
        - animate(): Core animation method that iterates over the targeted elements and queues the incoming call onto each element individually.
          - Pre-Queueing: Prepare the element for animation by instantiating its data cache and processing the call's options.
          - Queueing: The logic that runs once the call has reached its point of execution in the element's $.queue() stack.
                      Most logic is placed here to avoid risking it becoming stale (if the element's properties have changed).
          - Pushing: Consolidation of the tween data followed by its push onto the global in-progress calls container.
        - tick(): The single requestAnimationFrame loop responsible for tweening all in-progress calls.
        - completeCall(): Handles the cleanup process for each Velocity call.
        */

        /*********************
           Helper Functions
        *********************/

        /* IE detection. Gist: https://gist.github.com/julianshapiro/9098609 */
        var IE = (function () {
            if (document.documentMode) {
                return document.documentMode;
            } else {
                for (var i = 7; i > 4; i--) {
                    var div = document.createElement("div");

                    div.innerHTML = "<!--[if IE " + i + "]><span></span><![endif]-->";

                    if (div.getElementsByTagName("span").length) {
                        div = null;

                        return i;
                    }
                }
            }

            return undefined;
        })();

        /* rAF shim. Gist: https://gist.github.com/julianshapiro/9497513 */
        var rAFShim = (function () {
            var timeLast = 0;

            return window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || function (callback) {
                var timeCurrent = new Date().getTime(),
                    timeDelta;

                /* Dynamically set delay on a per-tick basis to match 60fps. */
                /* Technique by Erik Moller. MIT license: https://gist.github.com/paulirish/1579671 */
                timeDelta = Math.max(0, 16 - (timeCurrent - timeLast));
                timeLast = timeCurrent + timeDelta;

                return setTimeout(function () {
                    callback(timeCurrent + timeDelta);
                }, timeDelta);
            };
        })();

        /* Array compacting. Copyright Lo-Dash. MIT License: https://github.com/lodash/lodash/blob/master/LICENSE.txt */
        function compactSparseArray(array) {
            var index = -1,
                length = array ? array.length : 0,
                result = [];

            while (++index < length) {
                var value = array[index];

                if (value) {
                    result.push(value);
                }
            }

            return result;
        }

        function sanitizeElements(elements) {
            /* Unwrap jQuery/Zepto objects. */
            if (Type.isWrapped(elements)) {
                elements = [].slice.call(elements);
                /* Wrap a single element in an array so that $.each() can iterate with the element instead of its node's children. */
            } else if (Type.isNode(elements)) {
                elements = [elements];
            }

            return elements;
        }

        var Type = {
            isString: function (variable) {
                return typeof variable === "string";
            },
            isArray: Array.isArray || function (variable) {
                return Object.prototype.toString.call(variable) === "[object Array]";
            },
            isFunction: function (variable) {
                return Object.prototype.toString.call(variable) === "[object Function]";
            },
            isNode: function (variable) {
                return variable && variable.nodeType;
            },
            /* Copyright Martin Bohm. MIT License: https://gist.github.com/Tomalak/818a78a226a0738eaade */
            isNodeList: function (variable) {
                return typeof variable === "object" && /^\[object (HTMLCollection|NodeList|Object)\]$/.test(Object.prototype.toString.call(variable)) && variable.length !== undefined && (variable.length === 0 || typeof variable[0] === "object" && variable[0].nodeType > 0);
            },
            /* Determine if variable is a wrapped jQuery or Zepto element. */
            isWrapped: function (variable) {
                return variable && (variable.jquery || window.Zepto && window.Zepto.zepto.isZ(variable));
            },
            isSVG: function (variable) {
                return window.SVGElement && variable instanceof window.SVGElement;
            },
            isEmptyObject: function (variable) {
                for (var name in variable) {
                    return false;
                }

                return true;
            }
        };

        /*****************
           Dependencies
        *****************/

        var $,
            isJQuery = false;

        if (global.fn && global.fn.jquery) {
            $ = global;
            isJQuery = true;
        } else {
            $ = window.Velocity.Utilities;
        }

        if (IE <= 8 && !isJQuery) {
            throw new Error("Velocity: IE8 and below require jQuery to be loaded before Velocity.");
        } else if (IE <= 7) {
            /* Revert to jQuery's $.animate(), and lose Velocity's extra features. */
            jQuery.fn.velocity = jQuery.fn.animate;

            /* Now that $.fn.velocity is aliased, abort this Velocity declaration. */
            return;
        }

        /*****************
            Constants
        *****************/

        var DURATION_DEFAULT = 400,
            EASING_DEFAULT = "swing";

        /*************
            State
        *************/

        var Velocity = {
            /* Container for page-wide Velocity state data. */
            State: {
                /* Detect mobile devices to determine if mobileHA should be turned on. */
                isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
                /* The mobileHA option's behavior changes on older Android devices (Gingerbread, versions 2.3.3-2.3.7). */
                isAndroid: /Android/i.test(navigator.userAgent),
                isGingerbread: /Android 2\.3\.[3-7]/i.test(navigator.userAgent),
                isChrome: window.chrome,
                isFirefox: /Firefox/i.test(navigator.userAgent),
                /* Create a cached element for re-use when checking for CSS property prefixes. */
                prefixElement: document.createElement("div"),
                /* Cache every prefix match to avoid repeating lookups. */
                prefixMatches: {},
                /* Cache the anchor used for animating window scrolling. */
                scrollAnchor: null,
                /* Cache the browser-specific property names associated with the scroll anchor. */
                scrollPropertyLeft: null,
                scrollPropertyTop: null,
                /* Keep track of whether our RAF tick is running. */
                isTicking: false,
                /* Container for every in-progress call to Velocity. */
                calls: []
            },
            /* Velocity's custom CSS stack. Made global for unit testing. */
            CSS: {},
            /* A shim of the jQuery utility functions used by Velocity -- provided by Velocity's optional jQuery shim. */
            Utilities: $,
            /* Container for the user's custom animation redirects that are referenced by name in place of the properties map argument. */
            Redirects: {},
            Easings: {},
            /* Attempt to use ES6 Promises by default. Users can override this with a third-party promises library. */
            Promise: window.Promise,
            /* Velocity option defaults, which can be overriden by the user. */
            defaults: {
                queue: "",
                duration: DURATION_DEFAULT,
                easing: EASING_DEFAULT,
                begin: undefined,
                complete: undefined,
                progress: undefined,
                display: undefined,
                visibility: undefined,
                loop: false,
                delay: false,
                mobileHA: true,
                /* Advanced: Set to false to prevent property values from being cached between consecutive Velocity-initiated chain calls. */
                _cacheValues: true
            },
            /* A design goal of Velocity is to cache data wherever possible in order to avoid DOM requerying. Accordingly, each element has a data cache. */
            init: function (element) {
                $.data(element, "velocity", {
                    /* Store whether this is an SVG element, since its properties are retrieved and updated differently than standard HTML elements. */
                    isSVG: Type.isSVG(element),
                    /* Keep track of whether the element is currently being animated by Velocity.
                       This is used to ensure that property values are not transferred between non-consecutive (stale) calls. */
                    isAnimating: false,
                    /* A reference to the element's live computedStyle object. Learn more here: https://developer.mozilla.org/en/docs/Web/API/window.getComputedStyle */
                    computedStyle: null,
                    /* Tween data is cached for each animation on the element so that data can be passed across calls --
                       in particular, end values are used as subsequent start values in consecutive Velocity calls. */
                    tweensContainer: null,
                    /* The full root property values of each CSS hook being animated on this element are cached so that:
                       1) Concurrently-animating hooks sharing the same root can have their root values' merged into one while tweening.
                       2) Post-hook-injection root values can be transferred over to consecutively chained Velocity calls as starting root values. */
                    rootPropertyValueCache: {},
                    /* A cache for transform updates, which must be manually flushed via CSS.flushTransformCache(). */
                    transformCache: {}
                });
            },
            /* A parallel to jQuery's $.css(), used for getting/setting Velocity's hooked CSS properties. */
            hook: null, /* Defined below. */
            /* Velocity-wide animation time remapping for testing purposes. */
            mock: false,
            version: { major: 1, minor: 2, patch: 1 },
            /* Set to 1 or 2 (most verbose) to output debug info to console. */
            debug: false
        };

        /* Retrieve the appropriate scroll anchor and property name for the browser: https://developer.mozilla.org/en-US/docs/Web/API/Window.scrollY */
        if (window.pageYOffset !== undefined) {
            Velocity.State.scrollAnchor = window;
            Velocity.State.scrollPropertyLeft = "pageXOffset";
            Velocity.State.scrollPropertyTop = "pageYOffset";
        } else {
            Velocity.State.scrollAnchor = document.documentElement || document.body.parentNode || document.body;
            Velocity.State.scrollPropertyLeft = "scrollLeft";
            Velocity.State.scrollPropertyTop = "scrollTop";
        }

        /* Shorthand alias for jQuery's $.data() utility. */
        function Data(element) {
            /* Hardcode a reference to the plugin name. */
            var response = $.data(element, "velocity");

            /* jQuery <=1.4.2 returns null instead of undefined when no match is found. We normalize this behavior. */
            return response === null ? undefined : response;
        };

        /**************
            Easing
        **************/

        /* Step easing generator. */
        function generateStep(steps) {
            return function (p) {
                return Math.round(p * steps) * (1 / steps);
            };
        }

        /* Bezier curve function generator. Copyright Gaetan Renaudeau. MIT License: http://en.wikipedia.org/wiki/MIT_License */
        function generateBezier(mX1, mY1, mX2, mY2) {
            var NEWTON_ITERATIONS = 4,
                NEWTON_MIN_SLOPE = 0.001,
                SUBDIVISION_PRECISION = 1e-7,
                SUBDIVISION_MAX_ITERATIONS = 10,
                kSplineTableSize = 11,
                kSampleStepSize = 1 / (kSplineTableSize - 1),
                float32ArraySupported = ("Float32Array" in window);

            /* Must contain four arguments. */
            if (arguments.length !== 4) {
                return false;
            }

            /* Arguments must be numbers. */
            for (var i = 0; i < 4; ++i) {
                if (typeof arguments[i] !== "number" || isNaN(arguments[i]) || !isFinite(arguments[i])) {
                    return false;
                }
            }

            /* X values must be in the [0, 1] range. */
            mX1 = Math.min(mX1, 1);
            mX2 = Math.min(mX2, 1);
            mX1 = Math.max(mX1, 0);
            mX2 = Math.max(mX2, 0);

            var mSampleValues = float32ArraySupported ? new Float32Array(kSplineTableSize) : new Array(kSplineTableSize);

            function A(aA1, aA2) {
                return 1 - 3 * aA2 + 3 * aA1;
            }
            function B(aA1, aA2) {
                return 3 * aA2 - 6 * aA1;
            }
            function C(aA1) {
                return 3 * aA1;
            }

            function calcBezier(aT, aA1, aA2) {
                return ((A(aA1, aA2) * aT + B(aA1, aA2)) * aT + C(aA1)) * aT;
            }

            function getSlope(aT, aA1, aA2) {
                return 3 * A(aA1, aA2) * aT * aT + 2 * B(aA1, aA2) * aT + C(aA1);
            }

            function newtonRaphsonIterate(aX, aGuessT) {
                for (var i = 0; i < NEWTON_ITERATIONS; ++i) {
                    var currentSlope = getSlope(aGuessT, mX1, mX2);

                    if (currentSlope === 0) {
                        return aGuessT;
                    }var currentX = calcBezier(aGuessT, mX1, mX2) - aX;
                    aGuessT -= currentX / currentSlope;
                }

                return aGuessT;
            }

            function calcSampleValues() {
                for (var i = 0; i < kSplineTableSize; ++i) {
                    mSampleValues[i] = calcBezier(i * kSampleStepSize, mX1, mX2);
                }
            }

            function binarySubdivide(aX, aA, aB) {
                var currentX,
                    currentT,
                    i = 0;

                do {
                    currentT = aA + (aB - aA) / 2;
                    currentX = calcBezier(currentT, mX1, mX2) - aX;
                    if (currentX > 0) {
                        aB = currentT;
                    } else {
                        aA = currentT;
                    }
                } while (Math.abs(currentX) > SUBDIVISION_PRECISION && ++i < SUBDIVISION_MAX_ITERATIONS);

                return currentT;
            }

            function getTForX(aX) {
                var intervalStart = 0,
                    currentSample = 1,
                    lastSample = kSplineTableSize - 1;

                for (; currentSample != lastSample && mSampleValues[currentSample] <= aX; ++currentSample) {
                    intervalStart += kSampleStepSize;
                }

                --currentSample;

                var dist = (aX - mSampleValues[currentSample]) / (mSampleValues[currentSample + 1] - mSampleValues[currentSample]),
                    guessForT = intervalStart + dist * kSampleStepSize,
                    initialSlope = getSlope(guessForT, mX1, mX2);

                if (initialSlope >= NEWTON_MIN_SLOPE) {
                    return newtonRaphsonIterate(aX, guessForT);
                } else if (initialSlope == 0) {
                    return guessForT;
                } else {
                    return binarySubdivide(aX, intervalStart, intervalStart + kSampleStepSize);
                }
            }

            var _precomputed = false;

            function precompute() {
                _precomputed = true;
                if (mX1 != mY1 || mX2 != mY2) calcSampleValues();
            }

            var f = function (aX) {
                if (!_precomputed) precompute();
                if (mX1 === mY1 && mX2 === mY2) return aX;
                if (aX === 0) return 0;
                if (aX === 1) return 1;

                return calcBezier(getTForX(aX), mY1, mY2);
            };

            f.getControlPoints = function () {
                return [{ x: mX1, y: mY1 }, { x: mX2, y: mY2 }];
            };

            var str = "generateBezier(" + [mX1, mY1, mX2, mY2] + ")";
            f.toString = function () {
                return str;
            };

            return f;
        }

        /* Runge-Kutta spring physics function generator. Adapted from Framer.js, copyright Koen Bok. MIT License: http://en.wikipedia.org/wiki/MIT_License */
        /* Given a tension, friction, and duration, a simulation at 60FPS will first run without a defined duration in order to calculate the full path. A second pass
           then adjusts the time delta -- using the relation between actual time and duration -- to calculate the path for the duration-constrained animation. */
        var generateSpringRK4 = (function () {
            function springAccelerationForState(state) {
                return -state.tension * state.x - state.friction * state.v;
            }

            function springEvaluateStateWithDerivative(initialState, dt, derivative) {
                var state = {
                    x: initialState.x + derivative.dx * dt,
                    v: initialState.v + derivative.dv * dt,
                    tension: initialState.tension,
                    friction: initialState.friction
                };

                return { dx: state.v, dv: springAccelerationForState(state) };
            }

            function springIntegrateState(state, dt) {
                var a = {
                    dx: state.v,
                    dv: springAccelerationForState(state)
                },
                    b = springEvaluateStateWithDerivative(state, dt * 0.5, a),
                    c = springEvaluateStateWithDerivative(state, dt * 0.5, b),
                    d = springEvaluateStateWithDerivative(state, dt, c),
                    dxdt = 1 / 6 * (a.dx + 2 * (b.dx + c.dx) + d.dx),
                    dvdt = 1 / 6 * (a.dv + 2 * (b.dv + c.dv) + d.dv);

                state.x = state.x + dxdt * dt;
                state.v = state.v + dvdt * dt;

                return state;
            }

            return function springRK4Factory(tension, friction, duration) {
                var initState = {
                    x: -1,
                    v: 0,
                    tension: null,
                    friction: null
                },
                    path = [0],
                    time_lapsed = 0,
                    tolerance = 1 / 10000,
                    DT = 16 / 1000,
                    have_duration,
                    dt,
                    last_state;

                tension = parseFloat(tension) || 500;
                friction = parseFloat(friction) || 20;
                duration = duration || null;

                initState.tension = tension;
                initState.friction = friction;

                have_duration = duration !== null;

                /* Calculate the actual time it takes for this animation to complete with the provided conditions. */
                if (have_duration) {
                    /* Run the simulation without a duration. */
                    time_lapsed = springRK4Factory(tension, friction);
                    /* Compute the adjusted time delta. */
                    dt = time_lapsed / duration * DT;
                } else {
                    dt = DT;
                }

                while (true) {
                    /* Next/step function .*/
                    last_state = springIntegrateState(last_state || initState, dt);
                    /* Store the position. */
                    path.push(1 + last_state.x);
                    time_lapsed += 16;
                    /* If the change threshold is reached, break. */
                    if (!(Math.abs(last_state.x) > tolerance && Math.abs(last_state.v) > tolerance)) {
                        break;
                    }
                }

                /* If duration is not defined, return the actual time required for completing this animation. Otherwise, return a closure that holds the
                   computed path and returns a snapshot of the position according to a given percentComplete. */
                return !have_duration ? time_lapsed : function (percentComplete) {
                    return path[percentComplete * (path.length - 1) | 0];
                };
            };
        })();

        /* jQuery easings. */
        Velocity.Easings = {
            linear: function (p) {
                return p;
            },
            swing: function (p) {
                return 0.5 - Math.cos(p * Math.PI) / 2;
            },
            /* Bonus "spring" easing, which is a less exaggerated version of easeInOutElastic. */
            spring: function (p) {
                return 1 - Math.cos(p * 4.5 * Math.PI) * Math.exp(-p * 6);
            }
        };

        /* CSS3 and Robert Penner easings. */
        $.each([["ease", [0.25, 0.1, 0.25, 1]], ["ease-in", [0.42, 0, 1, 1]], ["ease-out", [0, 0, 0.58, 1]], ["ease-in-out", [0.42, 0, 0.58, 1]], ["easeInSine", [0.47, 0, 0.745, 0.715]], ["easeOutSine", [0.39, 0.575, 0.565, 1]], ["easeInOutSine", [0.445, 0.05, 0.55, 0.95]], ["easeInQuad", [0.55, 0.085, 0.68, 0.53]], ["easeOutQuad", [0.25, 0.46, 0.45, 0.94]], ["easeInOutQuad", [0.455, 0.03, 0.515, 0.955]], ["easeInCubic", [0.55, 0.055, 0.675, 0.19]], ["easeOutCubic", [0.215, 0.61, 0.355, 1]], ["easeInOutCubic", [0.645, 0.045, 0.355, 1]], ["easeInQuart", [0.895, 0.03, 0.685, 0.22]], ["easeOutQuart", [0.165, 0.84, 0.44, 1]], ["easeInOutQuart", [0.77, 0, 0.175, 1]], ["easeInQuint", [0.755, 0.05, 0.855, 0.06]], ["easeOutQuint", [0.23, 1, 0.32, 1]], ["easeInOutQuint", [0.86, 0, 0.07, 1]], ["easeInExpo", [0.95, 0.05, 0.795, 0.035]], ["easeOutExpo", [0.19, 1, 0.22, 1]], ["easeInOutExpo", [1, 0, 0, 1]], ["easeInCirc", [0.6, 0.04, 0.98, 0.335]], ["easeOutCirc", [0.075, 0.82, 0.165, 1]], ["easeInOutCirc", [0.785, 0.135, 0.15, 0.86]]], function (i, easingArray) {
            Velocity.Easings[easingArray[0]] = generateBezier.apply(null, easingArray[1]);
        });

        /* Determine the appropriate easing type given an easing input. */
        function getEasing(value, duration) {
            var easing = value;

            /* The easing option can either be a string that references a pre-registered easing,
               or it can be a two-/four-item array of integers to be converted into a bezier/spring function. */
            if (Type.isString(value)) {
                /* Ensure that the easing has been assigned to jQuery's Velocity.Easings object. */
                if (!Velocity.Easings[value]) {
                    easing = false;
                }
            } else if (Type.isArray(value) && value.length === 1) {
                easing = generateStep.apply(null, value);
            } else if (Type.isArray(value) && value.length === 2) {
                /* springRK4 must be passed the animation's duration. */
                /* Note: If the springRK4 array contains non-numbers, generateSpringRK4() returns an easing
                   function generated with default tension and friction values. */
                easing = generateSpringRK4.apply(null, value.concat([duration]));
            } else if (Type.isArray(value) && value.length === 4) {
                /* Note: If the bezier array contains non-numbers, generateBezier() returns false. */
                easing = generateBezier.apply(null, value);
            } else {
                easing = false;
            }

            /* Revert to the Velocity-wide default easing type, or fall back to "swing" (which is also jQuery's default)
               if the Velocity-wide default has been incorrectly modified. */
            if (easing === false) {
                if (Velocity.Easings[Velocity.defaults.easing]) {
                    easing = Velocity.defaults.easing;
                } else {
                    easing = EASING_DEFAULT;
                }
            }

            return easing;
        }

        /*****************
            CSS Stack
        *****************/

        /* The CSS object is a highly condensed and performant CSS stack that fully replaces jQuery's.
           It handles the validation, getting, and setting of both standard CSS properties and CSS property hooks. */
        /* Note: A "CSS" shorthand is aliased so that our code is easier to read. */
        var CSS = Velocity.CSS = {

            /*************
                RegEx
            *************/

            RegEx: {
                isHex: /^#([A-f\d]{3}){1,2}$/i,
                /* Unwrap a property value's surrounding text, e.g. "rgba(4, 3, 2, 1)" ==> "4, 3, 2, 1" and "rect(4px 3px 2px 1px)" ==> "4px 3px 2px 1px". */
                valueUnwrap: /^[A-z]+\((.*)\)$/i,
                wrappedValueAlreadyExtracted: /[0-9.]+ [0-9.]+ [0-9.]+( [0-9.]+)?/,
                /* Split a multi-value property into an array of subvalues, e.g. "rgba(4, 3, 2, 1) 4px 3px 2px 1px" ==> [ "rgba(4, 3, 2, 1)", "4px", "3px", "2px", "1px" ]. */
                valueSplit: /([A-z]+\(.+\))|(([A-z0-9#-.]+?)(?=\s|$))/ig
            },

            /************
                Lists
            ************/

            Lists: {
                colors: ["fill", "stroke", "stopColor", "color", "backgroundColor", "borderColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor", "outlineColor"],
                transformsBase: ["translateX", "translateY", "scale", "scaleX", "scaleY", "skewX", "skewY", "rotateZ"],
                transforms3D: ["transformPerspective", "translateZ", "scaleZ", "rotateX", "rotateY"]
            },

            /************
                Hooks
            ************/

            /* Hooks allow a subproperty (e.g. "boxShadowBlur") of a compound-value CSS property
               (e.g. "boxShadow: X Y Blur Spread Color") to be animated as if it were a discrete property. */
            /* Note: Beyond enabling fine-grained property animation, hooking is necessary since Velocity only
               tweens properties with single numeric values; unlike CSS transitions, Velocity does not interpolate compound-values. */
            Hooks: {
                /********************
                    Registration
                ********************/

                /* Templates are a concise way of indicating which subproperties must be individually registered for each compound-value CSS property. */
                /* Each template consists of the compound-value's base name, its constituent subproperty names, and those subproperties' default values. */
                templates: {
                    textShadow: ["Color X Y Blur", "black 0px 0px 0px"],
                    boxShadow: ["Color X Y Blur Spread", "black 0px 0px 0px 0px"],
                    clip: ["Top Right Bottom Left", "0px 0px 0px 0px"],
                    backgroundPosition: ["X Y", "0% 0%"],
                    transformOrigin: ["X Y Z", "50% 50% 0px"],
                    perspectiveOrigin: ["X Y", "50% 50%"]
                },

                /* A "registered" hook is one that has been converted from its template form into a live,
                   tweenable property. It contains data to associate it with its root property. */
                registered: {},
                /* Convert the templates into individual hooks then append them to the registered object above. */
                register: function () {
                    /* Color hooks registration: Colors are defaulted to white -- as opposed to black -- since colors that are
                       currently set to "transparent" default to their respective template below when color-animated,
                       and white is typically a closer match to transparent than black is. An exception is made for text ("color"),
                       which is almost always set closer to black than white. */
                    for (var i = 0; i < CSS.Lists.colors.length; i++) {
                        var rgbComponents = CSS.Lists.colors[i] === "color" ? "0 0 0 1" : "255 255 255 1";
                        CSS.Hooks.templates[CSS.Lists.colors[i]] = ["Red Green Blue Alpha", rgbComponents];
                    }

                    var rootProperty, hookTemplate, hookNames;

                    /* In IE, color values inside compound-value properties are positioned at the end the value instead of at the beginning.
                       Thus, we re-arrange the templates accordingly. */
                    if (IE) {
                        for (rootProperty in CSS.Hooks.templates) {
                            hookTemplate = CSS.Hooks.templates[rootProperty];
                            hookNames = hookTemplate[0].split(" ");

                            var defaultValues = hookTemplate[1].match(CSS.RegEx.valueSplit);

                            if (hookNames[0] === "Color") {
                                /* Reposition both the hook's name and its default value to the end of their respective strings. */
                                hookNames.push(hookNames.shift());
                                defaultValues.push(defaultValues.shift());

                                /* Replace the existing template for the hook's root property. */
                                CSS.Hooks.templates[rootProperty] = [hookNames.join(" "), defaultValues.join(" ")];
                            }
                        }
                    }

                    /* Hook registration. */
                    for (rootProperty in CSS.Hooks.templates) {
                        hookTemplate = CSS.Hooks.templates[rootProperty];
                        hookNames = hookTemplate[0].split(" ");

                        for (var i in hookNames) {
                            var fullHookName = rootProperty + hookNames[i],
                                hookPosition = i;

                            /* For each hook, register its full name (e.g. textShadowBlur) with its root property (e.g. textShadow)
                               and the hook's position in its template's default value string. */
                            CSS.Hooks.registered[fullHookName] = [rootProperty, hookPosition];
                        }
                    }
                },

                /*****************************
                   Injection and Extraction
                *****************************/

                /* Look up the root property associated with the hook (e.g. return "textShadow" for "textShadowBlur"). */
                /* Since a hook cannot be set directly (the browser won't recognize it), style updating for hooks is routed through the hook's root property. */
                getRoot: function (property) {
                    var hookData = CSS.Hooks.registered[property];

                    if (hookData) {
                        return hookData[0];
                    } else {
                        /* If there was no hook match, return the property name untouched. */
                        return property;
                    }
                },
                /* Convert any rootPropertyValue, null or otherwise, into a space-delimited list of hook values so that
                   the targeted hook can be injected or extracted at its standard position. */
                cleanRootPropertyValue: function (rootProperty, rootPropertyValue) {
                    /* If the rootPropertyValue is wrapped with "rgb()", "clip()", etc., remove the wrapping to normalize the value before manipulation. */
                    if (CSS.RegEx.valueUnwrap.test(rootPropertyValue)) {
                        rootPropertyValue = rootPropertyValue.match(CSS.RegEx.valueUnwrap)[1];
                    }

                    /* If rootPropertyValue is a CSS null-value (from which there's inherently no hook value to extract),
                       default to the root's default value as defined in CSS.Hooks.templates. */
                    /* Note: CSS null-values include "none", "auto", and "transparent". They must be converted into their
                       zero-values (e.g. textShadow: "none" ==> textShadow: "0px 0px 0px black") for hook manipulation to proceed. */
                    if (CSS.Values.isCSSNullValue(rootPropertyValue)) {
                        rootPropertyValue = CSS.Hooks.templates[rootProperty][1];
                    }

                    return rootPropertyValue;
                },
                /* Extracted the hook's value from its root property's value. This is used to get the starting value of an animating hook. */
                extractValue: function (fullHookName, rootPropertyValue) {
                    var hookData = CSS.Hooks.registered[fullHookName];

                    if (hookData) {
                        var hookRoot = hookData[0],
                            hookPosition = hookData[1];

                        rootPropertyValue = CSS.Hooks.cleanRootPropertyValue(hookRoot, rootPropertyValue);

                        /* Split rootPropertyValue into its constituent hook values then grab the desired hook at its standard position. */
                        return rootPropertyValue.toString().match(CSS.RegEx.valueSplit)[hookPosition];
                    } else {
                        /* If the provided fullHookName isn't a registered hook, return the rootPropertyValue that was passed in. */
                        return rootPropertyValue;
                    }
                },
                /* Inject the hook's value into its root property's value. This is used to piece back together the root property
                   once Velocity has updated one of its individually hooked values through tweening. */
                injectValue: function (fullHookName, hookValue, rootPropertyValue) {
                    var hookData = CSS.Hooks.registered[fullHookName];

                    if (hookData) {
                        var hookRoot = hookData[0],
                            hookPosition = hookData[1],
                            rootPropertyValueParts,
                            rootPropertyValueUpdated;

                        rootPropertyValue = CSS.Hooks.cleanRootPropertyValue(hookRoot, rootPropertyValue);

                        /* Split rootPropertyValue into its individual hook values, replace the targeted value with hookValue,
                           then reconstruct the rootPropertyValue string. */
                        rootPropertyValueParts = rootPropertyValue.toString().match(CSS.RegEx.valueSplit);
                        rootPropertyValueParts[hookPosition] = hookValue;
                        rootPropertyValueUpdated = rootPropertyValueParts.join(" ");

                        return rootPropertyValueUpdated;
                    } else {
                        /* If the provided fullHookName isn't a registered hook, return the rootPropertyValue that was passed in. */
                        return rootPropertyValue;
                    }
                }
            },

            /*******************
               Normalizations
            *******************/

            /* Normalizations standardize CSS property manipulation by pollyfilling browser-specific implementations (e.g. opacity)
               and reformatting special properties (e.g. clip, rgba) to look like standard ones. */
            Normalizations: {
                /* Normalizations are passed a normalization target (either the property's name, its extracted value, or its injected value),
                   the targeted element (which may need to be queried), and the targeted property value. */
                registered: {
                    clip: function (type, element, propertyValue) {
                        switch (type) {
                            case "name":
                                return "clip";
                            /* Clip needs to be unwrapped and stripped of its commas during extraction. */
                            case "extract":
                                var extracted;

                                /* If Velocity also extracted this value, skip extraction. */
                                if (CSS.RegEx.wrappedValueAlreadyExtracted.test(propertyValue)) {
                                    extracted = propertyValue;
                                } else {
                                    /* Remove the "rect()" wrapper. */
                                    extracted = propertyValue.toString().match(CSS.RegEx.valueUnwrap);

                                    /* Strip off commas. */
                                    extracted = extracted ? extracted[1].replace(/,(\s+)?/g, " ") : propertyValue;
                                }

                                return extracted;
                            /* Clip needs to be re-wrapped during injection. */
                            case "inject":
                                return "rect(" + propertyValue + ")";
                        }
                    },

                    blur: function (type, element, propertyValue) {
                        switch (type) {
                            case "name":
                                return Velocity.State.isFirefox ? "filter" : "-webkit-filter";
                            case "extract":
                                var extracted = parseFloat(propertyValue);

                                /* If extracted is NaN, meaning the value isn't already extracted. */
                                if (!(extracted || extracted === 0)) {
                                    var blurComponent = propertyValue.toString().match(/blur\(([0-9]+[A-z]+)\)/i);

                                    /* If the filter string had a blur component, return just the blur value and unit type. */
                                    if (blurComponent) {
                                        extracted = blurComponent[1];
                                        /* If the component doesn't exist, default blur to 0. */
                                    } else {
                                        extracted = 0;
                                    }
                                }

                                return extracted;
                            /* Blur needs to be re-wrapped during injection. */
                            case "inject":
                                /* For the blur effect to be fully de-applied, it needs to be set to "none" instead of 0. */
                                if (!parseFloat(propertyValue)) {
                                    return "none";
                                } else {
                                    return "blur(" + propertyValue + ")";
                                }
                        }
                    },

                    /* <=IE8 do not support the standard opacity property. They use filter:alpha(opacity=INT) instead. */
                    opacity: function (type, element, propertyValue) {
                        if (IE <= 8) {
                            switch (type) {
                                case "name":
                                    return "filter";
                                case "extract":
                                    /* <=IE8 return a "filter" value of "alpha(opacity=\d{1,3})".
                                       Extract the value and convert it to a decimal value to match the standard CSS opacity property's formatting. */
                                    var extracted = propertyValue.toString().match(/alpha\(opacity=(.*)\)/i);

                                    if (extracted) {
                                        /* Convert to decimal value. */
                                        propertyValue = extracted[1] / 100;
                                    } else {
                                        /* When extracting opacity, default to 1 since a null value means opacity hasn't been set. */
                                        propertyValue = 1;
                                    }

                                    return propertyValue;
                                case "inject":
                                    /* Opacified elements are required to have their zoom property set to a non-zero value. */
                                    element.style.zoom = 1;

                                    /* Setting the filter property on elements with certain font property combinations can result in a
                                       highly unappealing ultra-bolding effect. There's no way to remedy this throughout a tween, but dropping the
                                       value altogether (when opacity hits 1) at leasts ensures that the glitch is gone post-tweening. */
                                    if (parseFloat(propertyValue) >= 1) {
                                        return "";
                                    } else {
                                        /* As per the filter property's spec, convert the decimal value to a whole number and wrap the value. */
                                        return "alpha(opacity=" + parseInt(parseFloat(propertyValue) * 100, 10) + ")";
                                    }
                            }
                            /* With all other browsers, normalization is not required; return the same values that were passed in. */
                        } else {
                            switch (type) {
                                case "name":
                                    return "opacity";
                                case "extract":
                                    return propertyValue;
                                case "inject":
                                    return propertyValue;
                            }
                        }
                    }
                },

                /*****************************
                    Batched Registrations
                *****************************/

                /* Note: Batched normalizations extend the CSS.Normalizations.registered object. */
                register: function () {
                    /*****************
                        Transforms
                    *****************/

                    /* Transforms are the subproperties contained by the CSS "transform" property. Transforms must undergo normalization
                       so that they can be referenced in a properties map by their individual names. */
                    /* Note: When transforms are "set", they are actually assigned to a per-element transformCache. When all transform
                       setting is complete complete, CSS.flushTransformCache() must be manually called to flush the values to the DOM.
                       Transform setting is batched in this way to improve performance: the transform style only needs to be updated
                       once when multiple transform subproperties are being animated simultaneously. */
                    /* Note: IE9 and Android Gingerbread have support for 2D -- but not 3D -- transforms. Since animating unsupported
                       transform properties results in the browser ignoring the *entire* transform string, we prevent these 3D values
                       from being normalized for these browsers so that tweening skips these properties altogether
                       (since it will ignore them as being unsupported by the browser.) */
                    if (!(IE <= 9) && !Velocity.State.isGingerbread) {
                        /* Note: Since the standalone CSS "perspective" property and the CSS transform "perspective" subproperty
                        share the same name, the latter is given a unique token within Velocity: "transformPerspective". */
                        CSS.Lists.transformsBase = CSS.Lists.transformsBase.concat(CSS.Lists.transforms3D);
                    }

                    for (var i = 0; i < CSS.Lists.transformsBase.length; i++) {
                        /* Wrap the dynamically generated normalization function in a new scope so that transformName's value is
                        paired with its respective function. (Otherwise, all functions would take the final for loop's transformName.) */
                        (function () {
                            var transformName = CSS.Lists.transformsBase[i];

                            CSS.Normalizations.registered[transformName] = function (type, element, propertyValue) {
                                switch (type) {
                                    /* The normalized property name is the parent "transform" property -- the property that is actually set in CSS. */
                                    case "name":
                                        return "transform";
                                    /* Transform values are cached onto a per-element transformCache object. */
                                    case "extract":
                                        /* If this transform has yet to be assigned a value, return its null value. */
                                        if (Data(element) === undefined || Data(element).transformCache[transformName] === undefined) {
                                            /* Scale CSS.Lists.transformsBase default to 1 whereas all other transform properties default to 0. */
                                            return /^scale/i.test(transformName) ? 1 : 0;
                                            /* When transform values are set, they are wrapped in parentheses as per the CSS spec.
                                               Thus, when extracting their values (for tween calculations), we strip off the parentheses. */
                                        } else {
                                            return Data(element).transformCache[transformName].replace(/[()]/g, "");
                                        }
                                    case "inject":
                                        var invalid = false;

                                        /* If an individual transform property contains an unsupported unit type, the browser ignores the *entire* transform property.
                                           Thus, protect users from themselves by skipping setting for transform values supplied with invalid unit types. */
                                        /* Switch on the base transform type; ignore the axis by removing the last letter from the transform's name. */
                                        switch (transformName.substr(0, transformName.length - 1)) {
                                            /* Whitelist unit types for each transform. */
                                            case "translate":
                                                invalid = !/(%|px|em|rem|vw|vh|\d)$/i.test(propertyValue);
                                                break;
                                            /* Since an axis-free "scale" property is supported as well, a little hack is used here to detect it by chopping off its last letter. */
                                            case "scal":
                                            case "scale":
                                                /* Chrome on Android has a bug in which scaled elements blur if their initial scale
                                                   value is below 1 (which can happen with forcefeeding). Thus, we detect a yet-unset scale property
                                                   and ensure that its first value is always 1. More info: http://stackoverflow.com/questions/10417890/css3-animations-with-transform-causes-blurred-elements-on-webkit/10417962#10417962 */
                                                if (Velocity.State.isAndroid && Data(element).transformCache[transformName] === undefined && propertyValue < 1) {
                                                    propertyValue = 1;
                                                }

                                                invalid = !/(\d)$/i.test(propertyValue);
                                                break;
                                            case "skew":
                                                invalid = !/(deg|\d)$/i.test(propertyValue);
                                                break;
                                            case "rotate":
                                                invalid = !/(deg|\d)$/i.test(propertyValue);
                                                break;
                                        }

                                        if (!invalid) {
                                            /* As per the CSS spec, wrap the value in parentheses. */
                                            Data(element).transformCache[transformName] = "(" + propertyValue + ")";
                                        }

                                        /* Although the value is set on the transformCache object, return the newly-updated value for the calling code to process as normal. */
                                        return Data(element).transformCache[transformName];
                                }
                            };
                        })();
                    }

                    /*************
                        Colors
                    *************/

                    /* Since Velocity only animates a single numeric value per property, color animation is achieved by hooking the individual RGBA components of CSS color properties.
                       Accordingly, color values must be normalized (e.g. "#ff0000", "red", and "rgb(255, 0, 0)" ==> "255 0 0 1") so that their components can be injected/extracted by CSS.Hooks logic. */
                    for (var i = 0; i < CSS.Lists.colors.length; i++) {
                        /* Wrap the dynamically generated normalization function in a new scope so that colorName's value is paired with its respective function.
                           (Otherwise, all functions would take the final for loop's colorName.) */
                        (function () {
                            var colorName = CSS.Lists.colors[i];

                            /* Note: In IE<=8, which support rgb but not rgba, color properties are reverted to rgb by stripping off the alpha component. */
                            CSS.Normalizations.registered[colorName] = function (type, element, propertyValue) {
                                switch (type) {
                                    case "name":
                                        return colorName;
                                    /* Convert all color values into the rgb format. (Old IE can return hex values and color names instead of rgb/rgba.) */
                                    case "extract":
                                        var extracted;

                                        /* If the color is already in its hookable form (e.g. "255 255 255 1") due to having been previously extracted, skip extraction. */
                                        if (CSS.RegEx.wrappedValueAlreadyExtracted.test(propertyValue)) {
                                            extracted = propertyValue;
                                        } else {
                                            var converted,
                                                colorNames = {
                                                black: "rgb(0, 0, 0)",
                                                blue: "rgb(0, 0, 255)",
                                                gray: "rgb(128, 128, 128)",
                                                green: "rgb(0, 128, 0)",
                                                red: "rgb(255, 0, 0)",
                                                white: "rgb(255, 255, 255)"
                                            };

                                            /* Convert color names to rgb. */
                                            if (/^[A-z]+$/i.test(propertyValue)) {
                                                if (colorNames[propertyValue] !== undefined) {
                                                    converted = colorNames[propertyValue];
                                                } else {
                                                    /* If an unmatched color name is provided, default to black. */
                                                    converted = colorNames.black;
                                                }
                                                /* Convert hex values to rgb. */
                                            } else if (CSS.RegEx.isHex.test(propertyValue)) {
                                                converted = "rgb(" + CSS.Values.hexToRgb(propertyValue).join(" ") + ")";
                                                /* If the provided color doesn't match any of the accepted color formats, default to black. */
                                            } else if (!/^rgba?\(/i.test(propertyValue)) {
                                                converted = colorNames.black;
                                            }

                                            /* Remove the surrounding "rgb/rgba()" string then replace commas with spaces and strip
                                               repeated spaces (in case the value included spaces to begin with). */
                                            extracted = (converted || propertyValue).toString().match(CSS.RegEx.valueUnwrap)[1].replace(/,(\s+)?/g, " ");
                                        }

                                        /* So long as this isn't <=IE8, add a fourth (alpha) component if it's missing and default it to 1 (visible). */
                                        if (!(IE <= 8) && extracted.split(" ").length === 3) {
                                            extracted += " 1";
                                        }

                                        return extracted;
                                    case "inject":
                                        /* If this is IE<=8 and an alpha component exists, strip it off. */
                                        if (IE <= 8) {
                                            if (propertyValue.split(" ").length === 4) {
                                                propertyValue = propertyValue.split(/\s+/).slice(0, 3).join(" ");
                                            }
                                            /* Otherwise, add a fourth (alpha) component if it's missing and default it to 1 (visible). */
                                        } else if (propertyValue.split(" ").length === 3) {
                                            propertyValue += " 1";
                                        }

                                        /* Re-insert the browser-appropriate wrapper("rgb/rgba()"), insert commas, and strip off decimal units
                                           on all values but the fourth (R, G, and B only accept whole numbers). */
                                        return (IE <= 8 ? "rgb" : "rgba") + "(" + propertyValue.replace(/\s+/g, ",").replace(/\.(\d)+(?=,)/g, "") + ")";
                                }
                            };
                        })();
                    }
                }
            },

            /************************
               CSS Property Names
            ************************/

            Names: {
                /* Camelcase a property name into its JavaScript notation (e.g. "background-color" ==> "backgroundColor").
                   Camelcasing is used to normalize property names between and across calls. */
                camelCase: function (property) {
                    return property.replace(/-(\w)/g, function (match, subMatch) {
                        return subMatch.toUpperCase();
                    });
                },

                /* For SVG elements, some properties (namely, dimensional ones) are GET/SET via the element's HTML attributes (instead of via CSS styles). */
                SVGAttribute: function (property) {
                    var SVGAttributes = "width|height|x|y|cx|cy|r|rx|ry|x1|x2|y1|y2";

                    /* Certain browsers require an SVG transform to be applied as an attribute. (Otherwise, application via CSS is preferable due to 3D support.) */
                    if (IE || Velocity.State.isAndroid && !Velocity.State.isChrome) {
                        SVGAttributes += "|transform";
                    }

                    return new RegExp("^(" + SVGAttributes + ")$", "i").test(property);
                },

                /* Determine whether a property should be set with a vendor prefix. */
                /* If a prefixed version of the property exists, return it. Otherwise, return the original property name.
                   If the property is not at all supported by the browser, return a false flag. */
                prefixCheck: function (property) {
                    /* If this property has already been checked, return the cached value. */
                    if (Velocity.State.prefixMatches[property]) {
                        return [Velocity.State.prefixMatches[property], true];
                    } else {
                        var vendors = ["", "Webkit", "Moz", "ms", "O"];

                        for (var i = 0, vendorsLength = vendors.length; i < vendorsLength; i++) {
                            var propertyPrefixed;

                            if (i === 0) {
                                propertyPrefixed = property;
                            } else {
                                /* Capitalize the first letter of the property to conform to JavaScript vendor prefix notation (e.g. webkitFilter). */
                                propertyPrefixed = vendors[i] + property.replace(/^\w/, function (match) {
                                    return match.toUpperCase();
                                });
                            }

                            /* Check if the browser supports this property as prefixed. */
                            if (Type.isString(Velocity.State.prefixElement.style[propertyPrefixed])) {
                                /* Cache the match. */
                                Velocity.State.prefixMatches[property] = propertyPrefixed;

                                return [propertyPrefixed, true];
                            }
                        }

                        /* If the browser doesn't support this property in any form, include a false flag so that the caller can decide how to proceed. */
                        return [property, false];
                    }
                }
            },

            /************************
               CSS Property Values
            ************************/

            Values: {
                /* Hex to RGB conversion. Copyright Tim Down: http://stackoverflow.com/questions/5623838/rgb-to-hex-and-hex-to-rgb */
                hexToRgb: function (hex) {
                    var shortformRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i,
                        longformRegex = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i,
                        rgbParts;

                    hex = hex.replace(shortformRegex, function (m, r, g, b) {
                        return r + r + g + g + b + b;
                    });

                    rgbParts = longformRegex.exec(hex);

                    return rgbParts ? [parseInt(rgbParts[1], 16), parseInt(rgbParts[2], 16), parseInt(rgbParts[3], 16)] : [0, 0, 0];
                },

                isCSSNullValue: function (value) {
                    /* The browser defaults CSS values that have not been set to either 0 or one of several possible null-value strings.
                       Thus, we check for both falsiness and these special strings. */
                    /* Null-value checking is performed to default the special strings to 0 (for the sake of tweening) or their hook
                       templates as defined as CSS.Hooks (for the sake of hook injection/extraction). */
                    /* Note: Chrome returns "rgba(0, 0, 0, 0)" for an undefined color whereas IE returns "transparent". */
                    return value == 0 || /^(none|auto|transparent|(rgba\(0, ?0, ?0, ?0\)))$/i.test(value);
                },

                /* Retrieve a property's default unit type. Used for assigning a unit type when one is not supplied by the user. */
                getUnitType: function (property) {
                    if (/^(rotate|skew)/i.test(property)) {
                        return "deg";
                    } else if (/(^(scale|scaleX|scaleY|scaleZ|alpha|flexGrow|flexHeight|zIndex|fontWeight)$)|((opacity|red|green|blue|alpha)$)/i.test(property)) {
                        /* The above properties are unitless. */
                        return "";
                    } else {
                        /* Default to px for all other properties. */
                        return "px";
                    }
                },

                /* HTML elements default to an associated display type when they're not set to display:none. */
                /* Note: This function is used for correctly setting the non-"none" display value in certain Velocity redirects, such as fadeIn/Out. */
                getDisplayType: function (element) {
                    var tagName = element && element.tagName.toString().toLowerCase();

                    if (/^(b|big|i|small|tt|abbr|acronym|cite|code|dfn|em|kbd|strong|samp|var|a|bdo|br|img|map|object|q|script|span|sub|sup|button|input|label|select|textarea)$/i.test(tagName)) {
                        return "inline";
                    } else if (/^(li)$/i.test(tagName)) {
                        return "list-item";
                    } else if (/^(tr)$/i.test(tagName)) {
                        return "table-row";
                    } else if (/^(table)$/i.test(tagName)) {
                        return "table";
                    } else if (/^(tbody)$/i.test(tagName)) {
                        return "table-row-group";
                        /* Default to "block" when no match is found. */
                    } else {
                        return "block";
                    }
                },

                /* The class add/remove functions are used to temporarily apply a "velocity-animating" class to elements while they're animating. */
                addClass: function (element, className) {
                    if (element.classList) {
                        element.classList.add(className);
                    } else {
                        element.className += (element.className.length ? " " : "") + className;
                    }
                },

                removeClass: function (element, className) {
                    if (element.classList) {
                        element.classList.remove(className);
                    } else {
                        element.className = element.className.toString().replace(new RegExp("(^|\\s)" + className.split(" ").join("|") + "(\\s|$)", "gi"), " ");
                    }
                }
            },

            /****************************
               Style Getting & Setting
            ****************************/

            /* The singular getPropertyValue, which routes the logic for all normalizations, hooks, and standard CSS properties. */
            getPropertyValue: function (element, property, rootPropertyValue, forceStyleLookup) {
                /* Get an element's computed property value. */
                /* Note: Retrieving the value of a CSS property cannot simply be performed by checking an element's
                   style attribute (which only reflects user-defined values). Instead, the browser must be queried for a property's
                   *computed* value. You can read more about getComputedStyle here: https://developer.mozilla.org/en/docs/Web/API/window.getComputedStyle */
                function computePropertyValue(element, property) {
                    /* When box-sizing isn't set to border-box, height and width style values are incorrectly computed when an
                       element's scrollbars are visible (which expands the element's dimensions). Thus, we defer to the more accurate
                       offsetHeight/Width property, which includes the total dimensions for interior, border, padding, and scrollbar.
                       We subtract border and padding to get the sum of interior + scrollbar. */
                    var computedValue = 0;

                    /* IE<=8 doesn't support window.getComputedStyle, thus we defer to jQuery, which has an extensive array
                       of hacks to accurately retrieve IE8 property values. Re-implementing that logic here is not worth bloating the
                       codebase for a dying browser. The performance repercussions of using jQuery here are minimal since
                       Velocity is optimized to rarely (and sometimes never) query the DOM. Further, the $.css() codepath isn't that slow. */
                    if (IE <= 8) {
                        computedValue = $.css(element, property); /* GET */
                        /* All other browsers support getComputedStyle. The returned live object reference is cached onto its
                           associated element so that it does not need to be refetched upon every GET. */
                    } else {
                        var revertDisplay = function () {
                            if (toggleDisplay) {
                                CSS.setPropertyValue(element, "display", "none");
                            }
                        };

                        /* Browsers do not return height and width values for elements that are set to display:"none". Thus, we temporarily
                           toggle display to the element type's default value. */
                        var toggleDisplay = false;

                        if (/^(width|height)$/.test(property) && CSS.getPropertyValue(element, "display") === 0) {
                            toggleDisplay = true;
                            CSS.setPropertyValue(element, "display", CSS.Values.getDisplayType(element));
                        }

                        if (!forceStyleLookup) {
                            if (property === "height" && CSS.getPropertyValue(element, "boxSizing").toString().toLowerCase() !== "border-box") {
                                var contentBoxHeight = element.offsetHeight - (parseFloat(CSS.getPropertyValue(element, "borderTopWidth")) || 0) - (parseFloat(CSS.getPropertyValue(element, "borderBottomWidth")) || 0) - (parseFloat(CSS.getPropertyValue(element, "paddingTop")) || 0) - (parseFloat(CSS.getPropertyValue(element, "paddingBottom")) || 0);
                                revertDisplay();

                                return contentBoxHeight;
                            } else if (property === "width" && CSS.getPropertyValue(element, "boxSizing").toString().toLowerCase() !== "border-box") {
                                var contentBoxWidth = element.offsetWidth - (parseFloat(CSS.getPropertyValue(element, "borderLeftWidth")) || 0) - (parseFloat(CSS.getPropertyValue(element, "borderRightWidth")) || 0) - (parseFloat(CSS.getPropertyValue(element, "paddingLeft")) || 0) - (parseFloat(CSS.getPropertyValue(element, "paddingRight")) || 0);
                                revertDisplay();

                                return contentBoxWidth;
                            }
                        }

                        var computedStyle;

                        /* For elements that Velocity hasn't been called on directly (e.g. when Velocity queries the DOM on behalf
                           of a parent of an element its animating), perform a direct getComputedStyle lookup since the object isn't cached. */
                        if (Data(element) === undefined) {
                            computedStyle = window.getComputedStyle(element, null); /* GET */
                            /* If the computedStyle object has yet to be cached, do so now. */
                        } else if (!Data(element).computedStyle) {
                            computedStyle = Data(element).computedStyle = window.getComputedStyle(element, null); /* GET */
                            /* If computedStyle is cached, use it. */
                        } else {
                            computedStyle = Data(element).computedStyle;
                        }

                        /* IE and Firefox do not return a value for the generic borderColor -- they only return individual values for each border side's color.
                           Also, in all browsers, when border colors aren't all the same, a compound value is returned that Velocity isn't setup to parse.
                           So, as a polyfill for querying individual border side colors, we just return the top border's color and animate all borders from that value. */
                        if (property === "borderColor") {
                            property = "borderTopColor";
                        }

                        /* IE9 has a bug in which the "filter" property must be accessed from computedStyle using the getPropertyValue method
                           instead of a direct property lookup. The getPropertyValue method is slower than a direct lookup, which is why we avoid it by default. */
                        if (IE === 9 && property === "filter") {
                            computedValue = computedStyle.getPropertyValue(property); /* GET */
                        } else {
                            computedValue = computedStyle[property];
                        }

                        /* Fall back to the property's style value (if defined) when computedValue returns nothing,
                           which can happen when the element hasn't been painted. */
                        if (computedValue === "" || computedValue === null) {
                            computedValue = element.style[property];
                        }

                        revertDisplay();
                    }

                    /* For top, right, bottom, and left (TRBL) values that are set to "auto" on elements of "fixed" or "absolute" position,
                       defer to jQuery for converting "auto" to a numeric value. (For elements with a "static" or "relative" position, "auto" has the same
                       effect as being set to 0, so no conversion is necessary.) */
                    /* An example of why numeric conversion is necessary: When an element with "position:absolute" has an untouched "left"
                       property, which reverts to "auto", left's value is 0 relative to its parent element, but is often non-zero relative
                       to its *containing* (not parent) element, which is the nearest "position:relative" ancestor or the viewport (and always the viewport in the case of "position:fixed"). */
                    if (computedValue === "auto" && /^(top|right|bottom|left)$/i.test(property)) {
                        var position = computePropertyValue(element, "position"); /* GET */

                        /* For absolute positioning, jQuery's $.position() only returns values for top and left;
                           right and bottom will have their "auto" value reverted to 0. */
                        /* Note: A jQuery object must be created here since jQuery doesn't have a low-level alias for $.position().
                           Not a big deal since we're currently in a GET batch anyway. */
                        if (position === "fixed" || position === "absolute" && /top|left/i.test(property)) {
                            /* Note: jQuery strips the pixel unit from its returned values; we re-add it here to conform with computePropertyValue's behavior. */
                            computedValue = $(element).position()[property] + "px"; /* GET */
                        }
                    }

                    return computedValue;
                }

                var propertyValue;

                /* If this is a hooked property (e.g. "clipLeft" instead of the root property of "clip"),
                   extract the hook's value from a normalized rootPropertyValue using CSS.Hooks.extractValue(). */
                if (CSS.Hooks.registered[property]) {
                    var hook = property,
                        hookRoot = CSS.Hooks.getRoot(hook);

                    /* If a cached rootPropertyValue wasn't passed in (which Velocity always attempts to do in order to avoid requerying the DOM),
                       query the DOM for the root property's value. */
                    if (rootPropertyValue === undefined) {
                        /* Since the browser is now being directly queried, use the official post-prefixing property name for this lookup. */
                        rootPropertyValue = CSS.getPropertyValue(element, CSS.Names.prefixCheck(hookRoot)[0]); /* GET */
                    }

                    /* If this root has a normalization registered, peform the associated normalization extraction. */
                    if (CSS.Normalizations.registered[hookRoot]) {
                        rootPropertyValue = CSS.Normalizations.registered[hookRoot]("extract", element, rootPropertyValue);
                    }

                    /* Extract the hook's value. */
                    propertyValue = CSS.Hooks.extractValue(hook, rootPropertyValue);

                    /* If this is a normalized property (e.g. "opacity" becomes "filter" in <=IE8) or "translateX" becomes "transform"),
                       normalize the property's name and value, and handle the special case of transforms. */
                    /* Note: Normalizing a property is mutually exclusive from hooking a property since hook-extracted values are strictly
                       numerical and therefore do not require normalization extraction. */
                } else if (CSS.Normalizations.registered[property]) {
                    var normalizedPropertyName, normalizedPropertyValue;

                    normalizedPropertyName = CSS.Normalizations.registered[property]("name", element);

                    /* Transform values are calculated via normalization extraction (see below), which checks against the element's transformCache.
                       At no point do transform GETs ever actually query the DOM; initial stylesheet values are never processed.
                       This is because parsing 3D transform matrices is not always accurate and would bloat our codebase;
                       thus, normalization extraction defaults initial transform values to their zero-values (e.g. 1 for scaleX and 0 for translateX). */
                    if (normalizedPropertyName !== "transform") {
                        normalizedPropertyValue = computePropertyValue(element, CSS.Names.prefixCheck(normalizedPropertyName)[0]); /* GET */

                        /* If the value is a CSS null-value and this property has a hook template, use that zero-value template so that hooks can be extracted from it. */
                        if (CSS.Values.isCSSNullValue(normalizedPropertyValue) && CSS.Hooks.templates[property]) {
                            normalizedPropertyValue = CSS.Hooks.templates[property][1];
                        }
                    }

                    propertyValue = CSS.Normalizations.registered[property]("extract", element, normalizedPropertyValue);
                }

                /* If a (numeric) value wasn't produced via hook extraction or normalization, query the DOM. */
                if (!/^[\d-]/.test(propertyValue)) {
                    /* For SVG elements, dimensional properties (which SVGAttribute() detects) are tweened via
                       their HTML attribute values instead of their CSS style values. */
                    if (Data(element) && Data(element).isSVG && CSS.Names.SVGAttribute(property)) {
                        /* Since the height/width attribute values must be set manually, they don't reflect computed values.
                           Thus, we use use getBBox() to ensure we always get values for elements with undefined height/width attributes. */
                        if (/^(height|width)$/i.test(property)) {
                            /* Firefox throws an error if .getBBox() is called on an SVG that isn't attached to the DOM. */
                            try {
                                propertyValue = element.getBBox()[property];
                            } catch (error) {
                                propertyValue = 0;
                            }
                            /* Otherwise, access the attribute value directly. */
                        } else {
                            propertyValue = element.getAttribute(property);
                        }
                    } else {
                        propertyValue = computePropertyValue(element, CSS.Names.prefixCheck(property)[0]); /* GET */
                    }
                }

                /* Since property lookups are for animation purposes (which entails computing the numeric delta between start and end values),
                   convert CSS null-values to an integer of value 0. */
                if (CSS.Values.isCSSNullValue(propertyValue)) {
                    propertyValue = 0;
                }

                if (Velocity.debug >= 2) console.log("Get " + property + ": " + propertyValue);

                return propertyValue;
            },

            /* The singular setPropertyValue, which routes the logic for all normalizations, hooks, and standard CSS properties. */
            setPropertyValue: function (element, property, propertyValue, rootPropertyValue, scrollData) {
                var propertyName = property;

                /* In order to be subjected to call options and element queueing, scroll animation is routed through Velocity as if it were a standard CSS property. */
                if (property === "scroll") {
                    /* If a container option is present, scroll the container instead of the browser window. */
                    if (scrollData.container) {
                        scrollData.container["scroll" + scrollData.direction] = propertyValue;
                        /* Otherwise, Velocity defaults to scrolling the browser window. */
                    } else {
                        if (scrollData.direction === "Left") {
                            window.scrollTo(propertyValue, scrollData.alternateValue);
                        } else {
                            window.scrollTo(scrollData.alternateValue, propertyValue);
                        }
                    }
                } else {
                    /* Transforms (translateX, rotateZ, etc.) are applied to a per-element transformCache object, which is manually flushed via flushTransformCache().
                       Thus, for now, we merely cache transforms being SET. */
                    if (CSS.Normalizations.registered[property] && CSS.Normalizations.registered[property]("name", element) === "transform") {
                        /* Perform a normalization injection. */
                        /* Note: The normalization logic handles the transformCache updating. */
                        CSS.Normalizations.registered[property]("inject", element, propertyValue);

                        propertyName = "transform";
                        propertyValue = Data(element).transformCache[property];
                    } else {
                        /* Inject hooks. */
                        if (CSS.Hooks.registered[property]) {
                            var hookName = property,
                                hookRoot = CSS.Hooks.getRoot(property);

                            /* If a cached rootPropertyValue was not provided, query the DOM for the hookRoot's current value. */
                            rootPropertyValue = rootPropertyValue || CSS.getPropertyValue(element, hookRoot); /* GET */

                            propertyValue = CSS.Hooks.injectValue(hookName, propertyValue, rootPropertyValue);
                            property = hookRoot;
                        }

                        /* Normalize names and values. */
                        if (CSS.Normalizations.registered[property]) {
                            propertyValue = CSS.Normalizations.registered[property]("inject", element, propertyValue);
                            property = CSS.Normalizations.registered[property]("name", element);
                        }

                        /* Assign the appropriate vendor prefix before performing an official style update. */
                        propertyName = CSS.Names.prefixCheck(property)[0];

                        /* A try/catch is used for IE<=8, which throws an error when "invalid" CSS values are set, e.g. a negative width.
                           Try/catch is avoided for other browsers since it incurs a performance overhead. */
                        if (IE <= 8) {
                            try {
                                element.style[propertyName] = propertyValue;
                            } catch (error) {
                                if (Velocity.debug) console.log("Browser does not support [" + propertyValue + "] for [" + propertyName + "]");
                            }
                            /* SVG elements have their dimensional properties (width, height, x, y, cx, etc.) applied directly as attributes instead of as styles. */
                            /* Note: IE8 does not support SVG elements, so it's okay that we skip it for SVG animation. */
                        } else if (Data(element) && Data(element).isSVG && CSS.Names.SVGAttribute(property)) {
                            /* Note: For SVG attributes, vendor-prefixed property names are never used. */
                            /* Note: Not all CSS properties can be animated via attributes, but the browser won't throw an error for unsupported properties. */
                            element.setAttribute(property, propertyValue);
                        } else {
                            element.style[propertyName] = propertyValue;
                        }

                        if (Velocity.debug >= 2) console.log("Set " + property + " (" + propertyName + "): " + propertyValue);
                    }
                }

                /* Return the normalized property name and value in case the caller wants to know how these values were modified before being applied to the DOM. */
                return [propertyName, propertyValue];
            },

            /* To increase performance by batching transform updates into a single SET, transforms are not directly applied to an element until flushTransformCache() is called. */
            /* Note: Velocity applies transform properties in the same order that they are chronogically introduced to the element's CSS styles. */
            flushTransformCache: function (element) {
                var transformString = "";

                /* Certain browsers require that SVG transforms be applied as an attribute. However, the SVG transform attribute takes a modified version of CSS's transform string
                   (units are dropped and, except for skewX/Y, subproperties are merged into their master property -- e.g. scaleX and scaleY are merged into scale(X Y). */
                if ((IE || Velocity.State.isAndroid && !Velocity.State.isChrome) && Data(element).isSVG) {
                    var getTransformFloat =
                    /* Since transform values are stored in their parentheses-wrapped form, we use a helper function to strip out their numeric values.
                       Further, SVG transform properties only take unitless (representing pixels) values, so it's okay that parseFloat() strips the unit suffixed to the float value. */
                    function (transformProperty) {
                        return parseFloat(CSS.getPropertyValue(element, transformProperty));
                    };

                    /* Create an object to organize all the transforms that we'll apply to the SVG element. To keep the logic simple,
                       we process *all* transform properties -- even those that may not be explicitly applied (since they default to their zero-values anyway). */
                    var SVGTransforms = {
                        translate: [getTransformFloat("translateX"), getTransformFloat("translateY")],
                        skewX: [getTransformFloat("skewX")], skewY: [getTransformFloat("skewY")],
                        /* If the scale property is set (non-1), use that value for the scaleX and scaleY values
                           (this behavior mimics the result of animating all these properties at once on HTML elements). */
                        scale: getTransformFloat("scale") !== 1 ? [getTransformFloat("scale"), getTransformFloat("scale")] : [getTransformFloat("scaleX"), getTransformFloat("scaleY")],
                        /* Note: SVG's rotate transform takes three values: rotation degrees followed by the X and Y values
                           defining the rotation's origin point. We ignore the origin values (default them to 0). */
                        rotate: [getTransformFloat("rotateZ"), 0, 0]
                    };

                    /* Iterate through the transform properties in the user-defined property map order.
                       (This mimics the behavior of non-SVG transform animation.) */
                    $.each(Data(element).transformCache, function (transformName) {
                        /* Except for with skewX/Y, revert the axis-specific transform subproperties to their axis-free master
                           properties so that they match up with SVG's accepted transform properties. */
                        if (/^translate/i.test(transformName)) {
                            transformName = "translate";
                        } else if (/^scale/i.test(transformName)) {
                            transformName = "scale";
                        } else if (/^rotate/i.test(transformName)) {
                            transformName = "rotate";
                        }

                        /* Check that we haven't yet deleted the property from the SVGTransforms container. */
                        if (SVGTransforms[transformName]) {
                            /* Append the transform property in the SVG-supported transform format. As per the spec, surround the space-delimited values in parentheses. */
                            transformString += transformName + "(" + SVGTransforms[transformName].join(" ") + ")" + " ";

                            /* After processing an SVG transform property, delete it from the SVGTransforms container so we don't
                               re-insert the same master property if we encounter another one of its axis-specific properties. */
                            delete SVGTransforms[transformName];
                        }
                    });
                } else {
                    var transformValue, perspective;

                    /* Transform properties are stored as members of the transformCache object. Concatenate all the members into a string. */
                    $.each(Data(element).transformCache, function (transformName) {
                        transformValue = Data(element).transformCache[transformName];

                        /* Transform's perspective subproperty must be set first in order to take effect. Store it temporarily. */
                        if (transformName === "transformPerspective") {
                            perspective = transformValue;
                            return true;
                        }

                        /* IE9 only supports one rotation type, rotateZ, which it refers to as "rotate". */
                        if (IE === 9 && transformName === "rotateZ") {
                            transformName = "rotate";
                        }

                        transformString += transformName + transformValue + " ";
                    });

                    /* If present, set the perspective subproperty first. */
                    if (perspective) {
                        transformString = "perspective" + perspective + " " + transformString;
                    }
                }

                CSS.setPropertyValue(element, "transform", transformString);
            }
        };

        /* Register hooks and normalizations. */
        CSS.Hooks.register();
        CSS.Normalizations.register();

        /* Allow hook setting in the same fashion as jQuery's $.css(). */
        Velocity.hook = function (elements, arg2, arg3) {
            var value = undefined;

            elements = sanitizeElements(elements);

            $.each(elements, function (i, element) {
                /* Initialize Velocity's per-element data cache if this element hasn't previously been animated. */
                if (Data(element) === undefined) {
                    Velocity.init(element);
                }

                /* Get property value. If an element set was passed in, only return the value for the first element. */
                if (arg3 === undefined) {
                    if (value === undefined) {
                        value = Velocity.CSS.getPropertyValue(element, arg2);
                    }
                    /* Set property value. */
                } else {
                    /* sPV returns an array of the normalized propertyName/propertyValue pair used to update the DOM. */
                    var adjustedSet = Velocity.CSS.setPropertyValue(element, arg2, arg3);

                    /* Transform properties don't automatically set. They have to be flushed to the DOM. */
                    if (adjustedSet[0] === "transform") {
                        Velocity.CSS.flushTransformCache(element);
                    }

                    value = adjustedSet;
                }
            });

            return value;
        };

        /*****************
            Animation
        *****************/

        var animate = function () {
            /******************
                Call Chain
            ******************/

            /* Logic for determining what to return to the call stack when exiting out of Velocity. */
            function getChain() {
                /* If we are using the utility function, attempt to return this call's promise. If no promise library was detected,
                   default to null instead of returning the targeted elements so that utility function's return value is standardized. */
                if (isUtility) {
                    return promiseData.promise || null;
                    /* Otherwise, if we're using $.fn, return the jQuery-/Zepto-wrapped element set. */
                } else {
                    return elementsWrapped;
                }
            }

            /*************************
               Arguments Assignment
            *************************/

            /* To allow for expressive CoffeeScript code, Velocity supports an alternative syntax in which "elements" (or "e"), "properties" (or "p"), and "options" (or "o")
               objects are defined on a container object that's passed in as Velocity's sole argument. */
            /* Note: Some browsers automatically populate arguments with a "properties" object. We detect it by checking for its default "names" property. */
            var syntacticSugar = arguments[0] && (arguments[0].p || ($.isPlainObject(arguments[0].properties) && !arguments[0].properties.names || Type.isString(arguments[0].properties))),

            /* Whether Velocity was called via the utility function (as opposed to on a jQuery/Zepto object). */
            isUtility,

            /* When Velocity is called via the utility function ($.Velocity()/Velocity()), elements are explicitly
               passed in as the first parameter. Thus, argument positioning varies. We normalize them here. */
            elementsWrapped,
                argumentIndex;

            var elements, propertiesMap, options;

            /* Detect jQuery/Zepto elements being animated via the $.fn method. */
            if (Type.isWrapped(this)) {
                isUtility = false;

                argumentIndex = 0;
                elements = this;
                elementsWrapped = this;
                /* Otherwise, raw elements are being animated via the utility function. */
            } else {
                isUtility = true;

                argumentIndex = 1;
                elements = syntacticSugar ? arguments[0].elements || arguments[0].e : arguments[0];
            }

            elements = sanitizeElements(elements);

            if (!elements) {
                return;
            }

            if (syntacticSugar) {
                propertiesMap = arguments[0].properties || arguments[0].p;
                options = arguments[0].options || arguments[0].o;
            } else {
                propertiesMap = arguments[argumentIndex];
                options = arguments[argumentIndex + 1];
            }

            /* The length of the element set (in the form of a nodeList or an array of elements) is defaulted to 1 in case a
               single raw DOM element is passed in (which doesn't contain a length property). */
            var elementsLength = elements.length,
                elementsIndex = 0;

            /***************************
                Argument Overloading
            ***************************/

            /* Support is included for jQuery's argument overloading: $.animate(propertyMap [, duration] [, easing] [, complete]).
               Overloading is detected by checking for the absence of an object being passed into options. */
            /* Note: The stop and finish actions do not accept animation options, and are therefore excluded from this check. */
            if (!/^(stop|finish)$/i.test(propertiesMap) && !$.isPlainObject(options)) {
                /* The utility function shifts all arguments one position to the right, so we adjust for that offset. */
                var startingArgumentPosition = argumentIndex + 1;

                options = {};

                /* Iterate through all options arguments */
                for (var i = startingArgumentPosition; i < arguments.length; i++) {
                    /* Treat a number as a duration. Parse it out. */
                    /* Note: The following RegEx will return true if passed an array with a number as its first item.
                       Thus, arrays are skipped from this check. */
                    if (!Type.isArray(arguments[i]) && (/^(fast|normal|slow)$/i.test(arguments[i]) || /^\d/.test(arguments[i]))) {
                        options.duration = arguments[i];
                        /* Treat strings and arrays as easings. */
                    } else if (Type.isString(arguments[i]) || Type.isArray(arguments[i])) {
                        options.easing = arguments[i];
                        /* Treat a function as a complete callback. */
                    } else if (Type.isFunction(arguments[i])) {
                        options.complete = arguments[i];
                    }
                }
            }

            /***************
                Promises
            ***************/

            var promiseData = {
                promise: null,
                resolver: null,
                rejecter: null
            };

            /* If this call was made via the utility function (which is the default method of invocation when jQuery/Zepto are not being used), and if
               promise support was detected, create a promise object for this call and store references to its resolver and rejecter methods. The resolve
               method is used when a call completes naturally or is prematurely stopped by the user. In both cases, completeCall() handles the associated
               call cleanup and promise resolving logic. The reject method is used when an invalid set of arguments is passed into a Velocity call. */
            /* Note: Velocity employs a call-based queueing architecture, which means that stopping an animating element actually stops the full call that
               triggered it -- not that one element exclusively. Similarly, there is one promise per call, and all elements targeted by a Velocity call are
               grouped together for the purposes of resolving and rejecting a promise. */
            if (isUtility && Velocity.Promise) {
                promiseData.promise = new Velocity.Promise(function (resolve, reject) {
                    promiseData.resolver = resolve;
                    promiseData.rejecter = reject;
                });
            }

            /*********************
               Action Detection
            *********************/

            /* Velocity's behavior is categorized into "actions": Elements can either be specially scrolled into view,
               or they can be started, stopped, or reversed. If a literal or referenced properties map is passed in as Velocity's
               first argument, the associated action is "start". Alternatively, "scroll", "reverse", or "stop" can be passed in instead of a properties map. */
            var action;

            switch (propertiesMap) {
                case "scroll":
                    action = "scroll";
                    break;

                case "reverse":
                    action = "reverse";
                    break;

                case "finish":
                case "stop":
                    /*******************
                        Action: Stop
                    *******************/

                    /* Clear the currently-active delay on each targeted element. */
                    $.each(elements, function (i, element) {
                        if (Data(element) && Data(element).delayTimer) {
                            /* Stop the timer from triggering its cached next() function. */
                            clearTimeout(Data(element).delayTimer.setTimeout);

                            /* Manually call the next() function so that the subsequent queue items can progress. */
                            if (Data(element).delayTimer.next) {
                                Data(element).delayTimer.next();
                            }

                            delete Data(element).delayTimer;
                        }
                    });

                    var callsToStop = [];

                    /* When the stop action is triggered, the elements' currently active call is immediately stopped. The active call might have
                       been applied to multiple elements, in which case all of the call's elements will be stopped. When an element
                       is stopped, the next item in its animation queue is immediately triggered. */
                    /* An additional argument may be passed in to clear an element's remaining queued calls. Either true (which defaults to the "fx" queue)
                       or a custom queue string can be passed in. */
                    /* Note: The stop command runs prior to Velocity's Queueing phase since its behavior is intended to take effect *immediately*,
                       regardless of the element's current queue state. */

                    /* Iterate through every active call. */
                    $.each(Velocity.State.calls, function (i, activeCall) {
                        /* Inactive calls are set to false by the logic inside completeCall(). Skip them. */
                        if (activeCall) {
                            /* Iterate through the active call's targeted elements. */
                            $.each(activeCall[1], function (k, activeElement) {
                                /* If true was passed in as a secondary argument, clear absolutely all calls on this element. Otherwise, only
                                   clear calls associated with the relevant queue. */
                                /* Call stopping logic works as follows:
                                   - options === true --> stop current default queue calls (and queue:false calls), including remaining queued ones.
                                   - options === undefined --> stop current queue:"" call and all queue:false calls.
                                   - options === false --> stop only queue:false calls.
                                   - options === "custom" --> stop current queue:"custom" call, including remaining queued ones (there is no functionality to only clear the currently-running queue:"custom" call). */
                                var queueName = options === undefined ? "" : options;

                                if (queueName !== true && activeCall[2].queue !== queueName && !(options === undefined && activeCall[2].queue === false)) {
                                    return true;
                                }

                                /* Iterate through the calls targeted by the stop command. */
                                $.each(elements, function (l, element) {
                                    /* Check that this call was applied to the target element. */
                                    if (element === activeElement) {
                                        /* Optionally clear the remaining queued calls. */
                                        if (options === true || Type.isString(options)) {
                                            /* Iterate through the items in the element's queue. */
                                            $.each($.queue(element, Type.isString(options) ? options : ""), function (_, item) {
                                                /* The queue array can contain an "inprogress" string, which we skip. */
                                                if (Type.isFunction(item)) {
                                                    /* Pass the item's callback a flag indicating that we want to abort from the queue call.
                                                       (Specifically, the queue will resolve the call's associated promise then abort.)  */
                                                    item(null, true);
                                                }
                                            });

                                            /* Clearing the $.queue() array is achieved by resetting it to []. */
                                            $.queue(element, Type.isString(options) ? options : "", []);
                                        }

                                        if (propertiesMap === "stop") {
                                            /* Since "reverse" uses cached start values (the previous call's endValues), these values must be
                                               changed to reflect the final value that the elements were actually tweened to. */
                                            /* Note: If only queue:false animations are currently running on an element, it won't have a tweensContainer
                                               object. Also, queue:false animations can't be reversed. */
                                            if (Data(element) && Data(element).tweensContainer && queueName !== false) {
                                                $.each(Data(element).tweensContainer, function (m, activeTween) {
                                                    activeTween.endValue = activeTween.currentValue;
                                                });
                                            }

                                            callsToStop.push(i);
                                        } else if (propertiesMap === "finish") {
                                            /* To get active tweens to finish immediately, we forcefully shorten their durations to 1ms so that
                                            they finish upon the next rAf tick then proceed with normal call completion logic. */
                                            activeCall[2].duration = 1;
                                        }
                                    }
                                });
                            });
                        }
                    });

                    /* Prematurely call completeCall() on each matched active call. Pass an additional flag for "stop" to indicate
                       that the complete callback and display:none setting should be skipped since we're completing prematurely. */
                    if (propertiesMap === "stop") {
                        $.each(callsToStop, function (i, j) {
                            completeCall(j, true);
                        });

                        if (promiseData.promise) {
                            /* Immediately resolve the promise associated with this stop call since stop runs synchronously. */
                            promiseData.resolver(elements);
                        }
                    }

                    /* Since we're stopping, and not proceeding with queueing, exit out of Velocity. */
                    return getChain();

                default:
                    /* Treat a non-empty plain object as a literal properties map. */
                    if ($.isPlainObject(propertiesMap) && !Type.isEmptyObject(propertiesMap)) {
                        action = "start";

                        /****************
                            Redirects
                        ****************/

                        /* Check if a string matches a registered redirect (see Redirects above). */
                    } else if (Type.isString(propertiesMap) && Velocity.Redirects[propertiesMap]) {
                        var opts = $.extend({}, options),
                            durationOriginal = opts.duration,
                            delayOriginal = opts.delay || 0;

                        /* If the backwards option was passed in, reverse the element set so that elements animate from the last to the first. */
                        if (opts.backwards === true) {
                            elements = $.extend(true, [], elements).reverse();
                        }

                        /* Individually trigger the redirect for each element in the set to prevent users from having to handle iteration logic in their redirect. */
                        $.each(elements, function (elementIndex, element) {
                            /* If the stagger option was passed in, successively delay each element by the stagger value (in ms). Retain the original delay value. */
                            if (parseFloat(opts.stagger)) {
                                opts.delay = delayOriginal + parseFloat(opts.stagger) * elementIndex;
                            } else if (Type.isFunction(opts.stagger)) {
                                opts.delay = delayOriginal + opts.stagger.call(element, elementIndex, elementsLength);
                            }

                            /* If the drag option was passed in, successively increase/decrease (depending on the presense of opts.backwards)
                               the duration of each element's animation, using floors to prevent producing very short durations. */
                            if (opts.drag) {
                                /* Default the duration of UI pack effects (callouts and transitions) to 1000ms instead of the usual default duration of 400ms. */
                                opts.duration = parseFloat(durationOriginal) || (/^(callout|transition)/.test(propertiesMap) ? 1000 : DURATION_DEFAULT);

                                /* For each element, take the greater duration of: A) animation completion percentage relative to the original duration,
                                   B) 75% of the original duration, or C) a 200ms fallback (in case duration is already set to a low value).
                                   The end result is a baseline of 75% of the redirect's duration that increases/decreases as the end of the element set is approached. */
                                opts.duration = Math.max(opts.duration * (opts.backwards ? 1 - elementIndex / elementsLength : (elementIndex + 1) / elementsLength), opts.duration * 0.75, 200);
                            }

                            /* Pass in the call's opts object so that the redirect can optionally extend it. It defaults to an empty object instead of null to
                               reduce the opts checking logic required inside the redirect. */
                            Velocity.Redirects[propertiesMap].call(element, element, opts || {}, elementIndex, elementsLength, elements, promiseData.promise ? promiseData : undefined);
                        });

                        /* Since the animation logic resides within the redirect's own code, abort the remainder of this call.
                           (The performance overhead up to this point is virtually non-existant.) */
                        /* Note: The jQuery call chain is kept intact by returning the complete element set. */
                        return getChain();
                    } else {
                        var abortError = "Velocity: First argument (" + propertiesMap + ") was not a property map, a known action, or a registered redirect. Aborting.";

                        if (promiseData.promise) {
                            promiseData.rejecter(new Error(abortError));
                        } else {
                            console.log(abortError);
                        }

                        return getChain();
                    }
            }

            /**************************
                Call-Wide Variables
            **************************/

            /* A container for CSS unit conversion ratios (e.g. %, rem, and em ==> px) that is used to cache ratios across all elements
               being animated in a single Velocity call. Calculating unit ratios necessitates DOM querying and updating, and is therefore
               avoided (via caching) wherever possible. This container is call-wide instead of page-wide to avoid the risk of using stale
               conversion metrics across Velocity animations that are not immediately consecutively chained. */
            var callUnitConversionData = {
                lastParent: null,
                lastPosition: null,
                lastFontSize: null,
                lastPercentToPxWidth: null,
                lastPercentToPxHeight: null,
                lastEmToPx: null,
                remToPx: null,
                vwToPx: null,
                vhToPx: null
            };

            /* A container for all the ensuing tween data and metadata associated with this call. This container gets pushed to the page-wide
               Velocity.State.calls array that is processed during animation ticking. */
            var call = [];

            /************************
               Element Processing
            ************************/

            /* Element processing consists of three parts -- data processing that cannot go stale and data processing that *can* go stale (i.e. third-party style modifications):
               1) Pre-Queueing: Element-wide variables, including the element's data storage, are instantiated. Call options are prepared. If triggered, the Stop action is executed.
               2) Queueing: The logic that runs once this call has reached its point of execution in the element's $.queue() stack. Most logic is placed here to avoid risking it becoming stale.
               3) Pushing: Consolidation of the tween data followed by its push onto the global in-progress calls container.
            */

            function processElement() {
                /*************************
                   Part I: Pre-Queueing
                *************************/

                /***************************
                   Element-Wide Variables
                ***************************/

                var element = this,

                /* The runtime opts object is the extension of the current call's options and Velocity's page-wide option defaults. */
                opts = $.extend({}, Velocity.defaults, options),

                /* A container for the processed data associated with each property in the propertyMap.
                   (Each property in the map produces its own "tween".) */
                tweensContainer = {},
                    elementUnitConversionData;

                /******************
                   Element Init
                ******************/

                if (Data(element) === undefined) {
                    Velocity.init(element);
                }

                /******************
                   Option: Delay
                ******************/

                /* Since queue:false doesn't respect the item's existing queue, we avoid injecting its delay here (it's set later on). */
                /* Note: Velocity rolls its own delay function since jQuery doesn't have a utility alias for $.fn.delay()
                   (and thus requires jQuery element creation, which we avoid since its overhead includes DOM querying). */
                if (parseFloat(opts.delay) && opts.queue !== false) {
                    $.queue(element, opts.queue, function (next) {
                        /* This is a flag used to indicate to the upcoming completeCall() function that this queue entry was initiated by Velocity. See completeCall() for further details. */
                        Velocity.velocityQueueEntryFlag = true;

                        /* The ensuing queue item (which is assigned to the "next" argument that $.queue() automatically passes in) will be triggered after a setTimeout delay.
                           The setTimeout is stored so that it can be subjected to clearTimeout() if this animation is prematurely stopped via Velocity's "stop" command. */
                        Data(element).delayTimer = {
                            setTimeout: setTimeout(next, parseFloat(opts.delay)),
                            next: next
                        };
                    });
                }

                /*********************
                   Option: Duration
                *********************/

                /* Support for jQuery's named durations. */
                switch (opts.duration.toString().toLowerCase()) {
                    case "fast":
                        opts.duration = 200;
                        break;

                    case "normal":
                        opts.duration = DURATION_DEFAULT;
                        break;

                    case "slow":
                        opts.duration = 600;
                        break;

                    default:
                        /* Remove the potential "ms" suffix and default to 1 if the user is attempting to set a duration of 0 (in order to produce an immediate style change). */
                        opts.duration = parseFloat(opts.duration) || 1;
                }

                /************************
                   Global Option: Mock
                ************************/

                if (Velocity.mock !== false) {
                    /* In mock mode, all animations are forced to 1ms so that they occur immediately upon the next rAF tick.
                       Alternatively, a multiplier can be passed in to time remap all delays and durations. */
                    if (Velocity.mock === true) {
                        opts.duration = opts.delay = 1;
                    } else {
                        opts.duration *= parseFloat(Velocity.mock) || 1;
                        opts.delay *= parseFloat(Velocity.mock) || 1;
                    }
                }

                /*******************
                   Option: Easing
                *******************/

                opts.easing = getEasing(opts.easing, opts.duration);

                /**********************
                   Option: Callbacks
                **********************/

                /* Callbacks must functions. Otherwise, default to null. */
                if (opts.begin && !Type.isFunction(opts.begin)) {
                    opts.begin = null;
                }

                if (opts.progress && !Type.isFunction(opts.progress)) {
                    opts.progress = null;
                }

                if (opts.complete && !Type.isFunction(opts.complete)) {
                    opts.complete = null;
                }

                /*********************************
                   Option: Display & Visibility
                *********************************/

                /* Refer to Velocity's documentation (VelocityJS.org/#displayAndVisibility) for a description of the display and visibility options' behavior. */
                /* Note: We strictly check for undefined instead of falsiness because display accepts an empty string value. */
                if (opts.display !== undefined && opts.display !== null) {
                    opts.display = opts.display.toString().toLowerCase();

                    /* Users can pass in a special "auto" value to instruct Velocity to set the element to its default display value. */
                    if (opts.display === "auto") {
                        opts.display = Velocity.CSS.Values.getDisplayType(element);
                    }
                }

                if (opts.visibility !== undefined && opts.visibility !== null) {
                    opts.visibility = opts.visibility.toString().toLowerCase();
                }

                /**********************
                   Option: mobileHA
                **********************/

                /* When set to true, and if this is a mobile device, mobileHA automatically enables hardware acceleration (via a null transform hack)
                   on animating elements. HA is removed from the element at the completion of its animation. */
                /* Note: Android Gingerbread doesn't support HA. If a null transform hack (mobileHA) is in fact set, it will prevent other tranform subproperties from taking effect. */
                /* Note: You can read more about the use of mobileHA in Velocity's documentation: VelocityJS.org/#mobileHA. */
                opts.mobileHA = opts.mobileHA && Velocity.State.isMobile && !Velocity.State.isGingerbread;

                /***********************
                   Part II: Queueing
                ***********************/

                /* When a set of elements is targeted by a Velocity call, the set is broken up and each element has the current Velocity call individually queued onto it.
                   In this way, each element's existing queue is respected; some elements may already be animating and accordingly should not have this current Velocity call triggered immediately. */
                /* In each queue, tween data is processed for each animating property then pushed onto the call-wide calls array. When the last element in the set has had its tweens processed,
                   the call array is pushed to Velocity.State.calls for live processing by the requestAnimationFrame tick. */
                function buildQueue(next) {
                    /*******************
                       Option: Begin
                    *******************/

                    /* The begin callback is fired once per call -- not once per elemenet -- and is passed the full raw DOM element set as both its context and its first argument. */
                    if (opts.begin && elementsIndex === 0) {
                        /* We throw callbacks in a setTimeout so that thrown errors don't halt the execution of Velocity itself. */
                        try {
                            opts.begin.call(elements, elements);
                        } catch (error) {
                            setTimeout(function () {
                                throw error;
                            }, 1);
                        }
                    }

                    /*****************************************
                       Tween Data Construction (for Scroll)
                    *****************************************/

                    /* Note: In order to be subjected to chaining and animation options, scroll's tweening is routed through Velocity as if it were a standard CSS property animation. */
                    if (action === "scroll") {
                        /* The scroll action uniquely takes an optional "offset" option -- specified in pixels -- that offsets the targeted scroll position. */
                        var scrollDirection = /^x$/i.test(opts.axis) ? "Left" : "Top",
                            scrollOffset = parseFloat(opts.offset) || 0,
                            scrollPositionCurrent,
                            scrollPositionCurrentAlternate,
                            scrollPositionEnd;

                        /* Scroll also uniquely takes an optional "container" option, which indicates the parent element that should be scrolled --
                           as opposed to the browser window itself. This is useful for scrolling toward an element that's inside an overflowing parent element. */
                        if (opts.container) {
                            /* Ensure that either a jQuery object or a raw DOM element was passed in. */
                            if (Type.isWrapped(opts.container) || Type.isNode(opts.container)) {
                                /* Extract the raw DOM element from the jQuery wrapper. */
                                opts.container = opts.container[0] || opts.container;
                                /* Note: Unlike other properties in Velocity, the browser's scroll position is never cached since it so frequently changes
                                   (due to the user's natural interaction with the page). */
                                scrollPositionCurrent = opts.container["scroll" + scrollDirection]; /* GET */

                                /* $.position() values are relative to the container's currently viewable area (without taking into account the container's true dimensions
                                   -- say, for example, if the container was not overflowing). Thus, the scroll end value is the sum of the child element's position *and*
                                   the scroll container's current scroll position. */
                                scrollPositionEnd = scrollPositionCurrent + $(element).position()[scrollDirection.toLowerCase()] + scrollOffset; /* GET */
                                /* If a value other than a jQuery object or a raw DOM element was passed in, default to null so that this option is ignored. */
                            } else {
                                opts.container = null;
                            }
                        } else {
                            /* If the window itself is being scrolled -- not a containing element -- perform a live scroll position lookup using
                               the appropriate cached property names (which differ based on browser type). */
                            scrollPositionCurrent = Velocity.State.scrollAnchor[Velocity.State["scrollProperty" + scrollDirection]]; /* GET */
                            /* When scrolling the browser window, cache the alternate axis's current value since window.scrollTo() doesn't let us change only one value at a time. */
                            scrollPositionCurrentAlternate = Velocity.State.scrollAnchor[Velocity.State["scrollProperty" + (scrollDirection === "Left" ? "Top" : "Left")]]; /* GET */

                            /* Unlike $.position(), $.offset() values are relative to the browser window's true dimensions -- not merely its currently viewable area --
                               and therefore end values do not need to be compounded onto current values. */
                            scrollPositionEnd = $(element).offset()[scrollDirection.toLowerCase()] + scrollOffset; /* GET */
                        }

                        /* Since there's only one format that scroll's associated tweensContainer can take, we create it manually. */
                        tweensContainer = {
                            scroll: {
                                rootPropertyValue: false,
                                startValue: scrollPositionCurrent,
                                currentValue: scrollPositionCurrent,
                                endValue: scrollPositionEnd,
                                unitType: "",
                                easing: opts.easing,
                                scrollData: {
                                    container: opts.container,
                                    direction: scrollDirection,
                                    alternateValue: scrollPositionCurrentAlternate
                                }
                            },
                            element: element
                        };

                        if (Velocity.debug) console.log("tweensContainer (scroll): ", tweensContainer.scroll, element);

                        /******************************************
                           Tween Data Construction (for Reverse)
                        ******************************************/

                        /* Reverse acts like a "start" action in that a property map is animated toward. The only difference is
                           that the property map used for reverse is the inverse of the map used in the previous call. Thus, we manipulate
                           the previous call to construct our new map: use the previous map's end values as our new map's start values. Copy over all other data. */
                        /* Note: Reverse can be directly called via the "reverse" parameter, or it can be indirectly triggered via the loop option. (Loops are composed of multiple reverses.) */
                        /* Note: Reverse calls do not need to be consecutively chained onto a currently-animating element in order to operate on cached values;
                           there is no harm to reverse being called on a potentially stale data cache since reverse's behavior is simply defined
                           as reverting to the element's values as they were prior to the previous *Velocity* call. */
                    } else if (action === "reverse") {
                        /* Abort if there is no prior animation data to reverse to. */
                        if (!Data(element).tweensContainer) {
                            /* Dequeue the element so that this queue entry releases itself immediately, allowing subsequent queue entries to run. */
                            $.dequeue(element, opts.queue);

                            return;
                        } else {
                            /*********************
                               Options Parsing
                            *********************/

                            /* If the element was hidden via the display option in the previous call,
                               revert display to "auto" prior to reversal so that the element is visible again. */
                            if (Data(element).opts.display === "none") {
                                Data(element).opts.display = "auto";
                            }

                            if (Data(element).opts.visibility === "hidden") {
                                Data(element).opts.visibility = "visible";
                            }

                            /* If the loop option was set in the previous call, disable it so that "reverse" calls aren't recursively generated.
                               Further, remove the previous call's callback options; typically, users do not want these to be refired. */
                            Data(element).opts.loop = false;
                            Data(element).opts.begin = null;
                            Data(element).opts.complete = null;

                            /* Since we're extending an opts object that has already been extended with the defaults options object,
                               we remove non-explicitly-defined properties that are auto-assigned values. */
                            if (!options.easing) {
                                delete opts.easing;
                            }

                            if (!options.duration) {
                                delete opts.duration;
                            }

                            /* The opts object used for reversal is an extension of the options object optionally passed into this
                               reverse call plus the options used in the previous Velocity call. */
                            opts = $.extend({}, Data(element).opts, opts);

                            /*************************************
                               Tweens Container Reconstruction
                            *************************************/

                            /* Create a deepy copy (indicated via the true flag) of the previous call's tweensContainer. */
                            var lastTweensContainer = $.extend(true, {}, Data(element).tweensContainer);

                            /* Manipulate the previous tweensContainer by replacing its end values and currentValues with its start values. */
                            for (var lastTween in lastTweensContainer) {
                                /* In addition to tween data, tweensContainers contain an element property that we ignore here. */
                                if (lastTween !== "element") {
                                    var lastStartValue = lastTweensContainer[lastTween].startValue;

                                    lastTweensContainer[lastTween].startValue = lastTweensContainer[lastTween].currentValue = lastTweensContainer[lastTween].endValue;
                                    lastTweensContainer[lastTween].endValue = lastStartValue;

                                    /* Easing is the only option that embeds into the individual tween data (since it can be defined on a per-property basis).
                                       Accordingly, every property's easing value must be updated when an options object is passed in with a reverse call.
                                       The side effect of this extensibility is that all per-property easing values are forcefully reset to the new value. */
                                    if (!Type.isEmptyObject(options)) {
                                        lastTweensContainer[lastTween].easing = opts.easing;
                                    }

                                    if (Velocity.debug) console.log("reverse tweensContainer (" + lastTween + "): " + JSON.stringify(lastTweensContainer[lastTween]), element);
                                }
                            }

                            tweensContainer = lastTweensContainer;
                        }

                        /*****************************************
                           Tween Data Construction (for Start)
                        *****************************************/
                    } else if (action === "start") {
                        var lastTweensContainer;
                        var valueData, endValue, easing, startValue;
                        var rootProperty, rootPropertyValue;
                        var separatedValue, endValueUnitType, startValueUnitType, operator;
                        var axis;
                        (function () {
                            var parsePropertyValue =

                            /***************************
                               Tween Data Calculation
                            ***************************/

                            /* This function parses property data and defaults endValue, easing, and startValue as appropriate. */
                            /* Property map values can either take the form of 1) a single value representing the end value,
                               or 2) an array in the form of [ endValue, [, easing] [, startValue] ].
                               The optional third parameter is a forcefed startValue to be used instead of querying the DOM for
                               the element's current value. Read Velocity's docmentation to learn more about forcefeeding: VelocityJS.org/#forcefeeding */
                            function (valueData, skipResolvingEasing) {
                                var endValue = undefined,
                                    easing = undefined,
                                    startValue = undefined;

                                /* Handle the array format, which can be structured as one of three potential overloads:
                                   A) [ endValue, easing, startValue ], B) [ endValue, easing ], or C) [ endValue, startValue ] */
                                if (Type.isArray(valueData)) {
                                    /* endValue is always the first item in the array. Don't bother validating endValue's value now
                                       since the ensuing property cycling logic does that. */
                                    endValue = valueData[0];

                                    /* Two-item array format: If the second item is a number, function, or hex string, treat it as a
                                       start value since easings can only be non-hex strings or arrays. */
                                    if (!Type.isArray(valueData[1]) && /^[\d-]/.test(valueData[1]) || Type.isFunction(valueData[1]) || CSS.RegEx.isHex.test(valueData[1])) {
                                        startValue = valueData[1];
                                        /* Two or three-item array: If the second item is a non-hex string or an array, treat it as an easing. */
                                    } else if (Type.isString(valueData[1]) && !CSS.RegEx.isHex.test(valueData[1]) || Type.isArray(valueData[1])) {
                                        easing = skipResolvingEasing ? valueData[1] : getEasing(valueData[1], opts.duration);

                                        /* Don't bother validating startValue's value now since the ensuing property cycling logic inherently does that. */
                                        if (valueData[2] !== undefined) {
                                            startValue = valueData[2];
                                        }
                                    }
                                    /* Handle the single-value format. */
                                } else {
                                    endValue = valueData;
                                }

                                /* Default to the call's easing if a per-property easing type was not defined. */
                                if (!skipResolvingEasing) {
                                    easing = easing || opts.easing;
                                }

                                /* If functions were passed in as values, pass the function the current element as its context,
                                   plus the element's index and the element set's size as arguments. Then, assign the returned value. */
                                if (Type.isFunction(endValue)) {
                                    endValue = endValue.call(element, elementsIndex, elementsLength);
                                }

                                if (Type.isFunction(startValue)) {
                                    startValue = startValue.call(element, elementsIndex, elementsLength);
                                }

                                /* Allow startValue to be left as undefined to indicate to the ensuing code that its value was not forcefed. */
                                return [endValue || 0, easing, startValue];
                            };

                            /* The per-element isAnimating flag is used to indicate whether it's safe (i.e. the data isn't stale)
                               to transfer over end values to use as start values. If it's set to true and there is a previous
                               Velocity call to pull values from, do so. */
                            if (Data(element).tweensContainer && Data(element).isAnimating === true) {
                                lastTweensContainer = Data(element).tweensContainer;
                            }

                            /* Cycle through each property in the map, looking for shorthand color properties (e.g. "color" as opposed to "colorRed"). Inject the corresponding
                               colorRed, colorGreen, and colorBlue RGB component tweens into the propertiesMap (which Velocity understands) and remove the shorthand property. */
                            $.each(propertiesMap, function (property, value) {
                                /* Find shorthand color properties that have been passed a hex string. */
                                if (RegExp("^" + CSS.Lists.colors.join("$|^") + "$").test(property)) {
                                    /* Parse the value data for each shorthand. */
                                    var valueData = parsePropertyValue(value, true),
                                        endValue = valueData[0],
                                        easing = valueData[1],
                                        startValue = valueData[2];

                                    if (CSS.RegEx.isHex.test(endValue)) {
                                        /* Convert the hex strings into their RGB component arrays. */
                                        var colorComponents = ["Red", "Green", "Blue"],
                                            endValueRGB = CSS.Values.hexToRgb(endValue),
                                            startValueRGB = startValue ? CSS.Values.hexToRgb(startValue) : undefined;

                                        /* Inject the RGB component tweens into propertiesMap. */
                                        for (var i = 0; i < colorComponents.length; i++) {
                                            var dataArray = [endValueRGB[i]];

                                            if (easing) {
                                                dataArray.push(easing);
                                            }

                                            if (startValueRGB !== undefined) {
                                                dataArray.push(startValueRGB[i]);
                                            }

                                            propertiesMap[property + colorComponents[i]] = dataArray;
                                        }

                                        /* Remove the intermediary shorthand property entry now that we've processed it. */
                                        delete propertiesMap[property];
                                    }
                                }
                            });

                            /* Create a tween out of each property, and append its associated data to tweensContainer. */
                            for (property in propertiesMap) {
                                var separateValue =

                                /* Separates a property value into its numeric value and its unit type. */
                                function (property, value) {
                                    var unitType, numericValue;

                                    numericValue = (value || "0").toString().toLowerCase()
                                    /* Match the unit type at the end of the value. */
                                    .replace(/[%A-z]+$/, function (match) {
                                        /* Grab the unit type. */
                                        unitType = match;

                                        /* Strip the unit type off of value. */
                                        return "";
                                    });

                                    /* If no unit type was supplied, assign one that is appropriate for this property (e.g. "deg" for rotateZ or "px" for width). */
                                    if (!unitType) {
                                        unitType = CSS.Values.getUnitType(property);
                                    }

                                    return [numericValue, unitType];
                                };

                                var calculateUnitRatios =

                                /***************************
                                   Unit Ratio Calculation
                                ***************************/

                                /* When queried, the browser returns (most) CSS property values in pixels. Therefore, if an endValue with a unit type of
                                   %, em, or rem is animated toward, startValue must be converted from pixels into the same unit type as endValue in order
                                   for value manipulation logic (increment/decrement) to proceed. Further, if the startValue was forcefed or transferred
                                   from a previous call, startValue may also not be in pixels. Unit conversion logic therefore consists of two steps:
                                   1) Calculating the ratio of %/em/rem/vh/vw relative to pixels
                                   2) Converting startValue into the same unit of measurement as endValue based on these ratios. */
                                /* Unit conversion ratios are calculated by inserting a sibling node next to the target node, copying over its position property,
                                   setting values with the target unit type then comparing the returned pixel value. */
                                /* Note: Even if only one of these unit types is being animated, all unit ratios are calculated at once since the overhead
                                   of batching the SETs and GETs together upfront outweights the potential overhead
                                   of layout thrashing caused by re-querying for uncalculated ratios for subsequently-processed properties. */
                                /* Todo: Shift this logic into the calls' first tick instance so that it's synced with RAF. */
                                function () {
                                    /************************
                                        Same Ratio Checks
                                    ************************/

                                    /* The properties below are used to determine whether the element differs sufficiently from this call's
                                       previously iterated element to also differ in its unit conversion ratios. If the properties match up with those
                                       of the prior element, the prior element's conversion ratios are used. Like most optimizations in Velocity,
                                       this is done to minimize DOM querying. */
                                    var sameRatioIndicators = {
                                        myParent: element.parentNode || document.body, /* GET */
                                        position: CSS.getPropertyValue(element, "position"), /* GET */
                                        fontSize: CSS.getPropertyValue(element, "fontSize") /* GET */
                                    },

                                    /* Determine if the same % ratio can be used. % is based on the element's position value and its parent's width and height dimensions. */
                                    samePercentRatio = sameRatioIndicators.position === callUnitConversionData.lastPosition && sameRatioIndicators.myParent === callUnitConversionData.lastParent,

                                    /* Determine if the same em ratio can be used. em is relative to the element's fontSize. */
                                    sameEmRatio = sameRatioIndicators.fontSize === callUnitConversionData.lastFontSize;

                                    /* Store these ratio indicators call-wide for the next element to compare against. */
                                    callUnitConversionData.lastParent = sameRatioIndicators.myParent;
                                    callUnitConversionData.lastPosition = sameRatioIndicators.position;
                                    callUnitConversionData.lastFontSize = sameRatioIndicators.fontSize;

                                    /***************************
                                       Element-Specific Units
                                    ***************************/

                                    /* Note: IE8 rounds to the nearest pixel when returning CSS values, thus we perform conversions using a measurement
                                       of 100 (instead of 1) to give our ratios a precision of at least 2 decimal values. */
                                    var measurement = 100,
                                        unitRatios = {};

                                    if (!sameEmRatio || !samePercentRatio) {
                                        var dummy = Data(element).isSVG ? document.createElementNS("http://www.w3.org/2000/svg", "rect") : document.createElement("div");

                                        Velocity.init(dummy);
                                        sameRatioIndicators.myParent.appendChild(dummy);

                                        /* To accurately and consistently calculate conversion ratios, the element's cascaded overflow and box-sizing are stripped.
                                           Similarly, since width/height can be artificially constrained by their min-/max- equivalents, these are controlled for as well. */
                                        /* Note: Overflow must be also be controlled for per-axis since the overflow property overwrites its per-axis values. */
                                        $.each(["overflow", "overflowX", "overflowY"], function (i, property) {
                                            Velocity.CSS.setPropertyValue(dummy, property, "hidden");
                                        });
                                        Velocity.CSS.setPropertyValue(dummy, "position", sameRatioIndicators.position);
                                        Velocity.CSS.setPropertyValue(dummy, "fontSize", sameRatioIndicators.fontSize);
                                        Velocity.CSS.setPropertyValue(dummy, "boxSizing", "content-box");

                                        /* width and height act as our proxy properties for measuring the horizontal and vertical % ratios. */
                                        $.each(["minWidth", "maxWidth", "width", "minHeight", "maxHeight", "height"], function (i, property) {
                                            Velocity.CSS.setPropertyValue(dummy, property, measurement + "%");
                                        });
                                        /* paddingLeft arbitrarily acts as our proxy property for the em ratio. */
                                        Velocity.CSS.setPropertyValue(dummy, "paddingLeft", measurement + "em");

                                        /* Divide the returned value by the measurement to get the ratio between 1% and 1px. Default to 1 since working with 0 can produce Infinite. */
                                        unitRatios.percentToPxWidth = callUnitConversionData.lastPercentToPxWidth = (parseFloat(CSS.getPropertyValue(dummy, "width", null, true)) || 1) / measurement; /* GET */
                                        unitRatios.percentToPxHeight = callUnitConversionData.lastPercentToPxHeight = (parseFloat(CSS.getPropertyValue(dummy, "height", null, true)) || 1) / measurement; /* GET */
                                        unitRatios.emToPx = callUnitConversionData.lastEmToPx = (parseFloat(CSS.getPropertyValue(dummy, "paddingLeft")) || 1) / measurement; /* GET */

                                        sameRatioIndicators.myParent.removeChild(dummy);
                                    } else {
                                        unitRatios.emToPx = callUnitConversionData.lastEmToPx;
                                        unitRatios.percentToPxWidth = callUnitConversionData.lastPercentToPxWidth;
                                        unitRatios.percentToPxHeight = callUnitConversionData.lastPercentToPxHeight;
                                    }

                                    /***************************
                                       Element-Agnostic Units
                                    ***************************/

                                    /* Whereas % and em ratios are determined on a per-element basis, the rem unit only needs to be checked
                                       once per call since it's exclusively dependant upon document.body's fontSize. If this is the first time
                                       that calculateUnitRatios() is being run during this call, remToPx will still be set to its default value of null,
                                       so we calculate it now. */
                                    if (callUnitConversionData.remToPx === null) {
                                        /* Default to browsers' default fontSize of 16px in the case of 0. */
                                        callUnitConversionData.remToPx = parseFloat(CSS.getPropertyValue(document.body, "fontSize")) || 16; /* GET */
                                    }

                                    /* Similarly, viewport units are %-relative to the window's inner dimensions. */
                                    if (callUnitConversionData.vwToPx === null) {
                                        callUnitConversionData.vwToPx = parseFloat(window.innerWidth) / 100; /* GET */
                                        callUnitConversionData.vhToPx = parseFloat(window.innerHeight) / 100; /* GET */
                                    }

                                    unitRatios.remToPx = callUnitConversionData.remToPx;
                                    unitRatios.vwToPx = callUnitConversionData.vwToPx;
                                    unitRatios.vhToPx = callUnitConversionData.vhToPx;

                                    if (Velocity.debug >= 1) console.log("Unit ratios: " + JSON.stringify(unitRatios), element);

                                    return unitRatios;
                                };

                                /**************************
                                   Start Value Sourcing
                                **************************/

                                /* Parse out endValue, easing, and startValue from the property's data. */
                                valueData = parsePropertyValue(propertiesMap[property]);
                                endValue = valueData[0];
                                easing = valueData[1];
                                startValue = valueData[2];


                                /* Now that the original property name's format has been used for the parsePropertyValue() lookup above,
                                   we force the property to its camelCase styling to normalize it for manipulation. */
                                property = CSS.Names.camelCase(property);

                                /* In case this property is a hook, there are circumstances where we will intend to work on the hook's root property and not the hooked subproperty. */
                                rootProperty = CSS.Hooks.getRoot(property);
                                rootPropertyValue = false;


                                /* Other than for the dummy tween property, properties that are not supported by the browser (and do not have an associated normalization) will
                                   inherently produce no style changes when set, so they are skipped in order to decrease animation tick overhead.
                                   Property support is determined via prefixCheck(), which returns a false flag when no supported is detected. */
                                /* Note: Since SVG elements have some of their properties directly applied as HTML attributes,
                                   there is no way to check for their explicit browser support, and so we skip skip this check for them. */
                                if (!Data(element).isSVG && rootProperty !== "tween" && CSS.Names.prefixCheck(rootProperty)[1] === false && CSS.Normalizations.registered[rootProperty] === undefined) {
                                    if (Velocity.debug) console.log("Skipping [" + rootProperty + "] due to a lack of browser support.");

                                    continue;
                                }

                                /* If the display option is being set to a non-"none" (e.g. "block") and opacity (filter on IE<=8) is being
                                   animated to an endValue of non-zero, the user's intention is to fade in from invisible, thus we forcefeed opacity
                                   a startValue of 0 if its startValue hasn't already been sourced by value transferring or prior forcefeeding. */
                                if ((opts.display !== undefined && opts.display !== null && opts.display !== "none" || opts.visibility !== undefined && opts.visibility !== "hidden") && /opacity|filter/.test(property) && !startValue && endValue !== 0) {
                                    startValue = 0;
                                }

                                /* If values have been transferred from the previous Velocity call, extract the endValue and rootPropertyValue
                                   for all of the current call's properties that were *also* animated in the previous call. */
                                /* Note: Value transferring can optionally be disabled by the user via the _cacheValues option. */
                                if (opts._cacheValues && lastTweensContainer && lastTweensContainer[property]) {
                                    if (startValue === undefined) {
                                        startValue = lastTweensContainer[property].endValue + lastTweensContainer[property].unitType;
                                    }

                                    /* The previous call's rootPropertyValue is extracted from the element's data cache since that's the
                                       instance of rootPropertyValue that gets freshly updated by the tweening process, whereas the rootPropertyValue
                                       attached to the incoming lastTweensContainer is equal to the root property's value prior to any tweening. */
                                    rootPropertyValue = Data(element).rootPropertyValueCache[rootProperty];
                                    /* If values were not transferred from a previous Velocity call, query the DOM as needed. */
                                } else {
                                    /* Handle hooked properties. */
                                    if (CSS.Hooks.registered[property]) {
                                        if (startValue === undefined) {
                                            rootPropertyValue = CSS.getPropertyValue(element, rootProperty); /* GET */
                                            /* Note: The following getPropertyValue() call does not actually trigger a DOM query;
                                               getPropertyValue() will extract the hook from rootPropertyValue. */
                                            startValue = CSS.getPropertyValue(element, property, rootPropertyValue);
                                            /* If startValue is already defined via forcefeeding, do not query the DOM for the root property's value;
                                               just grab rootProperty's zero-value template from CSS.Hooks. This overwrites the element's actual
                                               root property value (if one is set), but this is acceptable since the primary reason users forcefeed is
                                               to avoid DOM queries, and thus we likewise avoid querying the DOM for the root property's value. */
                                        } else {
                                            /* Grab this hook's zero-value template, e.g. "0px 0px 0px black". */
                                            rootPropertyValue = CSS.Hooks.templates[rootProperty][1];
                                        }
                                        /* Handle non-hooked properties that haven't already been defined via forcefeeding. */
                                    } else if (startValue === undefined) {
                                        startValue = CSS.getPropertyValue(element, property); /* GET */
                                    }
                                }

                                /**************************
                                   Value Data Extraction
                                **************************/

                                operator = false;


                                /* Separate startValue. */
                                separatedValue = separateValue(property, startValue);
                                startValue = separatedValue[0];
                                startValueUnitType = separatedValue[1];

                                /* Separate endValue, and extract a value operator (e.g. "+=", "-=") if one exists. */
                                separatedValue = separateValue(property, endValue);
                                endValue = separatedValue[0].replace(/^([+-\/*])=/, function (match, subMatch) {
                                    operator = subMatch;

                                    /* Strip the operator off of the value. */
                                    return "";
                                });
                                endValueUnitType = separatedValue[1];

                                /* Parse float values from endValue and startValue. Default to 0 if NaN is returned. */
                                startValue = parseFloat(startValue) || 0;
                                endValue = parseFloat(endValue) || 0;

                                /***************************************
                                   Property-Specific Value Conversion
                                ***************************************/

                                /* Custom support for properties that don't actually accept the % unit type, but where pollyfilling is trivial and relatively foolproof. */
                                if (endValueUnitType === "%") {
                                    /* A %-value fontSize/lineHeight is relative to the parent's fontSize (as opposed to the parent's dimensions),
                                       which is identical to the em unit's behavior, so we piggyback off of that. */
                                    if (/^(fontSize|lineHeight)$/.test(property)) {
                                        /* Convert % into an em decimal value. */
                                        endValue = endValue / 100;
                                        endValueUnitType = "em";
                                        /* For scaleX and scaleY, convert the value into its decimal format and strip off the unit type. */
                                    } else if (/^scale/.test(property)) {
                                        endValue = endValue / 100;
                                        endValueUnitType = "";
                                        /* For RGB components, take the defined percentage of 255 and strip off the unit type. */
                                    } else if (/(Red|Green|Blue)$/i.test(property)) {
                                        endValue = endValue / 100 * 255;
                                        endValueUnitType = "";
                                    }
                                }

                                /********************
                                   Unit Conversion
                                ********************/

                                /* The * and / operators, which are not passed in with an associated unit, inherently use startValue's unit. Skip value and unit conversion. */
                                if (/[\/*]/.test(operator)) {
                                    endValueUnitType = startValueUnitType;
                                    /* If startValue and endValue differ in unit type, convert startValue into the same unit type as endValue so that if endValueUnitType
                                       is a relative unit (%, em, rem), the values set during tweening will continue to be accurately relative even if the metrics they depend
                                       on are dynamically changing during the course of the animation. Conversely, if we always normalized into px and used px for setting values, the px ratio
                                       would become stale if the original unit being animated toward was relative and the underlying metrics change during the animation. */
                                    /* Since 0 is 0 in any unit type, no conversion is necessary when startValue is 0 -- we just start at 0 with endValueUnitType. */
                                } else if (startValueUnitType !== endValueUnitType && startValue !== 0) {
                                    /* Unit conversion is also skipped when endValue is 0, but *startValueUnitType* must be used for tween values to remain accurate. */
                                    /* Note: Skipping unit conversion here means that if endValueUnitType was originally a relative unit, the animation won't relatively
                                       match the underlying metrics if they change, but this is acceptable since we're animating toward invisibility instead of toward visibility,
                                       which remains past the point of the animation's completion. */
                                    if (endValue === 0) {
                                        endValueUnitType = startValueUnitType;
                                    } else {
                                        /* By this point, we cannot avoid unit conversion (it's undesirable since it causes layout thrashing).
                                           If we haven't already, we trigger calculateUnitRatios(), which runs once per element per call. */
                                        elementUnitConversionData = elementUnitConversionData || calculateUnitRatios();

                                        /* The following RegEx matches CSS properties that have their % values measured relative to the x-axis. */
                                        /* Note: W3C spec mandates that all of margin and padding's properties (even top and bottom) are %-relative to the *width* of the parent element. */
                                        axis = /margin|padding|left|right|width|text|word|letter/i.test(property) || /X$/.test(property) || property === "x" ? "x" : "y";


                                        /* In order to avoid generating n^2 bespoke conversion functions, unit conversion is a two-step process:
                                           1) Convert startValue into pixels. 2) Convert this new pixel value into endValue's unit type. */
                                        switch (startValueUnitType) {
                                            case "%":
                                                /* Note: translateX and translateY are the only properties that are %-relative to an element's own dimensions -- not its parent's dimensions.
                                                   Velocity does not include a special conversion process to account for this behavior. Therefore, animating translateX/Y from a % value
                                                   to a non-% value will produce an incorrect start value. Fortunately, this sort of cross-unit conversion is rarely done by users in practice. */
                                                startValue *= axis === "x" ? elementUnitConversionData.percentToPxWidth : elementUnitConversionData.percentToPxHeight;
                                                break;

                                            case "px":
                                                /* px acts as our midpoint in the unit conversion process; do nothing. */
                                                break;

                                            default:
                                                startValue *= elementUnitConversionData[startValueUnitType + "ToPx"];
                                        }

                                        /* Invert the px ratios to convert into to the target unit. */
                                        switch (endValueUnitType) {
                                            case "%":
                                                startValue *= 1 / (axis === "x" ? elementUnitConversionData.percentToPxWidth : elementUnitConversionData.percentToPxHeight);
                                                break;

                                            case "px":
                                                /* startValue is already in px, do nothing; we're done. */
                                                break;

                                            default:
                                                startValue *= 1 / elementUnitConversionData[endValueUnitType + "ToPx"];
                                        }
                                    }
                                }

                                /*********************
                                   Relative Values
                                *********************/

                                /* Operator logic must be performed last since it requires unit-normalized start and end values. */
                                /* Note: Relative *percent values* do not behave how most people think; while one would expect "+=50%"
                                   to increase the property 1.5x its current value, it in fact increases the percent units in absolute terms:
                                   50 points is added on top of the current % value. */
                                switch (operator) {
                                    case "+":
                                        endValue = startValue + endValue;
                                        break;

                                    case "-":
                                        endValue = startValue - endValue;
                                        break;

                                    case "*":
                                        endValue = startValue * endValue;
                                        break;

                                    case "/":
                                        endValue = startValue / endValue;
                                        break;
                                }

                                /**************************
                                   tweensContainer Push
                                **************************/

                                /* Construct the per-property tween object, and push it to the element's tweensContainer. */
                                tweensContainer[property] = {
                                    rootPropertyValue: rootPropertyValue,
                                    startValue: startValue,
                                    currentValue: startValue,
                                    endValue: endValue,
                                    unitType: endValueUnitType,
                                    easing: easing
                                };

                                if (Velocity.debug) console.log("tweensContainer (" + property + "): " + JSON.stringify(tweensContainer[property]), element);
                            }

                            /* Along with its property data, store a reference to the element itself onto tweensContainer. */
                            tweensContainer.element = element;
                        })();
                    }

                    /*****************
                        Call Push
                    *****************/

                    /* Note: tweensContainer can be empty if all of the properties in this call's property map were skipped due to not
                       being supported by the browser. The element property is used for checking that the tweensContainer has been appended to. */
                    if (tweensContainer.element) {
                        /* Apply the "velocity-animating" indicator class. */
                        CSS.Values.addClass(element, "velocity-animating");

                        /* The call array houses the tweensContainers for each element being animated in the current call. */
                        call.push(tweensContainer);

                        /* Store the tweensContainer and options if we're working on the default effects queue, so that they can be used by the reverse command. */
                        if (opts.queue === "") {
                            Data(element).tweensContainer = tweensContainer;
                            Data(element).opts = opts;
                        }

                        /* Switch on the element's animating flag. */
                        Data(element).isAnimating = true;

                        /* Once the final element in this call's element set has been processed, push the call array onto
                           Velocity.State.calls for the animation tick to immediately begin processing. */
                        if (elementsIndex === elementsLength - 1) {
                            /* Add the current call plus its associated metadata (the element set and the call's options) onto the global call container.
                               Anything on this call container is subjected to tick() processing. */
                            Velocity.State.calls.push([call, elements, opts, null, promiseData.resolver]);

                            /* If the animation tick isn't running, start it. (Velocity shuts it off when there are no active calls to process.) */
                            if (Velocity.State.isTicking === false) {
                                Velocity.State.isTicking = true;

                                /* Start the tick loop. */
                                tick();
                            }
                        } else {
                            elementsIndex++;
                        }
                    }
                }

                /* When the queue option is set to false, the call skips the element's queue and fires immediately. */
                if (opts.queue === false) {
                    /* Since this buildQueue call doesn't respect the element's existing queue (which is where a delay option would have been appended),
                       we manually inject the delay property here with an explicit setTimeout. */
                    if (opts.delay) {
                        setTimeout(buildQueue, opts.delay);
                    } else {
                        buildQueue();
                    }
                    /* Otherwise, the call undergoes element queueing as normal. */
                    /* Note: To interoperate with jQuery, Velocity uses jQuery's own $.queue() stack for queuing logic. */
                } else {
                    $.queue(element, opts.queue, function (next, clearQueue) {
                        /* If the clearQueue flag was passed in by the stop command, resolve this call's promise. (Promises can only be resolved once,
                           so it's fine if this is repeatedly triggered for each element in the associated call.) */
                        if (clearQueue === true) {
                            if (promiseData.promise) {
                                promiseData.resolver(elements);
                            }

                            /* Do not continue with animation queueing. */
                            return true;
                        }

                        /* This flag indicates to the upcoming completeCall() function that this queue entry was initiated by Velocity.
                           See completeCall() for further details. */
                        Velocity.velocityQueueEntryFlag = true;

                        buildQueue(next);
                    });
                }

                /*********************
                    Auto-Dequeuing
                *********************/

                /* As per jQuery's $.queue() behavior, to fire the first non-custom-queue entry on an element, the element
                   must be dequeued if its queue stack consists *solely* of the current call. (This can be determined by checking
                   for the "inprogress" item that jQuery prepends to active queue stack arrays.) Regardless, whenever the element's
                   queue is further appended with additional items -- including $.delay()'s or even $.animate() calls, the queue's
                   first entry is automatically fired. This behavior contrasts that of custom queues, which never auto-fire. */
                /* Note: When an element set is being subjected to a non-parallel Velocity call, the animation will not begin until
                   each one of the elements in the set has reached the end of its individually pre-existing queue chain. */
                /* Note: Unfortunately, most people don't fully grasp jQuery's powerful, yet quirky, $.queue() function.
                   Lean more here: http://stackoverflow.com/questions/1058158/can-somebody-explain-jquery-queue-to-me */
                if ((opts.queue === "" || opts.queue === "fx") && $.queue(element)[0] !== "inprogress") {
                    $.dequeue(element);
                }
            }

            /**************************
               Element Set Iteration
            **************************/

            /* If the "nodeType" property exists on the elements variable, we're animating a single element.
               Place it in an array so that $.each() can iterate over it. */
            $.each(elements, function (i, element) {
                /* Ensure each element in a set has a nodeType (is a real element) to avoid throwing errors. */
                if (Type.isNode(element)) {
                    processElement.call(element);
                }
            });

            /******************
               Option: Loop
            ******************/

            /* The loop option accepts an integer indicating how many times the element should loop between the values in the
               current call's properties map and the element's property values prior to this call. */
            /* Note: The loop option's logic is performed here -- after element processing -- because the current call needs
               to undergo its queue insertion prior to the loop option generating its series of constituent "reverse" calls,
               which chain after the current call. Two reverse calls (two "alternations") constitute one loop. */
            var opts = $.extend({}, Velocity.defaults, options),
                reverseCallsCount;

            opts.loop = parseInt(opts.loop);
            reverseCallsCount = opts.loop * 2 - 1;

            if (opts.loop) {
                /* Double the loop count to convert it into its appropriate number of "reverse" calls.
                   Subtract 1 from the resulting value since the current call is included in the total alternation count. */
                for (var x = 0; x < reverseCallsCount; x++) {
                    /* Since the logic for the reverse action occurs inside Queueing and therefore this call's options object
                       isn't parsed until then as well, the current call's delay option must be explicitly passed into the reverse
                       call so that the delay logic that occurs inside *Pre-Queueing* can process it. */
                    var reverseOptions = {
                        delay: opts.delay,
                        progress: opts.progress
                    };

                    /* If a complete callback was passed into this call, transfer it to the loop redirect's final "reverse" call
                       so that it's triggered when the entire redirect is complete (and not when the very first animation is complete). */
                    if (x === reverseCallsCount - 1) {
                        reverseOptions.display = opts.display;
                        reverseOptions.visibility = opts.visibility;
                        reverseOptions.complete = opts.complete;
                    }

                    animate(elements, "reverse", reverseOptions);
                }
            }

            /***************
                Chaining
            ***************/

            /* Return the elements back to the call chain, with wrapped elements taking precedence in case Velocity was called via the $.fn. extension. */
            return getChain();
        };

        /* Turn Velocity into the animation function, extended with the pre-existing Velocity object. */
        Velocity = $.extend(animate, Velocity);
        /* For legacy support, also expose the literal animate method. */
        Velocity.animate = animate;

        /**************
            Timing
        **************/

        /* Ticker function. */
        var ticker = window.requestAnimationFrame || rAFShim;

        /* Inactive browser tabs pause rAF, which results in all active animations immediately sprinting to their completion states when the tab refocuses.
           To get around this, we dynamically switch rAF to setTimeout (which the browser *doesn't* pause) when the tab loses focus. We skip this for mobile
           devices to avoid wasting battery power on inactive tabs. */
        /* Note: Tab focus detection doesn't work on older versions of IE, but that's okay since they don't support rAF to begin with. */
        if (!Velocity.State.isMobile && document.hidden !== undefined) {
            document.addEventListener("visibilitychange", function () {
                /* Reassign the rAF function (which the global tick() function uses) based on the tab's focus state. */
                if (document.hidden) {
                    ticker = function (callback) {
                        /* The tick function needs a truthy first argument in order to pass its internal timestamp check. */
                        return setTimeout(function () {
                            callback(true);
                        }, 16);
                    };

                    /* The rAF loop has been paused by the browser, so we manually restart the tick. */
                    tick();
                } else {
                    ticker = window.requestAnimationFrame || rAFShim;
                }
            });
        }

        /************
            Tick
        ************/

        /* Note: All calls to Velocity are pushed to the Velocity.State.calls array, which is fully iterated through upon each tick. */
        function tick(timestamp) {
            /* An empty timestamp argument indicates that this is the first tick occurence since ticking was turned on.
               We leverage this metadata to fully ignore the first tick pass since RAF's initial pass is fired whenever
               the browser's next tick sync time occurs, which results in the first elements subjected to Velocity
               calls being animated out of sync with any elements animated immediately thereafter. In short, we ignore
               the first RAF tick pass so that elements being immediately consecutively animated -- instead of simultaneously animated
               by the same Velocity call -- are properly batched into the same initial RAF tick and consequently remain in sync thereafter. */
            if (timestamp) {
                /* We ignore RAF's high resolution timestamp since it can be significantly offset when the browser is
                   under high stress; we opt for choppiness over allowing the browser to drop huge chunks of frames. */
                var timeCurrent = new Date().getTime();

                /********************
                   Call Iteration
                ********************/

                var callsLength = Velocity.State.calls.length;

                /* To speed up iterating over this array, it is compacted (falsey items -- calls that have completed -- are removed)
                   when its length has ballooned to a point that can impact tick performance. This only becomes necessary when animation
                   has been continuous with many elements over a long period of time; whenever all active calls are completed, completeCall() clears Velocity.State.calls. */
                if (callsLength > 10000) {
                    Velocity.State.calls = compactSparseArray(Velocity.State.calls);
                }

                /* Iterate through each active call. */
                for (var i = 0; i < callsLength; i++) {
                    /* When a Velocity call is completed, its Velocity.State.calls entry is set to false. Continue on to the next call. */
                    if (!Velocity.State.calls[i]) {
                        continue;
                    }

                    /************************
                       Call-Wide Variables
                    ************************/

                    var callContainer = Velocity.State.calls[i],
                        call = callContainer[0],
                        opts = callContainer[2],
                        timeStart = callContainer[3],
                        firstTick = !!timeStart,
                        tweenDummyValue = null;

                    /* If timeStart is undefined, then this is the first time that this call has been processed by tick().
                       We assign timeStart now so that its value is as close to the real animation start time as possible.
                       (Conversely, had timeStart been defined when this call was added to Velocity.State.calls, the delay
                       between that time and now would cause the first few frames of the tween to be skipped since
                       percentComplete is calculated relative to timeStart.) */
                    /* Further, subtract 16ms (the approximate resolution of RAF) from the current time value so that the
                       first tick iteration isn't wasted by animating at 0% tween completion, which would produce the
                       same style value as the element's current value. */
                    if (!timeStart) {
                        timeStart = Velocity.State.calls[i][3] = timeCurrent - 16;
                    }

                    /* The tween's completion percentage is relative to the tween's start time, not the tween's start value
                       (which would result in unpredictable tween durations since JavaScript's timers are not particularly accurate).
                       Accordingly, we ensure that percentComplete does not exceed 1. */
                    var percentComplete = Math.min((timeCurrent - timeStart) / opts.duration, 1);

                    /**********************
                       Element Iteration
                    **********************/

                    /* For every call, iterate through each of the elements in its set. */
                    for (var j = 0, callLength = call.length; j < callLength; j++) {
                        var tweensContainer = call[j],
                            element = tweensContainer.element;

                        /* Check to see if this element has been deleted midway through the animation by checking for the
                           continued existence of its data cache. If it's gone, skip animating this element. */
                        if (!Data(element)) {
                            continue;
                        }

                        var transformPropertyExists = false;

                        /**********************************
                           Display & Visibility Toggling
                        **********************************/

                        /* If the display option is set to non-"none", set it upfront so that the element can become visible before tweening begins.
                           (Otherwise, display's "none" value is set in completeCall() once the animation has completed.) */
                        if (opts.display !== undefined && opts.display !== null && opts.display !== "none") {
                            if (opts.display === "flex") {
                                var flexValues = ["-webkit-box", "-moz-box", "-ms-flexbox", "-webkit-flex"];

                                $.each(flexValues, function (i, flexValue) {
                                    CSS.setPropertyValue(element, "display", flexValue);
                                });
                            }

                            CSS.setPropertyValue(element, "display", opts.display);
                        }

                        /* Same goes with the visibility option, but its "none" equivalent is "hidden". */
                        if (opts.visibility !== undefined && opts.visibility !== "hidden") {
                            CSS.setPropertyValue(element, "visibility", opts.visibility);
                        }

                        /************************
                           Property Iteration
                        ************************/

                        /* For every element, iterate through each property. */
                        for (var property in tweensContainer) {
                            /* Note: In addition to property tween data, tweensContainer contains a reference to its associated element. */
                            if (property !== "element") {
                                var tween = tweensContainer[property],
                                    currentValue,

                                /* Easing can either be a pre-genereated function or a string that references a pre-registered easing
                                   on the Velocity.Easings object. In either case, return the appropriate easing *function*. */
                                easing = Type.isString(tween.easing) ? Velocity.Easings[tween.easing] : tween.easing;

                                /******************************
                                   Current Value Calculation
                                ******************************/

                                /* If this is the last tick pass (if we've reached 100% completion for this tween),
                                   ensure that currentValue is explicitly set to its target endValue so that it's not subjected to any rounding. */
                                if (percentComplete === 1) {
                                    currentValue = tween.endValue;
                                    /* Otherwise, calculate currentValue based on the current delta from startValue. */
                                } else {
                                    var tweenDelta = tween.endValue - tween.startValue;
                                    currentValue = tween.startValue + tweenDelta * easing(percentComplete, opts, tweenDelta);

                                    /* If no value change is occurring, don't proceed with DOM updating. */
                                    if (!firstTick && currentValue === tween.currentValue) {
                                        continue;
                                    }
                                }

                                tween.currentValue = currentValue;

                                /* If we're tweening a fake 'tween' property in order to log transition values, update the one-per-call variable so that
                                   it can be passed into the progress callback. */
                                if (property === "tween") {
                                    tweenDummyValue = currentValue;
                                } else {
                                    /******************
                                       Hooks: Part I
                                    ******************/

                                    /* For hooked properties, the newly-updated rootPropertyValueCache is cached onto the element so that it can be used
                                       for subsequent hooks in this call that are associated with the same root property. If we didn't cache the updated
                                       rootPropertyValue, each subsequent update to the root property in this tick pass would reset the previous hook's
                                       updates to rootPropertyValue prior to injection. A nice performance byproduct of rootPropertyValue caching is that
                                       subsequently chained animations using the same hookRoot but a different hook can use this cached rootPropertyValue. */
                                    if (CSS.Hooks.registered[property]) {
                                        var hookRoot = CSS.Hooks.getRoot(property),
                                            rootPropertyValueCache = Data(element).rootPropertyValueCache[hookRoot];

                                        if (rootPropertyValueCache) {
                                            tween.rootPropertyValue = rootPropertyValueCache;
                                        }
                                    }

                                    /*****************
                                        DOM Update
                                    *****************/

                                    /* setPropertyValue() returns an array of the property name and property value post any normalization that may have been performed. */
                                    /* Note: To solve an IE<=8 positioning bug, the unit type is dropped when setting a property value of 0. */
                                    var adjustedSetData = CSS.setPropertyValue(element, /* SET */
                                    property, tween.currentValue + (parseFloat(currentValue) === 0 ? "" : tween.unitType), tween.rootPropertyValue, tween.scrollData);

                                    /*******************
                                       Hooks: Part II
                                    *******************/

                                    /* Now that we have the hook's updated rootPropertyValue (the post-processed value provided by adjustedSetData), cache it onto the element. */
                                    if (CSS.Hooks.registered[property]) {
                                        /* Since adjustedSetData contains normalized data ready for DOM updating, the rootPropertyValue needs to be re-extracted from its normalized form. ?? */
                                        if (CSS.Normalizations.registered[hookRoot]) {
                                            Data(element).rootPropertyValueCache[hookRoot] = CSS.Normalizations.registered[hookRoot]("extract", null, adjustedSetData[1]);
                                        } else {
                                            Data(element).rootPropertyValueCache[hookRoot] = adjustedSetData[1];
                                        }
                                    }

                                    /***************
                                       Transforms
                                    ***************/

                                    /* Flag whether a transform property is being animated so that flushTransformCache() can be triggered once this tick pass is complete. */
                                    if (adjustedSetData[0] === "transform") {
                                        transformPropertyExists = true;
                                    }
                                }
                            }
                        }

                        /****************
                            mobileHA
                        ****************/

                        /* If mobileHA is enabled, set the translate3d transform to null to force hardware acceleration.
                           It's safe to override this property since Velocity doesn't actually support its animation (hooks are used in its place). */
                        if (opts.mobileHA) {
                            /* Don't set the null transform hack if we've already done so. */
                            if (Data(element).transformCache.translate3d === undefined) {
                                /* All entries on the transformCache object are later concatenated into a single transform string via flushTransformCache(). */
                                Data(element).transformCache.translate3d = "(0px, 0px, 0px)";

                                transformPropertyExists = true;
                            }
                        }

                        if (transformPropertyExists) {
                            CSS.flushTransformCache(element);
                        }
                    }

                    /* The non-"none" display value is only applied to an element once -- when its associated call is first ticked through.
                       Accordingly, it's set to false so that it isn't re-processed by this call in the next tick. */
                    if (opts.display !== undefined && opts.display !== "none") {
                        Velocity.State.calls[i][2].display = false;
                    }
                    if (opts.visibility !== undefined && opts.visibility !== "hidden") {
                        Velocity.State.calls[i][2].visibility = false;
                    }

                    /* Pass the elements and the timing data (percentComplete, msRemaining, timeStart, tweenDummyValue) into the progress callback. */
                    if (opts.progress) {
                        opts.progress.call(callContainer[1], callContainer[1], percentComplete, Math.max(0, timeStart + opts.duration - timeCurrent), timeStart, tweenDummyValue);
                    }

                    /* If this call has finished tweening, pass its index to completeCall() to handle call cleanup. */
                    if (percentComplete === 1) {
                        completeCall(i);
                    }
                }
            }

            /* Note: completeCall() sets the isTicking flag to false when the last call on Velocity.State.calls has completed. */
            if (Velocity.State.isTicking) {
                ticker(tick);
            }
        }

        /**********************
            Call Completion
        **********************/

        /* Note: Unlike tick(), which processes all active calls at once, call completion is handled on a per-call basis. */
        function completeCall(callIndex, isStopped) {
            /* Ensure the call exists. */
            if (!Velocity.State.calls[callIndex]) {
                return false;
            }

            /* Pull the metadata from the call. */
            var call = Velocity.State.calls[callIndex][0],
                elements = Velocity.State.calls[callIndex][1],
                opts = Velocity.State.calls[callIndex][2],
                resolver = Velocity.State.calls[callIndex][4];

            var remainingCallsExist = false;

            /*************************
               Element Finalization
            *************************/

            for (var i = 0, callLength = call.length; i < callLength; i++) {
                var element = call[i].element;

                /* If the user set display to "none" (intending to hide the element), set it now that the animation has completed. */
                /* Note: display:none isn't set when calls are manually stopped (via Velocity("stop"). */
                /* Note: Display gets ignored with "reverse" calls and infinite loops, since this behavior would be undesirable. */
                if (!isStopped && !opts.loop) {
                    if (opts.display === "none") {
                        CSS.setPropertyValue(element, "display", opts.display);
                    }

                    if (opts.visibility === "hidden") {
                        CSS.setPropertyValue(element, "visibility", opts.visibility);
                    }
                }

                /* If the element's queue is empty (if only the "inprogress" item is left at position 0) or if its queue is about to run
                   a non-Velocity-initiated entry, turn off the isAnimating flag. A non-Velocity-initiatied queue entry's logic might alter
                   an element's CSS values and thereby cause Velocity's cached value data to go stale. To detect if a queue entry was initiated by Velocity,
                   we check for the existence of our special Velocity.queueEntryFlag declaration, which minifiers won't rename since the flag
                   is assigned to jQuery's global $ object and thus exists out of Velocity's own scope. */
                if (opts.loop !== true && ($.queue(element)[1] === undefined || !/\.velocityQueueEntryFlag/i.test($.queue(element)[1]))) {
                    /* The element may have been deleted. Ensure that its data cache still exists before acting on it. */
                    if (Data(element)) {
                        Data(element).isAnimating = false;
                        /* Clear the element's rootPropertyValueCache, which will become stale. */
                        Data(element).rootPropertyValueCache = {};

                        var transformHAPropertyExists = false;
                        /* If any 3D transform subproperty is at its default value (regardless of unit type), remove it. */
                        $.each(CSS.Lists.transforms3D, function (i, transformName) {
                            var defaultValue = /^scale/.test(transformName) ? 1 : 0,
                                currentValue = Data(element).transformCache[transformName];

                            if (Data(element).transformCache[transformName] !== undefined && new RegExp("^\\(" + defaultValue + "[^.]").test(currentValue)) {
                                transformHAPropertyExists = true;

                                delete Data(element).transformCache[transformName];
                            }
                        });

                        /* Mobile devices have hardware acceleration removed at the end of the animation in order to avoid hogging the GPU's memory. */
                        if (opts.mobileHA) {
                            transformHAPropertyExists = true;
                            delete Data(element).transformCache.translate3d;
                        }

                        /* Flush the subproperty removals to the DOM. */
                        if (transformHAPropertyExists) {
                            CSS.flushTransformCache(element);
                        }

                        /* Remove the "velocity-animating" indicator class. */
                        CSS.Values.removeClass(element, "velocity-animating");
                    }
                }

                /*********************
                   Option: Complete
                *********************/

                /* Complete is fired once per call (not once per element) and is passed the full raw DOM element set as both its context and its first argument. */
                /* Note: Callbacks aren't fired when calls are manually stopped (via Velocity("stop"). */
                if (!isStopped && opts.complete && !opts.loop && i === callLength - 1) {
                    /* We throw callbacks in a setTimeout so that thrown errors don't halt the execution of Velocity itself. */
                    try {
                        opts.complete.call(elements, elements);
                    } catch (error) {
                        setTimeout(function () {
                            throw error;
                        }, 1);
                    }
                }

                /**********************
                   Promise Resolving
                **********************/

                /* Note: Infinite loops don't return promises. */
                if (resolver && opts.loop !== true) {
                    resolver(elements);
                }

                /****************************
                   Option: Loop (Infinite)
                ****************************/

                if (opts.loop === true && !isStopped) {
                    /* If a rotateX/Y/Z property is being animated to 360 deg with loop:true, swap tween start/end values to enable
                       continuous iterative rotation looping. (Otherise, the element would just rotate back and forth.) */
                    $.each(Data(element).tweensContainer, function (propertyName, tweenContainer) {
                        if (/^rotate/.test(propertyName) && parseFloat(tweenContainer.endValue) === 360) {
                            tweenContainer.endValue = 0;
                            tweenContainer.startValue = 360;
                        }

                        if (/^backgroundPosition/.test(propertyName) && parseFloat(tweenContainer.endValue) === 100 && tweenContainer.unitType === "%") {
                            tweenContainer.endValue = 0;
                            tweenContainer.startValue = 100;
                        }
                    });

                    Velocity(element, "reverse", { loop: true, delay: opts.delay });
                }

                /***************
                   Dequeueing
                ***************/

                /* Fire the next call in the queue so long as this call's queue wasn't set to false (to trigger a parallel animation),
                   which would have already caused the next call to fire. Note: Even if the end of the animation queue has been reached,
                   $.dequeue() must still be called in order to completely clear jQuery's animation queue. */
                if (opts.queue !== false) {
                    $.dequeue(element, opts.queue);
                }
            }

            /************************
               Calls Array Cleanup
            ************************/

            /* Since this call is complete, set it to false so that the rAF tick skips it. This array is later compacted via compactSparseArray().
              (For performance reasons, the call is set to false instead of being deleted from the array: http://www.html5rocks.com/en/tutorials/speed/v8/) */
            Velocity.State.calls[callIndex] = false;

            /* Iterate through the calls array to determine if this was the final in-progress animation.
               If so, set a flag to end ticking and clear the calls array. */
            for (var j = 0, callsLength = Velocity.State.calls.length; j < callsLength; j++) {
                if (Velocity.State.calls[j] !== false) {
                    remainingCallsExist = true;

                    break;
                }
            }

            if (remainingCallsExist === false) {
                /* tick() will detect this flag upon its next iteration and subsequently turn itself off. */
                Velocity.State.isTicking = false;

                /* Clear the calls array so that its length is reset. */
                delete Velocity.State.calls;
                Velocity.State.calls = [];
            }
        }

        /******************
            Frameworks
        ******************/

        /* Both jQuery and Zepto allow their $.fn object to be extended to allow wrapped elements to be subjected to plugin calls.
           If either framework is loaded, register a "velocity" extension pointing to Velocity's core animate() method.  Velocity
           also registers itself onto a global container (window.jQuery || window.Zepto || window) so that certain features are
           accessible beyond just a per-element scope. This master object contains an .animate() method, which is later assigned to $.fn
           (if jQuery or Zepto are present). Accordingly, Velocity can both act on wrapped DOM elements and stand alone for targeting raw DOM elements. */
        global.Velocity = Velocity;

        if (global !== window) {
            /* Assign the element function to Velocity's core animate() method. */
            global.fn.velocity = animate;
            /* Assign the object function's defaults to Velocity's global defaults object. */
            global.fn.velocity.defaults = Velocity.defaults;
        }

        /***********************
           Packaged Redirects
        ***********************/

        /* slideUp, slideDown */
        $.each(["Down", "Up"], function (i, direction) {
            Velocity.Redirects["slide" + direction] = function (element, options, elementsIndex, elementsSize, elements, promiseData) {
                var opts = $.extend({}, options),
                    begin = opts.begin,
                    complete = opts.complete,
                    computedValues = { height: "", marginTop: "", marginBottom: "", paddingTop: "", paddingBottom: "" },
                    inlineValues = {};

                if (opts.display === undefined) {
                    /* Show the element before slideDown begins and hide the element after slideUp completes. */
                    /* Note: Inline elements cannot have dimensions animated, so they're reverted to inline-block. */
                    opts.display = direction === "Down" ? Velocity.CSS.Values.getDisplayType(element) === "inline" ? "inline-block" : "block" : "none";
                }

                opts.begin = function () {
                    /* If the user passed in a begin callback, fire it now. */
                    begin && begin.call(elements, elements);

                    /* Cache the elements' original vertical dimensional property values so that we can animate back to them. */
                    for (var property in computedValues) {
                        inlineValues[property] = element.style[property];

                        /* For slideDown, use forcefeeding to animate all vertical properties from 0. For slideUp,
                           use forcefeeding to start from computed values and animate down to 0. */
                        var propertyValue = Velocity.CSS.getPropertyValue(element, property);
                        computedValues[property] = direction === "Down" ? [propertyValue, 0] : [0, propertyValue];
                    }

                    /* Force vertical overflow content to clip so that sliding works as expected. */
                    inlineValues.overflow = element.style.overflow;
                    element.style.overflow = "hidden";
                };

                opts.complete = function () {
                    /* Reset element to its pre-slide inline values once its slide animation is complete. */
                    for (var property in inlineValues) {
                        element.style[property] = inlineValues[property];
                    }

                    /* If the user passed in a complete callback, fire it now. */
                    complete && complete.call(elements, elements);
                    promiseData && promiseData.resolver(elements);
                };

                Velocity(element, computedValues, opts);
            };
        });

        /* fadeIn, fadeOut */
        $.each(["In", "Out"], function (i, direction) {
            Velocity.Redirects["fade" + direction] = function (element, options, elementsIndex, elementsSize, elements, promiseData) {
                var opts = $.extend({}, options),
                    propertiesMap = { opacity: direction === "In" ? 1 : 0 },
                    originalComplete = opts.complete;

                /* Since redirects are triggered individually for each element in the animated set, avoid repeatedly triggering
                   callbacks by firing them only when the final element has been reached. */
                if (elementsIndex !== elementsSize - 1) {
                    opts.complete = opts.begin = null;
                } else {
                    opts.complete = function () {
                        if (originalComplete) {
                            originalComplete.call(elements, elements);
                        }

                        promiseData && promiseData.resolver(elements);
                    };
                }

                /* If a display was passed in, use it. Otherwise, default to "none" for fadeOut or the element-specific default for fadeIn. */
                /* Note: We allow users to pass in "null" to skip display setting altogether. */
                if (opts.display === undefined) {
                    opts.display = direction === "In" ? "auto" : "none";
                }

                Velocity(this, propertiesMap, opts);
            };
        });

        return Velocity;
    })(window.jQuery || window.Zepto || window, window, document);
});

/******************
   Known Issues
******************/

/* The CSS spec mandates that the translateX/Y/Z transforms are %-relative to the element itself -- not its parent.
Velocity, however, doesn't make this distinction. Thus, converting to or from the % unit with these subproperties
will produce an inaccurate conversion value. The same issue exists with the cx/cy attributes of SVG circles and ellipses. */
/* Defined below. */ /* Manually registered by the user. */ /* Defined below. */
/* Note: A registered hook looks like this ==> textShadowBlur: [ "textShadow", 3 ],
   which consists of the subproperty's name, the associated root property's name,
   and the subproperty's position in the root's value. */


/*************************
    Value Transferring
*************************/

/* If this queue entry follows a previous Velocity-initiated queue entry *and* if this entry was created
   while the element was in the process of being animated by Velocity, then this current call is safe to use
   the end values from the prior call as its start values. Velocity attempts to perform this value transfer
   process whenever possible in order to avoid requerying the DOM. */
/* If values aren't transferred from a prior call and start values were not forcefed by the user (more on this below),
   then the DOM is queried for the element's current values as a last resort. */
/* Note: Conversely, animation reversal (and looping) *always* perform inter-call value transfers; they never requery the DOM. */

},{}],3:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],4:[function(require,module,exports){
var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };

var Orchestrator = _interopRequire(require("./modules/orchestrator"));

new Orchestrator(window, document).start();

},{"./modules/orchestrator":5}],5:[function(require,module,exports){
"use strict";

var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };

var _prototypeProperties = function (child, staticProps, instanceProps) { if (staticProps) Object.defineProperties(child, staticProps); if (instanceProps) Object.defineProperties(child.prototype, instanceProps); };

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

var Rx = _interopRequire(require("../../../bower_components/rxjs/dist/rx.lite"));

var Velocity = _interopRequire(require("../../../bower_components/velocity/velocity"));

var Orchestrator = (function () {
    function Orchestrator(window, document) {
        _classCallCheck(this, Orchestrator);

        this.window = window;
        this.document = document;
        this.item = 0;
    }

    _prototypeProperties(Orchestrator, null, {
        start: {
            value: function start() {
                this.processItems();
                this.setUpInputHandlers();
            },
            writable: true,
            configurable: true
        },
        processItems: {
            value: function processItems() {
                var items = Rx.Observable.from(this.document.getElementsByClassName("item")).scan(0, function (acc, x) {
                    x.dataset.id = acc;
                    x.style.opacity = 0;
                    return acc + 1;
                }).subscribe(function (x) {
                    return x;
                });
            },
            writable: true,
            configurable: true
        },
        setUpInputHandlers: {
            value: function setUpInputHandlers() {
                var _this = this;
                var scrolls = Rx.Observable.fromEvent(this.window, "wheel").sample(1500),
                    keys = Rx.Observable.fromEvent(this.window, "keyup"),
                    mouseFwds = scrolls.filter(function (x) {
                    return x.wheelDeltaY < 0;
                }),
                    mouseBkwds = scrolls.filter(function (x) {
                    return x.wheelDeltaY > 0;
                }),
                    keyFwds = keys.filter(function (x) {
                    return x.keyIdentifier === "Down" || x.keyIdentifier === "Right";
                }),
                    keyBkwds = keys.filter(function (x) {
                    return x.keyIdentifier === "Up" || x.keyIdentifier === "Left";
                }),
                    fwds = Rx.Observable.merge(mouseFwds, keyFwds),
                    bkwds = Rx.Observable.merge(mouseBkwds, keyBkwds);

                fwds.subscribe(function () {
                    return _this.forward();
                });
                bkwds.subscribe(function () {
                    return _this.backward();
                });
            },
            writable: true,
            configurable: true
        },
        getElement: {
            value: function getElement(id) {
                console.log(id);
                return this.document.querySelector("[data-id='" + id + "']");
            },
            writable: true,
            configurable: true
        },
        lock: {
            value: function lock() {
                this.isLocked = true;
            },
            writable: true,
            configurable: true
        },
        unlock: {
            value: function unlock() {
                this.isLocked = false;
            },
            writable: true,
            configurable: true
        },
        forward: {
            value: function forward() {
                var _this = this;
                var element = this.getElement(this.item++);
                this.lock();
                Velocity(element, { opacity: 1 }, 100).then(function () {
                    return _this.unlock();
                });
            },
            writable: true,
            configurable: true
        },
        backward: {
            value: function backward() {
                var _this = this;
                var element = this.getElement(--this.item);
                this.lock();
                Velocity(element, { opacity: 0 }, 100).then(function () {
                    return _this.unlock();
                });
            },
            writable: true,
            configurable: true
        }
    });

    return Orchestrator;
})();

;

module.exports = Orchestrator;

},{"../../../bower_components/rxjs/dist/rx.lite":1,"../../../bower_components/velocity/velocity":2}]},{},[4])