import $ from 'jquery';
import handlebars from 'handlebars';
import BlocksConfig from './blocks-config';
import BlocksUtil from './blocks-util';

export class BlocksComponent {
  constructor(opts) {
    var self = this;

    self.logger = BlocksUtil.logger;

    self.has_nested = false;
    self.classes = [];
    self.attributes = {};
    self.has_nested = false;

    // Kids!
    self.children = new Map();

    // This is irritating but, we need to track the header classes for
    // nested components for when it comes time to render
    self.child_classes = {};
    self.child_attributes = {};

    // Keep count of child dependencies (nested components)
    self.child_count = 0;
    self.children_loaded = 0;
    self.children_rendered = 0;
    // For components with no children we can skip ahead
    self.no_children = false;

    self.init(opts);
  }

  init(opts) {
    var self = this,
      $component = opts.component;

    self.config = BlocksConfig.getConfig();
    self.parent = opts.parent;
    self.page = opts.page;

    self._setID($component);
    self.$el = $component;
    self.name = $component.attr('data-component');
    self.source = $component.attr('data-source');

    self._setComponentPath();
    self._setVariationName($component);
    self._setTemplateData($component);
    self._setWrappingMarkup($component);

    // Rendering configuration
    self._setRenderingConfig();

    self.is_nested = (self.parent.type === undefined || self.parent.type === 'component');
    self.classes.push($component.attr('class'));
  }

  load() {
    var self = this;

    $.when(self.fetch()).then(function (data) {
      self.parse(data).done(function () {
        self.parent.childDoneLoading(self);
      });
    });
  }

  addTemplate(variation) {
    var self = this,
      variation_html = variation.html(),
      tmpl;

    if (variation_html !== undefined && variation_html.length > 0) {
      tmpl = $.trim(variation_html).replace(/\n\s*/g, '');

      if (!self.template) {
        self.template = handlebars.compile(tmpl);
        self.logger('debug', 'Added fetched template: ' + self.template_name());
      }
    } else {
      self.logger('error', 'FAILED TO FIND VARIATION: ' + self.variation_name + ' in ' + self.name);
    }
  }

  fetch() {
    var self = this,
      uri = self.template_uri(),
      fetch_opts = {
        type: 'GET',
        url: uri,
        dataType: 'html',
        cache: false,
        timeout: 15000
      },
      promise;

    // TODO: This cache key name needs to handle library conflicts
    promise = self.page.cache[self.name];

    if (promise === undefined) {
      promise = $.ajax(fetch_opts);
      self.page.cache[self.name] = promise;
      self.logger('debug', 'Queued component template: ' + self.name);

      self._injectCSS();
    }

    promise.done(function (results) {
      if (results !== undefined && results !== '') {
        self.fetched_data = results;

        // Collects a unique list of page components fetched
        // Used to inject JS once all page components are fully loaded
        self.page.components[self.name] = self;

        self.logger('debug', 'Returned component template: ' + self.name);
      }
    });

    promise.fail(function () {
      // Returns: jqXHR, textStatus, error
      // var error_message = document.createElement('div');
      var body = document.querySelectorAll('body')[0];
      var el = document.createElement('div');
      var error_style = "position: fixed; top:0; right:0; background:rgba(255,255,255,0.8); color:red; padding:10px; font-size:18px; font-family: Helvetica, Arial, sans-serif;";
      el.style.cssText = error_style;
      el.textContent = 'Blocks Error - Component template not found: ' + self.name;
      el.classList.add("esb-component-loading-error");
      body.insertBefore(el, body.firstChild);
      self.logger('error', 'FAILED TO FETCH TEMPLATE: ' + self.name);
    });

    return promise;
  }

