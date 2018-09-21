var path = require('path');
var removeDuplicates = require('./util.js').removeDuplicates;

function initializeData(name, filePath) {
  return {
    className: name,
    imports: {
      [`./${path.basename(filePath)}`.replace(/.ts$/, '')]: [name]
    },
    providers: {},
    depsVariables: {},
    depsUsage: {},
    depsDirectUsage: {},
    localUsage: {},
    conditions: {},
    defaultParameters: {},
    initialProperties: {},
    useMockito: false,
    useThrow: false,
  };
}

function copyNgInitDepsToOtherMethods(result) {
  if (result.localUsage.ngOnInit === undefined) return;

  for (let localMethod in result.localUsage) {
    if (localMethod !== "ngOnInit") {
      copyDependencies(result, "ngOnInit", localMethod);
    }
  }
}

function populateDepsRecursive(result) {
  for(let method in result.localUsage) {
    const methods = getUsagesRecursive(result, method);
    methods.forEach(localMethod => {
      copyDependencies(result, localMethod, method);
    });
  }
}

function populateDepsVarsMethods(result) {
  for(var method in result.depsUsage) {
    for(var dep in result.depsUsage[method]) {
      if(result.depsVariables[dep]["methods"] === undefined) {
        result.depsVariables[dep]["methods"] = [];
      }
      result.depsVariables[dep].methods = [
        ...result.depsVariables[dep].methods, 
        ...result.depsUsage[method][dep].map(methodData => methodData.method)
      ];
    }
  }
  for(var dep in result.depsVariables) {
    result.depsVariables[dep].methods = removeDuplicates(result.depsVariables[dep].methods);
  }
}

// private functions

function getUsagesRecursive(result, method) {
  let methods = result.localUsage[method];
  let flatMethods = methods;
  methods.forEach((localMethod) => {
    flatMethods = [...flatMethods, ...getUsagesRecursive(result, localMethod)];
  });
  return removeDuplicates(flatMethods);
}

function copyDependencies(result, sourceMethod, targetMethod) {
  const deps = result.depsUsage[sourceMethod];
  for (let dep in deps) {
    if (result.depsUsage[targetMethod][dep] === undefined) {
      result.depsUsage[targetMethod][dep] = deps[dep];
    }
    else {
      result.depsUsage[targetMethod][dep] = [...result.depsUsage[targetMethod][dep], ...deps[dep]];
      result.depsUsage[targetMethod][dep] = removeDuplicates(result.depsUsage[targetMethod][dep]);
    }
  }
}

module.exports = {
    initializeData,
    copyNgInitDepsToOtherMethods,
    populateDepsRecursive,
    populateDepsVarsMethods,
};
