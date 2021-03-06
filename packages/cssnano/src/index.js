import postcss from 'postcss';
import cosmiconfig from 'cosmiconfig';
import isResolvable from 'is-resolvable';
import defaultPreset from 'lerna:cssnano-preset-default';

const cssnano = 'cssnano';

const explorer = cosmiconfig(cssnano, {
    rc: false,
    argv: false,
});

function initializePlugin (plugin, css, result) {
    if (Array.isArray(plugin)) {
        const [processor, opts] = plugin;
        if (
            typeof opts === 'undefined' ||
            (typeof opts === 'object' && !opts.exclude)
        ) {
            return Promise.resolve(
                processor(opts)(css, result)
            );
        }
    } else {
        return Promise.resolve(
            plugin()(css, result)
        );
    }
    // Handle excluded plugins
    return Promise.resolve();
}

function fromFile (css, result) {
    const filePath = css.source.input && css.source.input.file || process.cwd();
    result.messages.push({
        type: 'debug',
        plugin: cssnano,
        message: `Using config relative to "${filePath}"`,
    });
    return filePath;
}

/*
 * config.preset can be one of four possibilities:
 * config.preset = 'default'
 * config.preset = ['default', {}]
 * config.preset = function <- to be invoked
 * config.preset = {plugins: []} <- already invoked function
 */

function resolvePreset (config) {
    const {preset} = config;
    let fn, options;
    if (Array.isArray(preset)) {
        fn = preset[0];
        options = preset[1];
    } else {
        fn = preset;
        options = {};
    }
    // For JS setups where we invoked the preset already
    if (preset.plugins) {
        return Promise.resolve(preset.plugins);
    }
    // Provide an alias for the default preset, as it is built-in.
    if (fn === 'default') {
        return Promise.resolve(defaultPreset(options).plugins);
    }
    // For non-JS setups; we'll need to invoke the preset ourselves.
    if (typeof fn === 'function') {
        return Promise.resolve(fn(options).plugins);
    }
    // Try loading a preset from node_modules
    if (isResolvable(fn)) {
        return Promise.resolve(require(fn)(options).plugins);
    }
    const sugar = `cssnano-preset-${fn}`;
    // Try loading a preset from node_modules (sugar)
    if (isResolvable(sugar)) {
        return Promise.resolve(require(sugar)(options).plugins);
    }
    // If all else fails, we probably have a typo in the config somewhere
    throw new Error(`Cannot load preset "${fn}". Please check your configuration for errors and try again.`);
}

/*
 * cssnano will look for configuration firstly as options passed
 * directly to it, and failing this it will use cosmiconfig to
 * load an external file.
 */

function resolveConfig (css, result, options) {
    if (options.preset) {
        return resolvePreset(options);
    }
    return explorer.load(fromFile(css, result)).then(config => {
        if (config === null) {
            return resolvePreset({preset: 'default'});
        }
        return resolvePreset(config);
    });
}

export default postcss.plugin(cssnano, (options = {}) => {
    return (css, result) => {
        return resolveConfig(css, result, options).then((plugins) => {
            return plugins.reduce((promise, plugin) => {
                return promise.then(initializePlugin.bind(null, plugin, css, result));
            }, Promise.resolve());
        });
    };
});
