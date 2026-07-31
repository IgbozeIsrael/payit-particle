const path = require('path');
const fs = require('fs');
const solc = require('solc');

function compileContract(contractName, fileName) {
  const contractPath = path.resolve(__dirname, '../contracts', fileName);
  const source = fs.readFileSync(contractPath, 'utf8');

  const input = {
    language: 'Solidity',
    sources: {
      [fileName]: {
        content: source
      }
    },
    settings: {
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object']
        }
      }
    }
  };

  const findImports = (importPath) => {
    try {
      const normalizedPath = importPath.replace(/^\.\//, ''); // strip ./
      const fullPath = path.resolve(__dirname, '../contracts', normalizedPath);
      if (fs.existsSync(fullPath)) {
        return { contents: fs.readFileSync(fullPath, 'utf8') };
      }
      return { error: 'File not found: ' + importPath };
    } catch (err) {
      return { error: err.message };
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  
  if (output.errors) {
    let hasError = false;
    output.errors.forEach(err => {
      console.log(`[Solc Compiler] ${err.severity.toUpperCase()}: ${err.message}`);
      if (err.severity === 'error') {
        hasError = true;
      }
    });
    if (hasError) {
      throw new Error(`Solidity compilation failed for ${fileName}`);
    }
  }

  const contract = output.contracts[fileName][contractName];
  return {
    abi: contract.abi,
    bytecode: contract.evm.bytecode.object
  };
}

module.exports = {
  compileContract
};