  parse(results) {
    var self = this,
      $component_html,
      $header,
      $documentation,
      $nested_components,
      queued_components = [];

    self.parse_deferred = new $.Deferred();

    self.logger('debug', 'PARSING ' + self.template_uri());

    // Yes, it needs to be wrapped.
    results = '<div>' + results + '</div>';

    // Split the file by variation
    $component_html = $($(results).children('#variations'));

    $header = $($(results).children('header'));
    self.$header = $header;

    $documentation = $($(results).children('#documentation'));
    self.$documentation = $documentation;

    // Collect header classes for component
    self.classes.push($header.attr('class'));

    // The not() here is to avoid finding nested component varations
    self.$variation = $component_html.find('[data-variation="' + self.variation_name + '"]').not('[data-component]');

    // Collect variation classes for component
    self.classes.push(self.$variation.attr('class'));

    // Collect variation data attributes for component
    Array.from(self.$variation.prop('attributes')).forEach(function (attr) {
      if (attr.name === 'class') {
        return true;
      }
      self.attributes[attr.name] = attr.value;
    });

    // Nested components need to put their classes in a special place
    if (self.is_nested) {
      self.parent.child_classes[self.template_name()] = self.classes;
      self.parent.child_attributes[self.template_name()] = self.attributes;
    }

    // Update img src path for library components
    if (self.source === 'library') {
      self.updateImgSrcPath();
    }

    $nested_components = self.$variation.find('*[data-component]');

    if ($nested_components !== undefined && $nested_components.length > 0) {
      $nested_components.each(function (idx, nested_component) {
        var $nested_component = $(nested_component),
          nested_component_id = BlocksUtil.generateUUID();

        self.logger('debug', 'FOUND nested component: ' + $nested_component.attr('data-component'));
        self.child_count++;

        // Assign a UUID to find the component in the DOM later
        $nested_component.attr('data-blocks-uuid', nested_component_id);

        // MUST queue the components to get an accurate child count
        // Otherwise a race condition is created where the child count doesn't
        // fully increment (never gets beyond 1) before child fetches start returning
        // (especially for a cached component)
        queued_components.push({parent: self, component: $nested_component });
      });
    } else {
      self.no_children = true;
    }

    // Render our template now that the UUIDs have been set on the nested components
    self.addTemplate(self.$variation);

    // If we've got no children then we can resolve the parsing promise
    if (self.no_children === true) {
      self.parse_deferred.resolve();
    }

    if (self.child_count > 0) {
      self.logger('debug', 'TMPL ' + self.template_name() + ' has ' + self.child_count + ' children');

      Array.from(queued_components).forEach(function (queued_component) {
        var component;

        component = new BlocksComponent({
          parent: queued_component.parent,
          component: queued_component.component,
          page: queued_component.parent.page
        });

        // This is new and probably not the desired behavior. The BlocksPage.display() loads each
        // page-level component whereas before we just autoloaded each component.
        // But now we would need to rip apart load and rely on BlocksPage to do all of that.
        // Circumnavigating this for now.
        component.load();
      });
    }

    return self.parse_deferred;
  }

  childDoneLoading(child) {
    var self = this;

    self.logger('debug', 'CHILD LOADED: ' + child.template_name());
    self.children_loaded++;

    self.children.set(child.uuid, child);

    if (self.child_count === self.children_loaded) {
      if (self.parent !== undefined) {
        self.parent.childDoneLoading(self);
      }
    }
  }

