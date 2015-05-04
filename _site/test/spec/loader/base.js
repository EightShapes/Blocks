'use strict';

describe("Blocks2 loader by default", function() {
  beforeEach(function () {
    // var f = jasmine.getFixtures();
    // f.fixturesPath = 'base';
    // f.load('test/fixtures/base.html');
    jasmine.getFixtures().fixturesPath = 'fixtures/';
  });

  it("does not alter or remove elements a page", function() {
    // loadFixtures('base.html');
    expect($('#base header')).toBeInDOM();
  });
});


describe("Blocks loader asynchronously", function() {
  var value;

  beforeEach(function(done) {
    $(document).on('blocks-done', function () {
      done();
    });
  });

  it("loads a component", function(done) {
    expect($('#base header figure')).toBeInDOM();
    expect($('#base header.with-content')).toBeInDOM();
    expect($('#base header.with-content .name')).toHaveText('Nathan Curtis');
    done();
  });
});
