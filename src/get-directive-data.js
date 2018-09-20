var path = require('path');
var getImportLib = require('./lib/util.js').getImportLib;
var reIndent = require('./lib/util.js').reIndent;
var windowObjects = require('./lib/window-objects.js');

module.exports = function getDirectiveData(tsParsed, filePath, angularType) {
  let result = initializeData(tsParsed, filePath);
  populateProperties(tsParsed, result);
  populateDependenciesUsage(tsParsed, result);
  populateDepsRecursive(result);
  // if ngOnInit exists we need to add it as a dependence all other methods
  copyNgInitDepsToOtherMethods(result);
  populateDepsVarsMethods(result);
  populateParameters(tsParsed, result);
  populateProviders(tsParsed, result);
  console.log(result.depsUsage.onStatusClick);

  return result;
}

function addTestsToAllMethods(tsParsed, angularType, result) {
  for (var key in tsParsed.methods) {
    let method = tsParsed.methods[key];
    let parameters = method.parameters.map(el => el.name).join(', ');
    let js = `${angularType.toLowerCase()}.${key}(${parameters})`;
    (method.type !== 'void') && (js = `const result = ${js}`);
    result.functionTests[key] = reIndent(`
      it('should run #${key}()', async(() => {
        // ${js};
      }));
    `, '  ');
  }
}

function getUsagesRecursive(result, method) {
  let methods = result.localUsage[method];
  let flatMethods = methods;
  methods.forEach((localMethod) => {
    flatMethods = [...flatMethods, ...getUsagesRecursive(result, localMethod)];
  });
  return removeDuplicates(flatMethods);
}

