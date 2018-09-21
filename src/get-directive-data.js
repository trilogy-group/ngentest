
var initializeData = require('./lib/template-utils.js').initializeData;
var copyNgInitDepsToOtherMethods = require('./lib/template-utils.js').copyNgInitDepsToOtherMethods;
var populateDepsRecursive = require('./lib/template-utils.js').populateDepsRecursive;
var populateDepsVarsMethods = require('./lib/template-utils.js').populateDepsVarsMethods;

var populateProperties = require('./lib/parse-utils.js').populateProperties;
var populateDependenciesUsage = require('./lib/parse-utils.js').populateDependenciesUsage;
var populateParameters = require('./lib/parse-utils.js').populateParameters;
var populateProviders = require('./lib/parse-utils.js').populateProviders;

module.exports = function getDirectiveData(tsParsed, filePath, angularType) {
  let result = initializeData(tsParsed.name, filePath);
  populateProperties(tsParsed, result);
  populateDependenciesUsage(tsParsed, result);
  populateDepsRecursive(result);
  // if ngOnInit exists we need to add it as a dependency to each other methods
  copyNgInitDepsToOtherMethods(result);
  populateDepsVarsMethods(result);
  populateParameters(tsParsed, result);
  populateProviders(tsParsed, result);

  return result;
}


