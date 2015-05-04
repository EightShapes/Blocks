/*jslint browser: true, eqeq: true, nomen: true, plusplus: true, maxerr: 50, indent: 2, white: false */
/*global document, _, window */
/*!
 * EightShapes Blocks framework
 * https://github.com/EightShapes/Blocks
 *
 * ©Copyright 2014 Eight Shapes LLC
 *
 * Terms of Use: http://unify.eightshapes.com/about-the-system/terms-of-use/
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
(function ($, console, document) {
  "use strict";

  var BlocksViewer = function (element, opts) {
    this.$el = $(element);
    this.config = null;
    this.opts = opts;
    this.components = [];
    this.cache = {};

    this.FRAME_CONTAINER_PADDING = 14 * 2;
    this.RESPONSIVE_SIZES = [
      '320x444',
      '360x640',
      '600x800',
      '768x1024',
      '800x1280',
      '980x1280',
      '1280x600',
      '1900x900'
    ];
    this.LOGGING = true;

    this.loadConfig(opts);

    this._setupLogging();

    this.init();
  };

  var Frame = function (opts) {
    this.cache = {};
    this.page = opts.page;
    this.config = this.page.config;
    this.index = opts.index;
    this.init(opts.component);
  };

  Frame.prototype = {
    init: function ($component) {
      var self = this;

      self.$component = $component;
      self.$revised_component = ''; // place holder for cleaned and wrapped component
      self.template = self.$component.html();

      self._setFrameName();
      self._setFrameID();
      self._setFrameContainerID();
      self._setFrameProperties();
      self._setFigure();

      self.createFrame();
    },

    createFrame: function () {
      var self = this;

      self._createFrameComponents();
      self._createFrame();
      self._wrapFrame();
      self._replaceComponentReferenceWithFrame();
      self._makeFrameResizable();
      self._addBasicStyling();
      self._autoZoomOnResize();
    },

    // The responsive selector is the only Frame Component at the moment
    // These will all eventually be distinct templates in Backbone.js
    _createFrameComponents: function () {
      var self = this;

      if (self.frame_properties.resizable === true) {
        // Create a resizable select box for the component if resizing is enabled
        var $selector = $('<span data-object="blocks-doc-component-responsive_selector"></span>'),
          $select = $('<select></select>'),
          $option;

        _.each(self.page.RESPONSIVE_SIZES, function (rsp_size) {
          $option = $('<option></option>');
          $option
            .attr('value', rsp_size)
            .text(rsp_size);

          $select.append($option);
        });

        $selector
          .addClass('b-responsive_sizes')
          .append($select);

        self.$responsive_selector = $selector;
      }
    },

    _createFrame: function () {
      var self = this;

      self.$frame = $('<iframe></iframe>');
      self.$frame.attr('id', self.id);
      self.$frame.attr('src', self.config.viewer_template_uri);
      self.$frame.attr('frameborder', '0');
      self.$frame.attr('sandbox', 'allow-same-origin allow-forms allow-scripts');
      self.$frame.attr('seamless', true);
      self.$frame.attr('scrolling', self.frame_properties.scrollable);
      self.$frame.css("width", '100%');
      self.$frame.css("height", '100%');
    },

    _wrapFrame: function () {
      var self = this,
        $frameContainer = $('<div></div>'),
        $viewerContainer = $('<div></div>'),
        $figure = $('<p></p>');

      // Wrap the iframe in a div container set to the frame's height and width
      $frameContainer.addClass('b-frame_container');
      $frameContainer.attr('id', self.frame_container_ID);
      $frameContainer.append(self.$frame);

      // Add a figure, add the responsive selector to the figure,
      $figure.addClass('b-figure').text(self.figure);
      if (typeof self.$responsive_selector == 'object') {
        $figure.append(self.$responsive_selector); 
      }

      $viewerContainer.addClass('b-viewer_container');
      $viewerContainer.append($figure);
      $viewerContainer.append($frameContainer);
      self.$viewerContainer = $viewerContainer;
    },

    _replaceComponentReferenceWithFrame: function () {
      var self = this;

      self.$frame.bind('load', function () {
        // Once the viewer template has loaded, inject the component into the frame, otherwise the template html would stomp the component html
        self._injectComponentInFrame();
      });
      self.$component.replaceWith(self.$viewerContainer);
    },

    _injectComponentInFrame: function () {
      var self = this,
        iframeDoc,
        revised_component = self._cleanComponent(),
        script,
        iframeBlocksLoadedInterval;

      iframeDoc = window.document.getElementById(self.id).contentWindow.document;
      self.$iframe = $('html', iframeDoc);
      self.$iframe.find('body').append(revised_component);

      script = iframeDoc.createElement("script");
      script.src = self.config.blocks_loader;
      iframeDoc.head.appendChild(script);

      // Blocks has to be instantiated in the iframe
      // The code in the plugin tries to fire Blocks on $(window) and not window
      iframeBlocksLoadedInterval = setInterval(function () {
        if (typeof window.document.getElementById(self.id).contentWindow.$ == 'function' && typeof window.document.getElementById(self.id).contentWindow.$('body').BlocksLoader == 'function') {
          // Jquery has been loaded, now see if the component is in the iFrame's dom yet?
          clearInterval(iframeBlocksLoadedInterval);

          // Listens for when Blocks is done inside the iFrame so the height and width of the frame can be adjusted
          window.document.getElementById(self.id).contentWindow.$('body').on("blocks-done", function(){
            self._setHeightAndWidth();
          });
          window.document.getElementById(self.id).contentWindow.$('body').BlocksLoader();
        }
      }, 500);
    },

    _makeFrameResizable: function () {
      var self = this;

      if (self.frame_properties.resizable === true) {
        // Make the frame container resizable
        // The functions on the start and stop events cause a temporary div overlay to appear over the component
        // This div prevents the resizable method from losing focus if the mouse slips on top of the iframe
        $('#' + self.frame_container_ID).resizable({
          start: function(){
            var ifr = $(this).find("iframe"),
                d = $('<div></div>');

            self.$viewerContainer.find(".b-frame_container").append(d[0]);
            d[0].id = 'temp_div';
            d.css({position:'absolute'});
            d.css({top: ifr.position().top, left:0});
            d.height(ifr.height());
            d.width('100%');
          },
          stop: function(){
            $('#temp_div').remove();
          }
        }).parent().addClass('is-resizable');
      }
    },

    _cleanComponent: function () {
      var self = this,
        component = self.$component.clone(),
        component_name = component.attr('data-frame-component');

      component.attr('data-component', component_name);
      component.removeAttr('data-frame-component');
      component.removeAttr('data-frame-width');
      component.removeAttr('data-frame-height');

      return component;
    },

    _setFrameID: function () {
      var self = this;

      self.id = self.$component.attr('id') ? self.$component.attr('id') : self.name + '-' + self.index;
    },

    _setFrameContainerID: function () {
      var self = this;

      self.frame_container_ID = 'container-' + self.id;
    },

    _setFrameName: function () {
      var self = this;

      self.name = self.$component.attr('data-frame-component') + '-frame';
    },

    _setFrameProperties: function () {
      var self = this,
        properties = {
          "width": "auto",
          "height": "auto",
          "resizable": false,
          "scale": "",
          "scrollable": false,
          "zoomable": false,
          "zoomable-annotation": false,
          "zoom-levels": [1, 0.66, 0.5, 0.33]
        },
        prop_name;

      self.frame_properties = {};

      _.each(properties, function (default_value, prop) {
        prop_name = 'data-frame-' + prop;

        if (self.$component.attr(prop_name) !== undefined && self.$component.attr(prop_name) !== '') {
          // Ensure that "true" and "false" strings are converted to boolean equivalents
          var value = self.$component.attr(prop_name);
          if (value === "true") {
            value = true;
          }
          else if (value === "false") {
            value = false;
          }
          self.frame_properties[prop] = value;

        } else if (self.config.frame !== undefined) {
          if (self.config.frame[prop] !== undefined) {
            self.frame_properties[prop] = self.config.frame[prop];
          }
        } else {
          self.frame_properties[prop] = default_value;
        }
      });

      // Convert scrollable setting from boolean to html attr value of "yes" or "no"
      if (self.frame_properties.scrollable === true) {
        self.frame_properties.scrollable = "yes";
      }
      else {
        self.frame_properties.scrollable = "no";
      }

      // If zoomable is set to "auto" the frame cannot be manually resized

      if (self.frame_properties.zoomable == 'auto') {
        self.frame_properties.resizable = false;
      }
    },

    _setFigure: function () {
      var self = this;

      self.figure = self.$component.attr('data-figure');
    },

    _addBasicStyling: function () {
      var self = this;
      if (typeof self.config.use_blocks_viewer_default_styles == 'undefined' || self.config.use_blocks_viewer_default_styles === true) {
        self.$viewerContainer.css({"margin-bottom":"20px"});
        self.$viewerContainer.find(".b-figure").css({"padding":"0", "margin":"0"});
        self.$viewerContainer.find(".b-frame_container").css({"overflow":"hidden", "display":"inline-block", "margin":"0", "position":"relative", "box-shadow":"0 1px 3px rgba(0,0,0,0.4)", "background":"white", "box-sizing":"border-box"});
        self.$viewerContainer.find(".b-frame_container.ui-resizable").css({"padding":"10px"});
        self.$viewerContainer.find(".ui-resizable-handle.ui-resizable-e").css({"position":"absolute", "top":"0", "width":"10px", "height":"100%", "display":"block", "right":"0", "cursor":"e-resize", "background-position":"center", "background-repeat":"no-repeat", "background-image":"url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAQCAYAAADedLXNAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAA2hpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuMy1jMDExIDY2LjE0NTY2MSwgMjAxMi8wMi8wNi0xNDo1NjoyNyAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iIHhtbG5zOnN0UmVmPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VSZWYjIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1wLmRpZDpGNzdGMTE3NDA3MjA2ODExODhDNkNGREE2RDZEQjExNSIgeG1wTU06RG9jdW1lbnRJRD0ieG1wLmRpZDpFMkRBNUI3RTJEMEUxMUUzQTk1M0M2Qjc0NUZFM0Q5NCIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDpFMkRBNUI3RDJEMEUxMUUzQTk1M0M2Qjc0NUZFM0Q5NCIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgQ1M2IChNYWNpbnRvc2gpIj4gPHhtcE1NOkRlcml2ZWRGcm9tIHN0UmVmOmluc3RhbmNlSUQ9InhtcC5paWQ6QkE2RDEyMjI0QzIwNjgxMTgyMkFCQzQ3NkE4MUE1NDQiIHN0UmVmOmRvY3VtZW50SUQ9InhtcC5kaWQ6Rjc3RjExNzQwNzIwNjgxMTg4QzZDRkRBNkQ2REIxMTUiLz4gPC9yZGY6RGVzY3JpcHRpb24+IDwvcmRmOlJERj4gPC94OnhtcG1ldGE+IDw/eHBhY2tldCBlbmQ9InIiPz7ef1xfAAAAH0lEQVR42mJctWrVfwYGBkYghtNMDFjAqCAxggABBgB6ygUdVDDbYwAAAABJRU5ErkJggg==)"});
        self.$viewerContainer.find(".ui-resizable-handle.ui-resizable-s").css({"position":"absolute", "bottom":"0", "height":"10px", "width":"100%", "display":"block", "left":"0", "cursor":"s-resize", "background-repeat":"no-repeat", "background-position":"center", "background-image":"url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAFCAYAAABM6GxJAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAA2hpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuMy1jMDExIDY2LjE0NTY2MSwgMjAxMi8wMi8wNi0xNDo1NjoyNyAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iIHhtbG5zOnN0UmVmPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VSZWYjIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1wLmRpZDpGNzdGMTE3NDA3MjA2ODExODhDNkNGREE2RDZEQjExNSIgeG1wTU06RG9jdW1lbnRJRD0ieG1wLmRpZDpFMkRBNUI3QTJEMEUxMUUzQTk1M0M2Qjc0NUZFM0Q5NCIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDpFMkRBNUI3OTJEMEUxMUUzQTk1M0M2Qjc0NUZFM0Q5NCIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgQ1M2IChNYWNpbnRvc2gpIj4gPHhtcE1NOkRlcml2ZWRGcm9tIHN0UmVmOmluc3RhbmNlSUQ9InhtcC5paWQ6QkE2RDEyMjI0QzIwNjgxMTgyMkFCQzQ3NkE4MUE1NDQiIHN0UmVmOmRvY3VtZW50SUQ9InhtcC5kaWQ6Rjc3RjExNzQwNzIwNjgxMTg4QzZDRkRBNkQ2REIxMTUiLz4gPC9yZGY6RGVzY3JpcHRpb24+IDwvcmRmOlJERj4gPC94OnhtcG1ldGE+IDw/eHBhY2tldCBlbmQ9InIiPz4YWppYAAAAHElEQVR42mJctWrVfwYKAAsQM1JqwBB3AUCAAQDMqQUPSylTPQAAAABJRU5ErkJggg==)"});
        self.$viewerContainer.find(".ui-resizable-handle.ui-resizable-se").css({"position":"absolute", "bottom":"0", "height":"10px", "width":"10px", "display":"block", "right":"0", "cursor":"se-resize", "background-repeat":"no-repeat", "background-position":"center", "background-image":"url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAsAAAALCAYAAACprHcmAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAA2hpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuMy1jMDExIDY2LjE0NTY2MSwgMjAxMi8wMi8wNi0xNDo1NjoyNyAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iIHhtbG5zOnN0UmVmPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VSZWYjIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1wLmRpZDpGNzdGMTE3NDA3MjA2ODExODhDNkNGREE2RDZEQjExNSIgeG1wTU06RG9jdW1lbnRJRD0ieG1wLmRpZDo4MUI2M0Q3QTJBMTkxMUUzOEEyOEMzODZDMUFEQjBCQyIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDo4MUI2M0Q3OTJBMTkxMUUzOEEyOEMzODZDMUFEQjBCQyIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgQ1M2IChNYWNpbnRvc2gpIj4gPHhtcE1NOkRlcml2ZWRGcm9tIHN0UmVmOmluc3RhbmNlSUQ9InhtcC5paWQ6QkE2RDEyMjI0QzIwNjgxMTgyMkFCQzQ3NkE4MUE1NDQiIHN0UmVmOmRvY3VtZW50SUQ9InhtcC5kaWQ6Rjc3RjExNzQwNzIwNjgxMTg4QzZDRkRBNkQ2REIxMTUiLz4gPC9yZGY6RGVzY3JpcHRpb24+IDwvcmRmOlJERj4gPC94OnhtcG1ldGE+IDw/eHBhY2tldCBlbmQ9InIiPz5VzKS8AAAATklEQVR42ozOQQ7AIAhEUUqPw83hkKNsTGxBh8Q4i7f4AkCY5+5QIS4iML9HWZhbWTivz/jCNqOCZUYHfxknuGXc4MpgYO7XzCiYewgwALXpTHwh3IAvAAAAAElFTkSuQmCC)"});

        // Append a warning to the page stating that the default Blocks Viewer styles are being used
        if ($(".viewer-style-warning").length === 0) {
          window.debug.debug("NOTICE: The Default Blocks Styles are Being used. To prevent the injection of the default styles, set 'use_blocks_viewer_default_styles' to false in your Blocks config.json");
          $(".viewer-style-warning").css({"position":"fixed", "top":0, "width":"100%", "background":"red", "padding":"10px", "color":"white", "font-family":"sans-serif", "z-index":"999"});
        }
      }
    },

    _updateResizableValues: function () {
      var self = this,
        height,
        width,
        selector_value;

      if (self.frame_properties.resizable === true) {
        height = self.$frame.css("height");
        width = self.$frame.css("width");
        selector_value = width.replace("px", "") + "x" + height.replace("px","");
        if (self.$responsive_selector.find("select").find("option[value='" + selector_value + "']").length === 0) {
          self.$responsive_selector.find("select").prepend("<option value='" + selector_value + "' selected>" + selector_value + "</option>");
        }
      }
    },

    _autoSizeHeight: function () {
      var self = this,
        content_height,
        frame_container_vertical_padding;

      // This is a hack, waiting until content is at rendered height and width. Not sure if this delay
      // is needed due to CSS not loading completely or not
      setTimeout( function() {
        self.$frame.css("height", "0");
        // get scroll height of iFrame contents
        content_height = self.$frame[0].contentWindow.document.documentElement.scrollHeight;
        frame_container_vertical_padding = self.$frame.parent().outerHeight() - self.$frame.parent().height();
        // set height of iFrame to actual height of contents
        self.$viewerContainer.find(".b-frame_container").css("height", (content_height + frame_container_vertical_padding) + "px");
        self.$frame.css("height", "100%");
        self._updateResizableValues();      
      }, 500);
    },

    _autoSizeWidth: function () {
      var self = this,
        content_width;

      // This is a hack, waiting until content is at rendered height and width. Not sure if this delay
      // is needed due to CSS not loading completely or not
      setTimeout( function() {
        self.$frame.css("width", "0");
        // get scroll width of iFrame contents
        content_width = self.$frame[0].contentWindow.document.documentElement.scrollWidth;
        // set height of iFrame to actual height of contents
        self.$viewerContainer.find(".b-frame_container").css("width", content_width + "px");
        self.$frame.css("width", "100%");
        self._updateResizableValues();      
      }, 500);
    },

    _setHeightAndWidth: function () {
      var self = this;
      self.$frame.css({"height":"100%", "width":"100%"});

      if (self.frame_properties.height !== "auto") {
        self.$viewerContainer.find(".b-frame_container").css("height", self.frame_properties.height);
      }
      else {
        self._autoSizeHeight();
      }

      if (self.frame_properties.width !== "auto") {
        self.$viewerContainer.find(".b-frame_container").css("width", self.frame_properties.width);
      }
      else {
        self._autoSizeWidth();
      }

      setInterval(function () {
        self._setupAutoZoom();
      }, 500);
    },
    
    _setupAutoZoom: function (delay) {
      var self = this,
        available_width,
        scale,
        frame_container_vertical_padding,
        content_height,
        scaled_height,
        $zoomableAnnotation;
      delay = typeof delay === undefined ? 500 : delay;
      if (self.frame_properties.zoomable == "auto") {
        setTimeout(function() {
          self.$frame.parent().css({"width":"100%", "max-width": self.frame_properties.width + "px"});
          available_width = self.$viewerContainer.find(".b-frame_container").width();
          scale = Math.min((available_width / self.frame_properties.width), 1); //Don't scale above 100%

          // Update zoomable annotation before height calculations are done
          if (self.frame_properties["zoomable-annotation"] === true) {
            $zoomableAnnotation = self.$viewerContainer.find(".b-zoomable-annotation");
            if ($zoomableAnnotation.length === 0) {
              $zoomableAnnotation = $("<p class='b-zoomable-annotation'></p>");
              self.$viewerContainer.find(".b-figure").after($zoomableAnnotation);
            }

            $zoomableAnnotation.html("Displayed in viewport <span class='auto-zoom-width'>" + self.frame_properties.width + "px wide</span> @ <span class='auto-zoom-percentage'>" + Math.round(scale * 100) + "%</span> scale");
          }

          self.$frame.css({"width":self.frame_properties.width + "px", "-webkit-transform-origin": "0 0", "-webkit-transform": "scale(" + scale + ")", "transform-origin": "0 0", "transform": "scale(" + scale + ")"});    
          
          // Now that the content has scaled down based on available width, the height needs to be scaled down to match
          frame_container_vertical_padding = self.$frame.parent().outerHeight() - self.$frame.parent().height();
          content_height = self.$frame[0].contentWindow.document.documentElement.scrollHeight;
          scaled_height = (content_height * scale) + frame_container_vertical_padding;
          self.$frame.parent().css({"height": scaled_height + "px"});

          // Must set the viewer container to the scaled_height as well or the space leftover from the transform will be visible
          self.$frame.css({"height": content_height + "px"});

          // var viewer_container_height = self.$viewerContainer.height() - (content_height - scaled_height);
          // self.$viewerContainer.css({"height": viewer_container_height + "px"});

        }, delay);
      }
    },

    _autoZoomOnResize: function () {
      var self = this;
      if (self.frame_properties.zoomable == "auto") {
        $(window).on('resize', function () {
          self._setupAutoZoom(0);
        });
      }
    }
  };

  BlocksViewer.prototype = {
    constructor: BlocksViewer,

    loadConfig: function (opts) {
      var self = this,
        uri = opts.config_path + 'config.json',
        fetch_config = {
          type: 'GET',
          dataType: 'json',
          async: false, // We want this to block and go first
          cache: false,
          url: uri,
          timeout: 30000,
          success: function (data) {
            self.config = $.extend(opts, data);
          },
          error: function (err) {
            window.console.error('FAILED TO FETCH CONFIG: ' + uri + ' returned ' + JSON.stringify(err));
            self.config = opts;
          }
        };

      $.ajax(fetch_config);
    },

    /*
     * @method: init
     *
     * Parses the page, finds component references, creates Component objects
     * from them.
     */
    init: function () {
      var self = this,
        idx = 0;

      // For logging
      self.name = $(document).find('head title').text();
      self._setTemplateURI();
      self._enableJS();

      self.$el.find('*[data-frame-component]').each(function () {
        var frame;

        idx++;

        frame = new Frame({
          page: self,
          component: $(this),
          index: idx
        });
      });

      // Binds interactive elements of the page
      self._setupPage();

    },

    _setupPage: function () {
      var self = this;

      self._setupResponsiveSelector();
      self._enableTabs();
    },

    _enableJS: function () {
      $(document).find('html').removeClass('no-js').addClass('js');
    },

    _enableTabs: function () {
      var self = this,
        $tabs = self.$el.find('*[data-object="blocks-doc-component-tabs"]'),
        $active_tab = $tabs.find('[data-state="is-active"]'),
        makePaneActive = function ($tab) {
          var target_name = $tab.attr('data-target'),
            $target_pane = $tab.parent().parent().find(target_name);

          $target_pane.siblings().attr('data-state', 'is-inactive');
          $target_pane.attr('data-state', 'is-active');
        },
        makeTabActive = function ($tab) {
          $tab.siblings().attr('data-state', 'is-inactive');
          $tab.attr('data-state', 'is-active');
        },
        $selected_tab;

      // Find the active tab and make the pane active
      makePaneActive($active_tab);

      // Bind the tabs to make the pane active
      self.$el.on('click', '*[data-object="blocks-doc-component-tabs"] [data-target] a', function (event) {
        $selected_tab = $(this).parent();
        event.preventDefault();
        makeTabActive($selected_tab);
        makePaneActive($selected_tab);
      });
    },

    /*
     * @method: _setupResponsiveSelector
     *
     * Finds each select menu in the viewer that controls the height and width of
     * the (closest) iframe
     */
    _setupResponsiveSelector: function () {
      var self = this,
        $selector,
        $option,
        $frame,
        height,
        width;

      self.$el.on('change', '*[data-object="blocks-doc-component-responsive_selector"]', function () {
        $selector = $(this);
        $option = $selector.find(':selected');
        $frame = $selector.closest('.is-resizable').find('.ui-resizable');
        width = parseInt($option.attr('value').split('x')[0] * 1 + self.FRAME_CONTAINER_PADDING, 10);
        height = parseInt($option.attr('value').split('x')[1] * 1 + self.FRAME_CONTAINER_PADDING, 10);

        $frame.animate({ width:  width, height: height});
      });
    },

    _setTemplateURI: function () {
      var self = this,
        template_override = self.$el.attr('data-viewer_template');

      self.config.viewer_template_uri = self.opts.viewer_template_uri;

      if (template_override !== undefined) {
        self.config.viewer_template_uri = template_override;
      }
    },

    _setupLogging: function () {
      var self = this,
        console,
        logging = self.config.logging !== undefined ? self.config.logging : self.LOGGING,
        methods = [ 'error', 'warn', 'info', 'debug', 'log' ];

      window.debug = {};

      if (typeof(window.console) === undefined) {
        window.console = {};
      }

      console = window.console;

      _.each(methods, function (method) {
        window.debug[method] = function () {
          if (logging === true) {
            console[method].apply(console, arguments);
          }
        };
      });
    },
  };

  // Plugin definition
  var old = $.fn.BlocksViewer;

  $.fn.BlocksViewer = function (option) {
    return this.each(function () {
      var $self = $(this),
        data = $self.data('BlocksViewer'),
        options = $.extend({}, $.fn.BlocksViewer.defaults, $self.data(), typeof option == 'object' && option);

      if (!data) {
        $self.data('BlocksViewer', (data = new BlocksViewer(this, options)));
      }

      if (typeof option === 'string') {
        data[option]();
      }
    });
  };

  $.fn.BlocksViewer.defaults = {
    config_path: '',
    blocks_loader: '../blocks/build/blocks-loader-2.1.3.min.js',
    viewer_template_uri: 'viewer-template.html',
    components: {
      source: 'components/'
    }
  };

  $.fn.BlocksViewer.Constructor = BlocksViewer;

  // Prevent conflicts
  $.fn.BlocksViewer.noConflict = function () {
    $.fn.BlocksViewer = old;
    return this;
  };

  $(window).on('load', function () {
    $('body').BlocksViewer();
  });

})(window.jQuery, window.console, document);