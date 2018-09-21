var removeDuplicates = require('./util.js').removeDuplicates;
var getImportLib = require('./util.js').getImportLib;

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

function populateDependenciesUsage(tsParsed, result) {
  populateDepsVariables(tsParsed, result);
  for(let key in tsParsed.methods) {
    const body = tsParsed.methods[key].body;
    addDepsUsage(result, key, body);
    addLocalUsages(result, key, body, tsParsed.methods);
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

// private functions

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

module.exports = {
    populateProperties,
    populateDependenciesUsage,
    populateProviders,
    populateParameters,
}