  childDoneRendering(child) {
    var self = this,
      child_components,
      replaceWithChild = function (nested_component) {
        var $nested_component = $(nested_component),
          uuid = self._getIDFromVariation($nested_component),
          target_child = self.children.get(uuid);

        self.$el = target_child.$el;
      },
      returnChildElement = function (nested_component) {
        var $nested_component = $(nested_component),
          uuid = self._getIDFromVariation($nested_component),
          target_child = self.children.get(uuid);

        return target_child.$el[0];
      },
      updateChild = function (nested_component) {
        var $nested_component = $(nested_component),
          uuid = self._getIDFromVariation($nested_component),
          target_child = self.children.get(uuid);

        $(nested_component).replaceWith(target_child.$el);
      };

    self.children_rendered++;

    if (self.child_count === self.children_rendered) {
      self.renderTemplate();
      self.logger('debug', 'CHILD RENDERED: ' + child.template_name());

      // Update your DOM with your kids' rendered templates
      child_components = self.$el.find('[data-component]');

      if (child_components !== undefined && child_components.length > 0) {
        child_components.each(function (idx, nested_component) {
          updateChild(nested_component);
        });
      } else {
        // If we didn't find any child components we might be a
        // parent that should be replaced by a single child
        if (self.$el.length === 1) {
          if (self.$el[0].hasAttribute('data-component')) {
            if (self.replace_reference) {
              replaceWithChild(self.$el[0]);
            } else {
              updateChild(self.$el[0]);
            }
          }
        } else if (self.$el.length > 1) {
          // Our child is replaced and thus has no wrapper around the elements therein.
          // Therefore this an array of elements
          $.each(self.$el, function (idx, el) {
            if ($(el)[0].hasAttribute('data-component')) {
              self.$el[idx] = returnChildElement($(el));
            }
          });
        }
      }

      self.parent.childDoneRendering(self);
    }
  }

  render() {
    var self = this;

    if (self.no_children === true ||
        self.children_rendered === self.children_loaded) {

      self.renderTemplate();

      if (self.parent) {
        self.parent.childDoneRendering(self);
      }
    } else {
      // Render each child down the tree
      self.children.forEach(function (child) {
        child.render();
      });
    }
  }

  renderTemplate() {
    var self = this,
      rendered_tmpl = self.template(self.template_data),
      addClasses = function () {
        // Sets must have unique keys thus this can replace _.uniq()
        self.$el.attr('class', [...new Set(self.classes)].join(' '));
      },
      setAttributes = function () {
        for (let attribute in self.attributes) {
          self.$el.attr(attribute, self.attributes[attribute]);
        }
      },
      wrapWithComments = function () {
        self.$el.prepend(self.comment_start);
        self.$el.append(self.comment_end);
      },
      wrapWithDocFrame = function () {
        var $doc_frame = self.documentationFrame(),
          $component = self.$el.clone();

        if ($doc_frame !== undefined) {
          $doc_frame
            .find('*')
            .contents()
            .filter(function () {
              return this.nodeType === 8;
            })
            .replaceWith($component);

          self.$el.replaceWith($doc_frame.children());
        }
      };

    if (self.replace_reference === true) {
      if (self.enclose !== undefined && self.enclose.length > 0) {
        self.$el = self.enclose;

        if (self.$el.children().length === 0) {
          self.$el.append(rendered_tmpl);
        } else {
          self.$el.children().last().append(rendered_tmpl);
        }
      } else {
        self.$el = $(rendered_tmpl);
      }

      if (self.config.get('components').has('wrap_with_comments') &&
          self.config.get('components').get('wrap_with_comments') === true) {
        wrapWithComments();
      }
    } else {
      if (self.enclose !== undefined && self.enclose.length > 0) {
        self.$el = self.enclose;

        if (self.$el.children().length === 0) {
          self.$el.append(rendered_tmpl);
          addClasses();
          setAttributes();
        } else {
          self.$el.children().last().append(rendered_tmpl);
        }
      } else {
        self.$el.append(rendered_tmpl);
        addClasses();
        setAttributes();
      }
    }

    if (self.hasDocumentation() && self.hasDocumentationFrame()) {
      wrapWithDocFrame();
      // Signal to the Page to replace the componet with the doc frame
      self.frame_with_documentation = true;
    }
  }

  css_uri() {
    return this.component_path + 'css/' + this.name + '.css';
  }

  documentationFrame() {
    var self = this,
      variation_name = self.$el.attr('data-frame-variation'),
      $variation;

    if (self.hasDocumentation() && self.hasDocumentationFrame()) {
      $variation = self.$documentation.find('*[data-variation="' + variation_name + '"]');

      if ((variation_name !== undefined && $variation !== undefined) &&
          (variation_name.length > 0 && $variation.length > 0)) {
        return $variation;
      }
    }
  }

