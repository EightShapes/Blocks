class EsbConfig {
  constructor() {
    this.url = 'config.json';
    this.setDefaults();
  }

  getConfig() {
    // We're not picky about who can have our data
    return this.config;
  }

  load(url) {
    var self = this,
        uri,
        req,
        data;

    self.setDefaults(); //reset config when a new url is loaded

    return new Promise(function(resolve, reject) {
      resolve({});
    });
  }

  merge(data) {
    var self = this;

    for (let key in data) {
      if (typeof data[key] === 'object' && key !== 'template_data') {
        let key_map = new Map();
        for (let data_key in data[key]) {
          key_map.set(data_key, data[key][data_key]);
        }
        self.config.set(key, key_map);
      } else {
        self.config.set(key, data[key]);
      }
    }
  }

  setDefaults() {
    var self = this;

    let defaults = new Map();
    let includes = new Map();

    includes.set('source', 'includes/');

    // Defaults
    defaults.set('backward_compatible', false);
    defaults.set('path', '');
    defaults.set('includes', includes);

    self.config = defaults;
  }

  setLoggingLevel() {
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
}

export default new EsbConfig();
