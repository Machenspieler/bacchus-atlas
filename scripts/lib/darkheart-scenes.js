'use strict';
/* The manifest library moved to js/ (PD-099) so the Darkheart page can run the same analysis in the browser.
 * This shim keeps the build scripts and tests importing it from here. */
module.exports = require('../../js/darkheart-scenes.js');