  hasDocumentation() {
    var self = this;
    return (self.$documentation !== undefined && self.$documentation.length > 0);
  }

  hasDocumentationFrame() {
    var self = this,
      variation_name = self.$el.attr('data-frame-variation');

    return (variation_name !== undefined && variation_name.length > 0);
  }

  injectJS(page) {
    var self = this,
      uri = self.js_uri(),
      event_name = self.template_name(),
      triggerCallback = function () {
        self.logger('debug', 'Triggering ' + event_name);
        $(document).trigger(event_name);
      },
      notifyParent = function () {
        page.childDoneInjectingJS();
      },
      fetch_config = {
        type: 'HEAD',
        url: uri,
        dataType: 'html', // DO NOT set to 'script'. jQuery will use $.getScript() which automatically inserts the JS into the DOM thus all component JS will execute twice
        cache: false
      },
      promise;

    promise = $.ajax(fetch_config);

    promise.done(function () {
      // Note: Content-Length isn't present when Blocks is loaded via file://
      // and responseText isn't present when Blocks is loaded via http://.

      // The Content-Encoding check should not be needed, however some servers are not
      // reliably sending the Content-Length header when serving our prototype's css files as of 1/10/14
      if (promise.getResponseHeader('Content-Length') > 0 ||
          promise.responseText.length > 0 ||
          promise.getResponseHeader('Content-Encoding') === 'gzip') {
          if (self.config.get('wrap_injected_js_with_comments')) {
            $('head').append('<!--<script data-blocks-injected-js="true" src="' + uri + '"></script>-->'); //config option will wrap injected scripts inside a comment preventing them from executing. Useful when using blocks with other processing tools that can later uncomment the scripts
          } else {
            $('head').append('<script src="' + uri + '"></script>');
            triggerCallback();
          }
      } else {
        window.debug.warn('JS resource is empty: ' + uri);
      }

      notifyParent();
    });

    promise.fail(function () {
      // Returns: jqXHR, textStatus, error
      self.logger('debug', 'JS resource is missing: ' + uri);
      notifyParent();
    });
  }

  js_uri() {
    return this.component_path + 'js/' + this.name + '.js';
  }

  /**
   * @method: template_name
   *
   * This is the sanitized and unique compound of the component and variation name
   * The template system requires this.
   */
  template_name() {
    return [this.name, this.sanitized_variation_name].join('_');
  }

  template_uri() {
    return this.component_path + this.name + '.html';
  }

  // "PRIVATE" methods
  _constructVariationName(name) {
    return name !== undefined ? name : 'default';
  }

  _getIDFromVariation($component) {
    return $component.attr('data-blocks-uuid');
  }

  /**
   * @method: _isJSON
   *
   * Wraps a call to parseJSON
   */
  _isJSON(str) {
    try {
      $.parseJSON(str);
    } catch (e) {
      return false;
    }
    return true;
  }

  /**
   * @method: _injectCSS
   *
   * Performs a HEAD request so that we only append links to CSS files that
   * actually exist.
   * Note: Content-Length isn't present when Blocks is loaded via file://
   * and responseText isn't present when Blocks is loaded via http://.
   *
   * The Content-Encoding check should not be needed, however some servers
   * are not reliably sending the Content-Length header when serving our prototype's css files
   * as of 1/10/14.
   */
  _injectCSS() {
    var self = this,
      uri = self.css_uri(),
      $head = $('head'),
      fetch_config = {
        type: 'HEAD',
        url: uri,
        dataType: 'html',
        cache: false
      },
      promise;

    promise = $.ajax(fetch_config);

    promise.done(function () {
      if (promise.getResponseHeader('Content-Length') > 0 ||
          promise.responseText.length > 0 ||
          promise.getResponseHeader('Content-Encoding') === 'gzip') {
        $head.append('<link rel="stylesheet" href="' + uri + '" />');
      } else {
        self.logger('warn', 'CSS resource is empty: ' + uri);
      }
    });

    promise.fail(function () {
      // Returns: jqXHR, textStatus, error
      self.logger('debug', 'CSS resource is missing: ' + uri);
    });
  }

