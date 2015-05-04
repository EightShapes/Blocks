'use strict';

describe("Blocks loader by default", function() {
  it("does not alter or remove elements on a page", function() {
    expect($('#base .initial-class')).toBeInDOM();
  });
});

describe("Blocks loader renders a template", function() {
  beforeEach(function(done) {
    setTimeout(function () {
      done();
    }, 300);
  });

  it("with content", function (done) {
    expect($('#base .l-header.with-content.json-from-config .name')).toHaveText('Nathan Curtis');
    done();
  });

  it("when based raw JSON in data-content", function (done) {
    expect($('#base .l-header.with-content.json-raw .name')).toHaveText('Ziggy Ignots');
    done();
  });
});

describe("Blocks loader merges classes", function() {
  beforeEach(function(done) {
    setTimeout(function () {
      done();
    }, 300);
  });

  it("with classes placed on the variation", function (done) {
    expect($('#base .l-header.with-content')).toBeInDOM();
    done();
  });
});

describe("Blocks loader merges attributes", function() {
  beforeEach(function(done) {
    setTimeout(function () {
      done();
    }, 300);
  });

  it("with attributes placed on the variation", function (done) {
    expect($('#base .l-header.base[data-object="header"]')).toBeInDOM();
    done();
  });
});

describe("Blocks loader renders nested components", function() {
  beforeEach(function(done) {
    setTimeout(function () {
      done();
    }, 300);
  });

  it("of the same variation", function (done) {
    expect($('#base .l-parent.v01 > .child-v01')).toHaveLength(2);
    done();
  });

  it("of different variations", function (done) {
    expect($('#base .l-parent.v02 > .child-v02')).toBeInDOM();
    done();
  });
});

describe("Blocks loader adds a component JS file", function() {
  beforeEach(function(done) {
    setTimeout(function () {
      done();
    }, 300);
  });

  it("only once if present", function (done) {
    expect($('#base .l-header.js-loaded')).toBeInDOM();
    done();
  });
});

describe('Blocks loader replaces components with their contents when data-place="replace"', function() {
  beforeEach(function(done) {
    setTimeout(function () {
      done();
    }, 300);
  });

  it('and the component markup is not present', function(done) {
    expect($('#base .i-should-not-appear')).not.toBeInDOM();
    done();
  });

  it('including nested child templates', function(done) {
    expect($('#base .i-also-should-not-appear')).not.toBeInDOM();
    expect($('#base .l-child .v03')).toBeInDOM();
    done();
  });

  it('including nested child variations to refer to a variation in their own file', function(done) {
    expect($('#base .child.v04.user1')).toBeInDOM();
    expect($('#base .child.v04.user2')).toBeInDOM();
    expect($('#base .child.v04.user1 .name')).not.toBeEmpty();
    expect($('#base .child.v04.user2 .name')).not.toBeEmpty();
    done();
  });
});

describe('Blocks loader finds components based on data-source', function() {
  beforeEach(function(done) {
    setTimeout(function () {
      done();
    }, 300);
  });

  it('but defaults to components/', function(done) {
    expect($('#base .l-header.base')).toBeInDOM();
    expect($('head link[rel="stylesheet"][href="components/css/header.css"]')).toBeInDOM();
    expect($('head script[src="components/js/header.js"]')).toBeInDOM();
    done();
  });

  it('given a full path and loads the component, css, and js', function(done) {
    expect($('#base .l-library')).toBeInDOM();
    expect($('head link[rel="stylesheet"][href="test-source/components/css/library.css"]')).toBeInDOM();
    expect($('head script[src="test-source/components/js/library.js"]')).toBeInDOM();
    done();
  });
});