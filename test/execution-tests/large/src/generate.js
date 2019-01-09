var fs = require('fs');

var seed = 1;
function random(min, max) {
    var x = Math.sin(seed++) * 10000;
	return Math.floor((x - Math.floor(x)) * (max - min)) + min
}

var letters = 'abcdefghijklmnopqrstuvwxyz';

var moduleNames = [];

for (var i = 0; i < 100; i++) {
	var name = '',
		value = i;
    do
    {
        name = letters[value % 26] + name;
        value = Math.floor(value / 26);
    } 
    while (value > 0)

	moduleNames.push(name);
}

var declarationNames = [];

for (var i = 0; i < 20; i++) {
	declarationNames.push(moduleNames[i].toUpperCase());
}

for (var i = 0; i < moduleNames.length; i++) {
	// output file
	// need to generate imports to 10 random modules
	// need to reference 3 of the declaration files (and use them)
	
	var header = '',
		body = '';
	for (var n = 0; n < 3; n++) {
		var referenceModule = declarationNames[random(0, declarationNames.length)];
		header += '
		
		body += referenceModule + '.doSomething()\n';
	}

	for (var n = 0; n < Math.min(10, moduleNames.length-i-1); n++) {
		var importModule = moduleNames[random(i+1, moduleNames.length)];
		header += 'import module_' + importModule+n + ' = require("./' + importModule + '")\n';
		
		body += 'module_' + importModule+n + '.doSomething()\n';
	}
	
	body += 'export function doSomething() { }\n';
	
	fs.writeFileSync(moduleNames[i] + '.ts', header + '\n' + body);
}

for (var i = 0; i < declarationNames.length; i++) {
	var referenceModule = declarationNames[i];
	var body = 'declare module ' + referenceModule + ' {\n';
	body += '  function doSomething();\n';
	body += '}\n';
	
	fs.writeFileSync(referenceModule + '.d.ts', body);
}