  _sanitizeVariationName(name) {
    return name.replace(/-/g, '_');
  }

  /*
   * @method: _setComponentPath
   *
   * Uses the data-source attribute or components.source from
   * the config to obtain the path to the component template files.
   * If your parent is in the library then, you are too.
   */
  _setComponentPath() {
    var self = this,
      source = self.source,
      path = 'components/';

    if (source !== undefined && source.length > 0) {
      path = source;
    } else if (self.config.get('components') !== undefined) {
      if (self.config.get('components').get('source') !== undefined) {
        path = self.config.get('components').get('source');
      }
    } else {
      self.logger('error', 'Could not determine path to components.');
    }

    if (self.parent !== undefined && self.parent.type !== 'page') {
      if (self.parent.source === 'library') {
        path = 'library';
      }
    }

    if (path === 'library') {
      self.source = path;
      path = 'library/components/';
    }

    self.component_path = path;
  }

  _setID($el) {
    var self = this;
    self.uuid = $el.attr('data-blocks-uuid');
  }

  /*
   * @method: setRenderingConfig
   *
   * If either the data-place attribute or components.replace_reference
   * is set to true then the element, a component, will be replaced
   * rather than appended to.
   *
   */
  _setRenderingConfig() {
    var self = this;

    if (self.config.has('components')) {
      if (self.config.get('components').get('replace_reference') === true) {
        self.replace_reference = true;
      }
    }

    if (self.$el.attr('data-place') !== undefined) {
      if (self.$el.attr('data-place') === 'replace') {
        self.replace_reference = true;
      } else if (self.$el.attr('data-place') === 'inner') {
        self.replace_reference = false;
      }
    }

    if (self.replace_reference === true) {
      self.comment_start = '<!-- #block data-component="' + self.name + '" data-variation="' + self.variation_name + '" -->';
      self.comment_end = '<!-- /block data-component="' + self.name + '" data-variation="' + self.variation_name + '" -->';
    }
  }

  _setTemplateData($el) {
    var self = this,
      content = $el.attr('data-content'),
      tmpl_data,
      getTemplateData = function (key_string, config_data) {
        var obj = config_data,
          data = false,
          keys = key_string.split('.'),
          key,
          key_exists = function (obj, key) {
            return obj.hasOwnProperty(key);
          };

        for (var i = 0; i < keys.length; i++) {
          key = keys[i];

          if (key_exists(obj, key)) {
            obj = obj[key];

            if (i === keys.length - 1) {
              data = obj;
            }
          } else {
            break;
          }
        }
        return data;
      };

    if (content !== undefined && self._isJSON(content)) {
       // Raw JSON passed in as the data-content-param
       tmpl_data = $.parseJSON(content);
       self.content = content;
    } else if (self.config.has('template_data')) {
      if (content !== undefined) {
        tmpl_data = getTemplateData(content, self.config.get('template_data'));
        self.content = content;
      }
    }

    self.template_data = tmpl_data;
  }

  // Sets two variation names: the original and the sanitized version
  _setVariationName($el) {
    var name = $el.attr('data-variation'),
      tmpl_name = this._constructVariationName(name);

    this.variation_name = tmpl_name;
    this.sanitized_variation_name = this._sanitizeVariationName(tmpl_name);
  }

  /*
   * @method: setWrappingMarkup
   *
   * If a component has a data-enclose attribute the value will be used
   * to generate markup that will wrap the component.
   *
   */
  _setWrappingMarkup() {
    // This is just a no-op for now. Pretty sure no one uses this functionality.
  }
}
