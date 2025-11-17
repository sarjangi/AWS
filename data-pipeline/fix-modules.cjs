// fix-modules.cjs - COMMONJS VERSION
const fs = require('fs');

console.log('🔧 Converting ES modules to CommonJS...');

// List of files to convert
const files = [
    'src/ingestion/data-processor.js',
    'src/database/database-service.js', 
    'src/transformation/canonical-mapper.js',
    'src/api/query-api.js',
    'src/shared/aws-utils.js'
];

files.forEach(file => {
    if (fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf8');
        
        // Convert imports
        content = content.replace(/import\s+([^ ]+)\s+from\s+['"]([^'"]+)['"]/g, 'const $1 = require(\'$2\')');
        content = content.replace(/import\s+\*\s+as\s+([^ ]+)\s+from\s+['"]([^'"]+)['"]/g, 'const $1 = require(\'$2\')');
        content = content.replace(/import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g, 'const {$1} = require(\'$2\')');
        
        // Convert exports  
        content = content.replace(/export\s+default\s+([^;]+);/g, 'module.exports = $1;');
        content = content.replace(/export\s+{\s*([^}]+)\s*};/g, 'module.exports = { $1 };');
        content = content.replace(/export\s+(class|function|const|let|var)\s+([^ {]+)/g, 'exports.$2 = $2');
        
        fs.writeFileSync(file, content);
        console.log(`✅ Converted: ${file}`);
    } else {
        console.log(`❌ File not found: ${file}`);
    }
});

console.log('🎉 All files converted to CommonJS!');
console.log('💡 Now update package.json to "type": "commonjs" and redeploy!');