function populateDepsRecursive(result) {
  for(let method in result.localUsage) {
    const methods = getUsagesRecursive(result, method);
    methods.forEach(localMethod => {
      copyDependencies(result, localMethod, method);
    });
  }
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

function populateDependenciesUsage(tsParsed, result) {
  populateDepsVariables(tsParsed, result);
  for(let key in tsParsed.methods) {
    const body = tsParsed.methods[key].body;
    addDepsUsage(result, key, body);
    addLocalUsages(result, key, body, tsParsed.methods);
  }
}

function copyNgInitDepsToOtherMethods(result) {
  if (result.localUsage.ngOnInit === undefined) return;

  for (let localMethod in result.localUsage) {
    if (localMethod !== "ngOnInit") {
      copyDependencies(result, "ngOnInit", localMethod);
    }
  }
}

function addLocalUsages(result, key, body, methods) {
  result.localUsage[key] = [];
  for(let localMethod in methods) {
    if(localMethod === key) continue;
    const isUsed = getLocalMethodUsage(localMethod, body);
    if(isUsed) {
      result.localUsage[key].push(localMethod);
    }
  }
}

function addDepsUsage(result, methodName, body) {
  result.depsUsage[methodName] = {};
  result.conditions[methodName] = {};
  for (let dep in result.depsVariables) {
    let usages = getUsage(dep, body);
    result.conditions[methodName] = getUsagesInsideIfBranch(dep, body);
    if (usages.length) {
      usages = usages.map(method => {
        const errorMessage = getErrorCatch(dep, method, body);
        conditions = [];
        result.conditions[methodName]
          .filter(branch => branch.usages.includes(method))
          .forEach(branch => {
            conditions.push(branch.condition);
          });
        if(errorMessage && !conditions.length) result.useThrow = true;
        return {method, conditions, errorMessage};
      });
      result.depsUsage[methodName][dep] = removeDuplicates(usages);
    }
  }
  result.depsDirectUsage[methodName] = {...result.depsUsage[methodName]};
}

function getErrorCatch(variable, methodCalled, methodBody) {
  const s = "[\\r\\n\\t\\s]*";
  const regexOfCall = 
    new RegExp(`${variable}${s}\\.${s}${methodCalled}${s}\\([\\s\\S]*\\)${s}.${s}subscribe${s}\\(`, 'g');

  const matchCall = regexOfCall.exec(methodBody);
  if(!matchCall) {
    return false;
  }
  const body = methodBody.substring(matchCall.index);
  const regexOfError = new RegExp(`\\(?error\\)?${s}=>${s}[^'"]*['"](.*)['"]`, 'g');
  const matchError = regexOfError.exec(body);
  if(!matchError) {
    return false;
  }
  return matchError[1];
}

function getUsage(variable, methodBody) {
  let usages = [];
  const regex = new RegExp("this[\\r\\n\\s]*\\."+variable+"[\\r\\n\\s]*\\.([^\\(]*)\\(", 'g');
  let match = regex.exec(methodBody);
  while(match != null) {
    usages.push(match[1]);
    match = regex.exec(methodBody);
  }
  return usages;
}

function getLocalMethodUsage(localMethod, methodBody) {
  const regex = new RegExp("this[\\r\\n\\s]*\\."+localMethod+"\\(");
  return !!regex.exec(methodBody);
}

function getCloserIndex(body) {
  let n = 0;
  let opens = 0;
  do {
    n = body.indexOf("{", n+1);
    if(n === -1) break;
    opens++;
    n = body.indexOf("}", n+1);
    if(n === -1) break;
    opens--;
    if(opens === 0) return n;
  } while(n !== -1);
  return 0;
}

function getUsagesInsideIfBranch(variable, methodBody) {
  let branches = [];
  const s = "[\\r\\n\\t\\s]*";
  const regex = new RegExp(`if${s}\\(${s}(.*)${s}\\)${s}\\{`, 'g');
  let match = regex.exec(methodBody);
  while(match != null) {
    const end = getCloserIndex(methodBody.substring(match.index));
    const ifBody = methodBody.substring(match.index, end);
    let branch = { 
      condition: match[1], 
      usages: getUsage(variable, ifBody)
    };
    let matchVar = branch.condition.match(/^this.([a-zA-Z0-9]*)$/m);
    if(matchVar) branch.variable = matchVar[1];
    branches.push(branch);
    match = regex.exec(methodBody);
  }
  return branches;
}

function populateProviders(tsParsed, result) {
  for(var dep in result.depsVariables) {
    const depData = result.depsVariables[dep];
    var className;
    if(depData.injected) {
      className = depData.testBed;
      result.providers[className] = `{ provide: ${className}, useValue: ${dep}Mock }`;
    } else {
      result.useMockito = true;
      className = depData.type;
      result.providers[className] = `{ provide: ${className}, useFactory: () => mock(${className}) }`;
    }
    addImport(tsParsed.imports, result, className);
  }
}

function populateDepsVariables(tsParsed, result) {
  tsParsed.constructor.parameters.forEach(param => {
    if(!param.body) return;
    let dep = {type: param.type, testBed: param.type};

    const matches = param.body.match(/@Inject\(([A-Z0-9_]+)\)/);
    if (matches) {
      dep.testBed = matches[1];
      dep.injected = true;
    }
    result.depsVariables[param.name] = dep;
  });
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

function populateParameters(tsParsed, result) {
  for(var method in tsParsed.methods) {
    result.defaultParameters[method] = {names: [], values: [], types: []};
    tsParsed.methods[method].parameters.forEach(parameter => {
      result.defaultParameters[method].names.push(parameter.name);
      result.defaultParameters[method].types.push(parameter.type);
      const typeValue = generateValueToGivenType(parameter.type);
      result.defaultParameters[method].values.push(typeValue.value);
      if(!typeValue.primitive) {
        addImport(tsParsed.imports, result, parameter.type);
      }
    });
  }
}

function addImport(imports, result, className) {
  const importLib = getImportLib(imports, className);
  result.imports[importLib] = result.imports[importLib] || [];
  if(!result.imports[importLib].includes(className)) {
    result.imports[importLib].push(className);
  }
}

function generateValueToGivenType(type) {
  switch(type) {
    case "number":
      return {value: "1", primitive: true};
    case "string":
      return {value: "''", primitive: true};
    case "boolean":
      return {value: "false", primitive: true};
    case "Array":
      return {value: "[]", primitive: true};
    default:
      return {value: "{}", primitive: false};
  }
}

function populateProperties(tsParsed, result) {
  for (var key in tsParsed.properties) {
    const prop = tsParsed.properties[key];
    const private = (prop.body.indexOf("private") !== -1);
    result.initialProperties[key] = {type: prop.type, private};

    const s = "[\\r\\n\\t\\s]*";
    const regex = new RegExp(`=${s}([^;]*);?$`, 'gm');
    const match = regex.exec(prop.body);  
    if(match) {
      result.initialProperties[key].value = match[1];
    }
  }
}

function initializeData(tsParsed, filePath) {
  return {
    className: tsParsed.name,
    imports: {
      [`./${path.basename(filePath)}`.replace(/.ts$/, '')]: [tsParsed.name]
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

function removeDuplicates(arr){
  let unique_array = [];
  let strUniqueArr = [];
  for(let i = 0; i < arr.length; i++){
      if(strUniqueArr.indexOf(JSON.stringify(arr[i])) == -1){
          strUniqueArr.push(JSON.stringify(arr[i]));
          unique_array.push(arr[i]);
      }
  }
  console.log(arr, unique_array, strUniqueArr);
  return unique_array;
}