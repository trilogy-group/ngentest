var path = require('path');
var getImportLib = require('./lib/util.js').getImportLib;
var reIndent = require('./lib/util.js').reIndent;
var windowObjects = require('./lib/window-objects.js');

module.exports = function getDirectiveData(tsParsed, filePath, angularType) {
  let result = initializeData(tsParsed, filePath);
  populateInputsAndOutputs(tsParsed, result);
  populateProviders(tsParsed, result);
  populateDependenciesUsage(tsParsed, result);
  populateDepsRecursive(result);
  //addTestsToAllMethods(tsParsed, angularType, result);

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
  return flatMethods;
}

function populateDepsRecursive(result) {
  for(let method in result.localUsage) {
    const methods = getUsagesRecursive(result, method);
    methods.forEach(localMethod => {
      const deps = result.depsUsage[localMethod];
      for(let dep in deps) {
        if(result.depsUsage[method][dep] === undefined) {
          result.depsUsage[method][dep] = deps[dep];
        } else {
          result.depsUsage[method][dep] = [...result.depsUsage[method][dep], ...deps[dep]];
          result.depsUsage[method][dep] = removeDuplicates(result.depsUsage[method][dep]);
        }
      }
    });
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

function addDepsUsage(result, key, body) {
  result.depsUsage[key] = {};
  result.conditions[key] = {};
  for (let dep in result.depsVariables) {
    let usages = getUsage(dep, body);
    result.conditions[key] = getUsagesInsideIfBranch(dep, body);
    if (usages.length) {
      usages = usages.map(method => {
        conditions = [];
        result.conditions[key]
          .filter(branch => branch.usages.includes(method))
          .forEach(branch => {
            conditions.push(branch.condition);
          })
        return {method, conditions};
      });
      result.depsUsage[key][dep] = usages;
    }
  }
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
  tsParsed.constructor.parameters.forEach(param => {
    // handle @Inject(XXXXXXXXX)
    const importLib = getImportLib(tsParsed.imports, param.type);
    const matches = param.body.match(/@Inject\(([A-Z0-9_]+)\)/);
    if (matches) {
      let className = matches[1];
      let lib = getImportLib(tsParsed.imports, className);
      result.imports[lib] = result.imports[lib] || [];
      result.imports[lib].push(className);
      result.providers[matches[1]] = `{ provide: ${className}, useValue: {} }`;
    }
    else {
      result.useMockito = true;
      result.imports[importLib] = result.imports[importLib] || [];
      result.imports[importLib].push(param.type);
      result.providers[param.type] = `{ provide: ${param.type}, useFactory: () => mock(${param.type}) }`;
    }
  });
}

function populateDepsVariables(tsParsed, result) {
  tsParsed.constructor.parameters.forEach(param => {
    if(!param.body) return;
    let dep = {type: param.type, testBed: param.type};

    const matches = param.body.match(/@Inject\(([A-Z0-9_]+)\)/);
    if (matches) {
      dep.testBed = matches[1];
    }
    result.depsVariables[param.name] = dep;
  });
}

function populateInputsAndOutputs(tsParsed, result) {
  //
  // Iterate properties
  // . if @Input, build input attributes and input properties
  // . if @Outpu, build output attributes and output properties
  //
  for (var key in tsParsed.properties) {
    const prop = tsParsed.properties[key];
    if (prop.body.match(/@Input\(/)) {
      const attrName = (prop.body.match(/@Input\(['"](.*?)['"]\)/) || [])[1];
      result.inputs.attributes.push(`[${attrName || key}]="${key}"`);
      result.inputs.properties.push(`${key}: ${prop.type};`);
    }
    else if (prop.body.match(/@Output\(/)) {
      const attrName = (prop.body.match(/@Output\(['"](.*?)['"]\)/) || [])[1];
      const funcName = `on${key.replace(/^[a-z]/, x => x.toUpperCase())}`;
      result.outputs.attributes.push(`(${attrName || key})="${funcName}($event)"`);
      result.outputs.properties.push(`${funcName}(event): void { /* */ }`);
    }
  }
}

function initializeData(tsParsed, filePath) {
  return {
    className: tsParsed.name,
    imports: {
      [`./${path.basename(filePath)}`.replace(/.ts$/, '')]: [tsParsed.name]
    },
    inputs: { attributes: [], properties: [] },
    outputs: { attributes: [], properties: [] },
    providers: {},
    mocks: {},
    functionTests: {},
    depsVariables: {},
    depsUsage: {},
    localUsage: {},
    conditions: {},
    useMockito: false
  };
}

function removeDuplicates(arr){
  let unique_array = [];
  for(let i = 0;i < arr.length; i++){
      if(unique_array.indexOf(arr[i]) == -1){
          unique_array.push(arr[i]);
      }
  }
  return unique_array;
}