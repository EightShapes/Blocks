'use strict';
describe('Blocks loader cannot find a component', function() {
  it('should display an error message in the DOM', function() {
    expect($('.esb-component-loading-error')[0]).toBeInDOM();
  });
});