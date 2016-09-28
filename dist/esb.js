(function(global) {

  var defined = {};

  // indexOf polyfill for IE8
  var indexOf = Array.prototype.indexOf || function(item) {
    for (var i = 0, l = this.length; i < l; i++)
      if (this[i] === item)
        return i;
    return -1;
  }

  function dedupe(deps) {
    var newDeps = [];
    for (var i = 0, l = deps.length; i < l; i++)
      if (indexOf.call(newDeps, deps[i]) == -1)
        newDeps.push(deps[i])
    return newDeps;
  }

  function register(name, deps, declare, execute) {
    if (typeof name != 'string')
      throw "System.register provided no module name";

    var entry;

    // dynamic
    if (typeof declare == 'boolean') {
      entry = {
        declarative: false,
        deps: deps,
        execute: execute,
        executingRequire: declare
      };
    }
    else {
      // ES6 declarative
      entry = {
        declarative: true,
        deps: deps,
        declare: declare
      };
    }

    entry.name = name;

    // we never overwrite an existing define
    if (!(name in defined))
      defined[name] = entry; 

    entry.deps = dedupe(entry.deps);

    // we have to normalize dependencies
    // (assume dependencies are normalized for now)
    // entry.normalizedDeps = entry.deps.map(normalize);
    entry.normalizedDeps = entry.deps;
  }

  function buildGroups(entry, groups) {
    groups[entry.groupIndex] = groups[entry.groupIndex] || [];

    if (indexOf.call(groups[entry.groupIndex], entry) != -1)
      return;

    groups[entry.groupIndex].push(entry);

    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      var depEntry = defined[depName];

      // not in the registry means already linked / ES6
      if (!depEntry || depEntry.evaluated)
        continue;

      // now we know the entry is in our unlinked linkage group
      var depGroupIndex = entry.groupIndex + (depEntry.declarative != entry.declarative);

      // the group index of an entry is always the maximum
      if (depEntry.groupIndex === undefined || depEntry.groupIndex < depGroupIndex) {

        // if already in a group, remove from the old group
        if (depEntry.groupIndex !== undefined) {
          groups[depEntry.groupIndex].splice(indexOf.call(groups[depEntry.groupIndex], depEntry), 1);

          // if the old group is empty, then we have a mixed depndency cycle
          if (groups[depEntry.groupIndex].length == 0)
            throw new TypeError("Mixed dependency cycle detected");
        }

        depEntry.groupIndex = depGroupIndex;
      }

      buildGroups(depEntry, groups);
    }
  }

  function link(name) {
    var startEntry = defined[name];

    startEntry.groupIndex = 0;

    var groups = [];

    buildGroups(startEntry, groups);

    var curGroupDeclarative = !!startEntry.declarative == groups.length % 2;
    for (var i = groups.length - 1; i >= 0; i--) {
      var group = groups[i];
      for (var j = 0; j < group.length; j++) {
        var entry = group[j];

        // link each group
        if (curGroupDeclarative)
          linkDeclarativeModule(entry);
        else
          linkDynamicModule(entry);
      }
      curGroupDeclarative = !curGroupDeclarative; 
    }
  }

  // module binding records
  var moduleRecords = {};
  function getOrCreateModuleRecord(name) {
    return moduleRecords[name] || (moduleRecords[name] = {
      name: name,
      dependencies: [],
      exports: {}, // start from an empty module and extend
      importers: []
    })
  }

  function linkDeclarativeModule(entry) {
    // only link if already not already started linking (stops at circular)
    if (entry.module)
      return;

    var module = entry.module = getOrCreateModuleRecord(entry.name);
    var exports = entry.module.exports;

    var declaration = entry.declare.call(global, function(name, value) {
      module.locked = true;
      exports[name] = value;

      for (var i = 0, l = module.importers.length; i < l; i++) {
        var importerModule = module.importers[i];
        if (!importerModule.locked) {
          var importerIndex = indexOf.call(importerModule.dependencies, module);
          importerModule.setters[importerIndex](exports);
        }
      }

      module.locked = false;
      return value;
    });

    module.setters = declaration.setters;
    module.execute = declaration.execute;

    if (!module.setters || !module.execute)
      throw new TypeError("Invalid System.register form for " + entry.name);

    // now link all the module dependencies
    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      var depEntry = defined[depName];
      var depModule = moduleRecords[depName];

      // work out how to set depExports based on scenarios...
      var depExports;

      if (depModule) {
        depExports = depModule.exports;
      }
      else if (depEntry && !depEntry.declarative) {
        if (depEntry.module.exports && depEntry.module.exports.__esModule)
          depExports = depEntry.module.exports;
        else
          depExports = { 'default': depEntry.module.exports, __useDefault: true };
      }
      // in the module registry
      else if (!depEntry) {
        depExports = load(depName);
      }
      // we have an entry -> link
      else {
        linkDeclarativeModule(depEntry);
        depModule = depEntry.module;
        depExports = depModule.exports;
      }

      // only declarative modules have dynamic bindings
      if (depModule && depModule.importers) {
        depModule.importers.push(module);
        module.dependencies.push(depModule);
      }
      else
        module.dependencies.push(null);

      // run the setter for this dependency
      if (module.setters[i])
        module.setters[i](depExports);
    }
  }

  // An analog to loader.get covering execution of all three layers (real declarative, simulated declarative, simulated dynamic)
  function getModule(name) {
    var exports;
    var entry = defined[name];

    if (!entry) {
      exports = load(name);
      if (!exports)
        throw new Error("Unable to load dependency " + name + ".");
    }

    else {
      if (entry.declarative)
        ensureEvaluated(name, []);

      else if (!entry.evaluated)
        linkDynamicModule(entry);

      exports = entry.module.exports;
    }

    if ((!entry || entry.declarative) && exports && exports.__useDefault)
      return exports['default'];

    return exports;
  }

  function linkDynamicModule(entry) {
    if (entry.module)
      return;

    var exports = {};

    var module = entry.module = { exports: exports, id: entry.name };

    // AMD requires execute the tree first
    if (!entry.executingRequire) {
      for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
        var depName = entry.normalizedDeps[i];
        var depEntry = defined[depName];
        if (depEntry)
          linkDynamicModule(depEntry);
      }
    }

    // now execute
    entry.evaluated = true;
    var output = entry.execute.call(global, function(name) {
      for (var i = 0, l = entry.deps.length; i < l; i++) {
        if (entry.deps[i] != name)
          continue;
        return getModule(entry.normalizedDeps[i]);
      }
      throw new TypeError('Module ' + name + ' not declared as a dependency.');
    }, exports, module);

    if (output)
      module.exports = output;
  }

  /*
   * Given a module, and the list of modules for this current branch,
   *  ensure that each of the dependencies of this module is evaluated
   *  (unless one is a circular dependency already in the list of seen
   *  modules, in which case we execute it)
   *
   * Then we evaluate the module itself depth-first left to right 
   * execution to match ES6 modules
   */
  function ensureEvaluated(moduleName, seen) {
    var entry = defined[moduleName];

    // if already seen, that means it's an already-evaluated non circular dependency
    if (!entry || entry.evaluated || !entry.declarative)
      return;

    // this only applies to declarative modules which late-execute

    seen.push(moduleName);

    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      if (indexOf.call(seen, depName) == -1) {
        if (!defined[depName])
          load(depName);
        else
          ensureEvaluated(depName, seen);
      }
    }

    if (entry.evaluated)
      return;

    entry.evaluated = true;
    entry.module.execute.call(global);
  }

  // magical execution function
  var modules = {};
  function load(name) {
    if (modules[name])
      return modules[name];

    var entry = defined[name];

    // first we check if this module has already been defined in the registry
    if (!entry)
      throw "Module " + name + " not present.";

    // recursively ensure that the module and all its 
    // dependencies are linked (with dependency group handling)
    link(name);

    // now handle dependency execution in correct order
    ensureEvaluated(name, []);

    // remove from the registry
    defined[name] = undefined;

    var module = entry.module.exports;

    if (!module || !entry.declarative && module.__esModule !== true)
      module = { 'default': module, __useDefault: true };

    // return the defined module object
    return modules[name] = module;
  };

  return function(mains, declare) {

    var System;
    var System = {
      register: register, 
      get: load, 
      set: function(name, module) {
        modules[name] = module; 
      },
      newModule: function(module) {
        return module;
      },
      global: global 
    };
    System.set('@empty', {});

    declare(System);

    for (var i = 0; i < mains.length; i++)
      load(mains[i]);
  }

})(typeof window != 'undefined' ? window : global)
/* (['mainModule'], function(System) {
  System.register(...);
}); */

(['src/esb'], function(System) {

System.register("npm:core-js@0.9.6/library/modules/$.fw", [], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = function($) {
    $.FW = false;
    $.path = $.core;
    return $;
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:babel-runtime@5.2.9/helpers/class-call-check", [], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  "use strict";
  exports["default"] = function(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  };
  exports.__esModule = true;
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/$.uid", ["npm:core-js@0.9.6/library/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var sid = 0;
  function uid(key) {
    return 'Symbol(' + key + ')_' + (++sid + Math.random()).toString(36);
  }
  uid.safe = require("npm:core-js@0.9.6/library/modules/$").g.Symbol || uid;
  module.exports = uid;
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/$.string-at", ["npm:core-js@0.9.6/library/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/library/modules/$");
  module.exports = function(TO_STRING) {
    return function(that, pos) {
      var s = String($.assertDefined(that)),
          i = $.toInteger(pos),
          l = s.length,
          a,
          b;
      if (i < 0 || i >= l)
        return TO_STRING ? '' : undefined;
      a = s.charCodeAt(i);
      return a < 0xd800 || a > 0xdbff || i + 1 === l || (b = s.charCodeAt(i + 1)) < 0xdc00 || b > 0xdfff ? TO_STRING ? s.charAt(i) : a : TO_STRING ? s.slice(i, i + 2) : (a - 0xd800 << 10) + (b - 0xdc00) + 0x10000;
    };
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/$.assert", ["npm:core-js@0.9.6/library/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/library/modules/$");
  function assert(condition, msg1, msg2) {
    if (!condition)
      throw TypeError(msg2 ? msg1 + msg2 : msg1);
  }
  assert.def = $.assertDefined;
  assert.fn = function(it) {
    if (!$.isFunction(it))
      throw TypeError(it + ' is not a function!');
    return it;
  };
  assert.obj = function(it) {
    if (!$.isObject(it))
      throw TypeError(it + ' is not an object!');
    return it;
  };
  assert.inst = function(it, Constructor, name) {
    if (!(it instanceof Constructor))
      throw TypeError(name + ": use the 'new' operator!");
    return it;
  };
  module.exports = assert;
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/$.def", ["npm:core-js@0.9.6/library/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/library/modules/$"),
      global = $.g,
      core = $.core,
      isFunction = $.isFunction;
  function ctx(fn, that) {
    return function() {
      return fn.apply(that, arguments);
    };
  }
  $def.F = 1;
  $def.G = 2;
  $def.S = 4;
  $def.P = 8;
  $def.B = 16;
  $def.W = 32;
  function $def(type, name, source) {
    var key,
        own,
        out,
        exp,
        isGlobal = type & $def.G,
        target = isGlobal ? global : type & $def.S ? global[name] : (global[name] || {}).prototype,
        exports = isGlobal ? core : core[name] || (core[name] = {});
    if (isGlobal)
      source = name;
    for (key in source) {
      own = !(type & $def.F) && target && key in target;
      if (own && key in exports)
        continue;
      out = own ? target[key] : source[key];
      if (isGlobal && !isFunction(target[key]))
        exp = source[key];
      else if (type & $def.B && own)
        exp = ctx(out, global);
      else if (type & $def.W && target[key] == out)
        !function(C) {
          exp = function(param) {
            return this instanceof C ? new C(param) : C(param);
          };
          exp.prototype = C.prototype;
        }(out);
      else
        exp = type & $def.P && isFunction(out) ? ctx(Function.call, out) : out;
      $.hide(exports, key, exp);
    }
  }
  module.exports = $def;
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/$.unscope", ["npm:core-js@0.9.6/library/modules/$", "npm:core-js@0.9.6/library/modules/$.wks"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/library/modules/$"),
      UNSCOPABLES = require("npm:core-js@0.9.6/library/modules/$.wks")('unscopables');
  if ($.FW && !(UNSCOPABLES in []))
    $.hide(Array.prototype, UNSCOPABLES, {});
  module.exports = function(key) {
    if ($.FW)
      [][UNSCOPABLES][key] = true;
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/$.ctx", ["npm:core-js@0.9.6/library/modules/$.assert"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var assertFunction = require("npm:core-js@0.9.6/library/modules/$.assert").fn;
  module.exports = function(fn, that, length) {
    assertFunction(fn);
    if (~length && that === undefined)
      return fn;
    switch (length) {
      case 1:
        return function(a) {
          return fn.call(that, a);
        };
      case 2:
        return function(a, b) {
          return fn.call(that, a, b);
        };
      case 3:
        return function(a, b, c) {
          return fn.call(that, a, b, c);
        };
    }
    return function() {
      return fn.apply(that, arguments);
    };
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/$.iter-call", ["npm:core-js@0.9.6/library/modules/$.assert"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var assertObject = require("npm:core-js@0.9.6/library/modules/$.assert").obj;
  function close(iterator) {
    var ret = iterator['return'];
    if (ret !== undefined)
      assertObject(ret.call(iterator));
  }
  function call(iterator, fn, value, entries) {
    try {
      return entries ? fn(assertObject(value)[0], value[1]) : fn(value);
    } catch (e) {
      close(iterator);
      throw e;
    }
  }
  call.close = close;
  module.exports = call;
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/$.species", ["npm:core-js@0.9.6/library/modules/$", "npm:core-js@0.9.6/library/modules/$.wks"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/library/modules/$"),
      SPECIES = require("npm:core-js@0.9.6/library/modules/$.wks")('species');
  module.exports = function(C) {
    if ($.DESC && !(SPECIES in C))
      $.setDesc(C, SPECIES, {
        configurable: true,
        get: $.that
      });
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/$.iter-detect", ["npm:core-js@0.9.6/library/modules/$.wks"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var SYMBOL_ITERATOR = require("npm:core-js@0.9.6/library/modules/$.wks")('iterator'),
      SAFE_CLOSING = false;
  try {
    var riter = [7][SYMBOL_ITERATOR]();
    riter['return'] = function() {
      SAFE_CLOSING = true;
    };
    Array.from(riter, function() {
      throw 2;
    });
  } catch (e) {}
  module.exports = function(exec) {
    if (!SAFE_CLOSING)
      return false;
    var safe = false;
    try {
      var arr = [7],
          iter = arr[SYMBOL_ITERATOR]();
      iter.next = function() {
        safe = true;
      };
      arr[SYMBOL_ITERATOR] = function() {
        return iter;
      };
      exec(arr);
    } catch (e) {}
    return safe;
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/$.collection-to-json", ["npm:core-js@0.9.6/library/modules/$.def", "npm:core-js@0.9.6/library/modules/$.for-of"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $def = require("npm:core-js@0.9.6/library/modules/$.def"),
      forOf = require("npm:core-js@0.9.6/library/modules/$.for-of");
  module.exports = function(NAME) {
    $def($def.P, NAME, {toJSON: function toJSON() {
        var arr = [];
        forOf(this, false, arr.push, arr);
        return arr;
      }});
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/$.set-proto", ["npm:core-js@0.9.6/library/modules/$", "npm:core-js@0.9.6/library/modules/$.assert", "npm:core-js@0.9.6/library/modules/$.ctx"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/library/modules/$"),
      assert = require("npm:core-js@0.9.6/library/modules/$.assert");
  function check(O, proto) {
    assert.obj(O);
    assert(proto === null || $.isObject(proto), proto, ": can't set as prototype!");
  }
  module.exports = {
    set: Object.setPrototypeOf || ('__proto__' in {} ? function(buggy, set) {
      try {
        set = require("npm:core-js@0.9.6/library/modules/$.ctx")(Function.call, $.getDesc(Object.prototype, '__proto__').set, 2);
        set({}, []);
      } catch (e) {
        buggy = true;
      }
      return function setPrototypeOf(O, proto) {
        check(O, proto);
        if (buggy)
          O.__proto__ = proto;
        else
          set(O, proto);
        return O;
      };
    }() : undefined),
    check: check
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/$.invoke", [], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = function(fn, args, that) {
    var un = that === undefined;
    switch (args.length) {
      case 0:
        return un ? fn() : fn.call(that);
      case 1:
        return un ? fn(args[0]) : fn.call(that, args[0]);
      case 2:
        return un ? fn(args[0], args[1]) : fn.call(that, args[0], args[1]);
      case 3:
        return un ? fn(args[0], args[1], args[2]) : fn.call(that, args[0], args[1], args[2]);
      case 4:
        return un ? fn(args[0], args[1], args[2], args[3]) : fn.call(that, args[0], args[1], args[2], args[3]);
      case 5:
        return un ? fn(args[0], args[1], args[2], args[3], args[4]) : fn.call(that, args[0], args[1], args[2], args[3], args[4]);
    }
    return fn.apply(that, args);
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/$.dom-create", ["npm:core-js@0.9.6/library/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/library/modules/$"),
      document = $.g.document,
      isObject = $.isObject,
      is = isObject(document) && isObject(document.createElement);
  module.exports = function(it) {
    return is ? document.createElement(it) : {};
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:process@0.10.1/browser", [], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var process = module.exports = {};
  var queue = [];
  var draining = false;
  function drainQueue() {
    if (draining) {
      return ;
    }
    draining = true;
    var currentQueue;
    var len = queue.length;
    while (len) {
      currentQueue = queue;
      queue = [];
      var i = -1;
      while (++i < len) {
        currentQueue[i]();
      }
      len = queue.length;
    }
    draining = false;
  }
  process.nextTick = function(fun) {
    queue.push(fun);
    if (!draining) {
      setTimeout(drainQueue, 0);
    }
  };
  process.title = 'browser';
  process.browser = true;
  process.env = {};
  process.argv = [];
  process.version = '';
  process.versions = {};
  function noop() {}
  process.on = noop;
  process.addListener = noop;
  process.once = noop;
  process.off = noop;
  process.removeListener = noop;
  process.removeAllListeners = noop;
  process.emit = noop;
  process.binding = function(name) {
    throw new Error('process.binding is not supported');
  };
  process.cwd = function() {
    return '/';
  };
  process.chdir = function(dir) {
    throw new Error('process.chdir is not supported');
  };
  process.umask = function() {
    return 0;
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/$.enum-keys", ["npm:core-js@0.9.6/library/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/library/modules/$");
  module.exports = function(it) {
    var keys = $.getKeys(it),
        getDesc = $.getDesc,
        getSymbols = $.getSymbols;
    if (getSymbols)
      $.each.call(getSymbols(it), function(key) {
        if (getDesc(it, key).enumerable)
          keys.push(key);
      });
    return keys;
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:handlebars@2.0.0/dist/cjs/handlebars/safe-string", [], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  "use strict";
  function SafeString(string) {
    this.string = string;
  }
  SafeString.prototype.toString = function() {
    return "" + this.string;
  };
  exports["default"] = SafeString;
  global.define = __define;
  return module.exports;
});

System.register("npm:handlebars@2.0.0/dist/cjs/handlebars/exception", [], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  "use strict";
  var errorProps = ['description', 'fileName', 'lineNumber', 'message', 'name', 'number', 'stack'];
  function Exception(message, node) {
    var line;
    if (node && node.firstLine) {
      line = node.firstLine;
      message += ' - ' + line + ':' + node.firstColumn;
    }
    var tmp = Error.prototype.constructor.call(this, message);
    for (var idx = 0; idx < errorProps.length; idx++) {
      this[errorProps[idx]] = tmp[errorProps[idx]];
    }
    if (line) {
      this.lineNumber = line;
      this.column = node.firstColumn;
    }
  }
  Exception.prototype = new Error();
  exports["default"] = Exception;
  global.define = __define;
  return module.exports;
});

System.register("npm:handlebars@2.0.0/dist/cjs/handlebars/runtime", ["npm:handlebars@2.0.0/dist/cjs/handlebars/utils", "npm:handlebars@2.0.0/dist/cjs/handlebars/exception", "npm:handlebars@2.0.0/dist/cjs/handlebars/base", "npm:handlebars@2.0.0/dist/cjs/handlebars/base", "npm:handlebars@2.0.0/dist/cjs/handlebars/base"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  "use strict";
  var Utils = require("npm:handlebars@2.0.0/dist/cjs/handlebars/utils");
  var Exception = require("npm:handlebars@2.0.0/dist/cjs/handlebars/exception")["default"];
  var COMPILER_REVISION = require("npm:handlebars@2.0.0/dist/cjs/handlebars/base").COMPILER_REVISION;
  var REVISION_CHANGES = require("npm:handlebars@2.0.0/dist/cjs/handlebars/base").REVISION_CHANGES;
  var createFrame = require("npm:handlebars@2.0.0/dist/cjs/handlebars/base").createFrame;
  function checkRevision(compilerInfo) {
    var compilerRevision = compilerInfo && compilerInfo[0] || 1,
        currentRevision = COMPILER_REVISION;
    if (compilerRevision !== currentRevision) {
      if (compilerRevision < currentRevision) {
        var runtimeVersions = REVISION_CHANGES[currentRevision],
            compilerVersions = REVISION_CHANGES[compilerRevision];
        throw new Exception("Template was precompiled with an older version of Handlebars than the current runtime. " + "Please update your precompiler to a newer version (" + runtimeVersions + ") or downgrade your runtime to an older version (" + compilerVersions + ").");
      } else {
        throw new Exception("Template was precompiled with a newer version of Handlebars than the current runtime. " + "Please update your runtime to a newer version (" + compilerInfo[1] + ").");
      }
    }
  }
  exports.checkRevision = checkRevision;
  function template(templateSpec, env) {
    if (!env) {
      throw new Exception("No environment passed to template");
    }
    if (!templateSpec || !templateSpec.main) {
      throw new Exception('Unknown template object: ' + typeof templateSpec);
    }
    env.VM.checkRevision(templateSpec.compiler);
    var invokePartialWrapper = function(partial, indent, name, context, hash, helpers, partials, data, depths) {
      if (hash) {
        context = Utils.extend({}, context, hash);
      }
      var result = env.VM.invokePartial.call(this, partial, name, context, helpers, partials, data, depths);
      if (result == null && env.compile) {
        var options = {
          helpers: helpers,
          partials: partials,
          data: data,
          depths: depths
        };
        partials[name] = env.compile(partial, {
          data: data !== undefined,
          compat: templateSpec.compat
        }, env);
        result = partials[name](context, options);
      }
      if (result != null) {
        if (indent) {
          var lines = result.split('\n');
          for (var i = 0,
              l = lines.length; i < l; i++) {
            if (!lines[i] && i + 1 === l) {
              break;
            }
            lines[i] = indent + lines[i];
          }
          result = lines.join('\n');
        }
        return result;
      } else {
        throw new Exception("The partial " + name + " could not be compiled when running in runtime-only mode");
      }
    };
    var container = {
      lookup: function(depths, name) {
        var len = depths.length;
        for (var i = 0; i < len; i++) {
          if (depths[i] && depths[i][name] != null) {
            return depths[i][name];
          }
        }
      },
      lambda: function(current, context) {
        return typeof current === 'function' ? current.call(context) : current;
      },
      escapeExpression: Utils.escapeExpression,
      invokePartial: invokePartialWrapper,
      fn: function(i) {
        return templateSpec[i];
      },
      programs: [],
      program: function(i, data, depths) {
        var programWrapper = this.programs[i],
            fn = this.fn(i);
        if (data || depths) {
          programWrapper = program(this, i, fn, data, depths);
        } else if (!programWrapper) {
          programWrapper = this.programs[i] = program(this, i, fn);
        }
        return programWrapper;
      },
      data: function(data, depth) {
        while (data && depth--) {
          data = data._parent;
        }
        return data;
      },
      merge: function(param, common) {
        var ret = param || common;
        if (param && common && (param !== common)) {
          ret = Utils.extend({}, common, param);
        }
        return ret;
      },
      noop: env.VM.noop,
      compilerInfo: templateSpec.compiler
    };
    var ret = function(context, options) {
      options = options || {};
      var data = options.data;
      ret._setup(options);
      if (!options.partial && templateSpec.useData) {
        data = initData(context, data);
      }
      var depths;
      if (templateSpec.useDepths) {
        depths = options.depths ? [context].concat(options.depths) : [context];
      }
      return templateSpec.main.call(container, context, container.helpers, container.partials, data, depths);
    };
    ret.isTop = true;
    ret._setup = function(options) {
      if (!options.partial) {
        container.helpers = container.merge(options.helpers, env.helpers);
        if (templateSpec.usePartial) {
          container.partials = container.merge(options.partials, env.partials);
        }
      } else {
        container.helpers = options.helpers;
        container.partials = options.partials;
      }
    };
    ret._child = function(i, data, depths) {
      if (templateSpec.useDepths && !depths) {
        throw new Exception('must pass parent depths');
      }
      return program(container, i, templateSpec[i], data, depths);
    };
    return ret;
  }
  exports.template = template;
  function program(container, i, fn, data, depths) {
    var prog = function(context, options) {
      options = options || {};
      return fn.call(container, context, container.helpers, container.partials, options.data || data, depths && [context].concat(depths));
    };
    prog.program = i;
    prog.depth = depths ? depths.length : 0;
    return prog;
  }
  exports.program = program;
  function invokePartial(partial, name, context, helpers, partials, data, depths) {
    var options = {
      partial: true,
      helpers: helpers,
      partials: partials,
      data: data,
      depths: depths
    };
    if (partial === undefined) {
      throw new Exception("The partial " + name + " could not be found");
    } else if (partial instanceof Function) {
      return partial(context, options);
    }
  }
  exports.invokePartial = invokePartial;
  function noop() {
    return "";
  }
  exports.noop = noop;
  function initData(context, data) {
    if (!data || !('root' in data)) {
      data = data ? createFrame(data) : {};
      data.root = context;
    }
    return data;
  }
  global.define = __define;
  return module.exports;
});

System.register("npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/ast", ["npm:handlebars@2.0.0/dist/cjs/handlebars/exception"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  "use strict";
  var Exception = require("npm:handlebars@2.0.0/dist/cjs/handlebars/exception")["default"];
  function LocationInfo(locInfo) {
    locInfo = locInfo || {};
    this.firstLine = locInfo.first_line;
    this.firstColumn = locInfo.first_column;
    this.lastColumn = locInfo.last_column;
    this.lastLine = locInfo.last_line;
  }
  var AST = {
    ProgramNode: function(statements, strip, locInfo) {
      LocationInfo.call(this, locInfo);
      this.type = "program";
      this.statements = statements;
      this.strip = strip;
    },
    MustacheNode: function(rawParams, hash, open, strip, locInfo) {
      LocationInfo.call(this, locInfo);
      this.type = "mustache";
      this.strip = strip;
      if (open != null && open.charAt) {
        var escapeFlag = open.charAt(3) || open.charAt(2);
        this.escaped = escapeFlag !== '{' && escapeFlag !== '&';
      } else {
        this.escaped = !!open;
      }
      if (rawParams instanceof AST.SexprNode) {
        this.sexpr = rawParams;
      } else {
        this.sexpr = new AST.SexprNode(rawParams, hash);
      }
      this.id = this.sexpr.id;
      this.params = this.sexpr.params;
      this.hash = this.sexpr.hash;
      this.eligibleHelper = this.sexpr.eligibleHelper;
      this.isHelper = this.sexpr.isHelper;
    },
    SexprNode: function(rawParams, hash, locInfo) {
      LocationInfo.call(this, locInfo);
      this.type = "sexpr";
      this.hash = hash;
      var id = this.id = rawParams[0];
      var params = this.params = rawParams.slice(1);
      this.isHelper = !!(params.length || hash);
      this.eligibleHelper = this.isHelper || id.isSimple;
    },
    PartialNode: function(partialName, context, hash, strip, locInfo) {
      LocationInfo.call(this, locInfo);
      this.type = "partial";
      this.partialName = partialName;
      this.context = context;
      this.hash = hash;
      this.strip = strip;
      this.strip.inlineStandalone = true;
    },
    BlockNode: function(mustache, program, inverse, strip, locInfo) {
      LocationInfo.call(this, locInfo);
      this.type = 'block';
      this.mustache = mustache;
      this.program = program;
      this.inverse = inverse;
      this.strip = strip;
      if (inverse && !program) {
        this.isInverse = true;
      }
    },
    RawBlockNode: function(mustache, content, close, locInfo) {
      LocationInfo.call(this, locInfo);
      if (mustache.sexpr.id.original !== close) {
        throw new Exception(mustache.sexpr.id.original + " doesn't match " + close, this);
      }
      content = new AST.ContentNode(content, locInfo);
      this.type = 'block';
      this.mustache = mustache;
      this.program = new AST.ProgramNode([content], {}, locInfo);
    },
    ContentNode: function(string, locInfo) {
      LocationInfo.call(this, locInfo);
      this.type = "content";
      this.original = this.string = string;
    },
    HashNode: function(pairs, locInfo) {
      LocationInfo.call(this, locInfo);
      this.type = "hash";
      this.pairs = pairs;
    },
    IdNode: function(parts, locInfo) {
      LocationInfo.call(this, locInfo);
      this.type = "ID";
      var original = "",
          dig = [],
          depth = 0,
          depthString = '';
      for (var i = 0,
          l = parts.length; i < l; i++) {
        var part = parts[i].part;
        original += (parts[i].separator || '') + part;
        if (part === ".." || part === "." || part === "this") {
          if (dig.length > 0) {
            throw new Exception("Invalid path: " + original, this);
          } else if (part === "..") {
            depth++;
            depthString += '../';
          } else {
            this.isScoped = true;
          }
        } else {
          dig.push(part);
        }
      }
      this.original = original;
      this.parts = dig;
      this.string = dig.join('.');
      this.depth = depth;
      this.idName = depthString + this.string;
      this.isSimple = parts.length === 1 && !this.isScoped && depth === 0;
      this.stringModeValue = this.string;
    },
    PartialNameNode: function(name, locInfo) {
      LocationInfo.call(this, locInfo);
      this.type = "PARTIAL_NAME";
      this.name = name.original;
    },
    DataNode: function(id, locInfo) {
      LocationInfo.call(this, locInfo);
      this.type = "DATA";
      this.id = id;
      this.stringModeValue = id.stringModeValue;
      this.idName = '@' + id.stringModeValue;
    },
    StringNode: function(string, locInfo) {
      LocationInfo.call(this, locInfo);
      this.type = "STRING";
      this.original = this.string = this.stringModeValue = string;
    },
    NumberNode: function(number, locInfo) {
      LocationInfo.call(this, locInfo);
      this.type = "NUMBER";
      this.original = this.number = number;
      this.stringModeValue = Number(number);
    },
    BooleanNode: function(bool, locInfo) {
      LocationInfo.call(this, locInfo);
      this.type = "BOOLEAN";
      this.bool = bool;
      this.stringModeValue = bool === "true";
    },
    CommentNode: function(comment, locInfo) {
      LocationInfo.call(this, locInfo);
      this.type = "comment";
      this.comment = comment;
      this.strip = {inlineStandalone: true};
    }
  };
  exports["default"] = AST;
  global.define = __define;
  return module.exports;
});

System.register("npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/parser", [], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  "use strict";
  var handlebars = (function() {
    var parser = {
      trace: function trace() {},
      yy: {},
      symbols_: {
        "error": 2,
        "root": 3,
        "program": 4,
        "EOF": 5,
        "program_repetition0": 6,
        "statement": 7,
        "mustache": 8,
        "block": 9,
        "rawBlock": 10,
        "partial": 11,
        "CONTENT": 12,
        "COMMENT": 13,
        "openRawBlock": 14,
        "END_RAW_BLOCK": 15,
        "OPEN_RAW_BLOCK": 16,
        "sexpr": 17,
        "CLOSE_RAW_BLOCK": 18,
        "openBlock": 19,
        "block_option0": 20,
        "closeBlock": 21,
        "openInverse": 22,
        "block_option1": 23,
        "OPEN_BLOCK": 24,
        "CLOSE": 25,
        "OPEN_INVERSE": 26,
        "inverseAndProgram": 27,
        "INVERSE": 28,
        "OPEN_ENDBLOCK": 29,
        "path": 30,
        "OPEN": 31,
        "OPEN_UNESCAPED": 32,
        "CLOSE_UNESCAPED": 33,
        "OPEN_PARTIAL": 34,
        "partialName": 35,
        "param": 36,
        "partial_option0": 37,
        "partial_option1": 38,
        "sexpr_repetition0": 39,
        "sexpr_option0": 40,
        "dataName": 41,
        "STRING": 42,
        "NUMBER": 43,
        "BOOLEAN": 44,
        "OPEN_SEXPR": 45,
        "CLOSE_SEXPR": 46,
        "hash": 47,
        "hash_repetition_plus0": 48,
        "hashSegment": 49,
        "ID": 50,
        "EQUALS": 51,
        "DATA": 52,
        "pathSegments": 53,
        "SEP": 54,
        "$accept": 0,
        "$end": 1
      },
      terminals_: {
        2: "error",
        5: "EOF",
        12: "CONTENT",
        13: "COMMENT",
        15: "END_RAW_BLOCK",
        16: "OPEN_RAW_BLOCK",
        18: "CLOSE_RAW_BLOCK",
        24: "OPEN_BLOCK",
        25: "CLOSE",
        26: "OPEN_INVERSE",
        28: "INVERSE",
        29: "OPEN_ENDBLOCK",
        31: "OPEN",
        32: "OPEN_UNESCAPED",
        33: "CLOSE_UNESCAPED",
        34: "OPEN_PARTIAL",
        42: "STRING",
        43: "NUMBER",
        44: "BOOLEAN",
        45: "OPEN_SEXPR",
        46: "CLOSE_SEXPR",
        50: "ID",
        51: "EQUALS",
        52: "DATA",
        54: "SEP"
      },
      productions_: [0, [3, 2], [4, 1], [7, 1], [7, 1], [7, 1], [7, 1], [7, 1], [7, 1], [10, 3], [14, 3], [9, 4], [9, 4], [19, 3], [22, 3], [27, 2], [21, 3], [8, 3], [8, 3], [11, 5], [11, 4], [17, 3], [17, 1], [36, 1], [36, 1], [36, 1], [36, 1], [36, 1], [36, 3], [47, 1], [49, 3], [35, 1], [35, 1], [35, 1], [41, 2], [30, 1], [53, 3], [53, 1], [6, 0], [6, 2], [20, 0], [20, 1], [23, 0], [23, 1], [37, 0], [37, 1], [38, 0], [38, 1], [39, 0], [39, 2], [40, 0], [40, 1], [48, 1], [48, 2]],
      performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate, $$, _$) {
        var $0 = $$.length - 1;
        switch (yystate) {
          case 1:
            yy.prepareProgram($$[$0 - 1].statements, true);
            return $$[$0 - 1];
            break;
          case 2:
            this.$ = new yy.ProgramNode(yy.prepareProgram($$[$0]), {}, this._$);
            break;
          case 3:
            this.$ = $$[$0];
            break;
          case 4:
            this.$ = $$[$0];
            break;
          case 5:
            this.$ = $$[$0];
            break;
          case 6:
            this.$ = $$[$0];
            break;
          case 7:
            this.$ = new yy.ContentNode($$[$0], this._$);
            break;
          case 8:
            this.$ = new yy.CommentNode($$[$0], this._$);
            break;
          case 9:
            this.$ = new yy.RawBlockNode($$[$0 - 2], $$[$0 - 1], $$[$0], this._$);
            break;
          case 10:
            this.$ = new yy.MustacheNode($$[$0 - 1], null, '', '', this._$);
            break;
          case 11:
            this.$ = yy.prepareBlock($$[$0 - 3], $$[$0 - 2], $$[$0 - 1], $$[$0], false, this._$);
            break;
          case 12:
            this.$ = yy.prepareBlock($$[$0 - 3], $$[$0 - 2], $$[$0 - 1], $$[$0], true, this._$);
            break;
          case 13:
            this.$ = new yy.MustacheNode($$[$0 - 1], null, $$[$0 - 2], yy.stripFlags($$[$0 - 2], $$[$0]), this._$);
            break;
          case 14:
            this.$ = new yy.MustacheNode($$[$0 - 1], null, $$[$0 - 2], yy.stripFlags($$[$0 - 2], $$[$0]), this._$);
            break;
          case 15:
            this.$ = {
              strip: yy.stripFlags($$[$0 - 1], $$[$0 - 1]),
              program: $$[$0]
            };
            break;
          case 16:
            this.$ = {
              path: $$[$0 - 1],
              strip: yy.stripFlags($$[$0 - 2], $$[$0])
            };
            break;
          case 17:
            this.$ = new yy.MustacheNode($$[$0 - 1], null, $$[$0 - 2], yy.stripFlags($$[$0 - 2], $$[$0]), this._$);
            break;
          case 18:
            this.$ = new yy.MustacheNode($$[$0 - 1], null, $$[$0 - 2], yy.stripFlags($$[$0 - 2], $$[$0]), this._$);
            break;
          case 19:
            this.$ = new yy.PartialNode($$[$0 - 3], $$[$0 - 2], $$[$0 - 1], yy.stripFlags($$[$0 - 4], $$[$0]), this._$);
            break;
          case 20:
            this.$ = new yy.PartialNode($$[$0 - 2], undefined, $$[$0 - 1], yy.stripFlags($$[$0 - 3], $$[$0]), this._$);
            break;
          case 21:
            this.$ = new yy.SexprNode([$$[$0 - 2]].concat($$[$0 - 1]), $$[$0], this._$);
            break;
          case 22:
            this.$ = new yy.SexprNode([$$[$0]], null, this._$);
            break;
          case 23:
            this.$ = $$[$0];
            break;
          case 24:
            this.$ = new yy.StringNode($$[$0], this._$);
            break;
          case 25:
            this.$ = new yy.NumberNode($$[$0], this._$);
            break;
          case 26:
            this.$ = new yy.BooleanNode($$[$0], this._$);
            break;
          case 27:
            this.$ = $$[$0];
            break;
          case 28:
            $$[$0 - 1].isHelper = true;
            this.$ = $$[$0 - 1];
            break;
          case 29:
            this.$ = new yy.HashNode($$[$0], this._$);
            break;
          case 30:
            this.$ = [$$[$0 - 2], $$[$0]];
            break;
          case 31:
            this.$ = new yy.PartialNameNode($$[$0], this._$);
            break;
          case 32:
            this.$ = new yy.PartialNameNode(new yy.StringNode($$[$0], this._$), this._$);
            break;
          case 33:
            this.$ = new yy.PartialNameNode(new yy.NumberNode($$[$0], this._$));
            break;
          case 34:
            this.$ = new yy.DataNode($$[$0], this._$);
            break;
          case 35:
            this.$ = new yy.IdNode($$[$0], this._$);
            break;
          case 36:
            $$[$0 - 2].push({
              part: $$[$0],
              separator: $$[$0 - 1]
            });
            this.$ = $$[$0 - 2];
            break;
          case 37:
            this.$ = [{part: $$[$0]}];
            break;
          case 38:
            this.$ = [];
            break;
          case 39:
            $$[$0 - 1].push($$[$0]);
            break;
          case 48:
            this.$ = [];
            break;
          case 49:
            $$[$0 - 1].push($$[$0]);
            break;
          case 52:
            this.$ = [$$[$0]];
            break;
          case 53:
            $$[$0 - 1].push($$[$0]);
            break;
        }
      },
      table: [{
        3: 1,
        4: 2,
        5: [2, 38],
        6: 3,
        12: [2, 38],
        13: [2, 38],
        16: [2, 38],
        24: [2, 38],
        26: [2, 38],
        31: [2, 38],
        32: [2, 38],
        34: [2, 38]
      }, {1: [3]}, {5: [1, 4]}, {
        5: [2, 2],
        7: 5,
        8: 6,
        9: 7,
        10: 8,
        11: 9,
        12: [1, 10],
        13: [1, 11],
        14: 16,
        16: [1, 20],
        19: 14,
        22: 15,
        24: [1, 18],
        26: [1, 19],
        28: [2, 2],
        29: [2, 2],
        31: [1, 12],
        32: [1, 13],
        34: [1, 17]
      }, {1: [2, 1]}, {
        5: [2, 39],
        12: [2, 39],
        13: [2, 39],
        16: [2, 39],
        24: [2, 39],
        26: [2, 39],
        28: [2, 39],
        29: [2, 39],
        31: [2, 39],
        32: [2, 39],
        34: [2, 39]
      }, {
        5: [2, 3],
        12: [2, 3],
        13: [2, 3],
        16: [2, 3],
        24: [2, 3],
        26: [2, 3],
        28: [2, 3],
        29: [2, 3],
        31: [2, 3],
        32: [2, 3],
        34: [2, 3]
      }, {
        5: [2, 4],
        12: [2, 4],
        13: [2, 4],
        16: [2, 4],
        24: [2, 4],
        26: [2, 4],
        28: [2, 4],
        29: [2, 4],
        31: [2, 4],
        32: [2, 4],
        34: [2, 4]
      }, {
        5: [2, 5],
        12: [2, 5],
        13: [2, 5],
        16: [2, 5],
        24: [2, 5],
        26: [2, 5],
        28: [2, 5],
        29: [2, 5],
        31: [2, 5],
        32: [2, 5],
        34: [2, 5]
      }, {
        5: [2, 6],
        12: [2, 6],
        13: [2, 6],
        16: [2, 6],
        24: [2, 6],
        26: [2, 6],
        28: [2, 6],
        29: [2, 6],
        31: [2, 6],
        32: [2, 6],
        34: [2, 6]
      }, {
        5: [2, 7],
        12: [2, 7],
        13: [2, 7],
        16: [2, 7],
        24: [2, 7],
        26: [2, 7],
        28: [2, 7],
        29: [2, 7],
        31: [2, 7],
        32: [2, 7],
        34: [2, 7]
      }, {
        5: [2, 8],
        12: [2, 8],
        13: [2, 8],
        16: [2, 8],
        24: [2, 8],
        26: [2, 8],
        28: [2, 8],
        29: [2, 8],
        31: [2, 8],
        32: [2, 8],
        34: [2, 8]
      }, {
        17: 21,
        30: 22,
        41: 23,
        50: [1, 26],
        52: [1, 25],
        53: 24
      }, {
        17: 27,
        30: 22,
        41: 23,
        50: [1, 26],
        52: [1, 25],
        53: 24
      }, {
        4: 28,
        6: 3,
        12: [2, 38],
        13: [2, 38],
        16: [2, 38],
        24: [2, 38],
        26: [2, 38],
        28: [2, 38],
        29: [2, 38],
        31: [2, 38],
        32: [2, 38],
        34: [2, 38]
      }, {
        4: 29,
        6: 3,
        12: [2, 38],
        13: [2, 38],
        16: [2, 38],
        24: [2, 38],
        26: [2, 38],
        28: [2, 38],
        29: [2, 38],
        31: [2, 38],
        32: [2, 38],
        34: [2, 38]
      }, {12: [1, 30]}, {
        30: 32,
        35: 31,
        42: [1, 33],
        43: [1, 34],
        50: [1, 26],
        53: 24
      }, {
        17: 35,
        30: 22,
        41: 23,
        50: [1, 26],
        52: [1, 25],
        53: 24
      }, {
        17: 36,
        30: 22,
        41: 23,
        50: [1, 26],
        52: [1, 25],
        53: 24
      }, {
        17: 37,
        30: 22,
        41: 23,
        50: [1, 26],
        52: [1, 25],
        53: 24
      }, {25: [1, 38]}, {
        18: [2, 48],
        25: [2, 48],
        33: [2, 48],
        39: 39,
        42: [2, 48],
        43: [2, 48],
        44: [2, 48],
        45: [2, 48],
        46: [2, 48],
        50: [2, 48],
        52: [2, 48]
      }, {
        18: [2, 22],
        25: [2, 22],
        33: [2, 22],
        46: [2, 22]
      }, {
        18: [2, 35],
        25: [2, 35],
        33: [2, 35],
        42: [2, 35],
        43: [2, 35],
        44: [2, 35],
        45: [2, 35],
        46: [2, 35],
        50: [2, 35],
        52: [2, 35],
        54: [1, 40]
      }, {
        30: 41,
        50: [1, 26],
        53: 24
      }, {
        18: [2, 37],
        25: [2, 37],
        33: [2, 37],
        42: [2, 37],
        43: [2, 37],
        44: [2, 37],
        45: [2, 37],
        46: [2, 37],
        50: [2, 37],
        52: [2, 37],
        54: [2, 37]
      }, {33: [1, 42]}, {
        20: 43,
        27: 44,
        28: [1, 45],
        29: [2, 40]
      }, {
        23: 46,
        27: 47,
        28: [1, 45],
        29: [2, 42]
      }, {15: [1, 48]}, {
        25: [2, 46],
        30: 51,
        36: 49,
        38: 50,
        41: 55,
        42: [1, 52],
        43: [1, 53],
        44: [1, 54],
        45: [1, 56],
        47: 57,
        48: 58,
        49: 60,
        50: [1, 59],
        52: [1, 25],
        53: 24
      }, {
        25: [2, 31],
        42: [2, 31],
        43: [2, 31],
        44: [2, 31],
        45: [2, 31],
        50: [2, 31],
        52: [2, 31]
      }, {
        25: [2, 32],
        42: [2, 32],
        43: [2, 32],
        44: [2, 32],
        45: [2, 32],
        50: [2, 32],
        52: [2, 32]
      }, {
        25: [2, 33],
        42: [2, 33],
        43: [2, 33],
        44: [2, 33],
        45: [2, 33],
        50: [2, 33],
        52: [2, 33]
      }, {25: [1, 61]}, {25: [1, 62]}, {18: [1, 63]}, {
        5: [2, 17],
        12: [2, 17],
        13: [2, 17],
        16: [2, 17],
        24: [2, 17],
        26: [2, 17],
        28: [2, 17],
        29: [2, 17],
        31: [2, 17],
        32: [2, 17],
        34: [2, 17]
      }, {
        18: [2, 50],
        25: [2, 50],
        30: 51,
        33: [2, 50],
        36: 65,
        40: 64,
        41: 55,
        42: [1, 52],
        43: [1, 53],
        44: [1, 54],
        45: [1, 56],
        46: [2, 50],
        47: 66,
        48: 58,
        49: 60,
        50: [1, 59],
        52: [1, 25],
        53: 24
      }, {50: [1, 67]}, {
        18: [2, 34],
        25: [2, 34],
        33: [2, 34],
        42: [2, 34],
        43: [2, 34],
        44: [2, 34],
        45: [2, 34],
        46: [2, 34],
        50: [2, 34],
        52: [2, 34]
      }, {
        5: [2, 18],
        12: [2, 18],
        13: [2, 18],
        16: [2, 18],
        24: [2, 18],
        26: [2, 18],
        28: [2, 18],
        29: [2, 18],
        31: [2, 18],
        32: [2, 18],
        34: [2, 18]
      }, {
        21: 68,
        29: [1, 69]
      }, {29: [2, 41]}, {
        4: 70,
        6: 3,
        12: [2, 38],
        13: [2, 38],
        16: [2, 38],
        24: [2, 38],
        26: [2, 38],
        29: [2, 38],
        31: [2, 38],
        32: [2, 38],
        34: [2, 38]
      }, {
        21: 71,
        29: [1, 69]
      }, {29: [2, 43]}, {
        5: [2, 9],
        12: [2, 9],
        13: [2, 9],
        16: [2, 9],
        24: [2, 9],
        26: [2, 9],
        28: [2, 9],
        29: [2, 9],
        31: [2, 9],
        32: [2, 9],
        34: [2, 9]
      }, {
        25: [2, 44],
        37: 72,
        47: 73,
        48: 58,
        49: 60,
        50: [1, 74]
      }, {25: [1, 75]}, {
        18: [2, 23],
        25: [2, 23],
        33: [2, 23],
        42: [2, 23],
        43: [2, 23],
        44: [2, 23],
        45: [2, 23],
        46: [2, 23],
        50: [2, 23],
        52: [2, 23]
      }, {
        18: [2, 24],
        25: [2, 24],
        33: [2, 24],
        42: [2, 24],
        43: [2, 24],
        44: [2, 24],
        45: [2, 24],
        46: [2, 24],
        50: [2, 24],
        52: [2, 24]
      }, {
        18: [2, 25],
        25: [2, 25],
        33: [2, 25],
        42: [2, 25],
        43: [2, 25],
        44: [2, 25],
        45: [2, 25],
        46: [2, 25],
        50: [2, 25],
        52: [2, 25]
      }, {
        18: [2, 26],
        25: [2, 26],
        33: [2, 26],
        42: [2, 26],
        43: [2, 26],
        44: [2, 26],
        45: [2, 26],
        46: [2, 26],
        50: [2, 26],
        52: [2, 26]
      }, {
        18: [2, 27],
        25: [2, 27],
        33: [2, 27],
        42: [2, 27],
        43: [2, 27],
        44: [2, 27],
        45: [2, 27],
        46: [2, 27],
        50: [2, 27],
        52: [2, 27]
      }, {
        17: 76,
        30: 22,
        41: 23,
        50: [1, 26],
        52: [1, 25],
        53: 24
      }, {25: [2, 47]}, {
        18: [2, 29],
        25: [2, 29],
        33: [2, 29],
        46: [2, 29],
        49: 77,
        50: [1, 74]
      }, {
        18: [2, 37],
        25: [2, 37],
        33: [2, 37],
        42: [2, 37],
        43: [2, 37],
        44: [2, 37],
        45: [2, 37],
        46: [2, 37],
        50: [2, 37],
        51: [1, 78],
        52: [2, 37],
        54: [2, 37]
      }, {
        18: [2, 52],
        25: [2, 52],
        33: [2, 52],
        46: [2, 52],
        50: [2, 52]
      }, {
        12: [2, 13],
        13: [2, 13],
        16: [2, 13],
        24: [2, 13],
        26: [2, 13],
        28: [2, 13],
        29: [2, 13],
        31: [2, 13],
        32: [2, 13],
        34: [2, 13]
      }, {
        12: [2, 14],
        13: [2, 14],
        16: [2, 14],
        24: [2, 14],
        26: [2, 14],
        28: [2, 14],
        29: [2, 14],
        31: [2, 14],
        32: [2, 14],
        34: [2, 14]
      }, {12: [2, 10]}, {
        18: [2, 21],
        25: [2, 21],
        33: [2, 21],
        46: [2, 21]
      }, {
        18: [2, 49],
        25: [2, 49],
        33: [2, 49],
        42: [2, 49],
        43: [2, 49],
        44: [2, 49],
        45: [2, 49],
        46: [2, 49],
        50: [2, 49],
        52: [2, 49]
      }, {
        18: [2, 51],
        25: [2, 51],
        33: [2, 51],
        46: [2, 51]
      }, {
        18: [2, 36],
        25: [2, 36],
        33: [2, 36],
        42: [2, 36],
        43: [2, 36],
        44: [2, 36],
        45: [2, 36],
        46: [2, 36],
        50: [2, 36],
        52: [2, 36],
        54: [2, 36]
      }, {
        5: [2, 11],
        12: [2, 11],
        13: [2, 11],
        16: [2, 11],
        24: [2, 11],
        26: [2, 11],
        28: [2, 11],
        29: [2, 11],
        31: [2, 11],
        32: [2, 11],
        34: [2, 11]
      }, {
        30: 79,
        50: [1, 26],
        53: 24
      }, {29: [2, 15]}, {
        5: [2, 12],
        12: [2, 12],
        13: [2, 12],
        16: [2, 12],
        24: [2, 12],
        26: [2, 12],
        28: [2, 12],
        29: [2, 12],
        31: [2, 12],
        32: [2, 12],
        34: [2, 12]
      }, {25: [1, 80]}, {25: [2, 45]}, {51: [1, 78]}, {
        5: [2, 20],
        12: [2, 20],
        13: [2, 20],
        16: [2, 20],
        24: [2, 20],
        26: [2, 20],
        28: [2, 20],
        29: [2, 20],
        31: [2, 20],
        32: [2, 20],
        34: [2, 20]
      }, {46: [1, 81]}, {
        18: [2, 53],
        25: [2, 53],
        33: [2, 53],
        46: [2, 53],
        50: [2, 53]
      }, {
        30: 51,
        36: 82,
        41: 55,
        42: [1, 52],
        43: [1, 53],
        44: [1, 54],
        45: [1, 56],
        50: [1, 26],
        52: [1, 25],
        53: 24
      }, {25: [1, 83]}, {
        5: [2, 19],
        12: [2, 19],
        13: [2, 19],
        16: [2, 19],
        24: [2, 19],
        26: [2, 19],
        28: [2, 19],
        29: [2, 19],
        31: [2, 19],
        32: [2, 19],
        34: [2, 19]
      }, {
        18: [2, 28],
        25: [2, 28],
        33: [2, 28],
        42: [2, 28],
        43: [2, 28],
        44: [2, 28],
        45: [2, 28],
        46: [2, 28],
        50: [2, 28],
        52: [2, 28]
      }, {
        18: [2, 30],
        25: [2, 30],
        33: [2, 30],
        46: [2, 30],
        50: [2, 30]
      }, {
        5: [2, 16],
        12: [2, 16],
        13: [2, 16],
        16: [2, 16],
        24: [2, 16],
        26: [2, 16],
        28: [2, 16],
        29: [2, 16],
        31: [2, 16],
        32: [2, 16],
        34: [2, 16]
      }],
      defaultActions: {
        4: [2, 1],
        44: [2, 41],
        47: [2, 43],
        57: [2, 47],
        63: [2, 10],
        70: [2, 15],
        73: [2, 45]
      },
      parseError: function parseError(str, hash) {
        throw new Error(str);
      },
      parse: function parse(input) {
        var self = this,
            stack = [0],
            vstack = [null],
            lstack = [],
            table = this.table,
            yytext = "",
            yylineno = 0,
            yyleng = 0,
            recovering = 0,
            TERROR = 2,
            EOF = 1;
        this.lexer.setInput(input);
        this.lexer.yy = this.yy;
        this.yy.lexer = this.lexer;
        this.yy.parser = this;
        if (typeof this.lexer.yylloc == "undefined")
          this.lexer.yylloc = {};
        var yyloc = this.lexer.yylloc;
        lstack.push(yyloc);
        var ranges = this.lexer.options && this.lexer.options.ranges;
        if (typeof this.yy.parseError === "function")
          this.parseError = this.yy.parseError;
        function popStack(n) {
          stack.length = stack.length - 2 * n;
          vstack.length = vstack.length - n;
          lstack.length = lstack.length - n;
        }
        function lex() {
          var token;
          token = self.lexer.lex() || 1;
          if (typeof token !== "number") {
            token = self.symbols_[token] || token;
          }
          return token;
        }
        var symbol,
            preErrorSymbol,
            state,
            action,
            a,
            r,
            yyval = {},
            p,
            len,
            newState,
            expected;
        while (true) {
          state = stack[stack.length - 1];
          if (this.defaultActions[state]) {
            action = this.defaultActions[state];
          } else {
            if (symbol === null || typeof symbol == "undefined") {
              symbol = lex();
            }
            action = table[state] && table[state][symbol];
          }
          if (typeof action === "undefined" || !action.length || !action[0]) {
            var errStr = "";
            if (!recovering) {
              expected = [];
              for (p in table[state])
                if (this.terminals_[p] && p > 2) {
                  expected.push("'" + this.terminals_[p] + "'");
                }
              if (this.lexer.showPosition) {
                errStr = "Parse error on line " + (yylineno + 1) + ":\n" + this.lexer.showPosition() + "\nExpecting " + expected.join(", ") + ", got '" + (this.terminals_[symbol] || symbol) + "'";
              } else {
                errStr = "Parse error on line " + (yylineno + 1) + ": Unexpected " + (symbol == 1 ? "end of input" : "'" + (this.terminals_[symbol] || symbol) + "'");
              }
              this.parseError(errStr, {
                text: this.lexer.match,
                token: this.terminals_[symbol] || symbol,
                line: this.lexer.yylineno,
                loc: yyloc,
                expected: expected
              });
            }
          }
          if (action[0] instanceof Array && action.length > 1) {
            throw new Error("Parse Error: multiple actions possible at state: " + state + ", token: " + symbol);
          }
          switch (action[0]) {
            case 1:
              stack.push(symbol);
              vstack.push(this.lexer.yytext);
              lstack.push(this.lexer.yylloc);
              stack.push(action[1]);
              symbol = null;
              if (!preErrorSymbol) {
                yyleng = this.lexer.yyleng;
                yytext = this.lexer.yytext;
                yylineno = this.lexer.yylineno;
                yyloc = this.lexer.yylloc;
                if (recovering > 0)
                  recovering--;
              } else {
                symbol = preErrorSymbol;
                preErrorSymbol = null;
              }
              break;
            case 2:
              len = this.productions_[action[1]][1];
              yyval.$ = vstack[vstack.length - len];
              yyval._$ = {
                first_line: lstack[lstack.length - (len || 1)].first_line,
                last_line: lstack[lstack.length - 1].last_line,
                first_column: lstack[lstack.length - (len || 1)].first_column,
                last_column: lstack[lstack.length - 1].last_column
              };
              if (ranges) {
                yyval._$.range = [lstack[lstack.length - (len || 1)].range[0], lstack[lstack.length - 1].range[1]];
              }
              r = this.performAction.call(yyval, yytext, yyleng, yylineno, this.yy, action[1], vstack, lstack);
              if (typeof r !== "undefined") {
                return r;
              }
              if (len) {
                stack = stack.slice(0, -1 * len * 2);
                vstack = vstack.slice(0, -1 * len);
                lstack = lstack.slice(0, -1 * len);
              }
              stack.push(this.productions_[action[1]][0]);
              vstack.push(yyval.$);
              lstack.push(yyval._$);
              newState = table[stack[stack.length - 2]][stack[stack.length - 1]];
              stack.push(newState);
              break;
            case 3:
              return true;
          }
        }
        return true;
      }
    };
    var lexer = (function() {
      var lexer = ({
        EOF: 1,
        parseError: function parseError(str, hash) {
          if (this.yy.parser) {
            this.yy.parser.parseError(str, hash);
          } else {
            throw new Error(str);
          }
        },
        setInput: function(input) {
          this._input = input;
          this._more = this._less = this.done = false;
          this.yylineno = this.yyleng = 0;
          this.yytext = this.matched = this.match = '';
          this.conditionStack = ['INITIAL'];
          this.yylloc = {
            first_line: 1,
            first_column: 0,
            last_line: 1,
            last_column: 0
          };
          if (this.options.ranges)
            this.yylloc.range = [0, 0];
          this.offset = 0;
          return this;
        },
        input: function() {
          var ch = this._input[0];
          this.yytext += ch;
          this.yyleng++;
          this.offset++;
          this.match += ch;
          this.matched += ch;
          var lines = ch.match(/(?:\r\n?|\n).*/g);
          if (lines) {
            this.yylineno++;
            this.yylloc.last_line++;
          } else {
            this.yylloc.last_column++;
          }
          if (this.options.ranges)
            this.yylloc.range[1]++;
          this._input = this._input.slice(1);
          return ch;
        },
        unput: function(ch) {
          var len = ch.length;
          var lines = ch.split(/(?:\r\n?|\n)/g);
          this._input = ch + this._input;
          this.yytext = this.yytext.substr(0, this.yytext.length - len - 1);
          this.offset -= len;
          var oldLines = this.match.split(/(?:\r\n?|\n)/g);
          this.match = this.match.substr(0, this.match.length - 1);
          this.matched = this.matched.substr(0, this.matched.length - 1);
          if (lines.length - 1)
            this.yylineno -= lines.length - 1;
          var r = this.yylloc.range;
          this.yylloc = {
            first_line: this.yylloc.first_line,
            last_line: this.yylineno + 1,
            first_column: this.yylloc.first_column,
            last_column: lines ? (lines.length === oldLines.length ? this.yylloc.first_column : 0) + oldLines[oldLines.length - lines.length].length - lines[0].length : this.yylloc.first_column - len
          };
          if (this.options.ranges) {
            this.yylloc.range = [r[0], r[0] + this.yyleng - len];
          }
          return this;
        },
        more: function() {
          this._more = true;
          return this;
        },
        less: function(n) {
          this.unput(this.match.slice(n));
        },
        pastInput: function() {
          var past = this.matched.substr(0, this.matched.length - this.match.length);
          return (past.length > 20 ? '...' : '') + past.substr(-20).replace(/\n/g, "");
        },
        upcomingInput: function() {
          var next = this.match;
          if (next.length < 20) {
            next += this._input.substr(0, 20 - next.length);
          }
          return (next.substr(0, 20) + (next.length > 20 ? '...' : '')).replace(/\n/g, "");
        },
        showPosition: function() {
          var pre = this.pastInput();
          var c = new Array(pre.length + 1).join("-");
          return pre + this.upcomingInput() + "\n" + c + "^";
        },
        next: function() {
          if (this.done) {
            return this.EOF;
          }
          if (!this._input)
            this.done = true;
          var token,
              match,
              tempMatch,
              index,
              col,
              lines;
          if (!this._more) {
            this.yytext = '';
            this.match = '';
          }
          var rules = this._currentRules();
          for (var i = 0; i < rules.length; i++) {
            tempMatch = this._input.match(this.rules[rules[i]]);
            if (tempMatch && (!match || tempMatch[0].length > match[0].length)) {
              match = tempMatch;
              index = i;
              if (!this.options.flex)
                break;
            }
          }
          if (match) {
            lines = match[0].match(/(?:\r\n?|\n).*/g);
            if (lines)
              this.yylineno += lines.length;
            this.yylloc = {
              first_line: this.yylloc.last_line,
              last_line: this.yylineno + 1,
              first_column: this.yylloc.last_column,
              last_column: lines ? lines[lines.length - 1].length - lines[lines.length - 1].match(/\r?\n?/)[0].length : this.yylloc.last_column + match[0].length
            };
            this.yytext += match[0];
            this.match += match[0];
            this.matches = match;
            this.yyleng = this.yytext.length;
            if (this.options.ranges) {
              this.yylloc.range = [this.offset, this.offset += this.yyleng];
            }
            this._more = false;
            this._input = this._input.slice(match[0].length);
            this.matched += match[0];
            token = this.performAction.call(this, this.yy, this, rules[index], this.conditionStack[this.conditionStack.length - 1]);
            if (this.done && this._input)
              this.done = false;
            if (token)
              return token;
            else
              return ;
          }
          if (this._input === "") {
            return this.EOF;
          } else {
            return this.parseError('Lexical error on line ' + (this.yylineno + 1) + '. Unrecognized text.\n' + this.showPosition(), {
              text: "",
              token: null,
              line: this.yylineno
            });
          }
        },
        lex: function lex() {
          var r = this.next();
          if (typeof r !== 'undefined') {
            return r;
          } else {
            return this.lex();
          }
        },
        begin: function begin(condition) {
          this.conditionStack.push(condition);
        },
        popState: function popState() {
          return this.conditionStack.pop();
        },
        _currentRules: function _currentRules() {
          return this.conditions[this.conditionStack[this.conditionStack.length - 1]].rules;
        },
        topState: function() {
          return this.conditionStack[this.conditionStack.length - 2];
        },
        pushState: function begin(condition) {
          this.begin(condition);
        }
      });
      lexer.options = {};
      lexer.performAction = function anonymous(yy, yy_, $avoiding_name_collisions, YY_START) {
        function strip(start, end) {
          return yy_.yytext = yy_.yytext.substr(start, yy_.yyleng - end);
        }
        var YYSTATE = YY_START;
        switch ($avoiding_name_collisions) {
          case 0:
            if (yy_.yytext.slice(-2) === "\\\\") {
              strip(0, 1);
              this.begin("mu");
            } else if (yy_.yytext.slice(-1) === "\\") {
              strip(0, 1);
              this.begin("emu");
            } else {
              this.begin("mu");
            }
            if (yy_.yytext)
              return 12;
            break;
          case 1:
            return 12;
            break;
          case 2:
            this.popState();
            return 12;
            break;
          case 3:
            yy_.yytext = yy_.yytext.substr(5, yy_.yyleng - 9);
            this.popState();
            return 15;
            break;
          case 4:
            return 12;
            break;
          case 5:
            strip(0, 4);
            this.popState();
            return 13;
            break;
          case 6:
            return 45;
            break;
          case 7:
            return 46;
            break;
          case 8:
            return 16;
            break;
          case 9:
            this.popState();
            this.begin('raw');
            return 18;
            break;
          case 10:
            return 34;
            break;
          case 11:
            return 24;
            break;
          case 12:
            return 29;
            break;
          case 13:
            this.popState();
            return 28;
            break;
          case 14:
            this.popState();
            return 28;
            break;
          case 15:
            return 26;
            break;
          case 16:
            return 26;
            break;
          case 17:
            return 32;
            break;
          case 18:
            return 31;
            break;
          case 19:
            this.popState();
            this.begin('com');
            break;
          case 20:
            strip(3, 5);
            this.popState();
            return 13;
            break;
          case 21:
            return 31;
            break;
          case 22:
            return 51;
            break;
          case 23:
            return 50;
            break;
          case 24:
            return 50;
            break;
          case 25:
            return 54;
            break;
          case 26:
            break;
          case 27:
            this.popState();
            return 33;
            break;
          case 28:
            this.popState();
            return 25;
            break;
          case 29:
            yy_.yytext = strip(1, 2).replace(/\\"/g, '"');
            return 42;
            break;
          case 30:
            yy_.yytext = strip(1, 2).replace(/\\'/g, "'");
            return 42;
            break;
          case 31:
            return 52;
            break;
          case 32:
            return 44;
            break;
          case 33:
            return 44;
            break;
          case 34:
            return 43;
            break;
          case 35:
            return 50;
            break;
          case 36:
            yy_.yytext = strip(1, 2);
            return 50;
            break;
          case 37:
            return 'INVALID';
            break;
          case 38:
            return 5;
            break;
        }
      };
      lexer.rules = [/^(?:[^\x00]*?(?=(\{\{)))/, /^(?:[^\x00]+)/, /^(?:[^\x00]{2,}?(?=(\{\{|\\\{\{|\\\\\{\{|$)))/, /^(?:\{\{\{\{\/[^\s!"#%-,\.\/;->@\[-\^`\{-~]+(?=[=}\s\/.])\}\}\}\})/, /^(?:[^\x00]*?(?=(\{\{\{\{\/)))/, /^(?:[\s\S]*?--\}\})/, /^(?:\()/, /^(?:\))/, /^(?:\{\{\{\{)/, /^(?:\}\}\}\})/, /^(?:\{\{(~)?>)/, /^(?:\{\{(~)?#)/, /^(?:\{\{(~)?\/)/, /^(?:\{\{(~)?\^\s*(~)?\}\})/, /^(?:\{\{(~)?\s*else\s*(~)?\}\})/, /^(?:\{\{(~)?\^)/, /^(?:\{\{(~)?\s*else\b)/, /^(?:\{\{(~)?\{)/, /^(?:\{\{(~)?&)/, /^(?:\{\{!--)/, /^(?:\{\{![\s\S]*?\}\})/, /^(?:\{\{(~)?)/, /^(?:=)/, /^(?:\.\.)/, /^(?:\.(?=([=~}\s\/.)])))/, /^(?:[\/.])/, /^(?:\s+)/, /^(?:\}(~)?\}\})/, /^(?:(~)?\}\})/, /^(?:"(\\["]|[^"])*")/, /^(?:'(\\[']|[^'])*')/, /^(?:@)/, /^(?:true(?=([~}\s)])))/, /^(?:false(?=([~}\s)])))/, /^(?:-?[0-9]+(?:\.[0-9]+)?(?=([~}\s)])))/, /^(?:([^\s!"#%-,\.\/;->@\[-\^`\{-~]+(?=([=~}\s\/.)]))))/, /^(?:\[[^\]]*\])/, /^(?:.)/, /^(?:$)/];
      lexer.conditions = {
        "mu": {
          "rules": [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38],
          "inclusive": false
        },
        "emu": {
          "rules": [2],
          "inclusive": false
        },
        "com": {
          "rules": [5],
          "inclusive": false
        },
        "raw": {
          "rules": [3, 4],
          "inclusive": false
        },
        "INITIAL": {
          "rules": [0, 1, 38],
          "inclusive": true
        }
      };
      return lexer;
    })();
    parser.lexer = lexer;
    function Parser() {
      this.yy = {};
    }
    Parser.prototype = parser;
    parser.Parser = Parser;
    return new Parser;
  })();
  exports["default"] = handlebars;
  global.define = __define;
  return module.exports;
});

System.register("npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/helpers", ["npm:handlebars@2.0.0/dist/cjs/handlebars/exception"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  "use strict";
  var Exception = require("npm:handlebars@2.0.0/dist/cjs/handlebars/exception")["default"];
  function stripFlags(open, close) {
    return {
      left: open.charAt(2) === '~',
      right: close.charAt(close.length - 3) === '~'
    };
  }
  exports.stripFlags = stripFlags;
  function prepareBlock(mustache, program, inverseAndProgram, close, inverted, locInfo) {
    if (mustache.sexpr.id.original !== close.path.original) {
      throw new Exception(mustache.sexpr.id.original + ' doesn\'t match ' + close.path.original, mustache);
    }
    var inverse = inverseAndProgram && inverseAndProgram.program;
    var strip = {
      left: mustache.strip.left,
      right: close.strip.right,
      openStandalone: isNextWhitespace(program.statements),
      closeStandalone: isPrevWhitespace((inverse || program).statements)
    };
    if (mustache.strip.right) {
      omitRight(program.statements, null, true);
    }
    if (inverse) {
      var inverseStrip = inverseAndProgram.strip;
      if (inverseStrip.left) {
        omitLeft(program.statements, null, true);
      }
      if (inverseStrip.right) {
        omitRight(inverse.statements, null, true);
      }
      if (close.strip.left) {
        omitLeft(inverse.statements, null, true);
      }
      if (isPrevWhitespace(program.statements) && isNextWhitespace(inverse.statements)) {
        omitLeft(program.statements);
        omitRight(inverse.statements);
      }
    } else {
      if (close.strip.left) {
        omitLeft(program.statements, null, true);
      }
    }
    if (inverted) {
      return new this.BlockNode(mustache, inverse, program, strip, locInfo);
    } else {
      return new this.BlockNode(mustache, program, inverse, strip, locInfo);
    }
  }
  exports.prepareBlock = prepareBlock;
  function prepareProgram(statements, isRoot) {
    for (var i = 0,
        l = statements.length; i < l; i++) {
      var current = statements[i],
          strip = current.strip;
      if (!strip) {
        continue;
      }
      var _isPrevWhitespace = isPrevWhitespace(statements, i, isRoot, current.type === 'partial'),
          _isNextWhitespace = isNextWhitespace(statements, i, isRoot),
          openStandalone = strip.openStandalone && _isPrevWhitespace,
          closeStandalone = strip.closeStandalone && _isNextWhitespace,
          inlineStandalone = strip.inlineStandalone && _isPrevWhitespace && _isNextWhitespace;
      if (strip.right) {
        omitRight(statements, i, true);
      }
      if (strip.left) {
        omitLeft(statements, i, true);
      }
      if (inlineStandalone) {
        omitRight(statements, i);
        if (omitLeft(statements, i)) {
          if (current.type === 'partial') {
            current.indent = (/([ \t]+$)/).exec(statements[i - 1].original) ? RegExp.$1 : '';
          }
        }
      }
      if (openStandalone) {
        omitRight((current.program || current.inverse).statements);
        omitLeft(statements, i);
      }
      if (closeStandalone) {
        omitRight(statements, i);
        omitLeft((current.inverse || current.program).statements);
      }
    }
    return statements;
  }
  exports.prepareProgram = prepareProgram;
  function isPrevWhitespace(statements, i, isRoot) {
    if (i === undefined) {
      i = statements.length;
    }
    var prev = statements[i - 1],
        sibling = statements[i - 2];
    if (!prev) {
      return isRoot;
    }
    if (prev.type === 'content') {
      return (sibling || !isRoot ? (/\r?\n\s*?$/) : (/(^|\r?\n)\s*?$/)).test(prev.original);
    }
  }
  function isNextWhitespace(statements, i, isRoot) {
    if (i === undefined) {
      i = -1;
    }
    var next = statements[i + 1],
        sibling = statements[i + 2];
    if (!next) {
      return isRoot;
    }
    if (next.type === 'content') {
      return (sibling || !isRoot ? (/^\s*?\r?\n/) : (/^\s*?(\r?\n|$)/)).test(next.original);
    }
  }
  function omitRight(statements, i, multiple) {
    var current = statements[i == null ? 0 : i + 1];
    if (!current || current.type !== 'content' || (!multiple && current.rightStripped)) {
      return ;
    }
    var original = current.string;
    current.string = current.string.replace(multiple ? (/^\s+/) : (/^[ \t]*\r?\n?/), '');
    current.rightStripped = current.string !== original;
  }
  function omitLeft(statements, i, multiple) {
    var current = statements[i == null ? statements.length - 1 : i - 1];
    if (!current || current.type !== 'content' || (!multiple && current.leftStripped)) {
      return ;
    }
    var original = current.string;
    current.string = current.string.replace(multiple ? (/\s+$/) : (/[ \t]+$/), '');
    current.leftStripped = current.string !== original;
    return current.leftStripped;
  }
  global.define = __define;
  return module.exports;
});

System.register("npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/compiler", ["npm:handlebars@2.0.0/dist/cjs/handlebars/exception", "npm:handlebars@2.0.0/dist/cjs/handlebars/utils"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  "use strict";
  var Exception = require("npm:handlebars@2.0.0/dist/cjs/handlebars/exception")["default"];
  var isArray = require("npm:handlebars@2.0.0/dist/cjs/handlebars/utils").isArray;
  var slice = [].slice;
  function Compiler() {}
  exports.Compiler = Compiler;
  Compiler.prototype = {
    compiler: Compiler,
    equals: function(other) {
      var len = this.opcodes.length;
      if (other.opcodes.length !== len) {
        return false;
      }
      for (var i = 0; i < len; i++) {
        var opcode = this.opcodes[i],
            otherOpcode = other.opcodes[i];
        if (opcode.opcode !== otherOpcode.opcode || !argEquals(opcode.args, otherOpcode.args)) {
          return false;
        }
      }
      len = this.children.length;
      for (i = 0; i < len; i++) {
        if (!this.children[i].equals(other.children[i])) {
          return false;
        }
      }
      return true;
    },
    guid: 0,
    compile: function(program, options) {
      this.opcodes = [];
      this.children = [];
      this.depths = {list: []};
      this.options = options;
      this.stringParams = options.stringParams;
      this.trackIds = options.trackIds;
      var knownHelpers = this.options.knownHelpers;
      this.options.knownHelpers = {
        'helperMissing': true,
        'blockHelperMissing': true,
        'each': true,
        'if': true,
        'unless': true,
        'with': true,
        'log': true,
        'lookup': true
      };
      if (knownHelpers) {
        for (var name in knownHelpers) {
          this.options.knownHelpers[name] = knownHelpers[name];
        }
      }
      return this.accept(program);
    },
    accept: function(node) {
      return this[node.type](node);
    },
    program: function(program) {
      var statements = program.statements;
      for (var i = 0,
          l = statements.length; i < l; i++) {
        this.accept(statements[i]);
      }
      this.isSimple = l === 1;
      this.depths.list = this.depths.list.sort(function(a, b) {
        return a - b;
      });
      return this;
    },
    compileProgram: function(program) {
      var result = new this.compiler().compile(program, this.options);
      var guid = this.guid++,
          depth;
      this.usePartial = this.usePartial || result.usePartial;
      this.children[guid] = result;
      for (var i = 0,
          l = result.depths.list.length; i < l; i++) {
        depth = result.depths.list[i];
        if (depth < 2) {
          continue;
        } else {
          this.addDepth(depth - 1);
        }
      }
      return guid;
    },
    block: function(block) {
      var mustache = block.mustache,
          program = block.program,
          inverse = block.inverse;
      if (program) {
        program = this.compileProgram(program);
      }
      if (inverse) {
        inverse = this.compileProgram(inverse);
      }
      var sexpr = mustache.sexpr;
      var type = this.classifySexpr(sexpr);
      if (type === "helper") {
        this.helperSexpr(sexpr, program, inverse);
      } else if (type === "simple") {
        this.simpleSexpr(sexpr);
        this.opcode('pushProgram', program);
        this.opcode('pushProgram', inverse);
        this.opcode('emptyHash');
        this.opcode('blockValue', sexpr.id.original);
      } else {
        this.ambiguousSexpr(sexpr, program, inverse);
        this.opcode('pushProgram', program);
        this.opcode('pushProgram', inverse);
        this.opcode('emptyHash');
        this.opcode('ambiguousBlockValue');
      }
      this.opcode('append');
    },
    hash: function(hash) {
      var pairs = hash.pairs,
          i,
          l;
      this.opcode('pushHash');
      for (i = 0, l = pairs.length; i < l; i++) {
        this.pushParam(pairs[i][1]);
      }
      while (i--) {
        this.opcode('assignToHash', pairs[i][0]);
      }
      this.opcode('popHash');
    },
    partial: function(partial) {
      var partialName = partial.partialName;
      this.usePartial = true;
      if (partial.hash) {
        this.accept(partial.hash);
      } else {
        this.opcode('push', 'undefined');
      }
      if (partial.context) {
        this.accept(partial.context);
      } else {
        this.opcode('getContext', 0);
        this.opcode('pushContext');
      }
      this.opcode('invokePartial', partialName.name, partial.indent || '');
      this.opcode('append');
    },
    content: function(content) {
      if (content.string) {
        this.opcode('appendContent', content.string);
      }
    },
    mustache: function(mustache) {
      this.sexpr(mustache.sexpr);
      if (mustache.escaped && !this.options.noEscape) {
        this.opcode('appendEscaped');
      } else {
        this.opcode('append');
      }
    },
    ambiguousSexpr: function(sexpr, program, inverse) {
      var id = sexpr.id,
          name = id.parts[0],
          isBlock = program != null || inverse != null;
      this.opcode('getContext', id.depth);
      this.opcode('pushProgram', program);
      this.opcode('pushProgram', inverse);
      this.ID(id);
      this.opcode('invokeAmbiguous', name, isBlock);
    },
    simpleSexpr: function(sexpr) {
      var id = sexpr.id;
      if (id.type === 'DATA') {
        this.DATA(id);
      } else if (id.parts.length) {
        this.ID(id);
      } else {
        this.addDepth(id.depth);
        this.opcode('getContext', id.depth);
        this.opcode('pushContext');
      }
      this.opcode('resolvePossibleLambda');
    },
    helperSexpr: function(sexpr, program, inverse) {
      var params = this.setupFullMustacheParams(sexpr, program, inverse),
          id = sexpr.id,
          name = id.parts[0];
      if (this.options.knownHelpers[name]) {
        this.opcode('invokeKnownHelper', params.length, name);
      } else if (this.options.knownHelpersOnly) {
        throw new Exception("You specified knownHelpersOnly, but used the unknown helper " + name, sexpr);
      } else {
        id.falsy = true;
        this.ID(id);
        this.opcode('invokeHelper', params.length, id.original, id.isSimple);
      }
    },
    sexpr: function(sexpr) {
      var type = this.classifySexpr(sexpr);
      if (type === "simple") {
        this.simpleSexpr(sexpr);
      } else if (type === "helper") {
        this.helperSexpr(sexpr);
      } else {
        this.ambiguousSexpr(sexpr);
      }
    },
    ID: function(id) {
      this.addDepth(id.depth);
      this.opcode('getContext', id.depth);
      var name = id.parts[0];
      if (!name) {
        this.opcode('pushContext');
      } else {
        this.opcode('lookupOnContext', id.parts, id.falsy, id.isScoped);
      }
    },
    DATA: function(data) {
      this.options.data = true;
      this.opcode('lookupData', data.id.depth, data.id.parts);
    },
    STRING: function(string) {
      this.opcode('pushString', string.string);
    },
    NUMBER: function(number) {
      this.opcode('pushLiteral', number.number);
    },
    BOOLEAN: function(bool) {
      this.opcode('pushLiteral', bool.bool);
    },
    comment: function() {},
    opcode: function(name) {
      this.opcodes.push({
        opcode: name,
        args: slice.call(arguments, 1)
      });
    },
    addDepth: function(depth) {
      if (depth === 0) {
        return ;
      }
      if (!this.depths[depth]) {
        this.depths[depth] = true;
        this.depths.list.push(depth);
      }
    },
    classifySexpr: function(sexpr) {
      var isHelper = sexpr.isHelper;
      var isEligible = sexpr.eligibleHelper;
      var options = this.options;
      if (isEligible && !isHelper) {
        var name = sexpr.id.parts[0];
        if (options.knownHelpers[name]) {
          isHelper = true;
        } else if (options.knownHelpersOnly) {
          isEligible = false;
        }
      }
      if (isHelper) {
        return "helper";
      } else if (isEligible) {
        return "ambiguous";
      } else {
        return "simple";
      }
    },
    pushParams: function(params) {
      for (var i = 0,
          l = params.length; i < l; i++) {
        this.pushParam(params[i]);
      }
    },
    pushParam: function(val) {
      if (this.stringParams) {
        if (val.depth) {
          this.addDepth(val.depth);
        }
        this.opcode('getContext', val.depth || 0);
        this.opcode('pushStringParam', val.stringModeValue, val.type);
        if (val.type === 'sexpr') {
          this.sexpr(val);
        }
      } else {
        if (this.trackIds) {
          this.opcode('pushId', val.type, val.idName || val.stringModeValue);
        }
        this.accept(val);
      }
    },
    setupFullMustacheParams: function(sexpr, program, inverse) {
      var params = sexpr.params;
      this.pushParams(params);
      this.opcode('pushProgram', program);
      this.opcode('pushProgram', inverse);
      if (sexpr.hash) {
        this.hash(sexpr.hash);
      } else {
        this.opcode('emptyHash');
      }
      return params;
    }
  };
  function precompile(input, options, env) {
    if (input == null || (typeof input !== 'string' && input.constructor !== env.AST.ProgramNode)) {
      throw new Exception("You must pass a string or Handlebars AST to Handlebars.precompile. You passed " + input);
    }
    options = options || {};
    if (!('data' in options)) {
      options.data = true;
    }
    if (options.compat) {
      options.useDepths = true;
    }
    var ast = env.parse(input);
    var environment = new env.Compiler().compile(ast, options);
    return new env.JavaScriptCompiler().compile(environment, options);
  }
  exports.precompile = precompile;
  function compile(input, options, env) {
    if (input == null || (typeof input !== 'string' && input.constructor !== env.AST.ProgramNode)) {
      throw new Exception("You must pass a string or Handlebars AST to Handlebars.compile. You passed " + input);
    }
    options = options || {};
    if (!('data' in options)) {
      options.data = true;
    }
    if (options.compat) {
      options.useDepths = true;
    }
    var compiled;
    function compileInput() {
      var ast = env.parse(input);
      var environment = new env.Compiler().compile(ast, options);
      var templateSpec = new env.JavaScriptCompiler().compile(environment, options, undefined, true);
      return env.template(templateSpec);
    }
    var ret = function(context, options) {
      if (!compiled) {
        compiled = compileInput();
      }
      return compiled.call(this, context, options);
    };
    ret._setup = function(options) {
      if (!compiled) {
        compiled = compileInput();
      }
      return compiled._setup(options);
    };
    ret._child = function(i, data, depths) {
      if (!compiled) {
        compiled = compileInput();
      }
      return compiled._child(i, data, depths);
    };
    return ret;
  }
  exports.compile = compile;
  function argEquals(a, b) {
    if (a === b) {
      return true;
    }
    if (isArray(a) && isArray(b) && a.length === b.length) {
      for (var i = 0; i < a.length; i++) {
        if (!argEquals(a[i], b[i])) {
          return false;
        }
      }
      return true;
    }
  }
  global.define = __define;
  return module.exports;
});

System.register("npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/javascript-compiler", ["npm:handlebars@2.0.0/dist/cjs/handlebars/base", "npm:handlebars@2.0.0/dist/cjs/handlebars/base", "npm:handlebars@2.0.0/dist/cjs/handlebars/exception"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  "use strict";
  var COMPILER_REVISION = require("npm:handlebars@2.0.0/dist/cjs/handlebars/base").COMPILER_REVISION;
  var REVISION_CHANGES = require("npm:handlebars@2.0.0/dist/cjs/handlebars/base").REVISION_CHANGES;
  var Exception = require("npm:handlebars@2.0.0/dist/cjs/handlebars/exception")["default"];
  function Literal(value) {
    this.value = value;
  }
  function JavaScriptCompiler() {}
  JavaScriptCompiler.prototype = {
    nameLookup: function(parent, name) {
      if (JavaScriptCompiler.isValidJavaScriptVariableName(name)) {
        return parent + "." + name;
      } else {
        return parent + "['" + name + "']";
      }
    },
    depthedLookup: function(name) {
      this.aliases.lookup = 'this.lookup';
      return 'lookup(depths, "' + name + '")';
    },
    compilerInfo: function() {
      var revision = COMPILER_REVISION,
          versions = REVISION_CHANGES[revision];
      return [revision, versions];
    },
    appendToBuffer: function(string) {
      if (this.environment.isSimple) {
        return "return " + string + ";";
      } else {
        return {
          appendToBuffer: true,
          content: string,
          toString: function() {
            return "buffer += " + string + ";";
          }
        };
      }
    },
    initializeBuffer: function() {
      return this.quotedString("");
    },
    namespace: "Handlebars",
    compile: function(environment, options, context, asObject) {
      this.environment = environment;
      this.options = options;
      this.stringParams = this.options.stringParams;
      this.trackIds = this.options.trackIds;
      this.precompile = !asObject;
      this.name = this.environment.name;
      this.isChild = !!context;
      this.context = context || {
        programs: [],
        environments: []
      };
      this.preamble();
      this.stackSlot = 0;
      this.stackVars = [];
      this.aliases = {};
      this.registers = {list: []};
      this.hashes = [];
      this.compileStack = [];
      this.inlineStack = [];
      this.compileChildren(environment, options);
      this.useDepths = this.useDepths || environment.depths.list.length || this.options.compat;
      var opcodes = environment.opcodes,
          opcode,
          i,
          l;
      for (i = 0, l = opcodes.length; i < l; i++) {
        opcode = opcodes[i];
        this[opcode.opcode].apply(this, opcode.args);
      }
      this.pushSource('');
      if (this.stackSlot || this.inlineStack.length || this.compileStack.length) {
        throw new Exception('Compile completed with content left on stack');
      }
      var fn = this.createFunctionContext(asObject);
      if (!this.isChild) {
        var ret = {
          compiler: this.compilerInfo(),
          main: fn
        };
        var programs = this.context.programs;
        for (i = 0, l = programs.length; i < l; i++) {
          if (programs[i]) {
            ret[i] = programs[i];
          }
        }
        if (this.environment.usePartial) {
          ret.usePartial = true;
        }
        if (this.options.data) {
          ret.useData = true;
        }
        if (this.useDepths) {
          ret.useDepths = true;
        }
        if (this.options.compat) {
          ret.compat = true;
        }
        if (!asObject) {
          ret.compiler = JSON.stringify(ret.compiler);
          ret = this.objectLiteral(ret);
        }
        return ret;
      } else {
        return fn;
      }
    },
    preamble: function() {
      this.lastContext = 0;
      this.source = [];
    },
    createFunctionContext: function(asObject) {
      var varDeclarations = '';
      var locals = this.stackVars.concat(this.registers.list);
      if (locals.length > 0) {
        varDeclarations += ", " + locals.join(", ");
      }
      for (var alias in this.aliases) {
        if (this.aliases.hasOwnProperty(alias)) {
          varDeclarations += ', ' + alias + '=' + this.aliases[alias];
        }
      }
      var params = ["depth0", "helpers", "partials", "data"];
      if (this.useDepths) {
        params.push('depths');
      }
      var source = this.mergeSource(varDeclarations);
      if (asObject) {
        params.push(source);
        return Function.apply(this, params);
      } else {
        return 'function(' + params.join(',') + ') {\n  ' + source + '}';
      }
    },
    mergeSource: function(varDeclarations) {
      var source = '',
          buffer,
          appendOnly = !this.forceBuffer,
          appendFirst;
      for (var i = 0,
          len = this.source.length; i < len; i++) {
        var line = this.source[i];
        if (line.appendToBuffer) {
          if (buffer) {
            buffer = buffer + '\n    + ' + line.content;
          } else {
            buffer = line.content;
          }
        } else {
          if (buffer) {
            if (!source) {
              appendFirst = true;
              source = buffer + ';\n  ';
            } else {
              source += 'buffer += ' + buffer + ';\n  ';
            }
            buffer = undefined;
          }
          source += line + '\n  ';
          if (!this.environment.isSimple) {
            appendOnly = false;
          }
        }
      }
      if (appendOnly) {
        if (buffer || !source) {
          source += 'return ' + (buffer || '""') + ';\n';
        }
      } else {
        varDeclarations += ", buffer = " + (appendFirst ? '' : this.initializeBuffer());
        if (buffer) {
          source += 'return buffer + ' + buffer + ';\n';
        } else {
          source += 'return buffer;\n';
        }
      }
      if (varDeclarations) {
        source = 'var ' + varDeclarations.substring(2) + (appendFirst ? '' : ';\n  ') + source;
      }
      return source;
    },
    blockValue: function(name) {
      this.aliases.blockHelperMissing = 'helpers.blockHelperMissing';
      var params = [this.contextName(0)];
      this.setupParams(name, 0, params);
      var blockName = this.popStack();
      params.splice(1, 0, blockName);
      this.push('blockHelperMissing.call(' + params.join(', ') + ')');
    },
    ambiguousBlockValue: function() {
      this.aliases.blockHelperMissing = 'helpers.blockHelperMissing';
      var params = [this.contextName(0)];
      this.setupParams('', 0, params, true);
      this.flushInline();
      var current = this.topStack();
      params.splice(1, 0, current);
      this.pushSource("if (!" + this.lastHelper + ") { " + current + " = blockHelperMissing.call(" + params.join(", ") + "); }");
    },
    appendContent: function(content) {
      if (this.pendingContent) {
        content = this.pendingContent + content;
      }
      this.pendingContent = content;
    },
    append: function() {
      this.flushInline();
      var local = this.popStack();
      this.pushSource('if (' + local + ' != null) { ' + this.appendToBuffer(local) + ' }');
      if (this.environment.isSimple) {
        this.pushSource("else { " + this.appendToBuffer("''") + " }");
      }
    },
    appendEscaped: function() {
      this.aliases.escapeExpression = 'this.escapeExpression';
      this.pushSource(this.appendToBuffer("escapeExpression(" + this.popStack() + ")"));
    },
    getContext: function(depth) {
      this.lastContext = depth;
    },
    pushContext: function() {
      this.pushStackLiteral(this.contextName(this.lastContext));
    },
    lookupOnContext: function(parts, falsy, scoped) {
      var i = 0,
          len = parts.length;
      if (!scoped && this.options.compat && !this.lastContext) {
        this.push(this.depthedLookup(parts[i++]));
      } else {
        this.pushContext();
      }
      for (; i < len; i++) {
        this.replaceStack(function(current) {
          var lookup = this.nameLookup(current, parts[i], 'context');
          if (!falsy) {
            return ' != null ? ' + lookup + ' : ' + current;
          } else {
            return ' && ' + lookup;
          }
        });
      }
    },
    lookupData: function(depth, parts) {
      if (!depth) {
        this.pushStackLiteral('data');
      } else {
        this.pushStackLiteral('this.data(data, ' + depth + ')');
      }
      var len = parts.length;
      for (var i = 0; i < len; i++) {
        this.replaceStack(function(current) {
          return ' && ' + this.nameLookup(current, parts[i], 'data');
        });
      }
    },
    resolvePossibleLambda: function() {
      this.aliases.lambda = 'this.lambda';
      this.push('lambda(' + this.popStack() + ', ' + this.contextName(0) + ')');
    },
    pushStringParam: function(string, type) {
      this.pushContext();
      this.pushString(type);
      if (type !== 'sexpr') {
        if (typeof string === 'string') {
          this.pushString(string);
        } else {
          this.pushStackLiteral(string);
        }
      }
    },
    emptyHash: function() {
      this.pushStackLiteral('{}');
      if (this.trackIds) {
        this.push('{}');
      }
      if (this.stringParams) {
        this.push('{}');
        this.push('{}');
      }
    },
    pushHash: function() {
      if (this.hash) {
        this.hashes.push(this.hash);
      }
      this.hash = {
        values: [],
        types: [],
        contexts: [],
        ids: []
      };
    },
    popHash: function() {
      var hash = this.hash;
      this.hash = this.hashes.pop();
      if (this.trackIds) {
        this.push('{' + hash.ids.join(',') + '}');
      }
      if (this.stringParams) {
        this.push('{' + hash.contexts.join(',') + '}');
        this.push('{' + hash.types.join(',') + '}');
      }
      this.push('{\n    ' + hash.values.join(',\n    ') + '\n  }');
    },
    pushString: function(string) {
      this.pushStackLiteral(this.quotedString(string));
    },
    push: function(expr) {
      this.inlineStack.push(expr);
      return expr;
    },
    pushLiteral: function(value) {
      this.pushStackLiteral(value);
    },
    pushProgram: function(guid) {
      if (guid != null) {
        this.pushStackLiteral(this.programExpression(guid));
      } else {
        this.pushStackLiteral(null);
      }
    },
    invokeHelper: function(paramSize, name, isSimple) {
      this.aliases.helperMissing = 'helpers.helperMissing';
      var nonHelper = this.popStack();
      var helper = this.setupHelper(paramSize, name);
      var lookup = (isSimple ? helper.name + ' || ' : '') + nonHelper + ' || helperMissing';
      this.push('((' + lookup + ').call(' + helper.callParams + '))');
    },
    invokeKnownHelper: function(paramSize, name) {
      var helper = this.setupHelper(paramSize, name);
      this.push(helper.name + ".call(" + helper.callParams + ")");
    },
    invokeAmbiguous: function(name, helperCall) {
      this.aliases.functionType = '"function"';
      this.aliases.helperMissing = 'helpers.helperMissing';
      this.useRegister('helper');
      var nonHelper = this.popStack();
      this.emptyHash();
      var helper = this.setupHelper(0, name, helperCall);
      var helperName = this.lastHelper = this.nameLookup('helpers', name, 'helper');
      this.push('((helper = (helper = ' + helperName + ' || ' + nonHelper + ') != null ? helper : helperMissing' + (helper.paramsInit ? '),(' + helper.paramsInit : '') + '),' + '(typeof helper === functionType ? helper.call(' + helper.callParams + ') : helper))');
    },
    invokePartial: function(name, indent) {
      var params = [this.nameLookup('partials', name, 'partial'), "'" + indent + "'", "'" + name + "'", this.popStack(), this.popStack(), "helpers", "partials"];
      if (this.options.data) {
        params.push("data");
      } else if (this.options.compat) {
        params.push('undefined');
      }
      if (this.options.compat) {
        params.push('depths');
      }
      this.push("this.invokePartial(" + params.join(", ") + ")");
    },
    assignToHash: function(key) {
      var value = this.popStack(),
          context,
          type,
          id;
      if (this.trackIds) {
        id = this.popStack();
      }
      if (this.stringParams) {
        type = this.popStack();
        context = this.popStack();
      }
      var hash = this.hash;
      if (context) {
        hash.contexts.push("'" + key + "': " + context);
      }
      if (type) {
        hash.types.push("'" + key + "': " + type);
      }
      if (id) {
        hash.ids.push("'" + key + "': " + id);
      }
      hash.values.push("'" + key + "': (" + value + ")");
    },
    pushId: function(type, name) {
      if (type === 'ID' || type === 'DATA') {
        this.pushString(name);
      } else if (type === 'sexpr') {
        this.pushStackLiteral('true');
      } else {
        this.pushStackLiteral('null');
      }
    },
    compiler: JavaScriptCompiler,
    compileChildren: function(environment, options) {
      var children = environment.children,
          child,
          compiler;
      for (var i = 0,
          l = children.length; i < l; i++) {
        child = children[i];
        compiler = new this.compiler();
        var index = this.matchExistingProgram(child);
        if (index == null) {
          this.context.programs.push('');
          index = this.context.programs.length;
          child.index = index;
          child.name = 'program' + index;
          this.context.programs[index] = compiler.compile(child, options, this.context, !this.precompile);
          this.context.environments[index] = child;
          this.useDepths = this.useDepths || compiler.useDepths;
        } else {
          child.index = index;
          child.name = 'program' + index;
        }
      }
    },
    matchExistingProgram: function(child) {
      for (var i = 0,
          len = this.context.environments.length; i < len; i++) {
        var environment = this.context.environments[i];
        if (environment && environment.equals(child)) {
          return i;
        }
      }
    },
    programExpression: function(guid) {
      var child = this.environment.children[guid],
          depths = child.depths.list,
          useDepths = this.useDepths,
          depth;
      var programParams = [child.index, 'data'];
      if (useDepths) {
        programParams.push('depths');
      }
      return 'this.program(' + programParams.join(', ') + ')';
    },
    useRegister: function(name) {
      if (!this.registers[name]) {
        this.registers[name] = true;
        this.registers.list.push(name);
      }
    },
    pushStackLiteral: function(item) {
      return this.push(new Literal(item));
    },
    pushSource: function(source) {
      if (this.pendingContent) {
        this.source.push(this.appendToBuffer(this.quotedString(this.pendingContent)));
        this.pendingContent = undefined;
      }
      if (source) {
        this.source.push(source);
      }
    },
    pushStack: function(item) {
      this.flushInline();
      var stack = this.incrStack();
      this.pushSource(stack + " = " + item + ";");
      this.compileStack.push(stack);
      return stack;
    },
    replaceStack: function(callback) {
      var prefix = '',
          inline = this.isInline(),
          stack,
          createdStack,
          usedLiteral;
      if (!this.isInline()) {
        throw new Exception('replaceStack on non-inline');
      }
      var top = this.popStack(true);
      if (top instanceof Literal) {
        prefix = stack = top.value;
        usedLiteral = true;
      } else {
        createdStack = !this.stackSlot;
        var name = !createdStack ? this.topStackName() : this.incrStack();
        prefix = '(' + this.push(name) + ' = ' + top + ')';
        stack = this.topStack();
      }
      var item = callback.call(this, stack);
      if (!usedLiteral) {
        this.popStack();
      }
      if (createdStack) {
        this.stackSlot--;
      }
      this.push('(' + prefix + item + ')');
    },
    incrStack: function() {
      this.stackSlot++;
      if (this.stackSlot > this.stackVars.length) {
        this.stackVars.push("stack" + this.stackSlot);
      }
      return this.topStackName();
    },
    topStackName: function() {
      return "stack" + this.stackSlot;
    },
    flushInline: function() {
      var inlineStack = this.inlineStack;
      if (inlineStack.length) {
        this.inlineStack = [];
        for (var i = 0,
            len = inlineStack.length; i < len; i++) {
          var entry = inlineStack[i];
          if (entry instanceof Literal) {
            this.compileStack.push(entry);
          } else {
            this.pushStack(entry);
          }
        }
      }
    },
    isInline: function() {
      return this.inlineStack.length;
    },
    popStack: function(wrapped) {
      var inline = this.isInline(),
          item = (inline ? this.inlineStack : this.compileStack).pop();
      if (!wrapped && (item instanceof Literal)) {
        return item.value;
      } else {
        if (!inline) {
          if (!this.stackSlot) {
            throw new Exception('Invalid stack pop');
          }
          this.stackSlot--;
        }
        return item;
      }
    },
    topStack: function() {
      var stack = (this.isInline() ? this.inlineStack : this.compileStack),
          item = stack[stack.length - 1];
      if (item instanceof Literal) {
        return item.value;
      } else {
        return item;
      }
    },
    contextName: function(context) {
      if (this.useDepths && context) {
        return 'depths[' + context + ']';
      } else {
        return 'depth' + context;
      }
    },
    quotedString: function(str) {
      return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + '"';
    },
    objectLiteral: function(obj) {
      var pairs = [];
      for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
          pairs.push(this.quotedString(key) + ':' + obj[key]);
        }
      }
      return '{' + pairs.join(',') + '}';
    },
    setupHelper: function(paramSize, name, blockHelper) {
      var params = [],
          paramsInit = this.setupParams(name, paramSize, params, blockHelper);
      var foundHelper = this.nameLookup('helpers', name, 'helper');
      return {
        params: params,
        paramsInit: paramsInit,
        name: foundHelper,
        callParams: [this.contextName(0)].concat(params).join(", ")
      };
    },
    setupOptions: function(helper, paramSize, params) {
      var options = {},
          contexts = [],
          types = [],
          ids = [],
          param,
          inverse,
          program;
      options.name = this.quotedString(helper);
      options.hash = this.popStack();
      if (this.trackIds) {
        options.hashIds = this.popStack();
      }
      if (this.stringParams) {
        options.hashTypes = this.popStack();
        options.hashContexts = this.popStack();
      }
      inverse = this.popStack();
      program = this.popStack();
      if (program || inverse) {
        if (!program) {
          program = 'this.noop';
        }
        if (!inverse) {
          inverse = 'this.noop';
        }
        options.fn = program;
        options.inverse = inverse;
      }
      var i = paramSize;
      while (i--) {
        param = this.popStack();
        params[i] = param;
        if (this.trackIds) {
          ids[i] = this.popStack();
        }
        if (this.stringParams) {
          types[i] = this.popStack();
          contexts[i] = this.popStack();
        }
      }
      if (this.trackIds) {
        options.ids = "[" + ids.join(",") + "]";
      }
      if (this.stringParams) {
        options.types = "[" + types.join(",") + "]";
        options.contexts = "[" + contexts.join(",") + "]";
      }
      if (this.options.data) {
        options.data = "data";
      }
      return options;
    },
    setupParams: function(helperName, paramSize, params, useRegister) {
      var options = this.objectLiteral(this.setupOptions(helperName, paramSize, params));
      if (useRegister) {
        this.useRegister('options');
        params.push('options');
        return 'options=' + options;
      } else {
        params.push(options);
        return '';
      }
    }
  };
  var reservedWords = ("break else new var" + " case finally return void" + " catch for switch while" + " continue function this with" + " default if throw" + " delete in try" + " do instanceof typeof" + " abstract enum int short" + " boolean export interface static" + " byte extends long super" + " char final native synchronized" + " class float package throws" + " const goto private transient" + " debugger implements protected volatile" + " double import public let yield").split(" ");
  var compilerWords = JavaScriptCompiler.RESERVED_WORDS = {};
  for (var i = 0,
      l = reservedWords.length; i < l; i++) {
    compilerWords[reservedWords[i]] = true;
  }
  JavaScriptCompiler.isValidJavaScriptVariableName = function(name) {
    return !JavaScriptCompiler.RESERVED_WORDS[name] && /^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(name);
  };
  exports["default"] = JavaScriptCompiler;
  global.define = __define;
  return module.exports;
});

System.register("npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/visitor", [], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  "use strict";
  function Visitor() {}
  Visitor.prototype = {
    constructor: Visitor,
    accept: function(object) {
      return this[object.type](object);
    }
  };
  exports["default"] = Visitor;
  global.define = __define;
  return module.exports;
});

System.register("npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/printer", ["npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/visitor"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  "use strict";
  var Visitor = require("npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/visitor")["default"];
  function print(ast) {
    return new PrintVisitor().accept(ast);
  }
  exports.print = print;
  function PrintVisitor() {
    this.padding = 0;
  }
  exports.PrintVisitor = PrintVisitor;
  PrintVisitor.prototype = new Visitor();
  PrintVisitor.prototype.pad = function(string) {
    var out = "";
    for (var i = 0,
        l = this.padding; i < l; i++) {
      out = out + "  ";
    }
    out = out + string + "\n";
    return out;
  };
  PrintVisitor.prototype.program = function(program) {
    var out = "",
        statements = program.statements,
        i,
        l;
    for (i = 0, l = statements.length; i < l; i++) {
      out = out + this.accept(statements[i]);
    }
    this.padding--;
    return out;
  };
  PrintVisitor.prototype.block = function(block) {
    var out = "";
    out = out + this.pad("BLOCK:");
    this.padding++;
    out = out + this.accept(block.mustache);
    if (block.program) {
      out = out + this.pad("PROGRAM:");
      this.padding++;
      out = out + this.accept(block.program);
      this.padding--;
    }
    if (block.inverse) {
      if (block.program) {
        this.padding++;
      }
      out = out + this.pad("{{^}}");
      this.padding++;
      out = out + this.accept(block.inverse);
      this.padding--;
      if (block.program) {
        this.padding--;
      }
    }
    this.padding--;
    return out;
  };
  PrintVisitor.prototype.sexpr = function(sexpr) {
    var params = sexpr.params,
        paramStrings = [],
        hash;
    for (var i = 0,
        l = params.length; i < l; i++) {
      paramStrings.push(this.accept(params[i]));
    }
    params = "[" + paramStrings.join(", ") + "]";
    hash = sexpr.hash ? " " + this.accept(sexpr.hash) : "";
    return this.accept(sexpr.id) + " " + params + hash;
  };
  PrintVisitor.prototype.mustache = function(mustache) {
    return this.pad("{{ " + this.accept(mustache.sexpr) + " }}");
  };
  PrintVisitor.prototype.partial = function(partial) {
    var content = this.accept(partial.partialName);
    if (partial.context) {
      content += " " + this.accept(partial.context);
    }
    if (partial.hash) {
      content += " " + this.accept(partial.hash);
    }
    return this.pad("{{> " + content + " }}");
  };
  PrintVisitor.prototype.hash = function(hash) {
    var pairs = hash.pairs;
    var joinedPairs = [],
        left,
        right;
    for (var i = 0,
        l = pairs.length; i < l; i++) {
      left = pairs[i][0];
      right = this.accept(pairs[i][1]);
      joinedPairs.push(left + "=" + right);
    }
    return "HASH{" + joinedPairs.join(", ") + "}";
  };
  PrintVisitor.prototype.STRING = function(string) {
    return '"' + string.string + '"';
  };
  PrintVisitor.prototype.NUMBER = function(number) {
    return "NUMBER{" + number.number + "}";
  };
  PrintVisitor.prototype.BOOLEAN = function(bool) {
    return "BOOLEAN{" + bool.bool + "}";
  };
  PrintVisitor.prototype.ID = function(id) {
    var path = id.parts.join("/");
    if (id.parts.length > 1) {
      return "PATH:" + path;
    } else {
      return "ID:" + path;
    }
  };
  PrintVisitor.prototype.PARTIAL_NAME = function(partialName) {
    return "PARTIAL:" + partialName.name;
  };
  PrintVisitor.prototype.DATA = function(data) {
    return "@" + this.accept(data.id);
  };
  PrintVisitor.prototype.content = function(content) {
    return this.pad("CONTENT[ '" + content.string + "' ]");
  };
  PrintVisitor.prototype.comment = function(comment) {
    return this.pad("{{! '" + comment.comment + "' }}");
  };
  global.define = __define;
  return module.exports;
});

System.register("github:jspm/nodelibs-fs@0.1.2/index", [], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  if (System._nodeRequire) {
    module.exports = System._nodeRequire('fs');
  } else {
    exports.readFileSync = function(address) {
      var output;
      var xhr = new XMLHttpRequest();
      xhr.open('GET', address, false);
      xhr.onreadystatechange = function(e) {
        if (xhr.readyState == 4) {
          var status = xhr.status;
          if ((status > 399 && status < 600) || status == 400) {
            throw 'File read error on ' + address;
          } else
            output = xhr.responseText;
        }
      };
      xhr.send(null);
      return output;
    };
  }
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.fw", [], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = function($) {
    $.FW = true;
    $.path = $.g;
    return $;
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.dom-create", ["npm:core-js@0.9.6/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$"),
      document = $.g.document,
      isObject = $.isObject,
      is = isObject(document) && isObject(document.createElement);
  module.exports = function(it) {
    return is ? document.createElement(it) : {};
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.uid", ["npm:core-js@0.9.6/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var sid = 0;
  function uid(key) {
    return 'Symbol(' + key + ')_' + (++sid + Math.random()).toString(36);
  }
  uid.safe = require("npm:core-js@0.9.6/modules/$").g.Symbol || uid;
  module.exports = uid;
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.def", ["npm:core-js@0.9.6/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$"),
      global = $.g,
      core = $.core,
      isFunction = $.isFunction;
  function ctx(fn, that) {
    return function() {
      return fn.apply(that, arguments);
    };
  }
  global.core = core;
  $def.F = 1;
  $def.G = 2;
  $def.S = 4;
  $def.P = 8;
  $def.B = 16;
  $def.W = 32;
  function $def(type, name, source) {
    var key,
        own,
        out,
        exp,
        isGlobal = type & $def.G,
        target = isGlobal ? global : type & $def.S ? global[name] : (global[name] || {}).prototype,
        exports = isGlobal ? core : core[name] || (core[name] = {});
    if (isGlobal)
      source = name;
    for (key in source) {
      own = !(type & $def.F) && target && key in target;
      out = (own ? target : source)[key];
      if (type & $def.B && own)
        exp = ctx(out, global);
      else
        exp = type & $def.P && isFunction(out) ? ctx(Function.call, out) : out;
      if (target && !own) {
        if (isGlobal)
          target[key] = out;
        else
          delete target[key] && $.hide(target, key, out);
      }
      if (exports[key] != out)
        $.hide(exports, key, exp);
    }
  }
  module.exports = $def;
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.invoke", [], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = function(fn, args, that) {
    var un = that === undefined;
    switch (args.length) {
      case 0:
        return un ? fn() : fn.call(that);
      case 1:
        return un ? fn(args[0]) : fn.call(that, args[0]);
      case 2:
        return un ? fn(args[0], args[1]) : fn.call(that, args[0], args[1]);
      case 3:
        return un ? fn(args[0], args[1], args[2]) : fn.call(that, args[0], args[1], args[2]);
      case 4:
        return un ? fn(args[0], args[1], args[2], args[3]) : fn.call(that, args[0], args[1], args[2], args[3]);
      case 5:
        return un ? fn(args[0], args[1], args[2], args[3], args[4]) : fn.call(that, args[0], args[1], args[2], args[3], args[4]);
    }
    return fn.apply(that, args);
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.assert", ["npm:core-js@0.9.6/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$");
  function assert(condition, msg1, msg2) {
    if (!condition)
      throw TypeError(msg2 ? msg1 + msg2 : msg1);
  }
  assert.def = $.assertDefined;
  assert.fn = function(it) {
    if (!$.isFunction(it))
      throw TypeError(it + ' is not a function!');
    return it;
  };
  assert.obj = function(it) {
    if (!$.isObject(it))
      throw TypeError(it + ' is not an object!');
    return it;
  };
  assert.inst = function(it, Constructor, name) {
    if (!(it instanceof Constructor))
      throw TypeError(name + ": use the 'new' operator!");
    return it;
  };
  module.exports = assert;
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.array-includes", ["npm:core-js@0.9.6/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$");
  module.exports = function(IS_INCLUDES) {
    return function($this, el, fromIndex) {
      var O = $.toObject($this),
          length = $.toLength(O.length),
          index = $.toIndex(fromIndex, length),
          value;
      if (IS_INCLUDES && el != el)
        while (length > index) {
          value = O[index++];
          if (value != value)
            return true;
        }
      else
        for (; length > index; index++)
          if (IS_INCLUDES || index in O) {
            if (O[index] === el)
              return IS_INCLUDES || index;
          }
      return !IS_INCLUDES && -1;
    };
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.replacer", [], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  module.exports = function(regExp, replace, isStatic) {
    var replacer = replace === Object(replace) ? function(part) {
      return replace[part];
    } : replace;
    return function(it) {
      return String(isStatic ? it : this).replace(regExp, replacer);
    };
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.throws", [], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = function(exec) {
    try {
      exec();
      return false;
    } catch (e) {
      return true;
    }
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.keyof", ["npm:core-js@0.9.6/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$");
  module.exports = function(object, el) {
    var O = $.toObject(object),
        keys = $.getKeys(O),
        length = keys.length,
        index = 0,
        key;
    while (length > index)
      if (O[key = keys[index++]] === el)
        return key;
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.enum-keys", ["npm:core-js@0.9.6/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$");
  module.exports = function(it) {
    var keys = $.getKeys(it),
        getDesc = $.getDesc,
        getSymbols = $.getSymbols;
    if (getSymbols)
      $.each.call(getSymbols(it), function(key) {
        if (getDesc(it, key).enumerable)
          keys.push(key);
      });
    return keys;
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.assign", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.enum-keys"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$"),
      enumKeys = require("npm:core-js@0.9.6/modules/$.enum-keys");
  module.exports = Object.assign || function assign(target, source) {
    var T = Object($.assertDefined(target)),
        l = arguments.length,
        i = 1;
    while (l > i) {
      var S = $.ES5Object(arguments[i++]),
          keys = enumKeys(S),
          length = keys.length,
          j = 0,
          key;
      while (length > j)
        T[key = keys[j++]] = S[key];
    }
    return T;
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.object.is", ["npm:core-js@0.9.6/modules/$.def"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $def = require("npm:core-js@0.9.6/modules/$.def");
  $def($def.S, 'Object', {is: function is(x, y) {
      return x === y ? x !== 0 || 1 / x === 1 / y : x != x && y != y;
    }});
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.set-proto", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.assert", "npm:core-js@0.9.6/modules/$.ctx"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$"),
      assert = require("npm:core-js@0.9.6/modules/$.assert");
  function check(O, proto) {
    assert.obj(O);
    assert(proto === null || $.isObject(proto), proto, ": can't set as prototype!");
  }
  module.exports = {
    set: Object.setPrototypeOf || ('__proto__' in {} ? function(buggy, set) {
      try {
        set = require("npm:core-js@0.9.6/modules/$.ctx")(Function.call, $.getDesc(Object.prototype, '__proto__').set, 2);
        set({}, []);
      } catch (e) {
        buggy = true;
      }
      return function setPrototypeOf(O, proto) {
        check(O, proto);
        if (buggy)
          O.__proto__ = proto;
        else
          set(O, proto);
        return O;
      };
    }() : undefined),
    check: check
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.object.to-string", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.cof", "npm:core-js@0.9.6/modules/$.wks"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = require("npm:core-js@0.9.6/modules/$"),
      cof = require("npm:core-js@0.9.6/modules/$.cof"),
      tmp = {};
  tmp[require("npm:core-js@0.9.6/modules/$.wks")('toStringTag')] = 'z';
  if ($.FW && cof(tmp) != 'z')
    $.hide(Object.prototype, 'toString', function toString() {
      return '[object ' + cof.classof(this) + ']';
    });
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.object.statics-accept-primitives", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.def"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$"),
      $def = require("npm:core-js@0.9.6/modules/$.def"),
      isObject = $.isObject,
      toObject = $.toObject;
  function wrapObjectMethod(METHOD, MODE) {
    var fn = ($.core.Object || {})[METHOD] || Object[METHOD],
        f = 0,
        o = {};
    o[METHOD] = MODE == 1 ? function(it) {
      return isObject(it) ? fn(it) : it;
    } : MODE == 2 ? function(it) {
      return isObject(it) ? fn(it) : true;
    } : MODE == 3 ? function(it) {
      return isObject(it) ? fn(it) : false;
    } : MODE == 4 ? function getOwnPropertyDescriptor(it, key) {
      return fn(toObject(it), key);
    } : MODE == 5 ? function getPrototypeOf(it) {
      return fn(Object($.assertDefined(it)));
    } : function(it) {
      return fn(toObject(it));
    };
    try {
      fn('z');
    } catch (e) {
      f = 1;
    }
    $def($def.S + $def.F * f, 'Object', o);
  }
  wrapObjectMethod('freeze', 1);
  wrapObjectMethod('seal', 1);
  wrapObjectMethod('preventExtensions', 1);
  wrapObjectMethod('isFrozen', 2);
  wrapObjectMethod('isSealed', 2);
  wrapObjectMethod('isExtensible', 3);
  wrapObjectMethod('getOwnPropertyDescriptor', 4);
  wrapObjectMethod('getPrototypeOf', 5);
  wrapObjectMethod('keys');
  wrapObjectMethod('getOwnPropertyNames');
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.function.name", ["npm:core-js@0.9.6/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = require("npm:core-js@0.9.6/modules/$"),
      NAME = 'name',
      setDesc = $.setDesc,
      FunctionProto = Function.prototype;
  NAME in FunctionProto || $.FW && $.DESC && setDesc(FunctionProto, NAME, {
    configurable: true,
    get: function() {
      var match = String(this).match(/^\s*function ([^ (]*)/),
          name = match ? match[1] : '';
      $.has(this, NAME) || setDesc(this, NAME, $.desc(5, name));
      return name;
    },
    set: function(value) {
      $.has(this, NAME) || setDesc(this, NAME, $.desc(0, value));
    }
  });
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.function.has-instance", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.wks"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$"),
      HAS_INSTANCE = require("npm:core-js@0.9.6/modules/$.wks")('hasInstance'),
      FunctionProto = Function.prototype;
  if (!(HAS_INSTANCE in FunctionProto))
    $.setDesc(FunctionProto, HAS_INSTANCE, {value: function(O) {
        if (!$.isFunction(this) || !$.isObject(O))
          return false;
        if (!$.isObject(this.prototype))
          return O instanceof this;
        while (O = $.getProto(O))
          if (this.prototype === O)
            return true;
        return false;
      }});
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.number.constructor", ["npm:core-js@0.9.6/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = require("npm:core-js@0.9.6/modules/$"),
      isObject = $.isObject,
      isFunction = $.isFunction,
      NUMBER = 'Number',
      $Number = $.g[NUMBER],
      Base = $Number,
      proto = $Number.prototype;
  function toPrimitive(it) {
    var fn,
        val;
    if (isFunction(fn = it.valueOf) && !isObject(val = fn.call(it)))
      return val;
    if (isFunction(fn = it.toString) && !isObject(val = fn.call(it)))
      return val;
    throw TypeError("Can't convert object to number");
  }
  function toNumber(it) {
    if (isObject(it))
      it = toPrimitive(it);
    if (typeof it == 'string' && it.length > 2 && it.charCodeAt(0) == 48) {
      var binary = false;
      switch (it.charCodeAt(1)) {
        case 66:
        case 98:
          binary = true;
        case 79:
        case 111:
          return parseInt(it.slice(2), binary ? 2 : 8);
      }
    }
    return +it;
  }
  if ($.FW && !($Number('0o1') && $Number('0b1'))) {
    $Number = function Number(it) {
      return this instanceof $Number ? new Base(toNumber(it)) : toNumber(it);
    };
    $.each.call($.DESC ? $.getNames(Base) : ('MAX_VALUE,MIN_VALUE,NaN,NEGATIVE_INFINITY,POSITIVE_INFINITY,' + 'EPSILON,isFinite,isInteger,isNaN,isSafeInteger,MAX_SAFE_INTEGER,' + 'MIN_SAFE_INTEGER,parseFloat,parseInt,isInteger').split(','), function(key) {
      if ($.has(Base, key) && !$.has($Number, key)) {
        $.setDesc($Number, key, $.getDesc(Base, key));
      }
    });
    $Number.prototype = proto;
    proto.constructor = $Number;
    $.hide($.g, NUMBER, $Number);
  }
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.number.statics", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.def"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$"),
      $def = require("npm:core-js@0.9.6/modules/$.def"),
      abs = Math.abs,
      floor = Math.floor,
      _isFinite = $.g.isFinite,
      MAX_SAFE_INTEGER = 0x1fffffffffffff;
  function isInteger(it) {
    return !$.isObject(it) && _isFinite(it) && floor(it) === it;
  }
  $def($def.S, 'Number', {
    EPSILON: Math.pow(2, -52),
    isFinite: function isFinite(it) {
      return typeof it == 'number' && _isFinite(it);
    },
    isInteger: isInteger,
    isNaN: function isNaN(number) {
      return number != number;
    },
    isSafeInteger: function isSafeInteger(number) {
      return isInteger(number) && abs(number) <= MAX_SAFE_INTEGER;
    },
    MAX_SAFE_INTEGER: MAX_SAFE_INTEGER,
    MIN_SAFE_INTEGER: -MAX_SAFE_INTEGER,
    parseFloat: parseFloat,
    parseInt: parseInt
  });
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.math", ["npm:core-js@0.9.6/modules/$.def"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var Infinity = 1 / 0,
      $def = require("npm:core-js@0.9.6/modules/$.def"),
      E = Math.E,
      pow = Math.pow,
      abs = Math.abs,
      exp = Math.exp,
      log = Math.log,
      sqrt = Math.sqrt,
      ceil = Math.ceil,
      floor = Math.floor,
      EPSILON = pow(2, -52),
      EPSILON32 = pow(2, -23),
      MAX32 = pow(2, 127) * (2 - EPSILON32),
      MIN32 = pow(2, -126);
  function roundTiesToEven(n) {
    return n + 1 / EPSILON - 1 / EPSILON;
  }
  function sign(x) {
    return (x = +x) == 0 || x != x ? x : x < 0 ? -1 : 1;
  }
  function asinh(x) {
    return !isFinite(x = +x) || x == 0 ? x : x < 0 ? -asinh(-x) : log(x + sqrt(x * x + 1));
  }
  function expm1(x) {
    return (x = +x) == 0 ? x : x > -1e-6 && x < 1e-6 ? x + x * x / 2 : exp(x) - 1;
  }
  $def($def.S, 'Math', {
    acosh: function acosh(x) {
      return (x = +x) < 1 ? NaN : isFinite(x) ? log(x / E + sqrt(x + 1) * sqrt(x - 1) / E) + 1 : x;
    },
    asinh: asinh,
    atanh: function atanh(x) {
      return (x = +x) == 0 ? x : log((1 + x) / (1 - x)) / 2;
    },
    cbrt: function cbrt(x) {
      return sign(x = +x) * pow(abs(x), 1 / 3);
    },
    clz32: function clz32(x) {
      return (x >>>= 0) ? 31 - floor(log(x + 0.5) * Math.LOG2E) : 32;
    },
    cosh: function cosh(x) {
      return (exp(x = +x) + exp(-x)) / 2;
    },
    expm1: expm1,
    fround: function fround(x) {
      var $abs = abs(x),
          $sign = sign(x),
          a,
          result;
      if ($abs < MIN32)
        return $sign * roundTiesToEven($abs / MIN32 / EPSILON32) * MIN32 * EPSILON32;
      a = (1 + EPSILON32 / EPSILON) * $abs;
      result = a - (a - $abs);
      if (result > MAX32 || result != result)
        return $sign * Infinity;
      return $sign * result;
    },
    hypot: function hypot(value1, value2) {
      var sum = 0,
          len1 = arguments.length,
          len2 = len1,
          args = Array(len1),
          larg = -Infinity,
          arg;
      while (len1--) {
        arg = args[len1] = +arguments[len1];
        if (arg == Infinity || arg == -Infinity)
          return Infinity;
        if (arg > larg)
          larg = arg;
      }
      larg = arg || 1;
      while (len2--)
        sum += pow(args[len2] / larg, 2);
      return larg * sqrt(sum);
    },
    imul: function imul(x, y) {
      var UInt16 = 0xffff,
          xn = +x,
          yn = +y,
          xl = UInt16 & xn,
          yl = UInt16 & yn;
      return 0 | xl * yl + ((UInt16 & xn >>> 16) * yl + xl * (UInt16 & yn >>> 16) << 16 >>> 0);
    },
    log1p: function log1p(x) {
      return (x = +x) > -1e-8 && x < 1e-8 ? x - x * x / 2 : log(1 + x);
    },
    log10: function log10(x) {
      return log(x) / Math.LN10;
    },
    log2: function log2(x) {
      return log(x) / Math.LN2;
    },
    sign: sign,
    sinh: function sinh(x) {
      return abs(x = +x) < 1 ? (expm1(x) - expm1(-x)) / 2 : (exp(x - 1) - exp(-x - 1)) * (E / 2);
    },
    tanh: function tanh(x) {
      var a = expm1(x = +x),
          b = expm1(-x);
      return a == Infinity ? 1 : b == Infinity ? -1 : (a - b) / (exp(x) + exp(-x));
    },
    trunc: function trunc(it) {
      return (it > 0 ? floor : ceil)(it);
    }
  });
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.string.from-code-point", ["npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $def = require("npm:core-js@0.9.6/modules/$.def"),
      toIndex = require("npm:core-js@0.9.6/modules/$").toIndex,
      fromCharCode = String.fromCharCode,
      $fromCodePoint = String.fromCodePoint;
  $def($def.S + $def.F * (!!$fromCodePoint && $fromCodePoint.length != 1), 'String', {fromCodePoint: function fromCodePoint(x) {
      var res = [],
          len = arguments.length,
          i = 0,
          code;
      while (len > i) {
        code = +arguments[i++];
        if (toIndex(code, 0x10ffff) !== code)
          throw RangeError(code + ' is not a valid code point');
        res.push(code < 0x10000 ? fromCharCode(code) : fromCharCode(((code -= 0x10000) >> 10) + 0xd800, code % 0x400 + 0xdc00));
      }
      return res.join('');
    }});
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.string.raw", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.def"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$"),
      $def = require("npm:core-js@0.9.6/modules/$.def");
  $def($def.S, 'String', {raw: function raw(callSite) {
      var tpl = $.toObject(callSite.raw),
          len = $.toLength(tpl.length),
          sln = arguments.length,
          res = [],
          i = 0;
      while (len > i) {
        res.push(String(tpl[i++]));
        if (i < sln)
          res.push(String(arguments[i]));
      }
      return res.join('');
    }});
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.string-at", ["npm:core-js@0.9.6/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$");
  module.exports = function(TO_STRING) {
    return function(that, pos) {
      var s = String($.assertDefined(that)),
          i = $.toInteger(pos),
          l = s.length,
          a,
          b;
      if (i < 0 || i >= l)
        return TO_STRING ? '' : undefined;
      a = s.charCodeAt(i);
      return a < 0xd800 || a > 0xdbff || i + 1 === l || (b = s.charCodeAt(i + 1)) < 0xdc00 || b > 0xdfff ? TO_STRING ? s.charAt(i) : a : TO_STRING ? s.slice(i, i + 2) : (a - 0xd800 << 10) + (b - 0xdc00) + 0x10000;
    };
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.iter", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.cof", "npm:core-js@0.9.6/modules/$.assert", "npm:core-js@0.9.6/modules/$.wks"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = require("npm:core-js@0.9.6/modules/$"),
      cof = require("npm:core-js@0.9.6/modules/$.cof"),
      assertObject = require("npm:core-js@0.9.6/modules/$.assert").obj,
      SYMBOL_ITERATOR = require("npm:core-js@0.9.6/modules/$.wks")('iterator'),
      FF_ITERATOR = '@@iterator',
      Iterators = {},
      IteratorPrototype = {};
  setIterator(IteratorPrototype, $.that);
  function setIterator(O, value) {
    $.hide(O, SYMBOL_ITERATOR, value);
    if (FF_ITERATOR in [])
      $.hide(O, FF_ITERATOR, value);
  }
  module.exports = {
    BUGGY: 'keys' in [] && !('next' in [].keys()),
    Iterators: Iterators,
    step: function(done, value) {
      return {
        value: value,
        done: !!done
      };
    },
    is: function(it) {
      var O = Object(it),
          Symbol = $.g.Symbol,
          SYM = Symbol && Symbol.iterator || FF_ITERATOR;
      return SYM in O || SYMBOL_ITERATOR in O || $.has(Iterators, cof.classof(O));
    },
    get: function(it) {
      var Symbol = $.g.Symbol,
          ext = it[Symbol && Symbol.iterator || FF_ITERATOR],
          getIter = ext || it[SYMBOL_ITERATOR] || Iterators[cof.classof(it)];
      return assertObject(getIter.call(it));
    },
    set: setIterator,
    create: function(Constructor, NAME, next, proto) {
      Constructor.prototype = $.create(proto || IteratorPrototype, {next: $.desc(1, next)});
      cof.set(Constructor, NAME + ' Iterator');
    }
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.iter-define", ["npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.cof", "npm:core-js@0.9.6/modules/$.iter", "npm:core-js@0.9.6/modules/$.wks"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $def = require("npm:core-js@0.9.6/modules/$.def"),
      $ = require("npm:core-js@0.9.6/modules/$"),
      cof = require("npm:core-js@0.9.6/modules/$.cof"),
      $iter = require("npm:core-js@0.9.6/modules/$.iter"),
      SYMBOL_ITERATOR = require("npm:core-js@0.9.6/modules/$.wks")('iterator'),
      FF_ITERATOR = '@@iterator',
      KEYS = 'keys',
      VALUES = 'values',
      Iterators = $iter.Iterators;
  module.exports = function(Base, NAME, Constructor, next, DEFAULT, IS_SET, FORCE) {
    $iter.create(Constructor, NAME, next);
    function createMethod(kind) {
      function $$(that) {
        return new Constructor(that, kind);
      }
      switch (kind) {
        case KEYS:
          return function keys() {
            return $$(this);
          };
        case VALUES:
          return function values() {
            return $$(this);
          };
      }
      return function entries() {
        return $$(this);
      };
    }
    var TAG = NAME + ' Iterator',
        proto = Base.prototype,
        _native = proto[SYMBOL_ITERATOR] || proto[FF_ITERATOR] || DEFAULT && proto[DEFAULT],
        _default = _native || createMethod(DEFAULT),
        methods,
        key;
    if (_native) {
      var IteratorPrototype = $.getProto(_default.call(new Base));
      cof.set(IteratorPrototype, TAG, true);
      if ($.FW && $.has(proto, FF_ITERATOR))
        $iter.set(IteratorPrototype, $.that);
    }
    if ($.FW)
      $iter.set(proto, _default);
    Iterators[NAME] = _default;
    Iterators[TAG] = $.that;
    if (DEFAULT) {
      methods = {
        keys: IS_SET ? _default : createMethod(KEYS),
        values: DEFAULT == VALUES ? _default : createMethod(VALUES),
        entries: DEFAULT != VALUES ? _default : createMethod('entries')
      };
      if (FORCE)
        for (key in methods) {
          if (!(key in proto))
            $.hide(proto, key, methods[key]);
        }
      else
        $def($def.P + $def.F * $iter.BUGGY, NAME, methods);
    }
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.string.code-point-at", ["npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$.string-at"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $def = require("npm:core-js@0.9.6/modules/$.def"),
      $at = require("npm:core-js@0.9.6/modules/$.string-at")(false);
  $def($def.P, 'String', {codePointAt: function codePointAt(pos) {
      return $at(this, pos);
    }});
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.string.ends-with", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.cof", "npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$.throws"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = require("npm:core-js@0.9.6/modules/$"),
      cof = require("npm:core-js@0.9.6/modules/$.cof"),
      $def = require("npm:core-js@0.9.6/modules/$.def"),
      toLength = $.toLength;
  $def($def.P + $def.F * !require("npm:core-js@0.9.6/modules/$.throws")(function() {
    'q'.endsWith(/./);
  }), 'String', {endsWith: function endsWith(searchString) {
      if (cof(searchString) == 'RegExp')
        throw TypeError();
      var that = String($.assertDefined(this)),
          endPosition = arguments[1],
          len = toLength(that.length),
          end = endPosition === undefined ? len : Math.min(toLength(endPosition), len);
      searchString += '';
      return that.slice(end - searchString.length, end) === searchString;
    }});
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.string.includes", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.cof", "npm:core-js@0.9.6/modules/$.def"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = require("npm:core-js@0.9.6/modules/$"),
      cof = require("npm:core-js@0.9.6/modules/$.cof"),
      $def = require("npm:core-js@0.9.6/modules/$.def");
  $def($def.P, 'String', {includes: function includes(searchString) {
      if (cof(searchString) == 'RegExp')
        throw TypeError();
      return !!~String($.assertDefined(this)).indexOf(searchString, arguments[1]);
    }});
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.string-repeat", ["npm:core-js@0.9.6/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = require("npm:core-js@0.9.6/modules/$");
  module.exports = function repeat(count) {
    var str = String($.assertDefined(this)),
        res = '',
        n = $.toInteger(count);
    if (n < 0 || n == Infinity)
      throw RangeError("Count can't be negative");
    for (; n > 0; (n >>>= 1) && (str += str))
      if (n & 1)
        res += str;
    return res;
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.string.starts-with", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.cof", "npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$.throws"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = require("npm:core-js@0.9.6/modules/$"),
      cof = require("npm:core-js@0.9.6/modules/$.cof"),
      $def = require("npm:core-js@0.9.6/modules/$.def");
  $def($def.P + $def.F * !require("npm:core-js@0.9.6/modules/$.throws")(function() {
    'q'.startsWith(/./);
  }), 'String', {startsWith: function startsWith(searchString) {
      if (cof(searchString) == 'RegExp')
        throw TypeError();
      var that = String($.assertDefined(this)),
          index = $.toLength(Math.min(arguments[1], that.length));
      searchString += '';
      return that.slice(index, index + searchString.length) === searchString;
    }});
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.iter-call", ["npm:core-js@0.9.6/modules/$.assert"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var assertObject = require("npm:core-js@0.9.6/modules/$.assert").obj;
  function close(iterator) {
    var ret = iterator['return'];
    if (ret !== undefined)
      assertObject(ret.call(iterator));
  }
  function call(iterator, fn, value, entries) {
    try {
      return entries ? fn(assertObject(value)[0], value[1]) : fn(value);
    } catch (e) {
      close(iterator);
      throw e;
    }
  }
  call.close = close;
  module.exports = call;
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.iter-detect", ["npm:core-js@0.9.6/modules/$.wks"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var SYMBOL_ITERATOR = require("npm:core-js@0.9.6/modules/$.wks")('iterator'),
      SAFE_CLOSING = false;
  try {
    var riter = [7][SYMBOL_ITERATOR]();
    riter['return'] = function() {
      SAFE_CLOSING = true;
    };
    Array.from(riter, function() {
      throw 2;
    });
  } catch (e) {}
  module.exports = function(exec) {
    if (!SAFE_CLOSING)
      return false;
    var safe = false;
    try {
      var arr = [7],
          iter = arr[SYMBOL_ITERATOR]();
      iter.next = function() {
        safe = true;
      };
      arr[SYMBOL_ITERATOR] = function() {
        return iter;
      };
      exec(arr);
    } catch (e) {}
    return safe;
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.array.of", ["npm:core-js@0.9.6/modules/$.def"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $def = require("npm:core-js@0.9.6/modules/$.def");
  $def($def.S, 'Array', {of: function of() {
      var index = 0,
          length = arguments.length,
          result = new (typeof this == 'function' ? this : Array)(length);
      while (length > index)
        result[index] = arguments[index++];
      result.length = length;
      return result;
    }});
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.unscope", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.wks"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$"),
      UNSCOPABLES = require("npm:core-js@0.9.6/modules/$.wks")('unscopables');
  if ($.FW && !(UNSCOPABLES in []))
    $.hide(Array.prototype, UNSCOPABLES, {});
  module.exports = function(key) {
    if ($.FW)
      [][UNSCOPABLES][key] = true;
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.species", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.wks"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$"),
      SPECIES = require("npm:core-js@0.9.6/modules/$.wks")('species');
  module.exports = function(C) {
    if ($.DESC && !(SPECIES in C))
      $.setDesc(C, SPECIES, {
        configurable: true,
        get: $.that
      });
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.array.copy-within", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$.unscope"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = require("npm:core-js@0.9.6/modules/$"),
      $def = require("npm:core-js@0.9.6/modules/$.def"),
      toIndex = $.toIndex;
  $def($def.P, 'Array', {copyWithin: function copyWithin(target, start) {
      var O = Object($.assertDefined(this)),
          len = $.toLength(O.length),
          to = toIndex(target, len),
          from = toIndex(start, len),
          end = arguments[2],
          fin = end === undefined ? len : toIndex(end, len),
          count = Math.min(fin - from, len - to),
          inc = 1;
      if (from < to && to < from + count) {
        inc = -1;
        from = from + count - 1;
        to = to + count - 1;
      }
      while (count-- > 0) {
        if (from in O)
          O[to] = O[from];
        else
          delete O[to];
        to += inc;
        from += inc;
      }
      return O;
    }});
  require("npm:core-js@0.9.6/modules/$.unscope")('copyWithin');
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.array.fill", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$.unscope"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = require("npm:core-js@0.9.6/modules/$"),
      $def = require("npm:core-js@0.9.6/modules/$.def"),
      toIndex = $.toIndex;
  $def($def.P, 'Array', {fill: function fill(value) {
      var O = Object($.assertDefined(this)),
          length = $.toLength(O.length),
          index = toIndex(arguments[1], length),
          end = arguments[2],
          endPos = end === undefined ? length : toIndex(end, length);
      while (endPos > index)
        O[index++] = value;
      return O;
    }});
  require("npm:core-js@0.9.6/modules/$.unscope")('fill');
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.array.find", ["npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$.array-methods", "npm:core-js@0.9.6/modules/$.unscope"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var KEY = 'find',
      $def = require("npm:core-js@0.9.6/modules/$.def"),
      forced = true,
      $find = require("npm:core-js@0.9.6/modules/$.array-methods")(5);
  if (KEY in [])
    Array(1)[KEY](function() {
      forced = false;
    });
  $def($def.P + $def.F * forced, 'Array', {find: function find(callbackfn) {
      return $find(this, callbackfn, arguments[1]);
    }});
  require("npm:core-js@0.9.6/modules/$.unscope")(KEY);
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.array.find-index", ["npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$.array-methods", "npm:core-js@0.9.6/modules/$.unscope"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var KEY = 'findIndex',
      $def = require("npm:core-js@0.9.6/modules/$.def"),
      forced = true,
      $find = require("npm:core-js@0.9.6/modules/$.array-methods")(6);
  if (KEY in [])
    Array(1)[KEY](function() {
      forced = false;
    });
  $def($def.P + $def.F * forced, 'Array', {findIndex: function findIndex(callbackfn) {
      return $find(this, callbackfn, arguments[1]);
    }});
  require("npm:core-js@0.9.6/modules/$.unscope")(KEY);
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.regexp", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.cof", "npm:core-js@0.9.6/modules/$.replacer", "npm:core-js@0.9.6/modules/$.species"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$"),
      cof = require("npm:core-js@0.9.6/modules/$.cof"),
      $RegExp = $.g.RegExp,
      Base = $RegExp,
      proto = $RegExp.prototype,
      re = /a/g,
      CORRECT_NEW = new $RegExp(re) !== re,
      ALLOWS_RE_WITH_FLAGS = function() {
        try {
          return $RegExp(re, 'i') == '/a/i';
        } catch (e) {}
      }();
  if ($.FW && $.DESC) {
    if (!CORRECT_NEW || !ALLOWS_RE_WITH_FLAGS) {
      $RegExp = function RegExp(pattern, flags) {
        var patternIsRegExp = cof(pattern) == 'RegExp',
            flagsIsUndefined = flags === undefined;
        if (!(this instanceof $RegExp) && patternIsRegExp && flagsIsUndefined)
          return pattern;
        return CORRECT_NEW ? new Base(patternIsRegExp && !flagsIsUndefined ? pattern.source : pattern, flags) : new Base(patternIsRegExp ? pattern.source : pattern, patternIsRegExp && flagsIsUndefined ? pattern.flags : flags);
      };
      $.each.call($.getNames(Base), function(key) {
        key in $RegExp || $.setDesc($RegExp, key, {
          configurable: true,
          get: function() {
            return Base[key];
          },
          set: function(it) {
            Base[key] = it;
          }
        });
      });
      proto.constructor = $RegExp;
      $RegExp.prototype = proto;
      $.hide($.g, 'RegExp', $RegExp);
    }
    if (/./g.flags != 'g')
      $.setDesc(proto, 'flags', {
        configurable: true,
        get: require("npm:core-js@0.9.6/modules/$.replacer")(/^.*\/(\w*)$/, '$1')
      });
  }
  require("npm:core-js@0.9.6/modules/$.species")($RegExp);
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.for-of", ["npm:core-js@0.9.6/modules/$.ctx", "npm:core-js@0.9.6/modules/$.iter", "npm:core-js@0.9.6/modules/$.iter-call"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var ctx = require("npm:core-js@0.9.6/modules/$.ctx"),
      get = require("npm:core-js@0.9.6/modules/$.iter").get,
      call = require("npm:core-js@0.9.6/modules/$.iter-call");
  module.exports = function(iterable, entries, fn, that) {
    var iterator = get(iterable),
        f = ctx(fn, that, entries ? 2 : 1),
        step;
    while (!(step = iterator.next()).done) {
      if (call(iterator, f, step.value, entries) === false) {
        return call.close(iterator);
      }
    }
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.task", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.ctx", "npm:core-js@0.9.6/modules/$.cof", "npm:core-js@0.9.6/modules/$.invoke", "npm:core-js@0.9.6/modules/$.dom-create", "github:jspm/nodelibs-process@0.1.1"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  (function(process) {
    'use strict';
    var $ = require("npm:core-js@0.9.6/modules/$"),
        ctx = require("npm:core-js@0.9.6/modules/$.ctx"),
        cof = require("npm:core-js@0.9.6/modules/$.cof"),
        invoke = require("npm:core-js@0.9.6/modules/$.invoke"),
        cel = require("npm:core-js@0.9.6/modules/$.dom-create"),
        global = $.g,
        isFunction = $.isFunction,
        html = $.html,
        process = global.process,
        setTask = global.setImmediate,
        clearTask = global.clearImmediate,
        postMessage = global.postMessage,
        addEventListener = global.addEventListener,
        MessageChannel = global.MessageChannel,
        counter = 0,
        queue = {},
        ONREADYSTATECHANGE = 'onreadystatechange',
        defer,
        channel,
        port;
    function run() {
      var id = +this;
      if ($.has(queue, id)) {
        var fn = queue[id];
        delete queue[id];
        fn();
      }
    }
    function listner(event) {
      run.call(event.data);
    }
    if (!isFunction(setTask) || !isFunction(clearTask)) {
      setTask = function(fn) {
        var args = [],
            i = 1;
        while (arguments.length > i)
          args.push(arguments[i++]);
        queue[++counter] = function() {
          invoke(isFunction(fn) ? fn : Function(fn), args);
        };
        defer(counter);
        return counter;
      };
      clearTask = function(id) {
        delete queue[id];
      };
      if (cof(process) == 'process') {
        defer = function(id) {
          process.nextTick(ctx(run, id, 1));
        };
      } else if (addEventListener && isFunction(postMessage) && !global.importScripts) {
        defer = function(id) {
          postMessage(id, '*');
        };
        addEventListener('message', listner, false);
      } else if (isFunction(MessageChannel)) {
        channel = new MessageChannel;
        port = channel.port2;
        channel.port1.onmessage = listner;
        defer = ctx(port.postMessage, port, 1);
      } else if (ONREADYSTATECHANGE in cel('script')) {
        defer = function(id) {
          html.appendChild(cel('script'))[ONREADYSTATECHANGE] = function() {
            html.removeChild(this);
            run.call(id);
          };
        };
      } else {
        defer = function(id) {
          setTimeout(ctx(run, id, 1), 0);
        };
      }
    }
    module.exports = {
      set: setTask,
      clear: clearTask
    };
  })(require("github:jspm/nodelibs-process@0.1.1"));
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.collection-strong", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.ctx", "npm:core-js@0.9.6/modules/$.uid", "npm:core-js@0.9.6/modules/$.assert", "npm:core-js@0.9.6/modules/$.for-of", "npm:core-js@0.9.6/modules/$.iter", "npm:core-js@0.9.6/modules/$.iter-define"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = require("npm:core-js@0.9.6/modules/$"),
      ctx = require("npm:core-js@0.9.6/modules/$.ctx"),
      safe = require("npm:core-js@0.9.6/modules/$.uid").safe,
      assert = require("npm:core-js@0.9.6/modules/$.assert"),
      forOf = require("npm:core-js@0.9.6/modules/$.for-of"),
      step = require("npm:core-js@0.9.6/modules/$.iter").step,
      has = $.has,
      set = $.set,
      isObject = $.isObject,
      hide = $.hide,
      isFrozen = Object.isFrozen || $.core.Object.isFrozen,
      ID = safe('id'),
      O1 = safe('O1'),
      LAST = safe('last'),
      FIRST = safe('first'),
      ITER = safe('iter'),
      SIZE = $.DESC ? safe('size') : 'size',
      id = 0;
  function fastKey(it, create) {
    if (!isObject(it))
      return (typeof it == 'string' ? 'S' : 'P') + it;
    if (isFrozen(it))
      return 'F';
    if (!has(it, ID)) {
      if (!create)
        return 'E';
      hide(it, ID, ++id);
    }
    return 'O' + it[ID];
  }
  function getEntry(that, key) {
    var index = fastKey(key),
        entry;
    if (index != 'F')
      return that[O1][index];
    for (entry = that[FIRST]; entry; entry = entry.n) {
      if (entry.k == key)
        return entry;
    }
  }
  module.exports = {
    getConstructor: function(NAME, IS_MAP, ADDER) {
      function C() {
        var that = assert.inst(this, C, NAME),
            iterable = arguments[0];
        set(that, O1, $.create(null));
        set(that, SIZE, 0);
        set(that, LAST, undefined);
        set(that, FIRST, undefined);
        if (iterable != undefined)
          forOf(iterable, IS_MAP, that[ADDER], that);
      }
      $.mix(C.prototype, {
        clear: function clear() {
          for (var that = this,
              data = that[O1],
              entry = that[FIRST]; entry; entry = entry.n) {
            entry.r = true;
            if (entry.p)
              entry.p = entry.p.n = undefined;
            delete data[entry.i];
          }
          that[FIRST] = that[LAST] = undefined;
          that[SIZE] = 0;
        },
        'delete': function(key) {
          var that = this,
              entry = getEntry(that, key);
          if (entry) {
            var next = entry.n,
                prev = entry.p;
            delete that[O1][entry.i];
            entry.r = true;
            if (prev)
              prev.n = next;
            if (next)
              next.p = prev;
            if (that[FIRST] == entry)
              that[FIRST] = next;
            if (that[LAST] == entry)
              that[LAST] = prev;
            that[SIZE]--;
          }
          return !!entry;
        },
        forEach: function forEach(callbackfn) {
          var f = ctx(callbackfn, arguments[1], 3),
              entry;
          while (entry = entry ? entry.n : this[FIRST]) {
            f(entry.v, entry.k, this);
            while (entry && entry.r)
              entry = entry.p;
          }
        },
        has: function has(key) {
          return !!getEntry(this, key);
        }
      });
      if ($.DESC)
        $.setDesc(C.prototype, 'size', {get: function() {
            return assert.def(this[SIZE]);
          }});
      return C;
    },
    def: function(that, key, value) {
      var entry = getEntry(that, key),
          prev,
          index;
      if (entry) {
        entry.v = value;
      } else {
        that[LAST] = entry = {
          i: index = fastKey(key, true),
          k: key,
          v: value,
          p: prev = that[LAST],
          n: undefined,
          r: false
        };
        if (!that[FIRST])
          that[FIRST] = entry;
        if (prev)
          prev.n = entry;
        that[SIZE]++;
        if (index != 'F')
          that[O1][index] = entry;
      }
      return that;
    },
    getEntry: getEntry,
    setIter: function(C, NAME, IS_MAP) {
      require("npm:core-js@0.9.6/modules/$.iter-define")(C, NAME, function(iterated, kind) {
        set(this, ITER, {
          o: iterated,
          k: kind
        });
      }, function() {
        var iter = this[ITER],
            kind = iter.k,
            entry = iter.l;
        while (entry && entry.r)
          entry = entry.p;
        if (!iter.o || !(iter.l = entry = entry ? entry.n : iter.o[FIRST])) {
          iter.o = undefined;
          return step(1);
        }
        if (kind == 'keys')
          return step(0, entry.k);
        if (kind == 'values')
          return step(0, entry.v);
        return step(0, [entry.k, entry.v]);
      }, IS_MAP ? 'entries' : 'values', !IS_MAP, true);
    }
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.collection", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$.iter", "npm:core-js@0.9.6/modules/$.for-of", "npm:core-js@0.9.6/modules/$.species", "npm:core-js@0.9.6/modules/$.assert", "npm:core-js@0.9.6/modules/$.iter-detect", "npm:core-js@0.9.6/modules/$.cof"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = require("npm:core-js@0.9.6/modules/$"),
      $def = require("npm:core-js@0.9.6/modules/$.def"),
      BUGGY = require("npm:core-js@0.9.6/modules/$.iter").BUGGY,
      forOf = require("npm:core-js@0.9.6/modules/$.for-of"),
      species = require("npm:core-js@0.9.6/modules/$.species"),
      assertInstance = require("npm:core-js@0.9.6/modules/$.assert").inst;
  module.exports = function(NAME, methods, common, IS_MAP, IS_WEAK) {
    var Base = $.g[NAME],
        C = Base,
        ADDER = IS_MAP ? 'set' : 'add',
        proto = C && C.prototype,
        O = {};
    function fixMethod(KEY, CHAIN) {
      var method = proto[KEY];
      if ($.FW)
        proto[KEY] = function(a, b) {
          var result = method.call(this, a === 0 ? 0 : a, b);
          return CHAIN ? this : result;
        };
    }
    if (!$.isFunction(C) || !(IS_WEAK || !BUGGY && proto.forEach && proto.entries)) {
      C = common.getConstructor(NAME, IS_MAP, ADDER);
      $.mix(C.prototype, methods);
    } else {
      var inst = new C,
          chain = inst[ADDER](IS_WEAK ? {} : -0, 1),
          buggyZero;
      if (!require("npm:core-js@0.9.6/modules/$.iter-detect")(function(iter) {
        new C(iter);
      })) {
        C = function() {
          assertInstance(this, C, NAME);
          var that = new Base,
              iterable = arguments[0];
          if (iterable != undefined)
            forOf(iterable, IS_MAP, that[ADDER], that);
          return that;
        };
        C.prototype = proto;
        if ($.FW)
          proto.constructor = C;
      }
      IS_WEAK || inst.forEach(function(val, key) {
        buggyZero = 1 / key === -Infinity;
      });
      if (buggyZero) {
        fixMethod('delete');
        fixMethod('has');
        IS_MAP && fixMethod('get');
      }
      if (buggyZero || chain !== inst)
        fixMethod(ADDER, true);
    }
    require("npm:core-js@0.9.6/modules/$.cof").set(C, NAME);
    O[NAME] = C;
    $def($def.G + $def.W + $def.F * (C != Base), O);
    species(C);
    species($.core[NAME]);
    if (!IS_WEAK)
      common.setIter(C, NAME, IS_MAP);
    return C;
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.set", ["npm:core-js@0.9.6/modules/$.collection-strong", "npm:core-js@0.9.6/modules/$.collection"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var strong = require("npm:core-js@0.9.6/modules/$.collection-strong");
  require("npm:core-js@0.9.6/modules/$.collection")('Set', {add: function add(value) {
      return strong.def(this, value = value === 0 ? 0 : value, value);
    }}, strong);
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.collection-weak", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.uid", "npm:core-js@0.9.6/modules/$.assert", "npm:core-js@0.9.6/modules/$.for-of", "npm:core-js@0.9.6/modules/$.array-methods"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = require("npm:core-js@0.9.6/modules/$"),
      safe = require("npm:core-js@0.9.6/modules/$.uid").safe,
      assert = require("npm:core-js@0.9.6/modules/$.assert"),
      forOf = require("npm:core-js@0.9.6/modules/$.for-of"),
      _has = $.has,
      isObject = $.isObject,
      hide = $.hide,
      isFrozen = Object.isFrozen || $.core.Object.isFrozen,
      id = 0,
      ID = safe('id'),
      WEAK = safe('weak'),
      LEAK = safe('leak'),
      method = require("npm:core-js@0.9.6/modules/$.array-methods"),
      find = method(5),
      findIndex = method(6);
  function findFrozen(store, key) {
    return find(store.array, function(it) {
      return it[0] === key;
    });
  }
  function leakStore(that) {
    return that[LEAK] || hide(that, LEAK, {
      array: [],
      get: function(key) {
        var entry = findFrozen(this, key);
        if (entry)
          return entry[1];
      },
      has: function(key) {
        return !!findFrozen(this, key);
      },
      set: function(key, value) {
        var entry = findFrozen(this, key);
        if (entry)
          entry[1] = value;
        else
          this.array.push([key, value]);
      },
      'delete': function(key) {
        var index = findIndex(this.array, function(it) {
          return it[0] === key;
        });
        if (~index)
          this.array.splice(index, 1);
        return !!~index;
      }
    })[LEAK];
  }
  module.exports = {
    getConstructor: function(NAME, IS_MAP, ADDER) {
      function C() {
        $.set(assert.inst(this, C, NAME), ID, id++);
        var iterable = arguments[0];
        if (iterable != undefined)
          forOf(iterable, IS_MAP, this[ADDER], this);
      }
      $.mix(C.prototype, {
        'delete': function(key) {
          if (!isObject(key))
            return false;
          if (isFrozen(key))
            return leakStore(this)['delete'](key);
          return _has(key, WEAK) && _has(key[WEAK], this[ID]) && delete key[WEAK][this[ID]];
        },
        has: function has(key) {
          if (!isObject(key))
            return false;
          if (isFrozen(key))
            return leakStore(this).has(key);
          return _has(key, WEAK) && _has(key[WEAK], this[ID]);
        }
      });
      return C;
    },
    def: function(that, key, value) {
      if (isFrozen(assert.obj(key))) {
        leakStore(that).set(key, value);
      } else {
        _has(key, WEAK) || hide(key, WEAK, {});
        key[WEAK][that[ID]] = value;
      }
      return that;
    },
    leakStore: leakStore,
    WEAK: WEAK,
    ID: ID
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.weak-set", ["npm:core-js@0.9.6/modules/$.collection-weak", "npm:core-js@0.9.6/modules/$.collection"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var weak = require("npm:core-js@0.9.6/modules/$.collection-weak");
  require("npm:core-js@0.9.6/modules/$.collection")('WeakSet', {add: function add(value) {
      return weak.def(this, value, true);
    }}, weak, false, true);
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.own-keys", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.assert"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$"),
      assertObject = require("npm:core-js@0.9.6/modules/$.assert").obj;
  module.exports = function ownKeys(it) {
    assertObject(it);
    var keys = $.getNames(it),
        getSymbols = $.getSymbols;
    return getSymbols ? keys.concat(getSymbols(it)) : keys;
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es7.array.includes", ["npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$.array-includes", "npm:core-js@0.9.6/modules/$.unscope"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $def = require("npm:core-js@0.9.6/modules/$.def"),
      $includes = require("npm:core-js@0.9.6/modules/$.array-includes")(true);
  $def($def.P, 'Array', {includes: function includes(el) {
      return $includes(this, el, arguments[1]);
    }});
  require("npm:core-js@0.9.6/modules/$.unscope")('includes');
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es7.string.at", ["npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$.string-at"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $def = require("npm:core-js@0.9.6/modules/$.def"),
      $at = require("npm:core-js@0.9.6/modules/$.string-at")(true);
  $def($def.P, 'String', {at: function at(pos) {
      return $at(this, pos);
    }});
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.string-pad", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.string-repeat"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$"),
      repeat = require("npm:core-js@0.9.6/modules/$.string-repeat");
  module.exports = function(that, minLength, fillChar, left) {
    var S = String($.assertDefined(that));
    if (minLength === undefined)
      return S;
    var intMinLength = $.toInteger(minLength);
    var fillLen = intMinLength - S.length;
    if (fillLen < 0 || fillLen === Infinity) {
      throw new RangeError('Cannot satisfy string length ' + minLength + ' for string: ' + S);
    }
    var sFillStr = fillChar === undefined ? ' ' : String(fillChar);
    var sFillVal = repeat.call(sFillStr, Math.ceil(fillLen / sFillStr.length));
    if (sFillVal.length > fillLen)
      sFillVal = left ? sFillVal.slice(sFillVal.length - fillLen) : sFillVal.slice(0, fillLen);
    return left ? sFillVal.concat(S) : S.concat(sFillVal);
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es7.string.rpad", ["npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$.string-pad"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $def = require("npm:core-js@0.9.6/modules/$.def"),
      $pad = require("npm:core-js@0.9.6/modules/$.string-pad");
  $def($def.P, 'String', {rpad: function rpad(n) {
      return $pad(this, n, arguments[1], false);
    }});
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es7.regexp.escape", ["npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$.replacer"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $def = require("npm:core-js@0.9.6/modules/$.def");
  $def($def.S, 'RegExp', {escape: require("npm:core-js@0.9.6/modules/$.replacer")(/([\\\-[\]{}()*+?.,^$|])/g, '\\$1', true)});
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es7.object.get-own-property-descriptors", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$.own-keys"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$"),
      $def = require("npm:core-js@0.9.6/modules/$.def"),
      ownKeys = require("npm:core-js@0.9.6/modules/$.own-keys");
  $def($def.S, 'Object', {getOwnPropertyDescriptors: function getOwnPropertyDescriptors(object) {
      var O = $.toObject(object),
          result = {};
      $.each.call(ownKeys(O), function(key) {
        $.setDesc(result, key, $.desc(0, $.getDesc(O, key)));
      });
      return result;
    }});
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es7.object.to-array", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.def"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$"),
      $def = require("npm:core-js@0.9.6/modules/$.def");
  function createObjectToArray(isEntries) {
    return function(object) {
      var O = $.toObject(object),
          keys = $.getKeys(O),
          length = keys.length,
          i = 0,
          result = Array(length),
          key;
      if (isEntries)
        while (length > i)
          result[i] = [key = keys[i++], O[key]];
      else
        while (length > i)
          result[i] = O[keys[i++]];
      return result;
    };
  }
  $def($def.S, 'Object', {
    values: createObjectToArray(false),
    entries: createObjectToArray(true)
  });
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.collection-to-json", ["npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$.for-of"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $def = require("npm:core-js@0.9.6/modules/$.def"),
      forOf = require("npm:core-js@0.9.6/modules/$.for-of");
  module.exports = function(NAME) {
    $def($def.P, NAME, {toJSON: function toJSON() {
        var arr = [];
        forOf(this, false, arr.push, arr);
        return arr;
      }});
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es7.set.to-json", ["npm:core-js@0.9.6/modules/$.collection-to-json"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  require("npm:core-js@0.9.6/modules/$.collection-to-json")('Set');
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/js.array.statics", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$.ctx"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$"),
      $def = require("npm:core-js@0.9.6/modules/$.def"),
      $Array = $.core.Array || Array,
      statics = {};
  function setStatics(keys, length) {
    $.each.call(keys.split(','), function(key) {
      if (length == undefined && key in $Array)
        statics[key] = $Array[key];
      else if (key in [])
        statics[key] = require("npm:core-js@0.9.6/modules/$.ctx")(Function.call, [][key], length);
    });
  }
  setStatics('pop,reverse,shift,keys,values,entries', 1);
  setStatics('indexOf,every,some,forEach,map,filter,find,findIndex,includes', 3);
  setStatics('join,slice,concat,push,splice,unshift,sort,lastIndexOf,' + 'reduce,reduceRight,copyWithin,fill,turn');
  $def($def.S, 'Array', statics);
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.partial", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.invoke", "npm:core-js@0.9.6/modules/$.assert"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = require("npm:core-js@0.9.6/modules/$"),
      invoke = require("npm:core-js@0.9.6/modules/$.invoke"),
      assertFunction = require("npm:core-js@0.9.6/modules/$.assert").fn;
  module.exports = function() {
    var fn = assertFunction(this),
        length = arguments.length,
        pargs = Array(length),
        i = 0,
        _ = $.path._,
        holder = false;
    while (length > i)
      if ((pargs[i] = arguments[i++]) === _)
        holder = true;
    return function() {
      var that = this,
          _length = arguments.length,
          j = 0,
          k = 0,
          args;
      if (!holder && !_length)
        return invoke(fn, pargs, that);
      args = pargs.slice();
      if (holder)
        for (; length > j; j++)
          if (args[j] === _)
            args[j] = arguments[k++];
      while (_length > k)
        args.push(arguments[k++]);
      return invoke(fn, args, that);
    };
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/web.immediate", ["npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$.task"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $def = require("npm:core-js@0.9.6/modules/$.def"),
      $task = require("npm:core-js@0.9.6/modules/$.task");
  $def($def.G + $def.B, {
    setImmediate: $task.set,
    clearImmediate: $task.clear
  });
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/web.dom.iterable", ["npm:core-js@0.9.6/modules/es6.array.iterator", "npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.iter", "npm:core-js@0.9.6/modules/$.wks"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  require("npm:core-js@0.9.6/modules/es6.array.iterator");
  var $ = require("npm:core-js@0.9.6/modules/$"),
      Iterators = require("npm:core-js@0.9.6/modules/$.iter").Iterators,
      ITERATOR = require("npm:core-js@0.9.6/modules/$.wks")('iterator'),
      ArrayValues = Iterators.Array,
      NodeList = $.g.NodeList;
  if ($.FW && NodeList && !(ITERATOR in NodeList.prototype)) {
    $.hide(NodeList.prototype, ITERATOR, ArrayValues);
  }
  Iterators.NodeList = ArrayValues;
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/$.keyof", ["npm:core-js@0.9.6/library/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/library/modules/$");
  module.exports = function(object, el) {
    var O = $.toObject(object),
        keys = $.getKeys(O),
        length = keys.length,
        index = 0,
        key;
    while (length > index)
      if (O[key = keys[index++]] === el)
        return key;
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/fn/symbol/iterator", ["npm:core-js@0.9.6/library/modules/es6.string.iterator", "npm:core-js@0.9.6/library/modules/web.dom.iterable", "npm:core-js@0.9.6/library/modules/$.wks"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  require("npm:core-js@0.9.6/library/modules/es6.string.iterator");
  require("npm:core-js@0.9.6/library/modules/web.dom.iterable");
  module.exports = require("npm:core-js@0.9.6/library/modules/$.wks")('iterator');
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/fn/object/create", ["npm:core-js@0.9.6/library/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/library/modules/$");
  module.exports = function create(P, D) {
    return $.create(P, D);
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/$", ["npm:core-js@0.9.6/library/modules/$.fw"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var global = typeof self != 'undefined' ? self : Function('return this')(),
      core = {},
      defineProperty = Object.defineProperty,
      hasOwnProperty = {}.hasOwnProperty,
      ceil = Math.ceil,
      floor = Math.floor,
      max = Math.max,
      min = Math.min;
  var DESC = !!function() {
    try {
      return defineProperty({}, 'a', {get: function() {
          return 2;
        }}).a == 2;
    } catch (e) {}
  }();
  var hide = createDefiner(1);
  function toInteger(it) {
    return isNaN(it = +it) ? 0 : (it > 0 ? floor : ceil)(it);
  }
  function desc(bitmap, value) {
    return {
      enumerable: !(bitmap & 1),
      configurable: !(bitmap & 2),
      writable: !(bitmap & 4),
      value: value
    };
  }
  function simpleSet(object, key, value) {
    object[key] = value;
    return object;
  }
  function createDefiner(bitmap) {
    return DESC ? function(object, key, value) {
      return $.setDesc(object, key, desc(bitmap, value));
    } : simpleSet;
  }
  function isObject(it) {
    return it !== null && (typeof it == 'object' || typeof it == 'function');
  }
  function isFunction(it) {
    return typeof it == 'function';
  }
  function assertDefined(it) {
    if (it == undefined)
      throw TypeError("Can't call method on  " + it);
    return it;
  }
  var $ = module.exports = require("npm:core-js@0.9.6/library/modules/$.fw")({
    g: global,
    core: core,
    html: global.document && document.documentElement,
    isObject: isObject,
    isFunction: isFunction,
    it: function(it) {
      return it;
    },
    that: function() {
      return this;
    },
    toInteger: toInteger,
    toLength: function(it) {
      return it > 0 ? min(toInteger(it), 0x1fffffffffffff) : 0;
    },
    toIndex: function(index, length) {
      index = toInteger(index);
      return index < 0 ? max(index + length, 0) : min(index, length);
    },
    has: function(it, key) {
      return hasOwnProperty.call(it, key);
    },
    create: Object.create,
    getProto: Object.getPrototypeOf,
    DESC: DESC,
    desc: desc,
    getDesc: Object.getOwnPropertyDescriptor,
    setDesc: defineProperty,
    setDescs: Object.defineProperties,
    getKeys: Object.keys,
    getNames: Object.getOwnPropertyNames,
    getSymbols: Object.getOwnPropertySymbols,
    assertDefined: assertDefined,
    ES5Object: Object,
    toObject: function(it) {
      return $.ES5Object(assertDefined(it));
    },
    hide: hide,
    def: createDefiner(0),
    set: global.Symbol ? simpleSet : hide,
    mix: function(target, src) {
      for (var key in src)
        hide(target, key, src[key]);
      return target;
    },
    each: [].forEach
  });
  if (typeof __e != 'undefined')
    __e = core;
  if (typeof __g != 'undefined')
    __g = global;
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/$.wks", ["npm:core-js@0.9.6/library/modules/$", "npm:core-js@0.9.6/library/modules/$.uid"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var global = require("npm:core-js@0.9.6/library/modules/$").g,
      store = {};
  module.exports = function(name) {
    return store[name] || (store[name] = global.Symbol && global.Symbol[name] || require("npm:core-js@0.9.6/library/modules/$.uid").safe('Symbol.' + name));
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/$.iter", ["npm:core-js@0.9.6/library/modules/$", "npm:core-js@0.9.6/library/modules/$.cof", "npm:core-js@0.9.6/library/modules/$.assert", "npm:core-js@0.9.6/library/modules/$.wks"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = require("npm:core-js@0.9.6/library/modules/$"),
      cof = require("npm:core-js@0.9.6/library/modules/$.cof"),
      assertObject = require("npm:core-js@0.9.6/library/modules/$.assert").obj,
      SYMBOL_ITERATOR = require("npm:core-js@0.9.6/library/modules/$.wks")('iterator'),
      FF_ITERATOR = '@@iterator',
      Iterators = {},
      IteratorPrototype = {};
  setIterator(IteratorPrototype, $.that);
  function setIterator(O, value) {
    $.hide(O, SYMBOL_ITERATOR, value);
    if (FF_ITERATOR in [])
      $.hide(O, FF_ITERATOR, value);
  }
  module.exports = {
    BUGGY: 'keys' in [] && !('next' in [].keys()),
    Iterators: Iterators,
    step: function(done, value) {
      return {
        value: value,
        done: !!done
      };
    },
    is: function(it) {
      var O = Object(it),
          Symbol = $.g.Symbol,
          SYM = Symbol && Symbol.iterator || FF_ITERATOR;
      return SYM in O || SYMBOL_ITERATOR in O || $.has(Iterators, cof.classof(O));
    },
    get: function(it) {
      var Symbol = $.g.Symbol,
          ext = it[Symbol && Symbol.iterator || FF_ITERATOR],
          getIter = ext || it[SYMBOL_ITERATOR] || Iterators[cof.classof(it)];
      return assertObject(getIter.call(it));
    },
    set: setIterator,
    create: function(Constructor, NAME, next, proto) {
      Constructor.prototype = $.create(proto || IteratorPrototype, {next: $.desc(1, next)});
      cof.set(Constructor, NAME + ' Iterator');
    }
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/$.iter-define", ["npm:core-js@0.9.6/library/modules/$.def", "npm:core-js@0.9.6/library/modules/$", "npm:core-js@0.9.6/library/modules/$.cof", "npm:core-js@0.9.6/library/modules/$.iter", "npm:core-js@0.9.6/library/modules/$.wks"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $def = require("npm:core-js@0.9.6/library/modules/$.def"),
      $ = require("npm:core-js@0.9.6/library/modules/$"),
      cof = require("npm:core-js@0.9.6/library/modules/$.cof"),
      $iter = require("npm:core-js@0.9.6/library/modules/$.iter"),
      SYMBOL_ITERATOR = require("npm:core-js@0.9.6/library/modules/$.wks")('iterator'),
      FF_ITERATOR = '@@iterator',
      KEYS = 'keys',
      VALUES = 'values',
      Iterators = $iter.Iterators;
  module.exports = function(Base, NAME, Constructor, next, DEFAULT, IS_SET, FORCE) {
    $iter.create(Constructor, NAME, next);
    function createMethod(kind) {
      function $$(that) {
        return new Constructor(that, kind);
      }
      switch (kind) {
        case KEYS:
          return function keys() {
            return $$(this);
          };
        case VALUES:
          return function values() {
            return $$(this);
          };
      }
      return function entries() {
        return $$(this);
      };
    }
    var TAG = NAME + ' Iterator',
        proto = Base.prototype,
        _native = proto[SYMBOL_ITERATOR] || proto[FF_ITERATOR] || DEFAULT && proto[DEFAULT],
        _default = _native || createMethod(DEFAULT),
        methods,
        key;
    if (_native) {
      var IteratorPrototype = $.getProto(_default.call(new Base));
      cof.set(IteratorPrototype, TAG, true);
      if ($.FW && $.has(proto, FF_ITERATOR))
        $iter.set(IteratorPrototype, $.that);
    }
    if ($.FW)
      $iter.set(proto, _default);
    Iterators[NAME] = _default;
    Iterators[TAG] = $.that;
    if (DEFAULT) {
      methods = {
        keys: IS_SET ? _default : createMethod(KEYS),
        values: DEFAULT == VALUES ? _default : createMethod(VALUES),
        entries: DEFAULT != VALUES ? _default : createMethod('entries')
      };
      if (FORCE)
        for (key in methods) {
          if (!(key in proto))
            $.hide(proto, key, methods[key]);
        }
      else
        $def($def.P + $def.F * $iter.BUGGY, NAME, methods);
    }
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/es6.array.iterator", ["npm:core-js@0.9.6/library/modules/$", "npm:core-js@0.9.6/library/modules/$.unscope", "npm:core-js@0.9.6/library/modules/$.uid", "npm:core-js@0.9.6/library/modules/$.iter", "npm:core-js@0.9.6/library/modules/$.iter-define"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/library/modules/$"),
      setUnscope = require("npm:core-js@0.9.6/library/modules/$.unscope"),
      ITER = require("npm:core-js@0.9.6/library/modules/$.uid").safe('iter'),
      $iter = require("npm:core-js@0.9.6/library/modules/$.iter"),
      step = $iter.step,
      Iterators = $iter.Iterators;
  require("npm:core-js@0.9.6/library/modules/$.iter-define")(Array, 'Array', function(iterated, kind) {
    $.set(this, ITER, {
      o: $.toObject(iterated),
      i: 0,
      k: kind
    });
  }, function() {
    var iter = this[ITER],
        O = iter.o,
        kind = iter.k,
        index = iter.i++;
    if (!O || index >= O.length) {
      iter.o = undefined;
      return step(1);
    }
    if (kind == 'keys')
      return step(0, index);
    if (kind == 'values')
      return step(0, O[index]);
    return step(0, [index, O[index]]);
  }, 'values');
  Iterators.Arguments = Iterators.Array;
  setUnscope('keys');
  setUnscope('values');
  setUnscope('entries');
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/$.for-of", ["npm:core-js@0.9.6/library/modules/$.ctx", "npm:core-js@0.9.6/library/modules/$.iter", "npm:core-js@0.9.6/library/modules/$.iter-call"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var ctx = require("npm:core-js@0.9.6/library/modules/$.ctx"),
      get = require("npm:core-js@0.9.6/library/modules/$.iter").get,
      call = require("npm:core-js@0.9.6/library/modules/$.iter-call");
  module.exports = function(iterable, entries, fn, that) {
    var iterator = get(iterable),
        f = ctx(fn, that, entries ? 2 : 1),
        step;
    while (!(step = iterator.next()).done) {
      if (call(iterator, f, step.value, entries) === false) {
        return call.close(iterator);
      }
    }
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/$.collection", ["npm:core-js@0.9.6/library/modules/$", "npm:core-js@0.9.6/library/modules/$.def", "npm:core-js@0.9.6/library/modules/$.iter", "npm:core-js@0.9.6/library/modules/$.for-of", "npm:core-js@0.9.6/library/modules/$.species", "npm:core-js@0.9.6/library/modules/$.assert", "npm:core-js@0.9.6/library/modules/$.iter-detect", "npm:core-js@0.9.6/library/modules/$.cof"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = require("npm:core-js@0.9.6/library/modules/$"),
      $def = require("npm:core-js@0.9.6/library/modules/$.def"),
      BUGGY = require("npm:core-js@0.9.6/library/modules/$.iter").BUGGY,
      forOf = require("npm:core-js@0.9.6/library/modules/$.for-of"),
      species = require("npm:core-js@0.9.6/library/modules/$.species"),
      assertInstance = require("npm:core-js@0.9.6/library/modules/$.assert").inst;
  module.exports = function(NAME, methods, common, IS_MAP, IS_WEAK) {
    var Base = $.g[NAME],
        C = Base,
        ADDER = IS_MAP ? 'set' : 'add',
        proto = C && C.prototype,
        O = {};
    function fixMethod(KEY, CHAIN) {
      var method = proto[KEY];
      if ($.FW)
        proto[KEY] = function(a, b) {
          var result = method.call(this, a === 0 ? 0 : a, b);
          return CHAIN ? this : result;
        };
    }
    if (!$.isFunction(C) || !(IS_WEAK || !BUGGY && proto.forEach && proto.entries)) {
      C = common.getConstructor(NAME, IS_MAP, ADDER);
      $.mix(C.prototype, methods);
    } else {
      var inst = new C,
          chain = inst[ADDER](IS_WEAK ? {} : -0, 1),
          buggyZero;
      if (!require("npm:core-js@0.9.6/library/modules/$.iter-detect")(function(iter) {
        new C(iter);
      })) {
        C = function() {
          assertInstance(this, C, NAME);
          var that = new Base,
              iterable = arguments[0];
          if (iterable != undefined)
            forOf(iterable, IS_MAP, that[ADDER], that);
          return that;
        };
        C.prototype = proto;
        if ($.FW)
          proto.constructor = C;
      }
      IS_WEAK || inst.forEach(function(val, key) {
        buggyZero = 1 / key === -Infinity;
      });
      if (buggyZero) {
        fixMethod('delete');
        fixMethod('has');
        IS_MAP && fixMethod('get');
      }
      if (buggyZero || chain !== inst)
        fixMethod(ADDER, true);
    }
    require("npm:core-js@0.9.6/library/modules/$.cof").set(C, NAME);
    O[NAME] = C;
    $def($def.G + $def.W + $def.F * (C != Base), O);
    species(C);
    species($.core[NAME]);
    if (!IS_WEAK)
      common.setIter(C, NAME, IS_MAP);
    return C;
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/es7.map.to-json", ["npm:core-js@0.9.6/library/modules/$.collection-to-json"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  require("npm:core-js@0.9.6/library/modules/$.collection-to-json")('Map');
  global.define = __define;
  return module.exports;
});

System.register("npm:process@0.10.1", ["npm:process@0.10.1/browser"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = require("npm:process@0.10.1/browser");
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/$.assign", ["npm:core-js@0.9.6/library/modules/$", "npm:core-js@0.9.6/library/modules/$.enum-keys"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/library/modules/$"),
      enumKeys = require("npm:core-js@0.9.6/library/modules/$.enum-keys");
  module.exports = Object.assign || function assign(target, source) {
    var T = Object($.assertDefined(target)),
        l = arguments.length,
        i = 1;
    while (l > i) {
      var S = $.ES5Object(arguments[i++]),
          keys = enumKeys(S),
          length = keys.length,
          j = 0,
          key;
      while (length > j)
        T[key = keys[j++]] = S[key];
    }
    return T;
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:handlebars@2.0.0/dist/cjs/handlebars/utils", ["npm:handlebars@2.0.0/dist/cjs/handlebars/safe-string"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  "use strict";
  var SafeString = require("npm:handlebars@2.0.0/dist/cjs/handlebars/safe-string")["default"];
  var escape = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "`": "&#x60;"
  };
  var badChars = /[&<>"'`]/g;
  var possible = /[&<>"'`]/;
  function escapeChar(chr) {
    return escape[chr];
  }
  function extend(obj) {
    for (var i = 1; i < arguments.length; i++) {
      for (var key in arguments[i]) {
        if (Object.prototype.hasOwnProperty.call(arguments[i], key)) {
          obj[key] = arguments[i][key];
        }
      }
    }
    return obj;
  }
  exports.extend = extend;
  var toString = Object.prototype.toString;
  exports.toString = toString;
  var isFunction = function(value) {
    return typeof value === 'function';
  };
  if (isFunction(/x/)) {
    isFunction = function(value) {
      return typeof value === 'function' && toString.call(value) === '[object Function]';
    };
  }
  var isFunction;
  exports.isFunction = isFunction;
  var isArray = Array.isArray || function(value) {
    return (value && typeof value === 'object') ? toString.call(value) === '[object Array]' : false;
  };
  exports.isArray = isArray;
  function escapeExpression(string) {
    if (string instanceof SafeString) {
      return string.toString();
    } else if (string == null) {
      return "";
    } else if (!string) {
      return string + '';
    }
    string = "" + string;
    if (!possible.test(string)) {
      return string;
    }
    return string.replace(badChars, escapeChar);
  }
  exports.escapeExpression = escapeExpression;
  function isEmpty(value) {
    if (!value && value !== 0) {
      return true;
    } else if (isArray(value) && value.length === 0) {
      return true;
    } else {
      return false;
    }
  }
  exports.isEmpty = isEmpty;
  function appendContextPath(contextPath, id) {
    return (contextPath ? contextPath + '.' : '') + id;
  }
  exports.appendContextPath = appendContextPath;
  global.define = __define;
  return module.exports;
});

System.register("npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/base", ["npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/parser", "npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/ast", "npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/helpers", "npm:handlebars@2.0.0/dist/cjs/handlebars/utils"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  "use strict";
  var parser = require("npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/parser")["default"];
  var AST = require("npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/ast")["default"];
  var Helpers = require("npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/helpers");
  var extend = require("npm:handlebars@2.0.0/dist/cjs/handlebars/utils").extend;
  exports.parser = parser;
  var yy = {};
  extend(yy, Helpers, AST);
  function parse(input) {
    if (input.constructor === AST.ProgramNode) {
      return input;
    }
    parser.yy = yy;
    return parser.parse(input);
  }
  exports.parse = parse;
  global.define = __define;
  return module.exports;
});

System.register("github:jspm/nodelibs-fs@0.1.2", ["github:jspm/nodelibs-fs@0.1.2/index"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = require("github:jspm/nodelibs-fs@0.1.2/index");
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$", ["npm:core-js@0.9.6/modules/$.fw"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var global = typeof self != 'undefined' ? self : Function('return this')(),
      core = {},
      defineProperty = Object.defineProperty,
      hasOwnProperty = {}.hasOwnProperty,
      ceil = Math.ceil,
      floor = Math.floor,
      max = Math.max,
      min = Math.min;
  var DESC = !!function() {
    try {
      return defineProperty({}, 'a', {get: function() {
          return 2;
        }}).a == 2;
    } catch (e) {}
  }();
  var hide = createDefiner(1);
  function toInteger(it) {
    return isNaN(it = +it) ? 0 : (it > 0 ? floor : ceil)(it);
  }
  function desc(bitmap, value) {
    return {
      enumerable: !(bitmap & 1),
      configurable: !(bitmap & 2),
      writable: !(bitmap & 4),
      value: value
    };
  }
  function simpleSet(object, key, value) {
    object[key] = value;
    return object;
  }
  function createDefiner(bitmap) {
    return DESC ? function(object, key, value) {
      return $.setDesc(object, key, desc(bitmap, value));
    } : simpleSet;
  }
  function isObject(it) {
    return it !== null && (typeof it == 'object' || typeof it == 'function');
  }
  function isFunction(it) {
    return typeof it == 'function';
  }
  function assertDefined(it) {
    if (it == undefined)
      throw TypeError("Can't call method on  " + it);
    return it;
  }
  var $ = module.exports = require("npm:core-js@0.9.6/modules/$.fw")({
    g: global,
    core: core,
    html: global.document && document.documentElement,
    isObject: isObject,
    isFunction: isFunction,
    it: function(it) {
      return it;
    },
    that: function() {
      return this;
    },
    toInteger: toInteger,
    toLength: function(it) {
      return it > 0 ? min(toInteger(it), 0x1fffffffffffff) : 0;
    },
    toIndex: function(index, length) {
      index = toInteger(index);
      return index < 0 ? max(index + length, 0) : min(index, length);
    },
    has: function(it, key) {
      return hasOwnProperty.call(it, key);
    },
    create: Object.create,
    getProto: Object.getPrototypeOf,
    DESC: DESC,
    desc: desc,
    getDesc: Object.getOwnPropertyDescriptor,
    setDesc: defineProperty,
    setDescs: Object.defineProperties,
    getKeys: Object.keys,
    getNames: Object.getOwnPropertyNames,
    getSymbols: Object.getOwnPropertySymbols,
    assertDefined: assertDefined,
    ES5Object: Object,
    toObject: function(it) {
      return $.ES5Object(assertDefined(it));
    },
    hide: hide,
    def: createDefiner(0),
    set: global.Symbol ? simpleSet : hide,
    mix: function(target, src) {
      for (var key in src)
        hide(target, key, src[key]);
      return target;
    },
    each: [].forEach
  });
  if (typeof __e != 'undefined')
    __e = core;
  if (typeof __g != 'undefined')
    __g = global;
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.wks", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.uid"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var global = require("npm:core-js@0.9.6/modules/$").g,
      store = {};
  module.exports = function(name) {
    return store[name] || (store[name] = global.Symbol && global.Symbol[name] || require("npm:core-js@0.9.6/modules/$.uid").safe('Symbol.' + name));
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.ctx", ["npm:core-js@0.9.6/modules/$.assert"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var assertFunction = require("npm:core-js@0.9.6/modules/$.assert").fn;
  module.exports = function(fn, that, length) {
    assertFunction(fn);
    if (~length && that === undefined)
      return fn;
    switch (length) {
      case 1:
        return function(a) {
          return fn.call(that, a);
        };
      case 2:
        return function(a, b) {
          return fn.call(that, a, b);
        };
      case 3:
        return function(a, b, c) {
          return fn.call(that, a, b, c);
        };
    }
    return function() {
      return fn.apply(that, arguments);
    };
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.symbol", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.cof", "npm:core-js@0.9.6/modules/$.uid", "npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$.keyof", "npm:core-js@0.9.6/modules/$.enum-keys", "npm:core-js@0.9.6/modules/$.assert", "npm:core-js@0.9.6/modules/$.wks"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = require("npm:core-js@0.9.6/modules/$"),
      setTag = require("npm:core-js@0.9.6/modules/$.cof").set,
      uid = require("npm:core-js@0.9.6/modules/$.uid"),
      $def = require("npm:core-js@0.9.6/modules/$.def"),
      keyOf = require("npm:core-js@0.9.6/modules/$.keyof"),
      enumKeys = require("npm:core-js@0.9.6/modules/$.enum-keys"),
      assertObject = require("npm:core-js@0.9.6/modules/$.assert").obj,
      has = $.has,
      $create = $.create,
      getDesc = $.getDesc,
      setDesc = $.setDesc,
      desc = $.desc,
      getNames = $.getNames,
      toObject = $.toObject,
      $Symbol = $.g.Symbol,
      setter = false,
      TAG = uid('tag'),
      HIDDEN = uid('hidden'),
      SymbolRegistry = {},
      AllSymbols = {},
      useNative = $.isFunction($Symbol);
  function wrap(tag) {
    var sym = AllSymbols[tag] = $.set($create($Symbol.prototype), TAG, tag);
    $.DESC && setter && setDesc(Object.prototype, tag, {
      configurable: true,
      set: function(value) {
        if (has(this, HIDDEN) && has(this[HIDDEN], tag))
          this[HIDDEN][tag] = false;
        setDesc(this, tag, desc(1, value));
      }
    });
    return sym;
  }
  function defineProperty(it, key, D) {
    if (D && has(AllSymbols, key)) {
      if (!D.enumerable) {
        if (!has(it, HIDDEN))
          setDesc(it, HIDDEN, desc(1, {}));
        it[HIDDEN][key] = true;
      } else {
        if (has(it, HIDDEN) && it[HIDDEN][key])
          it[HIDDEN][key] = false;
        D.enumerable = false;
      }
    }
    return setDesc(it, key, D);
  }
  function defineProperties(it, P) {
    assertObject(it);
    var keys = enumKeys(P = toObject(P)),
        i = 0,
        l = keys.length,
        key;
    while (l > i)
      defineProperty(it, key = keys[i++], P[key]);
    return it;
  }
  function create(it, P) {
    return P === undefined ? $create(it) : defineProperties($create(it), P);
  }
  function getOwnPropertyDescriptor(it, key) {
    var D = getDesc(it = toObject(it), key);
    if (D && has(AllSymbols, key) && !(has(it, HIDDEN) && it[HIDDEN][key]))
      D.enumerable = true;
    return D;
  }
  function getOwnPropertyNames(it) {
    var names = getNames(toObject(it)),
        result = [],
        i = 0,
        key;
    while (names.length > i)
      if (!has(AllSymbols, key = names[i++]) && key != HIDDEN)
        result.push(key);
    return result;
  }
  function getOwnPropertySymbols(it) {
    var names = getNames(toObject(it)),
        result = [],
        i = 0,
        key;
    while (names.length > i)
      if (has(AllSymbols, key = names[i++]))
        result.push(AllSymbols[key]);
    return result;
  }
  if (!useNative) {
    $Symbol = function Symbol(description) {
      if (this instanceof $Symbol)
        throw TypeError('Symbol is not a constructor');
      return wrap(uid(description));
    };
    $.hide($Symbol.prototype, 'toString', function() {
      return this[TAG];
    });
    $.create = create;
    $.setDesc = defineProperty;
    $.getDesc = getOwnPropertyDescriptor;
    $.setDescs = defineProperties;
    $.getNames = getOwnPropertyNames;
    $.getSymbols = getOwnPropertySymbols;
  }
  var symbolStatics = {
    'for': function(key) {
      return has(SymbolRegistry, key += '') ? SymbolRegistry[key] : SymbolRegistry[key] = $Symbol(key);
    },
    keyFor: function keyFor(key) {
      return keyOf(SymbolRegistry, key);
    },
    useSetter: function() {
      setter = true;
    },
    useSimple: function() {
      setter = false;
    }
  };
  $.each.call(('hasInstance,isConcatSpreadable,iterator,match,replace,search,' + 'species,split,toPrimitive,toStringTag,unscopables').split(','), function(it) {
    var sym = require("npm:core-js@0.9.6/modules/$.wks")(it);
    symbolStatics[it] = useNative ? sym : wrap(sym);
  });
  setter = true;
  $def($def.G + $def.W, {Symbol: $Symbol});
  $def($def.S, 'Symbol', symbolStatics);
  $def($def.S + $def.F * !useNative, 'Object', {
    create: create,
    defineProperty: defineProperty,
    defineProperties: defineProperties,
    getOwnPropertyDescriptor: getOwnPropertyDescriptor,
    getOwnPropertyNames: getOwnPropertyNames,
    getOwnPropertySymbols: getOwnPropertySymbols
  });
  setTag($Symbol, 'Symbol');
  setTag(Math, 'Math', true);
  setTag($.g.JSON, 'JSON', true);
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.object.assign", ["npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$.assign"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $def = require("npm:core-js@0.9.6/modules/$.def");
  $def($def.S, 'Object', {assign: require("npm:core-js@0.9.6/modules/$.assign")});
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.object.set-prototype-of", ["npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$.set-proto"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $def = require("npm:core-js@0.9.6/modules/$.def");
  $def($def.S, 'Object', {setPrototypeOf: require("npm:core-js@0.9.6/modules/$.set-proto").set});
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.string.iterator", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.string-at", "npm:core-js@0.9.6/modules/$.uid", "npm:core-js@0.9.6/modules/$.iter", "npm:core-js@0.9.6/modules/$.iter-define"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var set = require("npm:core-js@0.9.6/modules/$").set,
      $at = require("npm:core-js@0.9.6/modules/$.string-at")(true),
      ITER = require("npm:core-js@0.9.6/modules/$.uid").safe('iter'),
      $iter = require("npm:core-js@0.9.6/modules/$.iter"),
      step = $iter.step;
  require("npm:core-js@0.9.6/modules/$.iter-define")(String, 'String', function(iterated) {
    set(this, ITER, {
      o: String(iterated),
      i: 0
    });
  }, function() {
    var iter = this[ITER],
        O = iter.o,
        index = iter.i,
        point;
    if (index >= O.length)
      return step(1);
    point = $at(O, index);
    iter.i += point.length;
    return step(0, point);
  });
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.string.repeat", ["npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$.string-repeat"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $def = require("npm:core-js@0.9.6/modules/$.def");
  $def($def.P, 'String', {repeat: require("npm:core-js@0.9.6/modules/$.string-repeat")});
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.array.from", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.ctx", "npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$.iter", "npm:core-js@0.9.6/modules/$.iter-call", "npm:core-js@0.9.6/modules/$.iter-detect"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$"),
      ctx = require("npm:core-js@0.9.6/modules/$.ctx"),
      $def = require("npm:core-js@0.9.6/modules/$.def"),
      $iter = require("npm:core-js@0.9.6/modules/$.iter"),
      call = require("npm:core-js@0.9.6/modules/$.iter-call");
  $def($def.S + $def.F * !require("npm:core-js@0.9.6/modules/$.iter-detect")(function(iter) {
    Array.from(iter);
  }), 'Array', {from: function from(arrayLike) {
      var O = Object($.assertDefined(arrayLike)),
          mapfn = arguments[1],
          mapping = mapfn !== undefined,
          f = mapping ? ctx(mapfn, arguments[2], 2) : undefined,
          index = 0,
          length,
          result,
          step,
          iterator;
      if ($iter.is(O)) {
        iterator = $iter.get(O);
        result = new (typeof this == 'function' ? this : Array);
        for (; !(step = iterator.next()).done; index++) {
          result[index] = mapping ? call(iterator, f, [step.value, index], true) : step.value;
        }
      } else {
        result = new (typeof this == 'function' ? this : Array)(length = $.toLength(O.length));
        for (; length > index; index++) {
          result[index] = mapping ? f(O[index], index) : O[index];
        }
      }
      result.length = index;
      return result;
    }});
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.array.iterator", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.unscope", "npm:core-js@0.9.6/modules/$.uid", "npm:core-js@0.9.6/modules/$.iter", "npm:core-js@0.9.6/modules/$.iter-define"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$"),
      setUnscope = require("npm:core-js@0.9.6/modules/$.unscope"),
      ITER = require("npm:core-js@0.9.6/modules/$.uid").safe('iter'),
      $iter = require("npm:core-js@0.9.6/modules/$.iter"),
      step = $iter.step,
      Iterators = $iter.Iterators;
  require("npm:core-js@0.9.6/modules/$.iter-define")(Array, 'Array', function(iterated, kind) {
    $.set(this, ITER, {
      o: $.toObject(iterated),
      i: 0,
      k: kind
    });
  }, function() {
    var iter = this[ITER],
        O = iter.o,
        kind = iter.k,
        index = iter.i++;
    if (!O || index >= O.length) {
      iter.o = undefined;
      return step(1);
    }
    if (kind == 'keys')
      return step(0, index);
    if (kind == 'values')
      return step(0, O[index]);
    return step(0, [index, O[index]]);
  }, 'values');
  Iterators.Arguments = Iterators.Array;
  setUnscope('keys');
  setUnscope('values');
  setUnscope('entries');
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.array.species", ["npm:core-js@0.9.6/modules/$.species"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  require("npm:core-js@0.9.6/modules/$.species")(Array);
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.promise", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.ctx", "npm:core-js@0.9.6/modules/$.cof", "npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$.assert", "npm:core-js@0.9.6/modules/$.for-of", "npm:core-js@0.9.6/modules/$.set-proto", "npm:core-js@0.9.6/modules/$.species", "npm:core-js@0.9.6/modules/$.wks", "npm:core-js@0.9.6/modules/$.uid", "npm:core-js@0.9.6/modules/$.task", "npm:core-js@0.9.6/modules/$.iter-detect", "github:jspm/nodelibs-process@0.1.1"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  (function(process) {
    'use strict';
    var $ = require("npm:core-js@0.9.6/modules/$"),
        ctx = require("npm:core-js@0.9.6/modules/$.ctx"),
        cof = require("npm:core-js@0.9.6/modules/$.cof"),
        $def = require("npm:core-js@0.9.6/modules/$.def"),
        assert = require("npm:core-js@0.9.6/modules/$.assert"),
        forOf = require("npm:core-js@0.9.6/modules/$.for-of"),
        setProto = require("npm:core-js@0.9.6/modules/$.set-proto").set,
        species = require("npm:core-js@0.9.6/modules/$.species"),
        SPECIES = require("npm:core-js@0.9.6/modules/$.wks")('species'),
        RECORD = require("npm:core-js@0.9.6/modules/$.uid").safe('record'),
        PROMISE = 'Promise',
        global = $.g,
        process = global.process,
        asap = process && process.nextTick || require("npm:core-js@0.9.6/modules/$.task").set,
        P = global[PROMISE],
        isFunction = $.isFunction,
        isObject = $.isObject,
        assertFunction = assert.fn,
        assertObject = assert.obj;
    var useNative = function() {
      var test,
          works = false;
      function P2(x) {
        var self = new P(x);
        setProto(self, P2.prototype);
        return self;
      }
      try {
        works = isFunction(P) && isFunction(P.resolve) && P.resolve(test = new P(function() {})) == test;
        setProto(P2, P);
        P2.prototype = $.create(P.prototype, {constructor: {value: P2}});
        if (!(P2.resolve(5).then(function() {}) instanceof P2)) {
          works = false;
        }
      } catch (e) {
        works = false;
      }
      return works;
    }();
    function getConstructor(C) {
      var S = assertObject(C)[SPECIES];
      return S != undefined ? S : C;
    }
    function isThenable(it) {
      var then;
      if (isObject(it))
        then = it.then;
      return isFunction(then) ? then : false;
    }
    function notify(record) {
      var chain = record.c;
      if (chain.length)
        asap(function() {
          var value = record.v,
              ok = record.s == 1,
              i = 0;
          function run(react) {
            var cb = ok ? react.ok : react.fail,
                ret,
                then;
            try {
              if (cb) {
                if (!ok)
                  record.h = true;
                ret = cb === true ? value : cb(value);
                if (ret === react.P) {
                  react.rej(TypeError('Promise-chain cycle'));
                } else if (then = isThenable(ret)) {
                  then.call(ret, react.res, react.rej);
                } else
                  react.res(ret);
              } else
                react.rej(value);
            } catch (err) {
              react.rej(err);
            }
          }
          while (chain.length > i)
            run(chain[i++]);
          chain.length = 0;
        });
    }
    function isUnhandled(promise) {
      var record = promise[RECORD],
          chain = record.a || record.c,
          i = 0,
          react;
      if (record.h)
        return false;
      while (chain.length > i) {
        react = chain[i++];
        if (react.fail || !isUnhandled(react.P))
          return false;
      }
      return true;
    }
    function $reject(value) {
      var record = this,
          promise;
      if (record.d)
        return ;
      record.d = true;
      record = record.r || record;
      record.v = value;
      record.s = 2;
      record.a = record.c.slice();
      setTimeout(function() {
        asap(function() {
          if (isUnhandled(promise = record.p)) {
            if (cof(process) == 'process') {
              process.emit('unhandledRejection', value, promise);
            } else if (global.console && isFunction(console.error)) {
              console.error('Unhandled promise rejection', value);
            }
          }
          record.a = undefined;
        });
      }, 1);
      notify(record);
    }
    function $resolve(value) {
      var record = this,
          then,
          wrapper;
      if (record.d)
        return ;
      record.d = true;
      record = record.r || record;
      try {
        if (then = isThenable(value)) {
          wrapper = {
            r: record,
            d: false
          };
          then.call(value, ctx($resolve, wrapper, 1), ctx($reject, wrapper, 1));
        } else {
          record.v = value;
          record.s = 1;
          notify(record);
        }
      } catch (err) {
        $reject.call(wrapper || {
          r: record,
          d: false
        }, err);
      }
    }
    if (!useNative) {
      P = function Promise(executor) {
        assertFunction(executor);
        var record = {
          p: assert.inst(this, P, PROMISE),
          c: [],
          a: undefined,
          s: 0,
          d: false,
          v: undefined,
          h: false
        };
        $.hide(this, RECORD, record);
        try {
          executor(ctx($resolve, record, 1), ctx($reject, record, 1));
        } catch (err) {
          $reject.call(record, err);
        }
      };
      $.mix(P.prototype, {
        then: function then(onFulfilled, onRejected) {
          var S = assertObject(assertObject(this).constructor)[SPECIES];
          var react = {
            ok: isFunction(onFulfilled) ? onFulfilled : true,
            fail: isFunction(onRejected) ? onRejected : false
          };
          var promise = react.P = new (S != undefined ? S : P)(function(res, rej) {
            react.res = assertFunction(res);
            react.rej = assertFunction(rej);
          });
          var record = this[RECORD];
          record.c.push(react);
          if (record.a)
            record.a.push(react);
          record.s && notify(record);
          return promise;
        },
        'catch': function(onRejected) {
          return this.then(undefined, onRejected);
        }
      });
    }
    $def($def.G + $def.W + $def.F * !useNative, {Promise: P});
    cof.set(P, PROMISE);
    species(P);
    species($.core[PROMISE]);
    $def($def.S + $def.F * !useNative, PROMISE, {
      reject: function reject(r) {
        return new (getConstructor(this))(function(res, rej) {
          rej(r);
        });
      },
      resolve: function resolve(x) {
        return isObject(x) && RECORD in x && $.getProto(x) === this.prototype ? x : new (getConstructor(this))(function(res) {
          res(x);
        });
      }
    });
    $def($def.S + $def.F * !(useNative && require("npm:core-js@0.9.6/modules/$.iter-detect")(function(iter) {
      P.all(iter)['catch'](function() {});
    })), PROMISE, {
      all: function all(iterable) {
        var C = getConstructor(this),
            values = [];
        return new C(function(res, rej) {
          forOf(iterable, false, values.push, values);
          var remaining = values.length,
              results = Array(remaining);
          if (remaining)
            $.each.call(values, function(promise, index) {
              C.resolve(promise).then(function(value) {
                results[index] = value;
                --remaining || res(results);
              }, rej);
            });
          else
            res(results);
        });
      },
      race: function race(iterable) {
        var C = getConstructor(this);
        return new C(function(res, rej) {
          forOf(iterable, false, function(promise) {
            C.resolve(promise).then(res, rej);
          });
        });
      }
    });
  })(require("github:jspm/nodelibs-process@0.1.1"));
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.map", ["npm:core-js@0.9.6/modules/$.collection-strong", "npm:core-js@0.9.6/modules/$.collection"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var strong = require("npm:core-js@0.9.6/modules/$.collection-strong");
  require("npm:core-js@0.9.6/modules/$.collection")('Map', {
    get: function get(key) {
      var entry = strong.getEntry(this, key);
      return entry && entry.v;
    },
    set: function set(key, value) {
      return strong.def(this, key === 0 ? 0 : key, value);
    }
  }, strong, true);
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.weak-map", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.collection-weak", "npm:core-js@0.9.6/modules/$.collection"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = require("npm:core-js@0.9.6/modules/$"),
      weak = require("npm:core-js@0.9.6/modules/$.collection-weak"),
      leakStore = weak.leakStore,
      ID = weak.ID,
      WEAK = weak.WEAK,
      has = $.has,
      isObject = $.isObject,
      isFrozen = Object.isFrozen || $.core.Object.isFrozen,
      tmp = {};
  var WeakMap = require("npm:core-js@0.9.6/modules/$.collection")('WeakMap', {
    get: function get(key) {
      if (isObject(key)) {
        if (isFrozen(key))
          return leakStore(this).get(key);
        if (has(key, WEAK))
          return key[WEAK][this[ID]];
      }
    },
    set: function set(key, value) {
      return weak.def(this, key, value);
    }
  }, weak, true, true);
  if ($.FW && new WeakMap().set((Object.freeze || Object)(tmp), 7).get(tmp) != 7) {
    $.each.call(['delete', 'has', 'get', 'set'], function(key) {
      var method = WeakMap.prototype[key];
      WeakMap.prototype[key] = function(a, b) {
        if (isObject(a) && isFrozen(a)) {
          var result = leakStore(this)[key](a, b);
          return key == 'set' ? this : result;
        }
        return method.call(this, a, b);
      };
    });
  }
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es6.reflect", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$.set-proto", "npm:core-js@0.9.6/modules/$.iter", "npm:core-js@0.9.6/modules/$.wks", "npm:core-js@0.9.6/modules/$.uid", "npm:core-js@0.9.6/modules/$.assert", "npm:core-js@0.9.6/modules/$.own-keys"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$"),
      $def = require("npm:core-js@0.9.6/modules/$.def"),
      setProto = require("npm:core-js@0.9.6/modules/$.set-proto"),
      $iter = require("npm:core-js@0.9.6/modules/$.iter"),
      ITERATOR = require("npm:core-js@0.9.6/modules/$.wks")('iterator'),
      ITER = require("npm:core-js@0.9.6/modules/$.uid").safe('iter'),
      step = $iter.step,
      assert = require("npm:core-js@0.9.6/modules/$.assert"),
      isObject = $.isObject,
      getProto = $.getProto,
      $Reflect = $.g.Reflect,
      _apply = Function.apply,
      assertObject = assert.obj,
      _isExtensible = Object.isExtensible || $.isObject,
      _preventExtensions = Object.preventExtensions || $.it,
      buggyEnumerate = !($Reflect && $Reflect.enumerate && ITERATOR in $Reflect.enumerate({}));
  function Enumerate(iterated) {
    $.set(this, ITER, {
      o: iterated,
      k: undefined,
      i: 0
    });
  }
  $iter.create(Enumerate, 'Object', function() {
    var iter = this[ITER],
        keys = iter.k,
        key;
    if (keys == undefined) {
      iter.k = keys = [];
      for (key in iter.o)
        keys.push(key);
    }
    do {
      if (iter.i >= keys.length)
        return step(1);
    } while (!((key = keys[iter.i++]) in iter.o));
    return step(0, key);
  });
  var reflect = {
    apply: function apply(target, thisArgument, argumentsList) {
      return _apply.call(target, thisArgument, argumentsList);
    },
    construct: function construct(target, argumentsList) {
      var proto = assert.fn(arguments.length < 3 ? target : arguments[2]).prototype,
          instance = $.create(isObject(proto) ? proto : Object.prototype),
          result = _apply.call(target, instance, argumentsList);
      return isObject(result) ? result : instance;
    },
    defineProperty: function defineProperty(target, propertyKey, attributes) {
      assertObject(target);
      try {
        $.setDesc(target, propertyKey, attributes);
        return true;
      } catch (e) {
        return false;
      }
    },
    deleteProperty: function deleteProperty(target, propertyKey) {
      var desc = $.getDesc(assertObject(target), propertyKey);
      return desc && !desc.configurable ? false : delete target[propertyKey];
    },
    get: function get(target, propertyKey) {
      var receiver = arguments.length < 3 ? target : arguments[2],
          desc = $.getDesc(assertObject(target), propertyKey),
          proto;
      if (desc)
        return $.has(desc, 'value') ? desc.value : desc.get === undefined ? undefined : desc.get.call(receiver);
      return isObject(proto = getProto(target)) ? get(proto, propertyKey, receiver) : undefined;
    },
    getOwnPropertyDescriptor: function getOwnPropertyDescriptor(target, propertyKey) {
      return $.getDesc(assertObject(target), propertyKey);
    },
    getPrototypeOf: function getPrototypeOf(target) {
      return getProto(assertObject(target));
    },
    has: function has(target, propertyKey) {
      return propertyKey in target;
    },
    isExtensible: function isExtensible(target) {
      return _isExtensible(assertObject(target));
    },
    ownKeys: require("npm:core-js@0.9.6/modules/$.own-keys"),
    preventExtensions: function preventExtensions(target) {
      assertObject(target);
      try {
        _preventExtensions(target);
        return true;
      } catch (e) {
        return false;
      }
    },
    set: function set(target, propertyKey, V) {
      var receiver = arguments.length < 4 ? target : arguments[3],
          ownDesc = $.getDesc(assertObject(target), propertyKey),
          existingDescriptor,
          proto;
      if (!ownDesc) {
        if (isObject(proto = getProto(target))) {
          return set(proto, propertyKey, V, receiver);
        }
        ownDesc = $.desc(0);
      }
      if ($.has(ownDesc, 'value')) {
        if (ownDesc.writable === false || !isObject(receiver))
          return false;
        existingDescriptor = $.getDesc(receiver, propertyKey) || $.desc(0);
        existingDescriptor.value = V;
        $.setDesc(receiver, propertyKey, existingDescriptor);
        return true;
      }
      return ownDesc.set === undefined ? false : (ownDesc.set.call(receiver, V), true);
    }
  };
  if (setProto)
    reflect.setPrototypeOf = function setPrototypeOf(target, proto) {
      setProto.check(target, proto);
      try {
        setProto.set(target, proto);
        return true;
      } catch (e) {
        return false;
      }
    };
  $def($def.G, {Reflect: {}});
  $def($def.S + $def.F * buggyEnumerate, 'Reflect', {enumerate: function enumerate(target) {
      return new Enumerate(assertObject(target));
    }});
  $def($def.S, 'Reflect', reflect);
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es7.string.lpad", ["npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$.string-pad"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $def = require("npm:core-js@0.9.6/modules/$.def"),
      $pad = require("npm:core-js@0.9.6/modules/$.string-pad");
  $def($def.P, 'String', {lpad: function lpad(n) {
      return $pad(this, n, arguments[1], true);
    }});
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es7.map.to-json", ["npm:core-js@0.9.6/modules/$.collection-to-json"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  require("npm:core-js@0.9.6/modules/$.collection-to-json")('Map');
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/web.timers", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$.invoke", "npm:core-js@0.9.6/modules/$.partial"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$"),
      $def = require("npm:core-js@0.9.6/modules/$.def"),
      invoke = require("npm:core-js@0.9.6/modules/$.invoke"),
      partial = require("npm:core-js@0.9.6/modules/$.partial"),
      navigator = $.g.navigator,
      MSIE = !!navigator && /MSIE .\./.test(navigator.userAgent);
  function wrap(set) {
    return MSIE ? function(fn, time) {
      return set(invoke(partial, [].slice.call(arguments, 2), $.isFunction(fn) ? fn : Function(fn)), time);
    } : set;
  }
  $def($def.G + $def.B + $def.F * MSIE, {
    setTimeout: wrap($.g.setTimeout),
    setInterval: wrap($.g.setInterval)
  });
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/es6.symbol", ["npm:core-js@0.9.6/library/modules/$", "npm:core-js@0.9.6/library/modules/$.cof", "npm:core-js@0.9.6/library/modules/$.uid", "npm:core-js@0.9.6/library/modules/$.def", "npm:core-js@0.9.6/library/modules/$.keyof", "npm:core-js@0.9.6/library/modules/$.enum-keys", "npm:core-js@0.9.6/library/modules/$.assert", "npm:core-js@0.9.6/library/modules/$.wks"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = require("npm:core-js@0.9.6/library/modules/$"),
      setTag = require("npm:core-js@0.9.6/library/modules/$.cof").set,
      uid = require("npm:core-js@0.9.6/library/modules/$.uid"),
      $def = require("npm:core-js@0.9.6/library/modules/$.def"),
      keyOf = require("npm:core-js@0.9.6/library/modules/$.keyof"),
      enumKeys = require("npm:core-js@0.9.6/library/modules/$.enum-keys"),
      assertObject = require("npm:core-js@0.9.6/library/modules/$.assert").obj,
      has = $.has,
      $create = $.create,
      getDesc = $.getDesc,
      setDesc = $.setDesc,
      desc = $.desc,
      getNames = $.getNames,
      toObject = $.toObject,
      $Symbol = $.g.Symbol,
      setter = false,
      TAG = uid('tag'),
      HIDDEN = uid('hidden'),
      SymbolRegistry = {},
      AllSymbols = {},
      useNative = $.isFunction($Symbol);
  function wrap(tag) {
    var sym = AllSymbols[tag] = $.set($create($Symbol.prototype), TAG, tag);
    $.DESC && setter && setDesc(Object.prototype, tag, {
      configurable: true,
      set: function(value) {
        if (has(this, HIDDEN) && has(this[HIDDEN], tag))
          this[HIDDEN][tag] = false;
        setDesc(this, tag, desc(1, value));
      }
    });
    return sym;
  }
  function defineProperty(it, key, D) {
    if (D && has(AllSymbols, key)) {
      if (!D.enumerable) {
        if (!has(it, HIDDEN))
          setDesc(it, HIDDEN, desc(1, {}));
        it[HIDDEN][key] = true;
      } else {
        if (has(it, HIDDEN) && it[HIDDEN][key])
          it[HIDDEN][key] = false;
        D.enumerable = false;
      }
    }
    return setDesc(it, key, D);
  }
  function defineProperties(it, P) {
    assertObject(it);
    var keys = enumKeys(P = toObject(P)),
        i = 0,
        l = keys.length,
        key;
    while (l > i)
      defineProperty(it, key = keys[i++], P[key]);
    return it;
  }
  function create(it, P) {
    return P === undefined ? $create(it) : defineProperties($create(it), P);
  }
  function getOwnPropertyDescriptor(it, key) {
    var D = getDesc(it = toObject(it), key);
    if (D && has(AllSymbols, key) && !(has(it, HIDDEN) && it[HIDDEN][key]))
      D.enumerable = true;
    return D;
  }
  function getOwnPropertyNames(it) {
    var names = getNames(toObject(it)),
        result = [],
        i = 0,
        key;
    while (names.length > i)
      if (!has(AllSymbols, key = names[i++]) && key != HIDDEN)
        result.push(key);
    return result;
  }
  function getOwnPropertySymbols(it) {
    var names = getNames(toObject(it)),
        result = [],
        i = 0,
        key;
    while (names.length > i)
      if (has(AllSymbols, key = names[i++]))
        result.push(AllSymbols[key]);
    return result;
  }
  if (!useNative) {
    $Symbol = function Symbol(description) {
      if (this instanceof $Symbol)
        throw TypeError('Symbol is not a constructor');
      return wrap(uid(description));
    };
    $.hide($Symbol.prototype, 'toString', function() {
      return this[TAG];
    });
    $.create = create;
    $.setDesc = defineProperty;
    $.getDesc = getOwnPropertyDescriptor;
    $.setDescs = defineProperties;
    $.getNames = getOwnPropertyNames;
    $.getSymbols = getOwnPropertySymbols;
  }
  var symbolStatics = {
    'for': function(key) {
      return has(SymbolRegistry, key += '') ? SymbolRegistry[key] : SymbolRegistry[key] = $Symbol(key);
    },
    keyFor: function keyFor(key) {
      return keyOf(SymbolRegistry, key);
    },
    useSetter: function() {
      setter = true;
    },
    useSimple: function() {
      setter = false;
    }
  };
  $.each.call(('hasInstance,isConcatSpreadable,iterator,match,replace,search,' + 'species,split,toPrimitive,toStringTag,unscopables').split(','), function(it) {
    var sym = require("npm:core-js@0.9.6/library/modules/$.wks")(it);
    symbolStatics[it] = useNative ? sym : wrap(sym);
  });
  setter = true;
  $def($def.G + $def.W, {Symbol: $Symbol});
  $def($def.S, 'Symbol', symbolStatics);
  $def($def.S + $def.F * !useNative, 'Object', {
    create: create,
    defineProperty: defineProperty,
    defineProperties: defineProperties,
    getOwnPropertyDescriptor: getOwnPropertyDescriptor,
    getOwnPropertyNames: getOwnPropertyNames,
    getOwnPropertySymbols: getOwnPropertySymbols
  });
  setTag($Symbol, 'Symbol');
  setTag(Math, 'Math', true);
  setTag($.g.JSON, 'JSON', true);
  global.define = __define;
  return module.exports;
});

System.register("npm:babel-runtime@5.2.9/core-js/symbol/iterator", ["npm:core-js@0.9.6/library/fn/symbol/iterator"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": require("npm:core-js@0.9.6/library/fn/symbol/iterator"),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:babel-runtime@5.2.9/core-js/object/create", ["npm:core-js@0.9.6/library/fn/object/create"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": require("npm:core-js@0.9.6/library/fn/object/create"),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/fn/object/define-property", ["npm:core-js@0.9.6/library/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/library/modules/$");
  module.exports = function defineProperty(it, key, desc) {
    return $.setDesc(it, key, desc);
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/$.cof", ["npm:core-js@0.9.6/library/modules/$", "npm:core-js@0.9.6/library/modules/$.wks"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/library/modules/$"),
      TAG = require("npm:core-js@0.9.6/library/modules/$.wks")('toStringTag'),
      toString = {}.toString;
  function cof(it) {
    return toString.call(it).slice(8, -1);
  }
  cof.classof = function(it) {
    var O,
        T;
    return it == undefined ? it === undefined ? 'Undefined' : 'Null' : typeof(T = (O = Object(it))[TAG]) == 'string' ? T : cof(O);
  };
  cof.set = function(it, tag, stat) {
    if (it && !$.has(it = stat ? it : it.prototype, TAG))
      $.hide(it, TAG, tag);
  };
  module.exports = cof;
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/es6.string.iterator", ["npm:core-js@0.9.6/library/modules/$", "npm:core-js@0.9.6/library/modules/$.string-at", "npm:core-js@0.9.6/library/modules/$.uid", "npm:core-js@0.9.6/library/modules/$.iter", "npm:core-js@0.9.6/library/modules/$.iter-define"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var set = require("npm:core-js@0.9.6/library/modules/$").set,
      $at = require("npm:core-js@0.9.6/library/modules/$.string-at")(true),
      ITER = require("npm:core-js@0.9.6/library/modules/$.uid").safe('iter'),
      $iter = require("npm:core-js@0.9.6/library/modules/$.iter"),
      step = $iter.step;
  require("npm:core-js@0.9.6/library/modules/$.iter-define")(String, 'String', function(iterated) {
    set(this, ITER, {
      o: String(iterated),
      i: 0
    });
  }, function() {
    var iter = this[ITER],
        O = iter.o,
        index = iter.i,
        point;
    if (index >= O.length)
      return step(1);
    point = $at(O, index);
    iter.i += point.length;
    return step(0, point);
  });
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/web.dom.iterable", ["npm:core-js@0.9.6/library/modules/es6.array.iterator", "npm:core-js@0.9.6/library/modules/$", "npm:core-js@0.9.6/library/modules/$.iter", "npm:core-js@0.9.6/library/modules/$.wks"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  require("npm:core-js@0.9.6/library/modules/es6.array.iterator");
  var $ = require("npm:core-js@0.9.6/library/modules/$"),
      Iterators = require("npm:core-js@0.9.6/library/modules/$.iter").Iterators,
      ITERATOR = require("npm:core-js@0.9.6/library/modules/$.wks")('iterator'),
      ArrayValues = Iterators.Array,
      NodeList = $.g.NodeList;
  if ($.FW && NodeList && !(ITERATOR in NodeList.prototype)) {
    $.hide(NodeList.prototype, ITERATOR, ArrayValues);
  }
  Iterators.NodeList = ArrayValues;
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/$.collection-strong", ["npm:core-js@0.9.6/library/modules/$", "npm:core-js@0.9.6/library/modules/$.ctx", "npm:core-js@0.9.6/library/modules/$.uid", "npm:core-js@0.9.6/library/modules/$.assert", "npm:core-js@0.9.6/library/modules/$.for-of", "npm:core-js@0.9.6/library/modules/$.iter", "npm:core-js@0.9.6/library/modules/$.iter-define"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = require("npm:core-js@0.9.6/library/modules/$"),
      ctx = require("npm:core-js@0.9.6/library/modules/$.ctx"),
      safe = require("npm:core-js@0.9.6/library/modules/$.uid").safe,
      assert = require("npm:core-js@0.9.6/library/modules/$.assert"),
      forOf = require("npm:core-js@0.9.6/library/modules/$.for-of"),
      step = require("npm:core-js@0.9.6/library/modules/$.iter").step,
      has = $.has,
      set = $.set,
      isObject = $.isObject,
      hide = $.hide,
      isFrozen = Object.isFrozen || $.core.Object.isFrozen,
      ID = safe('id'),
      O1 = safe('O1'),
      LAST = safe('last'),
      FIRST = safe('first'),
      ITER = safe('iter'),
      SIZE = $.DESC ? safe('size') : 'size',
      id = 0;
  function fastKey(it, create) {
    if (!isObject(it))
      return (typeof it == 'string' ? 'S' : 'P') + it;
    if (isFrozen(it))
      return 'F';
    if (!has(it, ID)) {
      if (!create)
        return 'E';
      hide(it, ID, ++id);
    }
    return 'O' + it[ID];
  }
  function getEntry(that, key) {
    var index = fastKey(key),
        entry;
    if (index != 'F')
      return that[O1][index];
    for (entry = that[FIRST]; entry; entry = entry.n) {
      if (entry.k == key)
        return entry;
    }
  }
  module.exports = {
    getConstructor: function(NAME, IS_MAP, ADDER) {
      function C() {
        var that = assert.inst(this, C, NAME),
            iterable = arguments[0];
        set(that, O1, $.create(null));
        set(that, SIZE, 0);
        set(that, LAST, undefined);
        set(that, FIRST, undefined);
        if (iterable != undefined)
          forOf(iterable, IS_MAP, that[ADDER], that);
      }
      $.mix(C.prototype, {
        clear: function clear() {
          for (var that = this,
              data = that[O1],
              entry = that[FIRST]; entry; entry = entry.n) {
            entry.r = true;
            if (entry.p)
              entry.p = entry.p.n = undefined;
            delete data[entry.i];
          }
          that[FIRST] = that[LAST] = undefined;
          that[SIZE] = 0;
        },
        'delete': function(key) {
          var that = this,
              entry = getEntry(that, key);
          if (entry) {
            var next = entry.n,
                prev = entry.p;
            delete that[O1][entry.i];
            entry.r = true;
            if (prev)
              prev.n = next;
            if (next)
              next.p = prev;
            if (that[FIRST] == entry)
              that[FIRST] = next;
            if (that[LAST] == entry)
              that[LAST] = prev;
            that[SIZE]--;
          }
          return !!entry;
        },
        forEach: function forEach(callbackfn) {
          var f = ctx(callbackfn, arguments[1], 3),
              entry;
          while (entry = entry ? entry.n : this[FIRST]) {
            f(entry.v, entry.k, this);
            while (entry && entry.r)
              entry = entry.p;
          }
        },
        has: function has(key) {
          return !!getEntry(this, key);
        }
      });
      if ($.DESC)
        $.setDesc(C.prototype, 'size', {get: function() {
            return assert.def(this[SIZE]);
          }});
      return C;
    },
    def: function(that, key, value) {
      var entry = getEntry(that, key),
          prev,
          index;
      if (entry) {
        entry.v = value;
      } else {
        that[LAST] = entry = {
          i: index = fastKey(key, true),
          k: key,
          v: value,
          p: prev = that[LAST],
          n: undefined,
          r: false
        };
        if (!that[FIRST])
          that[FIRST] = entry;
        if (prev)
          prev.n = entry;
        that[SIZE]++;
        if (index != 'F')
          that[O1][index] = entry;
      }
      return that;
    },
    getEntry: getEntry,
    setIter: function(C, NAME, IS_MAP) {
      require("npm:core-js@0.9.6/library/modules/$.iter-define")(C, NAME, function(iterated, kind) {
        set(this, ITER, {
          o: iterated,
          k: kind
        });
      }, function() {
        var iter = this[ITER],
            kind = iter.k,
            entry = iter.l;
        while (entry && entry.r)
          entry = entry.p;
        if (!iter.o || !(iter.l = entry = entry ? entry.n : iter.o[FIRST])) {
          iter.o = undefined;
          return step(1);
        }
        if (kind == 'keys')
          return step(0, entry.k);
        if (kind == 'values')
          return step(0, entry.v);
        return step(0, [entry.k, entry.v]);
      }, IS_MAP ? 'entries' : 'values', !IS_MAP, true);
    }
  };
  global.define = __define;
  return module.exports;
});

System.register("github:jspm/nodelibs-process@0.1.1/index", ["npm:process@0.10.1"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = System._nodeRequire ? process : require("npm:process@0.10.1");
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/es6.object.assign", ["npm:core-js@0.9.6/library/modules/$.def", "npm:core-js@0.9.6/library/modules/$.assign"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $def = require("npm:core-js@0.9.6/library/modules/$.def");
  $def($def.S, 'Object', {assign: require("npm:core-js@0.9.6/library/modules/$.assign")});
  global.define = __define;
  return module.exports;
});

System.register("npm:handlebars@2.0.0/dist/cjs/handlebars/base", ["npm:handlebars@2.0.0/dist/cjs/handlebars/utils", "npm:handlebars@2.0.0/dist/cjs/handlebars/exception"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  "use strict";
  var Utils = require("npm:handlebars@2.0.0/dist/cjs/handlebars/utils");
  var Exception = require("npm:handlebars@2.0.0/dist/cjs/handlebars/exception")["default"];
  var VERSION = "2.0.0";
  exports.VERSION = VERSION;
  var COMPILER_REVISION = 6;
  exports.COMPILER_REVISION = COMPILER_REVISION;
  var REVISION_CHANGES = {
    1: '<= 1.0.rc.2',
    2: '== 1.0.0-rc.3',
    3: '== 1.0.0-rc.4',
    4: '== 1.x.x',
    5: '== 2.0.0-alpha.x',
    6: '>= 2.0.0-beta.1'
  };
  exports.REVISION_CHANGES = REVISION_CHANGES;
  var isArray = Utils.isArray,
      isFunction = Utils.isFunction,
      toString = Utils.toString,
      objectType = '[object Object]';
  function HandlebarsEnvironment(helpers, partials) {
    this.helpers = helpers || {};
    this.partials = partials || {};
    registerDefaultHelpers(this);
  }
  exports.HandlebarsEnvironment = HandlebarsEnvironment;
  HandlebarsEnvironment.prototype = {
    constructor: HandlebarsEnvironment,
    logger: logger,
    log: log,
    registerHelper: function(name, fn) {
      if (toString.call(name) === objectType) {
        if (fn) {
          throw new Exception('Arg not supported with multiple helpers');
        }
        Utils.extend(this.helpers, name);
      } else {
        this.helpers[name] = fn;
      }
    },
    unregisterHelper: function(name) {
      delete this.helpers[name];
    },
    registerPartial: function(name, partial) {
      if (toString.call(name) === objectType) {
        Utils.extend(this.partials, name);
      } else {
        this.partials[name] = partial;
      }
    },
    unregisterPartial: function(name) {
      delete this.partials[name];
    }
  };
  function registerDefaultHelpers(instance) {
    instance.registerHelper('helperMissing', function() {
      if (arguments.length === 1) {
        return undefined;
      } else {
        throw new Exception("Missing helper: '" + arguments[arguments.length - 1].name + "'");
      }
    });
    instance.registerHelper('blockHelperMissing', function(context, options) {
      var inverse = options.inverse,
          fn = options.fn;
      if (context === true) {
        return fn(this);
      } else if (context === false || context == null) {
        return inverse(this);
      } else if (isArray(context)) {
        if (context.length > 0) {
          if (options.ids) {
            options.ids = [options.name];
          }
          return instance.helpers.each(context, options);
        } else {
          return inverse(this);
        }
      } else {
        if (options.data && options.ids) {
          var data = createFrame(options.data);
          data.contextPath = Utils.appendContextPath(options.data.contextPath, options.name);
          options = {data: data};
        }
        return fn(context, options);
      }
    });
    instance.registerHelper('each', function(context, options) {
      if (!options) {
        throw new Exception('Must pass iterator to #each');
      }
      var fn = options.fn,
          inverse = options.inverse;
      var i = 0,
          ret = "",
          data;
      var contextPath;
      if (options.data && options.ids) {
        contextPath = Utils.appendContextPath(options.data.contextPath, options.ids[0]) + '.';
      }
      if (isFunction(context)) {
        context = context.call(this);
      }
      if (options.data) {
        data = createFrame(options.data);
      }
      if (context && typeof context === 'object') {
        if (isArray(context)) {
          for (var j = context.length; i < j; i++) {
            if (data) {
              data.index = i;
              data.first = (i === 0);
              data.last = (i === (context.length - 1));
              if (contextPath) {
                data.contextPath = contextPath + i;
              }
            }
            ret = ret + fn(context[i], {data: data});
          }
        } else {
          for (var key in context) {
            if (context.hasOwnProperty(key)) {
              if (data) {
                data.key = key;
                data.index = i;
                data.first = (i === 0);
                if (contextPath) {
                  data.contextPath = contextPath + key;
                }
              }
              ret = ret + fn(context[key], {data: data});
              i++;
            }
          }
        }
      }
      if (i === 0) {
        ret = inverse(this);
      }
      return ret;
    });
    instance.registerHelper('if', function(conditional, options) {
      if (isFunction(conditional)) {
        conditional = conditional.call(this);
      }
      if ((!options.hash.includeZero && !conditional) || Utils.isEmpty(conditional)) {
        return options.inverse(this);
      } else {
        return options.fn(this);
      }
    });
    instance.registerHelper('unless', function(conditional, options) {
      return instance.helpers['if'].call(this, conditional, {
        fn: options.inverse,
        inverse: options.fn,
        hash: options.hash
      });
    });
    instance.registerHelper('with', function(context, options) {
      if (isFunction(context)) {
        context = context.call(this);
      }
      var fn = options.fn;
      if (!Utils.isEmpty(context)) {
        if (options.data && options.ids) {
          var data = createFrame(options.data);
          data.contextPath = Utils.appendContextPath(options.data.contextPath, options.ids[0]);
          options = {data: data};
        }
        return fn(context, options);
      } else {
        return options.inverse(this);
      }
    });
    instance.registerHelper('log', function(message, options) {
      var level = options.data && options.data.level != null ? parseInt(options.data.level, 10) : 1;
      instance.log(level, message);
    });
    instance.registerHelper('lookup', function(obj, field) {
      return obj && obj[field];
    });
  }
  var logger = {
    methodMap: {
      0: 'debug',
      1: 'info',
      2: 'warn',
      3: 'error'
    },
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    level: 3,
    log: function(level, message) {
      if (logger.level <= level) {
        var method = logger.methodMap[level];
        if (typeof console !== 'undefined' && console[method]) {
          console[method].call(console, message);
        }
      }
    }
  };
  exports.logger = logger;
  var log = logger.log;
  exports.log = log;
  var createFrame = function(object) {
    var frame = Utils.extend({}, object);
    frame._parent = object;
    return frame;
  };
  exports.createFrame = createFrame;
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.cof", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.wks"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$"),
      TAG = require("npm:core-js@0.9.6/modules/$.wks")('toStringTag'),
      toString = {}.toString;
  function cof(it) {
    return toString.call(it).slice(8, -1);
  }
  cof.classof = function(it) {
    var O,
        T;
    return it == undefined ? it === undefined ? 'Undefined' : 'Null' : typeof(T = (O = Object(it))[TAG]) == 'string' ? T : cof(O);
  };
  cof.set = function(it, tag, stat) {
    if (it && !$.has(it = stat ? it : it.prototype, TAG))
      $.hide(it, TAG, tag);
  };
  module.exports = cof;
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/$.array-methods", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.ctx"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$"),
      ctx = require("npm:core-js@0.9.6/modules/$.ctx");
  module.exports = function(TYPE) {
    var IS_MAP = TYPE == 1,
        IS_FILTER = TYPE == 2,
        IS_SOME = TYPE == 3,
        IS_EVERY = TYPE == 4,
        IS_FIND_INDEX = TYPE == 6,
        NO_HOLES = TYPE == 5 || IS_FIND_INDEX;
    return function($this, callbackfn, that) {
      var O = Object($.assertDefined($this)),
          self = $.ES5Object(O),
          f = ctx(callbackfn, that, 3),
          length = $.toLength(self.length),
          index = 0,
          result = IS_MAP ? Array(length) : IS_FILTER ? [] : undefined,
          val,
          res;
      for (; length > index; index++)
        if (NO_HOLES || index in self) {
          val = self[index];
          res = f(val, index, O);
          if (TYPE) {
            if (IS_MAP)
              result[index] = res;
            else if (res)
              switch (TYPE) {
                case 3:
                  return true;
                case 5:
                  return val;
                case 6:
                  return index;
                case 2:
                  result.push(val);
              }
            else if (IS_EVERY)
              return false;
          }
        }
      return IS_FIND_INDEX ? -1 : IS_SOME || IS_EVERY ? IS_EVERY : result;
    };
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/fn/symbol/index", ["npm:core-js@0.9.6/library/modules/es6.symbol", "npm:core-js@0.9.6/library/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  require("npm:core-js@0.9.6/library/modules/es6.symbol");
  module.exports = require("npm:core-js@0.9.6/library/modules/$").core.Symbol;
  global.define = __define;
  return module.exports;
});

System.register("npm:babel-runtime@5.2.9/core-js/object/define-property", ["npm:core-js@0.9.6/library/fn/object/define-property"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": require("npm:core-js@0.9.6/library/fn/object/define-property"),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/es6.object.to-string", ["npm:core-js@0.9.6/library/modules/$", "npm:core-js@0.9.6/library/modules/$.cof", "npm:core-js@0.9.6/library/modules/$.wks"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = require("npm:core-js@0.9.6/library/modules/$"),
      cof = require("npm:core-js@0.9.6/library/modules/$.cof"),
      tmp = {};
  tmp[require("npm:core-js@0.9.6/library/modules/$.wks")('toStringTag')] = 'z';
  if ($.FW && cof(tmp) != 'z')
    $.hide(Object.prototype, 'toString', function toString() {
      return '[object ' + cof.classof(this) + ']';
    });
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/es6.map", ["npm:core-js@0.9.6/library/modules/$.collection-strong", "npm:core-js@0.9.6/library/modules/$.collection"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var strong = require("npm:core-js@0.9.6/library/modules/$.collection-strong");
  require("npm:core-js@0.9.6/library/modules/$.collection")('Map', {
    get: function get(key) {
      var entry = strong.getEntry(this, key);
      return entry && entry.v;
    },
    set: function set(key, value) {
      return strong.def(this, key === 0 ? 0 : key, value);
    }
  }, strong, true);
  global.define = __define;
  return module.exports;
});

System.register("github:jspm/nodelibs-process@0.1.1", ["github:jspm/nodelibs-process@0.1.1/index"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = require("github:jspm/nodelibs-process@0.1.1/index");
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/fn/object/assign", ["npm:core-js@0.9.6/library/modules/es6.object.assign", "npm:core-js@0.9.6/library/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  require("npm:core-js@0.9.6/library/modules/es6.object.assign");
  module.exports = require("npm:core-js@0.9.6/library/modules/$").core.Object.assign;
  global.define = __define;
  return module.exports;
});

System.register("npm:handlebars@2.0.0/dist/cjs/handlebars.runtime", ["npm:handlebars@2.0.0/dist/cjs/handlebars/base", "npm:handlebars@2.0.0/dist/cjs/handlebars/safe-string", "npm:handlebars@2.0.0/dist/cjs/handlebars/exception", "npm:handlebars@2.0.0/dist/cjs/handlebars/utils", "npm:handlebars@2.0.0/dist/cjs/handlebars/runtime"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  "use strict";
  var base = require("npm:handlebars@2.0.0/dist/cjs/handlebars/base");
  var SafeString = require("npm:handlebars@2.0.0/dist/cjs/handlebars/safe-string")["default"];
  var Exception = require("npm:handlebars@2.0.0/dist/cjs/handlebars/exception")["default"];
  var Utils = require("npm:handlebars@2.0.0/dist/cjs/handlebars/utils");
  var runtime = require("npm:handlebars@2.0.0/dist/cjs/handlebars/runtime");
  var create = function() {
    var hb = new base.HandlebarsEnvironment();
    Utils.extend(hb, base);
    hb.SafeString = SafeString;
    hb.Exception = Exception;
    hb.Utils = Utils;
    hb.escapeExpression = Utils.escapeExpression;
    hb.VM = runtime;
    hb.template = function(spec) {
      return runtime.template(spec, hb);
    };
    return hb;
  };
  var Handlebars = create();
  Handlebars.create = create;
  Handlebars['default'] = Handlebars;
  exports["default"] = Handlebars;
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/modules/es5", ["npm:core-js@0.9.6/modules/$", "npm:core-js@0.9.6/modules/$.dom-create", "npm:core-js@0.9.6/modules/$.cof", "npm:core-js@0.9.6/modules/$.def", "npm:core-js@0.9.6/modules/$.invoke", "npm:core-js@0.9.6/modules/$.array-methods", "npm:core-js@0.9.6/modules/$.uid", "npm:core-js@0.9.6/modules/$.assert", "npm:core-js@0.9.6/modules/$.array-includes", "npm:core-js@0.9.6/modules/$.replacer", "npm:core-js@0.9.6/modules/$.throws"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.6/modules/$"),
      cel = require("npm:core-js@0.9.6/modules/$.dom-create"),
      cof = require("npm:core-js@0.9.6/modules/$.cof"),
      $def = require("npm:core-js@0.9.6/modules/$.def"),
      invoke = require("npm:core-js@0.9.6/modules/$.invoke"),
      arrayMethod = require("npm:core-js@0.9.6/modules/$.array-methods"),
      IE_PROTO = require("npm:core-js@0.9.6/modules/$.uid").safe('__proto__'),
      assert = require("npm:core-js@0.9.6/modules/$.assert"),
      assertObject = assert.obj,
      ObjectProto = Object.prototype,
      A = [],
      slice = A.slice,
      indexOf = A.indexOf,
      classof = cof.classof,
      has = $.has,
      defineProperty = $.setDesc,
      getOwnDescriptor = $.getDesc,
      defineProperties = $.setDescs,
      isFunction = $.isFunction,
      toObject = $.toObject,
      toLength = $.toLength,
      IE8_DOM_DEFINE = false,
      $indexOf = require("npm:core-js@0.9.6/modules/$.array-includes")(false),
      $forEach = arrayMethod(0),
      $map = arrayMethod(1),
      $filter = arrayMethod(2),
      $some = arrayMethod(3),
      $every = arrayMethod(4);
  if (!$.DESC) {
    try {
      IE8_DOM_DEFINE = defineProperty(cel('div'), 'x', {get: function() {
          return 8;
        }}).x == 8;
    } catch (e) {}
    $.setDesc = function(O, P, Attributes) {
      if (IE8_DOM_DEFINE)
        try {
          return defineProperty(O, P, Attributes);
        } catch (e) {}
      if ('get' in Attributes || 'set' in Attributes)
        throw TypeError('Accessors not supported!');
      if ('value' in Attributes)
        assertObject(O)[P] = Attributes.value;
      return O;
    };
    $.getDesc = function(O, P) {
      if (IE8_DOM_DEFINE)
        try {
          return getOwnDescriptor(O, P);
        } catch (e) {}
      if (has(O, P))
        return $.desc(!ObjectProto.propertyIsEnumerable.call(O, P), O[P]);
    };
    $.setDescs = defineProperties = function(O, Properties) {
      assertObject(O);
      var keys = $.getKeys(Properties),
          length = keys.length,
          i = 0,
          P;
      while (length > i)
        $.setDesc(O, P = keys[i++], Properties[P]);
      return O;
    };
  }
  $def($def.S + $def.F * !$.DESC, 'Object', {
    getOwnPropertyDescriptor: $.getDesc,
    defineProperty: $.setDesc,
    defineProperties: defineProperties
  });
  var keys1 = ('constructor,hasOwnProperty,isPrototypeOf,propertyIsEnumerable,' + 'toLocaleString,toString,valueOf').split(','),
      keys2 = keys1.concat('length', 'prototype'),
      keysLen1 = keys1.length;
  var createDict = function() {
    var iframe = cel('iframe'),
        i = keysLen1,
        gt = '>',
        iframeDocument;
    iframe.style.display = 'none';
    $.html.appendChild(iframe);
    iframe.src = 'javascript:';
    iframeDocument = iframe.contentWindow.document;
    iframeDocument.open();
    iframeDocument.write('<script>document.F=Object</script' + gt);
    iframeDocument.close();
    createDict = iframeDocument.F;
    while (i--)
      delete createDict.prototype[keys1[i]];
    return createDict();
  };
  function createGetKeys(names, length) {
    return function(object) {
      var O = toObject(object),
          i = 0,
          result = [],
          key;
      for (key in O)
        if (key != IE_PROTO)
          has(O, key) && result.push(key);
      while (length > i)
        if (has(O, key = names[i++])) {
          ~indexOf.call(result, key) || result.push(key);
        }
      return result;
    };
  }
  function isPrimitive(it) {
    return !$.isObject(it);
  }
  function Empty() {}
  $def($def.S, 'Object', {
    getPrototypeOf: $.getProto = $.getProto || function(O) {
      O = Object(assert.def(O));
      if (has(O, IE_PROTO))
        return O[IE_PROTO];
      if (isFunction(O.constructor) && O instanceof O.constructor) {
        return O.constructor.prototype;
      }
      return O instanceof Object ? ObjectProto : null;
    },
    getOwnPropertyNames: $.getNames = $.getNames || createGetKeys(keys2, keys2.length, true),
    create: $.create = $.create || function(O, Properties) {
      var result;
      if (O !== null) {
        Empty.prototype = assertObject(O);
        result = new Empty();
        Empty.prototype = null;
        result[IE_PROTO] = O;
      } else
        result = createDict();
      return Properties === undefined ? result : defineProperties(result, Properties);
    },
    keys: $.getKeys = $.getKeys || createGetKeys(keys1, keysLen1, false),
    seal: $.it,
    freeze: $.it,
    preventExtensions: $.it,
    isSealed: isPrimitive,
    isFrozen: isPrimitive,
    isExtensible: $.isObject
  });
  $def($def.P, 'Function', {bind: function(that) {
      var fn = assert.fn(this),
          partArgs = slice.call(arguments, 1);
      function bound() {
        var args = partArgs.concat(slice.call(arguments));
        return invoke(fn, args, this instanceof bound ? $.create(fn.prototype) : that);
      }
      if (fn.prototype)
        bound.prototype = fn.prototype;
      return bound;
    }});
  function arrayMethodFix(fn) {
    return function() {
      return fn.apply($.ES5Object(this), arguments);
    };
  }
  if (!(0 in Object('z') && 'z'[0] == 'z')) {
    $.ES5Object = function(it) {
      return cof(it) == 'String' ? it.split('') : Object(it);
    };
  }
  $def($def.P + $def.F * ($.ES5Object != Object), 'Array', {
    slice: arrayMethodFix(slice),
    join: arrayMethodFix(A.join)
  });
  $def($def.S, 'Array', {isArray: function(arg) {
      return cof(arg) == 'Array';
    }});
  function createArrayReduce(isRight) {
    return function(callbackfn, memo) {
      assert.fn(callbackfn);
      var O = toObject(this),
          length = toLength(O.length),
          index = isRight ? length - 1 : 0,
          i = isRight ? -1 : 1;
      if (arguments.length < 2)
        for (; ; ) {
          if (index in O) {
            memo = O[index];
            index += i;
            break;
          }
          index += i;
          assert(isRight ? index >= 0 : length > index, 'Reduce of empty array with no initial value');
        }
      for (; isRight ? index >= 0 : length > index; index += i)
        if (index in O) {
          memo = callbackfn(memo, O[index], index, this);
        }
      return memo;
    };
  }
  $def($def.P, 'Array', {
    forEach: $.each = $.each || function forEach(callbackfn) {
      return $forEach(this, callbackfn, arguments[1]);
    },
    map: function map(callbackfn) {
      return $map(this, callbackfn, arguments[1]);
    },
    filter: function filter(callbackfn) {
      return $filter(this, callbackfn, arguments[1]);
    },
    some: function some(callbackfn) {
      return $some(this, callbackfn, arguments[1]);
    },
    every: function every(callbackfn) {
      return $every(this, callbackfn, arguments[1]);
    },
    reduce: createArrayReduce(false),
    reduceRight: createArrayReduce(true),
    indexOf: indexOf = indexOf || function indexOf(el) {
      return $indexOf(this, el, arguments[1]);
    },
    lastIndexOf: function(el, fromIndex) {
      var O = toObject(this),
          length = toLength(O.length),
          index = length - 1;
      if (arguments.length > 1)
        index = Math.min(index, $.toInteger(fromIndex));
      if (index < 0)
        index = toLength(length + index);
      for (; index >= 0; index--)
        if (index in O)
          if (O[index] === el)
            return index;
      return -1;
    }
  });
  $def($def.P, 'String', {trim: require("npm:core-js@0.9.6/modules/$.replacer")(/^\s*([\s\S]*\S)?\s*$/, '$1')});
  $def($def.S, 'Date', {now: function() {
      return +new Date;
    }});
  function lz(num) {
    return num > 9 ? num : '0' + num;
  }
  var date = new Date(-5e13 - 1),
      brokenDate = !(date.toISOString && date.toISOString() == '0385-07-25T07:06:39.999Z' && require("npm:core-js@0.9.6/modules/$.throws")(function() {
        new Date(NaN).toISOString();
      }));
  $def($def.P + $def.F * brokenDate, 'Date', {toISOString: function() {
      if (!isFinite(this))
        throw RangeError('Invalid time value');
      var d = this,
          y = d.getUTCFullYear(),
          m = d.getUTCMilliseconds(),
          s = y < 0 ? '-' : y > 9999 ? '+' : '';
      return s + ('00000' + Math.abs(y)).slice(s ? -6 : -4) + '-' + lz(d.getUTCMonth() + 1) + '-' + lz(d.getUTCDate()) + 'T' + lz(d.getUTCHours()) + ':' + lz(d.getUTCMinutes()) + ':' + lz(d.getUTCSeconds()) + '.' + (m > 99 ? m : '0' + lz(m)) + 'Z';
    }});
  if (classof(function() {
    return arguments;
  }()) == 'Object')
    cof.classof = function(it) {
      var tag = classof(it);
      return tag == 'Object' && isFunction(it.callee) ? 'Arguments' : tag;
    };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/fn/symbol", ["npm:core-js@0.9.6/library/fn/symbol/index"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = require("npm:core-js@0.9.6/library/fn/symbol/index");
  global.define = __define;
  return module.exports;
});

System.register("npm:babel-runtime@5.2.9/helpers/create-class", ["npm:babel-runtime@5.2.9/core-js/object/define-property"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  "use strict";
  var _Object$defineProperty = require("npm:babel-runtime@5.2.9/core-js/object/define-property")["default"];
  exports["default"] = (function() {
    function defineProperties(target, props) {
      for (var i = 0; i < props.length; i++) {
        var descriptor = props[i];
        descriptor.enumerable = descriptor.enumerable || false;
        descriptor.configurable = true;
        if ("value" in descriptor)
          descriptor.writable = true;
        _Object$defineProperty(target, descriptor.key, descriptor);
      }
    }
    return function(Constructor, protoProps, staticProps) {
      if (protoProps)
        defineProperties(Constructor.prototype, protoProps);
      if (staticProps)
        defineProperties(Constructor, staticProps);
      return Constructor;
    };
  })();
  exports.__esModule = true;
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/fn/map", ["npm:core-js@0.9.6/library/modules/es6.object.to-string", "npm:core-js@0.9.6/library/modules/es6.string.iterator", "npm:core-js@0.9.6/library/modules/web.dom.iterable", "npm:core-js@0.9.6/library/modules/es6.map", "npm:core-js@0.9.6/library/modules/es7.map.to-json", "npm:core-js@0.9.6/library/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  require("npm:core-js@0.9.6/library/modules/es6.object.to-string");
  require("npm:core-js@0.9.6/library/modules/es6.string.iterator");
  require("npm:core-js@0.9.6/library/modules/web.dom.iterable");
  require("npm:core-js@0.9.6/library/modules/es6.map");
  require("npm:core-js@0.9.6/library/modules/es7.map.to-json");
  module.exports = require("npm:core-js@0.9.6/library/modules/$").core.Map;
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/$.task", ["npm:core-js@0.9.6/library/modules/$", "npm:core-js@0.9.6/library/modules/$.ctx", "npm:core-js@0.9.6/library/modules/$.cof", "npm:core-js@0.9.6/library/modules/$.invoke", "npm:core-js@0.9.6/library/modules/$.dom-create", "github:jspm/nodelibs-process@0.1.1"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  (function(process) {
    'use strict';
    var $ = require("npm:core-js@0.9.6/library/modules/$"),
        ctx = require("npm:core-js@0.9.6/library/modules/$.ctx"),
        cof = require("npm:core-js@0.9.6/library/modules/$.cof"),
        invoke = require("npm:core-js@0.9.6/library/modules/$.invoke"),
        cel = require("npm:core-js@0.9.6/library/modules/$.dom-create"),
        global = $.g,
        isFunction = $.isFunction,
        html = $.html,
        process = global.process,
        setTask = global.setImmediate,
        clearTask = global.clearImmediate,
        postMessage = global.postMessage,
        addEventListener = global.addEventListener,
        MessageChannel = global.MessageChannel,
        counter = 0,
        queue = {},
        ONREADYSTATECHANGE = 'onreadystatechange',
        defer,
        channel,
        port;
    function run() {
      var id = +this;
      if ($.has(queue, id)) {
        var fn = queue[id];
        delete queue[id];
        fn();
      }
    }
    function listner(event) {
      run.call(event.data);
    }
    if (!isFunction(setTask) || !isFunction(clearTask)) {
      setTask = function(fn) {
        var args = [],
            i = 1;
        while (arguments.length > i)
          args.push(arguments[i++]);
        queue[++counter] = function() {
          invoke(isFunction(fn) ? fn : Function(fn), args);
        };
        defer(counter);
        return counter;
      };
      clearTask = function(id) {
        delete queue[id];
      };
      if (cof(process) == 'process') {
        defer = function(id) {
          process.nextTick(ctx(run, id, 1));
        };
      } else if (addEventListener && isFunction(postMessage) && !global.importScripts) {
        defer = function(id) {
          postMessage(id, '*');
        };
        addEventListener('message', listner, false);
      } else if (isFunction(MessageChannel)) {
        channel = new MessageChannel;
        port = channel.port2;
        channel.port1.onmessage = listner;
        defer = ctx(port.postMessage, port, 1);
      } else if (ONREADYSTATECHANGE in cel('script')) {
        defer = function(id) {
          html.appendChild(cel('script'))[ONREADYSTATECHANGE] = function() {
            html.removeChild(this);
            run.call(id);
          };
        };
      } else {
        defer = function(id) {
          setTimeout(ctx(run, id, 1), 0);
        };
      }
    }
    module.exports = {
      set: setTask,
      clear: clearTask
    };
  })(require("github:jspm/nodelibs-process@0.1.1"));
  global.define = __define;
  return module.exports;
});

System.register("npm:babel-runtime@5.2.9/core-js/object/assign", ["npm:core-js@0.9.6/library/fn/object/assign"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": require("npm:core-js@0.9.6/library/fn/object/assign"),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:handlebars@2.0.0/dist/cjs/handlebars", ["npm:handlebars@2.0.0/dist/cjs/handlebars.runtime", "npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/ast", "npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/base", "npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/base", "npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/compiler", "npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/compiler", "npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/compiler", "npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/javascript-compiler"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  "use strict";
  var Handlebars = require("npm:handlebars@2.0.0/dist/cjs/handlebars.runtime")["default"];
  var AST = require("npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/ast")["default"];
  var Parser = require("npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/base").parser;
  var parse = require("npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/base").parse;
  var Compiler = require("npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/compiler").Compiler;
  var compile = require("npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/compiler").compile;
  var precompile = require("npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/compiler").precompile;
  var JavaScriptCompiler = require("npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/javascript-compiler")["default"];
  var _create = Handlebars.create;
  var create = function() {
    var hb = _create();
    hb.compile = function(input, options) {
      return compile(input, options, hb);
    };
    hb.precompile = function(input, options) {
      return precompile(input, options, hb);
    };
    hb.AST = AST;
    hb.Compiler = Compiler;
    hb.JavaScriptCompiler = JavaScriptCompiler;
    hb.Parser = Parser;
    hb.parse = parse;
    return hb;
  };
  Handlebars = create();
  Handlebars.create = create;
  Handlebars['default'] = Handlebars;
  exports["default"] = Handlebars;
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/shim", ["npm:core-js@0.9.6/modules/es5", "npm:core-js@0.9.6/modules/es6.symbol", "npm:core-js@0.9.6/modules/es6.object.assign", "npm:core-js@0.9.6/modules/es6.object.is", "npm:core-js@0.9.6/modules/es6.object.set-prototype-of", "npm:core-js@0.9.6/modules/es6.object.to-string", "npm:core-js@0.9.6/modules/es6.object.statics-accept-primitives", "npm:core-js@0.9.6/modules/es6.function.name", "npm:core-js@0.9.6/modules/es6.function.has-instance", "npm:core-js@0.9.6/modules/es6.number.constructor", "npm:core-js@0.9.6/modules/es6.number.statics", "npm:core-js@0.9.6/modules/es6.math", "npm:core-js@0.9.6/modules/es6.string.from-code-point", "npm:core-js@0.9.6/modules/es6.string.raw", "npm:core-js@0.9.6/modules/es6.string.iterator", "npm:core-js@0.9.6/modules/es6.string.code-point-at", "npm:core-js@0.9.6/modules/es6.string.ends-with", "npm:core-js@0.9.6/modules/es6.string.includes", "npm:core-js@0.9.6/modules/es6.string.repeat", "npm:core-js@0.9.6/modules/es6.string.starts-with", "npm:core-js@0.9.6/modules/es6.array.from", "npm:core-js@0.9.6/modules/es6.array.of", "npm:core-js@0.9.6/modules/es6.array.iterator", "npm:core-js@0.9.6/modules/es6.array.species", "npm:core-js@0.9.6/modules/es6.array.copy-within", "npm:core-js@0.9.6/modules/es6.array.fill", "npm:core-js@0.9.6/modules/es6.array.find", "npm:core-js@0.9.6/modules/es6.array.find-index", "npm:core-js@0.9.6/modules/es6.regexp", "npm:core-js@0.9.6/modules/es6.promise", "npm:core-js@0.9.6/modules/es6.map", "npm:core-js@0.9.6/modules/es6.set", "npm:core-js@0.9.6/modules/es6.weak-map", "npm:core-js@0.9.6/modules/es6.weak-set", "npm:core-js@0.9.6/modules/es6.reflect", "npm:core-js@0.9.6/modules/es7.array.includes", "npm:core-js@0.9.6/modules/es7.string.at", "npm:core-js@0.9.6/modules/es7.string.lpad", "npm:core-js@0.9.6/modules/es7.string.rpad", "npm:core-js@0.9.6/modules/es7.regexp.escape", "npm:core-js@0.9.6/modules/es7.object.get-own-property-descriptors", "npm:core-js@0.9.6/modules/es7.object.to-array", "npm:core-js@0.9.6/modules/es7.map.to-json", "npm:core-js@0.9.6/modules/es7.set.to-json", "npm:core-js@0.9.6/modules/js.array.statics", "npm:core-js@0.9.6/modules/web.timers", "npm:core-js@0.9.6/modules/web.immediate", "npm:core-js@0.9.6/modules/web.dom.iterable", "npm:core-js@0.9.6/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  require("npm:core-js@0.9.6/modules/es5");
  require("npm:core-js@0.9.6/modules/es6.symbol");
  require("npm:core-js@0.9.6/modules/es6.object.assign");
  require("npm:core-js@0.9.6/modules/es6.object.is");
  require("npm:core-js@0.9.6/modules/es6.object.set-prototype-of");
  require("npm:core-js@0.9.6/modules/es6.object.to-string");
  require("npm:core-js@0.9.6/modules/es6.object.statics-accept-primitives");
  require("npm:core-js@0.9.6/modules/es6.function.name");
  require("npm:core-js@0.9.6/modules/es6.function.has-instance");
  require("npm:core-js@0.9.6/modules/es6.number.constructor");
  require("npm:core-js@0.9.6/modules/es6.number.statics");
  require("npm:core-js@0.9.6/modules/es6.math");
  require("npm:core-js@0.9.6/modules/es6.string.from-code-point");
  require("npm:core-js@0.9.6/modules/es6.string.raw");
  require("npm:core-js@0.9.6/modules/es6.string.iterator");
  require("npm:core-js@0.9.6/modules/es6.string.code-point-at");
  require("npm:core-js@0.9.6/modules/es6.string.ends-with");
  require("npm:core-js@0.9.6/modules/es6.string.includes");
  require("npm:core-js@0.9.6/modules/es6.string.repeat");
  require("npm:core-js@0.9.6/modules/es6.string.starts-with");
  require("npm:core-js@0.9.6/modules/es6.array.from");
  require("npm:core-js@0.9.6/modules/es6.array.of");
  require("npm:core-js@0.9.6/modules/es6.array.iterator");
  require("npm:core-js@0.9.6/modules/es6.array.species");
  require("npm:core-js@0.9.6/modules/es6.array.copy-within");
  require("npm:core-js@0.9.6/modules/es6.array.fill");
  require("npm:core-js@0.9.6/modules/es6.array.find");
  require("npm:core-js@0.9.6/modules/es6.array.find-index");
  require("npm:core-js@0.9.6/modules/es6.regexp");
  require("npm:core-js@0.9.6/modules/es6.promise");
  require("npm:core-js@0.9.6/modules/es6.map");
  require("npm:core-js@0.9.6/modules/es6.set");
  require("npm:core-js@0.9.6/modules/es6.weak-map");
  require("npm:core-js@0.9.6/modules/es6.weak-set");
  require("npm:core-js@0.9.6/modules/es6.reflect");
  require("npm:core-js@0.9.6/modules/es7.array.includes");
  require("npm:core-js@0.9.6/modules/es7.string.at");
  require("npm:core-js@0.9.6/modules/es7.string.lpad");
  require("npm:core-js@0.9.6/modules/es7.string.rpad");
  require("npm:core-js@0.9.6/modules/es7.regexp.escape");
  require("npm:core-js@0.9.6/modules/es7.object.get-own-property-descriptors");
  require("npm:core-js@0.9.6/modules/es7.object.to-array");
  require("npm:core-js@0.9.6/modules/es7.map.to-json");
  require("npm:core-js@0.9.6/modules/es7.set.to-json");
  require("npm:core-js@0.9.6/modules/js.array.statics");
  require("npm:core-js@0.9.6/modules/web.timers");
  require("npm:core-js@0.9.6/modules/web.immediate");
  require("npm:core-js@0.9.6/modules/web.dom.iterable");
  module.exports = require("npm:core-js@0.9.6/modules/$").core;
  global.define = __define;
  return module.exports;
});

System.register("npm:babel-runtime@5.2.9/core-js/symbol", ["npm:core-js@0.9.6/library/fn/symbol"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": require("npm:core-js@0.9.6/library/fn/symbol"),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:babel-runtime@5.2.9/core-js/map", ["npm:core-js@0.9.6/library/fn/map"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": require("npm:core-js@0.9.6/library/fn/map"),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/modules/es6.promise", ["npm:core-js@0.9.6/library/modules/$", "npm:core-js@0.9.6/library/modules/$.ctx", "npm:core-js@0.9.6/library/modules/$.cof", "npm:core-js@0.9.6/library/modules/$.def", "npm:core-js@0.9.6/library/modules/$.assert", "npm:core-js@0.9.6/library/modules/$.for-of", "npm:core-js@0.9.6/library/modules/$.set-proto", "npm:core-js@0.9.6/library/modules/$.species", "npm:core-js@0.9.6/library/modules/$.wks", "npm:core-js@0.9.6/library/modules/$.uid", "npm:core-js@0.9.6/library/modules/$.task", "npm:core-js@0.9.6/library/modules/$.iter-detect", "github:jspm/nodelibs-process@0.1.1"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  (function(process) {
    'use strict';
    var $ = require("npm:core-js@0.9.6/library/modules/$"),
        ctx = require("npm:core-js@0.9.6/library/modules/$.ctx"),
        cof = require("npm:core-js@0.9.6/library/modules/$.cof"),
        $def = require("npm:core-js@0.9.6/library/modules/$.def"),
        assert = require("npm:core-js@0.9.6/library/modules/$.assert"),
        forOf = require("npm:core-js@0.9.6/library/modules/$.for-of"),
        setProto = require("npm:core-js@0.9.6/library/modules/$.set-proto").set,
        species = require("npm:core-js@0.9.6/library/modules/$.species"),
        SPECIES = require("npm:core-js@0.9.6/library/modules/$.wks")('species'),
        RECORD = require("npm:core-js@0.9.6/library/modules/$.uid").safe('record'),
        PROMISE = 'Promise',
        global = $.g,
        process = global.process,
        asap = process && process.nextTick || require("npm:core-js@0.9.6/library/modules/$.task").set,
        P = global[PROMISE],
        isFunction = $.isFunction,
        isObject = $.isObject,
        assertFunction = assert.fn,
        assertObject = assert.obj;
    var useNative = function() {
      var test,
          works = false;
      function P2(x) {
        var self = new P(x);
        setProto(self, P2.prototype);
        return self;
      }
      try {
        works = isFunction(P) && isFunction(P.resolve) && P.resolve(test = new P(function() {})) == test;
        setProto(P2, P);
        P2.prototype = $.create(P.prototype, {constructor: {value: P2}});
        if (!(P2.resolve(5).then(function() {}) instanceof P2)) {
          works = false;
        }
      } catch (e) {
        works = false;
      }
      return works;
    }();
    function getConstructor(C) {
      var S = assertObject(C)[SPECIES];
      return S != undefined ? S : C;
    }
    function isThenable(it) {
      var then;
      if (isObject(it))
        then = it.then;
      return isFunction(then) ? then : false;
    }
    function notify(record) {
      var chain = record.c;
      if (chain.length)
        asap(function() {
          var value = record.v,
              ok = record.s == 1,
              i = 0;
          function run(react) {
            var cb = ok ? react.ok : react.fail,
                ret,
                then;
            try {
              if (cb) {
                if (!ok)
                  record.h = true;
                ret = cb === true ? value : cb(value);
                if (ret === react.P) {
                  react.rej(TypeError('Promise-chain cycle'));
                } else if (then = isThenable(ret)) {
                  then.call(ret, react.res, react.rej);
                } else
                  react.res(ret);
              } else
                react.rej(value);
            } catch (err) {
              react.rej(err);
            }
          }
          while (chain.length > i)
            run(chain[i++]);
          chain.length = 0;
        });
    }
    function isUnhandled(promise) {
      var record = promise[RECORD],
          chain = record.a || record.c,
          i = 0,
          react;
      if (record.h)
        return false;
      while (chain.length > i) {
        react = chain[i++];
        if (react.fail || !isUnhandled(react.P))
          return false;
      }
      return true;
    }
    function $reject(value) {
      var record = this,
          promise;
      if (record.d)
        return ;
      record.d = true;
      record = record.r || record;
      record.v = value;
      record.s = 2;
      record.a = record.c.slice();
      setTimeout(function() {
        asap(function() {
          if (isUnhandled(promise = record.p)) {
            if (cof(process) == 'process') {
              process.emit('unhandledRejection', value, promise);
            } else if (global.console && isFunction(console.error)) {
              console.error('Unhandled promise rejection', value);
            }
          }
          record.a = undefined;
        });
      }, 1);
      notify(record);
    }
    function $resolve(value) {
      var record = this,
          then,
          wrapper;
      if (record.d)
        return ;
      record.d = true;
      record = record.r || record;
      try {
        if (then = isThenable(value)) {
          wrapper = {
            r: record,
            d: false
          };
          then.call(value, ctx($resolve, wrapper, 1), ctx($reject, wrapper, 1));
        } else {
          record.v = value;
          record.s = 1;
          notify(record);
        }
      } catch (err) {
        $reject.call(wrapper || {
          r: record,
          d: false
        }, err);
      }
    }
    if (!useNative) {
      P = function Promise(executor) {
        assertFunction(executor);
        var record = {
          p: assert.inst(this, P, PROMISE),
          c: [],
          a: undefined,
          s: 0,
          d: false,
          v: undefined,
          h: false
        };
        $.hide(this, RECORD, record);
        try {
          executor(ctx($resolve, record, 1), ctx($reject, record, 1));
        } catch (err) {
          $reject.call(record, err);
        }
      };
      $.mix(P.prototype, {
        then: function then(onFulfilled, onRejected) {
          var S = assertObject(assertObject(this).constructor)[SPECIES];
          var react = {
            ok: isFunction(onFulfilled) ? onFulfilled : true,
            fail: isFunction(onRejected) ? onRejected : false
          };
          var promise = react.P = new (S != undefined ? S : P)(function(res, rej) {
            react.res = assertFunction(res);
            react.rej = assertFunction(rej);
          });
          var record = this[RECORD];
          record.c.push(react);
          if (record.a)
            record.a.push(react);
          record.s && notify(record);
          return promise;
        },
        'catch': function(onRejected) {
          return this.then(undefined, onRejected);
        }
      });
    }
    $def($def.G + $def.W + $def.F * !useNative, {Promise: P});
    cof.set(P, PROMISE);
    species(P);
    species($.core[PROMISE]);
    $def($def.S + $def.F * !useNative, PROMISE, {
      reject: function reject(r) {
        return new (getConstructor(this))(function(res, rej) {
          rej(r);
        });
      },
      resolve: function resolve(x) {
        return isObject(x) && RECORD in x && $.getProto(x) === this.prototype ? x : new (getConstructor(this))(function(res) {
          res(x);
        });
      }
    });
    $def($def.S + $def.F * !(useNative && require("npm:core-js@0.9.6/library/modules/$.iter-detect")(function(iter) {
      P.all(iter)['catch'](function() {});
    })), PROMISE, {
      all: function all(iterable) {
        var C = getConstructor(this),
            values = [];
        return new C(function(res, rej) {
          forOf(iterable, false, values.push, values);
          var remaining = values.length,
              results = Array(remaining);
          if (remaining)
            $.each.call(values, function(promise, index) {
              C.resolve(promise).then(function(value) {
                results[index] = value;
                --remaining || res(results);
              }, rej);
            });
          else
            res(results);
        });
      },
      race: function race(iterable) {
        var C = getConstructor(this);
        return new C(function(res, rej) {
          forOf(iterable, false, function(promise) {
            C.resolve(promise).then(res, rej);
          });
        });
      }
    });
  })(require("github:jspm/nodelibs-process@0.1.1"));
  global.define = __define;
  return module.exports;
});

System.register("npm:handlebars@2.0.0/lib/index", ["npm:handlebars@2.0.0/dist/cjs/handlebars", "npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/visitor", "npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/printer", "github:jspm/nodelibs-fs@0.1.2"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var handlebars = require("npm:handlebars@2.0.0/dist/cjs/handlebars")["default"];
  handlebars.Visitor = require("npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/visitor")["default"];
  var printer = require("npm:handlebars@2.0.0/dist/cjs/handlebars/compiler/printer");
  handlebars.PrintVisitor = printer.PrintVisitor;
  handlebars.print = printer.print;
  module.exports = handlebars;
  if (typeof require !== 'undefined' && require.extensions) {
    var extension = function(module, filename) {
      var fs = require("github:jspm/nodelibs-fs@0.1.2");
      var templateString = fs.readFileSync(filename, "utf8");
      module.exports = handlebars.compile(templateString);
    };
    require.extensions[".handlebars"] = extension;
    require.extensions[".hbs"] = extension;
  }
  global.define = __define;
  return module.exports;
});

System.register("npm:babel-runtime@5.2.9/regenerator/runtime", ["npm:babel-runtime@5.2.9/core-js/symbol", "npm:babel-runtime@5.2.9/core-js/symbol/iterator", "npm:babel-runtime@5.2.9/core-js/object/create", "npm:babel-runtime@5.2.9/core-js/promise"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  "use strict";
  var _Symbol = require("npm:babel-runtime@5.2.9/core-js/symbol")["default"];
  var _Symbol$iterator = require("npm:babel-runtime@5.2.9/core-js/symbol/iterator")["default"];
  var _Object$create = require("npm:babel-runtime@5.2.9/core-js/object/create")["default"];
  var _Promise = require("npm:babel-runtime@5.2.9/core-js/promise")["default"];
  !(function(global) {
    "use strict";
    var hasOwn = Object.prototype.hasOwnProperty;
    var undefined;
    var iteratorSymbol = typeof _Symbol === "function" && _Symbol$iterator || "@@iterator";
    var inModule = typeof module === "object";
    var runtime = global.regeneratorRuntime;
    if (runtime) {
      if (inModule) {
        module.exports = runtime;
      }
      return ;
    }
    runtime = global.regeneratorRuntime = inModule ? module.exports : {};
    function wrap(innerFn, outerFn, self, tryLocsList) {
      var generator = _Object$create((outerFn || Generator).prototype);
      generator._invoke = makeInvokeMethod(innerFn, self || null, new Context(tryLocsList || []));
      return generator;
    }
    runtime.wrap = wrap;
    function tryCatch(fn, obj, arg) {
      try {
        return {
          type: "normal",
          arg: fn.call(obj, arg)
        };
      } catch (err) {
        return {
          type: "throw",
          arg: err
        };
      }
    }
    var GenStateSuspendedStart = "suspendedStart";
    var GenStateSuspendedYield = "suspendedYield";
    var GenStateExecuting = "executing";
    var GenStateCompleted = "completed";
    var ContinueSentinel = {};
    function Generator() {}
    function GeneratorFunction() {}
    function GeneratorFunctionPrototype() {}
    var Gp = GeneratorFunctionPrototype.prototype = Generator.prototype;
    GeneratorFunction.prototype = Gp.constructor = GeneratorFunctionPrototype;
    GeneratorFunctionPrototype.constructor = GeneratorFunction;
    GeneratorFunction.displayName = "GeneratorFunction";
    runtime.isGeneratorFunction = function(genFun) {
      var ctor = typeof genFun === "function" && genFun.constructor;
      return ctor ? ctor === GeneratorFunction || (ctor.displayName || ctor.name) === "GeneratorFunction" : false;
    };
    runtime.mark = function(genFun) {
      genFun.__proto__ = GeneratorFunctionPrototype;
      genFun.prototype = _Object$create(Gp);
      return genFun;
    };
    runtime.async = function(innerFn, outerFn, self, tryLocsList) {
      return new _Promise(function(resolve, reject) {
        var generator = wrap(innerFn, outerFn, self, tryLocsList);
        var callNext = step.bind(generator, "next");
        var callThrow = step.bind(generator, "throw");
        function step(method, arg) {
          var record = tryCatch(generator[method], generator, arg);
          if (record.type === "throw") {
            reject(record.arg);
            return ;
          }
          var info = record.arg;
          if (info.done) {
            resolve(info.value);
          } else {
            _Promise.resolve(info.value).then(callNext, callThrow);
          }
        }
        callNext();
      });
    };
    function makeInvokeMethod(innerFn, self, context) {
      var state = GenStateSuspendedStart;
      return function invoke(method, arg) {
        if (state === GenStateExecuting) {
          throw new Error("Generator is already running");
        }
        if (state === GenStateCompleted) {
          return doneResult();
        }
        while (true) {
          var delegate = context.delegate;
          if (delegate) {
            if (method === "return" || method === "throw" && delegate.iterator[method] === undefined) {
              context.delegate = null;
              var returnMethod = delegate.iterator["return"];
              if (returnMethod) {
                var record = tryCatch(returnMethod, delegate.iterator, arg);
                if (record.type === "throw") {
                  method = "throw";
                  arg = record.arg;
                  continue;
                }
              }
              if (method === "return") {
                continue;
              }
            }
            var record = tryCatch(delegate.iterator[method], delegate.iterator, arg);
            if (record.type === "throw") {
              context.delegate = null;
              method = "throw";
              arg = record.arg;
              continue;
            }
            method = "next";
            arg = undefined;
            var info = record.arg;
            if (info.done) {
              context[delegate.resultName] = info.value;
              context.next = delegate.nextLoc;
            } else {
              state = GenStateSuspendedYield;
              return info;
            }
            context.delegate = null;
          }
          if (method === "next") {
            if (state === GenStateSuspendedYield) {
              context.sent = arg;
            } else {
              delete context.sent;
            }
          } else if (method === "throw") {
            if (state === GenStateSuspendedStart) {
              state = GenStateCompleted;
              throw arg;
            }
            if (context.dispatchException(arg)) {
              method = "next";
              arg = undefined;
            }
          } else if (method === "return") {
            context.abrupt("return", arg);
          }
          state = GenStateExecuting;
          var record = tryCatch(innerFn, self, context);
          if (record.type === "normal") {
            state = context.done ? GenStateCompleted : GenStateSuspendedYield;
            var info = {
              value: record.arg,
              done: context.done
            };
            if (record.arg === ContinueSentinel) {
              if (context.delegate && method === "next") {
                arg = undefined;
              }
            } else {
              return info;
            }
          } else if (record.type === "throw") {
            state = GenStateCompleted;
            method = "throw";
            arg = record.arg;
          }
        }
      };
    }
    function defineGeneratorMethod(method) {
      Gp[method] = function(arg) {
        return this._invoke(method, arg);
      };
    }
    defineGeneratorMethod("next");
    defineGeneratorMethod("throw");
    defineGeneratorMethod("return");
    Gp[iteratorSymbol] = function() {
      return this;
    };
    Gp.toString = function() {
      return "[object Generator]";
    };
    function pushTryEntry(locs) {
      var entry = {tryLoc: locs[0]};
      if (1 in locs) {
        entry.catchLoc = locs[1];
      }
      if (2 in locs) {
        entry.finallyLoc = locs[2];
        entry.afterLoc = locs[3];
      }
      this.tryEntries.push(entry);
    }
    function resetTryEntry(entry) {
      var record = entry.completion || {};
      record.type = "normal";
      delete record.arg;
      entry.completion = record;
    }
    function Context(tryLocsList) {
      this.tryEntries = [{tryLoc: "root"}];
      tryLocsList.forEach(pushTryEntry, this);
      this.reset();
    }
    runtime.keys = function(object) {
      var keys = [];
      for (var key in object) {
        keys.push(key);
      }
      keys.reverse();
      return function next() {
        while (keys.length) {
          var key = keys.pop();
          if (key in object) {
            next.value = key;
            next.done = false;
            return next;
          }
        }
        next.done = true;
        return next;
      };
    };
    function values(iterable) {
      if (iterable) {
        var iteratorMethod = iterable[iteratorSymbol];
        if (iteratorMethod) {
          return iteratorMethod.call(iterable);
        }
        if (typeof iterable.next === "function") {
          return iterable;
        }
        if (!isNaN(iterable.length)) {
          var i = -1,
              next = function next() {
                while (++i < iterable.length) {
                  if (hasOwn.call(iterable, i)) {
                    next.value = iterable[i];
                    next.done = false;
                    return next;
                  }
                }
                next.value = undefined;
                next.done = true;
                return next;
              };
          return next.next = next;
        }
      }
      return {next: doneResult};
    }
    runtime.values = values;
    function doneResult() {
      return {
        value: undefined,
        done: true
      };
    }
    Context.prototype = {
      constructor: Context,
      reset: function reset() {
        this.prev = 0;
        this.next = 0;
        this.sent = undefined;
        this.done = false;
        this.delegate = null;
        this.tryEntries.forEach(resetTryEntry);
        for (var tempIndex = 0,
            tempName; hasOwn.call(this, tempName = "t" + tempIndex) || tempIndex < 20; ++tempIndex) {
          this[tempName] = null;
        }
      },
      stop: function stop() {
        this.done = true;
        var rootEntry = this.tryEntries[0];
        var rootRecord = rootEntry.completion;
        if (rootRecord.type === "throw") {
          throw rootRecord.arg;
        }
        return this.rval;
      },
      dispatchException: function dispatchException(exception) {
        if (this.done) {
          throw exception;
        }
        var context = this;
        function handle(loc, caught) {
          record.type = "throw";
          record.arg = exception;
          context.next = loc;
          return !!caught;
        }
        for (var i = this.tryEntries.length - 1; i >= 0; --i) {
          var entry = this.tryEntries[i];
          var record = entry.completion;
          if (entry.tryLoc === "root") {
            return handle("end");
          }
          if (entry.tryLoc <= this.prev) {
            var hasCatch = hasOwn.call(entry, "catchLoc");
            var hasFinally = hasOwn.call(entry, "finallyLoc");
            if (hasCatch && hasFinally) {
              if (this.prev < entry.catchLoc) {
                return handle(entry.catchLoc, true);
              } else if (this.prev < entry.finallyLoc) {
                return handle(entry.finallyLoc);
              }
            } else if (hasCatch) {
              if (this.prev < entry.catchLoc) {
                return handle(entry.catchLoc, true);
              }
            } else if (hasFinally) {
              if (this.prev < entry.finallyLoc) {
                return handle(entry.finallyLoc);
              }
            } else {
              throw new Error("try statement without catch or finally");
            }
          }
        }
      },
      abrupt: function abrupt(type, arg) {
        for (var i = this.tryEntries.length - 1; i >= 0; --i) {
          var entry = this.tryEntries[i];
          if (entry.tryLoc <= this.prev && hasOwn.call(entry, "finallyLoc") && this.prev < entry.finallyLoc) {
            var finallyEntry = entry;
            break;
          }
        }
        if (finallyEntry && (type === "break" || type === "continue") && finallyEntry.tryLoc <= arg && arg <= finallyEntry.finallyLoc) {
          finallyEntry = null;
        }
        var record = finallyEntry ? finallyEntry.completion : {};
        record.type = type;
        record.arg = arg;
        if (finallyEntry) {
          this.next = finallyEntry.finallyLoc;
        } else {
          this.complete(record);
        }
        return ContinueSentinel;
      },
      complete: function complete(record, afterLoc) {
        if (record.type === "throw") {
          throw record.arg;
        }
        if (record.type === "break" || record.type === "continue") {
          this.next = record.arg;
        } else if (record.type === "return") {
          this.rval = record.arg;
          this.next = "end";
        } else if (record.type === "normal" && afterLoc) {
          this.next = afterLoc;
        }
        return ContinueSentinel;
      },
      finish: function finish(finallyLoc) {
        for (var i = this.tryEntries.length - 1; i >= 0; --i) {
          var entry = this.tryEntries[i];
          if (entry.finallyLoc === finallyLoc) {
            return this.complete(entry.completion, entry.afterLoc);
          }
        }
      },
      "catch": function _catch(tryLoc) {
        for (var i = this.tryEntries.length - 1; i >= 0; --i) {
          var entry = this.tryEntries[i];
          if (entry.tryLoc === tryLoc) {
            var record = entry.completion;
            if (record.type === "throw") {
              var thrown = record.arg;
              resetTryEntry(entry);
            }
            return thrown;
          }
        }
        throw new Error("illegal catch attempt");
      },
      delegateYield: function delegateYield(iterable, resultName, nextLoc) {
        this.delegate = {
          iterator: values(iterable),
          resultName: resultName,
          nextLoc: nextLoc
        };
        return ContinueSentinel;
      }
    };
  })(typeof global === "object" ? global : typeof window === "object" ? window : typeof self === "object" ? self : undefined);
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.6/library/fn/promise", ["npm:core-js@0.9.6/library/modules/es6.object.to-string", "npm:core-js@0.9.6/library/modules/es6.string.iterator", "npm:core-js@0.9.6/library/modules/web.dom.iterable", "npm:core-js@0.9.6/library/modules/es6.promise", "npm:core-js@0.9.6/library/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  require("npm:core-js@0.9.6/library/modules/es6.object.to-string");
  require("npm:core-js@0.9.6/library/modules/es6.string.iterator");
  require("npm:core-js@0.9.6/library/modules/web.dom.iterable");
  require("npm:core-js@0.9.6/library/modules/es6.promise");
  module.exports = require("npm:core-js@0.9.6/library/modules/$").core.Promise;
  global.define = __define;
  return module.exports;
});

System.register("npm:handlebars@2.0.0", ["npm:handlebars@2.0.0/lib/index"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = require("npm:handlebars@2.0.0/lib/index");
  global.define = __define;
  return module.exports;
});

System.register("npm:babel-core@5.2.9/lib/babel/polyfill", ["npm:core-js@0.9.6/shim", "npm:babel-runtime@5.2.9/regenerator/runtime"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  "format cjs";
  "use strict";
  require("npm:core-js@0.9.6/shim");
  require("npm:babel-runtime@5.2.9/regenerator/runtime");
  if (global._babelPolyfill) {
    throw new Error("only one instance of babel/polyfill is allowed");
  }
  global._babelPolyfill = true;
  global.define = __define;
  return module.exports;
});

System.register("npm:babel-runtime@5.2.9/core-js/promise", ["npm:core-js@0.9.6/library/fn/promise"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": require("npm:core-js@0.9.6/library/fn/promise"),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:babel-core@5.2.9/polyfill", ["npm:babel-core@5.2.9/lib/babel/polyfill"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  "format cjs";
  module.exports = require("npm:babel-core@5.2.9/lib/babel/polyfill");
  global.define = __define;
  return module.exports;
});

System.register('src/esb-util', ['npm:babel-runtime@5.2.9/helpers/create-class', 'npm:babel-runtime@5.2.9/helpers/class-call-check', 'src/esb-config'], function (_export) {
  var _createClass, _classCallCheck, EsbConfig, EsbUtil;

  return {
    setters: [function (_npmBabelRuntime529HelpersCreateClass) {
      _createClass = _npmBabelRuntime529HelpersCreateClass['default'];
    }, function (_npmBabelRuntime529HelpersClassCallCheck) {
      _classCallCheck = _npmBabelRuntime529HelpersClassCallCheck['default'];
    }, function (_srcEsbConfig) {
      EsbConfig = _srcEsbConfig['default'];
    }],
    execute: function () {
      'use strict';

      EsbUtil = (function () {
        function EsbUtil() {
          _classCallCheck(this, EsbUtil);
        }

        _createClass(EsbUtil, [{
          key: 'logger',
          value: function logger(level, message) {
            var levels = ['debug', 'info', 'warn', 'error', 'none'],
                logging_level = EsbConfig.getConfig().get('logging_level'),
                level_text;

            if (logging_level === undefined) {
              logging_level = 'info';
            }

            if (levels.indexOf(level) >= levels.indexOf(logging_level)) {
              if (typeof message !== 'string') {
                message = JSON.stringify(message);
              }

              if (level === 'error') {
                level_text = 'ERROR';
              } else if (level === 'warn') {
                level_text = 'WARN';
              } else {
                level_text = level[0].toUpperCase() + level.slice(1);
              }

              window.console[level](level_text + ': ' + message);
            }
          }
        }, {
          key: 'booleanXorValue',
          value: function booleanXorValue(value) {
            var val,
                boolean_strings = ['true', 'True', 'TRUE', 'false', 'False', 'FALSE'];

            if (boolean_strings.indexOf(value) !== -1) {
              if (value.match(/true/i) === null) {
                val = false;
              } else {
                val = true;
              }
            } else {
              val = value;
            }

            return val;
          }
        }, {
          key: 'outerHeight',
          value: function outerHeight(el) {
            var height = el.offsetHeight;
            var style = getComputedStyle(el);

            height += parseInt(style.marginTop) + parseInt(style.marginBottom);
            return height;
          }
        }, {
          key: 'outerWidth',
          value: function outerWidth(el) {
            var width = el.offsetWidth;
            var style = getComputedStyle(el);

            width += parseInt(style.marginLeft) + parseInt(style.marginRight);
            return width;
          }
        }, {
          key: 'getUrlQueryString',
          value: function getUrlQueryString() {
            return window.location.search;
          }
        }, {
          key: 'convertQueryStringToJson',
          value: function convertQueryStringToJson(query_string) {
            var pairs,
                json = {};

            if (query_string.length > 0) {
              pairs = query_string.slice(1).split('&');

              pairs.forEach(function (pair) {
                pair = pair.split('=');
                json[pair[0]] = decodeURIComponent(pair[1] || '');
              });
            }

            return JSON.parse(JSON.stringify(json));
          }
        }, {
          key: 'isVoidElement',
          value: function isVoidElement(el) {
            var tags = ['area', 'base', 'br', 'col', 'command', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr'],
                name;

            name = el.nodeName.toLowerCase();

            if (tags.indexOf(name) !== -1) {
              return true;
            }

            return false;
          }
        }, {
          key: 'addClass',
          value: function addClass(el, class_name) {
            var classes = [],
                i = 0;

            classes = class_name.split(' ');

            for (i = 0; i < classes.length; i++) {
              if (el.classList && classes[i].length > 0) {
                el.classList.add(classes[i]);
              } else {
                el.className += ' ' + classes[i];
              }
            }
          }
        }, {
          key: 'removeClass',
          value: function removeClass(el, class_name) {
            var classes = [],
                i = 0;

            classes = class_name.split(' ');

            for (i = 0; i < classes.length; i++) {
              if (el.classList) {
                el.classList.remove(classes[i]);
              } else {
                el.className = el.className.replace(new RegExp('(^|\\b)' + classes[i].split(' ').join('|') + '(\\b|$)', 'gi'), ' ');
              }
            }
          }
        }, {
          key: 'throttle',
          value: function throttle(delay, callback) {
            var previousCall = new Date().getTime();
            return function () {
              var time = new Date().getTime();

              //
              // if "delay" milliseconds have expired since
              // the previous call then propagate this call to
              // "callback"
              //
              if (time - previousCall >= delay) {
                previousCall = time;
                callback.apply(null, arguments);
              }
            };
          }
        }, {
          key: 'formatAMPM',
          value: function formatAMPM(date) {
            var hours = date.getHours();
            var minutes = date.getMinutes();
            var ampm = hours >= 12 ? 'pm' : 'am';
            hours = hours % 12;
            hours = hours ? hours : 12; // the hour '0' should be '12'
            minutes = minutes < 10 ? '0' + minutes : minutes;
            var strTime = hours + ':' + minutes + ' ' + ampm;
            return strTime;
          }
        }, {
          key: 'generateUUID',

          /**
           * @method: generateUUID
           *
           * Generates a reasonable enough UUID. We only need it to be unique for 1 load of a page.
           * Copied from http://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript/2117523#2117523
           */
          value: function generateUUID() {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
              var r = Math.random() * 16 | 0,
                  v = c === 'x' ? r : r & 3 | 8;

              return v.toString(16);
            });
          }
        }, {
          key: 'timer',
          value: function timer() {
            var perf = window.performance || {},
                fn = perf.now || perf.mozNow || perf.webkitNow || perf.msNow || perf.oNow;

            return fn ? fn.bind(perf) : function () {
              return new Date().getTime();
            };
          }
        }, {
          key: 'get_svg_icon',
          value: function get_svg_icon(icon_name) {
            var self = this,
                svg_icon = document.createElement('span');
            self.addClass(svg_icon, 'esb-' + icon_name + '-icon');

            switch (icon_name) {
              case 'dimensions':
                svg_icon.innerHTML = '<svg viewBox="0 0 14 13.993" xmlns="http://www.w3.org/2000/svg"><path d="M13.996,3.487c0-0.034-0.002-0.067-0.006-0.096c-0.006-0.021-0.01-0.039-0.017-0.054 c-0.007-0.02-0.009-0.041-0.019-0.056c-0.006-0.021-0.018-0.04-0.029-0.056c-0.007-0.015-0.014-0.032-0.025-0.047 c-0.016-0.028-0.041-0.055-0.062-0.077c-0.004-0.005-0.006-0.01-0.008-0.011l0,0l0,0l-2.91-2.922 c-0.226-0.226-0.594-0.226-0.824-0.003c-0.228,0.229-0.228,0.6-0.002,0.826l1.919,1.926L3.499,2.914l0,0 c-0.153,0-0.302,0.062-0.412,0.172C2.978,3.194,2.917,3.342,2.917,3.5l0.006,8.491l-1.928-1.928c-0.226-0.232-0.595-0.232-0.824,0 c-0.228,0.224-0.229,0.592-0.001,0.82l2.931,2.939c0.109,0.109,0.259,0.17,0.416,0.17c0.162,0,0.301-0.061,0.411-0.17l2.899-2.926 c0.228-0.232,0.225-0.602-0.001-0.828c-0.231-0.225-0.601-0.225-0.828,0.008l-1.911,1.928L4.084,4.08l7.924,0.008l-1.921,1.914 c-0.231,0.224-0.232,0.594-0.004,0.821c0.113,0.115,0.263,0.174,0.413,0.174c0.149,0,0.297-0.058,0.41-0.174l2.924-2.908l0,0 c0.027-0.027,0.051-0.058,0.07-0.086c0.012-0.014,0.018-0.031,0.025-0.047c0.012-0.021,0.021-0.035,0.028-0.056 c0.011-0.02,0.013-0.036,0.02-0.06c0.007-0.015,0.011-0.03,0.017-0.05C13.994,3.582,14,3.542,14,3.501l0,0 C14,3.499,13.996,3.489,13.996,3.487z"/></svg>';
                break;
              case 'scale':
                svg_icon.innerHTML = '<svg viewBox="0 0 14 13.973" xmlns="http://www.w3.org/2000/svg"><g><path d="M8.361,7.749c-0.043,0-0.077,0.005-0.113,0.012c-0.02,0.002-0.039,0.014-0.051,0.014 C8.177,7.783,8.154,7.788,8.14,7.794C8.116,7.802,8.1,7.815,8.084,7.825C8.068,7.831,8.051,7.841,8.036,7.848 c-0.061,0.044-0.115,0.099-0.16,0.16C7.869,8.022,7.858,8.039,7.854,8.056c-0.012,0.02-0.027,0.033-0.03,0.055 C7.814,8.13,7.812,8.148,7.802,8.171C7.799,8.185,7.792,8.2,7.787,8.219C7.783,8.256,7.775,8.294,7.776,8.335v3.296 c0,0.327,0.262,0.587,0.585,0.587c0.322,0,0.585-0.26,0.585-0.587V9.743l4.059,4.058c0.226,0.229,0.595,0.229,0.822,0 c0.23-0.229,0.23-0.599,0-0.824l-4.06-4.06h1.893c0.158,0.001,0.308-0.062,0.414-0.172c0.103-0.106,0.167-0.249,0.167-0.41 c0-0.326-0.26-0.586-0.581-0.586H8.361z"/><path d="M6.42,0H0.584C0.262,0,0,0.261,0,0.583v5.835c0,0.319,0.262,0.581,0.584,0.581H6.42 C6.738,6.999,7,6.737,7,6.418V0.583C7,0.261,6.738,0,6.42,0z M1.17,1.168h4.662v4.665H1.17V1.168z"/></g></svg>';
                break;
            }

            return svg_icon;
          }
        }, {
          key: 'is_json',
          value: function is_json(str) {
            try {
              JSON.parse(str);
            } catch (e) {
              return false;
            }
            return true;
          }
        }, {
          key: 'dom_contains_element',
          value: function dom_contains_element(selector) {
            return document.querySelectorAll(selector).length > 0;
          }
        }, {
          key: 'head_comment_matches',
          value: function head_comment_matches(value_to_match) {
            var value_found = false,
                comments = [],
                head_nodes = document.head.childNodes,
                i,
                node;

            for (i = 0; i < head_nodes.length; i++) {
              node = head_nodes[i];
              if (node.nodeType === 8) {
                comments.push(node);
              }
            }

            for (i = 0; i < comments.length; i++) {
              if (comments[i].textContent.indexOf(value_to_match) > -1) {
                value_found = true;
              }
            }
            return value_found;
          }
        }, {
          key: 'dom_ready',
          value: function dom_ready(fn) {
            if (document.readyState !== 'loading') {
              fn();
            } else {
              document.addEventListener('DOMContentLoaded', fn);
            }
          }
        }]);

        return EsbUtil;
      })();

      _export('default', new EsbUtil());
    }
  };
});
System.register('src/esb-frame', ['npm:babel-runtime@5.2.9/helpers/create-class', 'npm:babel-runtime@5.2.9/helpers/class-call-check', 'npm:babel-runtime@5.2.9/core-js/promise', 'src/esb-config', 'src/esb-util', 'src/esb-page'], function (_export) {
	var _createClass, _classCallCheck, _Promise, EsbConfig, EsbUtil, EsbPage, EsbFrame;

	return {
		setters: [function (_npmBabelRuntime529HelpersCreateClass) {
			_createClass = _npmBabelRuntime529HelpersCreateClass['default'];
		}, function (_npmBabelRuntime529HelpersClassCallCheck) {
			_classCallCheck = _npmBabelRuntime529HelpersClassCallCheck['default'];
		}, function (_npmBabelRuntime529CoreJsPromise) {
			_Promise = _npmBabelRuntime529CoreJsPromise['default'];
		}, function (_srcEsbConfig) {
			EsbConfig = _srcEsbConfig['default'];
		}, function (_srcEsbUtil) {
			EsbUtil = _srcEsbUtil['default'];
		}, function (_srcEsbPage) {
			EsbPage = _srcEsbPage['default'];
		}],
		execute: function () {
			'use strict';

			EsbFrame = (function () {
				// SETUP / CONFIG
				// BOTH - CORE

				function EsbFrame(opts) {
					_classCallCheck(this, EsbFrame);

					var self = this;
					self.placeholder_created_timeout = 5000;
					self.placeholder_created = false;
					self.original_element = opts.viewer_element;
					self.original_snippet = opts.original_snippet;
					self.uuid = opts.uuid;

					self.logger = EsbUtil.logger;
					self.config = EsbConfig.getConfig();
					self.config_json_global_options = self.config.get('frames');
					self.page_level_config_element = self.get_page_level_config_element();

					self.is_include_frame = self.get_include_frame_status();
					self.default_options = self.get_default_options();

					self.set_device_presets();
					self.device_dimensions = {};

					self.state = 'not-loaded';
					self.iframe_is_loaded = false;
					self.has_loading_error = false;
					self.loading_error_message = '';

					self.placeholder_element = null;
					self.viewer_element = null;
					self.iframe_element = null;

					self.dimensions_annotation_width_element = false;
					self.dimensions_annotation_height_element = false;
					self.dimensions_annotation_scale_element = false;
					self.dimensions_annotation_element = false;

					self.scrollable_ancestors = [];

					self.overridden_options = [];
					self.options = self.get_frame_options();
					self.iframe_src = self.options.iframe_src;

					if (self.is_include_frame) {
						self.is_include_template_url_valid().then(function () {
							self.placeholder_element = self.get_placeholder_element();
							self.placeholder_created = true;
						}, function () {
							self.placeholder_element = self.get_placeholder_element();
							self.placeholder_created = true;
						});
					} else {
						self.placeholder_element = self.get_placeholder_element();
						self.placeholder_created = true;
					}
				}

				_createClass(EsbFrame, [{
					key: 'get_placeholder_created',
					value: function get_placeholder_created() {
						var self = this;
						return self.placeholder_created;
					}
				}, {
					key: 'is_placeholder_created',
					value: function is_placeholder_created() {
						var self = this,
						    timeout_ms = self.get_placeholder_created_timeout(),
						    polling_interval_ms = 500,
						    polling_attempt_threshold = timeout_ms / polling_interval_ms,
						    polling_attempts = 0,
						    placeholder_created_interval = false;

						return new _Promise(function (resolve, reject) {
							placeholder_created_interval = setInterval(function () {
								if (polling_attempts < polling_attempt_threshold) {
									if (self.get_placeholder_created()) {
										resolve(true);
										clearInterval(placeholder_created_interval);
									} else {
										polling_attempts++;
									}
								} else {
									self.logger('error', 'The Frame placeholder was not created before the timeout threshold: ' + timeout_ms + 'ms');
									reject('The Frame placeholder was not created before the timeout threshold: ' + timeout_ms + 'ms');
								}
							}, polling_interval_ms);
						});
					}
				}, {
					key: 'get_placeholder_created_timeout',
					value: function get_placeholder_created_timeout() {
						var self = this;
						return self.placeholder_created_timeout;
					}
				}, {
					key: 'get_global_config_option',
					value: function get_global_config_option(option_name) {
						var self = this,
						    option_value;

						if (self.config_json_global_options !== undefined) {
							option_value = self.config_json_global_options.get(option_name);
							if (option_value !== undefined && option_value.toString().length > 0) {
								option_value = EsbUtil.booleanXorValue(option_value);
							}
						}

						return option_value;
					}
				}, {
					key: 'get_page_level_config_element',
					value: function get_page_level_config_element() {
						var self = this,
						    el = self.original_element,
						    page_level_config_element = false;

						while (el.parentNode) {
							el = el.parentNode;
							if (el.tagName !== undefined && el.getAttribute('data-esb-frame-config') !== null) {
								page_level_config_element = el;
								break;
							}
						}

						return page_level_config_element;
					}
				}, {
					key: 'get_page_level_config_option',
					value: function get_page_level_config_option(option_name) {
						var self = this,
						    option_value;

						if (self.page_level_config_element) {
							option_value = self.page_level_config_element.getAttribute('data-esb-' + option_name);
							if (option_value !== null && option_value.length > 0) {
								option_value = EsbUtil.booleanXorValue(option_value);
							} else {
								option_value = undefined;
							}
						}

						return option_value;
					}
				}, {
					key: 'get_element_level_config_option',
					value: function get_element_level_config_option(option_name) {
						var self = this,
						    option_value;

						option_value = self.original_element.getAttribute('data-esb-' + option_name);
						if (option_value !== null && option_value.length > 0) {
							option_value = EsbUtil.booleanXorValue(option_value);
						} else {
							option_value = undefined;
						}

						return option_value;
					}
				}, {
					key: 'get_include_frame_status',
					value: function get_include_frame_status() {
						var self = this,
						    is_include_frame = false,
						    global_config_json_variation = self.get_global_config_option('variation'),
						    page_level_config_variation = self.get_page_level_config_option('variation'),
						    element_level_config_variation = self.get_element_level_config_option('variation');

						if (element_level_config_variation !== undefined || page_level_config_variation !== undefined || global_config_json_variation !== undefined) {
							is_include_frame = true;
						}

						return is_include_frame;
					}
				}, {
					key: 'get_default_options',
					value: function get_default_options() {
						var self = this,
						    options = {
							'frame': false,
							'source': '',
							'load-immediately': false,
							'unload-when-not-visible': false,
							'title': false,
							'caption': false,
							'dimensions': true,
							'href': false,
							'scrolling': 'no',
							'overlay': true,
							'scale': false,
							'viewport-width': 1000,
							'viewport-aspect-ratio': 1.5,
							'width': 200,
							'height': false,
							'viewport-device': false,
							'viewport-device-orientation': 'portrait',
							'device-annotation': true,
							'device-frame': false,
							'show-browser-ui': false,
							'variation': false,
							'include-frame-template': 'include_frame_template.html',
							'include-frame-template-target': 'body',
							'include-source': '',
							'place': 'replace',
							'crop': false,
							'offset-x': false,
							'offset-y': false,
							'content': false,
							'fit-frame-to-contents': false
						};

						if (self.is_include_frame) {
							options.width = false;
							options.height = 'auto';
							options.scale = 1;
							options['viewport-width'] = false;
							options['viewport-aspect-ratio'] = false;
							options['fit-frame-to-contents'] = true;
						}

						return options;
					}
				}, {
					key: 'get_frame_options',
					value: function get_frame_options() {
						var self = this,
						    options = self.default_options,
						    option = null,
						    value = null,
						    device_dimensions = null;

						// Check each tier of options to see if any overrides exist
						for (option in options) {
							// Instance Level
							value = self.get_element_level_config_option(option);
							if (value === undefined) {
								// Page Level
								value = self.get_page_level_config_option(option);

								// Global Level
								if (value === undefined) {
									value = self.get_global_config_option(option);
								}
							}

							if (value !== undefined) {
								options[option] = value;
								self.overridden_options.push(option);
							}
						}

						//CONDITIONAL DEFAULTS

						//OVERLAY
						if (options.scrolling === 'yes') {
							//If scrolling is desired, the overlay has to be disabled or you cannot scroll
							options.overlay = false;
						}

						//CROP
						// if (options.crop) {
						// 	// If the crop option is used, don't show the dimensions annotation
						// 	options.dimensions = false;
						// }

						//VIEWPORT-DEVICE and VIEWPORT-DEVICE-ORIENTATION
						if (options['viewport-device']) {
							if (options['viewport-device'] === 'desktop') {
								options['viewport-device-orientation'] = 'landscape';
							}

							device_dimensions = self.get_device_dimensions(options['viewport-device'], options['viewport-device-orientation'], options['show-browser-ui']);
							if (device_dimensions) {
								options['viewport-width'] = device_dimensions.width;
								options['viewport-aspect-ratio'] = device_dimensions['aspect-ratio'];
								self.device_dimensions = device_dimensions;
							}
						}

						options.iframe_src = self.build_iframe_src(options);

						//HREF
						if (options.href === false && self.is_option_overridden('href') === false) {
							// href wasn't set at any level, default to options.frame
							options.href = options.iframe_src;
						}

						return options;
					}
				}, {
					key: 'is_include_template_url_valid',
					value: function is_include_template_url_valid() {
						var self = this,
						    request = new XMLHttpRequest();

						return new _Promise(function (resolve, reject) {

							request.open('HEAD', self.options['include-frame-template'], true);

							request.onload = function () {
								if (request.status >= 200 && request.status < 400) {
									resolve(true);
								} else {
									// We reached our target server, but it returned an error
									self.has_loading_error = true;
									self.loading_error_message = 'Could not load Include in Frame, no include template found at: ' + self.options['include-frame-template'];
									reject(self.loading_error_message);
								}
							};

							request.onerror = function () {
								// There was a connection error of some sort
								self.has_loading_error = true;
								self.loading_error_message = 'Could not load Include in Frame, a connection error occurred while attempting to load: ' + self.options['include-frame-template'];
								reject(self.loading_error_message);
							};

							request.send();
						});
					}
				}, {
					key: 'build_iframe_src',
					value: function build_iframe_src(options) {
						var self = this,
						    iframe_src;

						// INCLUDE FRAME
						if (self.is_include_frame) {
							iframe_src = self.build_include_iframe_src(options);
						}
						// REGULAR FRAME
						else {
							if (options.source.length > 0 && options.source.slice(-1) !== '/') {
								options.source += '/';
							}

							if (options.frame && options.frame.indexOf('http') === 0) {
								self.logger('info', 'Fully qualified url found for page viewer: ' + options.frame + ', esb-frame uuid: ' + self.uuid);
								iframe_src = options.frame;
							} else {
								iframe_src = options.source + options.frame;
							}
						}

						return iframe_src;
					}
				}, {
					key: 'build_include_iframe_src',

					// INCLUDE FRAME ONLY
					value: function build_include_iframe_src(options) {
						// Support legacy 'data-frame-component' syntax
						var self = this,
						    include_url = options['include-frame-template'],
						    include_name = self.original_element.getAttribute('data-frame-component'),
						    include_variation = self.original_element.getAttribute('data-variation'),
						    include_source = self.original_element.getAttribute('data-source'),
						    include_place = self.original_element.getAttribute('data-place'),
						    include_content = self.original_element.getAttribute('data-content');

						if (include_name === null) {
							include_name = options.frame;
						}

						if (include_variation === null) {
							include_variation = options.variation;
						}

						if (include_source === null) {
							include_source = options['include-source'];
						}

						if (include_place === null) {
							include_place = options.place;
						}

						if (include_content === null) {
							include_content = options.content;
						}

						if (include_url.indexOf('?') !== -1) {
							// already has query params
							include_url += '&';
						} else {
							include_url += '?';
						}

						include_url += 'data-esb-include=' + include_name + '&data-esb-variation=' + include_variation + '&data-esb-source=' + include_source + '&data-esb-place=' + include_place + '&data-esb-target=' + options['include-frame-template-target'];
						if (include_content) {
							include_url += '&data-esb-content=' + include_content;
						}

						return encodeURI(include_url).replace(/#/, '%23');
					}
				}, {
					key: 'is_option_overridden',

					// BOTH - CORE
					value: function is_option_overridden(option_name) {
						var self = this;
						return self.overridden_options.indexOf(option_name) !== -1;
					}
				}, {
					key: 'get_placeholder_element',

					// PLACEHOLDER ELEMENT CONSTRUCTION

					/* FIVE MAIN CONTAINING ELEMENTS:
     .esb-frame outermost wrapper
     	.esb-frame-inner-wrap, either a link or a span wrapping all of the contents within
     		.esb-frame-title
     		.esb-frame-caption
     		.esb-frame-device-annotation
     		.esb-frame-dimensions-annotation
     		.esb-frame-iframe-wrap, wrapper around the iframe related content - can be used to crop the iframe content - not scaled
     			.esb-frame-device, <svg> element absolutely positioned within .esb-frame-iframe-wrap as a background for the <iframe>
     			.esb-loading-animation
     			.esb-frame-iframe-inner-wrap, wrapper around the iframe and any other scaled content - IS scaled
     				.esb-frame-iframe, the <iframe> element itself 
     */
					// BOTH - CORE
					value: function get_placeholder_element() {
						var self = this,
						    outer_wrap = self.get_element_outer_wrap(),
						    inner_wrap = self.get_element_inner_wrap(),
						    title = self.get_element_title(),
						    caption = self.get_element_caption(),
						    dimensions_annotation = self.get_element_dimensions_annotation(),
						    device_annotation = self.get_element_device_annotation(),
						    iframe_outer_wrap = self.get_element_iframe_outer_wrap(),
						    device_frame = self.get_element_device_frame(self.options['viewport-device'], self.options['viewport-device-orientation']),
						    browser_ui_top = self.get_element_browser_ui('top'),
						    browser_ui_bottom = self.get_element_browser_ui('bottom'),
						    loading_animation = self.get_element_loading_animation(),
						    iframe_inner_wrap = self.get_element_iframe_inner_wrap(),
						    iframe = self.get_element_iframe(),
						    loading_error = self.get_element_loading_error();

						if (browser_ui_top !== undefined) {
							iframe_inner_wrap.appendChild(browser_ui_top);
						}

						iframe_inner_wrap.appendChild(iframe);

						if (browser_ui_bottom !== undefined) {
							iframe_inner_wrap.appendChild(browser_ui_bottom);
						}

						if (device_frame !== undefined) {
							iframe_outer_wrap.appendChild(device_frame);
						}

						iframe_outer_wrap.appendChild(loading_animation);
						iframe_outer_wrap.appendChild(iframe_inner_wrap);

						if (title !== undefined) {
							inner_wrap.appendChild(title);
						}

						if (caption !== undefined) {
							inner_wrap.appendChild(caption);
						}

						if (device_annotation !== undefined) {
							inner_wrap.appendChild(device_annotation);
						}

						if (dimensions_annotation !== undefined) {
							inner_wrap.appendChild(dimensions_annotation);
						}

						inner_wrap.appendChild(iframe_outer_wrap);

						if (self.has_loading_error) {
							outer_wrap.appendChild(loading_error);
						} else {
							outer_wrap.appendChild(inner_wrap);
						}

						return outer_wrap;
					}
				}, {
					key: 'get_element_loading_error',
					value: function get_element_loading_error() {
						var self = this,
						    loading_error;

						if (self.has_loading_error) {
							loading_error = document.createElement('span');
							EsbUtil.addClass(loading_error, 'esb-frame-loading-error');
							loading_error.textContent = self.loading_error_message;
						}

						return loading_error;
					}
				}, {
					key: 'get_element_outer_wrap',
					value: function get_element_outer_wrap() {
						var self = this,
						    outer_wrap = document.createElement('div');

						EsbUtil.addClass(outer_wrap, 'esb-frame');
						outer_wrap.setAttribute('data-esb-uuid', self.uuid);

						if (self.options.overlay) {
							EsbUtil.addClass(outer_wrap, 'esb-frame-has-overlay');
						}
						if (self.is_include_frame) {
							EsbUtil.addClass(outer_wrap, ' esb-frame--is-framed-include');
						}
						if (self.has_loading_error) {
							EsbUtil.addClass(outer_wrap, 'esb-frame--has-loading-error');
						}
						if (self.options['device-frame']) {
							EsbUtil.addClass(outer_wrap, 'esb-frame--has-device-frame esb-frame-device-frame-' + self.options['viewport-device']);
							EsbUtil.addClass(outer_wrap, 'esb-frame-device-orientation-' + self.options['viewport-device-orientation']);
						}

						return outer_wrap;
					}
				}, {
					key: 'get_element_inner_wrap',
					value: function get_element_inner_wrap() {
						var self = this,
						    inner_wrap;

						if (self.options.href) {
							inner_wrap = document.createElement('a');
							EsbUtil.addClass(inner_wrap, 'esb-frame-link');
							inner_wrap.setAttribute('href', self.options.href);
						} else {
							inner_wrap = document.createElement('span');
						}

						EsbUtil.addClass(inner_wrap, 'esb-frame-inner-wrap');

						return inner_wrap;
					}
				}, {
					key: 'get_element_title',

					// BOTH - FEATURE
					value: function get_element_title() {
						var self = this,
						    title;

						if (self.options.title) {
							title = document.createElement('h3');
							title.textContent = self.options.title;
							EsbUtil.addClass(title, 'esb-frame-title');
						}

						return title;
					}
				}, {
					key: 'get_element_caption',

					// BOTH - FEATURE
					value: function get_element_caption() {
						var self = this,
						    caption;
						if (self.options.caption) {
							caption = document.createElement('p');
							caption.textContent = self.options.caption;
							EsbUtil.addClass(caption, 'esb-frame-caption');
						}

						return caption;
					}
				}, {
					key: 'get_element_device_annotation',
					value: function get_element_device_annotation() {
						var self = this,
						    device_annotation,
						    annotation_text;

						if (self.options['viewport-device'] && self.options['device-annotation']) {
							device_annotation = document.createElement('p');
							annotation_text = self.device_presets[self.options['viewport-device']]['annotation-name'];
							if (self.options['viewport-device-orientation'] === 'landscape' && self.options['viewport-device'] !== 'desktop') {
								annotation_text += ', Landscape';
							}
							device_annotation.textContent = annotation_text;
							EsbUtil.addClass(device_annotation, 'esb-frame-device-annotation');
						}

						return device_annotation;
					}
				}, {
					key: 'get_element_dimensions_annotation',

					// BOTH - CORE
					value: function get_element_dimensions_annotation() {
						var self = this,
						    dimensions = self.get_iframe_dimensions(),
						    dimensions_annotation,
						    dimensions_value_element,
						    dimensions_value_width_element,
						    dimensions_value_height_element,
						    dimensions_value_scale_element,
						    scale = parseFloat((dimensions.scale * 100).toFixed(1));

						if (self.options.dimensions) {
							if (self.options.crop === true) {
								dimensions.width = self.options.width;
								dimensions.height = self.options.height;
							}

							dimensions_annotation = document.createElement('p');
							EsbUtil.addClass(dimensions_annotation, 'esb-frame-dimensions-annotation esb-frame-dimensions--updating');
							dimensions_annotation.appendChild(self.get_element_icon('dimensions'));

							dimensions_value_element = document.createElement('span');
							EsbUtil.addClass(dimensions_value_element, 'esb-frame-dimensions-value');

							dimensions_value_width_element = document.createElement('span');
							if (dimensions.width) {
								dimensions_value_width_element.textContent = Math.round(dimensions.width);
							}
							EsbUtil.addClass(dimensions_value_width_element, 'esb-frame-dimensions-width-value');

							dimensions_value_height_element = document.createElement('span');
							if (dimensions.height) {
								dimensions_value_height_element.textContent = Math.round(dimensions.height);
							}
							EsbUtil.addClass(dimensions_value_height_element, 'esb-frame-dimensions-height-value');

							dimensions_value_element.appendChild(dimensions_value_width_element);
							dimensions_value_element.innerHTML = dimensions_value_element.innerHTML + '&times;';
							dimensions_value_element.appendChild(dimensions_value_height_element);

							dimensions_annotation.appendChild(dimensions_value_element);

							if (scale !== 100) {
								dimensions_annotation.appendChild(self.get_element_icon('scale'));
								dimensions_value_scale_element = document.createElement('span');
								dimensions_value_scale_element.textContent = scale;
								dimensions_value_scale_element.innerHTML = dimensions_value_scale_element.innerHTML + '%';
								EsbUtil.addClass(dimensions_value_scale_element, 'esb-frame-dimensions-scale-value');
								dimensions_annotation.appendChild(dimensions_value_scale_element);
							}
						}

						return dimensions_annotation;
					}
				}, {
					key: 'get_element_icon',
					value: function get_element_icon(icon_name) {
						return EsbUtil.get_svg_icon(icon_name);
					}
				}, {
					key: 'get_element_loading_animation',

					// BOTH - CORE
					value: function get_element_loading_animation() {
						var loading_animation = document.createElement('div');
						EsbUtil.addClass(loading_animation, 'esb-loading-animation');
						return loading_animation;
					}
				}, {
					key: 'get_element_iframe_outer_wrap',

					// BOTH  - CORE - Rename!
					value: function get_element_iframe_outer_wrap() {
						var self = this,
						    iframe_outer_wrap = document.createElement('div'),
						    styles = self.get_iframe_outer_wrap_styles(),
						    style;

						EsbUtil.addClass(iframe_outer_wrap, 'esb-frame-iframe-wrap');
						for (style in styles) {
							iframe_outer_wrap.style[style] = styles[style];
						}

						return iframe_outer_wrap;
					}
				}, {
					key: 'get_element_iframe_inner_wrap',
					value: function get_element_iframe_inner_wrap() {
						var self = this,
						    iframe_inner_wrap = document.createElement('div'),
						    styles = self.get_iframe_inner_wrap_styles(),
						    style;

						EsbUtil.addClass(iframe_inner_wrap, 'esb-frame-iframe-inner-wrap');
						for (style in styles) {
							iframe_inner_wrap.style[style] = styles[style];
						}

						return iframe_inner_wrap;
					}
				}, {
					key: 'get_element_iframe',

					// BOTH - RENAME
					value: function get_element_iframe() {
						var self = this,
						    iframe = document.createElement('iframe');

						EsbUtil.addClass(iframe, 'esb-frame-iframe');
						iframe.setAttribute('data-src', self.iframe_src);
						iframe.setAttribute('scrolling', self.options.scrolling);
						if (self.options['viewport-device']) {
							iframe.style.height = self.device_dimensions['iframe-height'] + 'px';
						}

						return iframe;
					}
				}, {
					key: 'get_iframe_outer_wrap_styles',

					// CALCULATING HEIGHT, WIDTH, SCALE OF FRAME
					// BOTH - CORE - Refactor
					value: function get_iframe_outer_wrap_styles() {
						var self = this,
						    styles = {},
						    height,
						    device_frame_offsets,
						    width = self.options.width;

						if (self.options.scale) {
							width = self.options['viewport-width'] * self.options.scale;
						}

						if (self.options.height) {
							height = self.options.height;
						} else if (self.is_include_frame) {
							height = 180; //Set a nice default height so the loading animation displays
						} else if (width && self.options['viewport-aspect-ratio']) {
							height = width * self.options['viewport-aspect-ratio'];
						}

						if (self.options['device-frame']) {
							device_frame_offsets = self.get_device_frame_dimension_offsets(self.options['viewport-device'], self.options['viewport-device-orientation']);
							width = width * device_frame_offsets.width;
							height = height * device_frame_offsets.height;
						}

						if (self.options.crop) {
							width = self.options.width;
						}

						if (!self.options.crop && self.is_include_frame) {
							width = 100;
							height = 100;
						}

						styles = {
							width: width + 'px',
							height: height + 'px'
						};

						if (height === 'auto') {
							styles[height] = 'auto';
						}

						return styles;
					}
				}, {
					key: 'get_iframe_inner_wrap_styles',

					// BOTH - CORE - Refactor
					value: function get_iframe_inner_wrap_styles() {
						var self = this,
						    dimensions = self.get_iframe_dimensions();

						dimensions.width = dimensions.width + 'px';
						if (dimensions.height !== 'auto') {
							dimensions.height = dimensions.height + 'px';
						}
						dimensions.transform = 'scale(' + dimensions.scale + ')';
						dimensions.webkitTransform = 'scale(' + dimensions.scale + ')';
						delete dimensions.scale;

						if (self.options['offset-x']) {
							dimensions.left = self.options['offset-x'] + 'px';
						}

						if (self.options['offset-y']) {
							dimensions.top = self.options['offset-y'] + 'px';
							if (self.options['offset-y'] < 0) {
								dimensions.height = dimensions.height.replace(/px/, '') * 1 + Math.abs(self.options['offset-y']) + 'px';
							}
						}

						return dimensions;
					}
				}, {
					key: 'get_iframe_dimensions',

					// BOTH - RENAME
					value: function get_iframe_dimensions() {
						var self = this,
						    scale = self.options.scale,
						    height,
						    width,
						    dimensions = {
							'width': null,
							'height': null,
							'scale': null
						};

						if (!scale && self.options.width) {
							scale = self.options.width / self.options['viewport-width'];
						}
						width = self.options['viewport-width'];

						if (self.options.height !== 'auto') {
							if (self.options.height) {
								height = self.options.height / scale;
							} else {
								height = self.options['viewport-aspect-ratio'] * width;
							}
						}

						dimensions.height = height;
						dimensions.width = width;
						dimensions.scale = scale;

						return dimensions;
					}
				}, {
					key: 'inject_placeholder',

					// INSERTING PLACEHOLDER TO DOM, SETTING LOADING BEHAVIOR
					// BOTH - CORE
					value: function inject_placeholder() {
						var self = this;
						self.original_element.parentNode.replaceChild(self.placeholder_element, self.original_element);
						self.viewer_element = self.placeholder_element;
						self.iframe_element = self.viewer_element.querySelector('iframe');

						self.dimensions_annotation_width_element = self.viewer_element.querySelector('.esb-frame-dimensions-width-value');
						self.dimensions_annotation_height_element = self.viewer_element.querySelector('.esb-frame-dimensions-height-value');
						self.dimensions_annotation_scale_element = self.viewer_element.querySelector('.esb-frame-scale-value');
						self.dimensions_annotation_element = self.viewer_element.querySelector('.esb-frame-dimensions-annotation');

						if (!self.has_loading_error) {
							self.set_scrollable_ancestors();
							self.set_event_listeners();
							self.set_iframe_onload_behavior();

							if (self.options['load-immediately'] === true) {
								self.load_iframe();
							} else {
								EsbPage.blocksDone().then(function () {
									self.load_iframe_if_visible();
								}, function () {
									self.logger('error', 'EsbFrame ' + self.uuid + ' could not be loaded because Blocks Done did not fire within the Blocks Done Timeout Threshold of: ' + EsbPage.getBlocksDoneTimeout() + 'ms');
								});
							}
						}
					}
				}, {
					key: 'inject_placeholder_if_placeholder_is_created',
					value: function inject_placeholder_if_placeholder_is_created() {
						var self = this;
						self.is_placeholder_created().then(function () {
							self.inject_placeholder();
						});
					}
				}, {
					key: 'is_iframe_loaded',

					// MONITORING SCROLLING, VISIBILITY TO TRIGGER LOAD
					// BOTH - CORE
					value: function is_iframe_loaded() {
						var self = this;
						return self.iframe_is_loaded;
					}
				}, {
					key: 'set_scrollable_ancestors',

					// BOTH - CORE
					value: function set_scrollable_ancestors() {
						var self = this,
						    ancestors = [],
						    el = self.viewer_element;

						while (el.parentNode) {
							el = el.parentNode;
							if (el.scrollHeight > el.offsetHeight) {
								if (el.nodeName === 'BODY' || el.nodeName === 'HTML') {
									el = window;
								}
								ancestors.push(el);
							}
						}

						if (ancestors.length === 0) {
							ancestors.push(document);
						}

						self.scrollable_ancestors = ancestors;
						self.monitor_scrollable_ancestors();
					}
				}, {
					key: 'debounce_scroll_event',

					// BOTH - CORE
					value: function debounce_scroll_event() {
						var self = this,
						    allow_scroll = true;
						if (allow_scroll) {
							allow_scroll = false;
							if (!self.is_iframe_loaded()) {
								self.load_iframe_if_visible();
							} else if (self.options['unload-when-not-visible']) {
								self.unload_iframe_if_not_visible();
							}
							setTimeout(function () {
								allow_scroll = true;self.load_iframe_if_visible();
							}, 2000);
						}
					}
				}, {
					key: 'debounce_resize_event',

					// BOTH - CORE
					value: function debounce_resize_event() {
						var self = this,
						    allow_resize = true;
						if (allow_resize) {
							allow_resize = false;
							if (!self.is_iframe_loaded()) {
								self.load_iframe_if_visible();
							} else if (self.options['unload-when-not-visible']) {
								self.unload_iframe_if_not_visible();
							}
							setTimeout(function () {
								allow_resize = true;self.load_iframe_if_visible();
							}, 2000);
						}
					}
				}, {
					key: 'monitor_scrollable_ancestors',

					// BOTH - CORE
					value: function monitor_scrollable_ancestors() {
						var self = this;

						Array.prototype.forEach.call(self.scrollable_ancestors, function (el) {
							el.addEventListener('scroll', self.debounce_scroll_event.bind(self));
							el.addEventListener('resize', self.debounce_resize_event.bind(self));
						});
					}
				}, {
					key: 'set_iframe_onload_behavior',

					// BOTH - CORE - refactor
					value: function set_iframe_onload_behavior() {
						var self = this;

						self.iframe_element.onload = function () {
							self.iframe_onload();
						};
					}
				}, {
					key: 'iframe_onload',
					value: function iframe_onload() {
						var self = this;

						if (!self.iframe_is_loaded) {
							self.set_state('loaded');
							self.iframe_is_loaded = true;

							if (!self.options['unload-when-not-visible']) {
								self.stop_monitoring_scrollable_ancestors();
							}

							if (self.options['fit-frame-to-contents']) {
								self.fit_frame_to_contents();
							} else {
								self.set_dimensions_annotation_status('updated');
							}
						}
					}
				}, {
					key: 'is_visible',

					// BOTH - CORE
					value: function is_visible() {
						var self = this,
						    visible = true,
						    ancestors = self.scrollable_ancestors.slice(0),
						    shortest_ancestor_height = null,
						    shortest_ancestor_top = null,
						    shortest_ancestor_bottom = null,
						    bounding_rect = self.viewer_element.getBoundingClientRect(),
						    top_visible_threshold = bounding_rect.top,
						    bottom_visible_threshold = bounding_rect.bottom,
						    ancestor_height,
						    ancestor_bottom,
						    ancestor_top;

						if (self.viewer_element.offsetParent === null) {
							visible = false;
						} else {
							Array.prototype.forEach.call(ancestors, function (el, i) {
								if (ancestors[i + 1] !== undefined) {
									ancestor_height = ancestors[i].getBoundingClientRect().height;
									ancestor_bottom = ancestors[i].getBoundingClientRect().bottom;
									ancestor_top = ancestors[i].getBoundingClientRect().top;
								} else {
									ancestor_height = window.innerHeight;
									ancestor_top = 0;
									ancestor_bottom = ancestor_height;
								}

								if (shortest_ancestor_height === null || shortest_ancestor_height > ancestor_height) {
									shortest_ancestor_height = ancestor_height;
									shortest_ancestor_top = ancestor_top;
									shortest_ancestor_bottom = ancestor_bottom;
								}
							});

							if (shortest_ancestor_height !== null && (top_visible_threshold >= shortest_ancestor_height + shortest_ancestor_top || bottom_visible_threshold <= shortest_ancestor_top)) {
								visible = false;
							}
						}

						return visible;
					}
				}, {
					key: 'load_iframe',

					// BOTH - CORE
					value: function load_iframe() {
						var self = this;

						if (self.iframe_element.getAttribute('src') === null) {
							self.set_state('loading');
							self.iframe_element.setAttribute('src', self.iframe_element.getAttribute('data-src'));

							// trigger onload behavior after a timeout in case the onload event doesn't fire (seems to randomly not fire)
							setTimeout(function () {
								self.iframe_onload();
							}, 800);
						}
					}
				}, {
					key: 'load_iframe_if_visible',

					// BOTH - CORE
					value: function load_iframe_if_visible() {
						var self = this;

						if (self.is_visible()) {
							self.load_iframe();
						}
					}
				}, {
					key: 'set_event_listeners',

					// BIND GLOBAL EVENT LISTENERS
					// BOTH - FEATURE
					value: function set_event_listeners() {
						var self = this;

						document.addEventListener('load-esb-frame-' + self.uuid, self.load_iframe.bind(self));
						document.addEventListener('unload-esb-frame-' + self.uuid, self.unload_iframe.bind(self));

						if (window.$ !== undefined) {
							// jQuery's event system is separate from the browser's, so set these up so $(document).trigger will work
							window.$(document).on('load-esb-frame-' + self.uuid, self.load_iframe.bind(self));
							window.$(document).on('unload-esb-frame-' + self.uuid, self.unload_iframe.bind(self));
						}
					}
				}, {
					key: 'set_state',

					// STATE UPDATE METHODS
					// BOTH - Refactor?
					value: function set_state(state) {
						var self = this;
						self.state = state;
						self.viewer_element.classList.add('esb-frame--is-' + state);
					}
				}, {
					key: 'update_dimensions_annotation',

					// BOTH - CORE
					value: function update_dimensions_annotation(dimensions) {
						var self = this;

						if (self.dimensions_annotation_element !== null) {
							if (dimensions.width !== undefined && self.options.crop === false) {
								self.dimensions_annotation_width_element.textContent = dimensions.width;
							}

							if (dimensions.height !== undefined && self.options.crop === false) {
								self.dimensions_annotation_height_element.textContent = dimensions.height;
							}

							if (dimensions.scale !== undefined) {
								self.dimensions_annotation_scale_element.textContent = dimensions.scale + '%';
							}

							self.set_dimensions_annotation_status('updated');
						}
					}
				}, {
					key: 'set_dimensions_annotation_status',

					// BOTH - CORE - Refactor
					value: function set_dimensions_annotation_status(status) {
						var self = this;

						if (self.dimensions_annotation_element !== null) {
							if (status === 'updated') {
								EsbUtil.removeClass(self.dimensions_annotation_element, 'esb-frame-dimensions--updating');
							} else if (status === 'updating') {
								EsbUtil.addClass(self.dimensions_annotation_element, 'esb-frame-dimensions--updating');
							}
						}
					}
				}, {
					key: 'set_frame_height',

					// POST IFRAME LOADED METHODS
					// BOTH - CORE - REFACTOR
					value: function set_frame_height(height) {
						var self = this,
						    inner_wrap = self.viewer_element.querySelector('.esb-frame-iframe-inner-wrap'),
						    scale = self.options.scale,
						    wrap = self.viewer_element.querySelector('.esb-frame-iframe-wrap'),
						    offset_height_adjust = 0;

						if (self.options['offset-y'] < 0) {
							offset_height_adjust = Math.abs(self.options['offset-y']);
						}

						inner_wrap.style.height = height + offset_height_adjust + 'px';

						if (!self.options.crop) {
							if (!scale) {
								scale = self.options.width / self.options['viewport-width'];
							}
							wrap.style.height = height * scale + 'px';
						}

						self.update_dimensions_annotation({ height: height });
					}
				}, {
					key: 'set_frame_width',

					// BOTH - CORE - REFACTOR
					value: function set_frame_width(width) {
						var self = this,
						    inner_wrap = self.viewer_element.querySelector('.esb-frame-iframe-inner-wrap'),
						    scale = self.options.scale,
						    wrap = self.viewer_element.querySelector('.esb-frame-iframe-wrap');

						inner_wrap.style.width = width + 'px';

						if (!self.options.crop) {
							if (!scale) {
								scale = self.options.width / self.options['viewport-width'];
							}
							wrap.style.width = width * scale + 'px';
						}

						self.update_dimensions_annotation({ width: width });
					}
				}, {
					key: 'fit_frame_to_contents',

					// INCLUDE FRAME ONLY
					value: function fit_frame_to_contents() {
						var self = this,
						    content,
						    content_height,
						    content_width,
						    document_loaded_interval,
						    blocks_done_interval,
						    previous_width,
						    previous_height,
						    assets_done_loading_interval,
						    wrapper_element = document.createElement('span');

						wrapper_element.style.display = 'inline-block';
						wrapper_element.style.marginTop = '-1px;';
						wrapper_element.style.paddingTop = '1px;';
						wrapper_element.style.marginBottom = '-1px;';
						wrapper_element.style.paddingBottom = '1px;';
						if (self.is_option_overridden('viewport-width')) {
							wrapper_element.style.width = self.options['viewport-width'] + 'px';
						}
						self.set_dimensions_annotation_status('updating');

						document_loaded_interval = setInterval(function () {
							// Make sure the document in the content window exists
							if (self.iframe_element.contentWindow !== null) {
								clearInterval(document_loaded_interval);

								blocks_done_interval = setInterval(function () {
									// Make sure blocks has finished doing its thing
									if (self.iframe_element.contentWindow.blocks_done) {
										window.console.log('BLOCKS DONE');
										clearInterval(blocks_done_interval);

										content = self.iframe_element.contentWindow.document.querySelector(self.options['include-frame-template-target']).innerHTML;
										window.console.log(content);
										wrapper_element.innerHTML = content;
										// Wrap contents with a display: inline-block; element to get an accurate height and width
										self.iframe_element.contentWindow.document.querySelector(self.options['include-frame-template-target']).innerHTML = '';
										self.iframe_element.contentWindow.document.querySelector(self.options['include-frame-template-target']).appendChild(wrapper_element);

										// Take a pause before assessing height since the appendChild causes the DOM to reload
										// content_height = EsbUtil.outerHeight(wrapper_element);
										// content_width = EsbUtil.outerWidth(wrapper_element);

										assets_done_loading_interval = setInterval(function () {
											content_height = EsbUtil.outerHeight(wrapper_element);
											content_width = EsbUtil.outerWidth(wrapper_element);

											if (content_height === previous_height && content_width === previous_width) {
												// Unwrap contents
												content = wrapper_element.innerHTML;
												self.iframe_element.contentWindow.document.querySelector(self.options['include-frame-template-target']).innerHTML = content;
												clearInterval(assets_done_loading_interval);
												// Add a slight delay so the dom can re-render correctly and we get accurate width and height calculations
												setTimeout(function () {
													self.set_frame_height(content_height);
													self.set_frame_width(content_width);

													EsbUtil.addClass(self.viewer_element, 'esb-frame--dynamically-resized');
												}, 100);
											} else {
												previous_height = content_height;
												previous_width = content_width;
											}
										}, 250);
									}
								}, 10);
							}
						}, 10);
					}
				}, {
					key: 'stop_monitoring_scrollable_ancestors',

					// BOTH - CORE
					value: function stop_monitoring_scrollable_ancestors() {
						var self = this;

						Array.prototype.forEach.call(self.scrollable_ancestors, function (el) {
							el.removeEventListener('scroll', self.debounce_scroll_event.bind(self));
							el.removeEventListener('resize', self.debounce_resize_event.bind(self));
						});
					}
				}, {
					key: 'unload_iframe',

					// BOTH - CORE
					value: function unload_iframe() {
						var self = this,
						    unloaded_frame = self.get_placeholder_element();

						self.viewer_element.parentNode.replaceChild(unloaded_frame, self.viewer_element);
						self.viewer_element = unloaded_frame;
						self.iframe_element = self.viewer_element.querySelector('iframe');
						self.set_iframe_onload_behavior();
						self.iframe_is_loaded = false;
					}
				}, {
					key: 'unload_iframe_if_not_visible',

					// BOTH - CORE
					value: function unload_iframe_if_not_visible() {
						var self = this;

						if (!self.is_visible()) {
							self.unload_iframe();
						}
					}
				}, {
					key: 'get_element_browser_ui',

					// IPHONE / DEVICE FRAMING FUNCTIONALITY
					// FRAME ONLY - FEATURE
					value: function get_element_browser_ui(direction) {
						var self = this,
						    browser_ui,
						    browser_ui_height,
						    device_orientation = self.options['viewport-device-orientation'],
						    device_name = self.options['viewport-device'],
						    apple_devices = ['iphone-4', 'iphone-5', 'iphone-6', 'iphone-6-plus', 'ipad'],
						    is_apple_device = apple_devices.indexOf(device_name) !== -1,
						    browser_ui_class;

						if (self.options['show-browser-ui'] && self.device_presets[device_name]['browser-ui-' + direction + '-' + device_orientation] > 0) {
							browser_ui_height = self.device_presets[device_name]['browser-ui-' + direction + '-' + device_orientation];
							browser_ui_class = 'esb-frame-browser-ui-' + direction + ' esb-frame-browser-ui-' + direction + '-' + device_name;
							if (is_apple_device) {
								browser_ui_class += ' esb-frame-browser-ui-apple';
							} else {
								browser_ui_class += ' esb-frame-browser-ui-android';
							}

							browser_ui = document.createElement('div');
							EsbUtil.addClass(browser_ui, browser_ui_class);
							browser_ui.style.height = browser_ui_height + 'px';
						}

						return browser_ui;
					}
				}, {
					key: 'get_device_dimensions',

					// FRAME ONLY
					value: function get_device_dimensions(key, orientation, show_browser_ui) {
						var self = this,
						    result_dimensions = false,
						    height,
						    iframe_height,
						    width,
						    aspect_ratio;

						height = self.device_presets[key].height;
						width = self.device_presets[key].width;

						if (orientation === 'landscape') {
							width = self.device_presets[key].height;
							height = self.device_presets[key].width;
						}

						// Calculate aspect ratio without browser ui
						iframe_height = height;
						aspect_ratio = (height / width).toFixed(5);

						// Adjust height only if browser ui is shown
						if (show_browser_ui) {
							iframe_height = height - (self.device_presets[key]['browser-ui-top-' + orientation] - self.device_presets[key]['browser-ui-bottom-' + orientation]);
						}

						result_dimensions = {
							'iframe-height': iframe_height,
							'height': height,
							'width': width,
							'aspect-ratio': aspect_ratio
						};

						return result_dimensions;
					}
				}, {
					key: 'get_element_device_frame',

					// FRAME ONLY
					value: function get_element_device_frame(key, orientation) {
						var self = this,
						    device_frame;

						if (self.device_presets[key] !== undefined) {
							device_frame = document.createElement('div');
							device_frame.innerHTML = self.device_presets[key].svg;

							if (orientation === 'landscape') {
								device_frame.innerHTML = self.device_presets[key]['svg-landscape'];
							}
							device_frame = device_frame.firstChild;
						}

						return device_frame;
					}
				}, {
					key: 'get_device_frame_dimension_offsets',

					// FRAME ONLY
					value: function get_device_frame_dimension_offsets(key, orientation) {
						var self = this,
						    width,
						    height;

						width = self.device_presets[key]['frame-width-multiplier'];
						height = self.device_presets[key]['frame-height-multiplier'];

						if (orientation === 'landscape') {
							width = self.device_presets[key]['frame-height-multiplier'];
							height = self.device_presets[key]['frame-width-multiplier'];
						}

						return { 'width': width, 'height': height };
					}
				}, {
					key: 'set_device_presets',
					value: function set_device_presets() {
						var self = this;
						self.device_presets = {
							'iphone-4': {
								'annotation-name': 'iPhone 4',
								'width': 320,
								'height': 480,
								'browser-ui-top-portrait': 40,
								'browser-ui-bottom-portrait': 0,
								'browser-ui-top-landscape': 0,
								'browser-ui-bottom-landscape': 0,
								'svg': '<svg class="esb-frame-device" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 132 243.875" enable-background="new 0 0 132 243.875" xml:space="preserve"> <g> <path id="bezel_2_" fill="#FFFFFF" stroke="#7F89A3" stroke-width="2" d="M131,226.883c0,8.833-7.191,15.992-16.062,15.992H17.062 C8.191,242.875,1,235.716,1,226.883V16.992C1,8.159,8.191,1,17.062,1h97.875C123.808,1,131,8.159,131,16.992V226.883L131,226.883z" /> <path id="speaker" fill="none" stroke="#7F89A3" d="M78,26.665c0,0.635-0.439,1.147-0.98,1.147H56.917 c-0.542,0-0.98-0.513-0.98-1.147v-2.58c0-0.635,0.439-1.147,0.98-1.147h20.101c0.541,0,0.979,0.513,0.979,1.147v2.58H78z"/> <circle id="camera_1_" fill="none" stroke="#7F89A3" cx="67" cy="12.919" r="3"/> <ellipse id="lock_1_" fill="none" stroke="#7F89A3" cx="66.039" cy="222.92" rx="10.041" ry="10.001"/> </g> </svg>',
								'svg-landscape': '<svg class="esb-frame-device" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 243.875 132" enable-background="new 0 0 243.875 132" xml:space="preserve"> <g> <path id="bezel_2_" fill="#FFFFFF" stroke="#7F89A3" stroke-width="2" d="M226.883,1c8.833,0,15.992,7.191,15.992,16.062v97.874 c0,8.87-7.159,16.062-15.992,16.062L16.992,131C8.159,131,1,123.808,1,114.937V17.062C1,8.191,8.159,1,16.992,1H226.883L226.883,1z "/> <path id="speaker" fill="none" stroke="#7F89A3" d="M26.665,54c0.635,0,1.147,0.439,1.147,0.98v20.102 c0,0.543-0.513,0.979-1.147,0.979h-2.58c-0.635,0-1.147-0.438-1.147-0.979V54.98c0-0.541,0.513-0.98,1.147-0.98H26.665L26.665,54z" /> <circle id="camera_1_" fill="none" stroke="#7F89A3" cx="12.919" cy="65" r="3"/> <ellipse id="lock_1_" fill="none" stroke="#7F89A3" cx="222.92" cy="65.959" rx="10.001" ry="10.04"/> </g> </svg>',
								'frame-width-multiplier': '1.189',
								'frame-height-multiplier': '1.465'
							},
							'iphone-5': {
								'annotation-name': 'iPhone 5',
								'width': 320,
								'height': 568,
								'browser-ui-top-portrait': 40,
								'browser-ui-bottom-portrait': 0,
								'browser-ui-top-landscape': 0,
								'browser-ui-bottom-landscape': 0,
								'svg': '<svg class="esb-frame-device" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 132 273.875" enable-background="new 0 0 132 273.875" xml:space="preserve"> <g> <path id="bezel_1_" fill="#FFFFFF" stroke="#7F89A3" stroke-width="2" d="M131,256.883c0,8.833-7.191,15.992-16.062,15.992H17.062 C8.191,272.875,1,265.716,1,256.883V16.992C1,8.159,8.191,1,17.062,1h97.875C123.808,1,131,8.159,131,16.992V256.883L131,256.883z" /> <path id="speaker_1_" fill="none" stroke="#7F89A3" d="M78,26.665c0,0.635-0.439,1.147-0.98,1.147H56.917 c-0.542,0-0.98-0.513-0.98-1.147v-2.58c0-0.635,0.439-1.147,0.98-1.147h20.102c0.541,0,0.98,0.513,0.98,1.147V26.665L78,26.665z"/> <circle id="camera_2_" fill="none" stroke="#7F89A3" cx="67" cy="12.919" r="3"/> <ellipse id="lock_2_" fill="none" stroke="#7F89A3" cx="66.039" cy="252.92" rx="10.041" ry="10.001"/> </g> </svg>',
								'svg-landscape': '<svg class="esb-frame-device" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 273.875 132" enable-background="new 0 0 273.875 132" xml:space="preserve"> <g> <path id="bezel_1_" fill="#FFFFFF" stroke="#7F89A3" stroke-width="2" d="M256.883,1c8.833,0,15.992,7.191,15.992,16.062v97.876 c0,8.869-7.159,16.062-15.992,16.062H16.992C8.159,131,1,123.808,1,114.938V17.062C1,8.191,8.159,1,16.992,1H256.883L256.883,1z"/> <path id="speaker_1_" fill="none" stroke="#7F89A3" d="M26.665,54c0.635,0,1.147,0.439,1.147,0.98v20.104 c0,0.541-0.513,0.979-1.147,0.979h-2.58c-0.635,0-1.147-0.438-1.147-0.979V54.98c0-0.541,0.513-0.98,1.147-0.98H26.665L26.665,54z" /> <circle id="camera_2_" fill="none" stroke="#7F89A3" cx="12.919" cy="65" r="3"/> <ellipse id="lock_2_" fill="none" stroke="#7F89A3" cx="252.92" cy="65.96" rx="10.001" ry="10.04"/> </g> </svg>',
								'frame-width-multiplier': '1.188',
								'frame-height-multiplier': '1.39'
							},
							'iphone-6': {
								'annotation-name': 'iPhone 6',
								'width': 375,
								'height': 667,
								'browser-ui-top-portrait': 40,
								'browser-ui-bottom-portrait': 0,
								'browser-ui-top-landscape': 0,
								'browser-ui-bottom-landscape': 0,
								'svg': '<svg class="esb-frame-device" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 150 307.875" enable-background="new 0 0 150 307.875" xml:space="preserve"> <g> <path id="bezel_3_" fill="#FFFFFF" stroke="#7F89A3" stroke-width="2" d="M149,290.883c0,8.833-7.191,15.992-16.062,15.992H17.062 C8.191,306.875,1,299.716,1,290.883V16.992C1,8.159,8.191,1,17.062,1h115.875C141.809,1,149,8.159,149,16.992V290.883L149,290.883z "/> <path id="speaker_2_" fill="none" stroke="#7F89A3" d="M86.031,26.665c0,0.635-0.439,1.147-0.98,1.147H64.949 c-0.542,0-0.98-0.513-0.98-1.147v-2.58c0-0.635,0.439-1.147,0.98-1.147H85.05c0.541,0,0.979,0.513,0.979,1.147v2.58H86.031z"/> <circle id="camera_3_" fill="none" stroke="#7F89A3" cx="75" cy="12.919" r="3"/> <ellipse id="lock_3_" fill="none" stroke="#7F89A3" cx="75" cy="286.92" rx="10.04" ry="10.001"/> </g> </svg>',
								'svg-landscape': '<svg class="esb-frame-device" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 307.875 149.998" enable-background="new 0 0 307.875 149.998" xml:space="preserve"> <g> <path id="bezel_3_" fill="#FFFFFF" stroke="#7F89A3" stroke-width="2" d="M290.883,1c8.833,0,15.992,7.191,15.992,16.062v115.875 c0,8.869-7.159,16.062-15.992,16.062H16.992c-8.833,0-15.992-7.19-15.992-16.06V17.062C1,8.191,8.159,1,16.992,1H290.883L290.883,1 z"/> <path id="speaker_2_" fill="none" stroke="#7F89A3" d="M26.665,63.968c0.635,0,1.147,0.439,1.147,0.98V85.05 c0,0.542-0.513,0.98-1.147,0.98h-2.58c-0.635,0-1.147-0.439-1.147-0.98V64.948c0-0.541,0.513-0.98,1.147-0.98H26.665L26.665,63.968 z"/> <circle id="camera_3_" fill="none" stroke="#7F89A3" cx="12.919" cy="74.999" r="3"/> <ellipse id="lock_3_" fill="none" stroke="#7F89A3" cx="286.92" cy="74.999" rx="10.001" ry="10.04"/> </g> </svg>',
								'frame-width-multiplier': '1.16',
								'frame-height-multiplier': '1.34'
							},
							'iphone-6-plus': {
								'annotation-name': 'iPhone 6 Plus',
								'width': 414,
								'height': 736,
								'browser-ui-top-portrait': 40,
								'browser-ui-bottom-portrait': 0,
								'browser-ui-top-landscape': 0,
								'browser-ui-bottom-landscape': 0,
								'svg': '<svg class="esb-frame-device" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 164 331.875" enable-background="new 0 0 164 331.875" xml:space="preserve"> <g> <path id="bezel_4_" fill="#FFFFFF" stroke="#7F89A3" stroke-width="2" d="M163,314.883c0,8.833-7.191,15.992-16.062,15.992H17.062 C8.191,330.875,1,323.716,1,314.883V16.992C1,8.159,8.191,1,17.062,1h129.875C155.808,1,163,8.159,163,16.992V314.883L163,314.883z "/> <path id="speaker_3_" fill="none" stroke="#7F89A3" d="M93.03,26.665c0,0.635-0.438,1.147-0.979,1.147H71.948 c-0.542,0-0.98-0.513-0.98-1.147v-2.58c0-0.635,0.439-1.147,0.98-1.147h20.1c0.541,0,0.98,0.513,0.98,1.147L93.03,26.665 L93.03,26.665z"/> <circle id="camera_4_" fill="none" stroke="#7F89A3" cx="81.999" cy="12.919" r="3"/> <ellipse id="lock_4_" fill="none" stroke="#7F89A3" cx="81.999" cy="310.92" rx="10.042" ry="10.001"/> </g> </svg>',
								'svg-landscape': '<svg class="esb-frame-device" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 331.875 163.998" enable-background="new 0 0 331.875 163.998" xml:space="preserve"> <g> <path id="bezel_4_" fill="#FFFFFF" stroke="#7F89A3" stroke-width="2" d="M314.883,1c8.833,0,15.992,7.191,15.992,16.062v129.875 c0,8.869-7.159,16.062-15.992,16.062H16.992C8.159,162.998,1,155.808,1,146.937V17.062C1,8.191,8.159,1,16.992,1H314.883L314.883,1 z"/> <path id="speaker_3_" fill="none" stroke="#7F89A3" d="M26.665,70.968c0.635,0,1.147,0.439,1.147,0.98V92.05 c0,0.542-0.513,0.98-1.147,0.98h-2.58c-0.635,0-1.147-0.439-1.147-0.98V71.948c0-0.541,0.513-0.98,1.147-0.98H26.665L26.665,70.968 z"/> <circle id="camera_4_" fill="none" stroke="#7F89A3" cx="12.919" cy="81.999" r="3"/> <ellipse id="lock_4_" fill="none" stroke="#7F89A3" cx="310.92" cy="81.999" rx="10.001" ry="10.04"/> </g> </svg> ',
								'frame-width-multiplier': '1.15',
								'frame-height-multiplier': '1.31'
							},
							'ipad': {
								'annotation-name': 'iPad',
								'width': 768,
								'height': 1024,
								'browser-ui-top-portrait': 42,
								'browser-ui-bottom-portrait': 0,
								'browser-ui-top-landscape': 42,
								'browser-ui-bottom-landscape': 0,
								'svg': '<svg class="esb-frame-device" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 300.917 419.917" enable-background="new 0 0 300.917 419.917" xml:space="preserve"> <g id="IPAD" transform="translate(681.000000, 55.000000)"> <path id="bezel" fill="#FFFFFF" stroke="#7F89A3" stroke-width="2" d="M-393.096,363.917h-274.89 c-6.635,0-12.014-5.377-12.014-12.01V-41.99c0-6.633,5.378-12.01,12.014-12.01h274.89c6.635,0,12.014,5.377,12.014,12.01v393.898 C-381.083,358.541-386.461,363.917-393.096,363.917z"/> <path id="bezel-2" fill="#FFFFFF" stroke="#7F89A3" stroke-width="2" d="M-393.096,363.917h-274.89 c-6.635,0-12.014-5.377-12.014-12.01V-41.99c0-6.633,5.378-12.01,12.014-12.01h274.89c6.635,0,12.014,5.377,12.014,12.01v393.898 C-381.083,358.541-386.461,363.917-393.096,363.917z"/> <circle id="lock" fill="none" stroke="#7F89A3" cx="-530.541" cy="346.938" r="8.021"/> <circle id="camera" fill="none" stroke="#7F89A3" cx="-530.542" cy="-37.093" r="2.99"/> </g> </svg>',
								'svg-landscape': '<svg class="esb-frame-device" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 419.917 300.917" enable-background="new 0 0 419.917 300.917" xml:space="preserve"> <g id="IPAD" transform="translate(681.000000, 55.000000)"> <path id="bezel" fill="#FFFFFF" stroke="#7F89A3" stroke-width="2" d="M-262.083-41.986v274.89c0,6.635-5.377,12.014-12.01,12.014 H-667.99c-6.633,0-12.01-5.377-12.01-12.014v-274.89C-680-48.622-674.623-54-667.99-54h393.898 C-267.459-54-262.083-48.622-262.083-41.986z"/> <path id="bezel-2" fill="#FFFFFF" stroke="#7F89A3" stroke-width="2" d="M-262.083-41.986v274.89 c0,6.635-5.377,12.014-12.01,12.014H-667.99c-6.633,0-12.01-5.377-12.01-12.014v-274.89C-680-48.622-674.623-54-667.99-54h393.898 C-267.459-54-262.083-48.622-262.083-41.986z"/> <circle id="lock" fill="none" stroke="#7F89A3" cx="-279.063" cy="95.458" r="8.021"/> <circle id="camera" fill="none" stroke="#7F89A3" cx="-663.093" cy="95.459" r="2.99"/> </g> </svg>',
								'frame-width-multiplier': '1.14',
								'frame-height-multiplier': '1.194'
							},
							'nexus-10': {
								'annotation-name': 'Nexus 10',
								'width': 800,
								'height': 1280,
								'browser-ui-top-portrait': 20,
								'browser-ui-bottom-portrait': 0,
								'browser-ui-top-landscape': 20,
								'browser-ui-bottom-landscape': 0,
								'svg': '<svg class="esb-frame-device" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 472.125 696.723" enable-background="new 0 0 472.125 696.723" xml:space="preserve"> <g> <path fill="#FFFFFF" stroke="#58595B" d="M67.5,696.223c-37.002,0-67-29.997-67-67V67.5c0-37.003,29.998-67,67-67h337.125 c37.004,0,67,29.997,67,67v561.723c0,37.003-29.996,67-67,67H67.5z"/> <circle fill="#FFFFFF" stroke="#000000" cx="443.623" cy="317.894" r="3.25"/> <circle fill="#FFFFFF" stroke="#000000" cx="443.873" cy="376.644" r="4"/> </g> </svg>',
								'svg-landscape': '<svg class="esb-frame-device" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 696.722 472.125" enable-background="new 0 0 696.722 472.125" xml:space="preserve"> <g> <path fill="#FFFFFF" stroke="#58595B" d="M696.222,404.625c0,37.002-29.998,67-67,67H67.5c-37.003,0-67-29.998-67-67V67.5 c0-37.004,29.997-67,67-67h561.722c37.002,0,67,29.996,67,67V404.625z"/> <circle fill="#FFFFFF" stroke="#000000" cx="317.894" cy="28.502" r="3.25"/> <circle fill="#FFFFFF" stroke="#000000" cx="376.643" cy="28.252" r="4"/> </g> </svg>',
								'frame-width-multiplier': '1.305',
								'frame-height-multiplier': '1.204'
							},
							'galaxy-s6': {
								'annotation-name': 'Galaxy S6',
								'width': 360,
								'height': 640,
								'browser-ui-top-portrait': 20,
								'browser-ui-bottom-portrait': 0,
								'browser-ui-top-landscape': 20,
								'browser-ui-bottom-landscape': 0,
								'svg': '<svg class="esb-frame-device" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 163 335" enable-background="new 0 0 163 335" xml:space="preserve"> <g> <path fill="#FFFFFF" stroke="#808285" d="M162.5,308.5c0,14.359-11.641,26-26,26h-110c-14.359,0-26-11.641-26-26v-282 c0-14.359,11.641-26,26-26h110c14.359,0,26,11.641,26,26V308.5z"/> <path fill="#FFFFFF" stroke="#808285" stroke-miterlimit="10" d="M100.834,316.5c0,4.418-3.582,8-8,8H70.167c-4.418,0-8-3.582-8-8 l0,0c0-4.418,3.582-8,8-8h22.667C97.252,308.5,100.834,312.082,100.834,316.5L100.834,316.5z"/> <path fill="#FFFFFF" stroke="#808285" stroke-miterlimit="10" d="M97.492,13.042c0,1.381-1.119,2.5-2.5,2.5H68.009 c-1.381,0-2.5-1.119-2.5-2.5l0,0c0-1.381,1.119-2.5,2.5-2.5h26.983C96.373,10.542,97.492,11.661,97.492,13.042L97.492,13.042z"/> <circle fill="#FFFFFF" stroke="#808285" stroke-miterlimit="10" cx="50.365" cy="12.354" r="2.438"/> <circle fill="#FFFFFF" stroke="#808285" stroke-miterlimit="10" cx="57.99" cy="12.354" r="2.438"/> <circle fill="#FFFFFF" stroke="#808285" stroke-miterlimit="10" cx="120.428" cy="12.229" r="4.125"/> </g> </svg>',
								'svg-landscape': '<svg class="esb-frame-device" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 335 163" enable-background="new 0 0 335 163" xml:space="preserve"> <g> <path fill="#FFFFFF" stroke="#808285" d="M308.5,0.5c14.359,0,26,11.641,26,26v110c0,14.359-11.641,26-26,26h-282 c-14.359,0-26-11.641-26-26v-110c0-14.359,11.641-26,26-26H308.5z"/> <path fill="#FFFFFF" stroke="#808285" stroke-miterlimit="10" d="M316.5,62.166c4.418,0,8,3.582,8,8v22.667c0,4.418-3.582,8-8,8 l0,0c-4.418,0-8-3.582-8-8V70.166C308.5,65.748,312.083,62.166,316.5,62.166L316.5,62.166z"/> <path fill="#FFFFFF" stroke="#808285" stroke-miterlimit="10" d="M13.042,65.508c1.381,0,2.5,1.119,2.5,2.5v26.984 c0,1.381-1.119,2.5-2.5,2.5l0,0c-1.381,0-2.5-1.119-2.5-2.5V68.008C10.542,66.627,11.661,65.508,13.042,65.508L13.042,65.508z"/> <circle fill="#FFFFFF" stroke="#808285" stroke-miterlimit="10" cx="12.354" cy="112.635" r="2.438"/> <circle fill="#FFFFFF" stroke="#808285" stroke-miterlimit="10" cx="12.354" cy="105.01" r="2.438"/> <circle fill="#FFFFFF" stroke="#808285" stroke-miterlimit="10" cx="12.229" cy="42.572" r="4.125"/> </g> </svg>',
								'frame-width-multiplier': '1.098',
								'frame-height-multiplier': '1.268'
							},
							'desktop': {
								'annotation-name': 'Desktop',
								'width': 788,
								'height': 1400,
								'browser-ui-top-portrait': 20,
								'browser-ui-bottom-portrait': 0,
								'browser-ui-top-landscape': 20,
								'browser-ui-bottom-landscape': 0,
								'svg-landscape': '<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="2.084 2 550.917 428.055" enable-background="new 2.084 2 550.917 428.055" xml:space="preserve"><g id="IPAD" transform="translate(681.000000, 55.000000)"><path id="bezel-2" fill="#FFFFFF" stroke="#7F89A3" stroke-width="2" d="M-136.749,324.034h-533.417c-4.28,0-7.75-3.469-7.75-7.748V-44.253c0-4.278,3.469-7.747,7.75-7.747h533.417c4.28,0,7.75,3.469,7.75,7.747v360.539C-128.999,320.565-132.468,324.034-136.749,324.034z"/></g><path fill="#FFFFFF" stroke="#7F89A3" stroke-width="2" d="M336.246,380.968v25.508c0,8.906-7.221,16.127-16.127,16.127h-85.152c-8.906,0-16.127-7.221-16.127-16.127v-25.508H336.246z"/><path fill="#FFFFFF" stroke="#7F89A3" stroke-width="2" d="M277.542,420.668"/><path fill="#FFFFFF" stroke="#7F89A3" stroke-width="2" d="M367.533,419.055c0,5.522-4.477,9.999-9.999,9.999H197.552\tc-5.523,0-10-4.477-10-9.999l0,0c0-5.522,4.477-9.999,10-9.999h159.981C363.056,409.056,367.533,413.533,367.533,419.055L367.533,419.055z"/></svg>',
								'frame-width-multiplier': '1.518',
								'frame-height-multiplier': '1.1'
							}
						};
					}
				}]);

				return EsbFrame;
			})();

			_export('EsbFrame', EsbFrame);
		}
	};
});
System.register('src/esb-mark', ['npm:babel-runtime@5.2.9/helpers/create-class', 'npm:babel-runtime@5.2.9/helpers/class-call-check', 'src/esb-config', 'src/esb-util', 'src/esb-page'], function (_export) {
	var _createClass, _classCallCheck, EsbConfig, EsbUtil, EsbPage, EsbMark;

	return {
		setters: [function (_npmBabelRuntime529HelpersCreateClass) {
			_createClass = _npmBabelRuntime529HelpersCreateClass['default'];
		}, function (_npmBabelRuntime529HelpersClassCallCheck) {
			_classCallCheck = _npmBabelRuntime529HelpersClassCallCheck['default'];
		}, function (_srcEsbConfig) {
			EsbConfig = _srcEsbConfig['default'];
		}, function (_srcEsbUtil) {
			EsbUtil = _srcEsbUtil['default'];
		}, function (_srcEsbPage) {
			EsbPage = _srcEsbPage['default'];
		}],
		execute: function () {
			'use strict';

			EsbMark = (function () {
				function EsbMark(opts) {
					_classCallCheck(this, EsbMark);

					var self = this,
					    uuid = opts.uuid;
					self.mark_element = opts.mark_element;

					self.config = EsbConfig.getConfig();
					self.uuid = uuid;
					self.options = null;
					self.set_mark_options();
				}

				_createClass(EsbMark, [{
					key: 'set_mark_options',
					value: function set_mark_options() {
						var self = this,
						    visible_on_load_marks,
						    options = {
							'mark': null,
							'id': null,
							'show-id-with-name': false,
							'mark-position': 'top-left',
							'outline': true,
							'group': null,
							'visible-on-load': true,
							'href': false,
							'show-label': true,
							'mark-id': false
						},
						    option = null,
						    value = null,
						    query_params,
						    query_string,
						    el = self.mark_element,
						    page_level_config_element = false,
						    config_json_global_options = self.config.get('marks');

						// Global config
						if (config_json_global_options !== undefined) {
							for (option in options) {
								value = config_json_global_options.get(option);
								if (value !== undefined && value.toString().length > 0) {
									options[option] = EsbUtil.booleanXorValue(value);
								}
							}
						}

						// Page level config
						while (el.parentNode) {
							el = el.parentNode;
							if (el.tagName !== undefined && el.getAttribute('data-esb-mark-config') !== null) {
								page_level_config_element = el;
								break;
							}
						}

						if (page_level_config_element) {
							for (option in options) {
								value = page_level_config_element.getAttribute('data-esb-' + option);
								if (value !== null && value.length > 0) {
									options[option] = EsbUtil.booleanXorValue(value);
								}
							}
						}

						// Instance level config
						for (option in options) {
							value = self.mark_element.getAttribute('data-esb-' + option);
							if (value !== null && value.length > 0) {
								options[option] = EsbUtil.booleanXorValue(value);
							}
						}

						// Query string params
						query_string = EsbUtil.getUrlQueryString();
						if (query_string.length > 0) {
							query_params = EsbUtil.convertQueryStringToJson(query_string);
							for (option in options) {
								value = query_params[option];
								if (value !== undefined && value.length > 0) {
									options[option] = EsbUtil.booleanXorValue(value);
								}
							}
						}

						if (typeof options['visible-on-load'] === 'string') {
							visible_on_load_marks = options['visible-on-load'].split(',');

							if (visible_on_load_marks.length > 0 && visible_on_load_marks.indexOf(options['mark-id']) !== -1) {
								options['visible-on-load'] = true;
							} else {
								options['visible-on-load'] = false;
							}
						}

						self.options = options;
					}
				}, {
					key: 'render',
					value: function render() {
						var self = this,
						    label_element = self.get_label_element(),
						    mark_wrapper,
						    i,
						    group_classes;

						if (EsbUtil.isVoidElement(self.mark_element)) {
							// The element being marked cannot have children appended (img, input, etc.)
							mark_wrapper = self.add_mark_wrapper();
						} else {
							mark_wrapper = self.mark_element;
						}

						EsbUtil.addClass(mark_wrapper, 'esb-mark');
						EsbUtil.addClass(mark_wrapper, 'esb-mark-position-' + self.options['mark-position']);
						EsbUtil.addClass(mark_wrapper, self.get_css_position_class(mark_wrapper));

						if (!self.options['visible-on-load']) {
							EsbUtil.addClass(mark_wrapper, 'esb-mark--is-hidden');
						}

						if (self.options.outline) {
							EsbUtil.addClass(mark_wrapper, 'esb-mark--has-outline');
						}

						if (self.options['show-label']) {
							EsbUtil.addClass(mark_wrapper, 'esb-mark--has-label');
						}

						if (self.options.group !== null) {
							group_classes = self.options.group.split(' ');
							for (i = 0; i < group_classes.length; i++) {
								group_classes[i] = 'esb-mark-group-' + group_classes[i];
							}
							self.options.group = group_classes.join(' ');
							EsbUtil.addClass(mark_wrapper, self.options.group);
						}

						mark_wrapper.appendChild(label_element);
					}
				}, {
					key: 'add_mark_wrapper',
					value: function add_mark_wrapper() {
						var self = this,
						    wrapper = document.createElement('span'),
						    original_element_styles,
						    i,
						    original_value,
						    property_name,
						    styles_to_copy = ['float', 'display'];

						original_element_styles = window.getComputedStyle(self.mark_element, null);

						for (i = 0; i < styles_to_copy.length; i++) {
							property_name = styles_to_copy[i];
							original_value = original_element_styles.getPropertyValue(property_name);

							if (property_name === 'display' && original_value === 'inline') {
								original_value = 'inline-block';
							}

							wrapper.style[property_name] = original_value;
						}

						// wrapper.style.cssText = window.getComputedStyle(self.mark_element, null).cssText;
						wrapper.appendChild(self.mark_element.cloneNode(true));

						self.mark_element.parentNode.replaceChild(wrapper, self.mark_element);

						return wrapper;
					}
				}, {
					key: 'get_css_position_class',
					value: function get_css_position_class(wrapper) {
						var css_position_class = '',
						    css_position = 'static';

						css_position = window.getComputedStyle(wrapper, null).getPropertyValue('position');

						css_position_class = 'esb-mark--has-' + css_position + '-position';
						return css_position_class;
					}
				}, {
					key: 'get_label_element',
					value: function get_label_element() {
						var self = this,
						    label_element = document.createElement('label'),
						    label_id_element = self.get_label_id_element(),
						    label_name_element = self.get_label_name_element();

						if (self.options.href) {
							label_element = document.createElement('a');
							label_element.href = self.options.href;
							EsbUtil.addClass(label_element, 'esb-mark-link');
						}

						EsbUtil.addClass(label_element, 'esb-mark-label');

						if (self.options.mark === null || self.options.mark !== null && self.options['show-id-with-name'] || self.options.id !== null) {
							label_element.appendChild(label_id_element);
						}

						if (label_name_element !== null) {
							label_element.appendChild(label_name_element);
							EsbUtil.addClass(label_element, 'esb-mark-label--has-name');
						}

						return label_element;
					}
				}, {
					key: 'get_label_name_element',
					value: function get_label_name_element() {
						var self = this,
						    label_name = document.createElement('span'),
						    label_content = self.get_label_name();

						if (label_content === null) {
							label_name = null;
						} else {
							label_name.textContent = label_content;
							EsbUtil.addClass(label_name, 'esb-mark-label-name');
						}

						return label_name;
					}
				}, {
					key: 'get_label_name',
					value: function get_label_name() {
						var self = this,
						    mark_label = self.options.mark;

						return mark_label;
					}
				}, {
					key: 'get_label_id_element',
					value: function get_label_id_element() {
						var self = this,
						    label_id = document.createElement('span'),
						    label_content = self.get_label_id();

						label_id.textContent = label_content;
						EsbUtil.addClass(label_id, 'esb-mark-label-id');

						return label_id;
					}
				}, {
					key: 'get_label_id',
					value: function get_label_id() {
						var self = this,
						    id = self.options.id;

						if (id === null) {
							id = EsbPage.getEsbMarkAutoId();
						}

						return id;
					}
				}]);

				return EsbMark;
			})();

			_export('EsbMark', EsbMark);
		}
	};
});
System.register('src/esb-config', ['npm:babel-runtime@5.2.9/helpers/create-class', 'npm:babel-runtime@5.2.9/helpers/class-call-check', 'npm:babel-runtime@5.2.9/core-js/map'], function (_export) {
  var _createClass, _classCallCheck, _Map, EsbConfig;

  return {
    setters: [function (_npmBabelRuntime529HelpersCreateClass) {
      _createClass = _npmBabelRuntime529HelpersCreateClass['default'];
    }, function (_npmBabelRuntime529HelpersClassCallCheck) {
      _classCallCheck = _npmBabelRuntime529HelpersClassCallCheck['default'];
    }, function (_npmBabelRuntime529CoreJsMap) {
      _Map = _npmBabelRuntime529CoreJsMap['default'];
    }],
    execute: function () {
      'use strict';

      EsbConfig = (function () {
        function EsbConfig() {
          _classCallCheck(this, EsbConfig);

          this.url = 'config.json';
          this.setDefaults();
        }

        _createClass(EsbConfig, [{
          key: 'getConfig',
          value: function getConfig() {
            // We're not picky about who can have our data
            return this.config;
          }
        }, {
          key: 'load',
          value: function load(url) {
            var self = this,
                uri,
                req,
                data;

            self.setDefaults(); //reset config when a new url is loaded

            // Don't try to load a config file, just start with an empty object
            return {};
          }
        }, {
          key: 'merge',
          value: function merge(data) {
            var self = this;

            for (var key in data) {
              if (typeof data[key] === 'object' && key !== 'template_data') {
                var key_map = new _Map();
                for (var data_key in data[key]) {
                  key_map.set(data_key, data[key][data_key]);
                }
                self.config.set(key, key_map);
              } else {
                self.config.set(key, data[key]);
              }
            }
          }
        }, {
          key: 'setDefaults',
          value: function setDefaults() {
            var self = this;

            var defaults = new _Map();
            var includes = new _Map();

            includes.set('source', 'includes/');

            // Defaults
            defaults.set('backward_compatible', false);
            defaults.set('path', '');
            defaults.set('includes', includes);

            self.config = defaults;
          }
        }, {
          key: 'setLoggingLevel',
          value: function setLoggingLevel() {
            var self = this,
                logging_level,
                config_logging = self.config.get('logging');

            if (config_logging !== undefined) {
              if (config_logging === true) {
                logging_level = 'warn';
              } else if (config_logging === false) {
                logging_level = 'none';
              } else {
                logging_level = config_logging;
              }
            } else {
              logging_level = 'warn';
            }

            self.config.set('logging_level', logging_level);
          }
        }]);

        return EsbConfig;
      })();

      _export('default', new EsbConfig());
    }
  };
});
System.register('src/esb-include', ['npm:babel-runtime@5.2.9/helpers/create-class', 'npm:babel-runtime@5.2.9/helpers/class-call-check', 'npm:babel-runtime@5.2.9/core-js/object/assign', 'npm:babel-runtime@5.2.9/core-js/promise', 'npm:handlebars@2.0.0', 'src/esb-config', 'src/esb-util', 'npm:babel-core@5.2.9/polyfill'], function (_export) {
	var _createClass, _classCallCheck, _Object$assign, _Promise, handlebars, EsbConfig, EsbUtil, EsbInclude;

	return {
		setters: [function (_npmBabelRuntime529HelpersCreateClass) {
			_createClass = _npmBabelRuntime529HelpersCreateClass['default'];
		}, function (_npmBabelRuntime529HelpersClassCallCheck) {
			_classCallCheck = _npmBabelRuntime529HelpersClassCallCheck['default'];
		}, function (_npmBabelRuntime529CoreJsObjectAssign) {
			_Object$assign = _npmBabelRuntime529CoreJsObjectAssign['default'];
		}, function (_npmBabelRuntime529CoreJsPromise) {
			_Promise = _npmBabelRuntime529CoreJsPromise['default'];
		}, function (_npmHandlebars200) {
			handlebars = _npmHandlebars200['default'];
		}, function (_srcEsbConfig) {
			EsbConfig = _srcEsbConfig['default'];
		}, function (_srcEsbUtil) {
			EsbUtil = _srcEsbUtil['default'];
		}, function (_npmBabelCore529Polyfill) {}],
		execute: function () {
			'use strict';

			//Without explicitly importing this module, CodeShip tests fail on 'Object.assign()'

			EsbInclude = (function () {
				// SETUP

				function EsbInclude(opts) {
					_classCallCheck(this, EsbInclude);

					var self = this;
					self.config = EsbConfig.getConfig();
					self.logger = EsbUtil.logger;

					self.include_snippet = opts.include_snippet;
					self.uuid = opts.uuid;
					self.parent_include = opts.parent_include === undefined ? false : opts.parent_include;
					self.child_include_snippets = false;
					self.compiled_html = false;
					self.rendered = false;

					self.overridden_options = [];
					self.options = self.get_include_options();
					self.base_file_path = undefined;
					self.include_name = undefined;
					self.include_file_path = self.get_include_file_path();
					self.stylesheet_file_path = self.get_stylesheet_file_path();
					self.script_file_path = self.get_script_file_path();
					// These arrays are used with "parent" includes that may have "child" includes with their own styles and scripts,
					// The recursive part of rendering adds child styles and scripts to these arrays along with these "parent" style and script paths,
					// Then when the parent is rendered, all the child assets are rendered as well
					self.stylesheet_file_paths = [self.stylesheet_file_path];
					self.script_file_paths = [self.script_file_path];
					self.content_object = self.get_content_object();
				}

				_createClass(EsbInclude, [{
					key: 'get_default_options',
					value: function get_default_options() {
						var options = {
							variation: 'default',
							source: 'includes/',
							replace_snippet: true,
							include: false,
							component: false,
							content: false,
							'content-overrides': false,
							inject_asset_tags: true
						};

						return options;
					}
				}, {
					key: 'get_global_config_option',
					value: function get_global_config_option(option_name) {
						var self = this,
						    option_value,
						    config_json_global_options = self.config.get('includes');

						// Backward compatibility with config.json 'components'
						if (config_json_global_options === undefined && self.config.get('components') !== undefined) {
							config_json_global_options = self.config.get('components');
						}

						if (config_json_global_options !== undefined) {
							option_value = config_json_global_options.get(option_name);
							if (option_value !== undefined && option_value.toString().length > 0) {
								option_value = EsbUtil.booleanXorValue(option_value);
							}
						}

						return option_value;
					}
				}, {
					key: 'get_page_level_config_element',
					value: function get_page_level_config_element() {
						var self = this,
						    el = self.include_snippet,
						    page_level_config_element = false;

						while (el.parentNode) {
							el = el.parentNode;
							if (el.tagName !== undefined && el.getAttribute('data-esb-include-config') !== null) {
								page_level_config_element = el;
								break;
							}
						}

						return page_level_config_element;
					}
				}, {
					key: 'get_page_level_config_option',
					value: function get_page_level_config_option(option_name) {
						var self = this,
						    option_value,
						    page_level_config_element = self.get_page_level_config_element();

						if (page_level_config_element) {
							option_value = page_level_config_element.getAttribute('data-esb-' + option_name);
							if (option_value !== null && option_value.length > 0) {
								option_value = EsbUtil.booleanXorValue(option_value);
							} else {
								option_value = undefined;
							}
						}

						return option_value;
					}
				}, {
					key: 'get_element_level_config_option',
					value: function get_element_level_config_option(option_name) {
						var self = this,
						    option_value;

						option_value = self.include_snippet.getAttribute('data-esb-' + option_name);
						if (option_value !== null && option_value.length > 0) {
							option_value = EsbUtil.booleanXorValue(option_value);
						} else {
							option_value = undefined;
						}

						return option_value;
					}
				}, {
					key: 'get_include_options',
					value: function get_include_options() {
						var self = this,
						    options = self.get_default_options(),
						    option = null,
						    value = null;

						// Check each tier of options to see if any overrides exist
						for (option in options) {
							// Instance Level
							value = self.get_element_level_config_option(option);
							if (value === undefined) {
								// Page Level
								value = self.get_page_level_config_option(option);

								// Global Level
								if (value === undefined) {
									value = self.get_global_config_option(option);
								}
							}

							if (value !== undefined) {
								options[option] = value;
								self.overridden_options.push(option);
							}
						}

						// Support legacy data-component syntax
						if (!options.include && !options.component) {
							if (self.include_snippet.getAttribute('data-component') !== undefined) {
								options.component = self.include_snippet.getAttribute('data-component');
							} else {
								self.logger('error', 'Include was instantiated but none of the following attributes were found: data-esb-include, data-esb-component, or data-component');
							}
						}

						return options;
					}
				}, {
					key: 'get_base_file_path',
					value: function get_base_file_path() {
						var self = this,
						    base_file_path;

						if (self.base_file_path === undefined) {
							base_file_path = self.options.source;

							if (!base_file_path.match(/\/$/)) {
								base_file_path += '/';
							}
							self.base_file_path = base_file_path;
						}

						return self.base_file_path;
					}
				}, {
					key: 'get_include_name',
					value: function get_include_name() {
						var self = this,
						    include_name;

						if (self.include_name === undefined) {
							include_name = self.options.include;

							if (!include_name) {
								include_name = self.options.component;
							}

							self.include_name = include_name;
						}

						return self.include_name;
					}
				}, {
					key: 'get_include_file_path',
					value: function get_include_file_path() {
						var self = this,
						    base_file_path = self.get_base_file_path(),
						    include_name = self.get_include_name(),
						    file_path;

						file_path = base_file_path + include_name;

						if (!file_path.match(/.html$/)) {
							file_path += '.html';
						}

						return file_path;
					}
				}, {
					key: 'get_stylesheet_file_path',
					value: function get_stylesheet_file_path() {
						var self = this,
						    base_file_path = self.get_base_file_path(),
						    include_name = self.get_include_name(),
						    stylesheet_path;

						stylesheet_path = base_file_path + 'css/' + include_name;

						if (!stylesheet_path.match(/.css$/)) {
							stylesheet_path += '.css';
						}

						return stylesheet_path;
					}
				}, {
					key: 'get_script_file_path',
					value: function get_script_file_path() {
						var self = this,
						    base_file_path = self.get_base_file_path(),
						    include_name = self.get_include_name(),
						    script_path;

						script_path = base_file_path + 'js/' + include_name;

						if (!script_path.match(/.js$/)) {
							script_path += '.js';
						}

						return script_path;
					}
				}, {
					key: 'get_content_object',
					value: function get_content_object() {
						var self = this,
						    content_object = {},
						    final_content_object = {},
						    data_keys,
						    content_data,
						    content_overrides = false,
						    i;

						if (self.options.content) {
							if (EsbUtil.is_json(self.options.content)) {
								content_object = JSON.parse(self.options.content);
							} else {
								data_keys = self.options.content.split('.');
								content_data = self.config.get('template_data');

								if (content_data !== undefined) {
									content_object = content_data;
									for (i = 0; i < data_keys.length; i++) {
										content_object = content_object[data_keys[i]];
									}
								}
							}

							content_object = JSON.parse(JSON.stringify(content_object)); //Convert to JSON and then back to an object to hack our way to a "deep" object clone
						}

						if (self.options['content-overrides']) {
							if (EsbUtil.is_json(self.options['content-overrides'])) {
								content_overrides = JSON.parse(self.options['content-overrides']);
							} else {
								data_keys = self.options['content-overrides'].split('.');
								content_data = self.config.get('template_data');

								if (content_data !== undefined) {
									content_overrides = content_data;
									for (i = 0; i < data_keys.length; i++) {
										content_overrides = content_overrides[data_keys[i]];
									}
								}
							}

							content_overrides = JSON.parse(JSON.stringify(content_overrides)); //Convert to JSON and then back to an object to hack our way to a "deep" object clone
						}

						if (content_overrides) {
							final_content_object = _Object$assign(content_object, content_overrides);
						} else {
							final_content_object = content_object;
						}

						return final_content_object;
					}
				}, {
					key: 'render_asset_tags',

					// RENDERING
					value: function render_asset_tags() {
						var self = this,
						    link,
						    script,
						    comment,
						    head = document.getElementsByTagName('head'),
						    i;

						return new _Promise(function (resolve, reject) {
							// If inject_asset_tags is true and this either is a parent include, or the parent include also has inject_asset_tags set to true
							if (self.options.inject_asset_tags && (!self.parent_include || self.parent_include.options.inject_asset_tags)) {
								if (head.length !== 1) {
									self.logger('error', 'Could not find <head> element to inject script and style for ' + self.include_name + ', ' + self.options.variation);
									reject('Could not find <head> element to inject script and style for ' + self.include_name + ', ' + self.options.variation);
								} else {
									for (i = 0; i < self.stylesheet_file_paths.length; i++) {
										link = document.createElement('link');
										link.href = self.stylesheet_file_paths[i];
										link.rel = 'stylesheet';
										if (!EsbUtil.dom_contains_element('link[href="' + self.stylesheet_file_paths[i] + '"]')) {
											head[0].appendChild(link);
										}
									}

									for (i = 0; i < self.script_file_paths.length; i++) {
										script = document.createElement('script');
										script.src = self.script_file_paths[i];
										// Ensure the the script doesn't already exist in the DOM, either as a <script> tag or wrapped in a <!--comment-->
										if (!EsbUtil.dom_contains_element('script[src="' + self.script_file_paths[i] + '"]') && !EsbUtil.head_comment_matches(self.script_file_paths[i])) {
											if (self.config.get('wrap_injected_js_with_comments') === true) {
												script.setAttribute('data-blocks-injected-js', 'true');
												comment = document.createComment(script.outerHTML);
												head[0].appendChild(comment);
											} else {
												head[0].appendChild(script);
											}
										}
									}
									resolve(true);
								}
							} else {
								self.logger('info', 'inject_asset_tags set to false for ' + self.include_name + ', ' + self.options.variation);
								resolve(true);
							}
						});
					}
				}, {
					key: 'retrieve_html',
					value: function retrieve_html() {
						var self = this,
						    uri,
						    req;

						return new _Promise(function (resolve, reject) {
							uri = self.include_file_path;
							req = new XMLHttpRequest();

							req.open('GET', uri);

							req.onload = function () {
								if (req.status === 200 || req.readyState === 4) {
									resolve(req.response);
								} else {
									self.logger('error', 'FAILED TO FETCH INCLUDE FILE: ' + uri + ' returned ' + req.statusText);
									resolve(Error(req.statusText));
								}
							};

							req.onerror = function () {
								reject(Error('Network Error'));
							};

							req.send();
						});
					}
				}, {
					key: 'parse_variation',
					value: function parse_variation(full_include_html) {
						// Given the raw HTML out of an include file, find just the variation we're looking for
						var self = this,
						    temp_dom = document.createElement('html'),
						    variation_html;

						temp_dom.innerHTML = full_include_html;
						variation_html = temp_dom.querySelectorAll('section[data-esb-variation="' + self.options.variation + '"], section[data-variation="' + self.options.variation + '"]');
						if (variation_html.length > 1) {
							self.logger('error', 'Multiple matches found in ' + self.include_file_path + ' for ' + 'data-esb-variation="' + self.options.variation + '", desired variation is ambiguous');
						} else if (variation_html.length === 0) {
							self.logger('error', 'No variation found in ' + self.include_file_path + ' matching ' + 'data-esb-variation="' + self.options.variation + '"');
						} else {
							variation_html = variation_html[0].innerHTML;
						}
						return variation_html;
					}
				}, {
					key: 'compile_html_with_content',
					value: function compile_html_with_content(variation_html) {
						var self = this;
						handlebars.registerHelper('json', function (obj) {
							return JSON.stringify(obj);
						});
						return handlebars.compile(variation_html)(self.content_object);
					}
				}, {
					key: 'find_include_snippets',
					value: function find_include_snippets() {
						var self = this,
						    temp_dom = document.createElement('html'),
						    include_snippets,
						    uuid,
						    i;

						temp_dom.innerHTML = self.compiled_html;
						include_snippets = temp_dom.querySelectorAll('*[data-esb-component], *[data-component], *[data-esb-include]');
						if (include_snippets === undefined) {
							include_snippets = [];
						} else {
							for (i = 0; i < include_snippets.length; i++) {
								uuid = EsbUtil.generateUUID();
								include_snippets[i].setAttribute('data-esb-uuid', uuid);
							}
							// write compiled_html back after adding uuids to all child includes
							self.compiled_html = temp_dom.getElementsByTagName('body')[0].innerHTML;
						}
						return include_snippets;
					}
				}, {
					key: 'render_child_includes',
					value: function render_child_includes() {
						var self = this,
						    i,
						    child_include_promises = [],
						    include_snippet,
						    include,
						    uuid;

						for (i = 0; i < self.child_include_snippets.length; i++) {
							include_snippet = self.child_include_snippets[i];
							uuid = include_snippet.getAttribute('data-esb-uuid');
							include = new EsbInclude({ include_snippet: include_snippet, uuid: uuid, parent_include: self });
							child_include_promises.push(include.render_include());
						}

						return _Promise.all(child_include_promises);
					}
				}, {
					key: 'render_include',
					value: function render_include() {
						var self = this,
						    variation_html,
						    rendered_include,
						    child_include,
						    temp_dom,
						    i;

						return new _Promise(function (resolve, reject) {
							self.retrieve_html().then(function (html) {
								variation_html = self.parse_variation(html);
								self.compiled_html = self.compile_html_with_content(variation_html);
								self.child_include_snippets = self.find_include_snippets();
								if (self.child_include_snippets.length === 0) {
									rendered_include = self.compiled_html;
									resolve(self);
								} else {
									// Recursion here somehow
									self.render_child_includes().then(function (rendered_include_array) {
										temp_dom = document.createElement('html');
										temp_dom.innerHTML = self.compiled_html;
										for (i = 0; i < rendered_include_array.length; i++) {
											child_include = rendered_include_array[i];
											// Find the location of each child snippet within the parent and replace it with the compiled html
											temp_dom.querySelector('[data-esb-uuid="' + child_include.uuid + '"]').outerHTML = child_include.compiled_html;
											self.stylesheet_file_paths.push(child_include.stylesheet_file_path);
											self.script_file_paths.push(child_include.script_file_path);
										}
										self.compiled_html = temp_dom.getElementsByTagName('body')[0].innerHTML;
										resolve(self);
									}, function (error) {
										reject(error);
									});
								}
							}, function (error) {
								reject(error);
							});
						});
					}
				}, {
					key: 'render',
					value: function render() {
						var self = this;
						return new _Promise(function (resolve, reject) {
							self.render_include().then(function () {
								// All children have been rendered at this point, actually render the parent include to the dom
								// Outer HTML is a "replace", TODO: Add innerHTML for insert inside behavior
								document.querySelector('[data-esb-uuid="' + self.uuid + '"]').outerHTML = self.compiled_html;
								self.rendered = true;
								return self.render_asset_tags();
							}, function (err) {
								self.logger('error', err);
								reject(err);
							}).then(function () {
								// render_asset_tags succeeded, resolve the render() promise
								resolve(self);
							}, function (err) {
								// error occurred while loading assets
								self.logger('error', err);
							});
						});
					}
				}]);

				return EsbInclude;
			})();

			_export('EsbInclude', EsbInclude);
		}
	};
});
System.register('src/esb-page', ['npm:babel-runtime@5.2.9/helpers/create-class', 'npm:babel-runtime@5.2.9/helpers/class-call-check', 'npm:babel-runtime@5.2.9/core-js/promise', 'src/esb-util', 'src/esb-include', 'src/esb-frame', 'src/esb-mark'], function (_export) {
  var _createClass, _classCallCheck, _Promise, EsbUtil, EsbInclude, EsbFrame, EsbMark, EsbPage;

  return {
    setters: [function (_npmBabelRuntime529HelpersCreateClass) {
      _createClass = _npmBabelRuntime529HelpersCreateClass['default'];
    }, function (_npmBabelRuntime529HelpersClassCallCheck) {
      _classCallCheck = _npmBabelRuntime529HelpersClassCallCheck['default'];
    }, function (_npmBabelRuntime529CoreJsPromise) {
      _Promise = _npmBabelRuntime529CoreJsPromise['default'];
    }, function (_srcEsbUtil) {
      EsbUtil = _srcEsbUtil['default'];
    }, function (_srcEsbInclude) {
      EsbInclude = _srcEsbInclude.EsbInclude;
    }, function (_srcEsbFrame) {
      EsbFrame = _srcEsbFrame.EsbFrame;
    }, function (_srcEsbMark) {
      EsbMark = _srcEsbMark.EsbMark;
    }],
    execute: function () {
      'use strict';

      EsbPage = (function () {
        function EsbPage() {
          _classCallCheck(this, EsbPage);

          var self = this;

          self.logger = EsbUtil.logger;
          self.blocks_done = false;
          self.blocks_done_timeout_ms = 15000;

          self.parsed_esb_includes = [];
          self.parsed_esb_frames = [];
          self.parsed_esb_marks = [];
          self.esb_mark_auto_id = 1;

          self.setEventListeners();
        }

        _createClass(EsbPage, [{
          key: 'display',

          /*
           * @method: display
           *
           * Wrapper for parse and load
           */
          value: function display() {
            var self = this,
                parsed_esb_includes = self.get_parsed_esb_includes(),
                rendered_includes = [],
                all_includes_rendered;

            if (parsed_esb_includes.length > 0) {
              for (var idx in parsed_esb_includes) {
                var include = self.parsed_esb_includes[idx];
                rendered_includes.push(include.render());
              }

              all_includes_rendered = _Promise.all(rendered_includes);
              all_includes_rendered.then(function () {
                self.setBlocksDone();
              }, function (err) {
                self.logger('error', err);
              });
            } else {
              self.setBlocksDone();
            }

            for (var idx in self.parsed_esb_frames) {
              var frame = self.parsed_esb_frames[idx];

              frame.inject_placeholder_if_placeholder_is_created();
            }
          }
        }, {
          key: 'displayEsbMarks',
          value: function displayEsbMarks() {
            var self = this,
                parsed_esb_marks = self.getParsedEsbMarks();

            if (parsed_esb_marks.length > 0) {
              for (var idx in parsed_esb_marks) {
                var esb_mark = self.parsed_esb_marks[idx];

                esb_mark.render();
              }
            }
          }
        }, {
          key: 'hideAllEsbMarks',
          value: function hideAllEsbMarks() {
            var rendered_marks = document.querySelectorAll('.esb-mark'),
                i;

            for (i = 0; i < rendered_marks.length; i++) {
              EsbUtil.addClass(rendered_marks[i], 'esb-mark--is-hidden');
            }
          }
        }, {
          key: 'showAllEsbMarks',
          value: function showAllEsbMarks() {
            var rendered_marks = document.querySelectorAll('.esb-mark'),
                i;

            for (i = 0; i < rendered_marks.length; i++) {
              EsbUtil.removeClass(rendered_marks[i], 'esb-mark--is-hidden');
            }
          }
        }, {
          key: 'toggleAllEsbMarks',
          value: function toggleAllEsbMarks() {
            var self = this,
                hidden_marks = document.querySelectorAll('.esb-mark.esb-mark--is-hidden');

            if (hidden_marks.length > 0) {
              self.showAllEsbMarks();
            } else {
              self.hideAllEsbMarks();
            }
          }
        }, {
          key: 'processKeyboardEvent',
          value: function processKeyboardEvent(e) {
            var self = this;

            if (e.keyCode === 77 && e.shiftKey === true && e.ctrlKey === true) {
              self.toggleAllEsbMarks();
            }
          }
        }, {
          key: 'setEventListeners',
          value: function setEventListeners() {
            var self = this;

            if (window.$ !== undefined) {
              // jQuery's event system is separate from the browser's, so set these up so $(document).trigger will work
              window.$(document).on('show-all-esb-marks', self.showAllEsbMarks.bind(self));
              window.$(document).on('hide-all-esb-marks', self.hideAllEsbMarks.bind(self));
              window.$(document).on('keydown', self.processKeyboardEvent.bind(self));
            } else {
              document.addEventListener('show-all-esb-marks', self.showAllEsbMarks.bind(self));
              document.addEventListener('hide-all-esb-marks', self.hideAllEsbMarks.bind(self));
              document.addEventListener('keydown', self.processKeyboardEvent.bind(self));
            }
          }
        }, {
          key: 'getParsedEsbMarks',
          value: function getParsedEsbMarks() {
            var self = this;
            return self.parsed_esb_marks;
          }
        }, {
          key: 'get_parsed_esb_includes',
          value: function get_parsed_esb_includes() {
            var self = this;
            return self.parsed_esb_includes;
          }
        }, {
          key: 'getEsbMarkAutoId',
          value: function getEsbMarkAutoId() {
            var self = this,
                id = self.esb_mark_auto_id;

            self.esb_mark_auto_id++;

            return id;
          }
        }, {
          key: 'parse',
          value: function parse() {
            var self = this;
            self.parse_esb_includes();
            self.parseEsbFrames();
          }
        }, {
          key: 'parse_esb_includes',
          value: function parse_esb_includes() {
            var self = this,
                includes = [],
                i;

            self.name = self.retrievePageTitle();

            includes = document.querySelectorAll('*[data-component], *[data-esb-component], *[data-esb-include]');
            for (i = 0; i < includes.length; i++) {
              var uuid = EsbUtil.generateUUID();
              includes[i].setAttribute('data-esb-uuid', uuid);
              var include = new EsbInclude({
                include_snippet: includes[i],
                uuid: uuid
              });

              self.parsed_esb_includes.push(include);
            }
          }
        }, {
          key: 'parseEsbFrames',
          value: function parseEsbFrames() {
            var self = this,
                frames = [],
                i = 0;

            self.name = self.retrievePageTitle();

            frames = document.querySelectorAll('*[data-esb-frame]:not([data-esb-frame-config]), *[data-frame-component]');

            for (i = 0; i < frames.length; i++) {
              var uuid = EsbUtil.generateUUID();

              frames[i].setAttribute('data-esb-uuid', uuid);

              var frame = new EsbFrame({
                viewer_element: frames[i],
                original_snippet: frames[i].outerHTML,
                uuid: uuid
              });

              self.parsed_esb_frames.push(frame);
            }
          }
        }, {
          key: 'parseEsbMarks',
          value: function parseEsbMarks() {
            var self = this,
                marks = [],
                i = 0;

            self.name = self.retrievePageTitle();

            marks = document.querySelectorAll('*[data-esb-mark]:not([data-esb-mark-config])');

            for (i = 0; i < marks.length; i++) {
              var uuid = EsbUtil.generateUUID();

              marks[i].setAttribute('data-esb-uuid', uuid);

              var mark = new EsbMark({
                uuid: uuid,
                mark_element: marks[i]
              });

              self.parsed_esb_marks.push(mark);
            }
          }
        }, {
          key: 'retrievePageTitle',
          value: function retrievePageTitle() {
            return document.title;
          }
        }, {
          key: 'renderIncludeSnippetFromQueryStringParams',
          value: function renderIncludeSnippetFromQueryStringParams() {
            var self = this,
                query_string = EsbUtil.getUrlQueryString(),
                query_params = EsbUtil.convertQueryStringToJson(query_string),
                include_snippet = self.generateIncludeSnippet(query_params),
                target;

            if (include_snippet && query_params['data-esb-target'] !== undefined) {
              target = document.querySelector(query_params['data-esb-target']);
              if (target !== null) {
                EsbUtil.addClass(target, 'include-frame-template-wrapper');
                target.appendChild(include_snippet);
              }
            }
          }
        }, {
          key: 'generateIncludeSnippet',
          value: function generateIncludeSnippet(query_params) {
            var i,
                include_snippet = false,
                params = ['include', 'variation', 'place', 'source', 'content'];

            if (query_params['data-esb-include'] !== undefined) {
              include_snippet = document.createElement('div');
              for (i = 0; i < params.length; i++) {
                if (query_params['data-esb-' + params[i]] !== undefined) {
                  include_snippet.setAttribute('data-esb-' + params[i], query_params['data-esb-' + params[i]]);
                }
              }
            }

            return include_snippet;
          }
        }, {
          key: 'setBlocksDone',
          value: function setBlocksDone() {
            var self = this;
            window.blocks_done = true; //Set globally accessible blocks_done variable so other scripts/processes that may be loaded after blocks can query to see if Blocks has finished doing its thing
            self.blocks_done = true;
          }
        }, {
          key: 'getBlocksDone',
          value: function getBlocksDone() {
            var self = this;
            return self.blocks_done;
          }
        }, {
          key: 'getBlocksDoneTimeout',
          value: function getBlocksDoneTimeout() {
            var self = this;
            return self.blocks_done_timeout_ms;
          }
        }, {
          key: 'blocksDone',
          value: function blocksDone() {
            var self = this,
                timeout_ms = self.getBlocksDoneTimeout(),
                polling_interval_ms = 500,
                polling_attempt_threshold = timeout_ms / polling_interval_ms,
                polling_attempts = 0,
                blocks_done_interval = false;

            return new _Promise(function (resolve, reject) {
              blocks_done_interval = setInterval(function () {
                if (polling_attempts < polling_attempt_threshold) {
                  if (self.getBlocksDone()) {
                    resolve(true);
                    clearInterval(blocks_done_interval);
                  } else {
                    polling_attempts++;
                  }
                } else {
                  self.logger('error', 'Blocks did not finish processing the page before the timeout threshold: ' + timeout_ms + 'ms');
                  reject('Blocks did not finish processing the page before the timeout threshold: ' + timeout_ms + 'ms');
                }
              }, polling_interval_ms);
            });
          }
        }]);

        return EsbPage;
      })();

      _export('default', new EsbPage());
    }
  };
});
System.register('src/esb', ['src/esb-config', 'src/esb-page', 'src/esb-util'], function (_export) {
  var EsbConfig, EsbPage, EsbUtil, blocks_execute;
  return {
    setters: [function (_srcEsbConfig) {
      EsbConfig = _srcEsbConfig['default'];
    }, function (_srcEsbPage) {
      EsbPage = _srcEsbPage['default'];
    }, function (_srcEsbUtil) {
      EsbUtil = _srcEsbUtil['default'];
    }],
    execute: function () {
      'use strict';

      EsbConfig.load().then(function () {
        EsbUtil.dom_ready(blocks_execute);
      }, function (err) {
        window.console.log('Couldn\'t load EsbConfig: ' + err);
      });

      blocks_execute = function blocks_execute() {
        EsbPage.renderIncludeSnippetFromQueryStringParams(); //Used by Frame to generate a include snippet from query string params
        EsbPage.parse(); //Finds all blocks includes, viewers, etc. and preps them for loading/display
        EsbPage.display();
        EsbPage.blocksDone().then(function () {
          EsbPage.parseEsbMarks();
          EsbPage.displayEsbMarks();
        }, function () {
          EsbUtil.logger('error', 'BlocksDone did not fire.');
        });
      };

      _export('default', {});
    }
  };
});
});
//# sourceMappingURL=esb.js.map